import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, pricingInputSchema, policySchema } from '../src/modules/pricing.js';

const policy = policySchema.parse({
  finishingHourly: 30,
  paintingHourly: 40,
  modelingHourly: 50,
  reservePercent: 12,
  overheadPercent: 10,
  minimumMarginPercent: 15,
  defaultMarginPercent: 20,
  premiumMinPercent: 25,
  premiumMaxPercent: 30,
  maximumPixPercent: 5,
  validityDays: 7,
  depositPercent: 50,
});

const input = pricingInputSchema.parse({
  resinGrams: 100,
  resinPriceKg: 200,
  printHours: 10,
  machineHourlyCost: 2,
  finishingHours: 2,
  paintingHours: 3,
  modelingHours: 1,
  consumables: 10,
  packaging: 5,
});

test('calcula custo, preço sustentável e mão de obra separadamente', () => {
  const result = calculate(input, policy, 'COMMERCIAL');
  assert.equal(result.breakdown.finishing, 6000);
  assert.equal(result.breakdown.painting, 12000);
  assert.equal(result.breakdown.modeling, 5000);
  assert(result.minimumCents > result.costCents);
  assert(result.suggestedCents >= result.minimumCents);
  assert(result.profitCents > 0);
});

test('desconto Pix preserva a margem mínima', () => {
  const result = calculate({ ...input, pixDiscountPercent: 5 }, policy, 'COMMERCIAL');
  assert(result.finalCents < result.suggestedCents);
  assert(result.marginPercent >= policy.minimumMarginPercent);
  assert.throws(
    () => calculate({ ...input, marginPercent: 15, pixDiscountPercent: 5 }, policy, 'ADMIN'),
    /viola/,
  );
});

test('preço abaixo do mínimo exige administrador e justificativa', () => {
  const override = {
    ...input,
    finalPrice: 1,
    overrideReason: 'Amostra aprovada',
    authorizeBelowMinimum: true,
  };
  assert.throws(() => calculate(override, policy, 'COMMERCIAL'), /autorização/);
  assert.equal(calculate(override, policy, 'ADMIN').belowMinimum, true);
});

test('entradas inválidas são rejeitadas', () => {
  assert.throws(() => pricingInputSchema.parse({ resinGrams: -1 }));
  assert.throws(() => calculate(pricingInputSchema.parse({}), policy, 'ADMIN'));
  assert.throws(() => calculate({ ...input, benchmarkLow: 100, benchmarkHigh: 10 }, policy, 'ADMIN'));
});
