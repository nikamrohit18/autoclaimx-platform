import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withTenant, MediaType } from '@autoclaimx/db-client';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { MediaUploadedPayload } from '@autoclaimx/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
  private readonly bucket = process.env.S3_MEDIA_BUCKET ?? 'autoclaimx-media-dev';

  constructor(private readonly kafka: KafkaService) {}

  async listMedia(tenantId: string, claimId: string) {
    const assets = await withTenant(tenantId, (tx) =>
      tx.claimMedia.findMany({
        where: { claimId, tenantId },
        orderBy: { uploadedAt: 'asc' },
      }),
    );

    return Promise.all(
      assets.map(async (a) => {
        let viewUrl: string | null = null;
        try {
          const cmd = new GetObjectCommand({ Bucket: a.s3Bucket, Key: a.s3Key });
          viewUrl = await getSignedUrl(this.s3, cmd, { expiresIn: 3600 });
        } catch {
          // AWS creds not available in dev — viewUrl stays null
        }
        return {
          id: a.id,
          mimeType: a.mimeType,
          mediaType: a.mediaType,
          processingStatus: a.processingStatus,
          sizeBytes: a.sizeBytes,
          uploadedAt: a.uploadedAt,
          viewUrl,
        };
      }),
    );
  }

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

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 900 });

    await withTenant(tenantId, (tx) =>
      tx.claimMedia.create({
        data: {
          id: mediaAssetId,
          tenantId,
          claimId,
          s3Key,
          s3Bucket: this.bucket,
          mimeType: opts.contentType,
          mediaType: this.resolveMediaType(opts.contentType),
          sizeBytes: 0,
        },
      }),
    );

    return { uploadUrl, mediaAssetId, s3Key, expiresIn: 900 };
  }

  async confirmUpload(
    tenantId: string,
    claimId: string,
    mediaAssetId: string,
    s3Key: string,
    contentType: string,
    sizeBytes: number,
  ) {
    const existing = await withTenant(tenantId, (tx) =>
      tx.claimMedia.findFirst({ where: { id: mediaAssetId, claimId, tenantId } }),
    );
    if (!existing) throw new NotFoundException(`Media asset ${mediaAssetId} not found`);

    await withTenant(tenantId, (tx) =>
      tx.claimMedia.update({
        where: { id: mediaAssetId },
        data: { processingStatus: 'PROCESSING', sizeBytes, mimeType: contentType },
      }),
    );

    // Only advance to MEDIA_PROCESSING from FNOL_RECEIVED
    await withTenant(tenantId, (tx) =>
      tx.claim.updateMany({
        where: { id: claimId, tenantId, status: 'FNOL_RECEIVED' },
        data: { status: 'MEDIA_PROCESSING' },
      }),
    );

    const claim = await withTenant(tenantId, (tx) =>
      tx.claim.findUnique({ where: { id: claimId }, select: { currency: true } }),
    );
    const payload: MediaUploadedPayload = { claimId, mediaAssetId, s3Key, contentType, sizeBytes, currency: claim?.currency ?? 'USD' };
    await this.kafka.publish(KAFKA_TOPICS.MEDIA_UPLOADED, payload, tenantId);
    this.logger.log(`Media ${mediaAssetId} confirmed for claim ${claimId}`);

    return { mediaAssetId, claimId, processingStatus: 'PROCESSING' };
  }

  private resolveMediaType(contentType: string): MediaType {
    if (contentType.startsWith('video/')) return 'VIDEO';
    if (contentType === 'application/pdf') return 'DOCUMENT';
    return 'IMAGE';
  }
}
