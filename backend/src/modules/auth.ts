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
  status: 'ACTIVE';
};

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    sessionHash: string | null;
    sessionId: string | null;
    csrfToken: string | null;
  }
}

export const passwordSchema = z.string().min(12, 'Use pelo menos 12 caracteres.').max(128);
const dummyPasswordHash =
  'scrypt$131072$8$1$e474772b16235ab19a046c5571655438$' + '0'.repeat(128);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const publicAuthPaths = new Set([
  '/api/auth/login',
  '/api/auth/activate',
  '/api/auth/password-reset',
]);

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

export async function verifyPassword(password: string, hash: string | null | undefined) {
  const [, n, r, p, salt, key] = (hash ?? '').split('$');
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

export function roles(req: FastifyRequest, ...allowed: User['role'][]) {
  ensure(req.user && allowed.includes(req.user.role), 'Seu perfil não permite esta ação.', 403);
}

const publicUser = (row: Record<string, any>): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  status: 'ACTIVE',
});

function linkFor(c: Config, path: '/activate' | '/reset-password', token: string) {
  const url = new URL(path, c.APP_ORIGIN);
  url.searchParams.set('token', token);
  return url.toString();
}

async function issueToken(
  tx: Sql,
  c: Config,
  userId: string,
  purpose: 'INVITE' | 'RESET',
  actor: string,
) {
  const raw = randomBytes(32).toString('base64url');
  await tx.query(
    'DELETE FROM relic.auth_tokens WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',
    [userId, purpose],
  );
  const interval = purpose === 'INVITE' ? "interval '48 hours'" : "interval '30 minutes'";
  const [row] = await tx.query(
    `INSERT INTO relic.auth_tokens(token_hash,user_id,purpose,expires_at,created_by) VALUES($1,$2,$3,now()+${interval},$4) RETURNING id,expires_at`,
    [digest(raw), userId, purpose, actor],
  );
  return {
    url: linkFor(c, purpose === 'INVITE' ? '/activate' : '/reset-password', raw),
    expiresAt: row!.expires_at,
  };
}

async function tokenRecord(tx: Sql, token: string, purpose: 'INVITE' | 'RESET') {
  const [row] = await tx.query(
    `SELECT t.id,t.user_id,u.status,u.active
       FROM relic.auth_tokens t
       JOIN relic.users u ON u.id=t.user_id
      WHERE t.token_hash=$1 AND t.purpose=$2 AND t.used_at IS NULL AND t.expires_at>now()
      FOR UPDATE`,
    [digest(token), purpose],
  );
  ensure(row, 'Este link é inválido, expirou ou já foi utilizado.', 422);
  return row;
}

export async function createAdmin(db: Sql, name: string, email: string, password: string) {
  const normalized = z.email().parse(email.trim().toLowerCase());
  z.string().min(2).max(120).parse(name);
  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(729104)');
    const [exists] = await tx.query(
      "SELECT id FROM relic.users WHERE role='ADMIN' AND status='ACTIVE'",
    );
    ensure(
      !exists,
      'O administrador inicial já existe. Use Configurações para criar outros usuários.',
      409,
    );
    const [user] = await tx.query(
      "INSERT INTO relic.users(name,email,password_hash,role,status,activated_at,password_changed_at) VALUES($1,$2,$3,'ADMIN','ACTIVE',now(),now()) RETURNING id,name,email,role,status",
      [name.trim(), normalized, hash],
    );
    await audit(tx, user!.id, 'ADMIN_BOOTSTRAP', 'users', user!.id);
    return user;
  });
}

export async function authRoutes(app: FastifyInstance, db: Sql, c: Config) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionHash', null);
  app.decorateRequest('sessionId', null);
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
    const path = req.url.split('?')[0]!;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutating)
      ensure(
        req.headers.origin === new URL(c.APP_ORIGIN).origin,
        'Origem da requisição não autorizada.',
        403,
      );
    if (publicAuthPaths.has(path)) return;

    const token = req.cookies['relic_session'];
    ensure(token, 'Entre para continuar.', 401);
    const hash = digest(token);
    const [row] = await db.query(
      `SELECT u.id,u.name,u.email,u.role,u.status,s.id AS session_id,s.last_seen_at
         FROM relic.sessions s
         JOIN relic.users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND u.status='ACTIVE'`,
      [hash],
    );
    ensure(row, 'Sua sessão expirou. Entre novamente.', 401);
    req.user = publicUser(row!);
    req.sessionHash = hash;
    req.sessionId = row!.session_id;
    req.csrfToken = csrf(token);
    await db.query(
      "UPDATE relic.sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '5 minutes'",
      [hash],
    );
    if (mutating) {
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
        'SELECT id,name,email,role,status,active,password_hash FROM relic.users WHERE email=$1',
        [email.toLowerCase().trim()],
      );
      const validPassword = await verifyPassword(password, row?.password_hash ?? dummyPasswordHash);
      if (!row || row.status !== 'ACTIVE' || !row.active || !validPassword)
        throw new AppError(401, 'E-mail ou senha incorretos.');

      const token = randomBytes(32).toString('base64url');
      await db.transaction(async (tx) => {
        await tx.query('DELETE FROM relic.sessions WHERE expires_at<now()');
        await tx.query('DELETE FROM relic.auth_tokens WHERE expires_at<now() OR used_at IS NOT NULL');
        await tx.query(
          `INSERT INTO relic.sessions(token_hash,user_id,expires_at,user_agent,ip_address,last_seen_at)
           VALUES($1,$2,now()+interval '12 hours',$3,$4,now())`,
          [digest(token), row.id, String(req.headers['user-agent'] ?? '').slice(0, 500), req.ip.slice(0, 100)],
        );
        await tx.query(
          `DELETE FROM relic.sessions
            WHERE user_id=$1 AND token_hash NOT IN (
              SELECT token_hash FROM relic.sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10
            )`,
          [row.id],
        );
        await tx.query('UPDATE relic.users SET last_login_at=now() WHERE id=$1', [row.id]);
        await audit(tx, row.id, 'LOGIN', 'users', row.id);
      });
      reply.setCookie('relic_session', token, cookie);
      return { user: publicUser(row), csrfToken: csrf(token) };
    },
  );

  app.post(
    '/api/auth/activate',
    { config: { rateLimit: { max: c.NODE_ENV === 'test' ? 100 : 8, timeWindow: '1 minute' } } },
    async (req) => {
      const body = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(req.body);
      const hash = await hashPassword(body.password);
      return db.transaction(async (tx) => {
        const record = await tokenRecord(tx, body.token, 'INVITE');
        ensure(record.status === 'PENDING', 'Esta conta já foi ativada ou não aceita este convite.', 409);
        await tx.query(
          "UPDATE relic.users SET password_hash=$1,status='ACTIVE',activated_at=now(),password_changed_at=now() WHERE id=$2",
          [hash, record.user_id],
        );
        await tx.query('UPDATE relic.auth_tokens SET used_at=now() WHERE id=$1', [record.id]);
        await tx.query('DELETE FROM relic.auth_tokens WHERE user_id=$1 AND id<>$2', [record.user_id, record.id]);
        await audit(tx, record.user_id, 'USER_ACTIVATED', 'users', record.user_id);
        return { ok: true };
      });
    },
  );

  app.post(
    '/api/auth/password-reset',
    { config: { rateLimit: { max: c.NODE_ENV === 'test' ? 100 : 8, timeWindow: '1 minute' } } },
    async (req) => {
      const body = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(req.body);
      const hash = await hashPassword(body.password);
      return db.transaction(async (tx) => {
        const record = await tokenRecord(tx, body.token, 'RESET');
        ensure(record.status === 'ACTIVE', 'A conta não está ativa.', 403);
        await tx.query(
          'UPDATE relic.users SET password_hash=$1,password_changed_at=now() WHERE id=$2',
          [hash, record.user_id],
        );
        await tx.query('DELETE FROM relic.sessions WHERE user_id=$1', [record.user_id]);
        await tx.query('UPDATE relic.auth_tokens SET used_at=now() WHERE id=$1', [record.id]);
        await tx.query('DELETE FROM relic.auth_tokens WHERE user_id=$1 AND id<>$2', [record.user_id, record.id]);
        await audit(tx, record.user_id, 'PASSWORD_RESET', 'users', record.user_id);
        return { ok: true };
      });
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
    const [row] = await db.query('SELECT password_hash FROM relic.users WHERE id=$1', [req.user!.id]);
    ensure(await verifyPassword(body.currentPassword, row!.password_hash), 'Senha atual incorreta.', 403);
    ensure(
      !(await verifyPassword(body.newPassword, row!.password_hash)),
      'A nova senha deve ser diferente da senha atual.',
    );
    const hash = await hashPassword(body.newPassword);
    await db.transaction(async (tx) => {
      await tx.query(
        'UPDATE relic.users SET password_hash=$1,password_changed_at=now() WHERE id=$2',
        [hash, req.user!.id],
      );
      await tx.query('DELETE FROM relic.sessions WHERE user_id=$1 AND token_hash<>$2', [
        req.user!.id,
        req.sessionHash,
      ]);
      await tx.query("DELETE FROM relic.auth_tokens WHERE user_id=$1 AND purpose='RESET'", [req.user!.id]);
      await audit(tx, req.user!.id, 'PASSWORD_CHANGED', 'users', req.user!.id);
    });
    return { ok: true };
  });

  app.get('/api/auth/sessions', async (req) => {
    const rows = await db.query(
      'SELECT id,created_at,expires_at,last_seen_at,user_agent,ip_address FROM relic.sessions WHERE user_id=$1 AND expires_at>now() ORDER BY last_seen_at DESC,created_at DESC',
      [req.user!.id],
    );
    return rows.map((row) => ({ ...row, current: row.id === req.sessionId }));
  });

  app.delete('/api/auth/sessions/:id', async (req, reply) => {
    const id = z.object({ id: z.uuid() }).parse(req.params).id;
    const [session] = await db.query('SELECT id FROM relic.sessions WHERE id=$1 AND user_id=$2', [
      id,
      req.user!.id,
    ]);
    ensure(session, 'Sessão não encontrada.', 404);
    const current = id === req.sessionId;
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM relic.sessions WHERE id=$1 AND user_id=$2', [id, req.user!.id]);
      await audit(tx, req.user!.id, 'SESSION_REVOKED', 'sessions', id, { current });
    });
    if (current) reply.clearCookie('relic_session', { path: '/' });
    return { ok: true, current };
  });

  app.post('/api/auth/sessions/revoke-others', async (req) => {
    const rows = await db.transaction(async (tx) => {
      const removed = await tx.query(
        'DELETE FROM relic.sessions WHERE user_id=$1 AND id<>$2 RETURNING id',
        [req.user!.id, req.sessionId],
      );
      await audit(tx, req.user!.id, 'SESSIONS_REVOKED', 'users', req.user!.id, {
        count: removed.length,
      });
      return removed;
    });
    return { ok: true, revoked: rows.length };
  });

  app.get('/api/users', async (req) => {
    roles(req, 'ADMIN');
    return db.query(
      'SELECT id,name,email,role,status,active,created_at,invited_at,activated_at,last_login_at FROM relic.users ORDER BY name',
    );
  });

  app.post('/api/users', async (req, reply) => {
    roles(req, 'ADMIN');
    const body = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.email().max(254),
        role: z.enum(['ADMIN', 'TEAM', 'COMMERCIAL']),
      })
      .strict()
      .parse(req.body);
    const normalized = body.email.trim().toLowerCase();
    const result = await db.transaction(async (tx) => {
      const [user] = await tx.query(
        "INSERT INTO relic.users(name,email,password_hash,role,status,invited_at) VALUES($1,$2,$3,$4,'PENDING',now()) RETURNING id,name,email,role,status,active,created_at,invited_at,activated_at,last_login_at",
        [body.name, normalized, dummyPasswordHash, body.role],
      );
      const invitation = await issueToken(tx, c, user!.id, 'INVITE', req.user!.id);
      await audit(tx, req.user!.id, 'USER_INVITED', 'users', user!.id, { role: body.role });
      return { ...user, invitationUrl: invitation.url, invitationExpiresAt: invitation.expiresAt };
    });
    reply.code(201);
    return result;
  });

  app.patch('/api/users/:id', async (req) => {
    roles(req, 'ADMIN');
    const id = z.object({ id: z.uuid() }).parse(req.params).id;
    const body = z
      .object({
        status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']),
        role: z.enum(['ADMIN', 'TEAM', 'COMMERCIAL']),
      })
      .strict()
      .parse(req.body);
    ensure(id !== req.user!.id, 'Altere sua própria conta apenas pelos controles de conta.', 403);
    return db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(729106)');
      const [current] = await tx.query('SELECT id,role,status FROM relic.users WHERE id=$1 FOR UPDATE', [id]);
      ensure(current, 'Usuário não encontrado.', 404);
      if (current.status === 'PENDING')
        ensure(body.status === 'PENDING', 'Contas pendentes são ativadas somente pelo link de convite.');
      else ensure(body.status !== 'PENDING', 'Uma conta existente não pode voltar ao estado pendente.');

      const removesLastAdmin =
        current.role === 'ADMIN' &&
        current.status === 'ACTIVE' &&
        (body.role !== 'ADMIN' || body.status !== 'ACTIVE');
      if (removesLastAdmin) {
        const [count] = await tx.query(
          "SELECT count(*)::integer AS count FROM relic.users WHERE role='ADMIN' AND status='ACTIVE' AND id<>$1",
          [id],
        );
        ensure(count!.count > 0, 'Mantenha ao menos um administrador ativo.', 409);
      }

      const [user] = await tx.query(
        'UPDATE relic.users SET role=$1,status=$2 WHERE id=$3 RETURNING id,name,email,role,status,active,created_at,invited_at,activated_at,last_login_at',
        [body.role, body.status, id],
      );
      if (body.status !== 'ACTIVE') await tx.query('DELETE FROM relic.sessions WHERE user_id=$1', [id]);
      const action =
        current.status !== body.status
          ? body.status === 'SUSPENDED'
            ? 'USER_SUSPENDED'
            : 'USER_REACTIVATED'
          : 'USER_UPDATED';
      await audit(tx, req.user!.id, action, 'users', id, {
        from: { role: current.role, status: current.status },
        to: { role: body.role, status: body.status },
      });
      return user;
    });
  });

  app.post('/api/users/:id/invitation', async (req) => {
    roles(req, 'ADMIN');
    const id = z.object({ id: z.uuid() }).parse(req.params).id;
    return db.transaction(async (tx) => {
      const [user] = await tx.query('SELECT id,status FROM relic.users WHERE id=$1 FOR UPDATE', [id]);
      ensure(user, 'Usuário não encontrado.', 404);
      ensure(user.status === 'PENDING', 'Somente contas pendentes recebem um novo convite.');
      const invitation = await issueToken(tx, c, id, 'INVITE', req.user!.id);
      await tx.query('UPDATE relic.users SET invited_at=now() WHERE id=$1', [id]);
      await audit(tx, req.user!.id, 'USER_INVITATION_REISSUED', 'users', id);
      return { invitationUrl: invitation.url, invitationExpiresAt: invitation.expiresAt };
    });
  });

  app.post('/api/users/:id/password-reset', async (req) => {
    roles(req, 'ADMIN');
    const id = z.object({ id: z.uuid() }).parse(req.params).id;
    return db.transaction(async (tx) => {
      const [user] = await tx.query('SELECT id,status FROM relic.users WHERE id=$1 FOR UPDATE', [id]);
      ensure(user, 'Usuário não encontrado.', 404);
      ensure(user.status === 'ACTIVE', 'Somente contas ativas podem receber recuperação de senha.');
      const reset = await issueToken(tx, c, id, 'RESET', req.user!.id);
      await audit(tx, req.user!.id, 'PASSWORD_RESET_ISSUED', 'users', id);
      return { resetUrl: reset.url, resetExpiresAt: reset.expiresAt };
    });
  });
}
