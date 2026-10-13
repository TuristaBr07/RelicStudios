import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate,
  pricingInputSchema,
  policySchema,
  type ResolvedManufacturingJob,
} from '../src/modules/pricing.js';

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
  electricityKwh: 1,
  validityDays: 7,
  depositPercent: 50,
});

const input = pricingInputSchema.parse({
  manufacturingJobs: [
    {
      printerId: '11111111-1111-4111-8111-111111111111',
      materialId: '22222222-2222-4222-8222-222222222222',
      materialAmount: 100,
      printHours: 4,
      outputQuantity: 2,
    },
  ],
  finishingHours: 2,
  paintingHours: 3,
  modelingHours: 1,
  consumables: 10,
  packaging: 5,
});

const job: ResolvedManufacturingJob = {
  printerId: input.manufacturingJobs[0]!.printerId,
  printerName: 'Saturn Teste',
  materialId: input.manufacturingJobs[0]!.materialId,
  materialName: 'Resina Teste',
  technologyCode: 'MSLA',
  materialUnit: 'ML',
  printTimeModel: 'BATCH_LAYER',
  materialAmountPerRun: 100,
  printHoursPerRun: 4,
  outputQuantity: 2,
  runs: 1,
  totalOutputCapacity: 2,
  materialBaseCents: 1500,
  materialWasteCents: 75,
  machineCents: 800,
  maintenanceCents: 80,
  energyCents: 40,
  reserveCents: 299,
  totalCents: 2794,
  snapshot: {
    packageQuantity: 1000,
    packagePriceCents: 15000,
    wastePercent: 5,
    machineHourlyCents: 200,
    maintenanceReservePercent: 10,
    averagePowerWatts: 100,
    electricityKwh: 1,
  },
};

test('calcula lote MSLA e rateia custo compartilhado por unidade', () => {
  const result = calculate(input, policy, 'COMMERCIAL', 2, [job]);
  assert.equal(result.manufacturingJobs[0]!.runs, 1);
  assert.equal(result.batchBreakdown.modeling, 5000);
  assert.equal(result.batchBreakdown.finishing, 12000);
  assert.equal(result.batchBreakdown.painting, 24000);
  assert(result.batchCostCents > result.costCents);
  assert(result.minimumCents > result.costCents);
  assert(result.suggestedCents >= result.minimumCents);
  assert(result.batchProfitCents > 0);
});

test('modelagem é custo único do lote e pintura/acabamento escalam com quantidade', () => {
  const one = calculate(input, policy, 'COMMERCIAL', 1, [{ ...job, runs: 1, totalOutputCapacity: 2 }]);
  const two = calculate(input, policy, 'COMMERCIAL', 2, [job]);
  assert.equal(one.batchBreakdown.modeling, two.batchBreakdown.modeling);
  assert.equal(two.batchBreakdown.painting, one.batchBreakdown.painting * 2);
  assert.equal(two.batchBreakdown.finishing, one.batchBreakdown.finishing * 2);
});

test('desconto Pix preserva a margem mínima', () => {
  const result = calculate({ ...input, pixDiscountPercent: 5 }, policy, 'COMMERCIAL', 2, [job]);
  assert(result.finalCents < result.suggestedCents);
  assert(result.marginPercent >= policy.minimumMarginPercent);
  assert.throws(
    () =>
      calculate(
        { ...input, marginPercent: 15, pixDiscountPercent: 5 },
        policy,
        'ADMIN',
        2,
        [job],
      ),
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
  assert.throws(() => calculate(override, policy, 'COMMERCIAL', 2, [job]), /autorização/);
  assert.equal(calculate(override, policy, 'ADMIN', 2, [job]).belowMinimum, true);
});

test('entradas genéricas antigas deixam de ser aceitas em novos cálculos', () => {
  assert.throws(() => pricingInputSchema.parse({ resinGrams: 100, resinPriceKg: 200 }));
  assert.throws(() => calculate(pricingInputSchema.parse({}), policy, 'ADMIN'));
  assert.throws(() =>
    calculate({ ...input, benchmarkLow: 100, benchmarkHigh: 10 }, policy, 'ADMIN', 2, [job]),
  );
});
