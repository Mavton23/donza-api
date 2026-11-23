import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Trim } from '@/common/utils/transform.decorators';

export class CompleteProfileDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Nome completo é obrigatório' })
  @MaxLength(150)
  fullName: string;

  @IsOptional() @Trim() @IsString() @MaxLength(2000)
  bio?: string;

  /** Obrigatório (mínimo 3) para instrutores: validado no serviço, que conhece o role. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true })
  expertise?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(60, { each: true })
  interests?: string[];

  @IsOptional() @IsUrl({}, { message: 'URL inválida' })
  website?: string;

  @IsOptional() @IsUrl({}, { message: 'URL do avatar inválida' })
  avatarUrl?: string;
}
