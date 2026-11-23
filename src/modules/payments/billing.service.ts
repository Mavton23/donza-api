import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';
import { paginated, skipOf, PaginationQueryDto } from '@/common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBillingDto } from './dto/payments.dto';

/** Assinatura da instituição. Cobrança automática de planos não está implementada: o admin define o plano. */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(user: AuthUser, institutionId?: string) {
    const id = user.role === UserRole.admin ? institutionId : user.userId;
    if (!id) throw new ForbiddenException('Indique a instituição');
    if (user.role !== UserRole.admin && user.role !== UserRole.institution) throw new ForbiddenException('Apenas instituições');
    const inst = await this.prisma.user.findUnique({ where: { userId: id }, select: { role: true } });
    if (!inst || inst.role !== UserRole.institution) throw new NotFoundException({ message: 'Instituição não encontrada', code: 'INSTITUTION_NOT_FOUND' });
    return id;
  }

  async current(user: AuthUser, institutionId?: string) {
    const id = await this.scope(user, institutionId);
    const b = await this.prisma.billing.findFirst({ where: { institutionId: id }, orderBy: { createdAt: 'desc' } });
    return { success: true, data: b ? { ...b, originalAmount: b.originalAmount && Number(b.originalAmount), exchangeRate: b.exchangeRate && Number(b.exchangeRate) } : { institutionId: id, plan: 'free', status: 'active' } };
  }

  async invoices(user: AuthUser, q: PaginationQueryDto, institutionId?: string) {
    const id = await this.scope(user, institutionId);
    const where: Prisma.InvoiceWhereInput = { billing: { institutionId: id } };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skipOf(q), take: q.limit }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ ...r, amount: Number(r.amount), platformShare: r.platformShare && Number(r.platformShare), instructorShare: r.instructorShare && Number(r.instructorShare), institutionShare: r.institutionShare && Number(r.institutionShare) })), total, q);
  }

  async adminUpdate(institutionId: string, dto: UpdateBillingDto) {
    await this.scope({ role: UserRole.admin, userId: '' } as AuthUser, institutionId);
    const data = { ...dto, currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : undefined };
    const b = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${institutionId}))`; // um só registo por instituição
      const cur = await tx.billing.findFirst({ where: { institutionId }, orderBy: { createdAt: 'desc' } });
      return cur ? tx.billing.update({ where: { billingId: cur.billingId }, data }) : tx.billing.create({ data: { institutionId, ...data } });
    });
    return { success: true, data: b };
  }
}
