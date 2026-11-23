import { User, UserRole, UserStatus } from '@prisma/client';

/** Antigo hook beforeCreate: instrutores e instituições aguardam revisão, os restantes entram aprovados. */
export function initialStatusFor(role: UserRole): UserStatus {
  return role === UserRole.instructor || role === UserRole.institution
    ? UserStatus.pending
    : UserStatus.approved;
}

export type SafeUser = Omit<
  User,
  'password' | 'verificationToken' | 'passwordResetToken' | 'passwordResetExpires'
>;

/** Remove segredos antes de devolver um utilizador na API. */
export function sanitizeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, verificationToken, passwordResetToken, passwordResetExpires, ...safe } = user;
  return safe;
}
