/** Contexto de cada template (as variáveis comuns — appName, supportEmail, helpUrl… — são acrescentadas pelo MailService). */
export interface TemplateContexts {
  'verify-email': { email: string; verificationUrl: string };
  welcome: { username: string };
  'password-reset': { username: string; resetUrl: string };
  'password-changed': { username: string; changeDate: string };
  'account-approved': { username: string; reviewer: string };
  'account-rejected': { username: string; reviewer: string; reason: string };
  'event-reminder': { username: string; eventName: string; eventTime: string; timeRemaining: string; eventUrl: string };
  'task-reminder': { username: string; taskName: string; dueDate: string; timeRemaining: string; taskUrl: string };
  'payment-confirmation': {
    studentName: string; courseTitle: string; instructorName: string; amount: string; currency: string;
    paymentDate: string; paymentMethod: string; transactionId: string; courseUrl: string; dashboardUrl: string;
  };
  'contact-message': { name: string; replyTo: string; subject: string; requestId: string; text: string };
  'callback-request': { name: string; phone: string; preferredTime: string; subject: string; requestId: string };
  'contact-resolved': { name: string; requestId: string; contactMethod: string };
  'contact-status-update': { name: string; oldStatus: string; newStatus: string; requestId: string; contactMethod: string };
  notification: { title: string; message: string; actionUrl: string; actionLabel: string };
}

export type TemplateName = keyof TemplateContexts;

export type Theme = 'green' | 'indigo' | 'amber' | 'blue';

export const THEMES: Record<Theme, { accent: string; accentDark: string; tint: string }> = {
  green: { accent: '#10b981', accentDark: '#059669', tint: '#f0fdf4' },
  indigo: { accent: '#6366f1', accentDark: '#8b5cf6', tint: '#eff6ff' },
  amber: { accent: '#f59e0b', accentDark: '#d97706', tint: '#fffbeb' },
  blue: { accent: '#3b82f6', accentDark: '#2563eb', tint: '#eff6ff' },
};

interface Meta<N extends TemplateName> {
  theme: Theme;
  /** Assunto do email (o MailService acrescenta " - <appName>"). */
  subject: (c: TemplateContexts[N]) => string;
  /** Título grande no cabeçalho. */
  heading: (c: TemplateContexts[N]) => string;
}

const meta = <N extends TemplateName>(theme: Theme, subject: Meta<N>['subject'] | string, heading: Meta<N>['heading'] | string): Meta<N> => ({
  theme,
  subject: typeof subject === 'string' ? () => subject : subject,
  heading: typeof heading === 'string' ? () => heading : heading,
});

export const TEMPLATE_META: { [N in TemplateName]: Meta<N> } = {
  'verify-email': meta('indigo', 'Confirme o seu e-mail', 'Verificação de e-mail'),
  welcome: meta('blue', 'Bem-vindo(a)', 'Bem-vindo(a) à nossa plataforma de ensino!'),
  'password-reset': meta('indigo', 'Redefinição de palavra-passe', 'Redefinição de palavra-passe'),
  'password-changed': meta('indigo', 'Palavra-passe alterada', 'Palavra-passe alterada'),
  'account-approved': meta('green', 'Conta aprovada', 'Conta aprovada!'),
  'account-rejected': meta('indigo', 'Pedido de conta não aprovado', 'Pedido não aprovado'),
  'event-reminder': meta('amber', (c) => `Lembrete: ${c.eventName}`, 'Lembrete de evento'),
  'task-reminder': meta('amber', (c) => `Lembrete: ${c.taskName}`, 'Lembrete de tarefa'),
  'payment-confirmation': meta('green', 'Confirmação de pagamento', 'Pagamento confirmado!'),
  'contact-message': meta('indigo', 'Nova mensagem de contacto', 'Nova mensagem de contacto'),
  'callback-request': meta('indigo', 'Pedido de retorno de chamada', 'Pedido de retorno'),
  'contact-resolved': meta('green', 'Pedido resolvido', 'Pedido resolvido'),
  'contact-status-update': meta('amber', 'Atualização do estado do pedido', 'Atualização de estado'),
  notification: meta('indigo', (c) => c.title, (c) => c.title),
};
