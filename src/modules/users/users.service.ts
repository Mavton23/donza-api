import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { sanitizeUser } from '@/common/utils/user-helpers';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';

const MIN_INSTRUCTOR_EXPERTISE = 3;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Equivalente a validateCompleteProfile + o update do perfil. */
  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { userId },
      select: { role: true },
    });

    if (current.role === UserRole.instructor && (dto.expertise?.length ?? 0) < MIN_INSTRUCTOR_EXPERTISE) {
      throw new BadRequestException({
        message: 'Dados inválidos',
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'expertise', message: `Instrutores devem ter pelo menos ${MIN_INSTRUCTOR_EXPERTISE} áreas de especialização` },
        ],
      });
    }

    const user = await this.prisma.user.update({
      where: { userId },
      data: { ...dto, profileCompleted: true },
    });
    return sanitizeUser(user);
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const stored = await this.storage.upload(file, { folder: 'donza/avatars', resourceType: 'image' });
    const user = await this.prisma.user.update({ where: { userId }, data: { avatarUrl: stored.url } });
    return { avatarUrl: user.avatarUrl };
  }
}
