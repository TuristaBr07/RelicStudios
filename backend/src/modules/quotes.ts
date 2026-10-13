import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Sql, Row } from '../lib/db.js';
import { roles } from './auth.js';
import { ensure, audit, nextCode, today, addDays, dateOnly, stages } from '../lib/core.js';
import { uuid, getId } from './catalog.js';
import { pricingInputSchema, policySchema, calculate } from './pricing.js';
import { quotePdf } from './quote-pdf.js';
const itemSchema = z.object({
  description: z.string().trim().min(2).max(300),
  characterName: z.string().max(150).default(''),
  scale: z.string().max(50).default(''),
  quantity: z.number().int().min(1).max(1000),
  input: pricingInputSchema,
});
const quoteSchema = z
  .object({
    clientId: uuid,
    policyId: uuid,
    items: z.array(itemSchema).min(1).max(50),
    shippingCents: z.number().int().min(0).max(10000000).default(0),
    leadDays: z.number().int().min(1).max(365).default(14),
    notes: z.string().max(6000).default(''),
  })
  .strict();
async function expire(db: Sql) {
  await db.transaction(async (tx) => {
    const rows = await tx.query(
      "UPDATE relic.quotes SET status='EXPIRED' WHERE status='SENT' AND valid_until < $1 RETURNING id",
      [today()],
    );
    for (const r of rows) await audit(tx, null, 'QUOTE_EXPIRED', 'quotes', r.id);
  });
}
export async function quoteDetail(db: Sql, id: string): Promise<Row & { items: Row[] }> {
  const [q] = await db.query(
    'SELECT q.*,o.id AS order_id,o.code AS order_code FROM relic.quotes q LEFT JOIN relic.orders o ON o.quote_id=q.id WHERE q.id=$1',
    [id],
  );
  ensure(q, 'Orçamento não encontrado.', 404);
  return {
    ...q,
    items: await db.query('SELECT * FROM relic.quote_items WHERE quote_id=$1 ORDER BY position', [
      id,
    ]),
  };
}
export function quoteRoutes(app: FastifyInstance, db: Sql) {
  app.get('/api/quotes', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    await expire(db);
    return db.query(
      'SELECT q.*,o.id AS order_id FROM relic.quotes q LEFT JOIN relic.orders o ON o.quote_id=q.id ORDER BY q.created_at DESC LIMIT 200',
    );
  });
  app.post('/api/quotes', async (req, reply) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const b = quoteSchema.parse(req.body);
    const result = await db.transaction(async (tx) => {
      const [client] = await tx.query(
        'SELECT id,name,email,phone,document,address FROM relic.clients WHERE id=$1 AND archived_at IS NULL FOR SHARE',
        [b.clientId],
      );
      ensure(client, 'Selecione um cliente ativo.');
      const [p] = await tx.query(
        'SELECT * FROM relic.pricing_settings WHERE id=$1 AND active FOR SHARE',
        [b.policyId],
      );
      ensure(
        p,
        'A política selecionada não está ativa. Recalcule a proposta com a política vigente.',
        422,
      );
      const policy = policySchema.parse(p.settings);
      const items = b.items.map((item) => ({
        ...item,
        calc: calculate(item.input, policy, req.user!.role),
      }));
      const subtotal = items.reduce((s, i) => s + i.calc.finalCents * i.quantity, 0),
        cost = items.reduce((s, i) => s + i.calc.costCents * i.quantity, 0),
        profit = items.reduce((s, i) => s + i.calc.profitCents * i.quantity, 0);
      ensure(
        subtotal + b.shippingCents <= 100000000 && cost <= 100000000,
        'Orçamento excede o limite de R$ 1 milhão.',
      );
      const code = await nextCode(tx, 'ORC');
      const snapshot = { id: p.id, version: p.version, name: p.name, settings: policy };
      const [q] = await tx.query(
        'INSERT INTO relic.quotes(code,client_id,client_snapshot,policy_id,policy_snapshot,subtotal_cents,shipping_cents,total_cents,cost_cents,profit_cents,valid_until,lead_days,payment_terms,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
        [
          code,
          b.clientId,
          JSON.stringify(client),
          p.id,
          JSON.stringify(snapshot),
          subtotal,
          b.shippingCents,
          subtotal + b.shippingCents,
          cost,
          profit,
          addDays(today(), policy.validityDays),
          b.leadDays,
          `${policy.depositPercent}% de entrada + ${100 - policy.depositPercent}% antes da entrega/envio.`,
          b.notes,
          req.user!.id,
        ],
      );
      for (const [i, item] of items.entries()) {
        const [r] = await tx.query(
          'INSERT INTO relic.quote_items(quote_id,position,description,character_name,scale,quantity,calculation,unit_price_cents,total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
          [
            q!.id,
            i + 1,
            item.description,
            item.characterName,
            item.scale,
            item.quantity,
            JSON.stringify(item.calc),
            item.calc.finalCents,
            item.calc.finalCents * item.quantity,
          ],
        );
        if (item.calc.isOverride) {
          await tx.query(
            'INSERT INTO relic.pricing_overrides(quote_item_id,original_cents,final_cents,minimum_cents,justification,below_minimum,authorized_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              r!.id,
              item.calc.discountedCents,
              item.calc.finalCents,
              item.calc.minimumCents,
              item.input.overrideReason,
              item.calc.belowMinimum,
              req.user!.id,
            ],
          );
          await audit(tx, req.user!.id, 'PRICE_OVERRIDE', 'quote_items', r!.id, {
            reason: item.input.overrideReason,
            belowMinimum: item.calc.belowMinimum,
            from: item.calc.discountedCents,
            to: item.calc.finalCents,
          });
        }
      }
      await audit(tx, req.user!.id, 'QUOTE_CREATED', 'quotes', q!.id, { code });
      return quoteDetail(tx, q!.id);
    });
    reply.code(201);
    return result;
  });
  app.get('/api/quotes/:id', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    await expire(db);
    return quoteDetail(db, getId(req.params));
  });
  app.patch('/api/quotes/:id/status', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const id = getId(req.params);
    const b = z
      .object({
        status: z.enum(['SENT', 'APPROVED', 'REJECTED', 'CANCELLED']),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const [q] = await tx.query('SELECT * FROM relic.quotes WHERE id=$1 FOR UPDATE', [id]);
      ensure(q, 'Orçamento não encontrado.', 404);
      ensure(q.version === b.version, 'Orçamento alterado. Atualize a página.', 409);
      const allowed: Record<string, string[]> = {
        DRAFT: ['SENT', 'APPROVED', 'CANCELLED'],
        SENT: ['APPROVED', 'REJECTED', 'CANCELLED'],
      };
      ensure(allowed[q.status]?.includes(b.status), 'Esta mudança de status não é permitida.');
      if (['SENT', 'APPROVED'].includes(b.status))
        ensure(
          dateOnly(q.valid_until) >= today(),
          'O orçamento está vencido. Crie um novo orçamento.',
        );
      const [r] = await tx.query(
        "UPDATE relic.quotes SET status=$1,approved_at=CASE WHEN $1='APPROVED' THEN now() ELSE approved_at END WHERE id=$2 RETURNING *",
        [b.status, id],
      );
      await audit(tx, req.user!.id, `QUOTE_${b.status}`, 'quotes', id, { from: q.status });
      return r;
    });
  });
  app.post('/api/quotes/:id/order', async (req, reply) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const id = getId(req.params);
    return db.transaction(async (tx) => {
      const [q] = await tx.query('SELECT * FROM relic.quotes WHERE id=$1 FOR UPDATE', [id]);
      ensure(q, 'Orçamento não encontrado.', 404);
      const [existing] = await tx.query('SELECT * FROM relic.orders WHERE quote_id=$1', [id]);
      if (existing) return existing;
      ensure(q.status === 'APPROVED', 'Aprove o orçamento antes de gerar um pedido.');
      const items = await tx.query(
        'SELECT * FROM relic.quote_items WHERE quote_id=$1 ORDER BY position',
        [id],
      );
      const code = await nextCode(tx, 'PED');
      const [order] = await tx.query(
        'INSERT INTO relic.orders(code,quote_id,client_id,client_snapshot,commercial_snapshot,total_cents,deposit_cents,cost_cents,profit_cents,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [
          code,
          id,
          q.client_id,
          JSON.stringify(q.client_snapshot),
          JSON.stringify({
            quoteCode: q.code,
            policy: q.policy_snapshot,
            subtotalCents: q.subtotal_cents,
            shippingCents: q.shipping_cents,
            paymentTerms: q.payment_terms,
            notes: q.notes,
            leadDays: q.lead_days,
          }),
          q.total_cents,
          Math.ceil((q.total_cents * q.policy_snapshot.settings.depositPercent) / 100),
          q.cost_cents,
          q.profit_cents,
          addDays(today(), q.lead_days),
          req.user!.id,
        ],
      );
      for (const item of items) {
        const [oi] = await tx.query(
          'INSERT INTO relic.order_items(order_id,quote_item_id,snapshot) VALUES($1,$2,$3) RETURNING id',
          [order!.id, item.id, JSON.stringify(item)],
        );
        for (const [index, stage] of stages.entries()) {
          const input = item.calculation.input;
          const hours: Record<string, number> = {
            PRINTING: input.printHours,
            PAINTING: input.paintingHours,
            POST_PROCESSING: input.finishingHours,
            PREPARATION: input.modelingHours,
          };
          await tx.query(
            'INSERT INTO relic.production_steps(order_id,order_item_id,stage,status,position,estimated_hours) VALUES($1,$2,$3,$4,$5,$6)',
            [
              order!.id,
              oi!.id,
              stage,
              index === 0 ? 'READY' : 'WAITING',
              index + 1,
              (hours[stage] ?? 0) * item.quantity,
            ],
          );
        }
      }
      await audit(tx, req.user!.id, 'ORDER_CREATED', 'orders', order!.id, { quoteId: id, code });
      reply.code(201);
      return order;
    });
  });
  app.get('/api/quotes/:id/pdf', async (req, reply) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const q = await quoteDetail(db, getId(req.params));
    const buffer = await quotePdf(q as Row);
    reply
      .type('application/pdf')
      .header('Content-Disposition', `attachment; filename="${q.code}.pdf"`)
      .header('Cache-Control', 'no-store');
    return reply.send(buffer);
  });
}
