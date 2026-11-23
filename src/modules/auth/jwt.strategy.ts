import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '@/common/types/auth-user';

export interface AccessTokenPayload {
  sub: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Corre a cada pedido autenticado: uma única query carrega role/status/isVerified,
   * por isso um utilizador suspenso perde acesso imediatamente (sem esperar o token expirar).
   */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { userId: payload.sub },
      select: { userId: true, role: true, status: true, isVerified: true },
    });
    if (!user || user.status === UserStatus.suspended) throw new UnauthorizedException('Conta indisponível');
    return user;
  }
}
