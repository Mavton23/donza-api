import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Sala privada de um utilizador: todos os seus separadores/dispositivos ligados entram nela. */
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Ponto único para empurrar eventos em tempo real. Nunca lança: o tempo real é um complemento
 * (o cliente continua a poder obter tudo por REST), por isso uma falha aqui não pode estragar um pedido.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server) { this.server = server; }

  emitToUsers(userIds: Iterable<string>, event: string, payload: unknown) {
    try {
      const rooms = [...new Set(userIds)].map(userRoom);
      if (this.server && rooms.length) this.server.to(rooms).emit(event, payload);
    } catch (err) {
      this.logger.warn(`Falha a emitir ${event}: ${(err as Error).message}`);
    }
  }

  /** Corta as ligações de um utilizador (ex.: conta suspensa). */
  disconnectUser(userId: string) {
    try { this.server?.in(userRoom(userId)).disconnectSockets(true); } catch (err) { this.logger.warn(`Falha a desligar ${userId}: ${(err as Error).message}`); }
  }

  /** Quantas ligações tem um utilizador (para testes e diagnóstico). */
  async connections(userId: string) {
    return (await this.server?.in(userRoom(userId)).fetchSockets())?.length ?? 0;
  }
}
