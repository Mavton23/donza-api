import { Injectable } from '@nestjs/common';
import { seriesWindow, SeriesPeriod } from '@/common/utils/time-series';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinancialReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(period: SeriesPeriod) {
    const win = seriesWindow(period);
    const s = win.start;
    const [gross, refunded, byProvider, byItem, statuses, payouts, daily] = await Promise.all([
      this.prisma.$queryRaw<{ currency: string; gross: number; fees: number; n: number }[]>`
        SELECT "currency", COALESCE(SUM("amount"), 0)::float AS gross, COALESCE(SUM("platformFee"), 0)::float AS fees, COUNT(*)::int AS n
        FROM payments WHERE "status" IN ('succeeded', 'refunded') AND "paidAt" >= ${s} GROUP BY "currency"`,
      this.prisma.$queryRaw<{ currency: string; refunded: number; n: number }[]>`
        SELECT "currency", COALESCE(SUM("amount"), 0)::float AS refunded, COUNT(*)::int AS n FROM payments WHERE "status" = 'refunded' AND "refundedAt" >= ${s} GROUP BY "currency"`,
      this.prisma.$queryRaw<{ provider: string; currency: string; total: number; n: number }[]>`
        SELECT "provider", "currency", COALESCE(SUM("amount"), 0)::float AS total, COUNT(*)::int AS n FROM payments WHERE "status" = 'succeeded' AND "paidAt" >= ${s} GROUP BY 1, 2 ORDER BY total DESC`,
      this.prisma.$queryRaw<{ itemType: string; currency: string; total: number; n: number }[]>`
        SELECT "itemType"::text, "currency", COALESCE(SUM("amount"), 0)::float AS total, COUNT(*)::int AS n FROM payments WHERE "status" = 'succeeded' AND "paidAt" >= ${s} GROUP BY 1, 2`,
      this.prisma.payment.groupBy({ by: ['status'], where: { createdAt: { gte: s } }, _count: { _all: true } }),
      this.prisma.payout.groupBy({ by: ['status', 'currency'], where: { createdAt: { gte: s } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ d: string; currency: string; total: number }[]>`
        SELECT to_char(date_trunc(${win.unit}, "paidAt"), ${win.monthly ? 'YYYY-MM' : 'YYYY-MM-DD'}) AS d, "currency", COALESCE(SUM("amount"), 0)::float AS total
        FROM payments WHERE "status" = 'succeeded' AND "paidAt" >= ${s} GROUP BY 1, 2`,
    ]);
    const currencies = [...new Set([...gross.map((g) => g.currency), ...refunded.map((r) => r.currency)])];
    const series = Object.fromEntries(currencies.map((c) => [c, win.labels.map((l) => daily.find((x) => x.d === l && x.currency === c)?.total ?? 0)]));
    return {
      success: true,
      data: {
        period, granularity: win.unit, labels: win.labels,
        totals: currencies.map((c) => {
          const g = gross.find((x) => x.currency === c); const r = refunded.find((x) => x.currency === c);
          return { currency: c, grossRevenue: g?.gross ?? 0, platformFees: g?.fees ?? 0, refunded: r?.refunded ?? 0, refundsCount: r?.n ?? 0, paymentsCount: g?.n ?? 0, netRevenue: (g?.gross ?? 0) - (r?.refunded ?? 0) };
        }),
        byProvider, byItemType: byItem,
        paymentsByStatus: Object.fromEntries(statuses.map((x) => [x.status, x._count._all])),
        payouts: payouts.map((x) => ({ status: x.status, currency: x.currency, amount: Number(x._sum.amount ?? 0), count: x._count._all })),
        series,
      },
    };
  }
}
