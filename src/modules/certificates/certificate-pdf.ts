import PDFDocument from 'pdfkit';

export interface CertificatePdfData {
  holder: string;
  title: string;
  kind: 'course' | 'event';
  hours: number;
  issuedAt: Date;
  credentialId: string;
  verificationUrl: string;
  appName: string;
  revoked?: boolean;
}

const fmtDate = (d: Date) => d.toLocaleDateString('pt-PT', { dateStyle: 'long', timeZone: 'Africa/Maputo' });

/** Gera o PDF (A4 horizontal) em memória. Só usa fontes standard do PDF: sem ficheiros externos. */
export function renderCertificatePdf(d: CertificatePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50, info: { Title: `Certificado - ${d.title}`, Author: d.appName } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width, H = doc.page.height;
    doc.rect(25, 25, W - 50, H - 50).lineWidth(3).stroke('#3730a3');
    doc.rect(33, 33, W - 66, H - 66).lineWidth(1).stroke('#a5b4fc');

    doc.fillColor('#3730a3').font('Helvetica-Bold').fontSize(16).text(d.appName.toUpperCase(), 0, 70, { align: 'center', characterSpacing: 4 });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(38).text('CERTIFICADO', 0, 105, { align: 'center' });
    doc.font('Helvetica').fontSize(14).fillColor('#374151').text('Certificamos que', 0, 175, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(30).fillColor('#111827').text(d.holder, 60, 200, { align: 'center', width: W - 120 });
    doc.font('Helvetica').fontSize(14).fillColor('#374151')
      .text(d.kind === 'course' ? 'concluiu com aproveitamento o curso' : 'participou no evento', 0, 252, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#3730a3').text(d.title, 80, 278, { align: 'center', width: W - 160 });
    const y = doc.y + 14;
    doc.font('Helvetica').fontSize(13).fillColor('#374151').text(`${d.hours > 0 ? `Carga horária: ${d.hours} h  •  ` : ''}Emitido em ${fmtDate(d.issuedAt)}`, 0, y, { align: 'center' });

    doc.fontSize(9).fillColor('#6b7280')
      .text(`ID da credencial: ${d.credentialId}`, 60, H - 95, { align: 'left' })
      .text(`Verifique em: ${d.verificationUrl}`, 60, H - 80, { align: 'left', link: d.verificationUrl });
    if (d.revoked) {
      doc.save().rotate(-20, { origin: [W / 2, H / 2] }).font('Helvetica-Bold').fontSize(90).fillColor('#dc2626').opacity(0.25)
        .text('REVOGADO', 0, H / 2 - 45, { align: 'center' }).restore();
    }
    doc.end();
  });
}
