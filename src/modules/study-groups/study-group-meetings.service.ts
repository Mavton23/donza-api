import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEntityType, ActivityType, GroupMeetingStatus, NotificationType, Prisma } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListMeetingsQueryDto, MeetingDto, UpdateMeetingDto } from './dto/study-group.dto';
import { groupContext, requireMember } from './study-group-access';
import { StudyGroupsService } from './study-groups.service';

const ORGANIZER = { userId: true, username: true, avatarUrl: true } as const;

function cleanRecurring(r: Record<string, unknown> | undefined): Prisma.InputJsonObject | undefined {
  if (!r) return undefined;
  if (!['daily', 'weekly', 'monthly'].includes(r.frequency as string)) throw new BadRequestException('recurring.frequency deve ser daily, weekly ou monthly');
  const out: Record<string, unknown> = { frequency: r.frequency };
  if (r.until !== undefined) {
    if (typeof r.until !== 'string' || Number.isNaN(Date.parse(r.until))) throw new BadRequestException('recurring.until inválido');
    out.until = r.until;
  }
  const extra = Object.keys(r).filter((k) => !['frequency', 'until'].includes(k));
  if (extra.length) throw new BadRequestException(`recurring: chaves desconhecidas (${extra.join(', ')})`);
  return out as Prisma.InputJsonObject;
}

@Injectable()
export class StudyGroupMeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: StudyGroupsService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  private async meeting(groupId: string, meetingId: string) {
    const m = await this.prisma.groupMeeting.findFirst({ where: { meetingId, groupId } });
    if (!m) throw new NotFoundException('Reunião não encontrada');
    return m;
  }

  async list(user: AuthUser, groupId: string, q: ListMeetingsQueryDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const now = new Date();
    const when = q.when ?? 'all';
    const where: Prisma.GroupMeetingWhereInput = { groupId, ...(when === 'upcoming' ? { startTime: { gte: now }, status: 'scheduled' } : when === 'past' ? { startTime: { lt: now } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.groupMeeting.findMany({
        where, orderBy: { startTime: when === 'upcoming' ? 'asc' : 'desc' }, skip: skipOf(q), take: q.limit,
        include: {
          organizer: { select: ORGANIZER },
          participants: { where: { userId: user.userId }, select: { attendanceStatus: true } },
          _count: { select: { participants: { where: { attendanceStatus: 'confirmed' } } } },
        },
      }),
      this.prisma.groupMeeting.count({ where }),
    ]);
    return paginated(rows.map(({ participants, _count, ...m }) => ({ ...m, confirmedCount: _count.participants, myRsvp: participants[0]?.attendanceStatus ?? null })), total, q);
  }

  async detail(user: AuthUser, groupId: string, meetingId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    await this.meeting(groupId, meetingId);
    const m = await this.prisma.groupMeeting.findUniqueOrThrow({
      where: { meetingId },
      include: { organizer: { select: ORGANIZER }, participants: { select: { attendanceStatus: true, joinedAt: true, user: { select: ORGANIZER } } } },
    });
    const { participants, ...rest } = m;
    return { success: true, data: { ...rest, participants: participants.map((p) => ({ ...p.user, attendanceStatus: p.attendanceStatus })), myRsvp: participants.find((p) => p.user.userId === user.userId)?.attendanceStatus ?? null } };
  }

  async create(user: AuthUser, groupId: string, dto: MeetingDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canManage) throw new ForbiddenException('Somente líderes podem agendar reuniões');
    if (ctx.group.status !== 'active') throw new BadRequestException('O grupo não está activo');
    if (dto.startTime <= new Date()) throw new BadRequestException('A reunião deve começar no futuro');
    if (dto.endTime && dto.endTime <= dto.startTime) throw new BadRequestException('O fim deve ser posterior ao início');

    const meeting = await this.prisma.groupMeeting.create({
      data: {
        groupId, organizerId: user.userId, title: dto.title, description: dto.description, startTime: dto.startTime, endTime: dto.endTime,
        meetingUrl: dto.meetingUrl, recurring: cleanRecurring(dto.recurring),
        participants: { create: { userId: user.userId, attendanceStatus: 'confirmed' } },
      },
    });
    await this.prisma.studyGroupMember.updateMany({ where: { groupId, userId: user.userId }, data: { lastActiveAt: new Date() } });
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.meeting_scheduled, entityType: ActivityEntityType.group_meeting, entityId: meeting.meetingId, metadata: { title: meeting.title } });
    await this.groups.notifyMembers(groupId, user.userId, NotificationType.STUDY_GROUP_MEETING_SCHEDULED, 'Nova reunião', `Reunião "${meeting.title}" marcada no grupo "${ctx.group.name}" para ${meeting.startTime.toISOString()}.`);
    return { success: true, data: meeting };
  }

  async update(user: AuthUser, groupId: string, meetingId: string, dto: UpdateMeetingDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canManage) throw new ForbiddenException('Somente líderes podem editar reuniões');
    const m = await this.meeting(groupId, meetingId);
    if (m.status !== 'scheduled') throw new ConflictException('Reuniões concluídas ou canceladas não podem ser editadas');

    const start = dto.startTime ?? m.startTime;
    const end = dto.endTime === undefined ? m.endTime : dto.endTime;
    if (dto.startTime && dto.startTime.getTime() !== m.startTime.getTime() && dto.startTime <= new Date()) throw new BadRequestException('A reunião deve começar no futuro');
    if (end && end <= start) throw new BadRequestException('O fim deve ser posterior ao início');

    const { recurring, status, ...plain } = dto;
    const updated = await this.prisma.groupMeeting.update({
      where: { meetingId },
      data: { ...plain, ...(recurring && { recurring: cleanRecurring(recurring) }), ...(status && { status: status as GroupMeetingStatus }) },
    });
    const timeChanged = dto.startTime && dto.startTime.getTime() !== m.startTime.getTime();
    if (status === 'canceled') await this.groups.notifyMembers(groupId, user.userId, NotificationType.STUDY_GROUP_UPDATED, 'Reunião cancelada', `A reunião "${updated.title}" foi cancelada.`);
    else if (timeChanged || (dto.meetingUrl && dto.meetingUrl !== m.meetingUrl)) {
      await this.groups.notifyMembers(groupId, user.userId, NotificationType.STUDY_GROUP_UPDATED, 'Reunião alterada', `A reunião "${updated.title}" foi alterada. Confira data e link.`);
    }
    return { success: true, data: updated };
  }

  async remove(user: AuthUser, groupId: string, meetingId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canManage) throw new ForbiddenException('Somente líderes podem apagar reuniões');
    await this.meeting(groupId, meetingId);
    await this.prisma.groupMeeting.delete({ where: { meetingId } });
    return { success: true, message: 'Reunião apagada' };
  }

  async rsvp(user: AuthUser, groupId: string, meetingId: string, status: 'confirmed' | 'declined') {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const m = await this.meeting(groupId, meetingId);
    if (m.status !== 'scheduled') throw new BadRequestException('Só se responde a reuniões agendadas');
    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId, userId: user.userId } },
      create: { meetingId, userId: user.userId, attendanceStatus: status },
      update: { attendanceStatus: status },
    });
    return { success: true, data: { meetingId, attendanceStatus: status } };
  }
}
