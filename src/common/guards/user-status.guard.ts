import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserRole, UserStatus } from '@prisma/client';
import { REQUIRE_STATUS_KEY } from '../decorators/auth.decorators';

/**
 * Equivalente ao checkUserStatus. Não faz queries: o status e o isVerified
 * vêm de req.user, carregado pela JwtStrategy.
 */
@Injectable()
export class UserStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<UserStatus[] | undefined>(REQUIRE_STATUS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed || allowed.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new ForbiddenException('Utilizador não autenticado');
    if (user.role === UserRole.admin) return true;

    if (!allowed.includes(user.status)) {
      throw new ForbiddenException(
        `Ação não permitida para perfis ${user.status}. Seu perfil precisa ser aprovado pela equipa Donza.`,
      );
    }
    if (user.role === UserRole.instructor && !user.isVerified) {
      throw new ForbiddenException('Seu perfil de instrutor precisa ser verificado');
    }
    if (user.role === UserRole.institution && !user.isVerified) {
      throw new ForbiddenException('Seu perfil de instituição precisa ser verificado');
    }
    return true;
  }
}
