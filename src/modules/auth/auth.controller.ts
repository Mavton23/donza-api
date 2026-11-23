import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, Public } from '@/common/decorators/auth.decorators';
import {
  ALLOWED_MIME,
  MAX_FILE_SIZE,
  REGISTRATION_DOCUMENT_FIELDS,
} from '@/common/config/upload.config';
import type { AuthUser } from '@/common/types/auth-user';
import { AuthService, Session } from './auth.service';
import {
  CompleteRegistrationDto,
  EmailDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  StartRegistrationDto,
  VerifyEmailQueryDto,
} from './dto/auth.dto';

const REFRESH_COOKIE = 'refreshToken';
const STRICT = { default: { limit: 5, ttl: 60_000 } };

const documentFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, accept: boolean) => void,
) =>
  (ALLOWED_MIME.registrationDocuments as readonly string[]).includes(file.mimetype)
    ? cb(null, true)
    : cb(new BadRequestException(`Tipo de ficheiro não permitido para ${file.fieldname}`), false);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ── Registo ───────────────────────────────────────────────

  @Public()
  @Throttle(STRICT)
  @Post('register/start')
  start(@Body() dto: StartRegistrationDto, @Req() req: Request) {
    return this.auth.startRegistration(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('register/resend')
  resend(@Body() dto: EmailDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('register/verify')
  verify(@Query() query: VerifyEmailQueryDto) {
    return this.auth.verifyEmail(query.token);
  }

  /** multipart/form-data: campos de texto + ficheiros nos campos de DOCUMENT_TYPES. */
  @Public()
  @Throttle(STRICT)
  @Post('register/complete')
  @UseInterceptors(
    FileFieldsInterceptor(REGISTRATION_DOCUMENT_FIELDS, {
      limits: { fileSize: MAX_FILE_SIZE.DOCUMENT, files: 10 },
      fileFilter: documentFilter,
    }),
  )
  async complete(
    @Body() dto: CompleteRegistrationDto,
    @UploadedFiles() files: Record<string, Express.Multer.File[]> | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.auth.completeRegistration(dto, files);
    this.setRefreshCookie(res, session);
    return { user, accessToken: session.accessToken };
  }

  // ── Sessão ────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, session } = await this.auth.login(dto);
    this.setRefreshCookie(res, session);
    return { user, accessToken: session.accessToken };
  }

  /**
   * O cliente chama isto ao receber 401 com code TOKEN_EXPIRED (ver README: single-flight no frontend).
   * Lê o refresh token do cookie httpOnly (ou do body, para clientes sem cookies).
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Body() body: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? body.refreshToken;
    try {
      const session = await this.auth.refresh(token);
      this.setRefreshCookie(res, session);
      return { accessToken: session.accessToken };
    } catch (err) {
      this.clearRefreshCookie(res);
      throw err;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Body() body: RefreshDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? body.refreshToken);
    this.clearRefreshCookie(res);
    return { message: 'Sessão terminada' };
  }

  @HttpCode(200)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeAllForUser(user.userId);
    this.clearRefreshCookie(res);
    return { message: 'Todas as sessões foram terminadas' };
  }

  @Get('me')
  me(@CurrentUser('userId') userId: string) {
    return this.auth.me(userId);
  }

  // ── Palavra-passe ─────────────────────────────────────────

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('forgot-password')
  forgot(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  // ── Cookie ────────────────────────────────────────────────

  private cookieOptions(): CookieOptions {
    const production = this.config.get<string>('NODE_ENV') === 'production';
    const sameSite = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax') as 'lax' | 'strict' | 'none';
    return {
      httpOnly: true,
      secure: production || sameSite === 'none',
      sameSite,
      domain: this.config.get<string>('COOKIE_DOMAIN') || undefined,
      path: '/api/auth', // o browser só envia o cookie para estas rotas
    };
  }

  private setRefreshCookie(res: Response, session: Session) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, { ...this.cookieOptions(), expires: session.refreshExpiresAt });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
