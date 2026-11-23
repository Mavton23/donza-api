import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';

const SENSITIVE_KEY = /password|token|secret|authorization/i;

function sanitize(body: unknown): Prisma.InputJsonValue | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : (value as Prisma.InputJsonValue);
  }
  return out;
}

/**
 * Substitui logAdminAction/logAccess. Só regista quando o handler/controller tem @Audit()
 * e o utilizador é admin. O statusCode é lido DEPOIS da execução (o middleware original lia-o antes, ficava sempre 200).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    if (!meta || req.user?.role !== UserRole.admin) return next.handle();

    const res = http.getResponse<Response>();
    const action = meta.action ?? `${context.getClass().name}.${context.getHandler().name}`;
    const userId = req.user.userId;

    const write = (statusCode: number) => {
      const entityId = (req.params?.id as string | undefined) ?? (req.body?.id as string | undefined);
      this.prisma.auditLog
        .create({
          data: {
            userId,
            action,
            entityType: meta.entityType ?? 'endpoint',
            entityId: entityId ?? null,
            method: req.method,
            endpoint: req.originalUrl,
            statusCode,
            changes: req.method !== 'GET' ? sanitize(req.body) : undefined,
            ip: req.ip,
          },
        })
        .catch((err: unknown) => this.logger.error('Falha ao gravar AuditLog', err instanceof Error ? err.stack : err));
    };

    return next.handle().pipe(
      tap({
        next: () => write(res.statusCode),
        error: (err: unknown) => write(err instanceof HttpException ? err.getStatus() : 500),
      }),
    );
  }
}
