import { config } from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.url().default('http://localhost:8080'),
  RENDER: z.enum(['true', 'false']).default('false'),
  RENDER_EXTERNAL_URL: z.string().default(''),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  TRUST_PROXY_CIDRS: z.string().default(''),
  SESSION_SECRET: z.string().min(32),
  DB_MODE: z.enum(['postgres', 'embedded']).default('postgres'),
  EMBEDDED_PATH: z.string().default('.local/database'),
  PGHOST: z.string().default('127.0.0.1'),
  PGPORT: z.coerce.number().default(5432),
  PGDATABASE: z.string().default('relic_studios'),
  PGUSER: z.string().default('relic_runtime'),
  PGPASSWORD: z.string().default(''),
  DATABASE_URL: z.string().default(''),
  MANAGED_DATABASE_SINGLE_USER: z.enum(['true', 'false']).default('false'),
  ADMIN_DATABASE_USER: z.string().default('relic_app'),
  ADMIN_DATABASE_PASSWORD: z.string().default(''),
});
export type Config = z.infer<typeof schema>;
export function readConfig(): Config {
  const input = { ...process.env };
  if (!input.APP_ORIGIN && input.RENDER_EXTERNAL_URL) input.APP_ORIGIN = input.RENDER_EXTERNAL_URL;
  const c = schema.parse(input);
  c.EMBEDDED_PATH = resolve(fileURLToPath(new URL('../../../', import.meta.url)), c.EMBEDDED_PATH);
  if (c.NODE_ENV === 'production' && c.DB_MODE !== 'postgres')
    throw new Error('Produção requer PostgreSQL servidor.');
  if (c.NODE_ENV === 'production') {
    if (new URL(c.APP_ORIGIN).protocol !== 'https:')
      throw new Error('Produção requer APP_ORIGIN em HTTPS.');
    if (c.COOKIE_SECURE !== 'true') throw new Error('Produção requer COOKIE_SECURE=true.');
    if (c.RENDER !== 'true' && !c.TRUST_PROXY_CIDRS.trim())
      throw new Error('Produção requer TRUST_PROXY_CIDRS para confiar apenas nos proxies internos.');
  }
  if (c.DB_MODE === 'postgres' && c.MANAGED_DATABASE_SINGLE_USER !== 'true' && (!c.PGPASSWORD || c.PGUSER === c.ADMIN_DATABASE_USER))
    throw new Error('Configure uma credencial exclusiva de runtime.');
  if (c.MANAGED_DATABASE_SINGLE_USER === 'true' && !c.DATABASE_URL)
    throw new Error('Banco gerenciado single-user requer DATABASE_URL.');
  if (new URL(c.APP_ORIGIN).protocol === 'https:' && c.COOKIE_SECURE !== 'true')
    throw new Error('HTTPS requer COOKIE_SECURE=true.');
  return c;
}
