"""
Kafka consumer worker for fraud-ml.
Subscribes to media.uploaded, runs ELA image forgery detection,
publishes fraud.score.updated with imageScore so claims-service can merge
it with the behavioral score already in the FraudScore DB record.
"""
from __future__ import annotations

import io
import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone

import boto3
from confluent_kafka import Consumer, Producer, KafkaError
from PIL import Image

from app.detectors.image_forgery import score_image_fraud

logger = logging.getLogger(__name__)

MEDIA_BUCKET = os.getenv("S3_MEDIA_BUCKET", "autoclaimx-media-dev")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")

# Raw imageScore >= this threshold triggers autoHold regardless of behavioral score.
AUTO_HOLD_IMAGE_THRESHOLD = 0.90


def _make_consumer() -> Consumer:
    return Consumer({
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": "fraud-ml-consumer",
        "auto.offset.reset": "latest",
        "enable.auto.commit": False,
    })


def _make_producer() -> Producer:
    return Producer({"bootstrap.servers": KAFKA_BROKERS})


def _publish(producer: Producer, topic: str, tenant_id: str, event_type: str, payload: dict) -> None:
    event = {
        "eventId": str(uuid.uuid4()),
        "eventType": event_type,
        "tenantId": tenant_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }
    producer.produce(topic, json.dumps(event).encode(), key=tenant_id.encode())
    producer.flush()


def _process(msg, producer: Producer) -> None:
    event = json.loads(msg.value())
    payload = event["payload"]
    tenant_id = event["tenantId"]
    claim_id = payload["claimId"]
    s3_key = payload["s3Key"]
    content_type = payload.get("contentType", "image/jpeg")

    if not content_type.startswith("image/"):
        return  # skip non-image media

    s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-southeast-1"))
    try:
        obj = s3.get_object(Bucket=MEDIA_BUCKET, Key=s3_key)
        image = Image.open(io.BytesIO(obj["Body"].read())).convert("RGB")
    except Exception as e:
        logger.error("S3 fetch failed for %s: %s", s3_key, e)
        return

    image_score, flags = score_image_fraud(image)
    # image contributes 65% of total; behavioral (35%) is already in the DB
    total_score = round(image_score * 0.65, 4)
    risk_level = "HIGH" if total_score >= 0.6 else "MEDIUM" if total_score >= 0.3 else "LOW"

    _publish(producer, "fraud.score.updated", tenant_id, "fraud.score.updated", {
        "claimId": claim_id,
        "fraudScoreId": str(uuid.uuid4()),
        "totalScore": total_score,
        "riskLevel": risk_level,
        "autoHold": image_score >= AUTO_HOLD_IMAGE_THRESHOLD,
        "imageScore": round(image_score, 4),
        "flags": flags,
    })
    logger.info(
        "fraud.score.updated published for claim %s (imageScore=%.2f, total=%.2f)",
        claim_id, image_score, total_score,
    )


def _run(stop_event: threading.Event) -> None:
    consumer = _make_consumer()
    producer = _make_producer()
    consumer.subscribe(["media.uploaded"])
    logger.info("Kafka worker subscribed to media.uploaded")

    while not stop_event.is_set():
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            if msg.error().code() != KafkaError._PARTITION_EOF:
                logger.error("Kafka consumer error: %s", msg.error())
            continue
        try:
            _process(msg, producer)
        except Exception as e:
            logger.error("Unhandled error processing message: %s", e, exc_info=True)
        finally:
            consumer.commit(message=msg)

    consumer.close()
    logger.info("Kafka worker stopped")


def start() -> threading.Event:
    stop_event = threading.Event()
    threading.Thread(target=_run, args=(stop_event,), daemon=True, name="kafka-fraud-worker").start()
    logger.info("Kafka fraud-ml worker started")
    return stop_event
