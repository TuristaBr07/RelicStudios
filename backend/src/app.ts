import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import type { Config } from './config/env.js';
import type { Sql } from './lib/db.js';
import { AppError } from './lib/core.js';
import { authRoutes } from './modules/auth.js';
import { catalogRoutes } from './modules/catalog.js';
import { manufacturingRoutes } from './modules/manufacturing.js';
import { quoteRoutes } from './modules/quotes.js';
import { orderRoutes } from './modules/orders.js';
export async function buildApp(db: Sql, c: Config) {
  const app = Fastify({
    logger:
      c.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
            serializers: { req: (r) => ({ method: r.method, url: r.url, ip: r.ip }) },
          },
    bodyLimit: 1024 * 1024,
    trustProxy:
      c.RENDER === 'true'
        ? true
        : c.TRUST_PROXY_CIDRS.trim()
          ? c.TRUST_PROXY_CIDRS.split(',').map((value) => value.trim()).filter(Boolean)
          : false,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    hsts: c.COOKIE_SECURE === 'true',
  });
  await app.register(rateLimit, {
    max: c.NODE_ENV === 'test' ? 10000 : 1000,
    timeWindow: '1 minute',
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError)
      return reply
        .code(422)
        .send({
          error: 'Confira os campos informados.',
          issues: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        });
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message });
    const code = (err as { code?: string }).code;
    if (code === '23505')
      return reply.code(409).send({ error: 'Este registro já existe ou a posição está ocupada.' });
    if (code === '23503')
      return reply.code(422).send({ error: 'O registro relacionado não foi encontrado.' });
    if ((err as { statusCode?: number }).statusCode === 429)
      return reply.code(429).send({ error: 'Muitas tentativas. Aguarde um minuto.' });
    if ((err as { statusCode?: number }).statusCode === 413)
      return reply.code(413).send({ error: 'Requisição muito grande.' });
    if ((err as { statusCode?: number }).statusCode === 400)
      return reply.code(400).send({ error: 'Requisição inválida.' });
    req.log.error({ code, errorType: err instanceof Error ? err.name : 'Error' }, 'Falha interna');
    return reply
      .code(500)
      .send({ error: 'Não foi possível concluir a operação.', requestId: req.id });
  });
  app.get('/health', async (_req, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ok', service: 'relic-studios-backend', database: 'connected' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  await authRoutes(app, db, c);
  catalogRoutes(app, db);
  manufacturingRoutes(app, db);
  quoteRoutes(app, db);
  orderRoutes(app, db);
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });
  const root = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (existsSync(root)) {
    await app.register(serveStatic, { root, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Endpoint não encontrado.' })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}
