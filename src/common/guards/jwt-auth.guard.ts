import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from '../decorators/auth.decorators';

/** Guard global: todas as rotas exigem access token, excepto as marcadas com @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) return (await super.canActivate(context)) as boolean;

    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!optional) return true;

    // Auth opcional: tenta autenticar, mas nunca falha o pedido.
    try {
      await super.canActivate(context);
    } catch {
      /* anónimo */
    }
    return true;
  }

  handleRequest<TUser>(err: unknown, user: TUser | false, info?: { name?: string }): TUser {
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({ message: 'Token expirado', code: 'TOKEN_EXPIRED' });
      }
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Token inválido ou não fornecido');
    }
    return user;
  }
}
