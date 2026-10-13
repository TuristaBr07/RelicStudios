from pathlib import Path


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Expected snippet not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def remove_between(path: str, start: str, end: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    a = text.find(start)
    b = text.find(end, a)
    if a < 0 or b < 0:
        raise RuntimeError(f'Expected block not found in {path}')
    p.write_text(text[:a] + text[b:], encoding='utf-8')


write('database/migrations/003_auth_rbac.sql', r'''-- Ciclo de vida de contas, sessões administráveis e tokens de uso único.
ALTER TABLE relic.users ADD COLUMN status text;
UPDATE relic.users SET status = CASE WHEN active THEN 'ACTIVE' ELSE 'SUSPENDED' END;
ALTER TABLE relic.users ALTER COLUMN status SET NOT NULL;
ALTER TABLE relic.users ALTER COLUMN status SET DEFAULT 'ACTIVE';
ALTER TABLE relic.users ADD CONSTRAINT users_status_check CHECK(status IN ('PENDING','ACTIVE','SUSPENDED'));
ALTER TABLE relic.users ADD COLUMN invited_at timestamptz;
ALTER TABLE relic.users ADD COLUMN activated_at timestamptz;
ALTER TABLE relic.users ADD COLUMN last_login_at timestamptz;
ALTER TABLE relic.users ADD COLUMN password_changed_at timestamptz;
UPDATE relic.users
SET activated_at = created_at,
    password_changed_at = created_at
WHERE status = 'ACTIVE';
ALTER TABLE relic.users ADD CONSTRAINT users_status_active_consistency CHECK((status = 'ACTIVE') = active);

CREATE FUNCTION relic.sync_user_status_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.active = NEW.status = 'ACTIVE';
  RETURN NEW;
END $$;
CREATE TRIGGER users_status_sync
BEFORE INSERT OR UPDATE OF status ON relic.users
FOR EACH ROW EXECUTE FUNCTION relic.sync_user_status_active();

ALTER TABLE relic.sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE relic.sessions ADD CONSTRAINT sessions_id_unique UNIQUE(id);
ALTER TABLE relic.sessions ADD COLUMN user_agent text NOT NULL DEFAULT '';
ALTER TABLE relic.sessions ADD COLUMN ip_address text NOT NULL DEFAULT '';
ALTER TABLE relic.sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX sessions_user_created_idx ON relic.sessions(user_id,created_at DESC);

CREATE TABLE relic.auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES relic.users(id),
  purpose text NOT NULL CHECK(purpose IN ('INVITE','RESET')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES relic.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at > created_at)
);
CREATE INDEX auth_tokens_user_purpose_idx ON relic.auth_tokens(user_id,purpose,created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relic_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON relic.auth_tokens TO relic_runtime';
  END IF;
END;
$$;
''')

write('backend/src/modules/auth.ts', r'''import {
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
''')

# Usuários agora pertencem ao módulo de autenticação; catálogo mantém apenas dados comerciais.
replace(
    'backend/src/modules/catalog.ts',
    "import { roles, hashPassword, passwordSchema } from './auth.js';",
    "import { roles } from './auth.js';",
)
remove_between(
    'backend/src/modules/catalog.ts',
    "  app.get('/api/users',",
    "  app.get('/api/audit',",
)

# RBAC: produção recebe a operação; dados financeiros ficam somente com ADMIN/COMMERCIAL.
replace(
    'backend/src/modules/orders.ts',
    "export async function orderDetail(db: Sql, id: string) {\n  const [o] = await db.query('SELECT * FROM relic.orders WHERE id=$1', [id]);\n  ensure(o, 'Pedido não encontrado.', 404);\n  const paid = await received(db, id);\n  const steps = await db.query(\n    \"SELECT s.*,u.name AS assignee_name,i.snapshot FROM relic.production_steps s LEFT JOIN relic.users u ON u.id=s.assigned_to JOIN relic.order_items i ON i.id=s.order_item_id WHERE s.order_id=$1 ORDER BY (i.snapshot->>'position')::integer,s.position\",\n    [id],\n  );\n  return {\n    ...o,\n    received_cents: paid,\n    pending_cents: Math.max(0, o.total_cents - paid),\n    deposit_pending_cents: Math.max(0, o.deposit_cents - paid),\n    items: await db.query(\n      \"SELECT * FROM relic.order_items WHERE order_id=$1 ORDER BY (snapshot->>'position')::integer\",\n      [id],\n    ),\n    steps,\n    payments: await db.query(\n      'SELECT * FROM relic.payments WHERE order_id=$1 ORDER BY created_at DESC',\n      [id],\n    ),\n  };\n}\n",
    "const operationalSnapshot = (snapshot: Row = {}) => ({\n  position: snapshot.position,\n  description: snapshot.description,\n  character_name: snapshot.character_name,\n  scale: snapshot.scale,\n  quantity: snapshot.quantity,\n});\nconst teamOrder = (order: Row) => ({\n  id: order.id,\n  code: order.code,\n  status: order.status,\n  due_date: order.due_date,\n  notes: order.notes,\n  delivered_at: order.delivered_at,\n  version: order.version,\n  created_at: order.created_at,\n  updated_at: order.updated_at,\n  client_snapshot: { name: order.client_snapshot?.name ?? '' },\n  commercial_snapshot: {\n    quoteCode: order.commercial_snapshot?.quoteCode ?? '',\n    leadDays: order.commercial_snapshot?.leadDays ?? 0,\n  },\n});\nexport async function orderDetail(db: Sql, id: string, financial = true) {\n  const [o] = await db.query('SELECT * FROM relic.orders WHERE id=$1', [id]);\n  ensure(o, 'Pedido não encontrado.', 404);\n  const steps = await db.query(\n    \"SELECT s.*,u.name AS assignee_name,i.snapshot FROM relic.production_steps s LEFT JOIN relic.users u ON u.id=s.assigned_to JOIN relic.order_items i ON i.id=s.order_item_id WHERE s.order_id=$1 ORDER BY (i.snapshot->>'position')::integer,s.position\",\n    [id],\n  );\n  const items = await db.query(\n    \"SELECT * FROM relic.order_items WHERE order_id=$1 ORDER BY (snapshot->>'position')::integer\",\n    [id],\n  );\n  if (!financial)\n    return {\n      ...teamOrder(o!),\n      items: items.map((item) => ({ ...item, snapshot: operationalSnapshot(item.snapshot) })),\n      steps: steps.map((step) => ({ ...step, snapshot: operationalSnapshot(step.snapshot) })),\n      payments: [],\n    };\n  const paid = await received(db, id);\n  return {\n    ...o,\n    received_cents: paid,\n    pending_cents: Math.max(0, o.total_cents - paid),\n    deposit_pending_cents: Math.max(0, o.deposit_cents - paid),\n    items,\n    steps,\n    payments: await db.query(\n      'SELECT * FROM relic.payments WHERE order_id=$1 ORDER BY created_at DESC',\n      [id],\n    ),\n  };\n}\n",
)
replace(
    'backend/src/modules/orders.ts',
    "  app.get('/api/orders', async () =>\n    db.query(\n      \"SELECT o.*,coalesce(p.received,0)::integer AS received_cents,o.total_cents-coalesce(p.received,0)::integer AS pending_cents FROM relic.orders o LEFT JOIN (SELECT order_id,sum(CASE WHEN kind='REFUND' THEN -amount_cents ELSE amount_cents END) AS received FROM relic.payments WHERE status='RECEIVED' GROUP BY order_id) p ON p.order_id=o.id ORDER BY o.created_at DESC LIMIT 200\",\n    ),\n  );\n  app.get('/api/orders/:id', async (req) => orderDetail(db, getId(req.params)));",
    "  app.get('/api/orders', async (req) => {\n    const rows = await db.query(\n      \"SELECT o.*,coalesce(p.received,0)::integer AS received_cents,o.total_cents-coalesce(p.received,0)::integer AS pending_cents FROM relic.orders o LEFT JOIN (SELECT order_id,sum(CASE WHEN kind='REFUND' THEN -amount_cents ELSE amount_cents END) AS received FROM relic.payments WHERE status='RECEIVED' GROUP BY order_id) p ON p.order_id=o.id ORDER BY o.created_at DESC LIMIT 200\",\n    );\n    return req.user!.role === 'TEAM' ? rows.map(teamOrder) : rows;\n  });\n  app.get('/api/orders/:id', async (req) =>\n    orderDetail(db, getId(req.params), req.user!.role !== 'TEAM'),\n  );",
)
replace(
    'backend/src/modules/orders.ts',
    "    if (['DELIVERED', 'CANCELLED'].includes(b.status)) roles(req, 'ADMIN', 'COMMERCIAL');",
    "    if (['IN_PRODUCTION', 'READY'].includes(b.status)) roles(req, 'ADMIN', 'TEAM');\n    else roles(req, 'ADMIN', 'COMMERCIAL');",
)
replace(
    'backend/src/modules/orders.ts',
    "      return r;\n    });\n  });\n  app.patch('/api/orders/:id',",
    "      return req.user!.role === 'TEAM' ? teamOrder(r!) : r;\n    });\n  });\n  app.patch('/api/orders/:id',",
)
replace(
    'backend/src/modules/orders.ts',
    "  app.get('/api/production', async () =>\n    db.query(\n      \"SELECT s.*,o.code AS order_code,o.status AS order_status,o.due_date,o.client_snapshot,i.snapshot,u.name AS assignee_name FROM relic.production_steps s JOIN relic.orders o ON o.id=s.order_id JOIN relic.order_items i ON i.id=s.order_item_id LEFT JOIN relic.users u ON u.id=s.assigned_to WHERE o.status NOT IN ('DELIVERED','CANCELLED') ORDER BY o.due_date,o.code,(i.snapshot->>'position')::integer,s.position LIMIT 1000\",\n    ),\n  );\n  app.patch('/api/production/:id', async (req) => {\n    const id = getId(req.params);",
    "  app.get('/api/production', async (req) => {\n    const rows = await db.query(\n      \"SELECT s.*,o.code AS order_code,o.status AS order_status,o.due_date,o.client_snapshot,i.snapshot,u.name AS assignee_name FROM relic.production_steps s JOIN relic.orders o ON o.id=s.order_id JOIN relic.order_items i ON i.id=s.order_item_id LEFT JOIN relic.users u ON u.id=s.assigned_to WHERE o.status NOT IN ('DELIVERED','CANCELLED') ORDER BY o.due_date,o.code,(i.snapshot->>'position')::integer,s.position LIMIT 1000\",\n    );\n    return req.user!.role === 'TEAM'\n      ? rows.map((row) => ({\n          ...row,\n          client_snapshot: { name: row.client_snapshot?.name ?? '' },\n          snapshot: operationalSnapshot(row.snapshot),\n        }))\n      : rows;\n  });\n  app.patch('/api/production/:id', async (req) => {\n    roles(req, 'ADMIN', 'TEAM');\n    const id = getId(req.params);",
)
replace(
    'backend/src/modules/orders.ts',
    "      \"SELECT id,code,status,due_date,client_snapshot,total_cents FROM relic.orders WHERE status NOT IN ('DELIVERED','CANCELLED') ORDER BY due_date LIMIT 6\",",
    "      \"SELECT id,code,status,due_date,client_snapshot FROM relic.orders WHERE status NOT IN ('DELIVERED','CANCELLED') ORDER BY due_date LIMIT 6\",",
)

write('frontend/src/pages/Access.tsx', r'''import { useState } from 'react';
import { KeyRound, ShieldCheck, ArrowRight } from 'lucide-react';
import { api, send, Field, Form, Button, Feedback, useAction } from '../lib';

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="login">
      <div className="login-brand">
        <div className="brand large">
          <span className="brand-symbol">R</span>
          <div>
            RELIC<small>STUDIOS</small>
          </div>
        </div>
        <div className="login-statement">
          <span className="eyebrow">ACESSO PRIVADO</span>
          <h1>
            Seu espaço de trabalho,<br />protegido.
          </h1>
          <p>Convites e recuperações usam links únicos e com validade curta.</p>
        </div>
        <span className="login-footer">COLECIONÁVEIS · ARTE · PRECISÃO</span>
      </div>
      <div className="login-panel">
        <div className="login-form">{children}</div>
      </div>
    </main>
  );
}

function tokenFromLocation() {
  return new URLSearchParams(window.location.search).get('token') ?? '';
}

export function ActivateAccount() {
  const token = tokenFromLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const action = useAction();
  return (
    <PublicShell>
      <span className="eyebrow">PRIMEIRO ACESSO</span>
      <h2>Ative sua conta.</h2>
      <p>Defina sua senha pessoal. O link de convite funciona uma única vez.</p>
      {done ? (
        <>
          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>Conta ativada. Você já pode entrar no ateliê.</span>
          </div>
          <a className="button primary full" href="/">
            Ir para o login <ArrowRight size={18} />
          </a>
        </>
      ) : (
        <Form
          onSubmit={() =>
            void action.run(async () => {
              if (!token) throw new Error('O link de convite está incompleto.');
              if (password !== confirm) throw new Error('As senhas não coincidem.');
              await api('/auth/activate', send('POST', { token, password }));
              setDone(true);
            })
          }
        >
          <Field label="Nova senha" hint="Use pelo menos 12 caracteres.">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirmar senha">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Feedback action={action} />
          <Button className="primary full" busy={action.busy}>
            <KeyRound size={18} /> Ativar conta
          </Button>
        </Form>
      )}
    </PublicShell>
  );
}

export function ResetPassword() {
  const token = tokenFromLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const action = useAction();
  return (
    <PublicShell>
      <span className="eyebrow">RECUPERAÇÃO DE ACESSO</span>
      <h2>Defina uma nova senha.</h2>
      <p>Ao concluir, todas as sessões antigas da conta serão encerradas.</p>
      {done ? (
        <>
          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>Senha redefinida e sessões anteriores revogadas.</span>
          </div>
          <a className="button primary full" href="/">
            Voltar ao login <ArrowRight size={18} />
          </a>
        </>
      ) : (
        <Form
          onSubmit={() =>
            void action.run(async () => {
              if (!token) throw new Error('O link de recuperação está incompleto.');
              if (password !== confirm) throw new Error('As senhas não coincidem.');
              await api('/auth/password-reset', send('POST', { token, password }));
              setDone(true);
            })
          }
        >
          <Field label="Nova senha" hint="Use pelo menos 12 caracteres.">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirmar senha">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Feedback action={action} />
          <Button className="primary full" busy={action.busy}>
            <KeyRound size={18} /> Redefinir senha
          </Button>
        </Form>
      )}
    </PublicShell>
  );
}
''')

replace(
    'frontend/src/App.tsx',
    "import { SettingsPage } from './pages/Settings';",
    "import { SettingsPage } from './pages/Settings';\nimport { ActivateAccount, ResetPassword } from './pages/Access';",
)
replace(
    'frontend/src/App.tsx',
    "  if (loading) return <Loading />;\n  if (!user) return <Login />;",
    "  if (loading) return <Loading />;\n  if (!user) {\n    if (location.pathname === '/activate') return <ActivateAccount />;\n    if (location.pathname === '/reset-password') return <ResetPassword />;\n    return <Login />;\n  }",
)

replace(
    'frontend/src/lib.tsx',
    "  role: 'ADMIN' | 'TEAM' | 'COMMERCIAL';\n};",
    "  role: 'ADMIN' | 'TEAM' | 'COMMERCIAL';\n  status: 'ACTIVE';\n};",
)
replace(
    'frontend/src/lib.tsx',
    "  PENDING: 'Pendente',",
    "  PENDING: 'Pendente',\n  ACTIVE: 'Ativo',\n  SUSPENDED: 'Suspenso',",
)

write('frontend/src/pages/Settings.tsx', r'''import { useState } from 'react';
import {
  Plus,
  ShieldCheck,
  History,
  KeyRound,
  Copy,
  MonitorSmartphone,
  RefreshCw,
} from 'lucide-react';
import {
  useData,
  useAuth,
  useAction,
  api,
  send,
  Header,
  Field,
  Form,
  Button,
  Modal,
  Feedback,
  Loading,
  ErrorBox,
  num,
  date,
  labels,
  type Row,
} from '../lib';
import { eventLabel } from './Dashboard';

const policyLabels: Record<string, string> = {
  finishingHourly: 'Acabamento (R$/h)',
  paintingHourly: 'Pintura (R$/h)',
  modelingHourly: 'Modelagem (R$/h)',
  reservePercent: 'Reserva de impressão (%)',
  overheadPercent: 'Overhead (%)',
  minimumMarginPercent: 'Margem mínima (%)',
  defaultMarginPercent: 'Margem padrão (%)',
  premiumMinPercent: 'Premium: mínimo (%)',
  premiumMaxPercent: 'Premium: máximo (%)',
  maximumPixPercent: 'Desconto Pix máximo (%)',
  validityDays: 'Validade do orçamento (dias)',
  depositPercent: 'Entrada (%)',
};

function Policies() {
  const { data, error, loading, reload } = useData<Row[]>('/policies?includeInactive=true');
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState<Row>({}),
    [name, setName] = useState('');
  const action = useAction();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">POLÍTICA COMERCIAL</span>
          <h2>Versões de precificação</h2>
        </div>
        <button
          onClick={() => {
            setSettings({ ...data?.find((p) => p.active)?.settings });
            setName('');
            action.clear();
            setOpen(true);
          }}
        >
          <Plus size={16} /> Nova versão
        </button>
      </div>
      <Feedback action={action} />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data?.map((p) => (
          <details className="policy-version" key={p.id} open={p.active}>
            <summary>
              <span>
                <b>{p.name}</b>
                <small>
                  Versão {p.version} · {date(p.created_at)}
                </small>
              </span>
              <span className={`tag ${p.active ? 'green' : ''}`}>
                {p.active ? 'Ativa' : 'Histórico'}
              </span>
            </summary>
            <dl className="policy-values">
              {Object.entries(p.settings).map(([k, v]) => (
                <div key={k}>
                  <dt>{policyLabels[k] ?? k}</dt>
                  <dd>{Number(v).toLocaleString('pt-BR')}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))
      )}
      <p className="fine-print">
        Publicar uma versão ativa a nova política. Orçamentos anteriores preservam seus custos,
        preços e condições.
      </p>
      {open && (
        <Modal title="Publicar nova política" onClose={() => setOpen(false)}>
          <Form
            className="modal-body"
            onSubmit={() =>
              void action.run(async () => {
                await api('/policies', send('POST', { name, settings }));
                setOpen(false);
                await reload();
              }, 'Nova política publicada.')
            }
          >
            <Field label="Nome da versão">
              <input
                required
                minLength={3}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="form-grid">
              {Object.entries(policyLabels).map(([k, label]) => (
                <Field key={k} label={label}>
                  <input
                    required
                    type="number"
                    min="0"
                    step={k === 'validityDays' ? '1' : '0.01'}
                    value={settings[k] ?? ''}
                    onChange={(e) => setSettings({ ...settings, [k]: num(e.target.value) })}
                  />
                </Field>
              ))}
            </div>
            <Feedback action={action} />
            <Button className="primary" busy={action.busy}>
              Publicar nova versão
            </Button>
          </Form>
        </Modal>
      )}
    </section>
  );
}

type AccessLink = { title: string; url: string; expiresAt: string };

function AccessLinkModal({ link, onClose }: { link: AccessLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={link.title} onClose={onClose}>
      <div className="modal-body">
        <p className="muted">
          Compartilhe o link por um canal seguro. O servidor armazena somente o hash do token e este
          valor completo não será exibido novamente após fechar esta janela.
        </p>
        <Field label="Link de acesso">
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <p className="fine-print">Validade: {new Date(link.expiresAt).toLocaleString('pt-BR')}.</p>
        <Button
          className="primary full"
          onClick={() =>
            void navigator.clipboard.writeText(link.url).then(() => {
              setCopied(true);
            })
          }
        >
          <Copy size={16} /> {copied ? 'Link copiado' : 'Copiar link'}
        </Button>
      </div>
    </Modal>
  );
}

function Users() {
  const { user } = useAuth();
  const { data, error, reload } = useData<Row[]>('/users');
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState('TEAM'),
    [link, setLink] = useState<AccessLink | null>(null);
  const action = useAction();

  const updateUser = async (u: Row, patch: Partial<Row>) => {
    await api(
      `/users/${u.id}`,
      send('PATCH', { role: patch.role ?? u.role, status: patch.status ?? u.status }),
    );
    await reload();
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            <ShieldCheck size={20} /> Acesso da equipe
          </h2>
          <p className="muted">Convites, perfis e recuperação sem compartilhar senhas iniciais.</p>
        </div>
        <button
          onClick={() => {
            setName('');
            setEmail('');
            setRole('TEAM');
            action.clear();
            setOpen(true);
          }}
        >
          <Plus size={16} /> Convidar usuário
        </button>
      </div>
      <Feedback action={action} />
      <ErrorBox error={error} />
      {data?.map((u) => (
        <div className="user-row" key={u.id}>
          <span className="client-avatar">{u.name.slice(0, 1)}</span>
          <div>
            <strong>{u.name}</strong>
            <small>
              {u.email} · {labels[u.role]}
              {u.last_login_at ? ` · último acesso ${date(u.last_login_at)}` : ''}
            </small>
          </div>
          <span className={`tag ${u.status === 'ACTIVE' ? 'green' : ''}`}>{labels[u.status] ?? u.status}</span>
          {u.id !== user!.id && (
            <div className="button-row">
              <select
                aria-label={`Perfil de ${u.name}`}
                value={u.role}
                disabled={action.busy}
                onChange={(e) => void action.run(() => updateUser(u, { role: e.target.value }))}
              >
                {['TEAM', 'COMMERCIAL', 'ADMIN'].map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
              </select>
              {u.status === 'PENDING' && (
                <Button
                  className="small"
                  busy={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      const r = await api(`/users/${u.id}/invitation`, send('POST', {}));
                      setLink({
                        title: 'Novo link de convite',
                        url: r.invitationUrl,
                        expiresAt: r.invitationExpiresAt,
                      });
                      await reload();
                    })
                  }
                >
                  <RefreshCw size={14} /> Novo convite
                </Button>
              )}
              {u.status === 'ACTIVE' && (
                <>
                  <Button
                    className="small"
                    busy={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        const r = await api(`/users/${u.id}/password-reset`, send('POST', {}));
                        setLink({
                          title: 'Link de recuperação',
                          url: r.resetUrl,
                          expiresAt: r.resetExpiresAt,
                        });
                      })
                    }
                  >
                    Recuperar acesso
                  </Button>
                  <Button
                    className="small"
                    busy={action.busy}
                    onClick={() => void action.run(() => updateUser(u, { status: 'SUSPENDED' }))}
                  >
                    Suspender
                  </Button>
                </>
              )}
              {u.status === 'SUSPENDED' && (
                <Button
                  className="small"
                  busy={action.busy}
                  onClick={() => void action.run(() => updateUser(u, { status: 'ACTIVE' }))}
                >
                  Reativar
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      {open && (
        <Modal title="Convidar usuário" onClose={() => setOpen(false)}>
          <Form
            className="modal-body"
            onSubmit={() =>
              void action.run(async () => {
                const r = await api('/users', send('POST', { name, email, role }));
                setOpen(false);
                setLink({
                  title: 'Link de convite',
                  url: r.invitationUrl,
                  expiresAt: r.invitationExpiresAt,
                });
                await reload();
              })
            }
          >
            <Field label="Nome">
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="E-mail">
              <input
                required
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Perfil">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {['TEAM', 'COMMERCIAL', 'ADMIN'].map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
              </select>
            </Field>
            <p className="fine-print">
              O usuário ficará pendente até definir a própria senha pelo link de convite.
            </p>
            <Feedback action={action} />
            <Button busy={action.busy} className="primary">
              Criar convite
            </Button>
          </Form>
        </Modal>
      )}
      {link && <AccessLinkModal link={link} onClose={() => setLink(null)} />}
    </section>
  );
}

function Sessions() {
  const { data, error, loading, reload } = useData<Row[]>('/auth/sessions');
  const action = useAction();
  return (
    <section className="panel account-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <MonitorSmartphone size={20} /> Sessões ativas
          </h2>
          <p className="muted">Revogue acessos antigos sem alterar sua senha.</p>
        </div>
        <Button
          className="small"
          busy={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api('/auth/sessions/revoke-others', send('POST', {}));
              await reload();
            }, 'Outras sessões encerradas.')
          }
        >
          Encerrar outras
        </Button>
      </div>
      <Feedback action={action} />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data?.map((s) => (
          <div className="user-row" key={s.id}>
            <span className="client-avatar">
              <MonitorSmartphone size={16} />
            </span>
            <div>
              <strong>{s.current ? 'Esta sessão' : 'Sessão ativa'}</strong>
              <small>
                {s.ip_address || 'IP não informado'} · último uso {new Date(s.last_seen_at).toLocaleString('pt-BR')}
              </small>
              <small>{s.user_agent || 'Navegador não identificado'}</small>
            </div>
            {s.current ? (
              <span className="tag green">Atual</span>
            ) : (
              <Button
                className="small"
                busy={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api(`/auth/sessions/${s.id}`, { method: 'DELETE' });
                    await reload();
                  }, 'Sessão encerrada.')
                }
              >
                Encerrar
              </Button>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function Audit() {
  const [before, setBefore] = useState<string | null>(null);
  const { data, error, loading } = useData<Row[]>(`/audit${before ? `?before=${before}` : ''}`);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REGISTRO IMUTÁVEL</span>
          <h2>
            <History size={19} /> Auditoria
          </h2>
        </div>
        {before && <button onClick={() => setBefore(null)}>Mais recentes</button>}
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="audit-list">
          {data?.map((a) => (
            <details key={a.id}>
              <summary>
                <span>
                  <b>{eventLabel(a.action)}</b>
                  <small>
                    {a.actor_name ?? 'Sistema'} · {new Date(a.created_at).toLocaleString('pt-BR')}
                  </small>
                </span>
                <span className="muted">#{a.id}</span>
              </summary>
              <pre>
                {JSON.stringify(
                  { entidade: a.entity_type, registro: a.entity_id, detalhes: a.details },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
        </div>
      )}
      {data?.length === 100 && (
        <button className="full" onClick={() => setBefore(String(data.at(-1)!.id))}>
          Eventos anteriores
        </button>
      )}
    </section>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('ACCOUNT'),
    [currentPassword, setCurrent] = useState(''),
    [newPassword, setNew] = useState('');
  const action = useAction();
  return (
    <>
      <Header
        eyebrow="BASES DO ATELIÊ"
        title="Configurações"
        subtitle="Acessos, políticas e um histórico que preserva cada decisão."
      />
      <div className="toolbar">
        <div className="tabs">
          {[
            ['ACCOUNT', 'Minha conta'],
            ...(user!.role === 'ADMIN'
              ? [
                  ['POLICIES', 'Precificação'],
                  ['USERS', 'Equipe'],
                  ['AUDIT', 'Auditoria'],
                ]
              : []),
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key!)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'ACCOUNT' && (
        <>
          <section className="panel account-panel">
            <h2>
              <KeyRound size={20} /> Alterar senha
            </h2>
            <p className="muted">
              {user!.name} · {user!.email}
            </p>
            <Form
              onSubmit={() =>
                void action.run(async () => {
                  await api('/auth/password', send('POST', { currentPassword, newPassword }));
                  setCurrent('');
                  setNew('');
                }, 'Senha alterada. As outras sessões foram encerradas.')
              }
            >
              <Field label="Senha atual">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
              <Field label="Nova senha" hint="Use pelo menos 12 caracteres.">
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={newPassword}
                  onChange={(e) => setNew(e.target.value)}
                />
              </Field>
              <Feedback action={action} />
              <Button busy={action.busy} className="primary">
                Salvar nova senha
              </Button>
            </Form>
          </section>
          <Sessions />
        </>
      )}
      {tab === 'POLICIES' && <Policies />}
      {tab === 'USERS' && <Users />}
      {tab === 'AUDIT' && <Audit />}
    </>
  );
}
''')

# Interface operacional não revela valores para TEAM e não oferece controles que a API bloqueia.
replace(
    'frontend/src/pages/Operations.tsx',
    "export function Orders() {\n  const { data, error, loading } = useData<Row[]>('/orders');\n  const [filter, setFilter] = useState('ACTIVE');",
    "export function Orders() {\n  const { data, error, loading } = useData<Row[]>('/orders');\n  const { user } = useAuth();\n  const commercial = user!.role !== 'TEAM';\n  const [filter, setFilter] = useState('ACTIVE');",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "                    <th>Previsão</th>\n                    <th>Total / recebido</th>\n                    <th />",
    "                    <th>Previsão</th>\n                    {commercial && <th>Total / recebido</th>}\n                    <th />",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "                      <td className=\"money\">\n                        {money(o.total_cents)}\n                        <small>{money(o.received_cents)} recebido</small>\n                      </td>",
    "                      {commercial && (\n                        <td className=\"money\">\n                          {money(o.total_cents)}\n                          <small>{money(o.received_cents)} recebido</small>\n                        </td>\n                      )}",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "  const complete = o.steps.filter((s: Row) => ['COMPLETED', 'CANCELLED'].includes(s.status)).length;",
    "  const complete = o.steps.filter((s: Row) => ['COMPLETED', 'CANCELLED'].includes(s.status)).length;\n  const actualHours = o.steps.reduce((sum: number, s: Row) => sum + Number(s.actual_hours || 0), 0);",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "      <div className=\"metrics\">\n        <Metric\n          label=\"Total do pedido\"\n          value={money(o.total_cents)}\n          detail=\"Peças e frete separados na proposta\"\n        />\n        <Metric\n          label=\"Recebido líquido\"\n          value={money(o.received_cents)}\n          detail={`Entrada prevista: ${money(o.deposit_cents)}`}\n        />\n        <Metric\n          label=\"Saldo pendente\"\n          value={money(o.pending_cents)}\n          detail=\"Quitação antes da entrega\"\n          accent\n        />\n        <Metric\n          label=\"Etapas concluídas\"\n          value={`${complete} / ${o.steps.length}`}\n          detail=\"Inclui etapas canceladas com justificativa\"\n        />\n      </div>",
    "      <div className=\"metrics\">\n        {commercial ? (\n          <>\n            <Metric\n              label=\"Total do pedido\"\n              value={money(o.total_cents)}\n              detail=\"Peças e frete separados na proposta\"\n            />\n            <Metric\n              label=\"Recebido líquido\"\n              value={money(o.received_cents)}\n              detail={`Entrada prevista: ${money(o.deposit_cents)}`}\n            />\n            <Metric\n              label=\"Saldo pendente\"\n              value={money(o.pending_cents)}\n              detail=\"Quitação antes da entrega\"\n              accent\n            />\n          </>\n        ) : (\n          <>\n            <Metric label=\"Previsão\" value={date(o.due_date)} detail=\"Prazo operacional\" />\n            <Metric label=\"Horas registradas\" value={`${actualHours} h`} detail=\"Tempo real da equipe\" />\n          </>\n        )}\n        <Metric\n          label=\"Etapas concluídas\"\n          value={`${complete} / ${o.steps.length}`}\n          detail=\"Inclui etapas canceladas com justificativa\"\n        />\n      </div>",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "            {o.status === 'WAITING_PAYMENT'\n              ? `Aguardando ${money(o.deposit_pending_cents)} de entrada para confirmar o pedido.`\n              : o.status === 'DELIVERED'\n                ? `Entrega registrada em ${date(o.delivered_at)}.`\n                : o.commercial_snapshot.paymentTerms}",
    "            {o.status === 'WAITING_PAYMENT'\n              ? commercial\n                ? `Aguardando ${money(o.deposit_pending_cents)} de entrada para confirmar o pedido.`\n                : 'Aguardando a confirmação da entrada pelo Comercial.'\n              : o.status === 'DELIVERED'\n                ? `Entrega registrada em ${date(o.delivered_at)}.`\n                : commercial\n                  ? o.commercial_snapshot.paymentTerms\n                  : 'Acompanhe e registre o avanço das etapas de produção.'}",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "            <span className=\"count\">{money(item.snapshot.total_cents)}</span>",
    "            {commercial && <span className=\"count\">{money(item.snapshot.total_cents)}</span>}",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "export function Production() {\n  const { data, error, loading, reload } = useData<Row[]>('/production');",
    "export function Production() {\n  const { data, error, loading, reload } = useData<Row[]>('/production');\n  const { user } = useAuth();\n  const canEdit = user!.role === 'ADMIN' || user!.role === 'TEAM';",
)
replace(
    'frontend/src/pages/Operations.tsx',
    "                {!['COMPLETED', 'CANCELLED'].includes(s.status) && (\n                  <button className=\"small\" onClick={() => setStep(s)}>",
    "                {canEdit && !['COMPLETED', 'CANCELLED'].includes(s.status) && (\n                  <button className=\"small\" onClick={() => setStep(s)}>",
)

replace(
    'frontend/src/pages/Dashboard.tsx',
    "  USER_CREATED: 'Usuário criado',",
    "  USER_CREATED: 'Usuário criado',\n  USER_INVITED: 'Usuário convidado',\n  USER_ACTIVATED: 'Conta ativada',\n  USER_SUSPENDED: 'Usuário suspenso',\n  USER_REACTIVATED: 'Usuário reativado',\n  PASSWORD_RESET: 'Senha recuperada',\n  PASSWORD_RESET_ISSUED: 'Recuperação de acesso emitida',\n  SESSION_REVOKED: 'Sessão encerrada',\n  SESSIONS_REVOKED: 'Sessões encerradas',",
)

write('backend/test/auth-rbac.test.ts', r'''import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createEmbedded, migrate } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';
import { createAdmin } from '../src/modules/auth.js';
import type { Config } from '../src/config/env.js';

const config = (): Config => ({
  NODE_ENV: 'test',
  PORT: 3000,
  HOST: '127.0.0.1',
  APP_ORIGIN: 'http://localhost:8080',
  RENDER: 'false',
  RENDER_EXTERNAL_URL: '',
  COOKIE_SECURE: 'false',
  TRUST_PROXY_CIDRS: '',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  DB_MODE: 'embedded',
  EMBEDDED_PATH: ':memory:',
  PGHOST: '',
  PGPORT: 5432,
  PGDATABASE: 'relic_auth_test',
  PGUSER: 'relic_runtime',
  PGPASSWORD: '',
  DATABASE_URL: '',
  MANAGED_DATABASE_SINGLE_USER: 'false',
  ADMIN_DATABASE_USER: 'relic_app',
  ADMIN_DATABASE_PASSWORD: '',
});

test('convite, recuperação, sessões e RBAC preservam o isolamento financeiro', { timeout: 120000 }, async () => {
  const c = config();
  const db = await createEmbedded();
  await migrate(db);
  const adminPassword = randomBytes(24).toString('hex');
  await createAdmin(db, 'Administrador RBAC', 'admin-rbac@example.test', adminPassword);
  await db.exec('SET ROLE relic_runtime');
  const app = await buildApp(db, c);
  await app.ready();

  const login = async (email: string, password: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: c.APP_ORIGIN, 'user-agent': 'Relic Test' },
      payload: { email, password },
    });
    return response;
  };
  const headers = (response: Awaited<ReturnType<typeof login>>) => ({
    origin: c.APP_ORIGIN,
    cookie: String(response.headers['set-cookie']).split(';')[0]!,
    'x-csrf-token': response.json().csrfToken as string,
  });

  try {
    const adminLogin = await login('admin-rbac@example.test', adminPassword);
    assert.equal(adminLogin.statusCode, 200, adminLogin.body);
    const adminHeaders = headers(adminLogin);

    const invited = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: adminHeaders,
      payload: { name: 'Pessoa Produção', email: 'team@example.test', role: 'TEAM' },
    });
    assert.equal(invited.statusCode, 201, invited.body);
    const invitedBody = invited.json();
    assert.equal(invitedBody.status, 'PENDING');
    const inviteToken = new URL(invitedBody.invitationUrl).searchParams.get('token');
    assert(inviteToken);

    const pendingLogin = await login('team@example.test', 'senha-inexistente-comprida');
    assert.equal(pendingLogin.statusCode, 401);

    const teamPassword = randomBytes(24).toString('hex');
    const activation = await app.inject({
      method: 'POST',
      url: '/api/auth/activate',
      headers: { origin: c.APP_ORIGIN },
      payload: { token: inviteToken, password: teamPassword },
    });
    assert.equal(activation.statusCode, 200, activation.body);
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/activate',
      headers: { origin: c.APP_ORIGIN },
      payload: { token: inviteToken, password: teamPassword },
    });
    assert.equal(replay.statusCode, 422);

    const teamLogin = await login('team@example.test', teamPassword);
    assert.equal(teamLogin.statusCode, 200, teamLogin.body);
    const teamHeaders = headers(teamLogin);
    const sessions = await app.inject({ method: 'GET', url: '/api/auth/sessions', headers: teamHeaders });
    assert.equal(sessions.statusCode, 200, sessions.body);
    assert.equal(sessions.json().filter((s: any) => s.current).length, 1);

    const deniedUsers = await app.inject({ method: 'GET', url: '/api/users', headers: teamHeaders });
    assert.equal(deniedUsers.statusCode, 403);
    const deniedPricing = await app.inject({
      method: 'POST',
      url: '/api/pricing/calculate',
      headers: teamHeaders,
      payload: { input: {} },
    });
    assert.equal(deniedPricing.statusCode, 403);

    const [admin] = await db.query("SELECT id FROM relic.users WHERE email='admin-rbac@example.test'");
    const client = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: adminHeaders,
      payload: { name: 'Cliente Privado', email: 'cliente@example.test' },
    });
    assert.equal(client.statusCode, 201, client.body);
    const [policy] = await db.query('SELECT id,settings FROM relic.pricing_settings WHERE active');
    const input = {
      resinGrams: 100,
      resinPriceKg: 180,
      printHours: 2,
      machineHourlyCost: 2,
      finishingHours: 1,
      paintingHours: 1,
      packaging: 10,
    };
    const quote = await app.inject({
      method: 'POST',
      url: '/api/quotes',
      headers: adminHeaders,
      payload: {
        clientId: client.json().id,
        policyId: policy!.id,
        items: [{ description: 'Peça confidencial', quantity: 1, input }],
        shippingCents: 0,
        leadDays: 14,
        notes: '',
      },
    });
    assert.equal(quote.statusCode, 201, quote.body);
    const approved = await app.inject({
      method: 'PATCH',
      url: `/api/quotes/${quote.json().id}/status`,
      headers: adminHeaders,
      payload: { status: 'APPROVED', version: quote.json().version },
    });
    assert.equal(approved.statusCode, 200, approved.body);
    const order = await app.inject({
      method: 'POST',
      url: `/api/quotes/${quote.json().id}/order`,
      headers: adminHeaders,
      payload: {},
    });
    assert.equal(order.statusCode, 201, order.body);

    const teamOrder = await app.inject({
      method: 'GET',
      url: `/api/orders/${order.json().id}`,
      headers: teamHeaders,
    });
    assert.equal(teamOrder.statusCode, 200, teamOrder.body);
    const operational = teamOrder.json();
    assert.equal('total_cents' in operational, false);
    assert.equal('cost_cents' in operational, false);
    assert.equal('profit_cents' in operational, false);
    assert.equal(operational.client_snapshot.name, 'Cliente Privado');
    assert.equal('email' in operational.client_snapshot, false);
    assert.equal('calculation' in operational.items[0].snapshot, false);
    assert.equal(operational.items[0].snapshot.description, 'Peça confidencial');
    assert.deepEqual(operational.payments, []);

    const reset = await app.inject({
      method: 'POST',
      url: `/api/users/${invitedBody.id}/password-reset`,
      headers: adminHeaders,
      payload: {},
    });
    assert.equal(reset.statusCode, 200, reset.body);
    const resetToken = new URL(reset.json().resetUrl).searchParams.get('token');
    assert(resetToken);
    const newPassword = randomBytes(24).toString('hex');
    const resetDone = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset',
      headers: { origin: c.APP_ORIGIN },
      payload: { token: resetToken, password: newPassword },
    });
    assert.equal(resetDone.statusCode, 200, resetDone.body);

    const oldSession = await app.inject({ method: 'GET', url: '/api/auth/me', headers: teamHeaders });
    assert.equal(oldSession.statusCode, 401);
    assert.equal((await login('team@example.test', teamPassword)).statusCode, 401);
    assert.equal((await login('team@example.test', newPassword)).statusCode, 200);

    const selfSuspend = await app.inject({
      method: 'PATCH',
      url: `/api/users/${admin!.id}`,
      headers: adminHeaders,
      payload: { role: 'ADMIN', status: 'SUSPENDED' },
    });
    assert.equal(selfSuspend.statusCode, 403);
  } finally {
    await app.close();
    await db.close();
  }
});
''')

# Atualiza documentação da etapa sem alterar a versão comercial ainda.
replace(
    'README.md',
    "## Segurança já presente\n\nA aplicação utiliza sessão em cookie `HttpOnly`, `Secure` em HTTPS e `SameSite=Strict`, proteção CSRF/origin, rate limit, Helmet, senhas derivadas com `scrypt`, auditoria de ações críticas e validações de integridade no banco.\n\n## Próxima evolução\n\nA próxima fase funcional será tratada separadamente: autenticação/usuários e matriz de permissões. Mudanças de regra de negócio não fazem parte desta etapa de infraestrutura.\n",
    "## Segurança e acesso\n\nA aplicação utiliza sessão em cookie `HttpOnly`, `Secure` em HTTPS e `SameSite=Strict`, proteção CSRF/origin, rate limit, Helmet, senhas derivadas com `scrypt`, auditoria de ações críticas e validações de integridade no banco.\n\nContas de equipe são criadas por convite: o administrador gera um link de ativação de uso único, e o próprio usuário define a senha. Links de recuperação também são de uso único, têm validade curta e revogam as sessões anteriores após a troca. Tokens brutos nunca são armazenados no banco.\n\nPerfis permanentes: `ADMIN`, `COMMERCIAL` e `TEAM`. O backend aplica RBAC; `TEAM` recebe somente os dados operacionais dos pedidos e da produção, sem preço, custo, margem, lucro ou pagamentos.\n\nEm **Minha conta**, cada usuário pode revisar as sessões ativas e revogar acessos antigos.\n\nA entrega automática de convites por e-mail não faz parte da infraestrutura atual: o link é exibido uma única vez ao administrador para compartilhamento por canal seguro.\n\n## Próxima evolução\n\nA próxima fase funcional será o cadastro de impressoras, tecnologias, materiais e a estrutura de jobs de fabricação que sustentará a calculadora MSLA/FDM.\n",
)

print('Stage 6 source changes prepared.')
