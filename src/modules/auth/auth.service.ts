import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DocumentType, NotificationType, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DOCUMENT_TYPES_BY_ROLE, UPLOAD_POLICIES } from '@/common/config/upload.config';
import { validateFile } from '@/common/pipes/file-validation.pipe';
import { initialStatusFor, sanitizeUser } from '@/common/utils/user-helpers';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, StoredFile } from '../storage/storage.service';
import { CompleteRegistrationDto, LoginDto, StartRegistrationDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;
const MAX_VERIFICATION_ATTEMPTS = 5;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const ROLES_REQUIRING_DOCUMENTS: UserRole[] = [UserRole.instructor, UserRole.institution];
/** Hash descartável: evita revelar por tempo de resposta se um email existe. */
const DUMMY_HASH = bcrypt.hashSync('donza-dummy-password', BCRYPT_ROUNDS);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface PendingDocument {
  type: DocumentType;
  file: Express.Multer.File;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  // ───────────────────────────── Registo em duas etapas ─────────────────────────────

  /** Etapa 1: email + password -> TempUser + email de verificação. */
  async startRegistration(dto: StartRegistrationDto, meta: { ip?: string; userAgent?: string }) {
    const now = new Date();

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { userId: true } });
    if (existingUser) throw new ConflictException('Email já está em uso');

    const existing = await this.prisma.tempUser.findUnique({ where: { email: dto.email } });
    const stillActive = existing !== null && existing.tokenExpires > now;
    if (existing && stillActive && existing.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      throw this.tooManyAttempts();
    }

    const { token, hash, expires } = this.newVerificationToken();
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const attempts = existing && stillActive ? existing.verificationAttempts + 1 : 1;

    await this.prisma.tempUser.upsert({
      where: { email: dto.email },
      create: {
        email: dto.email,
        password,
        verificationToken: hash,
        tokenExpires: expires,
        verificationAttempts: 1,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
      update: {
        password,
        verificationToken: hash,
        tokenExpires: expires,
        isEmailVerified: false,
        registrationStatus: 'pending',
        verificationAttempts: attempts,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    await this.mail.sendVerificationEmail(dto.email, token);
    return { message: 'Email de verificação enviado' };
  }

  async resendVerification(email: string) {
    const now = new Date();
    const temp = await this.prisma.tempUser.findUnique({ where: { email } });
    if (!temp || temp.tokenExpires <= now) {
      throw new NotFoundException('Nenhum registo pendente encontrado para este email');
    }
    if (temp.isEmailVerified) throw new BadRequestException('Este email já foi verificado');
    if (temp.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) throw this.tooManyAttempts();

    const { token, hash, expires } = this.newVerificationToken();
    await this.prisma.tempUser.update({
      where: { tempId: temp.tempId },
      data: { verificationToken: hash, tokenExpires: expires, verificationAttempts: { increment: 1 } },
    });
    await this.mail.sendVerificationEmail(email, token);
    return { message: 'Email de verificação reenviado' };
  }

  /** Clique no link do email. O mesmo token é depois usado na etapa 2. */
  async verifyEmail(token: string) {
    const temp = await this.prisma.tempUser.findFirst({
      where: { verificationToken: sha256(token), tokenExpires: { gt: new Date() } },
    });
    if (!temp) throw new BadRequestException('Token inválido ou expirado');

    if (!temp.isEmailVerified) {
      await this.prisma.tempUser.update({
        where: { tempId: temp.tempId },
        data: { isEmailVerified: true, verificationAttempts: 0 },
      });
    }
    return { email: temp.email, message: 'Email verificado com sucesso' };
  }

  /** Etapa 2: dados complementares + documentos -> User definitivo e sessão. */
  async completeRegistration(
    dto: CompleteRegistrationDto,
    files: Record<string, Express.Multer.File[]> | undefined,
  ) {
    const temp = await this.prisma.tempUser.findFirst({
      where: { verificationToken: sha256(dto.token), isEmailVerified: true, tokenExpires: { gt: new Date() } },
    });
    if (!temp) throw new BadRequestException('Token inválido, expirado ou email não verificado');

    const [emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: temp.email }, select: { userId: true } }),
      this.prisma.user.findUnique({ where: { username: dto.username }, select: { userId: true } }),
    ]);
    if (emailTaken) throw new ConflictException('Este email já está registado');
    if (usernameTaken) throw new ConflictException('Nome de utilizador já está em uso');

    const documents = await this.collectDocuments(dto.role, files);

    // Os uploads acontecem antes da transacção; se esta falhar, removemos o que foi enviado.
    const uploaded = await this.uploadDocuments(temp.tempId, documents);

    try {
      const now = new Date();
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: temp.email,
            password: temp.password,
            username: dto.username,
            role: dto.role,
            status: initialStatusFor(dto.role),
            isVerified: true,
            verifiedAt: now,
            fullName: dto.fullName,
            educationLevel: dto.educationLevel,
            educationField: dto.educationField,
            nuit: dto.nuit,
            legalRepresentative: dto.legalRepresentative,
            contactPhone: dto.contactPhone,
            ...(dto.role === UserRole.institution && {
              institutionName: dto.institutionName,
              institutionType: dto.institutionType,
            }),
          },
        });

        if (uploaded.length > 0) {
          await tx.userDocument.createMany({
            data: uploaded.map(({ type, file, stored }) => ({
              userId: created.userId,
              documentType: type,
              originalName: file.originalname,
              storageKey: stored.key,
              storageProvider: 'cloudinary',
              mimeType: file.mimetype,
              size: file.size,
              metadata: { url: stored.url, resourceType: stored.resourceType },
            })),
          });
        }

        if (initialStatusFor(dto.role) === UserStatus.pending) {
          const admins = await tx.user.findMany({
            where: { role: UserRole.admin, status: UserStatus.approved },
            select: { userId: true },
          });
          if (admins.length > 0) {
            await tx.notification.createMany({
              data: admins.map((a) => ({
                userId: a.userId,
                type: NotificationType.USER_REVIEW_REQUIRED,
                title: 'Novo perfil para revisão',
                message: `${dto.institutionName ?? dto.fullName ?? dto.username} (${dto.role}) aguarda aprovação.`,
                relatedEntityId: created.userId,
                metadata: { role: dto.role },
              })),
            });
          }
        }

        await tx.tempUser.delete({ where: { tempId: temp.tempId } });
        return created;
      });

      const session = await this.issueSession(user);
      // contas a rever (instrutores/instituições) recebem o email de aprovação mais tarde, não este
      if (user.status === UserStatus.approved) void this.mail.sendWelcome(user.email, user.username);
      return { user: sanitizeUser(user), session };
    } catch (err) {
      await Promise.all(
        uploaded.map(({ stored }) => this.storage.remove(stored.key, { resourceType: stored.resourceType, private: true })),
      );
      throw err;
    }
  }

  // ───────────────────────────── Sessão ─────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = await bcrypt.compare(dto.password, user?.password ?? DUMMY_HASH);
    if (!user || !valid) throw new UnauthorizedException('Credenciais inválidas');
    if (user.status === UserStatus.suspended) throw new ForbiddenException('Conta suspensa. Contacte o suporte.');
    if (!user.isVerified) throw new ForbiddenException('Email ainda não verificado');

    const updated = await this.prisma.user.update({ where: { userId: user.userId }, data: { lastLogin: new Date() } });
    const session = await this.issueSession(updated);
    return { user: sanitizeUser(updated), session };
  }

  /**
   * Rotação de refresh tokens: cada token só serve uma vez.
   * Se um token já revogado for reapresentado (possível roubo), todas as sessões do utilizador são revogadas.
   */
  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new UnauthorizedException('Refresh token em falta');

    try {
      await this.jwt.verifyAsync(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const stored = await this.prisma.token.findUnique({ where: { token: sha256(refreshToken) } });
    if (!stored) throw new UnauthorizedException('Refresh token inválido');

    if (stored.revoked) {
      await this.revokeAllForUser(stored.userId);
      this.logger.warn(`Reutilização de refresh token detectada (userId=${stored.userId}); sessões revogadas.`);
      throw new UnauthorizedException('Sessão inválida. Inicie sessão novamente.');
    }
    if (stored.expiresAt <= new Date()) throw new UnauthorizedException('Refresh token expirado');

    // Revogação atómica: se outro pedido já o consumiu, count = 0
    const { count } = await this.prisma.token.updateMany({
      where: { tokenId: stored.tokenId, revoked: false },
      data: { revoked: true },
    });
    if (count === 0) throw new UnauthorizedException('Refresh token já utilizado');

    const user = await this.prisma.user.findUnique({ where: { userId: stored.userId } });
    if (!user || user.status === UserStatus.suspended) throw new UnauthorizedException('Conta indisponível');

    return this.issueSession(user);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.token.updateMany({ where: { token: sha256(refreshToken), revoked: false }, data: { revoked: true } });
  }

  revokeAllForUser(userId: string) {
    return this.prisma.token.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { userId } });
    return sanitizeUser(user);
  }

  // ───────────────────────────── Recuperação de palavra-passe ─────────────────────────────

  /** Resposta sempre igual, exista ou não o email (não revela contas). */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { userId: true, status: true, username: true } });
    if (user && user.status !== UserStatus.suspended) {
      const token = randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { userId: user.userId },
        data: { passwordResetToken: sha256(token), passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
      });
      await this.mail.sendPasswordReset(email, token, user.username);
    }
    return { message: 'Se o email existir, enviámos instruções para redefinir a palavra-passe.' };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { passwordResetToken: sha256(token), passwordResetExpires: { gt: new Date() } },
      select: { userId: true, email: true, username: true },
    });
    if (!user) throw new BadRequestException('Token inválido ou expirado');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { userId: user.userId },
        data: {
          password: await bcrypt.hash(password, BCRYPT_ROUNDS),
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      }),
      this.prisma.token.updateMany({ where: { userId: user.userId, revoked: false }, data: { revoked: true } }),
    ]);
    void this.mail.sendPasswordChanged(user.email, user.username);
    return { message: 'Palavra-passe redefinida com sucesso' };
  }

  // ───────────────────────────── Internos ─────────────────────────────

  private get refreshSecret() {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private tooManyAttempts() {
    return new HttpException(
      'Limite de tentativas excedido. Por favor, aguarde antes de tentar novamente.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private newVerificationToken() {
    const token = randomBytes(32).toString('hex'); // 64 caracteres
    return { token, hash: sha256(token), expires: new Date(Date.now() + VERIFICATION_TTL_MS) };
  }

  private async issueSession(user: { userId: string; role: UserRole }): Promise<Session> {
    const accessToken = await this.jwt.signAsync({ sub: user.userId, role: user.role });

    const days = this.config.get<number>('JWT_REFRESH_EXPIRES_DAYS') ?? 7;
    const ttlSeconds = days * 24 * 60 * 60;
    const refreshExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const refreshToken = await this.jwt.signAsync(
      { sub: user.userId, jti: randomUUID() },
      { secret: this.refreshSecret, expiresIn: ttlSeconds },
    );

    // Guarda-se apenas o hash: uma fuga da base de dados não expõe tokens utilizáveis
    await this.prisma.token.create({
      data: { token: sha256(refreshToken), userId: user.userId, expiresAt: refreshExpiresAt },
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /** Valida os campos enviados contra o role escolhido (tipos de documento, MIME, tamanho, assinatura). */
  private async collectDocuments(
    role: UserRole,
    files: Record<string, Express.Multer.File[]> | undefined,
  ): Promise<PendingDocument[]> {
    const allowedFields: readonly string[] =
      role === UserRole.admin ? [] : DOCUMENT_TYPES_BY_ROLE[role as 'student' | 'instructor' | 'institution'];
    const result: PendingDocument[] = [];

    for (const [field, list] of Object.entries(files ?? {})) {
      if (!allowedFields.includes(field)) {
        throw new BadRequestException(`Tipo de documento "${field}" não permitido para o perfil ${role}`);
      }
      for (const file of list) {
        await validateFile(file, UPLOAD_POLICIES.registrationDocument);
        result.push({ type: field as DocumentType, file });
      }
    }

    if (ROLES_REQUIRING_DOCUMENTS.includes(role) && result.length === 0) {
      throw new BadRequestException('Envie pelo menos um documento para validação do perfil');
    }
    return result;
  }

  private async uploadDocuments(tempId: string, documents: PendingDocument[]) {
    const settled = await Promise.allSettled(
      documents.map(async (doc) => ({
        ...doc,
        stored: await this.storage.upload(doc.file, { folder: `donza/documents/${tempId}`, private: true }),
      })),
    );

    const ok = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
    const failed = settled.find((s) => s.status === 'rejected');
    if (failed) {
      await Promise.all(ok.map(({ stored }) => this.storage.remove(stored.key, { resourceType: stored.resourceType, private: true })));
      this.logger.error('Falha no upload de documentos', String((failed as PromiseRejectedResult).reason));
      throw new HttpException('Não foi possível guardar os documentos. Tente novamente.', HttpStatus.BAD_GATEWAY);
    }
    return ok as Array<PendingDocument & { stored: StoredFile }>;
  }
}
