import { z } from 'zod';
import { readConfig } from '../config/env.js';
import { openDatabase } from '../lib/db.js';
import { createAdmin } from '../modules/auth.js';

const bootstrapSchema = z.object({
  BOOTSTRAP_ADMIN_NAME: z.string().min(2).max(120),
  BOOTSTRAP_ADMIN_EMAIL: z.email().max(254),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(128),
});

const config = readConfig();
const db = await openDatabase(config);
try {
  const [existing] = await db.query("SELECT id FROM relic.users WHERE role='ADMIN' AND active LIMIT 1");
  if (existing) {
    console.log('Administrador inicial já existe; bootstrap ignorado.');
  } else {
    const values = bootstrapSchema.parse(process.env);
    await createAdmin(
      db,
      values.BOOTSTRAP_ADMIN_NAME,
      values.BOOTSTRAP_ADMIN_EMAIL,
      values.BOOTSTRAP_ADMIN_PASSWORD,
    );
    console.log('Administrador inicial criado para o ambiente de homologação.');
  }
} finally {
  await db.close();
}
