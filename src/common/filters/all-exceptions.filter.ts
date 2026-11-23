import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';

interface NormalizedError {
  status: number;
  name: string;
  message: string;
  code?: string;
  details?: unknown;
}

/** Mensagens do multer/Nest em inglês -> português. */
const UPLOAD_MESSAGES: Record<string, string> = {
  'File too large': 'Ficheiro demasiado grande',
  'Too many files': 'Número máximo de ficheiros excedido',
  'Unexpected field': 'Campo de ficheiro inesperado ou não permitido',
};

/**
 * Filter global. Mantém o formato do errorHandler original
 * `{ success: false, error: { name, message, statusCode } }` e acrescenta `code` e `details`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const err = this.normalize(exception);

    if (err.status >= 500) {
      this.logger.error(err.message, exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(err.status).json({
      success: false,
      error: {
        name: err.name,
        message: err.message,
        statusCode: err.status,
        ...(err.code && { code: err.code }),
        ...(err.details !== undefined && { details: err.details }),
      },
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        return { status, name: exception.name, message: UPLOAD_MESSAGES[body] ?? body };
      }
      const obj = body as { message?: string | string[]; code?: string; details?: unknown };
      const raw = Array.isArray(obj.message) ? obj.message.join('; ') : (obj.message ?? exception.message);
      return {
        status,
        name: exception.name,
        message: UPLOAD_MESSAGES[raw] ?? raw,
        code: obj.code,
        details: obj.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[] | string | undefined) ?? [];
          const fields = Array.isArray(target) ? target : [target];
          return {
            status: HttpStatus.CONFLICT,
            name: 'ConflictException',
            message: 'Já existe um registo com estes dados',
            code: 'UNIQUE_CONSTRAINT',
            details: { fields },
          };
        }
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, name: 'NotFoundException', message: 'Registo não encontrado' };
        case 'P2003':
          return {
            status: HttpStatus.CONFLICT,
            name: 'ConflictException',
            message: 'Operação bloqueada por registos relacionados',
            code: 'FOREIGN_KEY_CONSTRAINT',
          };
        case 'P2000':
          return { status: HttpStatus.BAD_REQUEST, name: 'BadRequestException', message: 'Valor demasiado longo para o campo' };
        default:
          break;
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      name: 'InternalServerError',
      message: 'Ocorreu um erro inesperado',
    };
  }
}
