import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createEmbedded, migrate } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';
import { createAdmin } from '../src/modules/auth.js';
import type { Config } from '../src/config/env.js';

test('sessão, CSRF, origem e auditoria preservam invariantes básicas', { timeout: 120000 }, async () => {
  const db = await createEmbedded();
  await migrate(db);
  const password = randomBytes(24).toString('hex');
  await createAdmin(db, 'Administrador Segurança', 'security@example.test', password);
  await db.exec('SET ROLE relic_runtime');
  const c: Config = {
    NODE_ENV: 'test', PORT: 3000, HOST: '127.0.0.1', APP_ORIGIN: 'http://localhost:8080',
    RENDER: 'false', RENDER_EXTERNAL_URL: '', COOKIE_SECURE: 'false', TRUST_PROXY_CIDRS: '',
    SESSION_SECRET: randomBytes(32).toString('hex'), DB_MODE: 'embedded', EMBEDDED_PATH: ':memory:',
    PGHOST: '', PGPORT: 5432, PGDATABASE: 'relic_test', PGUSER: 'relic_runtime', PGPASSWORD: '',
    DATABASE_URL: '', MANAGED_DATABASE_SINGLE_USER: 'false', ADMIN_DATABASE_USER: 'relic_app',
    ADMIN_DATABASE_PASSWORD: '',
  };
  const app = await buildApp(db, c);
  await app.ready();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/clients' })).statusCode, 401);
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login', headers: { origin: c.APP_ORIGIN },
      payload: { email: 'security@example.test', password },
    });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const csrf = login.json().csrfToken;
    assert.match(String(login.headers['set-cookie']), /HttpOnly/);
    assert.match(String(login.headers['set-cookie']), /SameSite=Strict/);

    const missingCsrf = await app.inject({
      method: 'POST', url: '/api/clients', headers: { origin: c.APP_ORIGIN, cookie },
      payload: { name: 'Bloqueado' },
    });
    assert.equal(missingCsrf.statusCode, 403);

    const badOrigin = await app.inject({
      method: 'POST', url: '/api/clients',
      headers: { origin: 'https://example.invalid', cookie, 'x-csrf-token': csrf },
      payload: { name: 'Bloqueado' },
    });
    assert.equal(badOrigin.statusCode, 403);

    const created = await app.inject({
      method: 'POST', url: '/api/clients',
      headers: { origin: c.APP_ORIGIN, cookie, 'x-csrf-token': csrf },
      payload: { name: 'Permitido' },
    });
    assert.equal(created.statusCode, 201, created.body);
    const [audit] = await db.query("SELECT action FROM relic.audit_log WHERE action='CLIENT_CREATED'");
    assert.equal(audit?.action, 'CLIENT_CREATED');
    await assert.rejects(db.query("UPDATE relic.audit_log SET action='FORGED'"));
  } finally {
    await app.close();
    await db.close();
  }
});
