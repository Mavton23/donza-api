import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import { join } from 'path';
import { TEMPLATE_META, TemplateContexts, TemplateName, THEMES } from './mail-templates';

export interface CommonContext {
  appName: string;
  tagline: string;
  signature: string;
  supportEmail?: string;
  helpUrl: string;
  termsUrl: string;
  privacyUrl: string;
  loginUrl: string;
  social: { name: string; url: string }[];
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

/**
 * Compila cada template uma vez e junta-o ao layout comum. O Handlebars escapa HTML por omissão
 * (`{{x}}`): nunca se usa `{{{x}}}` com dados de utilizadores (o Express usava-o no texto do contacto).
 */
export class MailRenderer {
  private readonly hbs = Handlebars.create();
  private readonly bodies = new Map<TemplateName, HandlebarsTemplateDelegate>();
  private readonly layout: HandlebarsTemplateDelegate;

  constructor(private readonly dir = join(__dirname, 'templates')) {
    this.layout = this.hbs.compile(this.read('layout'));
  }

  private read(name: string) {
    return readFileSync(join(this.dir, `${name}.hbs`), 'utf8');
  }

  render<N extends TemplateName>(name: N, ctx: TemplateContexts[N], common: CommonContext): Rendered {
    const meta = TEMPLATE_META[name];
    let tpl = this.bodies.get(name);
    if (!tpl) {
      tpl = this.hbs.compile(this.read(name));
      this.bodies.set(name, tpl);
    }
    const full = { ...common, ...ctx, currentYear: new Date().getFullYear() };
    const body = tpl(full);
    const heading = meta.heading(ctx);
    const html = this.layout({ ...full, ...THEMES[meta.theme], heading, body });
    return { subject: `${meta.subject(ctx)} - ${common.appName}`.replace(/[\r\n]+/g, ' '), html, text: toText(body, heading) };
  }
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#x3D;': '=', '&#x60;': '`', '&nbsp;': ' ' };

/** Versão em texto simples (melhora entregabilidade e clientes sem HTML). */
function toText(body: string, heading: string): string {
  const out = body
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_m, href: string, label: string) => (label.trim() === href ? href : `${label} (${href})`))
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h[1-3]>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#x27|#x3D|#x60|nbsp);/g, (e) => ENTITIES[e])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${heading}\n\n${out}\n`;
}
