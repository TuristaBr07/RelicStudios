import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createEmbedded, migrate } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';
import { createAdmin, hashPassword } from '../src/modules/auth.js';
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
  PGDATABASE: 'relic_manufacturing_test',
  PGUSER: 'relic_runtime',
  PGPASSWORD: '',
  DATABASE_URL: '',
  MANAGED_DATABASE_SINGLE_USER: 'false',
  ADMIN_DATABASE_USER: 'relic_app',
  ADMIN_DATABASE_PASSWORD: '',
});

test(
  'catálogo de fabricação separa tecnologia, equipamento, material e custos por perfil',
  { timeout: 120000 },
  async () => {
    const c = config();
    const db = await createEmbedded();
    await migrate(db);
    const adminPassword = randomBytes(24).toString('hex');
    const teamPassword = randomBytes(24).toString('hex');
    await createAdmin(db, 'Administrador Fabricação', 'admin-fab@example.test', adminPassword);
    const teamHash = await hashPassword(teamPassword);
    await db.query(
      `INSERT INTO relic.users(
        name,email,password_hash,role,status,active,activated_at,password_changed_at
      ) VALUES($1,$2,$3,'TEAM','ACTIVE',true,now(),now())`,
      ['Pessoa Produção', 'team-fab@example.test', teamHash],
    );
    await db.exec('SET ROLE relic_runtime');
    const app = await buildApp(db, c);
    await app.ready();

    const login = async (email: string, password: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: c.APP_ORIGIN },
        payload: { email, password },
      });
      assert.equal(response.statusCode, 200, response.body);
      return {
        origin: c.APP_ORIGIN,
        cookie: String(response.headers['set-cookie']).split(';')[0]!,
        'x-csrf-token': response.json().csrfToken as string,
      };
    };

    try {
      const admin = await login('admin-fab@example.test', adminPassword);
      const team = await login('team-fab@example.test', teamPassword);

      const technologies = await app.inject({
        method: 'GET',
        url: '/api/manufacturing/technologies',
        headers: admin,
      });
      assert.equal(technologies.statusCode, 200, technologies.body);
      const tech = technologies.json();
      assert.equal(tech.find((t: any) => t.code === 'MSLA').print_time_model, 'BATCH_LAYER');
      assert.equal(tech.find((t: any) => t.code === 'MSLA').material_unit, 'ML');
      assert.equal(tech.find((t: any) => t.code === 'FDM').print_time_model, 'ADDITIVE');
      assert.equal(tech.find((t: any) => t.code === 'FDM').material_unit, 'G');

      const printers = await app.inject({
        method: 'GET',
        url: '/api/manufacturing/printers?includeInactive=true',
        headers: admin,
      });
      assert.equal(printers.statusCode, 200, printers.body);
      const printerRows = printers.json();
      const saturn = printerRows.find((p: any) => p.name === 'Saturn 4 12K');
      const ender = printerRows.find((p: any) => p.name === 'Ender-3 V3 SE');
      assert.equal(Number(saturn.rated_power_watts), 144);
      assert.equal(Number(saturn.build_x_mm), 218.88);
      assert.equal(Number(ender.rated_power_watts), 350);
      assert.equal(Number(ender.build_z_mm), 250);
      assert.equal(saturn.estimated_average_power_watts, null);

      const material = await app.inject({
        method: 'POST',
        url: '/api/manufacturing/materials',
        headers: admin,
        payload: {
          technologyCode: 'MSLA',
          name: 'Resina teste',
          manufacturer: 'Fornecedor teste',
          variant: 'Cinza',
          packageQuantity: 1000,
          packagePriceCents: 15000,
          wastePercent: 5,
          supplier: 'Loja teste',
          notes: '',
        },
      });
      assert.equal(material.statusCode, 201, material.body);
      assert.equal(material.json().unit, 'ML');

      const adminMaterials = await app.inject({
        method: 'GET',
        url: '/api/manufacturing/materials',
        headers: admin,
      });
      assert.equal(adminMaterials.statusCode, 200, adminMaterials.body);
      const adminMaterial = adminMaterials.json()[0];
      assert.equal(Number(adminMaterial.unit_cost_cents), 15);
      assert.equal(adminMaterial.package_price_cents, 15000);

      const teamMaterials = await app.inject({
        method: 'GET',
        url: '/api/manufacturing/materials',
        headers: team,
      });
      assert.equal(teamMaterials.statusCode, 200, teamMaterials.body);
      assert.equal('package_price_cents' in teamMaterials.json()[0], false);
      assert.equal('unit_cost_cents' in teamMaterials.json()[0], false);

      const teamPrinters = await app.inject({
        method: 'GET',
        url: '/api/manufacturing/printers',
        headers: team,
      });
      assert.equal(teamPrinters.statusCode, 200, teamPrinters.body);
      assert.equal('machine_hourly_cents' in teamPrinters.json()[0], false);
      assert.equal('purchase_cost_cents' in teamPrinters.json()[0], false);

      const denied = await app.inject({
        method: 'POST',
        url: '/api/manufacturing/printers',
        headers: team,
        payload: {
          technologyCode: 'FDM',
          name: 'Não permitido',
          manufacturer: '',
          model: '',
          ratedPowerWatts: 100,
          estimatedAveragePowerWatts: null,
          buildXmm: 100,
          buildYmm: 100,
          buildZmm: 100,
          purchaseCostCents: 0,
          machineHourlyCents: 0,
          maintenanceReservePercent: 0,
          notes: '',
        },
      });
      assert.equal(denied.statusCode, 403);

      const [jobs] = await db.query(
        `SELECT count(*)::integer AS count
           FROM information_schema.tables
          WHERE table_schema='relic' AND table_name='manufacturing_jobs'`,
      );
      assert.equal(jobs?.count, 1);
    } finally {
      await app.close();
      await db.close();
    }
  },
);
