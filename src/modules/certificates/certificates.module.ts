import { Global, Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

/** Global: a conclusão de curso (CoursesModule) emite o certificado sem dependência circular. */
@Global()
@Module({ controllers: [CertificatesController], providers: [CertificatesService], exports: [CertificatesService] })
export class CertificatesModule {}
