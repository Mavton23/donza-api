import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, PaymentItemType, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { escapeLike, paginated, skipOf } from '@/common/utils/pagination';
import { EnrollmentsService } from '../courses/enrollments.service';
import { displayName } from '../courses/course-access';
import { EventsService } from '../events/events.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminListPaymentsQueryDto, ConfirmPaymentDto, ListPaymentsQueryDto, ProcessPaymentDto, RefundDto, SaveMethodDto } from './dto/payments.dto';
import { PayoutsService } from './payouts.service';
import { PaymentProvidersService } from './providers/providers.service';
import { WebhookEvent } from './providers/provider.interface';

const OPEN: PaymentStatus[] = ['pending', 'processing'];
const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const money = (cents: number) => (cents / 100).toFixed(2);
const cents = (d: Prisma.Decimal | number | string) => Math.round(Number(d) * 100);
const PUBLIC_SELECT = {
  paymentId: true, itemType: true, courseId: true, eventId: true, amount: true, currency: true, provider: true, status: true,
  checkoutUrl: true, instructions: true, failureCode: true, failureMessage: true, paidAt: true, fulfilledAt: true, refundedAt: true, createdAt: true,
  course: { select: { courseId: true, title: true, slug: true } }, event: { select: { eventId: true, title: true } },
} as const;

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly providers: PaymentProvidersService,
    private readonly enrollments: EnrollmentsService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly payouts: PayoutsService,
  ) {}

  private num(key: string, def: number) { const v = Number(this.config.get(key)); return Number.isFinite(v) && this.config.get(key) !== undefined && this.config.get(key) !== '' ? v : def; }
  private get feePct() { return Math.min(100, Math.max(0, this.num('PLATFORM_FEE_PERCENT', 15))); }
  private get institutionPct() { return Math.min(100, Math.max(0, this.num('INSTITUTION_SHARE_PERCENT', 30))); }
  private get holdDays() { return Math.max(0, this.num('PAYOUT_HOLD_DAYS', 7)); }
  private get defaultCurrency() { return (this.config.get<string>('PAYMENTS_DEFAULT_CURRENCY') || 'MZN').toUpperCase(); }

  private shape<T extends { amount: Prisma.Decimal }>(p: T) { return { ...p, amount: Number(p.amount) }; }

  // ── Fornecedores e métodos guardados ─────────────────────────────────────

  providersList() {
    return {
      success: true,
      data: this.providers.enabled().map((p) => ({ id: p.id, name: p.name, methods: p.methods, currencies: p.currencies, requiresPhone: p.requiresPhone, manualConfirmation: p.manualConfirmation })),
    };
  }

  async listMethods(user: AuthUser) {
    const rows = await this.prisma.savedPaymentMethod.findMany({ where: { userId: user.userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
    return { success: true, data: rows };
  }

  async saveMethod(user: AuthUser, dto: SaveMethodDto) {
    const prov = this.providers.get(dto.provider);
    if (!prov || !prov.isConfigured()) throw new BadRequestException({ message: 'Fornecedor indisponível', code: 'PROVIDER_UNAVAILABLE' });
    const phone = dto.type === 'mobile_money' ? (prov.validatePhone ? prov.validatePhone(dto.phone!) : (() => { throw new BadRequestException({ message: 'Este fornecedor não usa dinheiro móvel', code: 'PROVIDER_UNSUPPORTED' }); })()) : undefined;
    if (dto.type === 'card' && !prov.methods.includes('credit_card')) throw new BadRequestException({ message: 'Este fornecedor não aceita cartões', code: 'PROVIDER_UNSUPPORTED' });
    const type = dto.type === 'mobile_money' ? 'mobile_method' : 'credit_card';
    const label = dto.label ?? (dto.type === 'mobile_money' ? `${prov.name} ${phone!.slice(-4)}` : `${dto.brand} •••• ${dto.last4}`);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const count = await tx.savedPaymentMethod.count({ where: { userId: user.userId } });
        if (count >= 10) throw new BadRequestException({ message: 'Máximo de 10 métodos guardados', code: 'TOO_MANY_METHODS' });
        const makeDefault = dto.makeDefault === true || count === 0;
        if (makeDefault) await tx.savedPaymentMethod.updateMany({ where: { userId: user.userId, isDefault: true }, data: { isDefault: false } });
        return tx.savedPaymentMethod.create({ data: { userId: user.userId, provider: prov.id, type, label, phone, last4: dto.last4, brand: dto.brand, expMonth: dto.expMonth, expYear: dto.expYear, externalMethodId: dto.externalMethodId, isDefault: makeDefault } });
      });
      return { success: true, data: created };
    } catch (e) {
      if (isP2002(e)) throw new ConflictException({ message: 'Este método já está guardado', code: 'METHOD_EXISTS' });
      throw e;
    }
  }

  async setDefaultMethod(user: AuthUser, methodId: string) {
    await this.prisma.$transaction(async (tx) => {
      const m = await tx.savedPaymentMethod.findFirst({ where: { methodId, userId: user.userId } });
      if (!m) throw new NotFoundException({ message: 'Método não encontrado', code: 'METHOD_NOT_FOUND' });
      await tx.savedPaymentMethod.updateMany({ where: { userId: user.userId, isDefault: true }, data: { isDefault: false } });
      await tx.savedPaymentMethod.update({ where: { methodId }, data: { isDefault: true } });
    });
    return { success: true, message: 'Método predefinido actualizado' };
  }

  async removeMethod(user: AuthUser, methodId: string) {
    await this.prisma.$transaction(async (tx) => {
      const m = await tx.savedPaymentMethod.findFirst({ where: { methodId, userId: user.userId } });
      if (!m) throw new NotFoundException({ message: 'Método não encontrado', code: 'METHOD_NOT_FOUND' });
      await tx.savedPaymentMethod.delete({ where: { methodId } });
      if (m.isDefault) {
        const next = await tx.savedPaymentMethod.findFirst({ where: { userId: user.userId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.savedPaymentMethod.update({ where: { methodId: next.methodId }, data: { isDefault: true } });
      }
    });
    return { success: true, message: 'Método removido' };
  }

  // ── Compra ───────────────────────────────────────────────────────────────

  private async resolveItem(userId: string, type: PaymentItemType, id: string) {
    if (type === 'course') {
      const c = await this.prisma.course.findFirst({ where: { courseId: id, status: 'published', isPublic: true }, select: { courseId: true, title: true, slug: true, price: true, currency: true, instructorId: true, organizerId: true } });
      if (!c) throw new NotFoundException({ message: 'Curso não encontrado ou indisponível', code: 'ITEM_NOT_FOUND' });
      if (c.instructorId === userId || c.organizerId === userId) throw new BadRequestException('Não pode comprar o seu próprio curso');
      if (c.price.lte(0)) throw new BadRequestException({ message: 'Este curso é gratuito: matricule-se directamente', code: 'ITEM_FREE' });
      const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: id } }, select: { status: true } });
      if (enrolled && enrolled.status !== 'canceled') throw new ConflictException({ message: 'Já está matriculado neste curso', code: 'ALREADY_ENROLLED' });
      return { title: c.title, price: c.price, currency: c.currency.toUpperCase(), ownerId: c.instructorId, organizerId: c.organizerId, path: `/courses/${c.slug}` };
    }
    const e = await this.prisma.event.findUnique({ where: { eventId: id }, select: { eventId: true, title: true, price: true, organizerId: true, status: true, startDate: true } });
    if (!e) throw new NotFoundException({ message: 'Evento não encontrado', code: 'ITEM_NOT_FOUND' });
    if (e.organizerId === userId) throw new BadRequestException('Não pode comprar o seu próprio evento');
    if (e.status !== 'scheduled' || e.startDate <= new Date()) throw new BadRequestException({ message: 'Este evento não está a aceitar inscrições', code: 'ITEM_UNAVAILABLE' });
    if (e.price.lte(0)) throw new BadRequestException({ message: 'Este evento é gratuito: inscreva-se directamente', code: 'ITEM_FREE' });
    const reg = await this.prisma.eventParticipant.findUnique({ where: { userId_eventId: { userId, eventId: id } }, select: { status: true } });
    if (reg && reg.status !== 'cancelled') throw new ConflictException({ message: 'Já está inscrito neste evento', code: 'ALREADY_ENROLLED' });
    return { title: e.title, price: e.price, currency: this.defaultCurrency, ownerId: e.organizerId, organizerId: null as string | null, path: `/events/${e.eventId}` };
  }

  private safeReturn(url: string | undefined, fallback: string) {
    if (!url) return fallback;
    const allowed = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').split(',').map((o) => o.trim().replace(/\/$/, ''));
    try { if (allowed.includes(new URL(url).origin)) return url; } catch { /* inválido */ }
    throw new BadRequestException({ message: 'returnUrl fora do domínio da aplicação', code: 'INVALID_RETURN_URL' });
  }

  async process(user: AuthUser, dto: ProcessPaymentDto, idempotencyKey?: string) {
    if (user.role === UserRole.admin) throw new ForbiddenException('Administradores não compram conteúdos');
    if (idempotencyKey !== undefined && !/^[\w-]{8,100}$/.test(idempotencyKey)) throw new BadRequestException({ message: 'Idempotency-Key inválida (8–100 caracteres alfanuméricos)', code: 'INVALID_IDEMPOTENCY_KEY' });

    if (idempotencyKey) {
      const prev = await this.prisma.payment.findUnique({ where: { userId_idempotencyKey: { userId: user.userId, idempotencyKey } }, select: { ...PUBLIC_SELECT, ...{} } });
      if (prev) {
        const same = (prev.courseId ?? prev.eventId) === dto.itemId && prev.provider === dto.provider;
        if (!same) throw new ConflictException({ message: 'Idempotency-Key já usada noutro pedido', code: 'IDEMPOTENCY_CONFLICT' });
        return { success: true, data: this.shape(prev), idempotentReplay: true };
      }
    }

    const prov = this.providers.get(dto.provider);
    if (!prov || !prov.isConfigured()) throw new BadRequestException({ message: 'Fornecedor de pagamento indisponível', code: 'PROVIDER_UNAVAILABLE' });
    const item = await this.resolveItem(user.userId, dto.itemType, dto.itemId);
    if (prov.currencies !== '*' && !prov.currencies.includes(item.currency)) {
      throw new BadRequestException({ message: `${prov.name} não aceita ${item.currency}`, code: 'CURRENCY_UNSUPPORTED' });
    }

    let phone: string | undefined;
    let methodToken: string | undefined;
    if (dto.methodId) {
      const m = await this.prisma.savedPaymentMethod.findFirst({ where: { methodId: dto.methodId, userId: user.userId } });
      if (!m || m.provider !== prov.id) throw new BadRequestException({ message: 'Método guardado inválido para este fornecedor', code: 'INVALID_METHOD' });
      phone = m.phone ?? undefined; methodToken = m.externalMethodId ?? undefined;
    }
    phone = dto.phone ?? phone;
    if (prov.requiresPhone) {
      if (!phone) throw new BadRequestException({ message: 'Indique o número de telemóvel', code: 'PHONE_REQUIRED' });
      phone = prov.validatePhone ? prov.validatePhone(phone) : phone;
    } else phone = undefined;

    const base = this.config.get<string>('FRONTEND_URL')?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const returnUrl = this.safeReturn(dto.returnUrl, `${base}${item.path}?payment=return`);
    const where = dto.itemType === 'course' ? { courseId: dto.itemId } : { eventId: dto.itemId };

    // Linha criada ANTES de falar com o fornecedor; os índices parciais impedem duplicados em corridas.
    let payment;
    try {
      payment = await this.prisma.payment.create({
        data: { userId: user.userId, itemType: dto.itemType, ...where, amount: item.price, currency: item.currency, provider: prov.id, idempotencyKey, phoneNumber: phone, metadata: { title: item.title } },
      });
    } catch (e) {
      if (isP2002(e)) {
        const open = await this.prisma.payment.findFirst({ where: { userId: user.userId, ...where, status: { in: OPEN } }, select: { paymentId: true } });
        throw new ConflictException({ message: open ? 'Já existe um pagamento em curso para este conteúdo' : 'Pedido duplicado', code: open ? 'PAYMENT_PENDING' : 'DUPLICATE_REQUEST', paymentId: open?.paymentId });
      }
      throw e;
    }

    const me = await this.prisma.user.findUniqueOrThrow({ where: { userId: user.userId }, select: { email: true } });
    try {
      const r = await prov.charge({ paymentId: payment.paymentId, amount: item.price.toFixed(2), currency: item.currency, description: item.title, customer: { userId: user.userId, email: me.email }, phone, returnUrl, cancelUrl: returnUrl, methodToken });
      await this.prisma.payment.update({ where: { paymentId: payment.paymentId }, data: { externalId: r.externalId, checkoutUrl: r.checkoutUrl, instructions: (r.instructions ?? undefined) as Prisma.InputJsonValue | undefined, status: r.status === 'processing' ? 'processing' : 'pending', failureCode: r.failureCode, failureMessage: r.failureMessage } });
      if (r.status === 'succeeded') await this.applyStatus(payment.paymentId, 'succeeded');
      if (r.status === 'failed') await this.applyStatus(payment.paymentId, 'failed', { code: r.failureCode, message: r.failureMessage });
    } catch (e) {
      await this.applyStatus(payment.paymentId, 'failed', { code: 'PROVIDER_ERROR', message: e instanceof HttpException ? JSON.stringify(e.getResponse()).slice(0, 300) : (e as Error).message });
      if (e instanceof HttpException) throw e;
      throw new HttpException({ message: 'Falha ao contactar o fornecedor de pagamentos', code: 'PROVIDER_ERROR' }, HttpStatus.BAD_GATEWAY);
    }
    const fresh = await this.prisma.payment.findUniqueOrThrow({ where: { paymentId: payment.paymentId }, select: PUBLIC_SELECT });
    return { success: true, data: this.shape(fresh) };
  }

  // ── Transições de estado (única porta de entrada: webhooks, admin, imediatas) ──

  /** Aplica um estado de forma atómica e idempotente. Devolve `true` se este chamador provocou a transição. */
  async applyStatus(paymentId: string, to: 'succeeded' | 'failed' | 'canceled' | 'processing', info: { code?: string; message?: string } = {}) {
    if (to === 'processing') {
      const { count } = await this.prisma.payment.updateMany({ where: { paymentId, status: 'pending' }, data: { status: 'processing' } });
      return count > 0;
    }
    if (to === 'failed' || to === 'canceled') {
      const { count } = await this.prisma.payment.updateMany({ where: { paymentId, status: { in: OPEN } }, data: { status: to, failureCode: info.code, failureMessage: info.message } });
      if (count && to === 'failed') {
        const p = await this.prisma.payment.findUnique({ where: { paymentId }, select: { userId: true, metadata: true } });
        if (p) void this.notifications.notify(p.userId, NotificationType.PAYMENT_FAILED, { title: 'Pagamento falhado', message: `O pagamento de "${(p.metadata as { title?: string }).title ?? 'conteúdo'}" não foi concluído.`, relatedEntityId: paymentId });
      }
      return count > 0;
    }
    // succeeded: aceita-se mesmo depois de cancelado/falhado localmente — se o dinheiro chegou, o acesso tem de ser dado.
    const done = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { paymentId } });
      if (!p) return false;
      const { count } = await tx.payment.updateMany({ where: { paymentId, status: { in: ['pending', 'processing', 'failed', 'canceled'] } }, data: { status: 'succeeded', paidAt: new Date(), failureCode: null, failureMessage: null } });
      if (!count) return false;
      await this.createSplits(tx, p);
      return true;
    });
    if (done) {
      await this.fulfill(paymentId);
      void this.afterSuccess(paymentId);
    }
    return done;
  }

  /** Divide o valor: comissão da plataforma, depois (se houver instituição organizadora) instrutor/instituição. */
  private async createSplits(tx: Prisma.TransactionClient, p: { paymentId: string; amount: Prisma.Decimal; courseId: string | null; eventId: string | null }) {
    const total = cents(p.amount);
    const fee = Math.round((total * this.feePct) / 100);
    const net = total - fee;
    let ownerId: string, organizerId: string | null = null;
    if (p.courseId) {
      const c = await tx.course.findUniqueOrThrow({ where: { courseId: p.courseId }, select: { instructorId: true, organizerId: true } });
      ownerId = c.instructorId; organizerId = c.organizerId;
    } else {
      ownerId = (await tx.event.findUniqueOrThrow({ where: { eventId: p.eventId! }, select: { organizerId: true } })).organizerId;
    }
    const parties: { userId: string; cents: number }[] = [];
    if (organizerId && organizerId !== ownerId) {
      const ownerRole = (await tx.user.findUniqueOrThrow({ where: { userId: ownerId }, select: { role: true } })).role;
      if (ownerRole === 'institution') parties.push({ userId: ownerId, cents: net });
      else {
        const inst = Math.round((net * this.institutionPct) / 100);
        parties.push({ userId: organizerId, cents: inst }, { userId: ownerId, cents: net - inst });
      }
    } else parties.push({ userId: ownerId, cents: net });

    await tx.payment.update({ where: { paymentId: p.paymentId }, data: { platformFee: money(fee) } });
    const users = await tx.user.findMany({ where: { userId: { in: parties.map((x) => x.userId) } }, select: { userId: true, role: true, mobileMoneyNumber: true } });
    const role = new Map(users.map((u) => [u.userId, u]));
    const currency = (await tx.payment.findUniqueOrThrow({ where: { paymentId: p.paymentId }, select: { currency: true } })).currency;
    const hold = new Date(Date.now() + this.holdDays * 86_400_000);
    await tx.payout.createMany({
      skipDuplicates: true,
      data: parties.filter((x) => x.cents > 0).map((x) => ({
        paymentId: p.paymentId, beneficiaryId: x.userId, beneficiaryType: role.get(x.userId)!.role === 'institution' ? ('institution' as const) : ('instructor' as const),
        amount: money(x.cents), currency, payoutMethod: role.get(x.userId)!.mobileMoneyNumber ? ('mobile_money' as const) : ('bank_transfer' as const), holdUntil: hold,
      })),
    });
  }

  /** Matrícula/inscrição. Idempotente; se falhar fica por cumprir (`fulfilledAt` nulo) e pode repetir-se. */
  async fulfill(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { paymentId } });
    if (!p || p.status !== 'succeeded' || p.fulfilledAt) return !!p?.fulfilledAt;
    try {
      if (p.courseId) await this.enrollments.enroll(p.userId, p.courseId, { allowPaid: true });
      else await this.events.register(p.userId, p.eventId!, { allowPaid: true });
    } catch (e) {
      if (!(e instanceof ConflictException)) { // "já matriculado" conta como cumprido
        this.log.error(`Pagamento ${paymentId} recebido mas não cumprido: ${(e as Error).message}`);
        await this.prisma.payment.update({ where: { paymentId }, data: { metadata: { ...(p.metadata as object), fulfillError: (e as Error).message.slice(0, 300) } } });
        return false;
      }
    }
    await this.prisma.payment.updateMany({ where: { paymentId, fulfilledAt: null }, data: { fulfilledAt: new Date() } });
    return true;
  }

  private async afterSuccess(paymentId: string) {
    try {
      const p = await this.prisma.payment.findUniqueOrThrow({ where: { paymentId }, include: { user: { select: { email: true, fullName: true, username: true } }, course: { select: { title: true, slug: true, instructor: { select: { role: true, institutionName: true, fullName: true, username: true } } } }, event: { select: { eventId: true, title: true, organizer: { select: { role: true, institutionName: true, fullName: true, username: true } } } } } });
      const title = p.course?.title ?? p.event?.title ?? '';
      const owner = p.course?.instructor ?? p.event?.organizer;
      void this.notifications.notify(p.userId, NotificationType.PAYMENT_SUCCEEDED, { title: 'Pagamento confirmado', message: `Recebemos o pagamento de "${title}".`, relatedEntityId: paymentId });
      await this.mail.sendTemplate('payment-confirmation', p.user.email, {
        studentName: p.user.fullName ?? p.user.username, courseTitle: title, instructorName: owner ? displayName(owner) : '', amount: Number(p.amount).toFixed(2), currency: p.currency,
        paymentDate: (p.paidAt ?? new Date()).toISOString().slice(0, 10), paymentMethod: p.provider, transactionId: p.paymentId,
        courseUrl: `${this.mail.appUrl}${p.course ? `/courses/${p.course.slug}` : `/events/${p.event!.eventId}`}`, dashboardUrl: `${this.mail.appUrl}/dashboard`,
      });
    } catch (e) { this.log.error(`Falha no pós-pagamento ${paymentId}: ${(e as Error).message}`); }
  }

  // ── Consulta ─────────────────────────────────────────────────────────────

  async history(user: AuthUser, q: ListPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = { userId: user.userId, ...(q.status && { status: q.status }), ...(q.itemType && { itemType: q.itemType }), ...(q.provider && { provider: q.provider }) };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: PUBLIC_SELECT }),
      this.prisma.payment.count({ where }),
    ]);
    return paginated(rows.map((r) => this.shape(r)), total, q);
  }

  async detail(user: AuthUser, paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { paymentId }, select: { ...PUBLIC_SELECT, userId: true } });
    if (!p || (p.userId !== user.userId && user.role !== UserRole.admin)) throw new NotFoundException({ message: 'Pagamento não encontrado', code: 'PAYMENT_NOT_FOUND' });
    return { success: true, data: this.shape(p) };
  }

  /** Reavalia um pagamento pago mas não cumprido (o dono ou o admin). */
  async retryFulfill(user: AuthUser, paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { paymentId }, select: { userId: true, status: true } });
    if (!p || (p.userId !== user.userId && user.role !== UserRole.admin)) throw new NotFoundException({ message: 'Pagamento não encontrado', code: 'PAYMENT_NOT_FOUND' });
    if (p.status !== 'succeeded') throw new ConflictException({ message: 'Só pagamentos concluídos se cumprem', code: 'NOT_SUCCEEDED' });
    const ok = await this.fulfill(paymentId);
    return { success: true, data: { fulfilled: ok } };
  }

  async cancel(user: AuthUser, paymentId: string) {
    const p = await this.prisma.payment.findFirst({ where: { paymentId, userId: user.userId } });
    if (!p) throw new NotFoundException({ message: 'Pagamento não encontrado', code: 'PAYMENT_NOT_FOUND' });
    if (!(await this.applyStatus(paymentId, 'canceled', { code: 'USER_CANCELED' }))) throw new ConflictException({ message: 'Só se cancelam pagamentos em curso', code: 'NOT_CANCELABLE' });
    return { success: true, message: 'Pagamento cancelado' };
  }

  // ── Administração ────────────────────────────────────────────────────────

  async adminList(q: AdminListPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status && { status: q.status }), ...(q.itemType && { itemType: q.itemType }), ...(q.provider && { provider: q.provider }), ...(q.userId && { userId: q.userId }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit, select: { ...PUBLIC_SELECT, userId: true, externalId: true, platformFee: true, user: { select: { userId: true, username: true, email: true } } } }),
      this.prisma.payment.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...this.shape(r), platformFee: Number(r.platformFee) })), total, q);
  }

  /** Transferência bancária: o admin confirma que o dinheiro chegou. */
  async confirm(admin: AuthUser, paymentId: string, dto: ConfirmPaymentDto) {
    const p = await this.prisma.payment.findUnique({ where: { paymentId } });
    if (!p) throw new NotFoundException({ message: 'Pagamento não encontrado', code: 'PAYMENT_NOT_FOUND' });
    if (!this.providers.get(p.provider)?.manualConfirmation) throw new BadRequestException({ message: 'Este pagamento é confirmado pelo fornecedor', code: 'NOT_MANUAL' });
    if (p.status !== 'pending' && p.status !== 'processing') throw new ConflictException({ message: 'O pagamento já não está pendente', code: 'NOT_PENDING' });
    await this.prisma.payment.update({ where: { paymentId }, data: { metadata: { ...(p.metadata as object), confirmedBy: admin.userId, bankReference: dto.reference ?? null } } });
    if (!(await this.applyStatus(paymentId, 'succeeded'))) throw new ConflictException({ message: 'O pagamento já foi tratado', code: 'ALREADY_HANDLED' });
    return { success: true, message: 'Pagamento confirmado' };
  }

  async refund(admin: AuthUser, paymentId: string, dto: RefundDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM payments WHERE "paymentId" = ${paymentId}::uuid FOR UPDATE`;
      const p = await tx.payment.findUnique({ where: { paymentId } });
      if (!p) throw new NotFoundException({ message: 'Pagamento não encontrado', code: 'PAYMENT_NOT_FOUND' });
      if (p.status !== 'succeeded') throw new ConflictException({ message: 'Só se reembolsam pagamentos concluídos', code: 'NOT_REFUNDABLE' });
      const prov = this.providers.get(p.provider);
      if (!prov) throw new BadRequestException({ message: 'Fornecedor desconhecido', code: 'PROVIDER_UNAVAILABLE' });
      if (prov.isConfigured() && p.externalId) await prov.refund({ externalId: p.externalId, amount: p.amount.toFixed(2), currency: p.currency, idempotencyKey: p.paymentId });
      await tx.payment.update({ where: { paymentId }, data: { status: 'refunded', refundedAt: new Date(), refundReason: dto.reason } });
      // pagamentos a beneficiários ainda não iniciados são anulados; os já pagos/em curso ficam sinalizados para recuperação
      const reversed = await tx.payout.updateMany({ where: { paymentId, status: 'pending' }, data: { status: 'reversed' } });
      const flagged = await tx.payout.findMany({ where: { paymentId, status: { in: ['processing', 'paid'] } }, select: { payoutId: true, metadata: true } });
      for (const f of flagged) await tx.payout.update({ where: { payoutId: f.payoutId }, data: { metadata: { ...(f.metadata as object), clawbackRequired: true } } });
      // retira o acesso
      if (p.courseId) await tx.enrollment.updateMany({ where: { userId: p.userId, courseId: p.courseId, status: { not: 'canceled' } }, data: { status: 'canceled' } });
      else await tx.eventParticipant.updateMany({ where: { userId: p.userId, eventId: p.eventId!, status: { not: 'cancelled' } }, data: { status: 'cancelled' } });
      return { userId: p.userId, reversed: reversed.count, clawbacks: flagged.length };
    });
    void this.notifications.notify(result.userId, NotificationType.PAYMENT_REFUNDED, { title: 'Pagamento reembolsado', message: `O seu pagamento foi reembolsado: ${dto.reason}`, relatedEntityId: paymentId });
    return { success: true, data: { paymentId, payoutsReversed: result.reversed, payoutsNeedingClawback: result.clawbacks } };
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  async handleWebhook(providerId: string, raw: Buffer | undefined, headers: Record<string, string | string[] | undefined>) {
    const prov = this.providers.get(providerId);
    if (!prov || !prov.isConfigured() || prov.manualConfirmation) throw new NotFoundException();
    if (!raw) throw new BadRequestException('Corpo em bruto indisponível');
    const ev = prov.verifyWebhook(raw, headers); // lança 401 se a assinatura falhar
    if (!ev) return { received: true, ignored: true };

    const inserted = await this.prisma.$executeRaw`
      INSERT INTO payment_webhook_events ("provider", "eventId", "payload") VALUES (${providerId}, ${ev.eventId}, ${JSON.stringify(ev)}::jsonb) ON CONFLICT DO NOTHING`;
    if (!inserted) {
      const seen = await this.prisma.paymentWebhookEvent.findUnique({ where: { provider_eventId: { provider: providerId, eventId: ev.eventId } }, select: { processedAt: true } });
      if (seen?.processedAt) return { received: true, duplicate: true };
    }
    try {
      await this.processEvent(providerId, ev);
    } catch (e) {
      // não fica "visto": o fornecedor volta a tentar
      await this.prisma.paymentWebhookEvent.deleteMany({ where: { provider: providerId, eventId: ev.eventId, processedAt: null } });
      throw e;
    }
    await this.prisma.paymentWebhookEvent.updateMany({ where: { provider: providerId, eventId: ev.eventId }, data: { processedAt: new Date() } });
    return { received: true };
  }

  private async processEvent(provider: string, ev: WebhookEvent) {
    if (ev.kind === 'payout') return this.payouts.applyWebhook(provider, ev);
    const p = await this.prisma.payment.findUnique({ where: { provider_externalId: { provider, externalId: ev.externalId } } });
    if (!p) throw new NotFoundException({ message: 'Pagamento desconhecido (o fornecedor tentará de novo)', code: 'PAYMENT_NOT_FOUND' });
    if (ev.status === 'succeeded') {
      if ((ev.amountMinor !== undefined && ev.amountMinor !== cents(p.amount)) || (ev.currency && ev.currency !== p.currency)) {
        this.log.error(`Webhook ${ev.eventId}: montante/moeda não coincidem com o pagamento ${p.paymentId}`);
        await this.prisma.payment.update({ where: { paymentId: p.paymentId }, data: { metadata: { ...(p.metadata as object), amountMismatch: { got: ev.amountMinor, currency: ev.currency } } } });
        return; // nunca damos acesso por um valor diferente
      }
      await this.applyStatus(p.paymentId, 'succeeded');
    } else if (ev.status === 'failed' || ev.status === 'canceled') await this.applyStatus(p.paymentId, ev.status, { code: ev.failureCode, message: ev.failureMessage });
    else if (ev.status === 'processing') await this.applyStatus(p.paymentId, 'processing');
  }
}
