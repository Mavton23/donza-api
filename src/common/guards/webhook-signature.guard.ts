import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Verificação de assinatura HMAC-SHA256 sobre o CORPO CRU (requer `rawBody: true` no NestFactory).
 * O HMAC sobre JSON.stringify(req.body) do Express nunca coincide de forma fiável.
 *
 * Esta implementação serve para gateways com `x-signature: <hex>`.
 * O Stripe usa um esquema próprio (timestamp + v1): para ele, use `stripe.webhooks.constructEvent(rawBody, sig, secret)`.
 * M-Pesa e e-Mola: confirme na documentação de cada um o header e o algoritmo.
 */
abstract class BaseHmacWebhookGuard implements CanActivate {
  protected abstract readonly secretEnv: string;
  protected readonly headerName: string = 'x-signature';

  constructor(protected readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const secret = this.config.get<string>(this.secretEnv);
    if (!secret) throw new InternalServerErrorException(`${this.secretEnv} não configurado`);

    const signature = req.headers[this.headerName];
    if (typeof signature !== 'string' || !signature) throw new UnauthorizedException('Assinatura em falta');
    if (!req.rawBody) throw new InternalServerErrorException('rawBody indisponível (active rawBody: true)');

    const expected = createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Assinatura inválida');
    return true;
  }
}

@Injectable()
export class MpesaWebhookGuard extends BaseHmacWebhookGuard {
  protected readonly secretEnv = 'MPESA_WEBHOOK_SECRET';
}

@Injectable()
export class EmolaWebhookGuard extends BaseHmacWebhookGuard {
  protected readonly secretEnv = 'EMOLA_WEBHOOK_SECRET';
}
