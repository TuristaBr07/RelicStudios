import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotePdf } from '../src/modules/quote-pdf.js';

test('gera orçamento comercial em PDF', async () => {
  const buffer = await quotePdf({
    code: 'ORC-2026-0001',
    status: 'DRAFT',
    client_snapshot: {
      name: 'Cliente PDF',
      email: 'cliente@example.test',
      phone: '(15) 99999-9999',
    },
    created_at: '2026-10-14T12:00:00.000Z',
    valid_until: '2026-10-21',
    lead_days: 14,
    subtotal_cents: 25000,
    shipping_cents: 0,
    total_cents: 25000,
    payment_terms: '50% de entrada + 50% antes da entrega/envio.',
    notes: 'Validação automatizada do documento comercial.',
    items: [
      {
        description: 'Peça de validação',
        character_name: 'Personagem',
        scale: '1/8',
        quantity: 1,
        unit_price_cents: 25000,
        total_cents: 25000,
      },
    ],
  });

  assert(buffer.length > 1000);
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.match(buffer.toString('latin1'), /\/Subtype \/Image\b/, 'PDF deve incluir a logo oficial');
});
