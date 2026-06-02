"""
Kafka consumer worker for damage-detection.
Subscribes to media.uploaded, runs YOLOv8 inference, publishes damage.analyzed.
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

from app.models.detector import DamageDetector
from app.models.severity_scorer import compute_overall_severity
from app.preprocessing.image_quality import assess_quality

logger = logging.getLogger(__name__)

MEDIA_BUCKET = os.getenv("S3_MEDIA_BUCKET", "autoclaimx-media-dev")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")


def _make_consumer() -> Consumer:
    return Consumer({
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": "damage-detection-consumer",
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


def _process(msg, detector: DamageDetector, producer: Producer) -> None:
    event = json.loads(msg.value())
    payload = event["payload"]
    tenant_id = event["tenantId"]
    claim_id = payload["claimId"]
    s3_key = payload["s3Key"]
    media_asset_id = payload["mediaAssetId"]
    content_type = payload.get("contentType", "image/jpeg")
    currency = payload.get("currency", "USD")

    if not content_type.startswith("image/"):
        return  # skip video / document uploads

    s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-southeast-1"))
    try:
        obj = s3.get_object(Bucket=MEDIA_BUCKET, Key=s3_key)
        image = Image.open(io.BytesIO(obj["Body"].read())).convert("RGB")
    except Exception as e:
        logger.error("S3 fetch failed for %s: %s", s3_key, e)
        return

    quality = assess_quality(image)
    if not quality.passed:
        logger.warning("Image %s failed quality gate (blur=%.1f)", media_asset_id, quality.blur_score)
        return

    damages = detector.detect(image, media_asset_id)
    severity, tl_prob = compute_overall_severity(damages)
    cost_min = sum(d.estimated_cost_min for d in damages)
    cost_max = sum(d.estimated_cost_max for d in damages)

    _publish(producer, "damage.analyzed", tenant_id, "damage.analyzed", {
        "claimId": claim_id,
        "damageReportId": str(uuid.uuid4()),
        "overallSeverity": severity.value if severity else "LOW",
        "totalLossProbability": round(tl_prob, 4),
        "estimatedCostMin": cost_min,
        "estimatedCostMax": cost_max,
        "currency": currency,
    })
    logger.info("damage.analyzed published for claim %s (severity=%s)", claim_id, severity)


def _run(detector: DamageDetector, stop_event: threading.Event) -> None:
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
            _process(msg, detector, producer)
        except Exception as e:
            logger.error("Unhandled error processing message: %s", e, exc_info=True)
        finally:
            consumer.commit(message=msg)

    consumer.close()
    logger.info("Kafka worker stopped")


def start(detector: DamageDetector) -> threading.Event:
    stop_event = threading.Event()
    threading.Thread(target=_run, args=(detector, stop_event), daemon=True, name="kafka-damage-worker").start()
    logger.info("Kafka damage-detection worker started")
    return stop_event
