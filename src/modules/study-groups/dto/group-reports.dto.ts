import { GroupReportType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';

export class WeekQueryDto {
  @IsOptional() @IsIn(['current', 'previous'])
  week: 'current' | 'previous' = 'previous';
}

export class MonthQueryDto {
  @IsOptional() @IsIn(['current', 'previous'])
  month: 'current' | 'previous' = 'previous';
}

export class TaskReportQueryDto {
  @IsOptional() @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d';
}

export class ListReportsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(GroupReportType)
  type?: GroupReportType;
}
