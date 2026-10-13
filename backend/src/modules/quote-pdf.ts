import PDFDocument from 'pdfkit';
import type { Row } from '../lib/db.js';
import { dateOnly } from '../lib/core.js';
const money = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
const date = (s: unknown) => dateOnly(s).split('-').reverse().join('/');
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
    const green = '#193c2f',
      gray = '#52615a',
      width = 507;
    const header = () => {
      doc.rect(0, 0, 596, 108).fill(green);
      doc.fillColor('#d9e9bd').font(bold).fontSize(25).text('RELIC', 44, 27);
      doc.fillColor('#ffffff').font(regular).fontSize(9).text('S T U D I O S', 46, 61);
      doc.fontSize(9).text('COLECIONÁVEIS • FEITOS À MÃO', 310, 39, { width: 240, align: 'right' });
      doc.font(bold).fontSize(13).text(q.code, 310, 60, { width: 240, align: 'right' });
      doc.y = 132;
      doc.x = 44;
    };
    const room = (height: number) => {
      if (doc.y + height > 758) {
        doc.addPage();
      }
    };
    const paragraph = (text: string, size = 9) => {
      doc.font(regular).fontSize(size);
      const h = doc.heightOfString(text, { width });
      room(h + 10);
      doc.fillColor(gray).text(text, 44, doc.y, { width, lineGap: 3 });
      doc.moveDown(0.5);
    };
    doc.fillColor(green).font(bold).fontSize(22).text('Sua próxima peça de coleção', 44, doc.y);
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
      doc.roundedRect(44, y, width, height - 8, 6).fill('#f2f4ed');
      doc
        .fillColor(green)
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
        .fillColor(green)
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
    doc.rect(44, totalY, width, 42).fill(green);
    doc
      .fillColor('#ffffff')
      .font(bold)
      .fontSize(12)
      .text('INVESTIMENTO TOTAL', 58, totalY + 14);
    doc.fontSize(16).text(money(q.total_cents), 342, totalY + 11, { width: 195, align: 'right' });
    doc.y = totalY + 61;
    doc.x = 44;
    paragraph('CONDIÇÕES', 10);
    paragraph(q.payment_terms);
    paragraph(
      `O prazo de produção começa após a confirmação da entrada. Validade comercial até ${date(q.valid_until)}.`,
    );
    if (q.notes) {
      paragraph('OBSERVAÇÕES', 10);
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
