import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../../common/services/email.service';
import type { CreateEmailTemplateDto, UpdateEmailTemplateDto, SendEmailDto } from './dto/email.dto';

type Recipient = {
  email: string;
  userId?: string;
  fullName?: string | null;
  phone?: string | null;
};

type TemplateVariables = Record<string, string>;

@Injectable()
export class AdminEmailService {
  private readonly logger = new Logger(AdminEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Logs ────────────────────────────────────────────────────────────────────

  async listLogs(opts: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    search?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.type) where.type = opts.type;
    if (opts.search) {
      where.OR = [
        { recipientEmail: { contains: opts.search, mode: 'insensitive' } },
        { subject: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { items, meta: { total, page, pages: Math.ceil(total / limit) } };
  }

  // ─── Templates ───────────────────────────────────────────────────────────────

  async listTemplates() {
    return this.prisma.emailTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getTemplate(id: string) {
    const t = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async createTemplate(dto: CreateEmailTemplateDto) {
    const existing = await this.prisma.emailTemplate.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException(`Template with slug "${dto.slug}" already exists`);

    return this.prisma.emailTemplate.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText ?? '',
        description: dto.description ?? '',
        isSystem: false,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateEmailTemplateDto) {
    await this.getTemplate(id);
    return this.prisma.emailTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(id: string) {
    const t = await this.getTemplate(id);
    if (t.isSystem) throw new BadRequestException('Cannot delete a system template');
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  async previewTemplate(id: string) {
    const t = await this.getTemplate(id);
    return { subject: t.subject, bodyHtml: t.bodyHtml, bodyText: t.bodyText };
  }

  // ─── Send ─────────────────────────────────────────────────────────────────────

  async sendEmail(dto: SendEmailDto): Promise<{ sent: number; failed: number }> {
    // Resolve template if slug provided
    let subjectTemplate = dto.subject ?? '(no subject)';
    let bodyHtmlTemplate = dto.bodyHtml ?? '';
    let bodyTextTemplate = dto.bodyText ?? '';
    let templateSlug: string | undefined;

    if (dto.templateSlug) {
      const tpl = await this.prisma.emailTemplate.findUnique({ where: { slug: dto.templateSlug } });
      if (!tpl) throw new NotFoundException(`Template "${dto.templateSlug}" not found`);
      subjectTemplate = dto.subject ?? tpl.subject;
      bodyHtmlTemplate = tpl.bodyHtml;
      bodyTextTemplate = tpl.bodyText;
      templateSlug = tpl.slug;
    }

    if (!bodyHtmlTemplate) throw new BadRequestException('bodyHtml or templateSlug is required');

    // Resolve recipients
    const recipients = await this.resolveRecipients(dto);
    if (recipients.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;

    for (const r of recipients) {
      try {
        const variables = this.buildTemplateVariables(r, dto.variables);
        const subject = this.renderTemplate(subjectTemplate, variables);
        const bodyHtml = this.renderTemplate(bodyHtmlTemplate, variables);
        const bodyText = this.renderTemplate(
          bodyTextTemplate || 'Please view this email in an HTML-compatible client.',
          variables,
        );

        const result = await this.emailService.sendAdminTemplateEmail({
          email: r.email,
          subject,
          html: bodyHtml,
          text: bodyText,
          recipientUserId: r.userId,
          templateSlug,
        });

        if (result.delivered) sent++; else failed++;
      } catch (err) {
        this.logger.error(`Failed to send to ${r.email}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }

    return { sent, failed };
  }

  private async resolveRecipients(dto: SendEmailDto): Promise<Recipient[]> {
    if (dto.target === 'user') {
      if (!dto.userId) throw new BadRequestException('userId is required for target=user');
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, email: true, fullName: true, phone: true },
      });
      if (!user?.email) throw new NotFoundException('User not found or has no email');
      return [{ email: user.email, userId: user.id, fullName: user.fullName, phone: user.phone }];
    }

    if (dto.target === 'users') {
      const userIds = Array.from(new Set((dto.userIds ?? []).filter(Boolean)));
      if (userIds.length === 0) {
        throw new BadRequestException('userIds is required for target=users');
      }

      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, email: { not: null } },
        select: { id: true, email: true, fullName: true, phone: true },
      });

      return users.map((u) => ({
        email: u.email!,
        userId: u.id,
        fullName: u.fullName,
        phone: u.phone,
      }));
    }

    const where: any = { email: { not: null } };

    if (dto.target === 'caretakers') {
      where.OR = [
        { caretakerName: { not: null } },
        { caretakerPhone: { not: null } },
      ];
      const rows = await this.prisma.swapListing.findMany({
        where,
        select: { userId: true, user: { select: { email: true, fullName: true, phone: true } } },
        distinct: ['userId'],
      });
      return rows
        .filter((r) => !!r.user.email)
        .map((r) => ({ email: r.user.email!, userId: r.userId, fullName: r.user.fullName, phone: r.user.phone }));
    }

    if (dto.target === 'subscribed') {
      where.subscriptionStatus = 'ACTIVE';
    } else if (dto.target === 'unsubscribed') {
      where.subscriptionStatus = { not: 'ACTIVE' };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, email: true, fullName: true, phone: true },
      take: 1000,
    });

    return users
      .filter((u) => !!u.email)
      .map((u) => ({ email: u.email!, userId: u.id, fullName: u.fullName, phone: u.phone }));
  }

  private buildTemplateVariables(
    recipient: Recipient,
    customVariables?: Record<string, string>,
  ): TemplateVariables {
    const frontendUrl = (process.env.FRONTEND_URL ?? 'https://tenantswap.africa').replace(/\/$/, '');
    const fullName = recipient.fullName?.trim() || 'there';
    const firstName = fullName.split(/\s+/)[0] || fullName;

    const baseVariables: TemplateVariables = {
      fullName,
      firstName,
      email: recipient.email,
      phone: recipient.phone?.trim() || '',
      dashboardUrl: `${frontendUrl}/dashboard`,
    };

    return {
      ...baseVariables,
      ...this.normalizeVariables(customVariables),
    };
  }

  private normalizeVariables(input?: Record<string, string>): TemplateVariables {
    if (!input) return {};

    return Object.fromEntries(
      Object.entries(input)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, value.trim()]),
    );
  }

  private renderTemplate(template: string, variables: TemplateVariables): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (token, key: string) => {
      return key in variables ? variables[key] : token;
    });
  }

  // ─── Seed ─────────────────────────────────────────────────────────────────────

  async seedDefaultTemplates() {
    const templates = [
      {
        name: 'Verification Approved',
        slug: 'verification_approved',
        subject: 'Your document has been verified ✅',
        description: 'Sent when an admin approves a user\'s verification document.',
        bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="color:#0b9f6a">Great news, {{fullName}}!</h2>
  <p>Your supporting document has been reviewed and <strong>approved</strong>.</p>
  <p>Your listing is now active and visible to potential matches on TenantSwap.</p>
  <p style="margin-top:24px">
    <a href="{{dashboardUrl}}" style="background:#0b9f6a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Go to Dashboard</a>
  </p>
  <p style="font-size:12px;color:#94a3b8;margin-top:32px">TenantSwap · support@tenantswap.com</p>
</div>`,
        bodyText: 'Hi {{fullName}}, your document has been approved. Your listing is now active.',
        isSystem: true,
      },
      {
        name: 'Verification Rejected',
        slug: 'verification_rejected',
        subject: 'Action required: document verification failed',
        description: 'Sent when an admin rejects a user\'s verification document.',
        bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="color:#dc2626">Document Not Accepted</h2>
  <p>Hi {{fullName}},</p>
  <p>Unfortunately, we could not verify your document. Reason: <strong>{{reason}}</strong></p>
  <p>Please upload a clearer or updated document to continue.</p>
  <p style="margin-top:24px">
    <a href="{{dashboardUrl}}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Upload New Document</a>
  </p>
  <p style="font-size:12px;color:#94a3b8;margin-top:32px">TenantSwap · support@tenantswap.com</p>
</div>`,
        bodyText: 'Hi {{fullName}}, your document was not accepted. Reason: {{reason}}. Please upload a new document.',
        isSystem: true,
      },
      {
        name: 'Welcome to TenantSwap',
        slug: 'welcome',
        subject: 'Welcome to TenantSwap 🏠',
        description: 'Welcome email for new users.',
        bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="color:#0b9f6a">Welcome, {{fullName}}!</h2>
  <p>You've just joined TenantSwap — Nigeria's first apartment swap community.</p>
  <p>Here's how to get started:</p>
  <ol>
    <li>Complete your profile</li>
    <li>Create your listing</li>
    <li>Browse matches in your dashboard</li>
  </ol>
  <p style="margin-top:24px">
    <a href="{{dashboardUrl}}" style="background:#0b9f6a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Get Started</a>
  </p>
  <p style="font-size:12px;color:#94a3b8;margin-top:32px">TenantSwap · support@tenantswap.com</p>
</div>`,
        bodyText: 'Welcome to TenantSwap, {{fullName}}! Get started at {{dashboardUrl}}',
        isSystem: false,
      },
    ];

    for (const tpl of templates) {
      await this.prisma.emailTemplate.upsert({
        where: { slug: tpl.slug },
        update: {},
        create: tpl,
      });
    }

    return { seeded: templates.length };
  }
}
