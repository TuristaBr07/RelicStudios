import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Row } from '../lib/db.js';
import { dateOnly } from '../lib/core.js';

const money = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
const date = (s: unknown) => dateOnly(s).split('-').reverse().join('/');
const logoPath = fileURLToPath(
  new URL('../../../frontend/public/assets/relic-logo.png', import.meta.url),
);

export function quotePdf(q: Row): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 132, left: 44, right: 44, bottom: 78 },
      bufferPages: true,
      info: {
        Title: `Relic Studios - ${q.code}`,
        Author: 'Relic Studios',
        Subject: 'Orçamento comercial',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const regular = 'Helvetica';
    const bold = 'Helvetica-Bold';
    doc.font(regular);
    const charcoal = '#25282e';
    const amber = '#f2a51a';
    const amberDark = '#b96b0b';
    const gray = '#66635e';
    const cream = '#f7f1e7';
    const width = 507;
    const header = () => {
      doc.rect(0, 0, 596, 108).fill(charcoal);
      if (existsSync(logoPath)) doc.image(logoPath, 44, 14, { fit: [66, 78] });
      doc.fillColor('#ffffff').font(bold).fontSize(18).text('Relic Studios', 121, 28);
      doc
        .fillColor(amber)
        .font(regular)
        .fontSize(7.5)
        .text('ACTION FIGURES • COLECIONÁVEIS', 122, 55);
      doc
        .fillColor('#d8d1c6')
        .font(regular)
        .fontSize(8)
        .text('ORÇAMENTO COMERCIAL', 334, 33, { width: 216, align: 'right' });
      doc
        .fillColor('#ffffff')
        .font(bold)
        .fontSize(13)
        .text(q.code, 334, 55, { width: 216, align: 'right' });
      doc.y = 132;
      doc.x = 44;
    };
    const room = (height: number) => {
      if (doc.y + height > 758) doc.addPage();
    };
    const paragraph = (text: string, size = 9) => {
      doc.font(regular).fontSize(size);
      const h = doc.heightOfString(text, { width });
      room(h + 10);
      doc.fillColor(gray).text(text, 44, doc.y, { width, lineGap: 3 });
      doc.moveDown(0.5);
    };
    doc.fillColor(charcoal).font(bold).fontSize(22).text('Sua próxima peça de coleção', 44, doc.y);
    doc.moveDown(0.6);
    paragraph(`Preparado para ${q.client_snapshot.name}`, 11);
    paragraph([q.client_snapshot.email, q.client_snapshot.phone].filter(Boolean).join('  |  '));
    paragraph(
      `Emissão: ${date(q.created_at)}    •    Validade: ${date(q.valid_until)}    •    Prazo: ${q.lead_days} dias após a entrada`,
    );
    if (q.status === 'DRAFT') paragraph('RASCUNHO - proposta ainda não enviada.', 9);
    if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(q.status))
      paragraph(`Proposta sem vigência (${q.status}).`, 9);
    doc.moveDown(0.8);
    for (const item of q.items as Row[]) {
      const desc = [
        item.description,
        item.character_name && `Personagem: ${item.character_name}`,
        item.scale && `Escala: ${item.scale}`,
      ]
        .filter(Boolean)
        .join('\n');
      doc.font(bold).fontSize(10);
      const height = Math.max(70, doc.heightOfString(desc, { width: 300, lineGap: 4 }) + 32);
      room(height);
      const y = doc.y;
      doc.roundedRect(44, y, width, height - 8, 6).fill(cream);
      doc.rect(44, y, 3, height - 8).fill(amber);
      doc
        .fillColor(charcoal)
        .font(bold)
        .fontSize(10)
        .text(desc, 58, y + 12, { width: 300, lineGap: 4 });
      doc
        .font(regular)
        .fontSize(9)
        .fillColor(gray)
        .text(`${item.quantity} × ${money(item.unit_price_cents)}`, 372, y + 12, {
          width: 165,
          align: 'right',
        });
      doc
        .font(bold)
        .fillColor(charcoal)
        .fontSize(12)
        .text(money(item.total_cents), 372, y + 32, { width: 165, align: 'right' });
      doc.y = y + height;
      doc.x = 44;
    }
    room(126);
    doc.moveDown(0.5);
    paragraph(`Peças: ${money(q.subtotal_cents)}`);
    paragraph(
      `Frete separado: ${money(q.shipping_cents)}${q.shipping_cents === 0 ? ' (sem cobrança nesta proposta)' : ''}`,
    );
    const totalY = doc.y;
    doc.rect(44, totalY, width, 42).fill(amber);
    doc
      .fillColor(charcoal)
      .font(bold)
      .fontSize(12)
      .text('INVESTIMENTO TOTAL', 58, totalY + 14);
    doc.fontSize(16).text(money(q.total_cents), 342, totalY + 11, { width: 195, align: 'right' });
    doc.y = totalY + 61;
    doc.x = 44;
    doc.fillColor(amberDark).font(bold).fontSize(10).text('CONDIÇÕES', 44, doc.y);
    doc.moveDown(0.65);
    paragraph(q.payment_terms);
    paragraph(
      `O prazo de produção começa após a confirmação da entrada. Validade comercial até ${date(q.valid_until)}.`,
    );
    if (q.notes) {
      doc.fillColor(amberDark).font(bold).fontSize(10).text('OBSERVAÇÕES', 44, doc.y);
      doc.moveDown(0.65);
      paragraph(q.notes);
    }
    paragraph(
      'Produção artesanal: pequenas variações de pintura e acabamento fazem parte do processo.',
    );
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      header();
      doc.moveTo(44, 779).lineTo(551, 779).strokeColor('#dfd5c7').lineWidth(0.5).stroke();
      doc
        .font(regular)
        .fontSize(8)
        .fillColor(gray)
        .text(`Relic Studios · ${q.code}`, 44, 786, { lineBreak: false });
      doc.text(`${i + 1} / ${range.count}`, 505, 786, { lineBreak: false });
    }
    doc.end();
  });
}
