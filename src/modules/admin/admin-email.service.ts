import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SETTINGS_KEYS, SystemSettingsService } from '../../common/services/system-settings.service';
import { EmailService } from '../../common/services/email.service';
import type { CreateEmailTemplateDto, UpdateEmailTemplateDto, SendEmailDto } from './dto/email.dto';

type Recipient = {
  email: string;
  userId?: string;
  fullName?: string | null;
  phone?: string | null;
};

type TemplateVariables = Record<string, string>;

type EmailBrandLink = {
  id: string;
  label: string;
  url: string;
};

type EmailBrandSocialLink = EmailBrandLink & {
  icon: string;
};

type EmailBrandingConfig = {
  companyName: string;
  eyebrow: string;
  supportEmail: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  footerNote: string;
  quickLinks: EmailBrandLink[];
  socialLinks: EmailBrandSocialLink[];
};

type EmailButton = {
  label: string;
  url: string;
  variant: 'solid' | 'outline';
};

const DEFAULT_EMAIL_BRANDING: EmailBrandingConfig = {
  companyName: 'TenantSwap',
  eyebrow: 'Professional email shell',
  supportEmail: 'support@tenantswap.africa',
  primaryColor: '#0f766e',
  accentColor: '#dcfce7',
  logoUrl: 'https://tenantswap.africa/icon.png',
  footerNote: 'TenantSwap helps renters move smarter across Lagos, Abuja, and beyond.',
  quickLinks: [
    { id: 'link-1', label: 'Browse Matches', url: 'https://tenantswap.africa/dashboard/matches' },
    { id: 'link-2', label: 'Account Settings', url: 'https://tenantswap.africa/settings' },
  ],
  socialLinks: [
    { id: 'social-1', label: 'Instagram', url: 'https://instagram.com/tenantswap', icon: 'instagram' },
    { id: 'social-2', label: 'X', url: 'https://x.com/tenantswap', icon: 'x' },
    { id: 'social-3', label: 'LinkedIn', url: 'https://linkedin.com/company/tenantswap', icon: 'linkedin' },
  ],
};

@Injectable()
export class AdminEmailService {
  private readonly logger = new Logger(AdminEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
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
    let headlineTemplate = dto.headline ?? dto.subject ?? '(no subject)';
    let bodyHtmlTemplate = dto.bodyHtml ?? '';
    let bodyTextTemplate = dto.bodyText ?? '';
    let templateSlug: string | undefined;

    if (dto.templateSlug) {
      const tpl = await this.prisma.emailTemplate.findUnique({ where: { slug: dto.templateSlug } });
      if (!tpl) throw new NotFoundException(`Template "${dto.templateSlug}" not found`);
      subjectTemplate = dto.subject ?? tpl.subject;
      headlineTemplate = dto.headline ?? dto.subject ?? tpl.subject;
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
    const branding = await this.getEmailBranding();

    for (const r of recipients) {
      try {
        const variables = this.buildTemplateVariables(r, dto.variables);
        const subject = this.renderTemplate(subjectTemplate, variables);
        const headline = this.renderTemplate(headlineTemplate, variables);
        const bodyHtml = this.renderTemplate(bodyHtmlTemplate, variables);
        const bodyText = this.renderTemplate(
          bodyTextTemplate || 'Please view this email in an HTML-compatible client.',
          variables,
        );
        const ctaButtons = this.renderButtons(dto.ctaButtons, variables);
        const wrappedHtml = this.wrapInBrandShell(branding, {
          headline,
          bodyHtml,
          ctaButtons,
        }, variables);

        const result = await this.emailService.sendAdminTemplateEmail({
          email: r.email,
          subject,
          html: wrappedHtml,
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

  private async getEmailBranding(): Promise<EmailBrandingConfig> {
    const raw = await this.systemSettings.get(SETTINGS_KEYS.EMAIL_BRANDING_JSON);

    try {
      const parsed = JSON.parse(raw) as Partial<EmailBrandingConfig> | null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return DEFAULT_EMAIL_BRANDING;
      }

      return {
        companyName: typeof parsed.companyName === 'string' ? parsed.companyName : DEFAULT_EMAIL_BRANDING.companyName,
        eyebrow: typeof parsed.eyebrow === 'string' ? parsed.eyebrow : DEFAULT_EMAIL_BRANDING.eyebrow,
        supportEmail: typeof parsed.supportEmail === 'string' ? parsed.supportEmail : DEFAULT_EMAIL_BRANDING.supportEmail,
        primaryColor: typeof parsed.primaryColor === 'string' ? parsed.primaryColor : DEFAULT_EMAIL_BRANDING.primaryColor,
        accentColor: typeof parsed.accentColor === 'string' ? parsed.accentColor : DEFAULT_EMAIL_BRANDING.accentColor,
        logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : DEFAULT_EMAIL_BRANDING.logoUrl,
        footerNote: typeof parsed.footerNote === 'string' ? parsed.footerNote : DEFAULT_EMAIL_BRANDING.footerNote,
        quickLinks: Array.isArray(parsed.quickLinks) ? parsed.quickLinks as EmailBrandLink[] : DEFAULT_EMAIL_BRANDING.quickLinks,
        socialLinks: Array.isArray(parsed.socialLinks) ? parsed.socialLinks as EmailBrandSocialLink[] : DEFAULT_EMAIL_BRANDING.socialLinks,
      };
    } catch {
      return DEFAULT_EMAIL_BRANDING;
    }
  }

  private renderButtons(
    input: Array<{ label?: string; url?: string; variant?: string }> | undefined,
    variables: TemplateVariables,
  ): EmailButton[] {
    if (!Array.isArray(input)) return [];

    return input
      .map((button) => ({
        label: this.renderTemplate(button.label ?? '', variables),
        url: this.renderTemplate(button.url ?? '', variables),
        variant: button.variant === 'outline' ? 'outline' : 'solid',
      }))
      .filter((button) => button.label.trim() && button.url.trim());
  }

  private wrapInBrandShell(
    branding: EmailBrandingConfig,
    content: { headline: string; bodyHtml: string; ctaButtons: EmailButton[] },
    variables: TemplateVariables,
  ): string {
    const render = (value: string) => this.renderTemplate(value, variables);
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const logo = branding.logoUrl
      ? `<img src="${escapeHtml(render(branding.logoUrl))}" alt="${escapeHtml(render(branding.companyName))}" style="width:52px;height:52px;border-radius:16px;display:block;object-fit:cover" />`
      : `<div style="width:52px;height:52px;border-radius:16px;background:${escapeHtml(render(branding.primaryColor))};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px">${escapeHtml(render(branding.companyName).slice(0, 1) || 'T')}</div>`;

    const ctas = content.ctaButtons
      .map((button) => {
        const isSolid = button.variant === 'solid';
        return `<a href="${escapeHtml(button.url)}" style="display:inline-block;background:${isSolid ? escapeHtml(render(branding.primaryColor)) : 'transparent'};color:${isSolid ? '#ffffff' : escapeHtml(render(branding.primaryColor))};text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:700;border:1.5px solid ${escapeHtml(render(branding.primaryColor))}">${escapeHtml(button.label)}</a>`;
      })
      .join('');

    const quickLinks = branding.quickLinks
      .filter((item) => item.label?.trim() && item.url?.trim())
      .map(
        (item) =>
          `<a href="${escapeHtml(render(item.url))}" style="color:${escapeHtml(render(branding.primaryColor))};text-decoration:none;font-weight:700">${escapeHtml(render(item.label))}</a>`,
      )
      .join('<span style="color:#cbd5e1"> · </span>');

    const socialLinks = branding.socialLinks
      .filter((item) => item.label?.trim() && item.url?.trim())
      .map(
        (item) =>
          `<a href="${escapeHtml(render(item.url))}" style="display:inline-flex;align-items:center;gap:8px;color:${escapeHtml(render(branding.primaryColor))};text-decoration:none;font-weight:700;margin-right:14px">${this.socialIconSvg(item.icon, render(branding.primaryColor))}<span>${escapeHtml(render(item.label))}</span></a>`,
      )
      .join('');

    return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f7f2;padding:32px 16px;font-family:Georgia, 'Times New Roman', serif;color:#172033">
    <div style="max-width:720px;margin:0 auto">
      <div style="background:linear-gradient(135deg, ${escapeHtml(render(branding.primaryColor))}, #111827);border-radius:30px 30px 0 0;padding:32px 30px 24px;color:#fff">
        <div style="display:flex;align-items:center;gap:16px">${logo}<div><div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.78">${escapeHtml(render(branding.eyebrow))}</div><div style="font-size:28px;font-weight:700;line-height:1.2;margin-top:6px">${escapeHtml(render(branding.companyName))}</div></div></div>
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 30px 30px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.08)">
        <div style="padding:36px 30px 18px">
          <div style="display:inline-block;background:${escapeHtml(render(branding.accentColor))};color:${escapeHtml(render(branding.primaryColor))};padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">TenantSwap update</div>
          <h1 style="font-size:36px;line-height:1.08;margin:18px 0 14px;color:#0f172a">${escapeHtml(content.headline)}</h1>
          <div style="font-size:16px;line-height:1.8;color:#334155">${content.bodyHtml}</div>
          <div style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px">${ctas}</div>
        </div>
        <div style="padding:22px 30px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <div style="font-size:13px;line-height:1.8;color:#475569">${escapeHtml(render(branding.footerNote))}</div>
          <div style="margin-top:14px;font-size:13px;line-height:1.8;color:#64748b">Need help? <a href="mailto:${escapeHtml(render(branding.supportEmail))}" style="color:${escapeHtml(render(branding.primaryColor))};text-decoration:none;font-weight:700">${escapeHtml(render(branding.supportEmail))}</a></div>
          <div style="margin-top:14px;font-size:13px;line-height:1.8;color:#64748b">${quickLinks || '<span>No footer links added yet</span>'}</div>
          <div style="margin-top:18px;font-size:13px;line-height:1.8;color:#64748b">${socialLinks || '<span>No social links added yet</span>'}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
  }

  private socialIconSvg(icon: string, color: string): string {
    const stroke = color
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const icons: Record<string, string> = {
      instagram: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="${stroke}" stroke-width="1.8"/><circle cx="12" cy="12" r="4" stroke="${stroke}" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="${stroke}"/></svg>`,
      x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`,
      linkedin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" stroke="${stroke}" stroke-width="1.8"/><path d="M8 10V16" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="7.5" r="1" fill="${stroke}"/><path d="M12 16V10M12 12.2C12 11 12.9 10 14.2 10C15.5 10 16.3 10.9 16.3 12.4V16" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      facebook: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13.5 20V12.5H16L16.5 9.5H13.5V7.8C13.5 6.9 13.9 6.2 15.1 6.2H16.6V3.5C16.3 3.5 15.5 3.4 14.6 3.4C11.9 3.4 10.3 5 10.3 7.9V9.5H8V12.5H10.3V20" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      whatsapp: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L7.5 14.5C6.6 13.4 6 11.9 6 10.3C6 6.8 8.9 4 12.5 4C16.1 4 19 6.8 19 10.3C19 13.8 16.1 16.7 12.5 16.7C11 16.7 9.6 16.2 8.4 15.3L7 17Z" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/><path d="M10.1 8.9C10.3 8.5 10.5 8.5 10.7 8.5H11.2C11.4 8.5 11.6 8.6 11.7 8.9L12.3 10.2C12.4 10.4 12.4 10.6 12.2 10.8L11.7 11.3C12 12 12.5 12.6 13.2 13L13.8 12.5C14 12.4 14.2 12.4 14.4 12.5L15.8 13.1C16 13.2 16.1 13.4 16.1 13.6V14.1C16.1 14.4 16 14.6 15.7 14.7C15.4 14.9 14.9 15 14.4 14.9C12.2 14.5 10.1 12.5 9.8 10.2C9.7 9.8 9.8 9.3 10.1 8.9Z" fill="${stroke}"/></svg>`,
      youtube: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="11" rx="4" stroke="${stroke}" stroke-width="1.8"/><path d="M10 9.5L15 12L10 14.5V9.5Z" fill="${stroke}"/></svg>`,
      globe: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="${stroke}" stroke-width="1.8"/><path d="M4.5 12H19.5M12 4C14.1 6.1 15.3 8.9 15.3 12C15.3 15.1 14.1 17.9 12 20C9.9 17.9 8.7 15.1 8.7 12C8.7 8.9 9.9 6.1 12 4Z" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      mail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="${stroke}" stroke-width="1.8"/><path d="M5.5 8L12 12.5L18.5 8" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    };

    return icons[icon] ?? icons.globe;
  }

  // ─── Seed ─────────────────────────────────────────────────────────────────────

  async seedDefaultTemplates() {
    const templates = [
      {
        name: 'Verification Approved',
        slug: 'verification_approved',
        subject: 'Your document has been verified ✅',
        description: 'Sent when an admin approves a user\'s verification document.',
        bodyHtml: `<p>Your supporting document has been reviewed and <strong>approved</strong>.</p>
<p>Your listing is now active and visible to potential matches on TenantSwap.</p>
<p>You can now continue in your dashboard and respond to new opportunities.</p>`,
        bodyText: 'Hi {{fullName}}, your document has been approved. Your listing is now active.',
        isSystem: true,
      },
      {
        name: 'Verification Rejected',
        slug: 'verification_rejected',
        subject: 'Action required: document verification failed',
        description: 'Sent when an admin rejects a user\'s verification document.',
        bodyHtml: `<p>Unfortunately, we could not verify your document.</p>
<p>Reason: <strong>{{reason}}</strong></p>
<p>Please upload a clearer or updated document to continue.</p>`,
        bodyText: 'Hi {{fullName}}, your document was not accepted. Reason: {{reason}}. Please upload a new document.',
        isSystem: true,
      },
      {
        name: 'Welcome to TenantSwap',
        slug: 'welcome',
        subject: 'Welcome to TenantSwap 🏠',
        description: 'Welcome email for new users.',
        bodyHtml: `<p>You've just joined TenantSwap — Nigeria's first apartment swap community.</p>
<p>Here's how to get started:</p>
<ol>
  <li>Complete your profile</li>
  <li>Create your listing</li>
  <li>Browse matches in your dashboard</li>
</ol>`,
        bodyText: 'Welcome to TenantSwap, {{fullName}}! Get started at {{dashboardUrl}}',
        isSystem: false,
      },
    ];

    for (const tpl of templates) {
      await this.prisma.emailTemplate.upsert({
        where: { slug: tpl.slug },
        update: {
          name: tpl.name,
          subject: tpl.subject,
          description: tpl.description,
          bodyHtml: tpl.bodyHtml,
          bodyText: tpl.bodyText,
          isSystem: tpl.isSystem,
        },
        create: tpl,
      });
    }

    return { seeded: templates.length };
  }
}
