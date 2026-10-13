import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
  PGHOST: '',
  PGPORT: 5432,
  PGDATABASE: 'relic_auth_test',
  PGUSER: 'relic_runtime',
  PGPASSWORD: '',
  DATABASE_URL: '',
  MANAGED_DATABASE_SINGLE_USER: 'false',
  ADMIN_DATABASE_USER: 'relic_app',
  ADMIN_DATABASE_PASSWORD: '',
});

test('convite, recuperação, sessões e RBAC preservam o isolamento financeiro', { timeout: 120000 }, async () => {
  const c = config();
  const db = await createEmbedded();
  await migrate(db);
  const adminPassword = randomBytes(24).toString('hex');
  await createAdmin(db, 'Administrador RBAC', 'admin-rbac@example.test', adminPassword);
  await db.exec('SET ROLE relic_runtime');
  const app = await buildApp(db, c);
  await app.ready();

  const login = async (email: string, password: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: c.APP_ORIGIN, 'user-agent': 'Relic Test' },
      payload: { email, password },
    });
    return response;
  };
  const headers = (response: Awaited<ReturnType<typeof login>>) => ({
    origin: c.APP_ORIGIN,
    cookie: String(response.headers['set-cookie']).split(';')[0]!,
    'x-csrf-token': response.json().csrfToken as string,
  });

  try {
    const adminLogin = await login('admin-rbac@example.test', adminPassword);
    assert.equal(adminLogin.statusCode, 200, adminLogin.body);
    const adminHeaders = headers(adminLogin);

    const invited = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: adminHeaders,
      payload: { name: 'Pessoa Produção', email: 'team@example.test', role: 'TEAM' },
    });
    assert.equal(invited.statusCode, 201, invited.body);
    const invitedBody = invited.json();
    assert.equal(invitedBody.status, 'PENDING');
    const inviteToken = new URL(invitedBody.invitationUrl).searchParams.get('token');
    assert(inviteToken);

    const pendingLogin = await login('team@example.test', 'senha-inexistente-comprida');
    assert.equal(pendingLogin.statusCode, 401);

    const teamPassword = randomBytes(24).toString('hex');
    const activation = await app.inject({
      method: 'POST',
      url: '/api/auth/activate',
      headers: { origin: c.APP_ORIGIN },
      payload: { token: inviteToken, password: teamPassword },
    });
    assert.equal(activation.statusCode, 200, activation.body);
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/activate',
      headers: { origin: c.APP_ORIGIN },
      payload: { token: inviteToken, password: teamPassword },
    });
    assert.equal(replay.statusCode, 422);

    const teamLogin = await login('team@example.test', teamPassword);
    assert.equal(teamLogin.statusCode, 200, teamLogin.body);
    const teamHeaders = headers(teamLogin);
    const sessions = await app.inject({ method: 'GET', url: '/api/auth/sessions', headers: teamHeaders });
    assert.equal(sessions.statusCode, 200, sessions.body);
    assert.equal(sessions.json().filter((s: any) => s.current).length, 1);

    const deniedUsers = await app.inject({ method: 'GET', url: '/api/users', headers: teamHeaders });
    assert.equal(deniedUsers.statusCode, 403);
    const deniedPricing = await app.inject({
      method: 'POST',
      url: '/api/pricing/calculate',
      headers: teamHeaders,
      payload: { input: {} },
    });
    assert.equal(deniedPricing.statusCode, 403);

    const [admin] = await db.query("SELECT id FROM relic.users WHERE email='admin-rbac@example.test'");
    const client = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: adminHeaders,
      payload: { name: 'Cliente Privado', email: 'cliente@example.test' },
    });
    assert.equal(client.statusCode, 201, client.body);
    const [policy] = await db.query('SELECT id,settings FROM relic.pricing_settings WHERE active');
    const input = {
      manufacturingJobs: [],
      finishingHours: 1,
      paintingHours: 1,
      packaging: 10,
    };
    const quote = await app.inject({
      method: 'POST',
      url: '/api/quotes',
      headers: adminHeaders,
      payload: {
        clientId: client.json().id,
        policyId: policy!.id,
        items: [{ description: 'Peça confidencial', quantity: 1, input }],
        shippingCents: 0,
        leadDays: 14,
        notes: '',
      },
    });
    assert.equal(quote.statusCode, 201, quote.body);
    const approved = await app.inject({
      method: 'PATCH',
      url: `/api/quotes/${quote.json().id}/status`,
      headers: adminHeaders,
      payload: { status: 'APPROVED', version: quote.json().version },
    });
    assert.equal(approved.statusCode, 200, approved.body);
    const order = await app.inject({
      method: 'POST',
      url: `/api/quotes/${quote.json().id}/order`,
      headers: adminHeaders,
      payload: {},
    });
    assert.equal(order.statusCode, 201, order.body);

    const teamOrder = await app.inject({
      method: 'GET',
      url: `/api/orders/${order.json().id}`,
      headers: teamHeaders,
    });
    assert.equal(teamOrder.statusCode, 200, teamOrder.body);
    const operational = teamOrder.json();
    assert.equal('total_cents' in operational, false);
    assert.equal('cost_cents' in operational, false);
    assert.equal('profit_cents' in operational, false);
    assert.equal(operational.client_snapshot.name, 'Cliente Privado');
    assert.equal('email' in operational.client_snapshot, false);
    assert.equal('calculation' in operational.items[0].snapshot, false);
    assert.equal(operational.items[0].snapshot.description, 'Peça confidencial');
    assert.deepEqual(operational.payments, []);

    const reset = await app.inject({
      method: 'POST',
      url: `/api/users/${invitedBody.id}/password-reset`,
      headers: adminHeaders,
      payload: {},
    });
    assert.equal(reset.statusCode, 200, reset.body);
    const resetToken = new URL(reset.json().resetUrl).searchParams.get('token');
    assert(resetToken);
    const newPassword = randomBytes(24).toString('hex');
    const resetDone = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset',
      headers: { origin: c.APP_ORIGIN },
      payload: { token: resetToken, password: newPassword },
    });
    assert.equal(resetDone.statusCode, 200, resetDone.body);

    const oldSession = await app.inject({ method: 'GET', url: '/api/auth/me', headers: teamHeaders });
    assert.equal(oldSession.statusCode, 401);
    assert.equal((await login('team@example.test', teamPassword)).statusCode, 401);
    assert.equal((await login('team@example.test', newPassword)).statusCode, 200);

    const selfSuspend = await app.inject({
      method: 'PATCH',
      url: `/api/users/${admin!.id}`,
      headers: adminHeaders,
      payload: { role: 'ADMIN', status: 'SUSPENDED' },
    });
    assert.equal(selfSuspend.statusCode, 403);
  } finally {
    await app.close();
    await db.close();
  }
});
