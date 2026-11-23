import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService as SendGridClient } from '@sendgrid/mail';
import { CommonContext, MailRenderer } from './mail-renderer';
import { TemplateContexts, TemplateName } from './mail-templates';

const SOCIALS = [
  ['Facebook', 'SOCIAL_FACEBOOK'],
  ['Instagram', 'SOCIAL_INSTAGRAM'],
  ['GitHub', 'SOCIAL_GITHUB'],
  ['LinkedIn', 'SOCIAL_LINKEDIN'],
] as const;

/** Cabeçalhos de email não podem conter quebras de linha (injecção de cabeçalhos). */
const oneLine = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Aceita `a@b.pt` ou `Nome <a@b.pt>` e devolve o formato que o SendGrid espera. */
export function parseSender(raw: string, defaultName: string): { email: string; name: string } {
  const m = /^\s*(.*?)\s*<\s*([^<>]+?)\s*>\s*$/.exec(raw);
  const email = oneLine(m ? m[2] : raw);
  const name = oneLine((m ? m[1] : '').replace(/^"|"$/g, '')) || defaultName;
  return { email, name };
}

/** Mensagem útil a partir do erro do SendGrid (o corpo traz o motivo, sem segredos). */
function sendGridError(err: unknown): string {
  const e = err as { code?: number; message?: string; response?: { body?: { errors?: { message?: string }[] } } };
  const detail = e.response?.body?.errors?.map((x) => x.message).filter(Boolean).join('; ');
  return [e.code && `HTTP ${e.code}`, detail || e.message].filter(Boolean).join(' — ') || String(err);
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: SendGridClient | null;
  private readonly from: { email: string; name: string };
  private readonly frontendUrl: string;
  private readonly renderer = new MailRenderer();
  private readonly common: CommonContext;

  constructor(config: ConfigService) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');

    const appName = config.get<string>('APP_NAME') ?? 'Donza';
    // Remetente verificado no SendGrid. EMAIL_GRID_FROM (nome usado na versão Express) ou MAIL_FROM.
    const sender = config.get<string>('EMAIL_GRID_FROM') || config.get<string>('MAIL_FROM') || 'no-reply@donza.local';
    this.from = parseSender(sender, config.get<string>('EMAIL_FROM_NAME') || appName);
    this.common = {
      appName,
      tagline: config.get<string>('APP_TAGLINE') ?? 'A sua plataforma educacional completa',
      signature: `Equipa ${appName}`,
      supportEmail: config.get<string>('SUPPORT_EMAIL') || undefined,
      helpUrl: config.get<string>('HELP_URL') ?? `${this.frontendUrl}/help`,
      termsUrl: config.get<string>('TERMS_URL') ?? `${this.frontendUrl}/terms`,
      privacyUrl: config.get<string>('PRIVACY_URL') ?? `${this.frontendUrl}/privacy`,
      loginUrl: `${this.frontendUrl}/login`,
      // só aparecem as redes sociais configuradas
      social: SOCIALS.flatMap(([name, key]) => {
        const url = config.get<string>(key);
        return url ? [{ name, url }] : [];
      }),
    };

    const apiKey = config.get<string>('SENDGRID_API_KEY');
    if (apiKey) {
      this.client = new SendGridClient();
      this.client.setApiKey(apiKey);
    } else {
      this.client = null;
      this.logger.warn('SENDGRID_API_KEY não definido: os emails serão apenas escritos no log.');
    }
  }

  /** Endereço de suporte (destino dos pedidos de contacto). */
  get supportEmail() {
    return this.common.supportEmail;
  }

  get appUrl() {
    return this.frontendUrl;
  }

  /** Renderiza e envia um template. Nunca lança: devolve `false` se o envio falhar. */
  async sendTemplate<N extends TemplateName>(
    name: N, to: string, ctx: TemplateContexts[N], opts: { replyTo?: string } = {},
  ): Promise<boolean> {
    let mail;
    try {
      mail = this.renderer.render(name, ctx, this.common);
    } catch (err) {
      this.logger.error(`Falha ao gerar o template "${name}"`, err instanceof Error ? err.stack : String(err));
      return false;
    }
    // reply-to só se for um email bem formado (vem de visitantes no formulário de contacto)
    const replyTo = opts.replyTo && EMAIL_RE.test(opts.replyTo.trim()) ? oneLine(opts.replyTo) : undefined;
    if (!this.client) {
      this.logger.log(`[email simulado] template=${name} para=${to} assunto="${mail.subject}"`);
      return true;
    }
    try {
      await this.client.send({ from: this.from, to, subject: oneLine(mail.subject), html: mail.html, text: mail.text, ...(replyTo && { replyTo }) });
      return true;
    } catch (err) {
      this.logger.error(`Falha ao enviar email para ${to}: ${sendGridError(err)}`);
      return false;
    }
  }

  // ── Atalhos usados pelos módulos ────────────────────────────────────────────

  sendVerificationEmail(email: string, token: string) {
    return this.sendTemplate('verify-email', email, { email, verificationUrl: `${this.frontendUrl}/register/verify?token=${token}` });
  }

  sendWelcome(email: string, username: string) {
    return this.sendTemplate('welcome', email, { username });
  }

  sendPasswordReset(email: string, token: string, username?: string) {
    return this.sendTemplate('password-reset', email, { username: username ?? email, resetUrl: `${this.frontendUrl}/reset-password?token=${token}` });
  }

  sendPasswordChanged(email: string, username: string) {
    return this.sendTemplate('password-changed', email, {
      username,
      changeDate: new Date().toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Maputo' }),
    });
  }

  /** Email genérico de notificação in-app (título + mensagem + ligação para a plataforma). */
  sendNotification(to: string, subject: string, message: string) {
    return this.sendTemplate('notification', to, {
      title: subject, message, actionUrl: `${this.frontendUrl}/notifications`, actionLabel: `Ver na ${this.common.appName}`,
    });
  }
}
