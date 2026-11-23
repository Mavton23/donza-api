import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KycStatus, NotificationType, Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf } from '@/common/utils/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminListPayoutsQueryDto, DestinationDto, KycDecisionDto, KycSubmitDto, ListKycQueryDto, ListPayoutsQueryDto, MarkFailedDto, MarkPaidDto, RunPayoutsDto } from './dto/payments.dto';
import { PaymentProvidersService } from './providers/providers.service';
import { PayoutDestination, WebhookEvent } from './providers/provider.interface';

const BENEFICIARY_ROLES: UserRole[] = ['instructor', 'institution'];
const mask = (s?: string | null) => (s ? `••••${s.slice(-4)}` : null);
const PERSON = { userId: true, username: true, fullName: true, institutionName: true } as const;
const BENEFICIARY = { userId: true, role: true, status: true, kycStatus: true, mobileMoneyNumber: true, mobileMoneyProvider: true, bankName: true, bankAccountNumber: true } as const;
type Beneficiary = Prisma.UserGetPayload<{ select: typeof BENEFICIARY }>;

@Injectable()
export class PayoutsService {
  private readonly log = new Logger(PayoutsService.name);
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly providers: PaymentProvidersService) {}

  private requireBeneficiary(u: AuthUser) {
    if (!BENEFICIARY_ROLES.includes(u.role)) throw new ForbiddenException('Apenas instrutores e instituições recebem pagamentos');
  }

  // ── Destino e KYC ────────────────────────────────────────────────────────

  private destinationOf(u: Beneficiary): PayoutDestination | null {
    if (u.mobileMoneyNumber) return { type: 'mobile_money', provider: u.mobileMoneyProvider ?? 'outro', number: u.mobileMoneyNumber };
    if (u.bankAccountNumber && u.bankName) return { type: 'bank_transfer', bankName: u.bankName, account: u.bankAccountNumber };
    return null;
  }

  async getDestination(user: AuthUser) {
    this.requireBeneficiary(user);
    const u = await this.prisma.user.findUniqueOrThrow({ where: { userId: user.userId }, select: { ...BENEFICIARY, taxIdentification: true, kycVerifiedAt: true } });
    const d = this.destinationOf(u);
    return {
      success: true,
      data: {
        destination: d && (d.type === 'mobile_money' ? { type: d.type, provider: d.provider, number: mask(d.number) } : { type: d.type, bankName: d.bankName, account: mask(d.account) }),
        kyc: { status: u.kycStatus, taxIdentification: mask(u.taxIdentification), verifiedAt: u.kycVerifiedAt },
      },
    };
  }

  async setDestination(user: AuthUser, dto: DestinationDto) {
    this.requireBeneficiary(user);
    const data: Prisma.UserUpdateInput = dto.type === 'mobile_money'
      ? { mobileMoneyNumber: this.normalizeMsisdn(dto.number!), mobileMoneyProvider: dto.provider, bankName: null, bankAccountNumber: null }
      : { bankName: dto.bankName, bankAccountNumber: dto.accountNumber!.replace(/\s/g, '').toUpperCase(), mobileMoneyNumber: null, mobileMoneyProvider: null };
    // Mudar o destino de uma conta verificada obriga a nova verificação (defesa contra desvio de fundos).
    const cur = await this.prisma.user.findUniqueOrThrow({ where: { userId: user.userId }, select: { ...BENEFICIARY } });
    const changed = JSON.stringify(this.destinationOf(cur)) !== JSON.stringify(this.destinationOf({ ...cur, ...(data as object) } as Beneficiary));
    let reverify = false;
    if (changed && cur.kycStatus === 'verified') { data.kycStatus = 'pending'; data.kycVerifiedAt = null; reverify = true; }
    await this.prisma.user.update({ where: { userId: user.userId }, data });
    return { success: true, data: { reverificationRequired: reverify } };
  }

  private normalizeMsisdn(n: string) {
    const d = n.replace(/[\s()-]/g, '').replace(/^\+/, '');
    const national = d.startsWith('258') ? d.slice(3) : d;
    if (!/^8\d{8}$/.test(national)) throw new BadRequestException({ message: 'Número de telemóvel inválido', code: 'INVALID_PHONE' });
    return `258${national}`;
  }

  async submitKyc(user: AuthUser, dto: KycSubmitDto) {
    this.requireBeneficiary(user);
    const { count } = await this.prisma.user.updateMany({ where: { userId: user.userId, kycStatus: { not: 'verified' } }, data: { taxIdentification: dto.taxIdentification, kycStatus: 'pending' } });
    if (!count) throw new ConflictException({ message: 'A verificação já foi concluída', code: 'ALREADY_VERIFIED' });
    return { success: true, message: 'Dados submetidos para verificação' };
  }

  async listKyc(q: ListKycQueryDto) {
    const where: Prisma.UserWhereInput = { role: { in: BENEFICIARY_ROLES }, taxIdentification: { not: null }, kycStatus: q.status ?? 'pending' };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { updatedAt: 'asc' }, skip: skipOf(q), take: q.limit, select: { ...PERSON, role: true, email: true, taxIdentification: true, kycStatus: true, bankName: true, bankAccountNumber: true, mobileMoneyNumber: true, mobileMoneyProvider: true } }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...r, bankAccountNumber: mask(r.bankAccountNumber), mobileMoneyNumber: mask(r.mobileMoneyNumber) })), total, q);
  }

  async decideKyc(userId: string, dto: KycDecisionDto) {
    const target = await this.prisma.user.findUnique({ where: { userId }, select: { role: true } });
    if (!target || !BENEFICIARY_ROLES.includes(target.role)) throw new NotFoundException({ message: 'Utilizador não encontrado', code: 'USER_NOT_FOUND' });
    const { count } = await this.prisma.user.updateMany({
      where: { userId, kycStatus: 'pending', taxIdentification: { not: null } },
      data: { kycStatus: dto.status as KycStatus, kycVerifiedAt: dto.status === 'verified' ? new Date() : null },
    });
    if (!count) throw new ConflictException({ message: 'Não há verificação pendente para este utilizador', code: 'NOT_PENDING' });
    void this.notifications.notify(userId, NotificationType.KYC_DECISION, {
      title: dto.status === 'verified' ? 'Verificação concluída' : 'Verificação recusada',
      message: dto.status === 'verified' ? 'Já pode receber pagamentos.' : `A verificação foi recusada: ${dto.reason}`,
    });
    return { success: true, data: { userId, status: dto.status } };
  }

  // ── Beneficiário ─────────────────────────────────────────────────────────

  async mine(user: AuthUser, q: ListPayoutsQueryDto) {
    this.requireBeneficiary(user);
    const where: Prisma.PayoutWhereInput = { beneficiaryId: user.userId, ...(q.status && { status: q.status }) };
    const now = new Date();
    const [rows, total, sums, available] = await Promise.all([
      this.prisma.payout.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit,
        select: { payoutId: true, amount: true, currency: true, status: true, payoutMethod: true, holdUntil: true, paidAt: true, failureCode: true, createdAt: true, payment: { select: { paymentId: true, course: { select: { courseId: true, title: true } }, event: { select: { eventId: true, title: true } } } } },
      }),
      this.prisma.payout.count({ where }),
      this.prisma.payout.groupBy({ by: ['status', 'currency'], where: { beneficiaryId: user.userId }, _sum: { amount: true } }),
      this.prisma.payout.groupBy({ by: ['currency'], where: { beneficiaryId: user.userId, status: 'pending', OR: [{ holdUntil: null }, { holdUntil: { lte: now } }], payment: { status: 'succeeded' } }, _sum: { amount: true } }),
    ]);
    const summary: Record<string, Record<string, number>> = {};
    for (const s of sums) (summary[s.currency] ??= {})[s.status] = Number(s._sum.amount ?? 0);
    for (const a of available) (summary[a.currency] ??= {}).availableNow = Number(a._sum.amount ?? 0);
    return { ...paginated(rows.map((r) => ({ ...r, amount: Number(r.amount) })), total, q), summary };
  }

  // ── Administração ────────────────────────────────────────────────────────

  async adminList(q: AdminListPayoutsQueryDto) {
    const where: Prisma.PayoutWhereInput = { ...(q.status && { status: q.status }), ...(q.beneficiaryId && { beneficiaryId: q.beneficiaryId }) };
    const [rows, total] = await Promise.all([
      this.prisma.payout.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, include: { beneficiary: { select: { ...PERSON, kycStatus: true } }, payment: { select: { paymentId: true, status: true } } } }),
      this.prisma.payout.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...r, amount: Number(r.amount) })), total, q);
  }

  /** Executa os payouts elegíveis: período de retenção cumprido, pagamento intacto, KYC verificado, destino definido. */
  async run(dto: RunPayoutsDto) {
    const now = new Date();
    const eligibleTime: Prisma.PayoutWhereInput = { status: 'pending', OR: [{ holdUntil: null }, { holdUntil: { lte: now } }], AND: [{ OR: [{ paymentId: null }, { payment: { status: 'succeeded' } }] }] };
    const candidates = await this.prisma.payout.findMany({ where: { ...eligibleTime, ...(dto.payoutIds && { payoutId: { in: dto.payoutIds } }) }, orderBy: { createdAt: 'asc' }, take: 200, include: { beneficiary: { select: BENEFICIARY } } });
    const skipped: { payoutId: string; reason: string }[] = [];
    const results: { payoutId: string; status: string }[] = [];
    if (dto.payoutIds) {
      const found = new Set(candidates.map((c) => c.payoutId));
      for (const id of dto.payoutIds) if (!found.has(id)) skipped.push({ payoutId: id, reason: 'NOT_ELIGIBLE' });
    }
    for (const p of candidates) {
      const b = p.beneficiary;
      const reason = b.status !== 'approved' ? 'USER_NOT_APPROVED' : b.kycStatus !== 'verified' ? 'KYC_NOT_VERIFIED' : !this.destinationOf(b) ? 'NO_DESTINATION' : null;
      if (reason) { skipped.push({ payoutId: p.payoutId, reason }); continue; }
      const dest = this.destinationOf(b)!;
      const method = dest.type === 'mobile_money' ? ('mobile_money' as const) : ('bank_transfer' as const);
      // reclamar: só um executor avança este payout
      const { count } = await this.prisma.payout.updateMany({ where: { payoutId: p.payoutId, ...eligibleTime }, data: { status: 'processing', payoutMethod: method, metadata: { ...(p.metadata as object), destination: dest } as unknown as Prisma.InputJsonValue } });
      if (!count) { skipped.push({ payoutId: p.payoutId, reason: 'ALREADY_CLAIMED' }); continue; }
      const adapter = dest.type === 'mobile_money' && dest.provider ? this.providers.get(dest.provider) : undefined;
      if (adapter?.payout && adapter.isConfigured()) {
        try {
          const r = await adapter.payout({ payoutId: p.payoutId, amount: p.amount.toFixed(2), currency: p.currency, destination: dest });
          await this.prisma.payout.update({ where: { payoutId: p.payoutId }, data: { externalPayoutId: r.externalId, status: r.status === 'paid' ? 'paid' : r.status === 'failed' ? 'failed' : 'processing', paidAt: r.status === 'paid' ? new Date() : null, failureCode: r.failureCode, failureMessage: r.failureMessage } });
          results.push({ payoutId: p.payoutId, status: r.status });
          continue;
        } catch (e) {
          this.log.error(`Payout ${p.payoutId} falhou no fornecedor: ${(e as Error).message}`);
          await this.prisma.payout.update({ where: { payoutId: p.payoutId }, data: { status: 'failed', failureCode: 'PROVIDER_ERROR', failureMessage: (e as Error).message.slice(0, 300) } });
          results.push({ payoutId: p.payoutId, status: 'failed' });
          continue;
        }
      }
      results.push({ payoutId: p.payoutId, status: 'processing' }); // manual: o admin conclui com mark-paid
    }
    return { success: true, data: { started: results, skipped } };
  }

  async markPaid(id: string, dto: MarkPaidDto) {
    const p = await this.prisma.payout.findUnique({ where: { payoutId: id }, select: { metadata: true, beneficiaryId: true, amount: true, currency: true } });
    if (!p) throw new NotFoundException({ message: 'Payout não encontrado', code: 'PAYOUT_NOT_FOUND' });
    const { count } = await this.prisma.payout.updateMany({ where: { payoutId: id, status: 'processing' }, data: { status: 'paid', paidAt: new Date(), metadata: { ...(p.metadata as object), reference: dto.reference ?? null } } });
    if (!count) throw new ConflictException({ message: 'O payout não está em processamento', code: 'NOT_PROCESSING' });
    this.notifyPaid(p.beneficiaryId, p.amount, p.currency);
    return { success: true, message: 'Payout concluído' };
  }

  async markFailed(id: string, dto: MarkFailedDto) {
    const { count } = await this.prisma.payout.updateMany({ where: { payoutId: id, status: 'processing' }, data: { status: 'failed', failureCode: 'MANUAL', failureMessage: dto.reason } });
    if (!count) {
      if (!(await this.prisma.payout.findUnique({ where: { payoutId: id }, select: { payoutId: true } }))) throw new NotFoundException({ message: 'Payout não encontrado', code: 'PAYOUT_NOT_FOUND' });
      throw new ConflictException({ message: 'O payout não está em processamento', code: 'NOT_PROCESSING' });
    }
    return { success: true, message: 'Payout marcado como falhado' };
  }

  async retry(id: string) {
    const { count } = await this.prisma.payout.updateMany({ where: { payoutId: id, status: 'failed' }, data: { status: 'pending', failureCode: null, failureMessage: null, externalPayoutId: null } });
    if (!count) throw new ConflictException({ message: 'Só se repetem payouts falhados', code: 'NOT_FAILED' });
    return { success: true, message: 'Payout reposto como pendente' };
  }

  private notifyPaid(userId: string, amount: Prisma.Decimal, currency: string) {
    void this.notifications.notify(userId, NotificationType.PAYOUT_PAID, { title: 'Pagamento recebido', message: `Foram transferidos ${amount.toFixed(2)} ${currency} para si.` });
  }

  /** Eventos de payout vindos do fornecedor. */
  async applyWebhook(provider: string, ev: WebhookEvent) {
    void provider;
    const p = await this.prisma.payout.findFirst({ where: { externalPayoutId: ev.externalId } });
    if (!p) throw new NotFoundException({ message: 'Payout desconhecido (o fornecedor tentará de novo)', code: 'PAYOUT_NOT_FOUND' });
    if (ev.status === 'paid' || ev.status === 'succeeded') {
      const { count } = await this.prisma.payout.updateMany({ where: { payoutId: p.payoutId, status: 'processing' }, data: { status: 'paid', paidAt: new Date() } });
      if (count) this.notifyPaid(p.beneficiaryId, p.amount, p.currency);
    } else if (ev.status === 'failed') {
      const { count } = await this.prisma.payout.updateMany({ where: { payoutId: p.payoutId, status: 'processing' }, data: { status: 'failed', failureCode: ev.failureCode ?? 'PROVIDER_FAILED', failureMessage: ev.failureMessage } });
      if (count) void this.notifications.notify(p.beneficiaryId, NotificationType.PAYOUT_FAILED, { title: 'Transferência falhada', message: 'Não foi possível transferir o seu pagamento; a equipa vai rever.' });
    }
  }
}
