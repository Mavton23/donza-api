import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityStatus, NotificationType, Prisma, StudyGroupPrivacy, StudyGroupStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { MEMBER_STATUSES } from '../communities/community-access';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateStudyGroupDto, ListStudyGroupsQueryDto, UpdateStudyGroupDto } from './dto/study-group.dto';
import { groupContext, requireMember, toApiRole } from './study-group-access';

const USER_MIN = { userId: true, username: true, avatarUrl: true } as const;
const COMMUNITY_MIN = { communityId: true, name: true, slug: true } as const;
const GROUP_MEMBER_WHERE: Prisma.StudyGroupMemberWhereInput = { status: { in: ['active', 'muted'] } };
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

export const newInviteCode = () => randomBytes(8).toString('hex');

/** { days?: string[], time?: 'HH:mm', timezone?: string, frequency?: string } — mantém só o conhecido. */
function cleanSchedule(s: Record<string, unknown>): Prisma.InputJsonObject {
  const out: Record<string, unknown> = {};
  if (s.days !== undefined) {
    if (!Array.isArray(s.days) || s.days.length > 7 || s.days.some((d) => typeof d !== 'string' || d.length > 12)) throw new BadRequestException('meetingSchedule.days inválido');
    out.days = s.days;
  }
  if (s.time !== undefined) {
    if (typeof s.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) throw new BadRequestException('meetingSchedule.time deve ser HH:mm');
    out.time = s.time;
  }
  for (const k of ['timezone', 'frequency'] as const) {
    if (s[k] !== undefined) {
      if (typeof s[k] !== 'string' || (s[k] as string).length > 40) throw new BadRequestException(`meetingSchedule.${k} inválido`);
      out[k] = s[k];
    }
  }
  const unknown = Object.keys(s).filter((k) => !['days', 'time', 'timezone', 'frequency'].includes(k));
  if (unknown.length) throw new BadRequestException(`meetingSchedule: chaves desconhecidas (${unknown.join(', ')})`);
  return out as Prisma.InputJsonObject;
}

@Injectable()
export class StudyGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  // ── Listagem ───────────────────────────────────────────────────────────────

  private communityVisibility(viewer?: AuthUser): Prisma.StudyGroupWhereInput {
    if (viewer?.role === UserRole.admin) return {};
    return {
      OR: [
        { communityId: null },
        { community: { deletedAt: null, isPublic: true } },
        ...(viewer ? [{ community: { deletedAt: null, members: { some: { userId: viewer.userId, status: { in: MEMBER_STATUSES } } } } }] : []),
      ],
    };
  }

  async list(viewer: AuthUser | undefined, q: ListStudyGroupsQueryDto) {
    if (q.mine && !viewer) throw new ForbiddenException('Inicie sessão para ver os seus grupos');
    const where: Prisma.StudyGroupWhereInput = {
      status: q.status ?? StudyGroupStatus.active,
      AND: [
        this.communityVisibility(viewer),
        ...(q.communityId ? [{ communityId: q.communityId }] : []),
        ...(q.privacy ? [{ privacy: q.privacy }] : []),
        ...(q.tag ? [{ tags: { has: q.tag.toLowerCase() } }] : []),
        ...(q.search ? [{ OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { description: { contains: q.search, mode: 'insensitive' as const } }] }] : []),
        ...(q.mine && viewer ? [{ members: { some: { userId: viewer.userId, ...GROUP_MEMBER_WHERE } } }] : []),
      ],
    };
    const orderBy: Prisma.StudyGroupOrderByWithRelationInput[] =
      q.sort === 'popular' ? [{ members: { _count: 'desc' } }, { createdAt: 'desc' }] : q.sort === 'name' ? [{ name: 'asc' }] : [{ createdAt: 'desc' }];

    const [rows, total] = await Promise.all([
      this.prisma.studyGroup.findMany({
        where, orderBy, skip: skipOf(q), take: q.limit,
        include: { creator: { select: USER_MIN }, community: { select: COMMUNITY_MIN }, _count: { select: { members: { where: GROUP_MEMBER_WHERE } } } },
      }),
      this.prisma.studyGroup.count({ where }),
    ]);
    const mine = viewer
      ? new Map((await this.prisma.studyGroupMember.findMany({ where: { userId: viewer.userId, groupId: { in: rows.map((r) => r.groupId) } }, select: { groupId: true, role: true, status: true } })).map((m) => [m.groupId, m]))
      : null;
    return paginated(
      rows.map(({ _count, inviteCode: _c, ...g }) => {
        const m = mine?.get(g.groupId);
        return {
          ...g,
          membersCount: _count.members,
          ...(mine && { viewer: { isMember: !!m && (m.status === 'active' || m.status === 'muted'), role: toApiRole(m?.role) } }),
        };
      }),
      total,
      q,
    );
  }

  // ── Detalhe ────────────────────────────────────────────────────────────────

  async getDetail(groupId: string, viewer?: AuthUser) {
    const ctx = await groupContext(this.prisma, groupId, viewer);
    const g = ctx.group;
    const [full, membersCount, pending] = await Promise.all([
      this.prisma.studyGroup.findUniqueOrThrow({ where: { groupId }, include: { creator: { select: USER_MIN } } }),
      this.prisma.studyGroupMember.count({ where: { groupId, ...GROUP_MEMBER_WHERE } }),
      viewer ? this.prisma.studyGroupPendingMember.findUnique({ where: { groupId_userId: { groupId, userId: viewer.userId } } }) : null,
    ]);
    const { inviteCode, ...base } = full;

    const members = ctx.isMember
      ? (await this.prisma.studyGroupMember.findMany({
          where: { groupId, ...GROUP_MEMBER_WHERE },
          orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
          take: 12,
          select: { role: true, joinedAt: true, user: { select: USER_MIN } },
        })).map((m) => ({ ...m.user, role: toApiRole(m.role), joinedAt: m.joinedAt }))
      : undefined;

    return {
      success: true,
      data: {
        ...base,
        community: g.community ? { communityId: g.community.communityId, name: g.community.name, slug: g.community.slug } : null,
        membersCount,
        spotsLeft: g.maxMembers == null ? null : Math.max(0, g.maxMembers - membersCount),
        ...(ctx.canManage && { inviteCode }),
        // Lista de membros só a membros (privacidade); quem não pertence vê o resumo.
        ...(members && { members }),
        viewer: {
          isMember: ctx.isMember,
          role: toApiRole(ctx.member?.role),
          status: ctx.status,
          joinedAt: ctx.member?.joinedAt ?? null,
          contributionScore: ctx.member?.contributionScore ?? 0,
          hasPendingRequest: !!pending && pending.status === 'pending' && !pending.isInvite,
          hasInvite: !!pending && pending.status === 'pending' && pending.isInvite,
          canManage: ctx.canManage,
          canModerate: ctx.canModerate,
          isCreator: viewer?.userId === g.creatorId,
        },
      },
    };
  }

  // ── Criar / editar / apagar ───────────────────────────────────────────────

  async create(user: AuthUser, dto: CreateStudyGroupDto, cover: Express.Multer.File | undefined) {
    if (dto.communityId) {
      const community = await this.prisma.community.findFirst({ where: { communityId: dto.communityId, deletedAt: null }, select: { status: true } });
      if (!community) throw new NotFoundException('Comunidade não encontrada');
      if (community.status !== CommunityStatus.active) throw new BadRequestException('Comunidade inactiva');
      const cm = await this.prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: dto.communityId, userId: user.userId } }, select: { status: true } });
      if (cm?.status !== 'active') throw new ForbiddenException('Você precisa ser membro ativo da comunidade');
    }
    const privacy = dto.privacy ?? StudyGroupPrivacy.public;
    const uploaded = cover && (await this.storage.upload(cover, { folder: `study-group-covers/${user.userId}`, resourceType: 'image' }));
    try {
      const group = await this.prisma.$transaction(async (tx) => {
        const g = await tx.studyGroup.create({
          data: {
            creatorId: user.userId,
            communityId: dto.communityId,
            name: dto.name,
            description: dto.description,
            goals: dto.goals,
            maxMembers: dto.maxMembers,
            tags: dto.tags ?? [],
            meetingSchedule: dto.meetingSchedule ? cleanSchedule(dto.meetingSchedule) : undefined,
            privacy,
            approvalRequired: privacy !== 'public' ? true : (dto.approvalRequired ?? false),
            inviteCode: privacy !== 'public' ? newInviteCode() : null,
            coverImageUrl: uploaded?.url,
          },
        });
        await tx.studyGroupMember.create({ data: { groupId: g.groupId, userId: user.userId, role: 'leader', joinMethod: 'direct', lastActiveAt: new Date() } });
        return g;
      });
      return { success: true, data: { ...group, membersCount: 1, isCreator: true } };
    } catch (err) {
      if (uploaded) await this.storage.remove(uploaded.key, { resourceType: 'image' });
      throw err;
    }
  }

  async update(user: AuthUser, groupId: string, dto: UpdateStudyGroupDto, cover: Express.Multer.File | undefined) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canManage) throw new ForbiddenException('Apenas líderes podem editar o grupo');
    if ((dto.privacy !== undefined || dto.status !== undefined) && !ctx.isLeader) throw new ForbiddenException('Apenas o líder altera a privacidade ou o estado do grupo');
    const g = ctx.group;

    if (dto.maxMembers !== undefined) {
      const taken = await this.prisma.studyGroupMember.count({ where: { groupId, ...GROUP_MEMBER_WHERE } });
      if (dto.maxMembers < taken) throw new BadRequestException(`O grupo já tem ${taken} membros; o limite não pode ser inferior`);
    }
    const privacy = dto.privacy ?? g.privacy;
    const uploaded = cover && (await this.storage.upload(cover, { folder: `study-group-covers/${g.creatorId}`, resourceType: 'image' }));
    try {
      const { removeCover, meetingSchedule, ...plain } = dto;
      const data: Prisma.StudyGroupUpdateInput = {
        ...plain,
        ...(meetingSchedule && { meetingSchedule: cleanSchedule(meetingSchedule) }),
        ...(uploaded ? { coverImageUrl: uploaded.url } : removeCover ? { coverImageUrl: null } : {}),
        // privados exigem aprovação e têm código; ao tornar público, o código deixa de valer
        ...(dto.privacy !== undefined && {
          approvalRequired: privacy !== 'public' ? true : (dto.approvalRequired ?? g.approvalRequired),
          inviteCode: privacy === 'public' ? null : (g.inviteCode ?? newInviteCode()),
        }),
        ...(dto.privacy === undefined && privacy !== 'public' && dto.approvalRequired === false && { approvalRequired: true }),
      };
      const updated = await this.prisma.studyGroup.update({ where: { groupId }, data });
      if (uploaded || removeCover) await this.storage.removeByUrl(g.coverImageUrl);

      const relevant = ['name', 'privacy', 'status', 'maxMembers', 'meetingSchedule', 'description'].filter((k) => dto[k as keyof UpdateStudyGroupDto] !== undefined);
      if (relevant.length) await this.notifyMembers(groupId, user.userId, NotificationType.STUDY_GROUP_UPDATED, 'Grupo actualizado', `O grupo "${updated.name}" foi actualizado (${relevant.join(', ')}).`);
      const { inviteCode, ...out } = updated;
      return { success: true, data: { ...out, ...(ctx.canManage && { inviteCode }) } };
    } catch (err) {
      if (uploaded) await this.storage.remove(uploaded.key, { resourceType: 'image' });
      throw err;
    }
  }

  /** Gera novo código (o antigo deixa de funcionar). */
  async regenerateCode(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canManage) throw new ForbiddenException('Apenas líderes podem gerir o código');
    if (ctx.group.privacy === 'public') throw new BadRequestException('Grupos públicos não têm código de convite');
    const g = await this.prisma.studyGroup.update({ where: { groupId }, data: { inviteCode: newInviteCode() }, select: { inviteCode: true } });
    return { success: true, data: g };
  }

  /** Apagar: líder (ou admin do site). Com outros membros, o grupo deve ser arquivado. */
  async remove(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.isLeader) throw new ForbiddenException('Apenas o líder pode eliminar o grupo');
    const others = await this.prisma.studyGroupMember.findMany({ where: { groupId, ...GROUP_MEMBER_WHERE, userId: { not: user.userId } }, select: { userId: true } });
    if (others.length && !ctx.isSiteAdmin) throw new ConflictException('O grupo tem outros membros. Arquive-o (status=archived) ou transfira a liderança.');
    await this.prisma.studyGroup.delete({ where: { groupId } });
    await this.notifications.notifyMany(others.map((o) => o.userId), NotificationType.STUDY_GROUP_DELETED, {
      title: 'Grupo eliminado',
      message: `O grupo "${ctx.group.name}" foi eliminado.`,
    });
    return { success: true, message: 'Grupo deletado com sucesso' };
  }

  async notifyMembers(groupId: string, exceptUserId: string | undefined, type: NotificationType, title: string, message: string) {
    const rows = await this.prisma.studyGroupMember.findMany({
      where: { groupId, ...GROUP_MEMBER_WHERE, ...(exceptUserId && { userId: { not: exceptUserId } }) },
      select: { userId: true },
    });
    await this.notifications.notifyMany(rows.map((r) => r.userId), type, { title, message, relatedEntityId: groupId });
  }

  // ── Estatísticas e classificação (só membros) ─────────────────────────────

  async stats(user: AuthUser, groupId: string, period: keyof typeof PERIOD_DAYS = '30d') {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const since = new Date(Date.now() - PERIOD_DAYS[period] * 86_400_000);
    const live = { groupId, ...GROUP_MEMBER_WHERE };

    const [membersCount, activeMembers, engaged, completedTasks, newContent, meetingCount, tasks, activity, completedMeetings] = await Promise.all([
      this.prisma.studyGroupMember.count({ where: live }),
      this.prisma.studyGroupMember.count({ where: { ...live, lastActiveAt: { gte: since } } }),
      this.prisma.studyGroupMember.count({ where: { ...live, OR: [{ lastActiveAt: { gte: since } }, { contributionScore: { gt: 0 } }] } }),
      this.prisma.groupTask.count({ where: { groupId, status: 'completed' } }),
      this.prisma.sharedContent.count({ where: { groupId, createdAt: { gte: since } } }),
      this.prisma.groupMeeting.count({ where: { groupId } }),
      this.prisma.groupTask.groupBy({ by: ['status'], where: { groupId }, _count: { _all: true } }),
      this.activity.dailyGroupActivity(groupId, since),
      this.prisma.groupMeeting.findMany({ where: { groupId, status: 'completed' }, select: { meetingId: true } }),
    ]);
    let avgAttendance = 0;
    if (completedMeetings.length) {
      const attended = await this.prisma.meetingParticipant.count({ where: { meetingId: { in: completedMeetings.map((m) => m.meetingId) }, attendanceStatus: 'confirmed' } });
      avgAttendance = Math.round((attended / completedMeetings.length) * 10) / 10;
    }
    return {
      success: true,
      data: {
        period,
        membersCount,
        activeMembers,
        engagementRate: membersCount ? Math.round((engaged / membersCount) * 100) : 0,
        completedTasks,
        tasksByStatus: Object.fromEntries(tasks.map((t) => [t.status, t._count._all])),
        newContent,
        meetingCount,
        avgAttendance,
        // contagem real a partir do registo de actividade (membros distintos e acções por dia, UTC)
        activityData: activity.map((a) => ({ date: a.date, activeUsers: a.activeUsers, actions: a.actions })),
      },
    };
  }

  async leaderboard(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const rows = await this.prisma.studyGroupMember.findMany({
      where: { groupId, ...GROUP_MEMBER_WHERE },
      orderBy: [{ contributionScore: 'desc' }, { joinedAt: 'asc' }],
      take: 100,
      select: { role: true, contributionScore: true, achievements: true, lastActiveAt: true, joinedAt: true, user: { select: USER_MIN } },
    });
    const level = (p: number) => ({ level: Math.floor(p / 100) + 1, currentLevelProgress: p % 100, nextLevelThreshold: (Math.floor(p / 100) + 1) * 100 });
    const members = rows.map((m, i) => ({
      rank: i + 1, ...m.user, role: toApiRole(m.role), points: m.contributionScore, ...level(m.contributionScore),
      achievements: m.achievements.slice(0, 3), lastActiveAt: m.lastActiveAt, joinedAt: m.joinedAt,
    }));
    let me: Record<string, unknown> | null = null;
    if (ctx.member && ctx.isMember) {
      const [completedTasks, contributedContent] = await Promise.all([
        this.prisma.taskAssignment.count({ where: { userId: user.userId, status: 'completed', task: { groupId } } }),
        this.prisma.sharedContent.count({ where: { groupId, uploaderId: user.userId } }),
      ]);
      me = { points: ctx.member.contributionScore, ...level(ctx.member.contributionScore), completedTasks, contributedContent, recentAchievements: ctx.member.achievements.slice(0, 3) };
    }
    return { success: true, data: { members, me } };
  }
}
