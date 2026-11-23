import { IsIn, IsOptional } from 'class-validator';

export class DashboardAnalyticsQueryDto {
  @IsOptional() @IsIn(['7d', '30d', '90d', '12m'])
  period: '7d' | '30d' | '90d' | '12m' = '30d';
}
