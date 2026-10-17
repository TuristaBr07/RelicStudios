import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createEmbedded, migrate } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';
import { createAdmin, hashPassword } from '../src/modules/auth.js';
import type { Config } from '../src/config/env.js';

test(
  'regras financeiras e encerramento operacional preservam os snapshots',
  { timeout: 120000 },
  async (t) => {
    const db = await createEmbedded();
    await migrate(db);
    const password = randomBytes(24).toString('hex');
    await createAdmin(db, 'Administrador Teste', 'workflow@example.test', password);
    const hash = await hashPassword(password);
    for (const role of ['TEAM', 'COMMERCIAL']) {
      await db.query(
        "INSERT INTO relic.users(name,email,password_hash,role,status,active) VALUES($1,$2,$3,$4,'ACTIVE',true)",
        [role, `${role.toLowerCase()}@example.test`, hash, role],
      );
    }
    await db.exec('SET ROLE relic_runtime');
    const config: Config = {
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
      PGDATABASE: 'workflow_test',
      PGUSER: 'relic_runtime',
      PGPASSWORD: '',
      DATABASE_URL: '',
      MANAGED_DATABASE_SINGLE_USER: 'false',
      ADMIN_DATABASE_USER: 'relic_app',
      ADMIN_DATABASE_PASSWORD: '',
    };
    const app = await buildApp(db, config);
    await app.ready();
    const login = async (email: string) => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: config.APP_ORIGIN },
        payload: { email, password },
      });
      assert.equal(r.statusCode, 200, r.body);
      return {
        origin: config.APP_ORIGIN,
        cookie: String(r.headers['set-cookie']).split(';')[0]!,
        'x-csrf-token': r.json().csrfToken as string,
      };
    };
    try {
      const admin = await login('workflow@example.test');
      const team = await login('team@example.test');
      const commercial = await login('commercial@example.test');
      const call = async (
        method: string,
        url: string,
        payload?: unknown,
        expected = 200,
        headers = admin,
      ) => {
        const r = await app.inject({
          method: method as any,
          url,
          headers,
          ...(payload === undefined ? {} : { payload }),
        });
        assert.equal(r.statusCode, expected, `${method} ${url}: ${r.body}`);
        return r.json();
      };
      const client = await call(
        'POST',
        '/api/clients',
        {
          name: 'Cliente Teste',
          email: 'private@example.test',
          phone: '123456',
          document: 'documento-teste',
          address: 'Endereço de teste',
        },
        201,
      );
      const policy = (await call('GET', '/api/policies'))[0];
      const printer = (await call('GET', '/api/manufacturing/printers')).find(
        (p: any) => p.technology_code === 'MSLA',
      );
      const material = await call(
        'POST',
        '/api/manufacturing/materials',
        {
          technologyCode: 'MSLA',
          name: 'Resina Teste',
          packageQuantity: 1000,
          packagePriceCents: 10000,
        },
        201,
      );
      const makeOrder = async (quantity = 1) => {
        const q = await call(
          'POST',
          '/api/quotes',
          {
            clientId: client.id,
            policyId: policy.id,
            shippingCents: 1234,
            items: [
              {
                description: 'Peça Teste',
                quantity,
                input: {
                  manufacturingJobs: [
                    {
                      printerId: printer.id,
                      materialId: material.id,
                      materialAmount: 100,
                      printHours: 1,
                      outputQuantity: 1,
                    },
                  ],
                  modelingHours: 1,
                  feePercent: 3,
                  taxPercent: 6,
                },
              },
            ],
          },
          201,
        );
        await call('PATCH', `/api/quotes/${q.id}/status`, {
          status: 'APPROVED',
          version: q.version,
        });
        return call('POST', `/api/quotes/${q.id}/order`, {}, 201);
      };
      const detail = (id: string) => call('GET', `/api/orders/${id}`);
      const status = async (id: string, next: string, expected = 200) => {
        const o = await detail(id);
        return call(
          'PATCH',
          `/api/orders/${id}/status`,
          { version: o.version, status: next, reason: 'Cancelamento de teste' },
          expected,
        );
      };
      const pay = (id: string, amount: number, kind = 'DEPOSIT', expected = 201) =>
        call(
          'POST',
          '/api/payments',
          {
            orderId: id,
            amountCents: amount,
            kind,
            method: 'PIX',
            idempotencyKey: randomUUID(),
            notes: 'Operação de teste',
          },
          expected,
        );
      const jobStatus = (job: any, next: string, expected = 200) =>
        call(
          'PATCH',
          `/api/manufacturing/jobs/${job.id}`,
          {
            version: job.version,
            status: next,
            actualMaterialAmount:
              job.actual_material_amount == null ? null : Number(job.actual_material_amount),
            actualMinutes: job.actual_minutes,
            notes: 'Apontamento de teste',
          },
          expected,
        );

      await t.test(
        'lucro realizado desconta taxas e impostos aprovados, sem incluir frete',
        async () => {
          const o = await makeOrder(2);
          const d = await detail(o.id);
          const c = d.items[0].snapshot.calculation;
          assert(c.batchFeeCents > 0 && c.batchTaxCents > 0);
          assert.equal(
            d.cost_report.actualProfitCents,
            d.commercial_snapshot.subtotalCents -
              d.cost_report.actualCostCents -
              c.batchFeeCents -
              c.batchTaxCents,
          );
          assert.equal(d.cost_report.quotedFeeCents, c.batchFeeCents);
          assert.equal(d.cost_report.quotedTaxCents, c.batchTaxCents);
        },
      );

      await t.test('pedido não fica pronto enquanto houver job aberto', async () => {
        const o = await makeOrder();
        await pay(o.id, o.deposit_cents);
        await status(o.id, 'IN_PRODUCTION');
        // Fixture isolates the job gate: all manual stages are already complete.
        await db.query(
          "UPDATE relic.production_steps SET status='COMPLETED',started_at=now(),completed_at=now() WHERE order_id=$1",
          [o.id],
        );
        const blocked = await status(o.id, 'READY', 422);
        assert.match(blocked.error, /jobs|fabricação/i);
        let job = (await detail(o.id)).manufacturing_jobs[0];
        job = await jobStatus(job, 'READY');
        job = await jobStatus(job, 'RUNNING');
        await jobStatus({ ...job, actual_material_amount: 100, actual_minutes: 60 }, 'COMPLETED');
        await status(o.id, 'READY');
      });

      await t.test(
        'nova tentativa preserva falha, custo e preço vendido sem duplicar jobs',
        async () => {
          const o = await makeOrder();
          await pay(o.id, o.deposit_cents);
          await status(o.id, 'IN_PRODUCTION');
          let d = await detail(o.id);
          const snapshot = d.items[0].snapshot;
          let job = await jobStatus(d.manufacturing_jobs[0], 'READY');
          job = await jobStatus(job, 'RUNNING');
          job = await jobStatus(
            { ...job, actual_material_amount: 20, actual_minutes: 15 },
            'FAILED',
          );
          await db.query(
            "UPDATE relic.production_steps SET status='COMPLETED',started_at=now(),completed_at=now() WHERE order_id=$1",
            [o.id],
          );
          await status(o.id, 'READY', 422);
          await call('POST', `/api/manufacturing/jobs/${job.id}/retry`, {}, 403, commercial);
          const retry = await call(
            'POST',
            `/api/manufacturing/jobs/${job.id}/retry`,
            {},
            201,
            team,
          );
          const repeated = await call(
            'POST',
            `/api/manufacturing/jobs/${job.id}/retry`,
            {},
            200,
            team,
          );
          assert.equal(retry.id, repeated.id);
          await status(o.id, 'READY', 422);
          d = await detail(o.id);
          assert.equal(d.manufacturing_jobs.length, 2);
          let next = d.manufacturing_jobs.find((j: any) => j.id === retry.id);
          assert.equal(next.retry_of, job.id);
          assert.equal(next.actual_material_amount, null);
          assert.equal(next.snapshot, undefined);
          next = await jobStatus(next, 'READY');
          next = await jobStatus(next, 'RUNNING');
          await jobStatus(
            { ...next, actual_material_amount: 100, actual_minutes: 60 },
            'COMPLETED',
          );
          d = await detail(o.id);
          assert.equal(d.manufacturing_jobs[0].status, 'FAILED');
          assert.equal(d.cost_report.items[0].manufacturingActualCents, 1200);
          assert.deepEqual(d.items[0].snapshot, snapshot);
          assert.equal(d.total_cents, o.total_cents);
          assert.equal(d.cost_cents, o.cost_cents);
          await status(o.id, 'READY');
          await status(o.id, 'DELIVERED', 422);
          await pay(o.id, o.total_cents - o.deposit_cents, 'BALANCE');
          await status(o.id, 'DELIVERED');
        },
      );

      await t.test('cancelar job planejado não inventa início nem viola integridade', async () => {
        const o = await makeOrder();
        const job = (await detail(o.id)).manufacturing_jobs[0];
        const cancelled = await jobStatus(job, 'CANCELLED');
        assert.equal(cancelled.status, 'CANCELLED');
        assert.equal(cancelled.started_at, null);
        await jobStatus(cancelled, 'READY', 422);
      });

      await t.test(
        'cancelamento do pedido encerra jobs pendentes e preserva os já encerrados',
        async () => {
          const o = await makeOrder(3);
          await pay(o.id, o.deposit_cents);
          await status(o.id, 'IN_PRODUCTION');
          const jobs = (await detail(o.id)).manufacturing_jobs;
          let job = await jobStatus(jobs[0], 'READY');
          job = await jobStatus(job, 'RUNNING');
          await jobStatus({ ...job, actual_material_amount: 100, actual_minutes: 60 }, 'COMPLETED');
          await jobStatus(jobs[1], 'READY');
          await pay(o.id, o.deposit_cents, 'REFUND');
          await status(o.id, 'CANCELLED');
          const d = await detail(o.id);
          assert.deepEqual(
            d.manufacturing_jobs.map((j: any) => j.status),
            ['COMPLETED', 'CANCELLED', 'CANCELLED'],
          );
          assert.equal(Number(d.manufacturing_jobs[0].actual_material_amount), 100);
          assert.equal(d.manufacturing_jobs[2].started_at, null);
          assert(d.steps.every((s: any) => s.status === 'CANCELLED'));
        },
      );

      await t.test(
        'cancelamento exige encerrar job em execução com seus custos reais',
        async () => {
          const o = await makeOrder();
          await pay(o.id, o.deposit_cents);
          await status(o.id, 'IN_PRODUCTION');
          let job = (await detail(o.id)).manufacturing_jobs[0];
          job = await jobStatus(job, 'READY');
          job = await jobStatus(job, 'RUNNING');
          await pay(o.id, o.deposit_cents, 'REFUND');
          await status(o.id, 'CANCELLED', 422);
          await jobStatus(job, 'CANCELLED', 422);
          await jobStatus({ ...job, actual_material_amount: 20, actual_minutes: 15 }, 'CANCELLED');
          await status(o.id, 'CANCELLED');
          assert((await detail(o.id)).cost_report.actualCostCents > 0);
        },
      );

      await t.test('reordenar produção não reabre etapa cancelada', async () => {
        const o = await makeOrder();
        let d = await detail(o.id);
        const stepPayload = (s: any) => ({
          version: s.version,
          status: s.status,
          assignedTo: null,
          estimatedHours: Number(s.estimated_hours),
          actualHours: 0,
          notes: 'Etapa dispensada',
        });
        await call('PATCH', `/api/production/${d.steps[0].id}`, {
          ...stepPayload(d.steps[0]),
          status: 'CANCELLED',
        });
        d = await detail(o.id);
        await call(
          'PATCH',
          `/api/production/${d.steps[1].id}`,
          { ...stepPayload(d.steps[1]), position: 3 },
          422,
        );
        assert.equal((await detail(o.id)).steps[0].status, 'CANCELLED');
      });

      await t.test('equipe recebe só nome do cliente no painel e não acessa finanças', async () => {
        const d = await call('GET', '/api/dashboard', undefined, 200, team);
        assert(d.due.length > 0);
        for (const row of d.due) assert.deepEqual(row.client_snapshot, { name: 'Cliente Teste' });
        for (const key of [
          'revenueCents',
          'costCents',
          'profitCents',
          'receivedCents',
          'pendingCents',
        ])
          assert.equal(d[key], null);
        for (const path of [
          '/api/payments',
          '/api/quotes',
          '/api/policies',
          '/api/audit',
          '/api/clients',
        ])
          await call('GET', path, undefined, 403, team);
      });

      await t.test(
        'pagamentos repetidos, excessivos e estornos respeitam saldo e perfil',
        async () => {
          const o = await makeOrder();
          await status(o.id, 'IN_PRODUCTION', 422);
          const payload = {
            orderId: o.id,
            kind: 'DEPOSIT',
            method: 'PIX',
            amountCents: o.deposit_cents,
            idempotencyKey: randomUUID(),
          };
          const first = await call('POST', '/api/payments', payload, 201, commercial);
          const replay = await call('POST', '/api/payments', payload, 200, commercial);
          assert.equal(first.id, replay.id);
          assert.equal((await detail(o.id)).received_cents, o.deposit_cents);
          await call(
            'POST',
            '/api/payments',
            { ...payload, amountCents: payload.amountCents + 1 },
            409,
            commercial,
          );
          await pay(o.id, o.total_cents, 'BALANCE', 422);
          await call(
            'POST',
            '/api/payments',
            { ...payload, idempotencyKey: randomUUID(), kind: 'REFUND', notes: 'Estorno de teste' },
            403,
            commercial,
          );
          await pay(o.id, o.deposit_cents + 1, 'REFUND', 422);
          await pay(o.id, o.deposit_cents, 'REFUND');
          assert.equal((await detail(o.id)).status, 'WAITING_PAYMENT');
        },
      );
    } finally {
      await app.close();
      await db.close();
    }
  },
);
