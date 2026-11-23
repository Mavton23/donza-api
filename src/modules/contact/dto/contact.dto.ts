import { Type } from 'class-transformer';
import { ContactMethod, ContactRequestStatus } from '@prisma/client';
import { IsDate, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { NormalizeEmail, Trim } from '@/common/utils/transform.decorators';

export class CreateContactRequestDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @NormalizeEmail() @IsEmail() @MaxLength(254)
  email: string;

  @IsEnum(ContactMethod)
  contactMethod: ContactMethod;

  @IsOptional() @Trim() @IsString() @MaxLength(150)
  subject?: string;

  /** Obrigatória em email/chat. */
  @ValidateIf((o: CreateContactRequestDto) => o.contactMethod !== ContactMethod.callback || o.message !== undefined)
  @Trim() @IsString() @MinLength(10) @MaxLength(5000)
  message?: string;

  /** Obrigatório em callback. */
  @ValidateIf((o: CreateContactRequestDto) => o.contactMethod === ContactMethod.callback || o.phone !== undefined)
  @Trim() @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'phone inválido' })
  phone?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  preferredTime?: Date;
}

export class UpdateContactStatusDto {
  @IsEnum(ContactRequestStatus)
  status: ContactRequestStatus;
}

export class ListContactRequestsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ContactRequestStatus)
  status?: ContactRequestStatus;

  @IsOptional() @IsEnum(ContactMethod)
  contactMethod?: ContactMethod;

  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;
}
