import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SystemSettingsService, SETTINGS_KEYS } from './system-settings.service';

export interface EmailBrandLink {
  id: string;
  label: string;
  url: string;
}

export interface EmailBrandSocialLink {
  id: string;
  label: string;
  url: string;
  icon: string;
}

export interface EmailBrandingConfig {
  companyName: string;
  eyebrow: string;
  supportEmail: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  footerNote: string;
  quickLinks: EmailBrandLink[];
  socialLinks: EmailBrandSocialLink[];
}

export interface EmailShellContent {
  headline: string;
  bodyHtml: string;
  ctaButtons?: Array<{ label: string; url: string; variant?: 'solid' | 'outline' }>;
}

export const DEFAULT_EMAIL_BRANDING: EmailBrandingConfig = {
  companyName: 'TenantSwap',
  eyebrow: 'Your apartment swap platform',
  supportEmail: 'support@tenantswap.africa',
  primaryColor: '#0f766e',
  accentColor: '#dcfce7',
  logoUrl: '',
  footerNote: 'TenantSwap helps renters move smarter across Lagos, Abuja, and beyond.',
  quickLinks: [
    { id: 'link-1', label: 'Dashboard', url: 'https://tenantswap.africa/dashboard' },
    { id: 'link-2', label: 'Help', url: 'https://tenantswap.africa/help' },
  ],
  socialLinks: [],
};

@Injectable()
export class EmailShellService {
  private readonly logger = new Logger(EmailShellService.name);

  constructor(
    @Optional() private readonly systemSettings?: SystemSettingsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async getEmailBranding(): Promise<EmailBrandingConfig> {
    if (!this.systemSettings) return DEFAULT_EMAIL_BRANDING;
    try {
      const raw = await this.systemSettings.get(SETTINGS_KEYS.EMAIL_BRANDING_JSON);
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

  async getTemplateBySlug(slug: string): Promise<{ subject: string; bodyHtml: string; bodyText: string } | null> {
    if (!this.prisma) return null;
    try {
      const tpl = await this.prisma.emailTemplate.findFirst({
        where: { slug, isActive: true },
        select: { subject: true, bodyHtml: true, bodyText: true },
      });
      return tpl ?? null;
    } catch (err) {
      this.logger.warn(`[EMAIL_SHELL] template lookup failed slug=${slug}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // ─── HTML shell builder ───────────────────────────────────────────────────────

  wrapInBrandShell(branding: EmailBrandingConfig, content: EmailShellContent): string {
    const e = this.escapeHtml.bind(this);

    const logo = branding.logoUrl
      ? `<img src="${e(branding.logoUrl)}" alt="${e(branding.companyName)}" style="width:52px;height:52px;border-radius:16px;display:block;object-fit:cover" />`
      : `<div style="width:52px;height:52px;border-radius:16px;background:${e(branding.primaryColor)};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px">${e(branding.companyName.slice(0, 1) || 'T')}</div>`;

    const ctas = (content.ctaButtons ?? [])
      .filter((b) => b.label.trim() && b.url.trim())
      .map((b) => {
        const solid = b.variant !== 'outline';
        return `<a href="${e(b.url)}" style="display:inline-block;background:${solid ? e(branding.primaryColor) : 'transparent'};color:${solid ? '#ffffff' : e(branding.primaryColor)};text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:700;border:1.5px solid ${e(branding.primaryColor)}">${e(b.label)}</a>`;
      })
      .join('');

    // ── Quick links ──
    const quickLinkItems = branding.quickLinks.filter((l) => l.label?.trim() && l.url?.trim());
    const quickLinksHtml = quickLinkItems.length
      ? quickLinkItems.map((l) => `<a href="${e(l.url)}" style="color:#64748b;text-decoration:none;font-size:12px;font-weight:500;white-space:nowrap">${e(l.label)}</a>`).join(`<span style="color:#cbd5e1;padding:0 10px;font-size:12px">·</span>`)
      : '';

    // ── Social links ──
    const socialItems = branding.socialLinks.filter((l) => l.label?.trim() && l.url?.trim());
    const socialLinksHtml = socialItems.length
      ? socialItems.map((l) => `<a href="${e(l.url)}" title="${e(l.label)}" style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#f1f5f9;color:${e(branding.primaryColor)};text-decoration:none;margin:0 4px">${this.socialIconSvg(l.icon, branding.primaryColor)}</a>`).join('')
      : '';

    return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f7f2;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#172033">
    <div style="max-width:720px;margin:0 auto">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,${e(branding.primaryColor)},#111827);border-radius:30px 30px 0 0;padding:32px 30px 24px;color:#fff">
        <div style="display:flex;align-items:center;gap:16px">
          ${logo}
          <div>
            <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.78">${e(branding.eyebrow)}</div>
            <div style="font-size:28px;font-weight:700;line-height:1.2;margin-top:6px">${e(branding.companyName)}</div>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 30px 30px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.08)">
        <div style="padding:36px 30px 24px">
          <div style="display:inline-block;background:${e(branding.accentColor)};color:${e(branding.primaryColor)};padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${e(branding.companyName)}</div>
          <h1 style="font-size:32px;line-height:1.1;margin:18px 0 14px;color:#0f172a">${e(content.headline)}</h1>
          <div style="font-size:16px;line-height:1.8;color:#334155">${content.bodyHtml}</div>
          ${ctas ? `<div style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px">${ctas}</div>` : ''}
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc;border-top:1px solid #e2e8f0">

          <!-- Brand strip -->
          <div style="padding:28px 30px 0;text-align:center">
            <div style="display:inline-flex;align-items:center;gap:10px">
              ${branding.logoUrl
                ? `<img src="${e(branding.logoUrl)}" alt="${e(branding.companyName)}" style="width:28px;height:28px;border-radius:8px;object-fit:cover" />`
                : `<div style="width:28px;height:28px;border-radius:8px;background:${e(branding.primaryColor)};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">${e(branding.companyName.slice(0, 1) || 'T')}</div>`
              }
              <span style="font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-.01em">${e(branding.companyName)}</span>
            </div>
          </div>

          <!-- Social icons -->
          ${socialLinksHtml ? `<div style="padding:18px 30px 0;text-align:center">${socialLinksHtml}</div>` : ''}

          <!-- Divider -->
          <div style="margin:20px 30px 0;height:1px;background:#e2e8f0"></div>

          <!-- Quick links -->
          ${quickLinksHtml ? `<div style="padding:16px 30px 0;text-align:center;line-height:2">${quickLinksHtml}</div>` : ''}

          <!-- Footer note + support -->
          <div style="padding:16px 30px 0;text-align:center">
            <p style="margin:0;font-size:12px;line-height:1.8;color:#94a3b8">${e(branding.footerNote)}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Questions? <a href="mailto:${e(branding.supportEmail)}" style="color:${e(branding.primaryColor)};text-decoration:none;font-weight:600">${e(branding.supportEmail)}</a></p>
          </div>

          <!-- Copyright bar -->
          <div style="margin:20px 30px 0;height:1px;background:#e2e8f0"></div>
          <div style="padding:14px 30px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <span style="font-size:11px;color:#cbd5e1">© ${new Date().getFullYear()} ${e(branding.companyName)}. All rights reserved.</span>
            <a href="#" style="font-size:11px;color:#94a3b8;text-decoration:none">Unsubscribe</a>
          </div>

        </div>
      </div>
    </div>
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  socialIconSvg(icon: string, color: string): string {
    const stroke = this.escapeHtml(color);
    const icons: Record<string, string> = {
      instagram: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="${stroke}" stroke-width="1.8"/><circle cx="12" cy="12" r="4" stroke="${stroke}" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="${stroke}"/></svg>`,
      x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4L20 20M20 4L4 20" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`,
      linkedin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="${stroke}" stroke-width="1.8"/><path d="M8 10V16" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="7.5" r="1" fill="${stroke}"/><path d="M12 16V10M12 12.2C12 11 12.9 10 14.2 10C15.5 10 16.3 10.9 16.3 12.4V16" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      facebook: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13.5 20V12.5H16L16.5 9.5H13.5V7.8C13.5 6.9 13.9 6.2 15.1 6.2H16.6V3.5C16.3 3.5 15.5 3.4 14.6 3.4C11.9 3.4 10.3 5 10.3 7.9V9.5H8V12.5H10.3V20" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      whatsapp: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17L7.5 14.5C6.6 13.4 6 11.9 6 10.3C6 6.8 8.9 4 12.5 4C16.1 4 19 6.8 19 10.3C19 13.8 16.1 16.7 12.5 16.7C11 16.7 9.6 16.2 8.4 15.3L7 17Z" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/><path d="M10.1 8.9C10.3 8.5 10.5 8.5 10.7 8.5H11.2C11.4 8.5 11.6 8.6 11.7 8.9L12.3 10.2C12.4 10.4 12.4 10.6 12.2 10.8L11.7 11.3C12 12 12.5 12.6 13.2 13L13.8 12.5C14 12.4 14.2 12.4 14.4 12.5L15.8 13.1C16 13.2 16.1 13.4 16.1 13.6V14.1C16.1 14.4 16 14.6 15.7 14.7C15.4 14.9 14.9 15 14.4 14.9C12.2 14.5 10.1 12.5 9.8 10.2C9.7 9.8 9.8 9.3 10.1 8.9Z" fill="${stroke}"/></svg>`,
      youtube: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="6.5" width="17" height="11" rx="4" stroke="${stroke}" stroke-width="1.8"/><path d="M10 9.5L15 12L10 14.5V9.5Z" fill="${stroke}"/></svg>`,
      globe: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="${stroke}" stroke-width="1.8"/><path d="M4.5 12H19.5M12 4C14.1 6.1 15.3 8.9 15.3 12C15.3 15.1 14.1 17.9 12 20C9.9 17.9 8.7 15.1 8.7 12C8.7 8.9 9.9 6.1 12 4Z" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      mail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="${stroke}" stroke-width="1.8"/><path d="M5.5 8L12 12.5L18.5 8" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    };
    return icons[icon] ?? icons['globe'];
  }
}
