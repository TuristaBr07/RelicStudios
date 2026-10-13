import { createEmbedded, migrate } from '../backend/src/lib/db.js';
import { createAdmin } from '../backend/src/modules/auth.js';
import { buildApp } from '../backend/src/app.js';
import { randomBytes } from 'node:crypto';
import type { Config } from '../backend/src/config/env.js';
if (!process.env.RELIC_TEST_PASSWORD)
  throw new Error('Senha efêmera de teste ausente. Execute via Playwright.');
const db = await createEmbedded();
await migrate(db);
await createAdmin(db, 'Gabriel · Validação', 'qa@example.test', process.env.RELIC_TEST_PASSWORD);
await db.exec('SET ROLE relic_runtime');
const config: Config = {
  NODE_ENV: 'test',
  PORT: 3333,
  HOST: '127.0.0.1',
  APP_ORIGIN: 'http://127.0.0.1:3333',
  RENDER: 'false',
  RENDER_EXTERNAL_URL: '',
  COOKIE_SECURE: 'false',
  TRUST_PROXY_CIDRS: '',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  DB_MODE: 'embedded',
  EMBEDDED_PATH: ':memory:',
  PGHOST: '',
  PGPORT: 5432,
  PGDATABASE: 'relic_studios_test',
  PGUSER: 'relic_runtime',
  PGPASSWORD: '',
  DATABASE_URL: '',
  MANAGED_DATABASE_SINGLE_USER: 'false',
  ADMIN_DATABASE_USER: 'relic_app',
  ADMIN_DATABASE_PASSWORD: '',
};
const app = await buildApp(db, config);
await app.listen({ host: config.HOST, port: config.PORT });
console.log('Servidor E2E iniciado; banco isolado e credenciais efêmeras.');
for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.once(sig, () => {
    void app
      .close()
      .then(() => db.close())
      .then(() => process.exit(0));
  });
