import {
  randomBytes,
  scrypt as rawScrypt,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
import '@fastify/cookie';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Sql } from '../lib/db.js';
import type { Config } from '../config/env.js';
import { AppError, ensure, audit } from '../lib/core.js';
const scrypt = (
  password: string,
  salt: string,
  length: number,
  options: import('node:crypto').ScryptOptions,
) =>
  new Promise<Buffer>((resolve, reject) =>
    rawScrypt(password, salt, length, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TEAM' | 'COMMERCIAL';
};
declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    sessionHash: string | null;
    csrfToken: string | null;
  }
}
export const passwordSchema = z.string().min(12, 'Use pelo menos 12 caracteres.').max(128);
export async function hashPassword(password: string) {
  passwordSchema.parse(password);
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [, n, r, p, salt, key] = hash.split('$');
  if (!salt || !key) return false;
  const actual = (await scrypt(password, salt, 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function roles(req: FastifyRequest, ...allowed: User['role'][]) {
  ensure(req.user && allowed.includes(req.user.role), 'Seu perfil não permite esta ação.', 403);
}
export async function createAdmin(db: Sql, name: string, email: string, password: string) {
  const normalized = z.email().parse(email.trim().toLowerCase());
  z.string().min(2).max(120).parse(name);
  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(729104)');
    const [exists] = await tx.query("SELECT id FROM relic.users WHERE role='ADMIN' AND active");
    ensure(
      !exists,
      'O administrador inicial já existe. Use Configurações para criar outros usuários.',
      409,
    );
    const [user] = await tx.query(
      "INSERT INTO relic.users(name,email,password_hash,role) VALUES($1,$2,$3,'ADMIN') RETURNING id,name,email,role",
      [name, normalized, hash],
    );
    await audit(tx, user!.id, 'ADMIN_BOOTSTRAP', 'users', user!.id);
    return user;
  });
}
export async function authRoutes(app: FastifyInstance, db: Sql, c: Config) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionHash', null);
  app.decorateRequest('csrfToken', null);
  const csrf = (token: string) =>
    createHmac('sha256', c.SESSION_SECRET).update(`csrf:${token}`).digest('hex');
  const cookie = {
    httpOnly: true,
    secure: c.COOKIE_SECURE === 'true',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 12 * 60 * 60,
  };
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
      ensure(
        req.headers.origin === new URL(c.APP_ORIGIN).origin,
        'Origem da requisição não autorizada.',
        403,
      );
    if (req.url.split('?')[0] === '/api/auth/login') return;
    const token = req.cookies['relic_session'];
    ensure(token, 'Entre para continuar.', 401);
    const hash = digest(token);
    const [user] = await db.query<User>(
      'SELECT u.id,u.name,u.email,u.role FROM relic.sessions s JOIN relic.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active',
      [hash],
    );
    ensure(user, 'Sua sessão expirou. Entre novamente.', 401);
    req.user = user;
    req.sessionHash = hash;
    req.csrfToken = csrf(token);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const supplied = String(req.headers['x-csrf-token'] ?? '');
      ensure(
        supplied.length === req.csrfToken.length &&
          timingSafeEqual(Buffer.from(supplied), Buffer.from(req.csrfToken)),
        'Token de segurança inválido. Atualize a página.',
        403,
      );
    }
  });
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: c.NODE_ENV === 'test' ? 100 : 8, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { email, password } = z
        .object({ email: z.email().max(254), password: z.string().max(128) })
        .parse(req.body);
      const [row] = await db.query(
        'SELECT id,name,email,role,password_hash FROM relic.users WHERE email=$1 AND active',
        [email.toLowerCase().trim()],
      );
      // A valid dummy hash keeps the expensive password check even for unknown accounts.
      const dummy = 'scrypt$131072$8$1$e474772b16235ab19a046c5571655438$' + '0'.repeat(128);
      const valid = await verifyPassword(password, row?.password_hash ?? dummy);
      if (!row || !valid) throw new AppError(401, 'E-mail ou senha incorretos.');
      const token = randomBytes(32).toString('hex');
      await db.transaction(async (tx) => {
        await tx.query('DELETE FROM relic.sessions WHERE expires_at<now()');
        await tx.query(
          "INSERT INTO relic.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
          [digest(token), row.id],
        );
        await audit(tx, row.id, 'LOGIN', 'users', row.id);
      });
      reply.setCookie('relic_session', token, cookie);
      return {
        user: { id: row.id, name: row.name, email: row.email, role: row.role },
        csrfToken: csrf(token),
      };
    },
  );
  app.get('/api/auth/me', async (req) => ({ user: req.user, csrfToken: req.csrfToken }));
  app.post('/api/auth/logout', async (req, reply) => {
    await db.query('DELETE FROM relic.sessions WHERE token_hash=$1', [req.sessionHash]);
    reply.clearCookie('relic_session', { path: '/' });
    return { ok: true };
  });
  app.post('/api/auth/password', async (req) => {
    const body = z
      .object({ currentPassword: z.string().max(128), newPassword: passwordSchema })
      .parse(req.body);
    const [row] = await db.query('SELECT password_hash FROM relic.users WHERE id=$1', [
      req.user!.id,
    ]);
    ensure(
      await verifyPassword(body.currentPassword, row!.password_hash),
      'Senha atual incorreta.',
      403,
    );
    const hash = await hashPassword(body.newPassword);
    await db.transaction(async (tx) => {
      await tx.query('UPDATE relic.users SET password_hash=$1 WHERE id=$2', [hash, req.user!.id]);
      await tx.query('DELETE FROM relic.sessions WHERE user_id=$1 AND token_hash<>$2', [
        req.user!.id,
        req.sessionHash,
      ]);
      await audit(tx, req.user!.id, 'PASSWORD_CHANGED', 'users', req.user!.id);
    });
    return { ok: true };
  });
}
