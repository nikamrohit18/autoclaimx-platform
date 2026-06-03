import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface ClaimStatusEmailData {
  claimNumber: string;
  policyHolderName: string;
  status: string;
  vehicleMake: string;
  vehicleModel: string;
  adjusterEmail?: string;
  policyHolderEmail?: string;
}

export interface NegotiationOutcomeEmailData {
  claimNumber: string;
  outcome: 'AGREED' | 'ESCALATED';
  finalAmount?: number;
  currency: string;
  adjusterEmail?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;

  constructor() {
    const smtpHost = process.env.SMTP_HOST;
    this.fromAddress = process.env.SMTP_FROM ?? 'noreply@autoclaimx.com';

    if (!smtpHost) {
      this.logger.warn('SMTP_HOST not configured — email notifications disabled');
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
        : undefined,
    });

    this.logger.log(`Email notifications enabled via ${smtpHost}`);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({ from: this.fromAddress, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Email failed to ${to}: ${err}`);
    }
  }

  async notifyClaimCreated(data: {
    claimNumber: string;
    policyHolderName: string;
    vehicleMake: string;
    vehicleModel: string;
    adjusterEmail?: string;
  }): Promise<void> {
    if (!data.adjusterEmail) return;
    await this.send(
      data.adjusterEmail,
      `New Claim: ${data.claimNumber}`,
      `
      <h2>New Claim Filed — ${data.claimNumber}</h2>
      <p>A new claim has been submitted and requires your attention.</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Policy Holder</td><td style="padding:4px 0"><strong>${data.policyHolderName}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Vehicle</td><td style="padding:4px 0">${data.vehicleMake} ${data.vehicleModel}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Claim #</td><td style="padding:4px 0"><code>${data.claimNumber}</code></td></tr>
      </table>
      <p style="margin-top:16px;color:#6b7280;font-size:13px">Log in to the AutoClaimX portal to review this claim.</p>
      `,
    );
  }

  async notifyStatusChanged(data: ClaimStatusEmailData): Promise<void> {
    const statusLabel = data.status.replace(/_/g, ' ');

    if (data.adjusterEmail) {
      await this.send(
        data.adjusterEmail,
        `Claim ${data.claimNumber} → ${statusLabel}`,
        `
        <h2>Claim Status Update</h2>
        <p>Claim <strong>${data.claimNumber}</strong> has moved to <strong>${statusLabel}</strong>.</p>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Policy Holder</td><td>${data.policyHolderName}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Vehicle</td><td>${data.vehicleMake} ${data.vehicleModel}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">New Status</td><td><strong>${statusLabel}</strong></td></tr>
        </table>
        `,
      );
    }

    if (data.policyHolderEmail && ['SETTLED', 'DISPUTED', 'CLOSED'].includes(data.status)) {
      const messages: Record<string, string> = {
        SETTLED:  'Your claim has been settled. Our team will be in contact shortly.',
        DISPUTED: 'Your claim has been flagged for additional review. An adjuster will contact you.',
        CLOSED:   'Your claim has been closed.',
      };
      await this.send(
        data.policyHolderEmail,
        `Your Claim ${data.claimNumber} — ${statusLabel}`,
        `
        <h2>Claim Update — ${data.claimNumber}</h2>
        <p>${messages[data.status] ?? `Your claim is now ${statusLabel}.`}</p>
        <p style="color:#6b7280;font-size:13px">Claim reference: <code>${data.claimNumber}</code></p>
        `,
      );
    }
  }

  async notifyNegotiationOutcome(data: NegotiationOutcomeEmailData): Promise<void> {
    if (!data.adjusterEmail) return;
    const isAgreed = data.outcome === 'AGREED';
    await this.send(
      data.adjusterEmail,
      `Negotiation ${isAgreed ? 'Settled' : 'Escalated'} — ${data.claimNumber}`,
      `
      <h2>AI Negotiation ${isAgreed ? 'Complete' : 'Requires Human Review'} — ${data.claimNumber}</h2>
      ${isAgreed
        ? `<p>The AI negotiation reached an agreement.</p>
           <p>Settlement amount: <strong>${data.currency} ${Number(data.finalAmount ?? 0).toLocaleString()}</strong></p>`
        : `<p>The AI was unable to reach an agreement within the maximum rounds.</p>
           <p>This case requires manual adjuster intervention. Please log in to review the negotiation history.</p>`
      }
      `,
    );
  }
}
