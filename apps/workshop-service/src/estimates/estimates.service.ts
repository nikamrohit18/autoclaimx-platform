import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withTenant } from '@autoclaimx/db-client';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

interface OcrResponse {
  line_items: unknown[];
  subtotal: number;
  labor_total: number;
  parts_total: number;
  total: number;
  ocr_confidence: number;
}

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

  async findByWorkshop(tenantId: string, workshopId: string) {
    return withTenant(tenantId, (tx) =>
      tx.workshopEstimate.findMany({
        where: { workshopId, tenantId },
        select: { id: true, claimId: true, total: true, laborTotal: true, partsTotal: true, currency: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async confirmAndParse(tenantId: string, workshopId: string, claimId: string, s3Key: string) {
    const ocrUrl = process.env.OCR_EXTRACTION_URL ?? 'http://localhost:8004';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ocr: OcrResponse = { line_items: [], subtotal: 0, labor_total: 0, parts_total: 0, total: 0, ocr_confidence: 0 };

    try {
      const { data } = await axios.post<OcrResponse>(`${ocrUrl}/parse/s3`, { s3_key: s3Key });
      ocr = data;
      this.logger.log(`OCR parsed ${ocr.line_items.length} line items for ${s3Key} (confidence=${ocr.ocr_confidence})`);
    } catch (err) {
      this.logger.error(`OCR extraction failed for ${s3Key}: ${err}`);
    }

    return withTenant(tenantId, (tx) =>
      tx.workshopEstimate.create({
        data: {
          id: uuidv4(),
          tenantId,
          workshopId,
          claimId,
          rawFileUrl: s3Key,
          lineItems: ocr.line_items as object[],
          subtotal: ocr.subtotal,
          laborTotal: ocr.labor_total,
          partsTotal: ocr.parts_total,
          total: ocr.total,
          ocrConfidence: ocr.ocr_confidence,
          currency: 'USD',
        },
      }),
    );
  }
}
