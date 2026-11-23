import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, EnrollmentStatus, NotificationType, Prisma, SubmissionFormat, SubmissionStatus, UserRole } from '@prisma/client';
import { extname } from 'node:path';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { canManage, getManageableCourse } from '../courses/course-access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateAssignmentDto, GradeSubmissionDto, ListAssignmentsQueryDto, ListSubmissionsQueryDto, UpdateAssignmentDto } from './dto/assignment.dto';

const S = AssignmentStatus;
const DEFAULT_TYPES = ['pdf', 'docx', 'zip'];
const STUDENT_VISIBLE: AssignmentStatus[] = [S.published, S.closed];
const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const round2 = (n: number) => Math.round(n * 100) / 100;

const STUDENT = { userId: true, username: true, fullName: true, avatarUrl: true } as const;
const SUB_SELECT = {
  submissionId: true, assignmentId: true, userId: true, content: true, attachmentUrl: true, grade: true, feedback: true,
  status: true, isLate: true, submittedAt: true, updatedAt: true,
} as const;
type SubRow = Prisma.SubmissionGetPayload<{ select: typeof SUB_SELECT }>;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  private view<T extends { grade: number | null }>(s: T & { attachmentUrl: string | null }, maxScore: number) {
    return { ...s, attachmentUrl: this.storage.readableUrl(s.attachmentUrl), gradePercentage: s.grade === null ? null : round2((s.grade / maxScore) * 100) };
  }

  // ── Gestão (instrutor / instituição organizadora / admin) ────────────────

  /** Valida que módulo/aula pertencem ao curso. */
  private async assertPlacement(courseId: string, moduleId?: string | null, lessonId?: string | null) {
    if (moduleId && !(await this.prisma.module.findFirst({ where: { moduleId, courseId }, select: { moduleId: true } }))) {
      throw new BadRequestException({ message: 'O módulo não pertence a este curso', code: 'INVALID_MODULE' });
    }
    if (lessonId && !(await this.prisma.lesson.findFirst({ where: { lessonId, module: { courseId } }, select: { lessonId: true } }))) {
      throw new BadRequestException({ message: 'A aula não pertence a este curso', code: 'INVALID_LESSON' });
    }
  }

  private assertFuture(d?: Date | null) {
    if (d && Number.isNaN(d.getTime())) throw new BadRequestException({ message: 'Data inválida', code: 'INVALID_DUE_DATE' });
  }

  async create(user: AuthUser, courseId: string, dto: CreateAssignmentDto) {
    const course = await getManageableCourse(this.prisma, courseId, user);
    this.assertFuture(dto.dueDate);
    await this.assertPlacement(courseId, dto.moduleId, dto.lessonId);
    const status = dto.status ?? S.draft;
    const a = await this.prisma.assignment.create({
      data: {
        courseId, title: dto.title, description: dto.description, dueDate: dto.dueDate, maxScore: dto.maxScore ?? 100,
        status, isPublished: status === S.published, allowLateSubmissions: dto.allowLateSubmissions ?? false, latePenalty: dto.latePenalty ?? 0,
        submissionFormat: dto.submissionFormat ?? SubmissionFormat.both, allowedFileTypes: dto.allowedFileTypes ?? DEFAULT_TYPES,
        moduleId: dto.moduleId, lessonId: dto.lessonId,
      },
    });
    if (status === S.published) void this.notifyStudents(courseId, course.title, a, NotificationType.COURSE_ASSIGNMENT_CREATED, 'Novo trabalho');
    return { success: true, data: a };
  }

  private async getManageable(user: AuthUser, assignmentId: string) {
    const a = await this.prisma.assignment.findUnique({ where: { assignmentId }, include: { course: { select: { courseId: true, title: true, instructorId: true, organizerId: true } } } });
    if (!a) throw new NotFoundException({ message: 'Trabalho não encontrado', code: 'ASSIGNMENT_NOT_FOUND' });
    if (!canManage(user, a.course)) throw new ForbiddenException('Você não tem permissão para gerir este trabalho');
    return a;
  }

  async update(user: AuthUser, assignmentId: string, dto: UpdateAssignmentDto) {
    const cur = await this.getManageable(user, assignmentId);
    if (Object.values(dto).every((v) => v === undefined)) throw new BadRequestException({ message: 'Nada para atualizar', code: 'NO_CHANGES' });
    this.assertFuture(dto.dueDate);
    await this.assertPlacement(cur.courseId, dto.moduleId, dto.lessonId);
    if (dto.maxScore !== undefined && dto.maxScore < cur.maxScore) {
      const over = await this.prisma.submission.count({ where: { assignmentId, grade: { gt: dto.maxScore } } });
      if (over) throw new ConflictException({ message: 'Existem notas superiores ao novo máximo', code: 'SCORE_BELOW_GRADES' });
    }
    const { status, ...rest } = dto;
    const a = await this.prisma.assignment.update({
      where: { assignmentId },
      data: { ...rest, ...(status !== undefined && { status, isPublished: status === S.published }) },
    });
    if (status === S.published && cur.status !== S.published && cur.status === S.draft) {
      void this.notifyStudents(cur.courseId, cur.course.title, a, NotificationType.COURSE_ASSIGNMENT_CREATED, 'Novo trabalho');
    } else if (a.status === S.published && (dto.dueDate !== undefined || dto.title !== undefined || dto.maxScore !== undefined)) {
      void this.notifyStudents(cur.courseId, cur.course.title, a, NotificationType.COURSE_ASSIGNMENT_UPDATED, 'Trabalho atualizado');
    }
    return { success: true, data: a };
  }

  async remove(user: AuthUser, assignmentId: string) {
    await this.getManageable(user, assignmentId);
    // Não se apagam entregas dos alunos por engano: fechar o trabalho preserva o histórico.
    const subs = await this.prisma.submission.findMany({ where: { assignmentId }, select: { attachmentUrl: true } });
    if (subs.length) throw new ConflictException({ message: 'O trabalho já tem entregas; feche-o em vez de o apagar', code: 'HAS_SUBMISSIONS' });
    await this.prisma.assignment.delete({ where: { assignmentId } });
    return { success: true, message: 'Trabalho eliminado' };
  }

  async listForCourse(user: AuthUser, courseId: string, q: ListAssignmentsQueryDto) {
    await getManageableCourse(this.prisma, courseId, user);
    return this.listWhere({ courseId, ...(q.status && { status: q.status }) }, q);
  }

  /** Todos os trabalhos dos cursos que gere (admin: todos). */
  async managed(user: AuthUser, q: ListAssignmentsQueryDto) {
    const scope: Prisma.AssignmentWhereInput = user.role === UserRole.admin ? {} : { course: { OR: [{ instructorId: user.userId }, { organizerId: user.userId }] } };
    return this.listWhere({ ...scope, ...(q.courseId && { courseId: q.courseId }), ...(q.status && { status: q.status }) }, q);
  }

  private async listWhere(where: Prisma.AssignmentWhereInput, q: ListAssignmentsQueryDto) {
    const [rows, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where, orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], skip: skipOf(q), take: q.limit,
        include: { course: { select: { courseId: true, title: true } }, _count: { select: { submissions: true } } },
      }),
      this.prisma.assignment.count({ where }),
    ]);
    const ids = rows.map((r) => r.assignmentId);
    const graded = ids.length
      ? await this.prisma.submission.groupBy({ by: ['assignmentId'], where: { assignmentId: { in: ids }, status: SubmissionStatus.graded }, _count: { _all: true } })
      : [];
    const g = new Map(graded.map((x) => [x.assignmentId, x._count._all]));
    return paginated(rows.map(({ _count, ...a }) => ({ ...a, submissionsCount: _count.submissions, gradedCount: g.get(a.assignmentId) ?? 0 })), total, q);
  }

  async submissions(user: AuthUser, assignmentId: string, q: ListSubmissionsQueryDto) {
    const a = await this.getManageable(user, assignmentId);
    const where: Prisma.SubmissionWhereInput = { assignmentId, ...(q.status && { status: q.status }) };
    const [rows, total, agg, enrolled] = await Promise.all([
      this.prisma.submission.findMany({ where, orderBy: { submittedAt: 'desc' }, skip: skipOf(q), take: q.limit, select: { ...SUB_SELECT, student: { select: STUDENT } } }),
      this.prisma.submission.count({ where }),
      this.prisma.submission.aggregate({ where: { assignmentId, status: SubmissionStatus.graded }, _avg: { grade: true }, _count: { _all: true } }),
      this.prisma.enrollment.count({ where: { courseId: a.courseId, status: { not: EnrollmentStatus.canceled } } }),
    ]);
    const res = paginated(rows.map((r) => this.view(r, a.maxScore)), total, q);
    return { ...res, stats: { enrolled, graded: agg._count._all, averageGrade: agg._avg.grade === null ? null : round2(agg._avg.grade) }, assignment: { assignmentId, title: a.title, maxScore: a.maxScore } };
  }

  async grade(user: AuthUser, submissionId: string, dto: GradeSubmissionDto) {
    const sub = await this.prisma.submission.findUnique({ where: { submissionId }, include: { assignment: { include: { course: { select: { title: true, instructorId: true, organizerId: true } } } } } });
    if (!sub) throw new NotFoundException({ message: 'Entrega não encontrada', code: 'SUBMISSION_NOT_FOUND' });
    if (!canManage(user, sub.assignment.course)) throw new ForbiddenException('Você não tem permissão para avaliar esta entrega');
    if (sub.status === SubmissionStatus.draft) throw new BadRequestException({ message: 'A entrega ainda não foi submetida', code: 'NOT_SUBMITTED' });
    const max = sub.assignment.maxScore;
    if (dto.grade > max) throw new BadRequestException({ message: `A nota não pode exceder ${max}`, code: 'GRADE_OUT_OF_RANGE' });

    const penalty = sub.isLate ? sub.assignment.latePenalty : 0;
    const final = round2(dto.grade * (1 - penalty / 100));
    // Optimista: se o aluno voltou a entregar entretanto (updatedAt mudou), a nota não se aplica à versão nova.
    const { count } = await this.prisma.submission.updateMany({
      where: { submissionId, updatedAt: sub.updatedAt },
      data: { grade: final, feedback: dto.feedback === undefined ? sub.feedback : dto.feedback || null, status: SubmissionStatus.graded },
    });
    if (!count) throw new ConflictException({ message: 'A entrega foi alterada pelo aluno; reveja antes de avaliar', code: 'SUBMISSION_CHANGED' });

    const updated = await this.prisma.submission.findUniqueOrThrow({ where: { submissionId }, select: SUB_SELECT });
    void this.notifications.notify(sub.userId, NotificationType.COURSE_ASSIGNMENT_GRADED, {
      title: 'Trabalho avaliado', message: `"${sub.assignment.title}": ${final}/${max}.`, relatedEntityId: sub.assignmentId,
      metadata: { submissionId, courseId: sub.assignment.courseId },
    });
    return { success: true, data: { ...this.view(updated, max), rawGrade: dto.grade, penaltyApplied: penalty } };
  }

  // ── Aluno ────────────────────────────────────────────────────────────────

  async mine(user: AuthUser, courseId: string) {
    const enr = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.userId, courseId } }, select: { status: true } });
    if (!enr || enr.status === EnrollmentStatus.canceled) throw new ForbiddenException({ message: 'Não está inscrito neste curso', code: 'NOT_ENROLLED' });
    const rows = await this.prisma.assignment.findMany({
      where: { courseId, status: { in: STUDENT_VISIBLE } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: {
        assignmentId: true, title: true, description: true, dueDate: true, maxScore: true, status: true, allowLateSubmissions: true, latePenalty: true,
        submissionFormat: true, allowedFileTypes: true, moduleId: true, lessonId: true,
        submissions: { where: { userId: user.userId }, select: SUB_SELECT },
      },
    });
    const now = Date.now();
    return {
      success: true,
      data: rows.map(({ submissions, ...a }) => {
        const s = submissions[0] ? this.view(submissions[0], a.maxScore) : null;
        const overdue = !s && !!a.dueDate && a.dueDate.getTime() < now;
        return { ...a, submission: s, state: s ? s.status : overdue ? 'overdue' : 'pending', canSubmit: a.status === S.published && (!s || s.status !== SubmissionStatus.graded) && (!overdue || a.allowLateSubmissions) };
      }),
    };
  }

  async submit(user: AuthUser, assignmentId: string, content: string | undefined, file?: Express.Multer.File) {
    const a = await this.prisma.assignment.findUnique({ where: { assignmentId } });
    if (!a || a.status === S.draft) throw new NotFoundException({ message: 'Trabalho não encontrado', code: 'ASSIGNMENT_NOT_FOUND' });
    const enr = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.userId, courseId: a.courseId } }, select: { status: true } });
    if (!enr || enr.status === EnrollmentStatus.canceled) throw new ForbiddenException({ message: 'Não está inscrito neste curso', code: 'NOT_ENROLLED' });
    if (a.status === S.closed) throw new ForbiddenException({ message: 'O trabalho está fechado', code: 'ASSIGNMENT_CLOSED' });

    const now = new Date();
    const isLate = !!a.dueDate && a.dueDate < now;
    if (isLate && !a.allowLateSubmissions) throw new ForbiddenException({ message: 'O prazo de entrega terminou', code: 'DEADLINE_PASSED' });

    const existing = await this.prisma.submission.findUnique({ where: { assignmentId_userId: { assignmentId, userId: user.userId } }, select: { ...SUB_SELECT } });
    if (existing?.status === SubmissionStatus.graded) throw new ConflictException({ message: 'A entrega já foi avaliada e não pode ser alterada', code: 'ALREADY_GRADED' });

    // Formato: o que a entrega final (nova ou anterior) contém tem de cumprir o pedido.
    const text = content?.trim() ? content.trim() : (existing?.content ?? undefined);
    const hasFile = !!file || !!existing?.attachmentUrl;
    if (a.submissionFormat === SubmissionFormat.text && file) throw new BadRequestException({ message: 'Este trabalho só aceita texto', code: 'FILE_NOT_ALLOWED' });
    if (a.submissionFormat === SubmissionFormat.file && content?.trim()) throw new BadRequestException({ message: 'Este trabalho só aceita ficheiro', code: 'TEXT_NOT_ALLOWED' });
    if (a.submissionFormat === SubmissionFormat.text && !text) throw new BadRequestException({ message: 'O texto é obrigatório', code: 'CONTENT_REQUIRED' });
    if (a.submissionFormat === SubmissionFormat.file && !hasFile) throw new BadRequestException({ message: 'O ficheiro é obrigatório', code: 'FILE_REQUIRED' });
    if (a.submissionFormat === SubmissionFormat.both && !text && !hasFile) throw new BadRequestException({ message: 'Envie texto ou um ficheiro', code: 'EMPTY_SUBMISSION' });
    if (file) {
      const ext = extname(file.originalname).slice(1).toLowerCase();
      if (!a.allowedFileTypes.map((t) => t.toLowerCase()).includes(ext)) {
        throw new BadRequestException({ message: `Tipo de ficheiro não permitido (aceites: ${a.allowedFileTypes.join(', ')})`, code: 'FILE_TYPE_NOT_ALLOWED' });
      }
    }

    const uploaded = file ? await this.storage.upload(file, { folder: `courses/${a.courseId}/submissions/${assignmentId}`, resourceType: 'raw', private: true }) : null;
    const data = {
      content: text ?? null, attachmentUrl: uploaded?.url ?? existing?.attachmentUrl ?? null, isLate,
      status: isLate ? SubmissionStatus.late : SubmissionStatus.submitted, submittedAt: now, grade: null, feedback: null,
    };
    let saved: SubRow;
    try {
      saved = await this.prisma.submission.create({ data: { assignmentId, userId: user.userId, ...data }, select: SUB_SELECT });
    } catch (e) {
      if (!isP2002(e)) { if (uploaded) void this.storage.remove(uploaded.key, { resourceType: 'raw', private: true }); throw e; }
      // Já existia (ou o aluno carregou duas vezes em simultâneo): substitui, desde que ainda não esteja avaliada.
      const { count } = await this.prisma.submission.updateMany({ where: { assignmentId, userId: user.userId, status: { not: SubmissionStatus.graded } }, data });
      if (!count) {
        if (uploaded) void this.storage.remove(uploaded.key, { resourceType: 'raw', private: true });
        throw new ConflictException({ message: 'A entrega já foi avaliada e não pode ser alterada', code: 'ALREADY_GRADED' });
      }
      saved = await this.prisma.submission.findUniqueOrThrow({ where: { assignmentId_userId: { assignmentId, userId: user.userId } }, select: SUB_SELECT });
    }
    if (uploaded && existing?.attachmentUrl && existing.attachmentUrl !== uploaded.url) void this.storage.removeByUrl(existing.attachmentUrl);

    void this.notifySubmitted(a, user.userId, saved.submissionId, isLate, !!existing);
    return { success: true, data: this.view(saved, a.maxScore) };
  }

  async submissionDetails(user: AuthUser, submissionId: string) {
    const s = await this.prisma.submission.findUnique({
      where: { submissionId },
      select: { ...SUB_SELECT, student: { select: STUDENT }, assignment: { select: { assignmentId: true, title: true, maxScore: true, courseId: true, course: { select: { instructorId: true, organizerId: true } } } } },
    });
    if (!s) throw new NotFoundException({ message: 'Entrega não encontrada', code: 'SUBMISSION_NOT_FOUND' });
    if (s.userId !== user.userId && !canManage(user, s.assignment.course)) throw new ForbiddenException('Sem acesso a esta entrega');
    const { assignment, ...rest } = s;
    return { success: true, data: { ...this.view(rest, assignment.maxScore), assignment: { assignmentId: assignment.assignmentId, title: assignment.title, maxScore: assignment.maxScore, courseId: assignment.courseId } } };
  }

  // ── Notificações (efeitos secundários, depois do commit) ─────────────────

  private async notifyStudents(courseId: string, courseTitle: string, a: { assignmentId: string; title: string; dueDate: Date | null }, type: NotificationType, label: string) {
    const rows = await this.prisma.enrollment.findMany({ where: { courseId, status: EnrollmentStatus.active }, select: { userId: true } });
    const due = a.dueDate ? ` Prazo: ${a.dueDate.toLocaleDateString('pt-PT', { timeZone: 'Africa/Maputo' })}.` : '';
    await this.notifications.notifyMany(rows.map((r) => r.userId), type, {
      title: `${label}: ${a.title}`.slice(0, 100), message: `Curso "${courseTitle}".${due}`, relatedEntityId: a.assignmentId, metadata: { courseId },
    });
  }

  private async notifySubmitted(a: { assignmentId: string; title: string; courseId: string }, studentId: string, submissionId: string, isLate: boolean, resubmitted: boolean) {
    const [course, student] = await Promise.all([
      this.prisma.course.findUnique({ where: { courseId: a.courseId }, select: { instructorId: true } }),
      this.prisma.user.findUnique({ where: { userId: studentId }, select: { username: true, fullName: true } }),
    ]);
    if (!course) return;
    await this.notifications.notify(course.instructorId, NotificationType.COURSE_ASSIGNMENT_SUBMITTED, {
      title: resubmitted ? 'Entrega atualizada' : 'Nova entrega',
      message: `${student?.fullName ?? student?.username ?? 'Um aluno'} entregou "${a.title}"${isLate ? ' (fora do prazo)' : ''}.`,
      relatedEntityId: a.assignmentId, metadata: { submissionId, courseId: a.courseId },
    });
  }
}
