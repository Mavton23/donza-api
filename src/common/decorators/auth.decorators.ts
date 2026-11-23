import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole, UserStatus } from '@prisma/client';
import type { AuthUser } from '../types/auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
export const ROLES_KEY = 'roles';
export const REQUIRE_STATUS_KEY = 'requireStatus';

/** Rota sem autenticação (o JwtAuthGuard é global). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Rota pública que, se vier um token válido, também preenche `req.user`
 * (ex.: detalhe de curso com `isEnrolled`). Token inválido/expirado é ignorado.
 */
export const OptionalAuth = () => applyDecorators(Public(), SetMetadata(IS_OPTIONAL_AUTH_KEY, true));

/** Restringe a rota a determinados roles. Substitui `authorize([...])`. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Exige um dos status indicados. Substitui `checkUserStatus([...])`.
 * O admin passa sempre; instrutores e instituições também têm de estar verificados.
 */
export const RequireStatus = (...statuses: UserStatus[]) => SetMetadata(REQUIRE_STATUS_KEY, statuses);

/** Atalho: `@RequireApproved()` equivale ao `checkUserStatus()` por omissão. */
export const RequireApproved = () => RequireStatus(UserStatus.approved);

/** Injecta o utilizador autenticado (ou um dos seus campos). */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<Request>().user as AuthUser | undefined;
    return field ? user?.[field] : user;
  },
);
