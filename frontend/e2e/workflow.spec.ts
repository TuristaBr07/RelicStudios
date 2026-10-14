import { test, expect } from '@playwright/test';

test('login e navegação principal', async ({ page }) => {
  const password = process.env.RELIC_TEST_PASSWORD;
  if (!password) throw new Error('RELIC_TEST_PASSWORD ausente.');
  await page.goto('/');
  await page.getByLabel('E-mail').fill('qa@example.test');
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: /Entrar no estúdio/i }).click();
  await expect(page.getByRole('heading', { name: /Bom trabalho/i })).toBeVisible();
  await page.getByRole('link', { name: /Clientes/i }).click();
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  await page.getByRole('button', { name: /Novo cliente/i }).click();
  await page.getByLabel('Nome completo *').fill('Cliente E2E');
  await page.getByRole('button', { name: /Salvar cliente/i }).click();
  await expect(page.getByText('Cliente E2E')).toBeVisible();
});
