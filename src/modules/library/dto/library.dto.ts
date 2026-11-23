import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CreateLessonDto } from '@/modules/courses/dto/content.dto';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { ToBoolean, Trim } from '@/common/utils/transform.decorators';

export class CreateLibraryModuleDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(150) title: string;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
export class UpdateLibraryModuleDto extends PartialType(CreateLibraryModuleDto) {}

export class AttachModuleDto { @IsUUID() courseId: string }

export class LibraryLessonsQueryDto extends PaginationQueryDto {
  @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @ToBoolean() @IsBoolean() free?: boolean;
  @IsOptional() @IsUUID() instructorId?: string;
}

export class LibrarySignDto {
  @IsIn(['video', 'audio', 'pdf']) kind: 'video' | 'audio' | 'pdf';
}
