import { readConfig } from './config/env.js';
import { openDatabase } from './lib/db.js';
import { buildApp } from './app.js';
const config = readConfig();
const db = await openDatabase(config);
const app = await buildApp(db, config);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app
      .close()
      .then(() => db.close())
      .then(() => process.exit(0));
  });
await app.listen({ host: config.HOST, port: config.PORT });
