import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { PrismaService } from '@/modules/prisma/prisma.service';

const THROTTLE_MS = 5 * 60 * 1000;

/**
 * Substitui o middleware updateLastActive. Em rotas com :groupId actualiza
 * StudyGroupMember.lastActiveAt no máximo uma vez a cada 5 minutos (a condição está no próprio UPDATE),
 * sem bloquear a resposta.
 */
@Injectable()
export class LastActiveInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LastActiveInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const groupId = req.params?.groupId as string | undefined;

    if (req.user && groupId) {
      const now = new Date();
      void this.prisma.studyGroupMember
        .updateMany({
          where: {
            groupId,
            userId: req.user.userId,
            OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - THROTTLE_MS) } }],
          },
          data: { lastActiveAt: now },
        })
        .catch((err: unknown) => this.logger.warn(`lastActiveAt não actualizado: ${String(err)}`));
    }
    return next.handle();
  }
}
