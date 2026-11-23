import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '@/common/utils/transform.decorators';

/** Campos que o próprio aluno pode alterar na sua matrícula. */
export class UpdateEnrollmentDto {
  @IsOptional() @IsBoolean() favorite?: boolean;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) notes?: string;
}
