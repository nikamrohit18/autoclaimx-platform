import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { MediaUploadedPayload } from '@autoclaimx/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
  private readonly bucket = process.env.S3_MEDIA_BUCKET ?? 'autoclaimx-media-dev';

  constructor(private readonly kafka: KafkaService) {}

  async generatePresignedUploadUrl(
    tenantId: string,
    claimId: string,
    opts: { contentType: string; angleTag: string; fileName: string },
  ) {
    const mediaAssetId = uuidv4();
    const ext = opts.fileName.split('.').pop() ?? 'jpg';
    const s3Key = `${tenantId}/claims/${claimId}/originals/${mediaAssetId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: opts.contentType,
      Metadata: {
        'claim-id': claimId,
        'tenant-id': tenantId,
        'media-asset-id': mediaAssetId,
        'angle-tag': opts.angleTag,
      },
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 900 }); // 15 min

    // Publish upload event so damage-detection can pick it up when the client
    // confirms the upload is complete via a separate POST /confirm endpoint.
    return { uploadUrl, mediaAssetId, s3Key, expiresIn: 900 };
  }

  async confirmUpload(tenantId: string, claimId: string, mediaAssetId: string, s3Key: string, contentType: string, sizeBytes: number) {
    const payload: MediaUploadedPayload = {
      claimId,
      mediaAssetId,
      s3Key,
      contentType,
      sizeBytes,
    };

    await this.kafka.publish(KAFKA_TOPICS.MEDIA_UPLOADED, payload, tenantId);
    this.logger.log(`Media ${mediaAssetId} confirmed for claim ${claimId}`);
  }
}
