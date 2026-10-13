import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createEmbedded, migrate } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';
import { createAdmin } from '../src/modules/auth.js';
import type { Config } from '../src/config/env.js';

const config = (): Config => ({
  NODE_ENV: 'test',
  PORT: 3000,
  HOST: '127.0.0.1',
  APP_ORIGIN: 'http://localhost:8080',
  RENDER: 'false',
  RENDER_EXTERNAL_URL: '',
  COOKIE_SECURE: 'false',
  TRUST_PROXY_CIDRS: '',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  DB_MODE: 'embedded',
  EMBEDDED_PATH: ':memory:',
  PGHOST: '127.0.0.1',
  PGPORT: 5432,
  PGDATABASE: 'relic_studios_test',
  PGUSER: 'relic_runtime',
  PGPASSWORD: '',
  DATABASE_URL: '',
  MANAGED_DATABASE_SINGLE_USER: 'false',
  ADMIN_DATABASE_USER: 'relic_app',
  ADMIN_DATABASE_PASSWORD: '',
});

test('fluxo principal: login, cliente, orçamento, pedido e pagamento', { timeout: 120000 }, async () => {
  const c = config();
  const db = await createEmbedded();
  await migrate(db);
  const password = randomBytes(24).toString('hex');
  await createAdmin(db, 'Administrador Teste', 'admin@example.test', password);
  await db.exec('SET ROLE relic_runtime');
  const app = await buildApp(db, c);
  await app.ready();

  const headers: Record<string, string> = { origin: c.APP_ORIGIN };
  const call = async (method: string, url: string, payload?: unknown, expected = 200) => {
    const response = await app.inject({
      method: method as any,
      url,
      headers,
      ...(payload === undefined ? {} : { payload }),
    });
    assert.equal(response.statusCode, expected, `${method} ${url}: ${response.body}`);
    return response.headers['content-type']?.includes('application/json') ? response.json() : response;
  };

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { email: 'admin@example.test', password },
    });
    assert.equal(login.statusCode, 200, login.body);
    headers.cookie = String(login.headers['set-cookie']).split(';')[0]!;
    headers['x-csrf-token'] = login.json().csrfToken;

    const client = await call('POST', '/api/clients', { name: 'Cliente Teste' }, 201);
    const policy = (await call('GET', '/api/policies'))[0];
    const [printer] = await db.query(
      "SELECT id FROM relic.printers WHERE name='Saturn 4 12K'",
    );
    const [material] = await db.query(
      `INSERT INTO relic.materials(
        technology_code,name,manufacturer,variant,unit,package_quantity,package_price_cents,waste_percent
      ) VALUES('MSLA','Resina integração','Teste','Cinza','ML',1000,18000,5) RETURNING id`,
    );
    const input = {
      manufacturingJobs: [
        {
          printerId: printer!.id,
          materialId: material!.id,
          materialAmount: 100,
          printHours: 4,
          outputQuantity: 2,
        },
      ],
      laborEstimates: {
        finishing: {
          mode: 'COMPONENTS',
          components: [
            { label: 'Lixamento', hours: 0.5 },
            { label: 'Correções', hours: 0.5 },
          ],
        },
        painting: { mode: 'PERT', optimistic: 1, mostLikely: 2, pessimistic: 4 },
        modeling: { mode: 'DIRECT', hours: 0.5 },
      },
      consumables: 8,
      packaging: 10,
    };
    const calculation = await call('POST', '/api/pricing/calculate', {
      policyId: policy.id,
      input,
      quantity: 2,
    });
    assert(calculation.finalCents > calculation.costCents);

    let quote = await call(
      'POST',
      '/api/quotes',
      {
        clientId: client.id,
        policyId: policy.id,
        items: [{ description: 'Peça de validação', quantity: 2, input }],
        shippingCents: 0,
        leadDays: 14,
        notes: '',
      },
      201,
    );
    assert.match(quote.code, /^ORC-\d{4}-\d{4}$/);

    quote = await call('PATCH', `/api/quotes/${quote.id}/status`, {
      status: 'APPROVED',
      version: quote.version,
    });
    const order = await call('POST', `/api/quotes/${quote.id}/order`, {}, 201);
    assert.match(order.code, /^PED-\d{4}-\d{4}$/);
    const [job] = await db.query(
      'SELECT id,status,version,output_quantity,estimated_minutes FROM relic.manufacturing_jobs WHERE order_item_id IN (SELECT id FROM relic.order_items WHERE order_id=$1)',
      [order.id],
    );
    assert.equal(job?.output_quantity, 2);
    assert.equal(job?.estimated_minutes, 240);
    const [paintingStep] = await db.query(
      "SELECT id,status,position,version,estimated_hours FROM relic.production_steps WHERE order_id=$1 AND stage='PAINTING'",
      [order.id],
    );
    assert.equal(Number(paintingStep?.estimated_hours), 4.34);
    const tamperedEstimate = await call(
      'PATCH',
      `/api/production/${paintingStep!.id}`,
      {
        version: paintingStep!.version,
        status: paintingStep!.status,
        assignedTo: null,
        estimatedHours: Number(paintingStep!.estimated_hours) + 1,
        actualHours: 0,
        notes: '',
        position: paintingStep!.position,
      },
      422,
    );
    assert.match(tamperedEstimate.error, /baseline/);

    await call(
      'POST',
      '/api/payments',
      {
        orderId: order.id,
        kind: 'DEPOSIT',
        method: 'PIX',
        status: 'RECEIVED',
        amountCents: order.deposit_cents,
        idempotencyKey: randomUUID(),
      },
      201,
    );
    let detail = await call('GET', `/api/orders/${order.id}`);
    assert.equal(detail.status, 'CONFIRMED');
    assert.equal(detail.received_cents, order.deposit_cents);
    await call('PATCH', `/api/orders/${order.id}/status`, {
      status: 'IN_PRODUCTION',
      version: detail.version,
      reason: '',
    });

    let jobState = (await call('GET', `/api/manufacturing/jobs?orderId=${order.id}`))[0];
    jobState = await call('PATCH', `/api/manufacturing/jobs/${job!.id}`, {
      version: jobState.version,
      status: 'READY',
      actualMaterialAmount: null,
      actualMinutes: null,
      notes: '',
    });
    jobState = await call('PATCH', `/api/manufacturing/jobs/${job!.id}`, {
      version: jobState.version,
      status: 'RUNNING',
      actualMaterialAmount: 105,
      actualMinutes: 250,
      notes: 'Job em execução',
    });
    jobState = await call('PATCH', `/api/manufacturing/jobs/${job!.id}`, {
      version: jobState.version,
      status: 'COMPLETED',
      actualMaterialAmount: 110,
      actualMinutes: 270,
      notes: 'Job concluído',
    });
    assert.equal(jobState.status, 'COMPLETED');

    detail = await call('GET', `/api/orders/${order.id}`);
    let preparation = detail.steps.find((step: any) => step.stage === 'PREPARATION');
    preparation = await call('PATCH', `/api/production/${preparation.id}`, {
      version: preparation.version,
      status: 'IN_PROGRESS',
      assignedTo: null,
      estimatedHours: Number(preparation.estimated_hours),
      actualHours: 0.5,
      notes: '',
      position: preparation.position,
    });
    preparation = await call('PATCH', `/api/production/${preparation.id}`, {
      version: preparation.version,
      status: 'COMPLETED',
      assignedTo: null,
      estimatedHours: Number(preparation.estimated_hours),
      actualHours: 0.75,
      notes: 'Modelagem concluída',
      position: preparation.position,
    });
    assert.equal(preparation.status, 'COMPLETED');

    detail = await call('GET', `/api/orders/${order.id}`);
    assert(detail.cost_report.actualCostCents > 0);
    assert(detail.cost_report.items[0].manufacturingActualCents > 0);
    assert(detail.cost_report.items[0].laborActualCents > 0);
    assert.equal(detail.manufacturing_jobs[0].status, 'COMPLETED');
    assert.equal(detail.manufacturing_jobs[0].snapshot, undefined);
  } finally {
    await app.close();
    await db.close();
  }
});
