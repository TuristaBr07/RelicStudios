import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Sql, Row } from '../lib/db.js';
import { roles } from './auth.js';
import { audit, ensure, addDays, today } from '../lib/core.js';
import { getId, uuid } from './catalog.js';
import { calculateActualManufacturingCost } from './manufacturing.js';
export async function received(db: Sql, id: string): Promise<number> {
  const [r] = await db.query(
    "SELECT coalesce(sum(CASE WHEN kind='REFUND' THEN -amount_cents ELSE amount_cents END),0)::integer AS value FROM relic.payments WHERE order_id=$1 AND status='RECEIVED'",
    [id],
  );
  return r!.value;
}
const operationalSnapshot = (snapshot: Row = {}) => ({
  position: snapshot.position,
  description: snapshot.description,
  character_name: snapshot.character_name,
  scale: snapshot.scale,
  quantity: snapshot.quantity,
});
const teamOrder = (order: Row) => ({
  id: order.id,
  code: order.code,
  status: order.status,
  due_date: order.due_date,
  notes: order.notes,
  delivered_at: order.delivered_at,
  version: order.version,
  created_at: order.created_at,
  updated_at: order.updated_at,
  client_snapshot: { name: order.client_snapshot?.name ?? '' },
  commercial_snapshot: {
    quoteCode: order.commercial_snapshot?.quoteCode ?? '',
    leadDays: order.commercial_snapshot?.leadDays ?? 0,
  },
});

const centsFromHours = (hours: number, hourlyReais: number) =>
  Math.round(hours * hourlyReais * 100);

function laborRate(stage: string, policy: Row) {
  if (stage === 'PRINTING') return 0;
  if (stage === 'PREPARATION') return Number(policy.modelingHourly ?? 0);
  if (['PRIMING', 'PAINTING'].includes(stage)) return Number(policy.paintingHourly ?? 0);
  return Number(policy.finishingHourly ?? 0);
}

function buildCostReport(order: Row, items: Row[], steps: Row[], jobs: Row[]) {
  const policy = order.commercial_snapshot?.policy?.settings ?? {};
  const overheadPercent = Number(policy.overheadPercent ?? 0);
  const reports = items.map((item) => {
    const calculation = item.snapshot?.calculation ?? {};
    const breakdown = calculation.batchBreakdown ?? {};
    const itemJobs = jobs.filter((job) => job.order_item_id === item.id);
    const itemSteps = steps.filter((step) => step.order_item_id === item.id);
    const manufacturing = itemJobs.reduce(
      (sum, job) => sum + calculateActualManufacturingCost(job).totalCents,
      0,
    );
    const labor = itemSteps.reduce(
      (sum, step) =>
        sum + centsFromHours(Number(step.actual_hours ?? 0), laborRate(step.stage, policy)),
      0,
    );
    const complementary =
      Number(breakdown.consumables ?? 0) +
      Number(breakdown.packaging ?? 0) +
      Number(breakdown.extras ?? 0);
    const direct = manufacturing + labor + complementary;
    const overhead = Math.round((direct * overheadPercent) / 100);
    const actual = direct + overhead;
    const estimated = Number(calculation.batchCostCents ?? 0);
    return {
      orderItemId: item.id,
      description: item.snapshot?.description ?? '',
      estimatedCostCents: estimated,
      actualCostCents: actual,
      varianceCents: actual - estimated,
      manufacturingActualCents: manufacturing,
      laborActualCents: labor,
      complementaryQuotedCents: complementary,
      overheadActualCents: overhead,
      jobsCompleted: itemJobs.filter((job) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status))
        .length,
      jobsTotal: itemJobs.length,
      stepsCompleted: itemSteps.filter((step) => ['COMPLETED', 'CANCELLED'].includes(step.status)).length,
      stepsTotal: itemSteps.length,
    };
  });
  const actualCostCents = reports.reduce((sum, item) => sum + item.actualCostCents, 0);
  const estimatedCostCents = Number(order.cost_cents ?? 0);
  const subtotalCents = Number(order.commercial_snapshot?.subtotalCents ?? order.total_cents ?? 0);
  return {
    isFinal: order.status === 'DELIVERED',
    estimatedCostCents,
    actualCostCents,
    varianceCents: actualCostCents - estimatedCostCents,
    actualProfitCents: subtotalCents - actualCostCents,
    subtotalCents,
    items: reports,
    note: 'Material e tempo reais vêm dos jobs; horas reais vêm da produção. Consumíveis, embalagem e extras permanecem pelos valores aprovados até existir apontamento específico. A reserva de impressão não é tratada como gasto realizado.',
  };
}

export async function orderDetail(db: Sql, id: string, financial = true) {
  const [o] = await db.query('SELECT * FROM relic.orders WHERE id=$1', [id]);
  ensure(o, 'Pedido não encontrado.', 404);
  const steps = await db.query(
    "SELECT s.*,u.name AS assignee_name,i.snapshot FROM relic.production_steps s LEFT JOIN relic.users u ON u.id=s.assigned_to JOIN relic.order_items i ON i.id=s.order_item_id WHERE s.order_id=$1 ORDER BY (i.snapshot->>'position')::integer,s.position",
    [id],
  );
  const items = await db.query(
    "SELECT * FROM relic.order_items WHERE order_id=$1 ORDER BY (snapshot->>'position')::integer",
    [id],
  );
  const jobs = await db.query(
    `SELECT j.*,p.name AS printer_name,m.name AS material_name,m.unit AS material_unit
       FROM relic.manufacturing_jobs j
       JOIN relic.order_items i ON i.id=j.order_item_id
       JOIN relic.printers p ON p.id=j.printer_id
       JOIN relic.materials m ON m.id=j.material_id
      WHERE i.order_id=$1
      ORDER BY (i.snapshot->>'position')::integer,j.position`,
    [id],
  );
  const operationalJobs = jobs.map(({ snapshot: _snapshot, created_by: _createdBy, ...job }) => job);
  if (!financial)
    return {
      ...teamOrder(o!),
      items: items.map((item) => ({ ...item, snapshot: operationalSnapshot(item.snapshot) })),
      steps: steps.map((step) => ({ ...step, snapshot: operationalSnapshot(step.snapshot) })),
      manufacturing_jobs: operationalJobs,
      payments: [],
    };
  const paid = await received(db, id);
  return {
    ...o,
    received_cents: paid,
    pending_cents: Math.max(0, o.total_cents - paid),
    deposit_pending_cents: Math.max(0, o.deposit_cents - paid),
    items,
    steps,
    manufacturing_jobs: operationalJobs,
    cost_report: buildCostReport(o!, items, steps, jobs),
    payments: await db.query(
      'SELECT * FROM relic.payments WHERE order_id=$1 ORDER BY created_at DESC',
      [id],
    ),
  };
}
async function syncPayment(db: Sql, order: Row, actor: string) {
  const net = await received(db, order.id);
  if (order.status === 'WAITING_PAYMENT' && net >= order.deposit_cents) {
    await db.query("UPDATE relic.orders SET status='CONFIRMED',due_date=$2 WHERE id=$1", [
      order.id,
      addDays(today(), order.commercial_snapshot.leadDays),
    ]);
    await audit(db, actor, 'ORDER_CONFIRMED', 'orders', order.id, { receivedCents: net });
  }
  if (order.status === 'CONFIRMED' && net < order.deposit_cents) {
    await db.query("UPDATE relic.orders SET status='WAITING_PAYMENT' WHERE id=$1", [order.id]);
    await audit(db, actor, 'ORDER_WAITING_PAYMENT', 'orders', order.id, { receivedCents: net });
  }
}
async function validatePayment(tx: Sql, order: Row, kind: string, amount: number) {
  const net = await received(tx, order.id);
  if (kind === 'REFUND') {
    ensure(
      order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
      'Pedidos entregues ou cancelados não aceitam estornos. Use um fluxo formal de devolução.',
    );
    ensure(amount <= net, 'O estorno não pode superar o valor recebido.');
  } else {
    ensure(
      order.status !== 'CANCELLED' && order.status !== 'DELIVERED',
      'Este pedido não aceita novos recebimentos.',
    );
    ensure(net + amount <= order.total_cents, 'O recebimento ultrapassa o saldo do pedido.');
  }
}
export function orderRoutes(app: FastifyInstance, db: Sql) {
  app.get('/api/orders', async (req) => {
    const rows = await db.query(
      "SELECT o.*,coalesce(p.received,0)::integer AS received_cents,o.total_cents-coalesce(p.received,0)::integer AS pending_cents FROM relic.orders o LEFT JOIN (SELECT order_id,sum(CASE WHEN kind='REFUND' THEN -amount_cents ELSE amount_cents END) AS received FROM relic.payments WHERE status='RECEIVED' GROUP BY order_id) p ON p.order_id=o.id ORDER BY o.created_at DESC LIMIT 200",
    );
    return req.user!.role === 'TEAM' ? rows.map(teamOrder) : rows;
  });
  app.get('/api/orders/:id', async (req) =>
    orderDetail(db, getId(req.params), req.user!.role !== 'TEAM'),
  );
  app.patch('/api/orders/:id/status', async (req) => {
    const id = getId(req.params);
    const b = z
      .object({
        status: z.enum(['IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED']),
        version: z.number().int(),
        reason: z.string().max(2000).default(''),
      })
      .parse(req.body);
    if (['IN_PRODUCTION', 'READY'].includes(b.status)) roles(req, 'ADMIN', 'TEAM');
    else roles(req, 'ADMIN', 'COMMERCIAL');
    return db.transaction(async (tx) => {
      const [o] = await tx.query('SELECT * FROM relic.orders WHERE id=$1 FOR UPDATE', [id]);
      ensure(o, 'Pedido não encontrado.', 404);
      ensure(o.version === b.version, 'Pedido alterado. Atualize a página.', 409);
      const allowed: Record<string, string[]> = {
        WAITING_PAYMENT: ['CANCELLED'],
        CONFIRMED: ['IN_PRODUCTION', 'CANCELLED'],
        IN_PRODUCTION: ['READY', 'CANCELLED'],
        READY: ['DELIVERED', 'CANCELLED'],
      };
      ensure(allowed[o.status]?.includes(b.status), 'Transição de pedido não permitida.');
      const paid = await received(tx, id);
      if (b.status === 'IN_PRODUCTION')
        ensure(paid >= o.deposit_cents, 'A entrada deve estar recebida para iniciar a produção.');
      if (b.status === 'READY') {
        const [s] = await tx.query(
          "SELECT count(*)::integer AS count FROM relic.production_steps WHERE order_id=$1 AND status NOT IN ('COMPLETED','CANCELLED')",
          [id],
        );
        ensure(s!.count === 0, 'Conclua todas as etapas antes de marcar o pedido como pronto.');
      }
      if (b.status === 'DELIVERED')
        ensure(paid === o.total_cents, 'Receba o saldo integral antes da entrega.');
      if (b.status === 'CANCELLED') {
        ensure(
          b.reason.trim().length >= 8,
          'Informe o motivo do cancelamento (ao menos 8 caracteres).',
        );
        ensure(paid === 0, 'Estorne os valores recebidos antes de cancelar.');
        await tx.query(
          "UPDATE relic.production_steps SET status='CANCELLED' WHERE order_id=$1 AND status<>'COMPLETED'",
          [id],
        );
        await tx.query(
          "UPDATE relic.payments SET status='CANCELLED' WHERE order_id=$1 AND status='PENDING'",
          [id],
        );
      }
      const [r] = await tx.query(
        "UPDATE relic.orders SET status=$1,delivered_at=CASE WHEN $1='DELIVERED' THEN now() ELSE delivered_at END WHERE id=$2 RETURNING *",
        [b.status, id],
      );
      await audit(tx, req.user!.id, `ORDER_${b.status}`, 'orders', id, {
        from: o.status,
        reason: b.reason,
      });
      return req.user!.role === 'TEAM' ? teamOrder(r!) : r;
    });
  });
  app.patch('/api/orders/:id', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const id = getId(req.params);
    const b = z
      .object({ version: z.number().int(), dueDate: z.iso.date(), notes: z.string().max(6000) })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const [r] = await tx.query(
        "UPDATE relic.orders SET due_date=$1,notes=$2 WHERE id=$3 AND version=$4 AND status NOT IN ('DELIVERED','CANCELLED') RETURNING *",
        [b.dueDate, b.notes, id, b.version],
      );
      ensure(r, 'Pedido encerrado ou alterado. Atualize a página.', 409);
      await audit(tx, req.user!.id, 'ORDER_UPDATED', 'orders', id, { dueDate: b.dueDate });
      return r;
    });
  });
  app.get('/api/payments', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    return db.query(
      'SELECT p.*,o.code AS order_code,o.client_snapshot FROM relic.payments p JOIN relic.orders o ON o.id=p.order_id ORDER BY p.created_at DESC LIMIT 300',
    );
  });
  app.post('/api/payments', async (req, reply) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const b = z
      .object({
        orderId: uuid,
        kind: z.enum(['DEPOSIT', 'BALANCE', 'ADDITIONAL', 'REFUND']),
        method: z.enum(['PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER']),
        status: z.enum(['PENDING', 'RECEIVED']).default('RECEIVED'),
        amountCents: z.number().int().min(1).max(100000000),
        reference: z.string().max(200).default(''),
        notes: z.string().max(2000).default(''),
        idempotencyKey: uuid,
      })
      .parse(req.body);
    if (b.kind === 'REFUND') {
      roles(req, 'ADMIN');
      ensure(
        b.notes.trim().length >= 8,
        'Informe a justificativa do estorno (ao menos 8 caracteres).',
      );
    }
    return db.transaction(async (tx) => {
      const [o] = await tx.query('SELECT * FROM relic.orders WHERE id=$1 FOR UPDATE', [b.orderId]);
      ensure(o, 'Pedido não encontrado.', 404);
      const [existing] = await tx.query('SELECT * FROM relic.payments WHERE idempotency_key=$1', [
        b.idempotencyKey,
      ]);
      if (existing) {
        ensure(
          existing.order_id === b.orderId &&
            existing.amount_cents === b.amountCents &&
            existing.kind === b.kind &&
            existing.method === b.method,
          'Chave de repetição reutilizada com dados diferentes.',
          409,
        );
        return existing;
      }
      await validatePayment(tx, o, b.kind, b.amountCents);
      const [r] = await tx.query(
        "INSERT INTO relic.payments(order_id,kind,method,status,amount_cents,received_at,reference,notes,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,CASE WHEN $4='RECEIVED' THEN now() ELSE NULL END,$6,$7,$8,$9) RETURNING *",
        [
          b.orderId,
          b.kind,
          b.method,
          b.status,
          b.amountCents,
          b.reference,
          b.notes,
          b.idempotencyKey,
          req.user!.id,
        ],
      );
      await syncPayment(tx, o, req.user!.id);
      await audit(
        tx,
        req.user!.id,
        b.kind === 'REFUND' ? 'PAYMENT_REFUND' : 'PAYMENT_CREATED',
        'payments',
        r!.id,
        { orderId: b.orderId, amountCents: b.amountCents, status: b.status },
      );
      reply.code(201);
      return r;
    });
  });
  app.patch('/api/payments/:id', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const id = getId(req.params);
    const b = z.object({ status: z.enum(['RECEIVED', 'CANCELLED']) }).parse(req.body);
    return db.transaction(async (tx) => {
      const [base] = await tx.query('SELECT order_id FROM relic.payments WHERE id=$1', [id]);
      ensure(base, 'Pagamento não encontrado.', 404);
      const [o] = await tx.query('SELECT * FROM relic.orders WHERE id=$1 FOR UPDATE', [
        base.order_id,
      ]);
      const [p] = await tx.query('SELECT * FROM relic.payments WHERE id=$1 FOR UPDATE', [id]);
      ensure(p?.status === 'PENDING', 'Somente pagamentos pendentes podem ser alterados.');
      if (p.kind === 'REFUND') roles(req, 'ADMIN');
      if (b.status === 'RECEIVED') await validatePayment(tx, o!, p.kind, p.amount_cents);
      const [r] = await tx.query(
        "UPDATE relic.payments SET status=$1,received_at=CASE WHEN $1='RECEIVED' THEN now() ELSE NULL END WHERE id=$2 RETURNING *",
        [b.status, id],
      );
      await syncPayment(tx, o!, req.user!.id);
      await audit(tx, req.user!.id, `PAYMENT_${b.status}`, 'payments', id);
      return r;
    });
  });
  app.get('/api/production', async (req) => {
    const rows = await db.query(
      "SELECT s.*,o.code AS order_code,o.status AS order_status,o.due_date,o.client_snapshot,i.snapshot,u.name AS assignee_name FROM relic.production_steps s JOIN relic.orders o ON o.id=s.order_id JOIN relic.order_items i ON i.id=s.order_item_id LEFT JOIN relic.users u ON u.id=s.assigned_to WHERE o.status NOT IN ('DELIVERED','CANCELLED') ORDER BY o.due_date,o.code,(i.snapshot->>'position')::integer,s.position LIMIT 1000",
    );
    return req.user!.role === 'TEAM'
      ? rows.map((row) => ({
          ...row,
          client_snapshot: { name: row.client_snapshot?.name ?? '' },
          snapshot: operationalSnapshot(row.snapshot),
        }))
      : rows;
  });
  app.patch('/api/production/:id', async (req) => {
    roles(req, 'ADMIN', 'TEAM');
    const id = getId(req.params);
    const b = z
      .object({
        version: z.number().int(),
        status: z.enum([
          'WAITING',
          'READY',
          'IN_PROGRESS',
          'PAUSED',
          'COMPLETED',
          'BLOCKED',
          'CANCELLED',
        ]),
        assignedTo: uuid.nullable(),
        estimatedHours: z.number().min(0).max(100000),
        actualHours: z.number().min(0).max(100000),
        notes: z.string().max(4000),
        position: z.number().int().min(1).max(100).optional(),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const [base] = await tx.query('SELECT order_id FROM relic.production_steps WHERE id=$1', [
        id,
      ]);
      ensure(base, 'Etapa não encontrada.', 404);
      const [order] = await tx.query('SELECT * FROM relic.orders WHERE id=$1 FOR UPDATE', [
        base.order_id,
      ]);
      ensure(!['DELIVERED', 'CANCELLED'].includes(order!.status), 'Pedido encerrado.');
      const [s] = await tx.query('SELECT * FROM relic.production_steps WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      ensure(s?.version === b.version, 'Etapa alterada. Atualize a página.', 409);
      ensure(
        !['COMPLETED', 'CANCELLED'].includes(s.status),
        'Etapa encerrada não pode ser modificada.',
      );
      ensure(
        Number(s.estimated_hours) === b.estimatedHours,
        'As horas estimadas vêm do orçamento e permanecem como baseline. Registre apenas as horas reais.',
        422,
      );
      if (b.assignedTo) {
        const [u] = await tx.query('SELECT id FROM relic.users WHERE id=$1 AND active', [
          b.assignedTo,
        ]);
        ensure(u, 'Responsável deve ser um usuário ativo.');
      }
      if (b.status !== s.status) {
        const map: Record<string, string[]> = {
          WAITING: ['READY', 'BLOCKED', 'CANCELLED'],
          READY: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
          IN_PROGRESS: ['PAUSED', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
          PAUSED: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
          BLOCKED: ['READY', 'CANCELLED'],
        };
        ensure(map[s.status]?.includes(b.status), 'Transição de etapa não permitida.');
      }
      if (b.status === 'CANCELLED') {
        roles(req, 'ADMIN');
        ensure(
          !['QUALITY_CHECK', 'PACKAGING'].includes(s.stage),
          'Qualidade e embalagem são etapas obrigatórias.',
        );
        ensure(b.notes.trim().length >= 8, 'Justifique o cancelamento da etapa.');
      }
      if (['IN_PROGRESS', 'COMPLETED'].includes(b.status))
        ensure(
          order!.status === 'IN_PRODUCTION',
          'Inicie a produção do pedido após receber a entrada.',
        );
      if (['READY', 'IN_PROGRESS', 'COMPLETED'].includes(b.status)) {
        const [prev] = await tx.query(
          "SELECT count(*)::integer AS count FROM relic.production_steps WHERE order_item_id=$1 AND position<$2 AND status NOT IN ('COMPLETED','CANCELLED')",
          [s.order_item_id, s.position],
        );
        ensure(prev!.count === 0, 'Conclua as etapas anteriores primeiro.');
      }
      if (b.position !== undefined && b.position !== s.position) {
        roles(req, 'ADMIN');
        const [started] = await tx.query(
          'SELECT count(*)::integer AS count FROM relic.production_steps WHERE order_item_id=$1 AND started_at IS NOT NULL',
          [s.order_item_id],
        );
        ensure(started!.count === 0, 'A ordem das etapas só pode mudar antes de iniciar.');
        ensure(b.status === s.status, 'Altere a ordem separadamente do status.');
        const [other] = await tx.query(
          'SELECT id,position FROM relic.production_steps WHERE order_item_id=$1 AND position=$2',
          [s.order_item_id, b.position],
        );
        ensure(other, 'Selecione uma posição já existente.');
        await tx.query('UPDATE relic.production_steps SET position=1000 WHERE id=$1', [other.id]);
        await tx.query('UPDATE relic.production_steps SET position=$1 WHERE id=$2', [
          b.position,
          id,
        ]);
        await tx.query('UPDATE relic.production_steps SET position=$1 WHERE id=$2', [
          s.position,
          other.id,
        ]);
        await tx.query(
          "UPDATE relic.production_steps SET status=CASE WHEN position=1 THEN 'READY' ELSE 'WAITING' END WHERE order_item_id=$1",
          [s.order_item_id],
        );
        await audit(tx, req.user!.id, 'PRODUCTION_REORDERED', 'production_steps', id, {
          from: s.position,
          to: b.position,
        });
        return (await tx.query('SELECT * FROM relic.production_steps WHERE id=$1', [id]))[0];
      }
      const [r] = await tx.query(
        "UPDATE relic.production_steps SET status=$1,assigned_to=$2,estimated_hours=$3,actual_hours=$4,notes=$5,started_at=CASE WHEN $1='IN_PROGRESS' THEN coalesce(started_at,now()) ELSE started_at END,completed_at=CASE WHEN $1='COMPLETED' THEN now() ELSE completed_at END WHERE id=$6 RETURNING *",
        [b.status, b.assignedTo, b.estimatedHours, b.actualHours, b.notes, id],
      );
      if (['COMPLETED', 'CANCELLED'].includes(b.status))
        await tx.query(
          "UPDATE relic.production_steps SET status='READY' WHERE id=(SELECT id FROM relic.production_steps WHERE order_item_id=$1 AND status='WAITING' ORDER BY position LIMIT 1)",
          [s.order_item_id],
        );
      await audit(tx, req.user!.id, 'PRODUCTION_UPDATED', 'production_steps', id, {
        from: s.status,
        to: b.status,
        estimatedHours: Number(s.estimated_hours),
        actualHours: b.actualHours,
        varianceHours: Number((b.actualHours - Number(s.estimated_hours)).toFixed(2)),
        assignedTo: b.assignedTo,
      });
      return r;
    });
  });
  app.get('/api/dashboard', async (req) => {
    const [quotes] = await db.query(
      "SELECT count(*)::integer AS open FROM relic.quotes WHERE status IN ('DRAFT','SENT') AND valid_until >= $1",
      [today()],
    );
    const [orders] = await db.query(
      "SELECT count(*) FILTER(WHERE status NOT IN ('DELIVERED','CANCELLED'))::integer AS active,count(*) FILTER(WHERE status='IN_PRODUCTION')::integer AS production,coalesce(sum(total_cents) FILTER(WHERE status<>'CANCELLED'),0)::bigint AS revenue,coalesce(sum(cost_cents) FILTER(WHERE status<>'CANCELLED'),0)::bigint AS cost,coalesce(sum(profit_cents) FILTER(WHERE status<>'CANCELLED'),0)::bigint AS profit FROM relic.orders",
    );
    const [pay] = await db.query(
      "SELECT coalesce(sum(CASE WHEN kind='REFUND' THEN -amount_cents ELSE amount_cents END),0)::bigint AS received FROM relic.payments WHERE status='RECEIVED'",
    );
    const [hours] = await db.query(
      'SELECT coalesce(sum(actual_hours),0)::numeric AS actual FROM relic.production_steps',
    );
    const due = await db.query(
      "SELECT id,code,status,due_date,client_snapshot FROM relic.orders WHERE status NOT IN ('DELIVERED','CANCELLED') ORDER BY due_date LIMIT 6",
    );
    const recent = await db.query(
      'SELECT a.action,a.created_at,u.name AS actor_name FROM relic.audit_log a LEFT JOIN relic.users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 8',
    );
    const financial = req.user!.role !== 'TEAM';
    return {
      openQuotes: quotes!.open,
      activeOrders: orders!.active,
      inProduction: orders!.production,
      revenueCents: financial ? Number(orders!.revenue) : null,
      costCents: financial ? Number(orders!.cost) : null,
      profitCents: financial ? Number(orders!.profit) : null,
      receivedCents: financial ? Number(pay!.received) : null,
      pendingCents: financial ? Math.max(0, Number(orders!.revenue) - Number(pay!.received)) : null,
      actualHours: Number(hours!.actual),
      due,
      recent,
    };
  });
}
