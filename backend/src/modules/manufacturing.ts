import { z } from 'zod';
import { Decimal } from 'decimal.js';
import type { FastifyInstance } from 'fastify';
import type { Sql, Row } from '../lib/db.js';
import { roles } from './auth.js';
import { audit, ensure } from '../lib/core.js';
import { getId, uuid } from './catalog.js';

const technologyCode = z.string().trim().min(2).max(32).regex(/^[A-Z0-9_]+$/);

const printerSchema = z
  .object({
    technologyCode,
    name: z.string().trim().min(2).max(120),
    manufacturer: z.string().trim().max(120).default(''),
    model: z.string().trim().max(160).default(''),
    ratedPowerWatts: z.number().min(0).max(100000).default(0),
    estimatedAveragePowerWatts: z.number().positive().max(100000).nullable().default(null),
    buildXmm: z.number().min(0).max(10000).default(0),
    buildYmm: z.number().min(0).max(10000).default(0),
    buildZmm: z.number().min(0).max(10000).default(0),
    purchaseCostCents: z.number().int().min(0).max(1000000000).default(0),
    machineHourlyCents: z.number().int().min(0).max(100000000).default(0),
    maintenanceReservePercent: z.number().min(0).max(100).default(0),
    active: z.boolean().default(true),
    notes: z.string().max(4000).default(''),
  })
  .strict();

const materialSchema = z
  .object({
    technologyCode,
    name: z.string().trim().min(2).max(160),
    manufacturer: z.string().trim().max(120).default(''),
    variant: z.string().trim().max(120).default(''),
    packageQuantity: z.number().positive().max(100000000),
    packagePriceCents: z.number().int().min(0).max(1000000000),
    wastePercent: z.number().min(0).max(100).default(0),
    supplier: z.string().trim().max(200).default(''),
    active: z.boolean().default(true),
    notes: z.string().max(4000).default(''),
  })
  .strict();

async function activeTechnology(db: Sql, code: string) {
  const [technology] = await db.query(
    'SELECT * FROM relic.manufacturing_technologies WHERE code=$1 AND active',
    [code],
  );
  ensure(technology, 'Tecnologia de fabricação não encontrada ou inativa.', 422);
  return technology;
}

function redactPrinter(row: Row, role: string) {
  if (role !== 'TEAM') return row;
  const safe = { ...row };
  delete safe.purchase_cost_cents;
  delete safe.machine_hourly_cents;
  delete safe.maintenance_reserve_percent;
  return safe;
}

function redactMaterial(row: Row, role: string) {
  if (role !== 'TEAM') return row;
  const safe = { ...row };
  delete safe.package_price_cents;
  delete safe.unit_cost_cents;
  return safe;
}

const moneyRound = (value: Decimal.Value) =>
  new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export function calculateActualManufacturingCost(row: Row) {
  const cost = row.snapshot?.snapshot ?? {};
  const materialAmount =
    row.actual_material_amount === null || row.actual_material_amount === undefined
      ? 0
      : Number(row.actual_material_amount);
  const actualMinutes =
    row.actual_minutes === null || row.actual_minutes === undefined ? 0 : Number(row.actual_minutes);
  const hours = new Decimal(actualMinutes).div(60);
  const packageQuantity = Number(cost.packageQuantity ?? 0);
  const packagePriceCents = Number(cost.packagePriceCents ?? 0);
  const machineHourlyCents = Number(cost.machineHourlyCents ?? 0);
  const maintenanceReservePercent = Number(cost.maintenanceReservePercent ?? 0);
  const averagePowerWatts = cost.averagePowerWatts == null ? null : Number(cost.averagePowerWatts);
  const electricityKwh = Number(cost.electricityKwh ?? 0);
  const materialCents =
    packageQuantity > 0
      ? moneyRound(new Decimal(materialAmount).mul(packagePriceCents).div(packageQuantity))
      : 0;
  const machineCents = moneyRound(hours.mul(machineHourlyCents));
  const maintenanceCents = moneyRound(
    new Decimal(machineCents).mul(maintenanceReservePercent).div(100),
  );
  const energyCents = averagePowerWatts
    ? moneyRound(hours.mul(averagePowerWatts).div(1000).mul(electricityKwh).mul(100))
    : 0;
  return {
    materialCents,
    machineCents,
    maintenanceCents,
    energyCents,
    totalCents: materialCents + machineCents + maintenanceCents + energyCents,
  };
}

const printerSelect = `
  SELECT p.*,t.name AS technology_name,t.material_unit,t.print_time_model
    FROM relic.printers p
    JOIN relic.manufacturing_technologies t ON t.code=p.technology_code`;

const materialSelect = `
  SELECT m.*,t.name AS technology_name,t.material_unit,t.print_time_model,
         CASE WHEN m.package_quantity>0 THEN m.package_price_cents/m.package_quantity ELSE 0 END AS unit_cost_cents
    FROM relic.materials m
    JOIN relic.manufacturing_technologies t ON t.code=m.technology_code`;

export function manufacturingRoutes(app: FastifyInstance, db: Sql) {
  app.get('/api/manufacturing/technologies', async () =>
    db.query(
      'SELECT code,name,material_unit,print_time_model,description FROM relic.manufacturing_technologies WHERE active ORDER BY name',
    ),
  );

  app.get('/api/manufacturing/printers', async (req) => {
    const q = z
      .object({ includeInactive: z.enum(['true', 'false']).default('false') })
      .parse(req.query);
    if (q.includeInactive === 'true') roles(req, 'ADMIN');
    const rows = await db.query(
      `${printerSelect} ${q.includeInactive === 'true' ? '' : 'WHERE p.active'} ORDER BY p.active DESC,p.name`,
    );
    return rows.map((row) => redactPrinter(row, req.user!.role));
  });

  app.post('/api/manufacturing/printers', async (req, reply) => {
    roles(req, 'ADMIN');
    const b = printerSchema.parse(req.body);
    await activeTechnology(db, b.technologyCode);
    return db.transaction(async (tx) => {
      const [row] = await tx.query(
        `INSERT INTO relic.printers(
          technology_code,name,manufacturer,model,rated_power_watts,estimated_average_power_watts,
          build_x_mm,build_y_mm,build_z_mm,purchase_cost_cents,machine_hourly_cents,
          maintenance_reserve_percent,active,notes
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          b.technologyCode,
          b.name,
          b.manufacturer,
          b.model,
          b.ratedPowerWatts,
          b.estimatedAveragePowerWatts,
          b.buildXmm,
          b.buildYmm,
          b.buildZmm,
          b.purchaseCostCents,
          b.machineHourlyCents,
          b.maintenanceReservePercent,
          b.active,
          b.notes,
        ],
      );
      await audit(tx, req.user!.id, 'PRINTER_CREATED', 'printers', row!.id, {
        technology: b.technologyCode,
      });
      reply.code(201);
      return row;
    });
  });

  app.patch('/api/manufacturing/printers/:id', async (req) => {
    roles(req, 'ADMIN');
    const id = getId(req.params);
    const b = printerSchema.extend({ version: z.number().int().positive() }).parse(req.body);
    await activeTechnology(db, b.technologyCode);
    return db.transaction(async (tx) => {
      const [row] = await tx.query(
        `UPDATE relic.printers SET
          technology_code=$1,name=$2,manufacturer=$3,model=$4,rated_power_watts=$5,
          estimated_average_power_watts=$6,build_x_mm=$7,build_y_mm=$8,build_z_mm=$9,
          purchase_cost_cents=$10,machine_hourly_cents=$11,maintenance_reserve_percent=$12,
          active=$13,notes=$14
         WHERE id=$15 AND version=$16 RETURNING *`,
        [
          b.technologyCode,
          b.name,
          b.manufacturer,
          b.model,
          b.ratedPowerWatts,
          b.estimatedAveragePowerWatts,
          b.buildXmm,
          b.buildYmm,
          b.buildZmm,
          b.purchaseCostCents,
          b.machineHourlyCents,
          b.maintenanceReservePercent,
          b.active,
          b.notes,
          id,
          b.version,
        ],
      );
      ensure(row, 'A impressora mudou. Atualize a página antes de salvar.', 409);
      await audit(tx, req.user!.id, 'PRINTER_UPDATED', 'printers', id, {
        technology: b.technologyCode,
        active: b.active,
      });
      return row;
    });
  });

  app.get('/api/manufacturing/materials', async (req) => {
    const q = z
      .object({ includeInactive: z.enum(['true', 'false']).default('false') })
      .parse(req.query);
    if (q.includeInactive === 'true') roles(req, 'ADMIN');
    const rows = await db.query(
      `${materialSelect} ${q.includeInactive === 'true' ? '' : 'WHERE m.active'} ORDER BY m.active DESC,m.name`,
    );
    return rows.map((row) => redactMaterial(row, req.user!.role));
  });

  app.post('/api/manufacturing/materials', async (req, reply) => {
    roles(req, 'ADMIN');
    const b = materialSchema.parse(req.body);
    const technology = await activeTechnology(db, b.technologyCode);
    return db.transaction(async (tx) => {
      const [row] = await tx.query(
        `INSERT INTO relic.materials(
          technology_code,name,manufacturer,variant,unit,package_quantity,package_price_cents,
          waste_percent,supplier,active,notes
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          b.technologyCode,
          b.name,
          b.manufacturer,
          b.variant,
          technology.material_unit,
          b.packageQuantity,
          b.packagePriceCents,
          b.wastePercent,
          b.supplier,
          b.active,
          b.notes,
        ],
      );
      await audit(tx, req.user!.id, 'MATERIAL_CREATED', 'materials', row!.id, {
        technology: b.technologyCode,
        unit: technology.material_unit,
      });
      reply.code(201);
      return row;
    });
  });

  app.patch('/api/manufacturing/materials/:id', async (req) => {
    roles(req, 'ADMIN');
    const id = getId(req.params);
    const b = materialSchema.extend({ version: z.number().int().positive() }).parse(req.body);
    const technology = await activeTechnology(db, b.technologyCode);
    return db.transaction(async (tx) => {
      const [row] = await tx.query(
        `UPDATE relic.materials SET
          technology_code=$1,name=$2,manufacturer=$3,variant=$4,unit=$5,package_quantity=$6,
          package_price_cents=$7,waste_percent=$8,supplier=$9,active=$10,notes=$11
         WHERE id=$12 AND version=$13 RETURNING *`,
        [
          b.technologyCode,
          b.name,
          b.manufacturer,
          b.variant,
          technology.material_unit,
          b.packageQuantity,
          b.packagePriceCents,
          b.wastePercent,
          b.supplier,
          b.active,
          b.notes,
          id,
          b.version,
        ],
      );
      ensure(row, 'O material mudou. Atualize a página antes de salvar.', 409);
      await audit(tx, req.user!.id, 'MATERIAL_UPDATED', 'materials', id, {
        technology: b.technologyCode,
        active: b.active,
      });
      return row;
    });
  });

  app.get('/api/manufacturing/jobs', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL', 'TEAM');
    const q = z
      .object({ orderId: uuid.optional(), orderItemId: uuid.optional() })
      .refine((value) => !(value.orderId && value.orderItemId), 'Use somente um filtro por vez.')
      .parse(req.query);
    const where = q.orderId
      ? 'WHERE o.id=$1'
      : q.orderItemId
        ? 'WHERE j.order_item_id=$1'
        : '';
    const values = q.orderId ? [q.orderId] : q.orderItemId ? [q.orderItemId] : [];
    return db.query(
      `SELECT j.id,j.order_item_id,j.printer_id,j.material_id,j.technology_code,j.position,
              j.status,j.output_quantity,j.estimated_material_amount,j.actual_material_amount,
              j.estimated_minutes,j.actual_minutes,j.notes,j.started_at,j.completed_at,
              j.version,j.created_at,j.updated_at,
              o.id AS order_id,o.code AS order_code,
              i.snapshot->>'description' AS item_description,
              p.name AS printer_name,m.name AS material_name,m.unit AS material_unit
         FROM relic.manufacturing_jobs j
         JOIN relic.order_items i ON i.id=j.order_item_id
         JOIN relic.orders o ON o.id=i.order_id
         JOIN relic.printers p ON p.id=j.printer_id
         JOIN relic.materials m ON m.id=j.material_id
         ${where}
        ORDER BY o.created_at DESC,j.position
        LIMIT 500`,
      values,
    );
  });

  app.patch('/api/manufacturing/jobs/:id', async (req) => {
    roles(req, 'ADMIN', 'TEAM');
    const id = getId(req.params);
    const b = z
      .object({
        version: z.number().int().positive(),
        status: z.enum(['PLANNED', 'READY', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
        actualMaterialAmount: z.number().min(0).max(100000000).nullable(),
        actualMinutes: z.number().int().min(0).max(100000000).nullable(),
        notes: z.string().max(4000).default(''),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const [job] = await tx.query(
        'SELECT * FROM relic.manufacturing_jobs WHERE id=$1 FOR UPDATE',
        [id],
      );
      ensure(job, 'Job de fabricação não encontrado.', 404);
      ensure(job.version === b.version, 'O job mudou. Atualize a página antes de salvar.', 409);
      ensure(
        !['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status),
        'Job encerrado não pode ser alterado.',
      );
      const [orderItem] = await tx.query('SELECT order_id FROM relic.order_items WHERE id=$1', [
        job.order_item_id,
      ]);
      ensure(orderItem, 'Item do pedido não encontrado.', 404);
      const [order] = await tx.query('SELECT status FROM relic.orders WHERE id=$1 FOR UPDATE', [
        orderItem.order_id,
      ]);
      ensure(order && !['DELIVERED', 'CANCELLED'].includes(order.status), 'Pedido encerrado.');
      if (b.status !== job.status) {
        const transitions: Record<string, string[]> = {
          PLANNED: ['READY', 'CANCELLED'],
          READY: ['RUNNING', 'CANCELLED'],
          RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
        };
        ensure(transitions[job.status]?.includes(b.status), 'Transição do job não permitida.');
      }
      if (b.status === 'CANCELLED') roles(req, 'ADMIN');
      if (['RUNNING', 'COMPLETED', 'FAILED'].includes(b.status))
        ensure(order.status === 'IN_PRODUCTION', 'Inicie a produção do pedido antes do job.');
      if (['COMPLETED', 'FAILED'].includes(b.status)) {
        ensure(
          b.actualMaterialAmount !== null && b.actualMinutes !== null,
          'Informe material e tempo reais antes de encerrar o job.',
        );
      }
      const [updated] = await tx.query(
        `UPDATE relic.manufacturing_jobs SET
           status=$1,actual_material_amount=$2,actual_minutes=$3,notes=$4,
           started_at=CASE WHEN $1 IN ('RUNNING','COMPLETED','FAILED') THEN coalesce(started_at,now()) ELSE started_at END,
           completed_at=CASE WHEN $1 IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE completed_at END
         WHERE id=$5 RETURNING *`,
        [b.status, b.actualMaterialAmount, b.actualMinutes, b.notes, id],
      );
      const actualCost = calculateActualManufacturingCost(updated!);
      await audit(tx, req.user!.id, 'MANUFACTURING_JOB_UPDATED', 'manufacturing_jobs', id, {
        from: job.status,
        to: b.status,
        estimatedMaterialAmount: Number(job.estimated_material_amount),
        actualMaterialAmount: b.actualMaterialAmount,
        estimatedMinutes: Number(job.estimated_minutes),
        actualMinutes: b.actualMinutes,
        actualCostCents: actualCost.totalCents,
      });
      const [result] = await tx.query(
        `SELECT j.id,j.order_item_id,j.printer_id,j.material_id,j.technology_code,j.position,
                j.status,j.output_quantity,j.estimated_material_amount,j.actual_material_amount,
                j.estimated_minutes,j.actual_minutes,j.notes,j.started_at,j.completed_at,
                j.version,j.created_at,j.updated_at,p.name AS printer_name,m.name AS material_name,
                m.unit AS material_unit
           FROM relic.manufacturing_jobs j
           JOIN relic.printers p ON p.id=j.printer_id
           JOIN relic.materials m ON m.id=j.material_id
          WHERE j.id=$1`,
        [id],
      );
      return result;
    });
  });
}
