import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { UserStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService, userRoom } from './realtime.service';

/**
 * WebSocket (Socket.IO) no namespace `/ws`. Autenticação no handshake com o mesmo access token das rotas REST:
 * `io(url + '/ws', { auth: { token } })`. Só o servidor emite (mensagens, leitura, notificações);
 * o cliente não envia eventos, por isso não há superfície de escrita por aqui.
 */
@WebSocketGateway({ namespace: '/ws', transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) { this.realtime.attach(server); }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (typeof token !== 'string' || !token) throw new Error('sem token');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') });
      const user = await this.prisma.user.findUnique({ where: { userId: payload.sub }, select: { userId: true, status: true } });
      if (!user || user.status === UserStatus.suspended) throw new Error('conta indisponível');
      client.data.userId = user.userId;
      await client.join(userRoom(user.userId));
      client.emit('ready', { userId: user.userId });
    } catch (err) {
      this.logger.debug(`Ligação recusada: ${(err as Error).message}`);
      client.emit('unauthorized', { message: 'Token inválido ou expirado' });
      client.disconnect(true);
    }
  }
}
