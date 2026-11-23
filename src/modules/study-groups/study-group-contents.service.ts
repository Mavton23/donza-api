import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEntityType, ActivityType, NotificationType, Prisma, SharedContentType } from '@prisma/client';
import { MAX_FILE_SIZE } from '@/common/config/upload.config';
import { validateFile } from '@/common/pipes/file-validation.pipe';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateContentDto, ListContentsQueryDto, UpdateContentDto } from './dto/group-work.dto';
import { groupContext, requireMember } from './study-group-access';
import { POINTS, award } from './study-group-score';
import { StudyGroupsService } from './study-groups.service';

const UPLOADER = { userId: true, username: true, avatarUrl: true } as const;

/** Tipos MIME aceites por tipo de conteúdo (ficheiros até 50MB; vídeos maiores: usar `externalUrl`). */
export const CONTENT_MIME: Record<Exclude<SharedContentType, 'link'>, readonly string[]> = {
  pdf: ['application/pdf'],
  slide: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  code: ['text/plain', 'application/zip'],
};

@Injectable()
export class StudyGroupContentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: StudyGroupsService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
  ) {}

  private async content(groupId: string, contentId: string) {
    const c = await this.prisma.sharedContent.findFirst({ where: { contentId, groupId } });
    if (!c) throw new NotFoundException('Conteúdo não encontrado');
    return c;
  }

  async list(user: AuthUser, groupId: string, q: ListContentsQueryDto) {
    requireMember(await groupContext(this.prisma, groupId, user));
    const where: Prisma.SharedContentWhereInput = {
      groupId,
      ...(q.fileType && { fileType: q.fileType }),
      ...(q.uploaderId && { uploaderId: q.uploaderId }),
      ...(q.search && { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sharedContent.findMany({
        where, orderBy: q.sort === 'downloads' ? [{ downloadCount: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' },
        skip: skipOf(q), take: q.limit, include: { uploader: { select: UPLOADER } },
      }),
      this.prisma.sharedContent.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async detail(user: AuthUser, groupId: string, contentId: string) {
    requireMember(await groupContext(this.prisma, groupId, user));
    await this.content(groupId, contentId);
    return { success: true, data: await this.prisma.sharedContent.findUniqueOrThrow({ where: { contentId }, include: { uploader: { select: UPLOADER } } }) };
  }

  async create(user: AuthUser, groupId: string, dto: CreateContentDto, file?: Express.Multer.File) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canWrite) throw new ForbiddenException('Apenas membros activos podem partilhar conteúdo');
    if (ctx.group.status !== 'active') throw new BadRequestException('O grupo não está activo');

    if (dto.fileType === 'link') {
      if (file) throw new BadRequestException('Conteúdos do tipo "link" não levam ficheiro');
      if (!dto.externalUrl) throw new BadRequestException('externalUrl é obrigatório para links');
    } else {
      if (!file && !dto.externalUrl) throw new BadRequestException('Envie um ficheiro ou indique externalUrl');
      if (file && dto.externalUrl) throw new BadRequestException('Indique ficheiro ou externalUrl, não ambos');
      if (file) await validateFile(file, { allowed: CONTENT_MIME[dto.fileType], maxSize: MAX_FILE_SIZE.BATCH_ATTACHMENT });
    }

    const stored = file ? await this.storage.upload(file, { folder: `donza/study-groups/${groupId}/content`, resourceType: dto.fileType === 'image' ? 'image' : dto.fileType === 'video' ? 'video' : 'raw' }) : null;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const c = await tx.sharedContent.create({
          data: { groupId, uploaderId: user.userId, title: dto.title, description: dto.description, fileType: dto.fileType, fileUrl: stored?.url ?? null, externalUrl: dto.externalUrl ?? null },
          include: { uploader: { select: UPLOADER } },
        });
        await award(tx, groupId, user.userId, POINTS.content);
        return c;
      });
      const isLink = dto.fileType === 'link' || (!file && !!dto.externalUrl);
      await this.activity.log({ userId: user.userId, groupId, type: isLink ? ActivityType.link_shared : ActivityType.content_upload, entityType: ActivityEntityType.group_content, entityId: created.contentId, metadata: { title: created.title, fileType: dto.fileType } });
      await this.groups.notifyMembers(groupId, user.userId, isLink ? NotificationType.STUDY_GROUP_LINK_ADDED : NotificationType.STUDY_GROUP_CONTENT_UPLOADED,
        isLink ? 'Novo link partilhado' : 'Novo conteúdo partilhado', `"${created.title}" foi partilhado no grupo "${ctx.group.name}".`);
      return { success: true, data: created };
    } catch (err) {
      if (stored) await this.storage.remove(stored.key, { resourceType: stored.resourceType });
      throw err;
    }
  }

  async update(user: AuthUser, groupId: string, contentId: string, dto: UpdateContentDto) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const c = await this.content(groupId, contentId);
    if (!ctx.isMember || (c.uploaderId !== user.userId && !ctx.canModerate) || (c.uploaderId === user.userId && !ctx.canWrite && !ctx.canModerate)) throw new ForbiddenException('Sem permissão para editar este conteúdo');
    if (dto.externalUrl !== undefined && c.fileType !== 'link') throw new BadRequestException('Só links têm externalUrl editável');
    const updated = await this.prisma.sharedContent.update({ where: { contentId }, data: dto, include: { uploader: { select: UPLOADER } } });
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.content_update, entityType: ActivityEntityType.group_content, entityId: contentId });
    if (c.uploaderId !== user.userId) {
      await this.notifications.notify(c.uploaderId, NotificationType.STUDY_GROUP_CONTENT_UPDATED, { title: 'Conteúdo editado', message: `O seu conteúdo "${updated.title}" foi editado pela moderação.`, relatedEntityId: contentId });
    }
    return { success: true, data: updated };
  }

  async remove(user: AuthUser, groupId: string, contentId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    const c = await this.content(groupId, contentId);
    if (!ctx.isMember || (c.uploaderId !== user.userId && !ctx.canModerate)) throw new ForbiddenException('Sem permissão para apagar este conteúdo');
    await this.prisma.$transaction(async (tx) => {
      await tx.sharedContent.delete({ where: { contentId } });
      await award(tx, groupId, c.uploaderId, -POINTS.content);
    });
    await this.storage.removeByUrl(c.fileUrl);
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.content_delete, entityType: ActivityEntityType.group_content, entityId: contentId, metadata: { title: c.title } });
    if (c.uploaderId !== user.userId) {
      await this.notifications.notify(c.uploaderId, NotificationType.STUDY_GROUP_CONTENT_DELETED, { title: 'Conteúdo removido', message: `O seu conteúdo "${c.title}" foi removido pela moderação.`, relatedEntityId: groupId });
    }
    return { success: true, message: 'Conteúdo apagado' };
  }

  /** Regista o acesso (contador atómico) e devolve o URL. É POST porque tem efeito. */
  async download(user: AuthUser, groupId: string, contentId: string) {
    requireMember(await groupContext(this.prisma, groupId, user));
    await this.content(groupId, contentId);
    const c = await this.prisma.sharedContent.update({ where: { contentId }, data: { downloadCount: { increment: 1 } }, select: { fileUrl: true, externalUrl: true, downloadCount: true, title: true } });
    await this.activity.log({ userId: user.userId, groupId, type: ActivityType.content_download, entityType: ActivityEntityType.group_content, entityId: contentId });
    return { success: true, data: { url: c.fileUrl ?? c.externalUrl, downloadCount: c.downloadCount, title: c.title } };
  }
}
