import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

interface TypeDef {
  /** Chave em `User.notificationPreferences.email`. Sem chave => usa `email` como valor fixo. */
  prefKey?: string;
  /** Valor por omissão quando o utilizador ainda não definiu a preferência. */
  email: boolean;
}

/**
 * Catálogo mínimo: só decide se um tipo envia email. Título e mensagem vêm de quem notifica
 * (os `template` do Express eram quase todos código morto: nunca eram chamados).
 * Tipos que não estão aqui são só in-app.
 */
const CATALOG: Partial<Record<NotificationType, TypeDef>> = {
  USER_REVIEW_REQUIRED: { email: true },
  USER_APPROVED: { email: true },
  USER_REJECTED: { email: true },
  EVENT_REMINDER: { prefKey: 'eventReminders', email: true },
  EVENT_CREATED: { email: true },
  EVENT_UPDATED: { email: true },
  EVENT_DELETED: { email: true },
  EVENT_REGISTRATION: { email: true },
  EVENT_REGISTRATION_CANCELLED: { email: true },
  TASK_DEADLINE: { prefKey: 'taskDeadlines', email: true },
  NEW_MESSAGE: { prefKey: 'newMessages', email: true },
  NEW_DIRECT_MESSAGE: { prefKey: 'newMessages', email: true },
  REVIEW_REPLY: { prefKey: 'reviewReplies', email: true },
  NEW_FOLLOWER: { email: true },
  COURSE_UPDATE: { prefKey: 'courseUpdates', email: false },
  COURSE_MATERIAL_UPDATE: { prefKey: 'courseUpdates', email: false },
  MODULE_CREATED: { prefKey: 'courseUpdates', email: false },
  LESSON_CREATED: { prefKey: 'courseUpdates', email: false },
  COURSE_ASSIGNMENT_CREATED: { prefKey: 'courseUpdates', email: false },
  COURSE_ASSIGNMENT_UPDATED: { prefKey: 'courseUpdates', email: false },
  COURSE_ASSIGNMENT_SUBMITTED: { email: true },
  COURSE_ASSIGNMENT_GRADED: { email: true },
  CONTACT_REQUEST_RECEIVED: { email: true },
  CONTACT_REQUEST_UPDATED: { email: true },
  SYSTEM_ALERT: { email: true },
  COURSE_CREATED: { email: true },
  COURSE_PUBLISHED: { email: true },
  COURSE_DELETED: { email: true },
  COURSE_ENROLLMENT: { email: true },
  COURSE_COMPLETION: { email: true },
  COURSE_APPROVAL: { email: true },
  COURSE_REJECTION: { email: true },
  STUDY_GROUP_INVITE: { email: true },
  STUDY_GROUP_JOIN_REQUEST: { email: true },
  STUDY_GROUP_REQUEST_APPROVED: { email: true },
  STUDY_GROUP_REQUEST_REJECTED: { email: true },
  STUDY_GROUP_MEETING_SCHEDULED: { email: true },
};

export interface NotifyPayload {
  title: string;
  message: string;
  relatedEntityId?: string;
  metadata?: Prisma.InputJsonValue;
  scheduledAt?: Date;
}

interface Prefs {
  inApp?: boolean;
  email?: Record<string, boolean>;
}

/**
 * Cria notificações in-app e, se o tipo/preferências o permitirem, envia email em segundo plano.
 * NUNCA lança: notificar é um efeito secundário e não pode rebentar a operação principal.
 * Chamar sempre DEPOIS do commit da transacção.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  notify(userId: string, type: NotificationType, payload: NotifyPayload) {
    return this.notifyMany([userId], type, payload);
  }

  async notifyMany(userIds: string[], type: NotificationType, payload: NotifyPayload): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    try {
      const users = await this.prisma.user.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, email: true, notificationPreferences: true },
      });

      const inApp = users.filter((u) => (u.notificationPreferences as Prefs | null)?.inApp !== false);
      const title = payload.title.slice(0, 100);

      // createMany em blocos: um curso com milhares de alunos não pode gerar milhares de INSERTs.
      for (let i = 0; i < inApp.length; i += 500) {
        await this.prisma.notification.createMany({
          data: inApp.slice(i, i + 500).map((u) => ({
            userId: u.userId,
            type,
            title,
            message: payload.message,
            relatedEntityId: payload.relatedEntityId,
            metadata: payload.metadata,
            scheduledAt: payload.scheduledAt,
          })),
        });
      }

      const def = CATALOG[type];
      if (!def) return;
      const recipients = users.filter((u) => this.wantsEmail(u.notificationPreferences as Prefs | null, def));
      if (recipients.length) void this.sendEmails(recipients.map((u) => u.email), title, payload.message);
    } catch (err) {
      this.logger.error(`Falha ao notificar (${type})`, err instanceof Error ? err.stack : String(err));
    }
  }

  private wantsEmail(prefs: Prefs | null, def: TypeDef): boolean {
    if (!def.prefKey) return def.email;
    const chosen = prefs?.email?.[def.prefKey];
    return typeof chosen === 'boolean' ? chosen : def.email;
  }

  /** Envio sequencial em lotes de 5, em segundo plano. */
  private async sendEmails(to: string[], subject: string, message: string) {
    for (let i = 0; i < to.length; i += 5) {
      await Promise.all(to.slice(i, i + 5).map((email) => this.mail.sendNotification(email, subject, message)));
    }
  }
}
