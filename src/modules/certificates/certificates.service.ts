import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertificateStatus, EnrollmentStatus, EventParticipantStatus, NotificationType, Prisma, UserRole } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { canManage, displayName } from '../courses/course-access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { renderCertificatePdf } from './certificate-pdf';
import { ListCertificatesQueryDto } from './dto/certificate.dto';

const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const WHO = { userId: true, username: true, fullName: true, institutionName: true, role: true } as const;
const ROW = {
  certificateId: true, credentialId: true, issueDate: true, expirationDate: true, hours: true, status: true, downloadUrl: true, verificationUrl: true,
  course: { select: { courseId: true, title: true, slug: true } }, event: { select: { eventId: true, title: true } },
} as const;
type Row = Prisma.CertificateGetPayload<{ select: typeof ROW }>;

/** `expired` é derivado da data: não depende de nenhum job a atualizar a coluna. */
const statusOf = (c: { status: CertificateStatus; expirationDate: Date | null }) =>
  c.status === CertificateStatus.issued && c.expirationDate && c.expirationDate < new Date() ? CertificateStatus.expired : c.status;

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);
  private readonly frontend: string;
  private readonly appName: string;

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, config: ConfigService) {
    this.frontend = (config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
    this.appName = config.get<string>('APP_NAME') ?? 'Donza';
  }

  private shape(c: Row) {
    return { ...c, hours: Number(c.hours), status: statusOf(c) };
  }

  /** ID legível e não adivinhável: DZ-XXXX-XXXX-XXXX. */
  private credentialId() {
    const h = randomBytes(6).toString('hex').toUpperCase();
    return `DZ-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
  }

  /** Cria o certificado se ainda não existir (idempotente). Devolve `null` se já existia. */
  private async issue(target: { userId: string; courseId?: string; eventId?: string }, hours: number, metadata: Prisma.InputJsonValue) {
    const exists = await this.prisma.certificate.findFirst({ where: target, select: { certificateId: true } });
    if (exists) return null;
    for (let i = 0; i < 3; i++) {
      const certificateId = randomUUID();
      const credentialId = this.credentialId();
      try {
        return await this.prisma.certificate.create({
          data: {
            certificateId, credentialId, ...target, hours: Math.min(hours, 9999.9),
            downloadUrl: `/api/certificates/${certificateId}/download`, verificationUrl: `${this.frontend}/certificates/verify/${credentialId}`, metadata,
          },
          select: { certificateId: true, credentialId: true },
        });
      } catch (e) {
        if (!isP2002(e)) throw e;
        // índice único (utilizador+alvo): outro pedido emitiu entretanto; se foi o credentialId, tenta de novo
        if (await this.prisma.certificate.findFirst({ where: target, select: { certificateId: true } })) return null;
      }
    }
    return null;
  }

  /** Chamado pela conclusão do curso (depois do commit). Nunca lança. */
  async issueForCourse(userId: string, courseId: string): Promise<void> {
    try {
      const course = await this.prisma.course.findUnique({ where: { courseId }, select: { title: true, duration: true } });
      if (!course) return;
      const cert = await this.issue({ userId, courseId }, course.duration ?? 0, { kind: 'course', title: course.title });
      if (cert) await this.notifyIssued(userId, cert.certificateId, course.title);
    } catch (err) {
      this.logger.error(`Falha ao emitir certificado (curso ${courseId}, utilizador ${userId})`, err instanceof Error ? err.stack : String(err));
    }
  }

  /** Emite para todos os participantes com presença. Só o organizador/admin; o evento tem de estar concluído. */
  async issueForEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { eventId }, select: { eventId: true, title: true, organizerId: true, status: true, startDate: true, endDate: true } });
    if (!event) throw new NotFoundException({ message: 'Evento não encontrado', code: 'EVENT_NOT_FOUND' });
    if (user.role !== UserRole.admin && event.organizerId !== user.userId) throw new ForbiddenException('Só o organizador pode emitir certificados');
    if (event.status !== 'completed') throw new BadRequestException({ message: 'O evento ainda não foi concluído', code: 'EVENT_NOT_COMPLETED' });
    const hours = event.endDate ? Math.max(0, Math.round(((event.endDate.getTime() - event.startDate.getTime()) / 3_600_000) * 10) / 10) : 0;
    const parts = await this.prisma.eventParticipant.findMany({
      where: { eventId, attended: true, status: { in: [EventParticipantStatus.registered, EventParticipantStatus.attended] } }, select: { userId: true },
    });
    let issued = 0;
    for (const p of parts) {
      const cert = await this.issue({ userId: p.userId, eventId }, hours, { kind: 'event', title: event.title });
      if (cert) { issued++; void this.notifyIssued(p.userId, cert.certificateId, event.title); }
    }
    return { success: true, data: { attendees: parts.length, issued, alreadyIssued: parts.length - issued } };
  }

  private notifyIssued(userId: string, certificateId: string, title: string) {
    return this.notifications.notify(userId, NotificationType.CERTIFICATE_ISSUED, {
      title: 'Certificado disponível', message: `O seu certificado de "${title}" já pode ser descarregado.`, relatedEntityId: certificateId,
    });
  }

  // ── Consulta ─────────────────────────────────────────────────────────────

  async mine(user: AuthUser, q: ListCertificatesQueryDto) {
    const where: Prisma.CertificateWhereInput = { userId: user.userId };
    const [rows, total] = await Promise.all([
      this.prisma.certificate.findMany({ where, orderBy: { issueDate: 'desc' }, skip: skipOf(q), take: q.limit, select: ROW }),
      this.prisma.certificate.count({ where }),
    ]);
    // O filtro por estado é aplicado sobre o estado derivado (expired), por isso depois de ler.
    const shaped = rows.map((r) => this.shape(r)).filter((r) => !q.status || r.status === q.status);
    return paginated(shaped, q.status ? shaped.length : total, q);
  }

  /** Público: confirma a autenticidade sem expor email nem dados pessoais para além do nome. */
  async verify(credentialId: string) {
    const c = await this.prisma.certificate.findUnique({
      where: { credentialId: credentialId.toUpperCase() },
      select: { credentialId: true, issueDate: true, expirationDate: true, hours: true, status: true, user: { select: WHO }, course: { select: { title: true } }, event: { select: { title: true } } },
    });
    if (!c) throw new NotFoundException({ message: 'Certificado não encontrado', code: 'CERTIFICATE_NOT_FOUND' });
    const status = statusOf(c);
    return {
      success: true,
      data: {
        valid: status === CertificateStatus.issued, status, credentialId: c.credentialId, holder: displayName(c.user), kind: c.course ? 'course' : 'event',
        title: c.course?.title ?? c.event?.title ?? '', hours: Number(c.hours), issueDate: c.issueDate, expirationDate: c.expirationDate,
      },
    };
  }

  /** Dono, admin ou gestor do curso/organizador do evento. */
  async download(user: AuthUser, certificateId: string) {
    const c = await this.prisma.certificate.findUnique({
      where: { certificateId },
      include: { user: { select: WHO }, course: { select: { title: true, instructorId: true, organizerId: true } }, event: { select: { title: true, organizerId: true } } },
    });
    if (!c) throw new NotFoundException({ message: 'Certificado não encontrado', code: 'CERTIFICATE_NOT_FOUND' });
    const allowed = c.userId === user.userId || user.role === UserRole.admin || (c.course && canManage(user, c.course)) || c.event?.organizerId === user.userId;
    if (!allowed) throw new ForbiddenException('Sem acesso a este certificado');
    const status = statusOf(c);
    if (status === CertificateStatus.revoked) throw new ForbiddenException({ message: 'Certificado revogado', code: 'CERTIFICATE_REVOKED' });
    const pdf = await renderCertificatePdf({
      holder: displayName(c.user), title: c.course?.title ?? c.event?.title ?? '', kind: c.course ? 'course' : 'event', hours: Number(c.hours),
      issuedAt: c.issueDate, credentialId: c.credentialId, verificationUrl: c.verificationUrl, appName: this.appName,
    });
    return { pdf, filename: `certificado-${c.credentialId}.pdf` };
  }

  async revoke(user: AuthUser, certificateId: string, reason: string) {
    const c = await this.prisma.certificate.findUnique({
      where: { certificateId }, include: { course: { select: { instructorId: true, organizerId: true, title: true } }, event: { select: { organizerId: true, title: true } } },
    });
    if (!c) throw new NotFoundException({ message: 'Certificado não encontrado', code: 'CERTIFICATE_NOT_FOUND' });
    const allowed = user.role === UserRole.admin || (c.course && canManage(user, c.course)) || c.event?.organizerId === user.userId;
    if (!allowed) throw new ForbiddenException('Sem permissão para revogar este certificado');
    const { count } = await this.prisma.certificate.updateMany({
      where: { certificateId, status: { not: CertificateStatus.revoked } },
      data: { status: CertificateStatus.revoked, metadata: { ...(c.metadata as object | null), revokedReason: reason, revokedBy: user.userId, revokedAt: new Date().toISOString() } },
    });
    if (!count) throw new ConflictException({ message: 'O certificado já está revogado', code: 'ALREADY_REVOKED' });
    void this.notifications.notify(c.userId, NotificationType.CERTIFICATE_REVOKED, {
      title: 'Certificado revogado', message: `O certificado de "${c.course?.title ?? c.event?.title}" foi revogado: ${reason}`, relatedEntityId: certificateId,
    });
    return { success: true, message: 'Certificado revogado' };
  }
}
