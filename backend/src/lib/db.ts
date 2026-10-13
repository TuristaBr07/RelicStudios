import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Config } from '../config/env.js';
// SQL is the persistence boundary; request and business inputs are validated by Zod.
export type Row = Record<string, any>;
export interface Sql {
  query<T extends Row = Row>(text: string, values?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
function pgWrapper(client: pg.Pool | pg.PoolClient): Sql {
  return {
    async query<T extends Row>(text: string, values: unknown[] = []) {
      return (await client.query<T>(text, values)).rows;
    },
    async exec(text) {
      await client.query(text);
    },
    async transaction(fn) {
      const c = client instanceof pg.Pool ? await client.connect() : client;
      try {
        await c.query('BEGIN');
        const value = await fn(pgWrapper(c));
        await c.query('COMMIT');
        return value;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        if (client instanceof pg.Pool) c.release();
      }
    },
    async close() {
      if (client instanceof pg.Pool) await client.end();
    },
  };
}
function embeddedWrapper(
  client: Pick<PGlite, 'query' | 'exec' | 'transaction'>,
  root?: PGlite,
): Sql {
  return {
    async query<T extends Row>(text: string, values: unknown[] = []) {
      return (await client.query<T>(text, values)).rows;
    },
    async exec(text) {
      await client.exec(text);
    },
    async transaction(fn) {
      return client.transaction(async (tx) => fn(embeddedWrapper(tx as unknown as PGlite)));
    },
    async close() {
      if (root) await root.close();
    },
  };
}
export async function createEmbedded(path?: string): Promise<Sql> {
  const pg = new PGlite(path);
  await pg.waitReady;
  return embeddedWrapper(pg, pg);
}
function managedMigrationSql(name: string, sql: string) {
  if (name !== '001_initial_schema.sql') return sql;
  const roleBootstrap = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relic_runtime') THEN
    CREATE ROLE relic_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
`;
  return sql
    .replace(roleBootstrap, '')
    .replace('GRANT USAGE ON SCHEMA relic TO relic_runtime;\n', '')
    .replace('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA relic TO relic_runtime;\n', '')
    .replace('REVOKE UPDATE ON relic.audit_log,relic.pricing_overrides,relic.order_items FROM relic_runtime;\n', '')
    .replace('GRANT DELETE ON relic.sessions,relic.quote_items TO relic_runtime;\n', '')
    .replace('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA relic TO relic_runtime;\n', '');
}
export async function migrate(db: Sql, options: { managedSingleUser?: boolean } = {}) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const dir = new URL('../../../database/migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
    const originalSql = await readFile(new URL(name, dir), 'utf8');
    const checksum = createHash('sha256').update(originalSql).digest('hex');
    const sql = options.managedSingleUser ? managedMigrationSql(name, originalSql) : originalSql;
    await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(729103)');
      const [done] = await tx.query('SELECT checksum FROM public.schema_migrations WHERE name=$1', [
        name,
      ]);
      if (done) {
        if (done.checksum !== checksum) throw new Error(`Migration modificada: ${name}`);
        return;
      }
      await tx.exec(sql);
      await tx.query('INSERT INTO public.schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        checksum,
      ]);
    });
  }
}
export async function openDatabase(c: Config, admin = false): Promise<Sql> {
  if (c.DB_MODE === 'embedded') {
    const db = await createEmbedded(c.EMBEDDED_PATH);
    if (!admin) {
      await migrate(db);
      await db.exec('SET ROLE relic_runtime');
    }
    return db;
  }
  const managedSingleUser = c.MANAGED_DATABASE_SINGLE_USER === 'true';
  const pool = new pg.Pool({
    ...(c.DATABASE_URL && managedSingleUser
      ? { connectionString: c.DATABASE_URL }
      : {
          host: c.PGHOST,
          port: c.PGPORT,
          database: c.PGDATABASE,
          user: admin ? c.ADMIN_DATABASE_USER : c.PGUSER,
          password: admin ? c.ADMIN_DATABASE_PASSWORD : c.PGPASSWORD,
        }),
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  const db = pgWrapper(pool);
  await db.query('SELECT 1');
  if (!admin) {
    const [r] = await db.query(
      'SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
    );
    const unsafe = managedSingleUser ? !r || r.rolsuper : !r || r.rolsuper || r.rolcreatedb || r.rolcreaterole;
    if (unsafe) {
      await db.close();
      throw new Error('Runtime não pode ter privilégios administrativos.');
    }
  }
  return db;
}
