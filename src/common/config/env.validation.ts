import { plainToInstance, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Min, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsOptional() @IsIn(['development', 'production', 'test']) NODE_ENV: string = 'development';
  @IsOptional() @Type(() => Number) @IsInt() PORT: number = 3001;
  @IsOptional() @IsString() FRONTEND_URL: string = 'http://localhost:3000';

  @IsString() DATABASE_URL: string;

  @IsString() @MinLength(32) JWT_ACCESS_SECRET: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(60) JWT_ACCESS_EXPIRES_SECONDS: number = 900;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) JWT_REFRESH_EXPIRES_DAYS: number = 7;

  @IsOptional() @IsIn(['lax', 'strict', 'none']) COOKIE_SAMESITE: string = 'lax';
  @IsOptional() @IsString() COOKIE_DOMAIN?: string;
  @IsOptional() @IsString() TRUST_PROXY?: string;

  @IsString() CLOUDINARY_CLOUD_NAME: string;
  @IsString() CLOUDINARY_API_KEY: string;
  @IsString() CLOUDINARY_API_SECRET: string;

  @IsOptional() @IsString() SMTP_HOST?: string;
  @IsOptional() @Type(() => Number) @IsInt() SMTP_PORT?: number;
  @IsOptional() @IsString() SMTP_USER?: string;
  @IsOptional() @IsString() SMTP_PASS?: string;
  @IsOptional() @IsString() MAIL_FROM?: string;

  /** Documentação Swagger em produção (por omissão só fora de produção). */
  @IsOptional() @IsString() SWAGGER_ENABLED?: string;
  /** URL público da API (usado no link de subscrição do calendário). */
  @IsOptional() @IsString() API_PUBLIC_URL?: string;
  /** Segredo do link do calendário (por omissão usa JWT_REFRESH_SECRET). */
  @IsOptional() @IsString() CALENDAR_SECRET?: string;

  // Pagamentos (todos opcionais; sem chaves, o fornecedor fica indisponível)
  @IsOptional() @IsString() STRIPE_SECRET_KEY?: string;
  @IsOptional() @IsString() STRIPE_WEBHOOK_SECRET?: string;
  /** `true` activa M-Pesa/e-Mola SIMULADOS (nunca em produção). */
  @IsOptional() @IsString() PAYMENTS_SIMULATED?: string;
  @IsOptional() @IsString() MPESA_WEBHOOK_SECRET?: string;
  @IsOptional() @IsString() EMOLA_WEBHOOK_SECRET?: string;
  @IsOptional() @IsString() BANK_TRANSFER_DETAILS?: string;
  @IsOptional() @IsString() PLATFORM_FEE_PERCENT?: string;
  @IsOptional() @IsString() INSTITUTION_SHARE_PERCENT?: string;
  @IsOptional() @IsString() PAYOUT_HOLD_DAYS?: string;
  @IsOptional() @IsString() PAYMENTS_DEFAULT_CURRENCY?: string;

  // Identidade nos emails (todos opcionais)
  @IsOptional() @IsString() APP_NAME?: string;
  /** `false` desliga os crons (lembretes, relatórios semanais) nesta instância. */
  @IsOptional() @IsString() SCHEDULER_ENABLED?: string;
  @IsOptional() @IsString() APP_TAGLINE?: string;
  @IsOptional() @IsEmail() SUPPORT_EMAIL?: string;
  @IsOptional() @IsUrl({ require_tld: false }) HELP_URL?: string;
  @IsOptional() @IsUrl({ require_tld: false }) TERMS_URL?: string;
  @IsOptional() @IsUrl({ require_tld: false }) PRIVACY_URL?: string;
  @IsOptional() @IsUrl() SOCIAL_FACEBOOK?: string;
  @IsOptional() @IsUrl() SOCIAL_INSTAGRAM?: string;
  @IsOptional() @IsUrl() SOCIAL_GITHUB?: string;
  @IsOptional() @IsUrl() SOCIAL_LINKEDIN?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  // Strings vazias do .env contam como "não definido"
  const cleaned = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== ''));
  const validated = plainToInstance(EnvironmentVariables, cleaned, { enableImplicitConversion: false });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const list = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
    throw new Error(`Variáveis de ambiente inválidas:\n - ${list.join('\n - ')}`);
  }
  return { ...cleaned, ...validated };
}
