import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEntityType, ActivityType, GroupTaskStatus, NotificationType, Prisma } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTaskDto, CreateTaskDto, ListTasksQueryDto, MyAssignmentDto, UpdateTaskDto } from './dto/group-work.dto';
import { GroupCtx, groupContext, requireMember } from './study-group-access';
import { POINTS, award } from './study-group-score';
import { StudyGroupsService } from './study-groups.service';

const USER_MIN = { userId: true, username: true, avatarUrl: true } as const;
const TASK_INCLUDE = {
  creator: { select: USER_MIN },
  assignments: { select: { status: true, createdAt: true, updatedAt: true, user: { select: USER_MIN } } },
} satisfies Prisma.GroupTaskInclude;

type TaskRow = Prisma.GroupTaskGetPayload<{ include: typeof TASK_INCLUDE }>;

const shape = (t: TaskRow, userId: string) => {
  const { assignments, ...rest } = t;
  const mine = assignments.find((a) => a.user.userId === userId);
  const active = assignments.filter((a) => a.status !== 'rejected');
  return {
    ...rest,
    assignees: assignments.map((a) => ({ ...a.user, status: a.status })),
    progress: { done: active.filter((a) => a.status === 'completed').length, total: active.length },
    myAssignment: mine ? mine.status : null,
    overdue: !!t.deadline && t.deadline < new Date() && t.status !== 'completed' && t.status !== 'archived',
  };
};

@Injectable()
export class StudyGroupTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: StudyGroupsService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  private async task(groupId: string, taskId: string) {
    const t = await this.prisma.groupTask.findFirst({ where: { taskId, groupId }, include: TASK_INCLUDE });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    return t;
  }

  private requireManager(ctx: GroupCtx) {
    if (!ctx.canManage) throw new ForbiddenException('Somente líderes e co-líderes gerem tarefas');
    if (ctx.group.status !== 'active') throw new BadRequestException('O grupo não está activo');
  }

  /** Só membros activos (não silenciados/banidos) podem receber tarefas. */
  private async validAssignees(groupId: string, ids: string[]) {
    const rows = await this.prisma.studyGroupMember.findMany({ where: { groupId, userId: { in: ids }, status: 'active' }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async list(user: AuthUser, groupId: string, q: ListTasksQueryDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const where: Prisma.GroupTaskWhereInput = {
      groupId,
      // arquivadas só aparecem quando pedidas
      status: q.status ?? { not: 'archived' },
      ...(q.priority && { priority: q.priority }),
      ...(q.assignedToMe && { assignments: { some: { userId: user.userId } } }),
      ...(q.search && { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const orderBy: Prisma.GroupTaskOrderByWithRelationInput[] =
      q.sort === 'recent' ? [{ createdAt: 'desc' }] : q.sort === 'priority' ? [{ priority: 'desc' }, { deadline: { sort: 'asc', nulls: 'last' } }] : [{ deadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.groupTask.findMany({ where, orderBy, skip: skipOf(q), take: q.limit, include: TASK_INCLUDE }),
      this.prisma.groupTask.count({ where }),
    ]);
    return paginated(rows.map((t) => shape(t, user.userId)), total, q);
  }

  async detail(user: AuthUser, groupId: string, taskId: string) {
    requireMember(await groupContext(this.prisma, groupId, user));
    return { success: true, data: shape(await this.task(groupId, taskId), user.userId) };
  }

  async create(user: AuthUser, groupId: string, dto: CreateTaskDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireManager(ctx);
    if (dto.deadline && dto.deadline <= new Date()) throw new BadRequestException('O prazo deve ser no futuro');
    const assignees = dto.assigneeIds?.length ? await this.validAssignees(groupId, dto.assigneeIds) : [];
    if (dto.assigneeIds && assignees.length !== dto.assigneeIds.length) throw new BadRequestException('Todos os responsáveis têm de ser membros activos do grupo');

    const { assigneeIds: _ignored, ...data } = dto;
    const created = await this.prisma.groupTask.create({
      data: {
        ...data, groupId, creatorId: user.userId, assignerId: assignees.length ? user.userId : null,
        assignments: { create: assignees.map((userId) => ({ userId, assignedById: user.userId })) },
      },
      include: TASK_INCLUDE,
    });
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.task_created, entityType: ActivityEntityType.group_task, entityId: created.taskId, metadata: { title: created.title } });
    await this.notifications.notifyMany(assignees.filter((u) => u !== user.userId), NotificationType.STUDY_GROUP_TASK_ASSIGNED, {
      title: 'Nova tarefa atribuída', message: `Foi-lhe atribuída a tarefa "${created.title}" no grupo "${ctx.group.name}".`, relatedEntityId: created.taskId,
    });
    await this.groups.notifyMembers(groupId, user.userId, NotificationType.STUDY_GROUP_TASK_CREATED, 'Nova tarefa', `Nova tarefa no grupo "${ctx.group.name}": ${created.title}`);
    return { success: true, data: shape(created, user.userId) };
  }

  async update(user: AuthUser, groupId: string, taskId: string, dto: UpdateTaskDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireManager(ctx);
    const t = await this.task(groupId, taskId);
    if (dto.deadline && dto.deadline <= new Date() && dto.deadline.getTime() !== t.deadline?.getTime()) throw new BadRequestException('O prazo deve ser no futuro');
    if (t.status === 'archived' && dto.status === undefined && Object.keys(dto).length) throw new BadRequestException('Tarefa arquivada: reponha o estado antes de editar');
    const updated = await this.prisma.groupTask.update({ where: { taskId }, data: dto, include: TASK_INCLUDE });
    const ids = updated.assignments.map((a) => a.user.userId).filter((u) => u !== user.userId);
    if (dto.status && dto.status !== t.status) {
      await this.notifications.notifyMany(ids, NotificationType.STUDY_GROUP_TASK_STATUS_CHANGED, { title: 'Estado da tarefa alterado', message: `A tarefa "${updated.title}" passou a "${dto.status}".`, relatedEntityId: taskId });
    } else if (dto.title || dto.deadline || dto.description || dto.priority) {
      await this.notifications.notifyMany(ids, NotificationType.STUDY_GROUP_TASK_UPDATED, { title: 'Tarefa actualizada', message: `A tarefa "${updated.title}" foi actualizada.`, relatedEntityId: taskId });
    }
    return { success: true, data: shape(updated, user.userId) };
  }

  async remove(user: AuthUser, groupId: string, taskId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canManage) throw new ForbiddenException('Somente líderes e co-líderes gerem tarefas');
    const t = await this.task(groupId, taskId);
    await this.prisma.$transaction(async (tx) => {
      // devolve os pontos das tarefas já concluídas
      for (const a of t.assignments.filter((x) => x.status === 'completed')) await award(tx, groupId, a.user.userId, -POINTS.task);
      await tx.groupTask.delete({ where: { taskId } });
    });
    await this.notifications.notifyMany(t.assignments.map((a) => a.user.userId).filter((u) => u !== user.userId), NotificationType.STUDY_GROUP_TASK_DELETED, { title: 'Tarefa removida', message: `A tarefa "${t.title}" foi removida.`, relatedEntityId: groupId });
    return { success: true, message: 'Tarefa apagada' };
  }

  async assign(user: AuthUser, groupId: string, taskId: string, dto: AssignTaskDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireManager(ctx);
    const t = await this.task(groupId, taskId);
    if (t.status === 'archived') throw new BadRequestException('Tarefa arquivada');
    const valid = new Set(await this.validAssignees(groupId, dto.userIds));
    const existing = new Set(t.assignments.map((a) => a.user.userId));
    const assigned: string[] = []; const skipped: { userId: string; reason: string }[] = [];
    for (const id of dto.userIds) {
      if (existing.has(id)) skipped.push({ userId: id, reason: 'Já atribuída' });
      else if (!valid.has(id)) skipped.push({ userId: id, reason: 'Não é membro activo' });
      else assigned.push(id);
    }
    if (assigned.length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.taskAssignment.createMany({ data: assigned.map((userId) => ({ taskId, userId, assignedById: user.userId })), skipDuplicates: true });
        await tx.groupTask.update({ where: { taskId }, data: { assignerId: user.userId } });
        // novo responsável por concluir => a tarefa concluída volta a estar em curso
        await this.syncStatus(tx, taskId);
      });
      await this.notifications.notifyMany(assigned.filter((u) => u !== user.userId), NotificationType.STUDY_GROUP_TASK_ASSIGNED, { title: 'Nova tarefa atribuída', message: `Foi-lhe atribuída a tarefa "${t.title}".`, relatedEntityId: taskId });
    }
    return { success: true, data: { assigned, skipped, task: shape(await this.task(groupId, taskId), user.userId) } };
  }

  async unassign(user: AuthUser, groupId: string, taskId: string, userId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    this.requireManager(ctx);
    const t = await this.task(groupId, taskId);
    const a = t.assignments.find((x) => x.user.userId === userId);
    if (!a) throw new NotFoundException('Esse membro não tem esta tarefa');
    await this.prisma.$transaction(async (tx) => {
      if (a.status === 'completed') await award(tx, groupId, userId, -POINTS.task);
      await tx.taskAssignment.delete({ where: { taskId_userId: { taskId, userId } } });
      await this.syncStatus(tx, taskId);
    });
    return { success: true, message: 'Responsável removido' };
  }

  /** O responsável actualiza a sua própria parte. Fecha a tarefa quando todos concluem. */
  async updateMine(user: AuthUser, groupId: string, taskId: string, dto: MyAssignmentDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canWrite) throw new ForbiddenException('Sem permissão para actualizar tarefas');
    if (ctx.group.status !== 'active') throw new BadRequestException('O grupo não está activo');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM group_tasks WHERE "taskId" = ${taskId}::uuid AND "groupId" = ${groupId}::uuid FOR UPDATE`;
      const t = await tx.groupTask.findFirst({ where: { taskId, groupId } });
      if (!t) throw new NotFoundException('Tarefa não encontrada');
      if (t.status === 'archived') throw new BadRequestException('Tarefa arquivada');
      const a = await tx.taskAssignment.findUnique({ where: { taskId_userId: { taskId, userId: user.userId } } });
      if (!a) throw new ForbiddenException('Esta tarefa não lhe foi atribuída');
      if (a.status !== dto.status) {
        await tx.taskAssignment.update({ where: { assignmentId: a.assignmentId }, data: { status: dto.status } });
        if (dto.status === 'completed') await award(tx, groupId, user.userId, POINTS.task);
        else if (a.status === 'completed') await award(tx, groupId, user.userId, -POINTS.task);
      }
      const status = await this.syncStatus(tx, taskId);
      return { task: t, before: t.status, status, changed: a.status !== dto.status, prev: a.status };
    });
    if (result.changed) {
      if (dto.status === 'completed') await this.activity.log({ userId: user.userId, groupId, type: ActivityType.task_completed, entityType: ActivityEntityType.group_task, entityId: taskId, metadata: { title: result.task.title } });
      // desfazer a conclusão apaga o registo: relatórios não contam tarefas que já não estão feitas
      else if (result.prev === 'completed') await this.prisma.activity.deleteMany({ where: { userId: user.userId, groupId, type: ActivityType.task_completed, entityId: taskId } });
      const me = await this.prisma.user.findUnique({ where: { userId: user.userId }, select: { username: true } });
      const notify = [result.task.creatorId, result.task.assignerId].filter((u): u is string => !!u && u !== user.userId);
      await this.notifications.notifyMany(notify, NotificationType.STUDY_GROUP_TASK_STATUS_CHANGED, {
        title: 'Progresso numa tarefa', message: `${me?.username ?? 'Um membro'} marcou "${result.task.title}" como ${dto.status}${result.status === 'completed' ? ' (tarefa concluída)' : ''}.`, relatedEntityId: taskId,
      });
    }
    return { success: true, data: shape(await this.task(groupId, taskId), user.userId) };
  }

  /** pending/in_progress/completed derivados das partes dos responsáveis (arquivada fica como está). */
  private async syncStatus(tx: Prisma.TransactionClient, taskId: string): Promise<GroupTaskStatus> {
    const t = await tx.groupTask.findUniqueOrThrow({ where: { taskId }, include: { assignments: { select: { status: true } } } });
    if (t.status === 'archived') return t.status;
    const active = t.assignments.filter((a) => a.status !== 'rejected');
    if (!active.length) return t.status;
    const done = active.filter((a) => a.status === 'completed').length;
    const next: GroupTaskStatus = done === active.length ? 'completed' : done > 0 || t.status === 'completed' ? 'in_progress' : t.status;
    if (next !== t.status) await tx.groupTask.update({ where: { taskId }, data: { status: next } });
    return next;
  }
}
