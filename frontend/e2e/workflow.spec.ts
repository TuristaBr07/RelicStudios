import { test, expect, type Page } from '@playwright/test';

async function api<T = any>(page: Page, method: string, url: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, url, body }) => {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const auth = await me.json();
      if (!me.ok) throw new Error(auth.error ?? 'Falha ao recuperar a sessão de teste.');
      const response = await fetch(`/api${url}`, {
        method,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': auth.csrfToken,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `${method} ${url} falhou.`);
      return data;
    },
    { method, url, body },
  );
}

async function login(page: Page) {
  const password = process.env.RELIC_TEST_PASSWORD;
  if (!password) throw new Error('RELIC_TEST_PASSWORD ausente.');
  await page.goto('/');
  await page.getByLabel('E-mail').fill('qa@example.test');
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: /Entrar no estúdio/i }).click();
  await expect(page.getByRole('heading', { name: /Bom trabalho/i })).toBeVisible();
}

test('fluxo completo do estúdio pela interface', async ({ page }) => {
  await login(page);
  const suffix = Date.now().toString(36);
  const materialName = `Filamento E2E ${suffix}`;
  const clientName = `Cliente E2E ${suffix}`;
  const itemName = `Peça E2E ${suffix}`;

  await page.getByRole('link', { name: /Fabricação/i }).click();
  await expect(page.getByRole('heading', { name: 'Fabricação' })).toBeVisible();
  await page.getByRole('button', { name: /^Material$/i }).click();
  const materialDialog = page.getByRole('dialog', { name: 'Novo material' });
  await materialDialog.getByLabel('Nome *').fill(materialName);
  await materialDialog.getByLabel('Tecnologia').selectOption('FDM');
  await materialDialog.getByLabel(/Quantidade da embalagem/i).fill('1000');
  await materialDialog.getByLabel('Preço da embalagem (R$)').fill('120');
  await materialDialog.getByLabel('Reserva de perda (%)').fill('5');
  await materialDialog.getByLabel('Fornecedor').fill('Fornecedor de validação');
  await materialDialog.getByRole('button', { name: 'Salvar material' }).click();
  await expect(materialDialog).toBeHidden();
  await expect(page.getByText(materialName, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /Clientes/i }).click();
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  await page.getByRole('button', { name: /Novo cliente/i }).click();
  const clientDialog = page.getByRole('dialog', { name: 'Novo cliente' });
  await clientDialog.getByLabel('Nome completo *').fill(clientName);
  await clientDialog.getByLabel('E-mail').fill(`${suffix}@example.test`);
  await clientDialog.getByRole('button', { name: /Salvar cliente/i }).click();
  await expect(clientDialog).toBeHidden();
  await expect(page.getByText(clientName, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /Orçamentos/i }).click();
  await page.getByRole('link', { name: /Novo orçamento/i }).click();
  await expect(page.getByRole('heading', { name: 'Novo orçamento' })).toBeVisible();
  await page.getByLabel('Cliente').selectOption({ label: clientName });
  await page.getByRole('button', { name: /Adicionar peça/i }).click();

  const pricingDialog = page.getByRole('dialog', { name: 'Calcular peça do orçamento' });
  await pricingDialog.getByLabel('Nome da peça *').fill(itemName);
  await pricingDialog.getByRole('button', { name: /Adicionar job/i }).click();
  await pricingDialog.getByLabel(/Material do slicer por job/i).fill('120');
  await pricingDialog.getByLabel('Tempo do slicer por job (h)').fill('2');
  await pricingDialog.getByLabel('Consumíveis (R$)').fill('8');
  await pricingDialog.getByLabel('Embalagem (R$)').fill('10');
  await pricingDialog.getByRole('button', { name: /Calcular preço/i }).click();
  await expect(pricingDialog.getByText('Preço final por unidade')).toBeVisible();
  await pricingDialog.getByRole('button', { name: /Usar este cálculo/i }).click();
  await expect(pricingDialog).toBeHidden();
  await page.getByRole('button', { name: /Salvar orçamento/i }).click();

  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]+$/i);
  const quoteId = page.url().split('/').at(-1)!;
  const quoteCode = (await page.getByRole('heading', { name: /^ORC-/ }).textContent())!;
  expect(quoteCode).toMatch(/^ORC-\d{4}-\d{4}$/);
  const pdf = await page.evaluate(async (id) => {
    const response = await fetch(`/api/quotes/${id}/pdf`, { credentials: 'same-origin' });
    return {
      status: response.status,
      type: response.headers.get('content-type') ?? '',
      size: (await response.arrayBuffer()).byteLength,
    };
  }, quoteId);
  expect(pdf.status).toBe(200);
  expect(pdf.type).toContain('application/pdf');
  expect(pdf.size).toBeGreaterThan(1000);

  await page.getByRole('button', { name: /Registrar aprovação/i }).click();
  await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Gerar pedido/i }).click();

  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/i);
  const orderId = page.url().split('/').at(-1)!;
  const orderCode = (await page.getByRole('heading', { name: /^PED-/ }).textContent())!;
  expect(orderCode).toMatch(/^PED-\d{4}-\d{4}$/);
  await expect(page.getByText('Aguardando entrada', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Registrar pagamento/i }).first().click();
  let paymentDialog = page.getByRole('dialog', { name: 'Registrar pagamento' });
  await expect(paymentDialog.getByLabel('Tipo')).toHaveValue('DEPOSIT');
  expect(Number(await paymentDialog.getByLabel('Valor (R$)').inputValue())).toBeGreaterThan(0);
  await paymentDialog.getByRole('button', { name: /Salvar pagamento/i }).click();
  await expect(paymentDialog).toBeHidden();
  await expect(page.getByText('Confirmado', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Iniciar produção/i }).click();
  await expect(page.getByText('Em produção', { exact: true })).toBeVisible();

  let detail = await api<any>(page, 'GET', `/orders/${orderId}`);
  for (const base of detail.manufacturing_jobs as any[]) {
    let job = base;
    if (job.status === 'PLANNED') {
      job = await api(page, 'PATCH', `/manufacturing/jobs/${job.id}`, {
        version: job.version,
        status: 'READY',
        actualMaterialAmount: null,
        actualMinutes: null,
        notes: 'Homologação E2E',
      });
    }
    if (job.status === 'READY') {
      job = await api(page, 'PATCH', `/manufacturing/jobs/${job.id}`, {
        version: job.version,
        status: 'RUNNING',
        actualMaterialAmount: null,
        actualMinutes: null,
        notes: 'Homologação E2E',
      });
    }
    if (job.status === 'RUNNING') {
      await api(page, 'PATCH', `/manufacturing/jobs/${job.id}`, {
        version: job.version,
        status: 'COMPLETED',
        actualMaterialAmount: Number(job.estimated_material_amount),
        actualMinutes: Number(job.estimated_minutes),
        notes: 'Job validado no fluxo E2E',
      });
    }
  }

  detail = await api<any>(page, 'GET', `/orders/${orderId}`);
  const stepIds = (detail.steps as any[])
    .sort((a, b) => a.position - b.position)
    .map((step) => step.id);
  for (const stepId of stepIds) {
    detail = await api<any>(page, 'GET', `/orders/${orderId}`);
    let step = (detail.steps as any[]).find((candidate) => candidate.id === stepId)!;
    expect(step.status).toBe('READY');
    const actualHours = Number(step.estimated_hours) || 0.25;
    step = await api(page, 'PATCH', `/production/${step.id}`, {
      version: step.version,
      status: 'IN_PROGRESS',
      assignedTo: null,
      estimatedHours: Number(step.estimated_hours),
      actualHours,
      notes: 'Etapa validada no fluxo E2E',
      position: step.position,
    });
    await api(page, 'PATCH', `/production/${step.id}`, {
      version: step.version,
      status: 'COMPLETED',
      assignedTo: null,
      estimatedHours: Number(step.estimated_hours),
      actualHours,
      notes: 'Etapa concluída no fluxo E2E',
      position: step.position,
    });
  }

  await page.reload();
  await expect(page.getByRole('button', { name: /Marcar como pronto/i })).toBeEnabled();
  await page.getByRole('button', { name: /Marcar como pronto/i }).click();
  await expect(page.getByText('Pronto', { exact: true })).toBeVisible();
  await expect(page.getByText('Custo realizado', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Registrar pagamento/i }).first().click();
  paymentDialog = page.getByRole('dialog', { name: 'Registrar pagamento' });
  await expect(paymentDialog.getByLabel('Tipo')).toHaveValue('BALANCE');
  expect(Number(await paymentDialog.getByLabel('Valor (R$)').inputValue())).toBeGreaterThan(0);
  await paymentDialog.getByRole('button', { name: /Salvar pagamento/i }).click();
  await expect(paymentDialog).toBeHidden();

  await page.getByRole('button', { name: /Concluir entrega/i }).click();
  await expect(page.getByText('Entregue', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Uma criação, uma nova história/i })).toBeVisible();

  await page.getByRole('link', { name: /Financeiro/i }).click();
  await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(orderCode) }).first()).toBeVisible();

  await page.getByRole('link', { name: /Configurações/i }).click();
  await page.getByRole('button', { name: 'Auditoria' }).click();
  await expect(page.getByText('Pedido entregue', { exact: true })).toBeVisible();
  await expect(page.getByText('Orçamento aprovado', { exact: true })).toBeVisible();
});
