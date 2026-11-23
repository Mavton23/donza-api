import { OmitType, PartialType } from '@nestjs/mapped-types';
import { DifficultyLevel, LessonType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  ValidateNested,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '@/common/utils/transform.decorators';

export class CreateModuleDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(150) title: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) description?: string;
  /** Sem `order` => vai para o fim. */
  @IsOptional() @IsInt() @Min(1) order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
/** A ordem muda só pelo endpoint de reordenação (evita duplicados). */
export class UpdateModuleDto extends PartialType(OmitType(CreateModuleDto, ['order'] as const)) {}

export class CreateLessonDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(150) title: string;
  @IsOptional() @Trim() @IsString() @MaxLength(50000) content?: string;
  @IsOptional() @IsEnum(LessonType) lessonType?: LessonType;
  @IsOptional() @IsEnum(DifficultyLevel) level?: DifficultyLevel;
  /** URL devolvido pelo Cloudinary após o upload directo (validado: tem de ser da pasta deste curso). */
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000) mediaUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  externalResources?: string[];
  /** Segundos. */
  @IsOptional() @IsInt() @Min(0) duration?: number;
  @IsOptional() @IsInt() @Min(1) order?: number;
  @IsOptional() @IsBoolean() isFree?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
export class UpdateLessonDto extends PartialType(OmitType(CreateLessonDto, ['order'] as const)) {}

export class ReorderDto {
  /** IDs na nova ordem. Tem de conter exactamente todos os itens existentes. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true })
  ids: string[];
}

export class SignUploadDto {
  @IsEnum({ video: 'video', audio: 'audio', pdf: 'pdf' } as const, {
    message: 'kind deve ser video, audio ou pdf',
  })
  kind: 'video' | 'audio' | 'pdf';
}

/** Aula dentro de um lote: a ordem é sempre a da lista (acrescentada no fim do módulo). */
export class BatchLessonItemDto extends OmitType(CreateLessonDto, ['order'] as const) {}

export class BatchLessonsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => BatchLessonItemDto)
  lessons: BatchLessonItemDto[];
}
