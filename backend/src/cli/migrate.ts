import { readConfig } from '../config/env.js';
import { openDatabase, migrate } from '../lib/db.js';
const config = readConfig();
const db = await openDatabase(config, true);
try {
  await migrate(db, { managedSingleUser: config.MANAGED_DATABASE_SINGLE_USER === 'true' });
  console.log('Migrations aplicadas e checksums conferidos.');
} finally {
  await db.close();
}
