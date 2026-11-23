import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContactMethod, ContactRequestStatus, NotificationType, Prisma, UserRole, UserStatus } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, skipOf } from '@/common/utils/pagination';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactRequestDto, ListContactRequestsQueryDto } from './dto/contact.dto';

const S = ContactRequestStatus;
/** pending → in_progress → resolved; é possível voltar atrás um passo e reabrir um resolvido. */
const TRANSITIONS: Record<ContactRequestStatus, ContactRequestStatus[]> = {
  [S.pending]: [S.in_progress, S.resolved],
  [S.in_progress]: [S.pending, S.resolved],
  [S.resolved]: [S.in_progress],
};
const LABEL: Record<ContactRequestStatus, string> = { pending: 'Pendente', in_progress: 'Em andamento', resolved: 'Resolvido' };
const METHOD_LABEL: Record<ContactMethod, string> = { email: 'Email', chat: 'Chat', callback: 'Retorno de chamada' };
/** Limite por email (os pedidos são públicos): evita encher a caixa de suporte. */
const MAX_PER_EMAIL_PER_DAY = 5;

const ROW = {
  requestId: true, userId: true, updatedById: true, name: true, email: true, contactMethod: true, subject: true, message: true,
  phone: true, preferredTime: true, status: true, createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Público; `user` só vem preenchido se houver sessão válida. */
  async create(dto: CreateContactRequestDto, user?: AuthUser) {
    if (dto.preferredTime && dto.preferredTime.getTime() < Date.now() - 60_000) {
      throw new BadRequestException({ message: 'O horário preferencial não pode estar no passado', code: 'INVALID_PREFERRED_TIME' });
    }
    const recent = await this.prisma.contactRequest.count({ where: { email: dto.email, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
    if (recent >= MAX_PER_EMAIL_PER_DAY) {
      throw new HttpException({ message: 'Demasiados pedidos recentes com este email. Tente novamente amanhã.', code: 'TOO_MANY_REQUESTS' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const isCallback = dto.contactMethod === ContactMethod.callback;
    const req = await this.prisma.contactRequest.create({
      data: {
        userId: user?.userId, name: dto.name, email: dto.email, contactMethod: dto.contactMethod, subject: dto.subject,
        message: dto.message, phone: dto.phone, preferredTime: isCallback ? dto.preferredTime : undefined,
      },
      select: ROW,
    });

    // Depois do commit; nenhum falha aqui estraga o pedido já gravado.
    void this.afterCreate(req);
    return { success: true, message: 'Pedido recebido. Entraremos em contacto em breve.', data: { requestId: req.requestId, status: req.status } };
  }

  private async afterCreate(req: Prisma.ContactRequestGetPayload<{ select: typeof ROW }>) {
    const subject = req.subject ?? METHOD_LABEL[req.contactMethod];
    try {
      const support = this.mail.supportEmail;
      if (support) {
        if (req.contactMethod === ContactMethod.callback) {
          await this.mail.sendTemplate('callback-request', support, {
            name: req.name, phone: req.phone ?? '', preferredTime: req.preferredTime ? this.fmt(req.preferredTime) : 'Qualquer horário',
            subject, requestId: req.requestId,
          }, { replyTo: req.email });
        } else {
          await this.mail.sendTemplate('contact-message', support, {
            name: req.name, replyTo: req.email, subject, requestId: req.requestId, text: req.message ?? '',
          }, { replyTo: req.email });
        }
      } else {
        this.logger.warn(`SUPPORT_EMAIL não definido: pedido ${req.requestId} só visível no painel`);
      }
      const admins = await this.prisma.user.findMany({ where: { role: UserRole.admin, status: UserStatus.approved }, select: { userId: true } });
      await this.notifications.notifyMany(admins.map((a) => a.userId), NotificationType.CONTACT_REQUEST_RECEIVED, {
        title: 'Novo pedido de contacto', message: `${req.name} enviou um pedido (${METHOD_LABEL[req.contactMethod]}): ${subject}`.slice(0, 500),
        relatedEntityId: req.requestId,
      });
    } catch (err) {
      this.logger.error(`Falha nos efeitos do pedido ${req.requestId}`, err instanceof Error ? err.stack : String(err));
    }
  }

  private fmt(d: Date) {
    return d.toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Maputo' });
  }

  // ── Utilizador ───────────────────────────────────────────────────────────

  async mine(user: AuthUser, q: ListContactRequestsQueryDto) {
    const where: Prisma.ContactRequestWhereInput = { userId: user.userId, ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      this.prisma.contactRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: ROW }),
      this.prisma.contactRequest.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async list(q: ListContactRequestsQueryDto) {
    const like = q.q && escapeLike(q.q);
    const where: Prisma.ContactRequestWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.contactMethod && { contactMethod: q.contactMethod }),
      ...(like && { OR: [{ name: { contains: like, mode: 'insensitive' } }, { email: { contains: like, mode: 'insensitive' } }, { subject: { contains: like, mode: 'insensitive' } }] }),
    };
    const [rows, total, grouped] = await Promise.all([
      this.prisma.contactRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: ROW }),
      this.prisma.contactRequest.count({ where }),
      this.prisma.contactRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = { pending: 0, in_progress: 0, resolved: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    return { ...paginated(rows, total, q), counts };
  }

  async get(id: string) {
    const req = await this.prisma.contactRequest.findUnique({
      where: { requestId: id },
      select: { ...ROW, metadata: true, user: { select: { userId: true, username: true, fullName: true } }, updatedByUser: { select: { userId: true, username: true, fullName: true } } },
    });
    if (!req) throw this.notFound();
    return { success: true, data: req };
  }

  async updateStatus(admin: AuthUser, id: string, next: ContactRequestStatus) {
    const current = await this.prisma.contactRequest.findUnique({ where: { requestId: id }, select: { status: true } });
    if (!current) throw this.notFound();
    if (current.status === next) throw new ConflictException({ message: 'O pedido já tem este estado', code: 'STATUS_UNCHANGED' });
    if (!TRANSITIONS[current.status].includes(next)) {
      throw new BadRequestException({ message: `Transição inválida: ${current.status} → ${next}`, code: 'INVALID_TRANSITION' });
    }
    // O estado de partida entra no WHERE: dois admins em simultâneo não aplicam a mesma transição duas vezes.
    const { count } = await this.prisma.contactRequest.updateMany({ where: { requestId: id, status: current.status }, data: { status: next, updatedById: admin.userId } });
    if (!count) throw new ConflictException({ message: 'O pedido foi alterado entretanto; recarregue', code: 'STATUS_CONFLICT' });

    const req = await this.prisma.contactRequest.findUniqueOrThrow({ where: { requestId: id }, select: ROW });
    void this.notifyRequester(req, current.status, next);
    return { success: true, data: req };
  }

  /** O pedido vem de visitantes também: o email vai sempre para o `email` do pedido; a notificação in-app só existe se houver conta. */
  private async notifyRequester(req: Prisma.ContactRequestGetPayload<{ select: typeof ROW }>, from: ContactRequestStatus, to: ContactRequestStatus) {
    try {
      const method = METHOD_LABEL[req.contactMethod];
      if (to === S.resolved) await this.mail.sendTemplate('contact-resolved', req.email, { name: req.name, requestId: req.requestId, contactMethod: method });
      else await this.mail.sendTemplate('contact-status-update', req.email, {
        name: req.name, oldStatus: LABEL[from], newStatus: LABEL[to], requestId: req.requestId, contactMethod: method,
      });
      if (req.userId) {
        await this.notifications.notify(req.userId, NotificationType.CONTACT_REQUEST_UPDATED, {
          title: 'Pedido de contacto atualizado', message: `O seu pedido passou a "${LABEL[to]}".`, relatedEntityId: req.requestId,
        });
      }
    } catch (err) {
      this.logger.error(`Falha ao avisar o autor do pedido ${req.requestId}`, err instanceof Error ? err.stack : String(err));
    }
  }

  private notFound() { return new NotFoundException({ message: 'Pedido não encontrado', code: 'CONTACT_REQUEST_NOT_FOUND' }); }
}
