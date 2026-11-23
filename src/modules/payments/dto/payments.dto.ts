import { Type } from 'class-transformer';
import { BillingPlan, BillingStatus, CardBrand, KycStatus, PaymentItemType, PaymentStatus, PayoutStatus } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, IsUrl, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '@/common/utils/pagination';
import { Trim } from '@/common/utils/transform.decorators';

export class ProcessPaymentDto {
  @IsEnum(PaymentItemType) itemType: PaymentItemType;
  @IsUUID() itemId: string;
  @Trim() @IsString() @MaxLength(30) provider: string;
  /** Obrigatório nos fornecedores de dinheiro móvel (se não vier `methodId`). */
  @IsOptional() @Trim() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsUUID() methodId?: string;
  /** Para onde voltar depois do pagamento alojado (tem de pertencer ao FRONTEND_URL). */
  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(500) returnUrl?: string;
}

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsEnum(PaymentItemType) itemType?: PaymentItemType;
  @IsOptional() @Trim() @IsString() @MaxLength(30) provider?: string;
}

export class AdminListPaymentsQueryDto extends ListPaymentsQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class SaveMethodDto {
  @IsIn(['mobile_money', 'card']) type: 'mobile_money' | 'card';
  @Trim() @IsString() @MaxLength(30) provider: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) label?: string;
  @ValidateIf((o: SaveMethodDto) => o.type === 'mobile_money') @Trim() @IsString() @MaxLength(20) phone?: string;
  @ValidateIf((o: SaveMethodDto) => o.type === 'card') @Trim() @IsString() @MaxLength(100) externalMethodId?: string;
  @ValidateIf((o: SaveMethodDto) => o.type === 'card') @Matches(/^\d{4}$/) last4?: string;
  @ValidateIf((o: SaveMethodDto) => o.type === 'card') @IsEnum(CardBrand) brand?: CardBrand;
  @ValidateIf((o: SaveMethodDto) => o.type === 'card') @Type(() => Number) @IsInt() @Min(1) @Max(12) expMonth?: number;
  @ValidateIf((o: SaveMethodDto) => o.type === 'card') @Type(() => Number) @IsInt() @Min(2000) @Max(2100) expYear?: number;
  @IsOptional() @IsBoolean() makeDefault?: boolean;
}

export class RefundDto { @Trim() @IsString() @MinLength(3) @MaxLength(500) reason: string }
export class ConfirmPaymentDto { @IsOptional() @Trim() @IsString() @MaxLength(100) reference?: string }

export class FinancialReportQueryDto {
  @IsOptional() @IsIn(['7d', '30d', '90d', '12m']) period: '7d' | '30d' | '90d' | '12m' = '30d';
}

// ── Payouts ───────────────────────────────────────────────────────────────

export class DestinationDto {
  @IsIn(['mobile_money', 'bank_transfer']) type: 'mobile_money' | 'bank_transfer';
  @ValidateIf((o: DestinationDto) => o.type === 'mobile_money') @IsIn(['mpesa', 'emola', 'outro']) provider?: 'mpesa' | 'emola' | 'outro';
  @ValidateIf((o: DestinationDto) => o.type === 'mobile_money') @Trim() @IsString() @MaxLength(20) number?: string;
  @ValidateIf((o: DestinationDto) => o.type === 'bank_transfer') @Trim() @IsString() @MinLength(2) @MaxLength(80) bankName?: string;
  @ValidateIf((o: DestinationDto) => o.type === 'bank_transfer') @Trim() @IsString() @Matches(/^[A-Za-z0-9 -]{8,34}$/) accountNumber?: string;
}

export class KycSubmitDto {
  /** NUIT (9 dígitos) ou outro número fiscal. */
  @Trim() @IsString() @Matches(/^[A-Za-z0-9-]{5,30}$/) taxIdentification: string;
}

export class KycDecisionDto {
  @IsIn(['verified', 'rejected']) status: Extract<KycStatus, 'verified' | 'rejected'>;
  @ValidateIf((o: KycDecisionDto) => o.status === 'rejected') @Trim() @IsString() @MinLength(3) @MaxLength(500) reason?: string;
}

export class ListKycQueryDto extends PaginationQueryDto { @IsOptional() @IsEnum(KycStatus) status?: KycStatus }

export class ListPayoutsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(PayoutStatus) status?: PayoutStatus;
}
export class AdminListPayoutsQueryDto extends ListPayoutsQueryDto { @IsOptional() @IsUUID() beneficiaryId?: string }

export class RunPayoutsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) payoutIds?: string[];
}
export class MarkPaidDto { @IsOptional() @Trim() @IsString() @MaxLength(100) reference?: string }
export class MarkFailedDto { @Trim() @IsString() @MinLength(3) @MaxLength(300) reason: string }

export class UpdateBillingDto {
  @IsOptional() @IsEnum(BillingPlan) plan?: BillingPlan;
  @IsOptional() @IsEnum(BillingStatus) status?: BillingStatus;
  @IsOptional() @IsDateString() currentPeriodEnd?: string;
  @IsOptional() @IsBoolean() cancelAtPeriodEnd?: boolean;
}
