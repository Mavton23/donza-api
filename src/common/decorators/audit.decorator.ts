import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action?: string;
  entityType?: string;
}

/**
 * Regista a acção no AuditLog quando o utilizador é admin.
 * - No handler: `@Audit('user.approve', 'user')`
 * - Na classe (sem argumentos): regista todos os endpoints do controller, como o antigo `logAccess`.
 */
export const Audit = (action?: string, entityType?: string) =>
  SetMetadata<string, AuditMeta>(AUDIT_KEY, { action, entityType });
