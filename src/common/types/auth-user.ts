import type { UserRole, UserStatus } from '@prisma/client';

/** Utilizador autenticado, carregado da base de dados pela JwtStrategy a cada pedido. */
export interface AuthUser {
  userId: string;
  role: UserRole;
  status: UserStatus;
  isVerified: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthUser {}
  }
}
