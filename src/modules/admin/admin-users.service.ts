import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, NotificationType, Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, skipOf } from '@/common/utils/pagination';
import { displayName } from '../courses/course-access';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ListUsersQueryDto, ListVerificationsQueryDto, ProcessVerificationDto, RegisterAdminDto, ReviewDocumentDto, SetUserStatusDto } from './dto/admin.dto';

const REVIEWABLE: UserRole[] = [UserRole.instructor, UserRole.institution];
/** Campos públicos para o painel: nunca password nem tokens. */
const USER_ROW = {
  userId: true, username: true, email: true, role: true, status: true, fullName: true, institutionName: true, avatarUrl: true,
  isVerified: true, profileCompleted: true, lastLogin: true, createdAt: true, reviewDate: true, rejectionReason: true,
} as const;
const DOC_ROW = { docId: true, documentType: true, originalName: true, mimeType: true, size: true, status: true, reviewedById: true, reviewDate: true, rejectionReason: true, createdAt: true } as const;
const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  private search(q?: string): Prisma.UserWhereInput {
    if (!q) return {};
    const c = { contains: escapeLike(q), mode: 'insensitive' as const };
    return { OR: [{ username: c }, { email: c }, { fullName: c }, { institutionName: c }] };
  }

  // ── Contas de administrador ──────────────────────────────────────────────

  async registerAdmin(dto: RegisterAdminDto) {
    try {
      const u = await this.prisma.user.create({
        data: {
          email: dto.email, username: dto.username, fullName: dto.fullName, password: await bcrypt.hash(dto.password, 12),
          role: UserRole.admin, status: UserStatus.approved, isVerified: true, verifiedAt: new Date(), profileCompleted: true,
        },
        select: USER_ROW,
      });
      return { success: true, data: u };
    } catch (e) {
      if (isP2002(e)) throw new ConflictException({ message: 'Email ou nome de utilizador já existe', code: 'USER_EXISTS' });
      throw e;
    }
  }

  // ── Utilizadores ─────────────────────────────────────────────────────────

  async listUsers(q: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = { AND: [this.search(q.q), { ...(q.role && { role: q.role }), ...(q.status && { status: q.status }), ...(q.isVerified !== undefined && { isVerified: q.isVerified }) }] };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: USER_ROW }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async getUser(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { userId },
      select: { ...USER_ROW, bio: true, verificationData: true, createdAt: true, _count: { select: { taughtCourses: true, enrollments: true, certificates: true, documents: true } } },
    });
    if (!u) throw this.noUser();
    const { _count, ...rest } = u;
    return { success: true, data: { ...rest, counts: _count } };
  }

  /** Suspende ou reactiva. Guarda o estado anterior para que reactivar não contorne a aprovação. */
  async setStatus(admin: AuthUser, userId: string, dto: SetUserStatusDto) {
    if (userId === admin.userId) throw new BadRequestException({ message: 'Não pode alterar o seu próprio estado', code: 'SELF_ACTION' });
    const u = await this.prisma.user.findUnique({ where: { userId }, select: { role: true, status: true, verificationData: true } });
    if (!u) throw this.noUser();
    if (u.role === UserRole.admin) throw new ForbiddenException({ message: 'Contas de administrador não se suspendem aqui', code: 'ADMIN_PROTECTED' });
    const data = (u.verificationData ?? {}) as Record<string, unknown>;

    if (dto.status === 'suspended') {
      if (u.status === UserStatus.suspended) throw new ConflictException({ message: 'A conta já está suspensa', code: 'ALREADY_SUSPENDED' });
      const { count } = await this.prisma.user.updateMany({
        where: { userId, status: u.status },
        data: { status: UserStatus.suspended, verificationData: { ...data, statusBeforeSuspension: u.status, suspension: { reason: dto.reason, by: admin.userId, at: new Date().toISOString() } } as Prisma.InputJsonObject },
      });
      if (!count) throw new ConflictException({ message: 'O utilizador foi alterado entretanto; tente de novo', code: 'STATUS_CONFLICT' });
      await this.prisma.token.updateMany({ where: { userId, revoked: false }, data: { revoked: true } }); // termina as sessões
      this.realtime.disconnectUser(userId); // e corta as ligações em tempo real
    } else {
      if (u.status !== UserStatus.suspended) throw new ConflictException({ message: 'A conta não está suspensa', code: 'NOT_SUSPENDED' });
      const before = data.statusBeforeSuspension as UserStatus | undefined;
      const restore = before && before !== UserStatus.suspended ? before : UserStatus.pending; // na dúvida, volta a revisão
      const { suspension, statusBeforeSuspension, ...rest } = data; // eslint-disable-line @typescript-eslint/no-unused-vars
      const { count } = await this.prisma.user.updateMany({ where: { userId, status: UserStatus.suspended }, data: { status: restore, verificationData: rest as Prisma.InputJsonObject } });
      if (!count) throw new ConflictException({ message: 'O utilizador foi alterado entretanto; tente de novo', code: 'STATUS_CONFLICT' });
    }
    return this.getUser(userId);
  }

  private noUser() { return new NotFoundException({ message: 'Utilizador não encontrado', code: 'USER_NOT_FOUND' }); }

  // ── Verificações (instrutores e instituições) ────────────────────────────

  async listVerifications(q: ListVerificationsQueryDto) {
    const where: Prisma.UserWhereInput = { AND: [this.search(q.q), { status: q.status, role: q.role ?? { in: REVIEWABLE } }] };
    const [rows, total] = await Promise.all([
      // mais antigos primeiro: é uma fila de trabalho
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'asc' }, skip: skipOf(q), take: q.limit,
        select: { ...USER_ROW, institutionType: true, teachingExperience: true, _count: { select: { documents: true } }, documents: { where: { status: ApprovalStatus.pending }, select: { docId: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(({ documents, _count, ...u }) => ({ ...u, documentsCount: _count.documents, pendingDocuments: documents.length })), total, q);
  }

  async verificationDetails(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        ...USER_ROW, bio: true, expertise: true, educationLevel: true, educationField: true, teachingExperience: true, institutionType: true, academicPrograms: true,
        website: true, contactPhone: true, nuit: true, legalRepresentative: true, accreditation: true, yearFounded: true, verificationData: true,
        reviewedBy: { select: { userId: true, username: true } }, documents: { orderBy: { createdAt: 'asc' }, select: DOC_ROW },
      },
    });
    if (!u || !REVIEWABLE.includes(u.role)) throw new NotFoundException({ message: 'Verificação não encontrada', code: 'VERIFICATION_NOT_FOUND' });
    return { success: true, data: u };
  }

  async processVerification(admin: AuthUser, userId: string, dto: ProcessVerificationDto) {
    const u = await this.prisma.user.findUnique({ where: { userId }, select: { role: true, status: true, email: true, username: true } });
    if (!u || !REVIEWABLE.includes(u.role)) throw new NotFoundException({ message: 'Verificação não encontrada', code: 'VERIFICATION_NOT_FOUND' });
    const approving = dto.status === 'approved';
    // O estado de partida entra no WHERE: duas decisões em simultâneo não se sobrepõem nem enviam dois emails.
    const { count } = await this.prisma.user.updateMany({
      where: { userId, status: UserStatus.pending },
      data: { status: approving ? UserStatus.approved : UserStatus.rejected, reviewedById: admin.userId, reviewDate: new Date(), rejectionReason: approving ? null : dto.reason },
    });
    if (!count) throw new ConflictException({ message: `O pedido já foi decidido (${u.status})`, code: 'ALREADY_REVIEWED' });

    const reviewer = await this.prisma.user.findUnique({ where: { userId: admin.userId }, select: { role: true, institutionName: true, fullName: true, username: true } });
    const reviewerName = reviewer ? displayName(reviewer) : 'Equipa Donza';
    void (approving
      ? this.mail.sendTemplate('account-approved', u.email, { username: u.username, reviewer: reviewerName })
      : this.mail.sendTemplate('account-rejected', u.email, { username: u.username, reviewer: reviewerName, reason: dto.reason ?? '' }));
    void this.notifications.notify(userId, approving ? NotificationType.USER_APPROVED : NotificationType.USER_REJECTED, {
      title: approving ? 'Conta aprovada' : 'Pedido não aprovado',
      message: approving ? 'O seu perfil foi aprovado. Já pode usar todas as funcionalidades.' : `O seu pedido não foi aprovado: ${dto.reason}`,
    });
    const pendingDocs = await this.prisma.userDocument.count({ where: { userId, status: ApprovalStatus.pending } });
    return { success: true, data: { userId, status: dto.status, pendingDocuments: pendingDocs } };
  }

  // ── Documentos ───────────────────────────────────────────────────────────

  async reviewDocument(admin: AuthUser, docId: string, dto: ReviewDocumentDto) {
    const doc = await this.prisma.userDocument.findUnique({ where: { docId }, select: { userId: true, documentType: true } });
    if (!doc?.userId) throw this.noDoc();
    const approving = dto.status === 'approved';
    const updated = await this.prisma.userDocument.update({
      where: { docId },
      data: { status: dto.status, reviewedById: admin.userId, reviewDate: new Date(), rejectionReason: approving ? null : dto.reason },
      select: DOC_ROW,
    });
    if (!approving) {
      void this.notifications.notify(doc.userId, NotificationType.DONZA_NOTIFICATION, {
        title: 'Documento rejeitado', message: `O documento (${doc.documentType}) foi rejeitado: ${dto.reason}`, relatedEntityId: docId,
      });
    }
    return { success: true, data: updated };
  }

  /** URL assinado para ver o documento privado (o ficheiro nunca é público). */
  async downloadDocument(docId: string) {
    const doc = await this.prisma.userDocument.findUnique({ where: { docId }, select: { userId: true, storageKey: true, originalName: true, mimeType: true, metadata: true } });
    if (!doc?.userId) throw this.noDoc();
    const resourceType = ((doc.metadata as { resourceType?: string } | null)?.resourceType) ?? 'image';
    return { success: true, data: { url: this.storage.signedUrl(doc.storageKey, resourceType), originalName: doc.originalName, mimeType: doc.mimeType } };
  }

  private noDoc() { return new NotFoundException({ message: 'Documento não encontrado', code: 'DOCUMENT_NOT_FOUND' }); }
}
