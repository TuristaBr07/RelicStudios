import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Sql } from '../lib/db.js';
import { roles } from './auth.js';
import { ensure, audit } from '../lib/core.js';
import { policySchema, pricingInputSchema, calculate } from './pricing.js';
export const uuid = z.uuid();
export const getId = (params: unknown) => z.object({ id: uuid }).parse(params).id;
const clientSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.union([z.email(), z.literal('')]).default(''),
    phone: z.string().max(40).default(''),
    document: z.string().max(30).default(''),
    address: z.string().max(1000).default(''),
    notes: z.string().max(4000).default(''),
  })
  .strict();
export function catalogRoutes(app: FastifyInstance, db: Sql) {
  app.get('/api/clients', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const q = z
      .object({
        q: z.string().max(160).default(''),
        archived: z.enum(['true', 'false']).default('false'),
      })
      .parse(req.query);
    return db.query(
      'SELECT * FROM relic.clients WHERE (archived_at IS NOT NULL)=$1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2) ORDER BY name LIMIT 200',
      [q.archived === 'true', `%${q.q}%`],
    );
  });
  app.post('/api/clients', async (req, reply) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const b = clientSchema.parse(req.body);
    return db.transaction(async (tx) => {
      const [r] = await tx.query(
        'INSERT INTO relic.clients(name,email,phone,document,address,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        Object.values(b),
      );
      await audit(tx, req.user!.id, 'CLIENT_CREATED', 'clients', r!.id);
      reply.code(201);
      return r;
    });
  });
  app.get('/api/clients/:id', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const id = getId(req.params);
    const [r] = await db.query('SELECT * FROM relic.clients WHERE id=$1', [id]);
    ensure(r, 'Cliente não encontrado.', 404);
    return {
      ...r,
      quotes: await db.query(
        'SELECT id,code,status,total_cents,created_at FROM relic.quotes WHERE client_id=$1 ORDER BY created_at DESC',
        [id],
      ),
      orders: await db.query(
        'SELECT id,code,status,total_cents,created_at FROM relic.orders WHERE client_id=$1 ORDER BY created_at DESC',
        [id],
      ),
    };
  });
  app.patch('/api/clients/:id', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const id = getId(req.params);
    const b = clientSchema
      .extend({ version: z.number().int(), archived: z.boolean().optional() })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const [r] = await tx.query(
        'UPDATE relic.clients SET name=$1,email=$2,phone=$3,document=$4,address=$5,notes=$6,archived_at=CASE WHEN $7::boolean IS NULL THEN archived_at WHEN $7 THEN coalesce(archived_at,now()) ELSE NULL END WHERE id=$8 AND version=$9 RETURNING *',
        [
          b.name,
          b.email,
          b.phone,
          b.document,
          b.address,
          b.notes,
          b.archived ?? null,
          id,
          b.version,
        ],
      );
      ensure(r, 'O cliente mudou. Atualize a página antes de salvar.', 409);
      await audit(
        tx,
        req.user!.id,
        b.archived === undefined
          ? 'CLIENT_UPDATED'
          : b.archived
            ? 'CLIENT_ARCHIVED'
            : 'CLIENT_RESTORED',
        'clients',
        id,
      );
      return r;
    });
  });
  app.get('/api/policies', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const q = z
      .object({ includeInactive: z.enum(['true', 'false']).default('false') })
      .parse(req.query);
    if (q.includeInactive === 'true') roles(req, 'ADMIN');
    return db.query(
      q.includeInactive === 'true'
        ? 'SELECT * FROM relic.pricing_settings ORDER BY version DESC'
        : 'SELECT * FROM relic.pricing_settings WHERE active ORDER BY version DESC',
    );
  });
  app.post('/api/policies', async (req, reply) => {
    roles(req, 'ADMIN');
    const b = z
      .object({ name: z.string().min(3).max(120), settings: policySchema })
      .parse(req.body);
    return db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(729105)');
      await tx.query('UPDATE relic.pricing_settings SET active=false WHERE active');
      const [r] = await tx.query(
        'INSERT INTO relic.pricing_settings(version,name,settings,active,created_by) SELECT coalesce(max(version),0)+1,$1,$2,true,$3 FROM relic.pricing_settings RETURNING *',
        [b.name, JSON.stringify(b.settings), req.user!.id],
      );
      await audit(tx, req.user!.id, 'POLICY_VERSION_CREATED', 'pricing_settings', r!.id, {
        version: r!.version,
        settings: b.settings,
      });
      reply.code(201);
      return r;
    });
  });
  app.post('/api/pricing/calculate', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL');
    const b = z.object({ input: pricingInputSchema, policyId: uuid.optional() }).parse(req.body);
    const [p] = b.policyId
      ? await db.query('SELECT * FROM relic.pricing_settings WHERE id=$1 AND active', [b.policyId])
      : await db.query('SELECT * FROM relic.pricing_settings WHERE active');
    ensure(p, 'Política ativa não encontrada.', 404);
    return {
      ...calculate(b.input, policySchema.parse(p.settings), req.user!.role),
      policyId: p.id,
      policyVersion: p.version,
    };
  });
  app.get('/api/team', async () =>
    db.query('SELECT id,name,role FROM relic.users WHERE active ORDER BY name'),
  );
  app.get('/api/audit', async (req) => {
    roles(req, 'ADMIN');
    const q = z.object({ before: z.coerce.number().int().positive().optional() }).parse(req.query);
    return db.query(
      'SELECT a.*,u.name AS actor_name FROM relic.audit_log a LEFT JOIN relic.users u ON u.id=a.actor_id WHERE ($1::bigint IS NULL OR a.id<$1) ORDER BY a.id DESC LIMIT 100',
      [q.before ?? null],
    );
  });
  app.get('/api/files', async (req) => {
    const b = z
      .object({ orderId: uuid.optional(), quoteId: uuid.optional() })
      .refine((v) => !!v.orderId !== !!v.quoteId)
      .parse(req.query);
    if (b.quoteId) roles(req, 'ADMIN', 'COMMERCIAL');
    return db.query(
      'SELECT * FROM relic.files WHERE order_id=$1 OR quote_id=$2 ORDER BY created_at DESC',
      [b.orderId ?? null, b.quoteId ?? null],
    );
  });
  app.post('/api/files', async (req, reply) => {
    const b = z
      .object({
        orderId: uuid.optional(),
        quoteId: uuid.optional(),
        name: z.string().min(1).max(200),
        url: z
          .url()
          .max(2000)
          .refine((s) => new URL(s).protocol === 'https:', 'Use uma URL HTTPS.'),
        provider: z.enum(['LINK', 'GOOGLE_DRIVE']).default('LINK'),
        externalId: z.string().max(200).default(''),
      })
      .refine((v) => !!v.orderId !== !!v.quoteId)
      .parse(req.body);
    if (b.quoteId) roles(req, 'ADMIN', 'COMMERCIAL');
    return db.transaction(async (tx) => {
      const [r] = await tx.query(
        'INSERT INTO relic.files(order_id,quote_id,name,url,provider,external_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          b.orderId ?? null,
          b.quoteId ?? null,
          b.name,
          b.url,
          b.provider,
          b.externalId,
          req.user!.id,
        ],
      );
      await audit(tx, req.user!.id, 'FILE_LINKED', 'files', r!.id);
      reply.code(201);
      return r;
    });
  });
}
