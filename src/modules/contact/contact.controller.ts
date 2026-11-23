import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CreateContactRequestDto, ListContactRequestsQueryDto, UpdateContactStatusDto } from './dto/contact.dto';
import { ContactService } from './contact.service';

const uuid = () => new ParseUUIDPipe();

@Controller('contact')
export class ContactController {
  constructor(private readonly svc: ContactService) {}

  /** Público (com sessão, o pedido fica ligado à conta). 3 por minuto por IP. */
  @OptionalAuth() @Throttle({ default: { limit: 3, ttl: 60_000 } }) @Post()
  create(@Body() dto: CreateContactRequestDto, @CurrentUser() u?: AuthUser) { return this.svc.create(dto, u); }

  @Get('mine') mine(@CurrentUser() u: AuthUser, @Query() q: ListContactRequestsQueryDto) { return this.svc.mine(u, q); }

  @Roles(UserRole.admin) @Get() list(@Query() q: ListContactRequestsQueryDto) { return this.svc.list(q); }
  @Roles(UserRole.admin) @Get(':id') get(@Param('id', uuid()) id: string) { return this.svc.get(id); }
  @Roles(UserRole.admin) @Patch(':id/status')
  status(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: UpdateContactStatusDto) { return this.svc.updateStatus(u, id, dto.status); }
}
