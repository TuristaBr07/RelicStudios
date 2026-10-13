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
    const input = {
      resinGrams: 100,
      resinPriceKg: 180,
      printHours: 4,
      machineHourlyCost: 2,
      finishingHours: 1,
      paintingHours: 2,
      consumables: 8,
      packaging: 10,
    };
    const calculation = await call('POST', '/api/pricing/calculate', {
      policyId: policy.id,
      input,
    });
    assert(calculation.finalCents > calculation.costCents);

    let quote = await call(
      'POST',
      '/api/quotes',
      {
        clientId: client.id,
        policyId: policy.id,
        items: [{ description: 'Peça de validação', quantity: 1, input }],
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
    const detail = await call('GET', `/api/orders/${order.id}`);
    assert.equal(detail.status, 'CONFIRMED');
    assert.equal(detail.received_cents, order.deposit_cents);
  } finally {
    await app.close();
    await db.close();
  }
});
