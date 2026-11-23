import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 10;
}

export const skipOf = (q: { page: number; limit: number }) => (q.page - 1) * q.limit;

/** Forma de resposta paginada usada nos controllers originais: { success, data, meta }. */
export function paginated<T>(data: T[], total: number, q: { page: number; limit: number }) {
  return {
    success: true,
    data,
    meta: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) },
  };
}

/** Escapa `%`, `_` e `\` para usar o texto do utilizador num `contains` (o Prisma não escapa os curingas do LIKE). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');
