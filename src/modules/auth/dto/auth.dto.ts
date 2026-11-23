import { EducationLevel, InstitutionType, UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { NormalizeEmail, Trim } from '@/common/utils/transform.decorators';

export const REGISTRABLE_ROLES = [UserRole.student, UserRole.instructor, UserRole.institution] as const;

// bcrypt só considera os primeiros 72 bytes
const PASSWORD_MAX = 72;

export class StartRegistrationDto {
  @NormalizeEmail()
  @IsNotEmpty({ message: 'O email é obrigatório' })
  @IsEmail({}, { message: 'Por favor, forneça um email válido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'A palavra-passe deve ter pelo menos 8 caracteres' })
  @MaxLength(PASSWORD_MAX, { message: `A palavra-passe deve ter no máximo ${PASSWORD_MAX} caracteres` })
  password: string;
}

export class EmailDto {
  @NormalizeEmail()
  @IsNotEmpty({ message: 'O email é obrigatório' })
  @IsEmail({}, { message: 'Por favor, forneça um email válido' })
  email: string;
}

export class VerifyEmailQueryDto {
  @Trim()
  @IsString()
  @Length(20, 100, { message: 'Token inválido' })
  token: string;
}

export class CompleteRegistrationDto {
  @Trim()
  @IsString()
  @Length(20, 100, { message: 'Token inválido' })
  token: string;

  @Trim()
  @IsString()
  @Length(3, 30, { message: 'O nome de utilizador deve ter entre 3 e 30 caracteres' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'O nome de utilizador só pode conter letras, números e underscores' })
  @Matches(/^(?!.*admin)/i, { message: 'Nome de utilizador não permitido' })
  username: string;

  @IsIn(REGISTRABLE_ROLES, { message: 'Tipo de utilizador inválido' })
  role: UserRole;

  @IsOptional() @Trim() @IsString() @MaxLength(150)
  fullName?: string;

  // ── instituição
  @ValidateIf((o: CompleteRegistrationDto) => o.role === UserRole.institution)
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'O nome da instituição é obrigatório' })
  @Length(3, 100, { message: 'O nome da instituição deve ter entre 3 e 100 caracteres' })
  @Matches(/^[a-zA-Z0-9À-ÿ\s\-.,&]+$/, { message: 'Nome da instituição contém caracteres inválidos' })
  institutionName?: string;

  @IsOptional() @IsEnum(InstitutionType)
  institutionType?: InstitutionType;

  @IsOptional() @Trim() @IsString() @MaxLength(150)
  legalRepresentative?: string;

  @IsOptional() @Trim() @Matches(/^\d{9}$/, { message: 'O NUIT deve ter 9 dígitos' })
  nuit?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(30)
  contactPhone?: string;

  // ── instrutor / estudante
  @IsOptional() @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @IsOptional() @Trim() @IsString() @MaxLength(150)
  educationField?: string;
}

export class LoginDto {
  @NormalizeEmail()
  @IsNotEmpty({ message: 'O email é obrigatório' })
  @IsEmail({}, { message: 'Por favor, forneça um email válido' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  password: string;
}

export class RefreshDto {
  /** Fallback para clientes sem cookies (ex.: mobile). Na web usa-se o cookie httpOnly. */
  @IsOptional() @IsString()
  refreshToken?: string;
}

export class ResetPasswordDto {
  @Trim()
  @IsString()
  @Length(20, 100, { message: 'Token inválido' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'A palavra-passe deve ter pelo menos 8 caracteres' })
  @MaxLength(PASSWORD_MAX)
  password: string;
}
