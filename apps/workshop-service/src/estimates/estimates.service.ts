import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma, withTenant } from '@autoclaimx/db-client';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EstimatesService {
  private readonly logger = new Logger(EstimatesService.name);
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
  private readonly bucket = process.env.S3_DOCS_BUCKET ?? 'autoclaimx-docs-dev';

  async getUploadUrl(tenantId: string, workshopId: string, claimId: string, fileName: string) {
    const estimateId = uuidv4();
    const ext = fileName.split('.').pop() ?? 'pdf';
    const s3Key = `${tenantId}/workshops/${workshopId}/estimates/${estimateId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: 'application/pdf',
      Metadata: { 'workshop-id': workshopId, 'claim-id': claimId, 'estimate-id': estimateId },
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 900 });
    return { uploadUrl, estimateId, s3Key, expiresIn: 900 };
  }

  async confirmAndParse(tenantId: string, workshopId: string, claimId: string, s3Key: string) {
    const ocrUrl = process.env.OCR_EXTRACTION_URL ?? 'http://localhost:8004';

    let lineItems: unknown[] = [];
    let total = 0;
    let ocrConfidence = 0;

    try {
      const { data } = await axios.post(`${ocrUrl}/parse/s3`, { s3_key: s3Key });
      lineItems = data.line_items;
      total = data.total;
      ocrConfidence = data.ocr_confidence;
    } catch (err) {
      this.logger.error(`OCR extraction failed for ${s3Key}: ${err}`);
    }

    return withTenant(tenantId, (tx) =>
      tx.workshopEstimate.create({
        data: {
          id: uuidv4(),
          workshopId,
          claimId,
          rawFileUrl: s3Key,
          lineItems: lineItems as never,
          total,
          ocrConfidence,
          currency: 'USD',
        },
      }),
    );
  }
}
