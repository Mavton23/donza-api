import { CertificateStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { Trim } from '@/common/utils/transform.decorators';

export class ListCertificatesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(CertificateStatus)
  status?: CertificateStatus;
}

export class RevokeCertificateDto {
  @Trim() @IsString() @MinLength(5) @MaxLength(500)
  reason: string;
}
