import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser, Public, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CertificatesService } from './certificates.service';
import { ListCertificatesQueryDto, RevokeCertificateDto } from './dto/certificate.dto';

const uuid = () => new ParseUUIDPipe();

/** Rotas estáticas (`verify`, `events`) antes de `:certificateId`. */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly svc: CertificatesService) {}

  @Get() mine(@CurrentUser() u: AuthUser, @Query() q: ListCertificatesQueryDto) { return this.svc.mine(u, q); }

  @Public() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Get('verify/:credentialId')
  verify(@Param('credentialId') id: string) { return this.svc.verify(id.slice(0, 40)); }

  @Roles(UserRole.instructor, UserRole.institution, UserRole.admin) @Post('events/:eventId/issue')
  issueForEvent(@CurrentUser() u: AuthUser, @Param('eventId', uuid()) id: string) { return this.svc.issueForEvent(u, id); }

  @Throttle({ default: { limit: 20, ttl: 60_000 } }) @Get(':certificateId/download')
  async download(@CurrentUser() u: AuthUser, @Param('certificateId', uuid()) id: string, @Res() res: Response) {
    const { pdf, filename } = await this.svc.download(u, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': String(pdf.length), 'Cache-Control': 'private, no-store' }).end(pdf);
  }

  @Roles(UserRole.instructor, UserRole.institution, UserRole.admin) @Patch(':certificateId/revoke')
  revoke(@CurrentUser() u: AuthUser, @Param('certificateId', uuid()) id: string, @Body() dto: RevokeCertificateDto) { return this.svc.revoke(u, id, dto.reason); }
}
