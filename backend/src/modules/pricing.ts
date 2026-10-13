import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { ensure } from '../lib/core.js';
export const policySchema = z
  .object({
    finishingHourly: z.number().min(30).max(10000),
    paintingHourly: z.number().min(40).max(10000),
    modelingHourly: z.number().min(50).max(10000),
    reservePercent: z.number().min(0).max(100),
    overheadPercent: z.number().min(0).max(100),
    minimumMarginPercent: z.number().min(15).max(80),
    defaultMarginPercent: z.number().min(15).max(80),
    premiumMinPercent: z.number().min(15).max(80),
    premiumMaxPercent: z.number().min(15).max(80),
    maximumPixPercent: z.number().min(0).max(5),
    validityDays: z.number().int().min(1).max(90),
    depositPercent: z.number().min(1).max(100),
  })
  .strict()
  .refine(
    (p) =>
      p.defaultMarginPercent >= p.minimumMarginPercent &&
      p.premiumMinPercent >= p.defaultMarginPercent &&
      p.premiumMaxPercent >= p.premiumMinPercent,
    'Margens devem seguir a ordem mínima, padrão e premium.',
  );
export type Policy = z.infer<typeof policySchema>;
const value = z.number().finite().min(0).max(100000);
export const pricingInputSchema = z
  .object({
    resinGrams: value.default(0),
    resinPriceKg: value.default(0),
    printHours: value.default(0),
    machineHourlyCost: value.default(0),
    finishingHours: value.default(0),
    paintingHours: value.default(0),
    modelingHours: value.default(0),
    consumables: value.default(0),
    packaging: value.default(0),
    extras: value.default(0),
    feePercent: z.number().min(0).max(50).default(0),
    taxPercent: z.number().min(0).max(50).default(0),
    marginPercent: z.number().min(0).max(80).optional(),
    pixDiscountPercent: z.number().min(0).max(5).default(0),
    benchmarkLow: value.default(0),
    benchmarkHigh: value.default(0),
    benchmarkNotes: z.string().max(2000).default(''),
    finalPrice: value.optional(),
    overrideReason: z.string().max(2000).default(''),
    authorizeBelowMinimum: z.boolean().default(false),
  })
  .strict();
export type PricingInput = z.infer<typeof pricingInputSchema>;
const cents = (v: Decimal.Value) =>
  new Decimal(v).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
export function calculate(input: PricingInput, policy: Policy, role: string) {
  const D = (v: Decimal.Value) => new Decimal(v);
  const resin = cents(D(input.resinGrams).div(1000).mul(input.resinPriceKg));
  const machine = cents(D(input.printHours).mul(input.machineHourlyCost));
  const reserve = D(resin + machine)
    .mul(policy.reservePercent)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const finishing = cents(D(input.finishingHours).mul(policy.finishingHourly));
  const painting = cents(D(input.paintingHours).mul(policy.paintingHourly));
  const modeling = cents(D(input.modelingHours).mul(policy.modelingHourly));
  const consumables = cents(input.consumables),
    packaging = cents(input.packaging),
    extras = cents(input.extras);
  const base =
    resin + machine + reserve + finishing + painting + modeling + consumables + packaging + extras;
  const overhead = D(base)
    .mul(policy.overheadPercent)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const cost = base + overhead;
  ensure(cost > 0, 'Informe ao menos um custo de produção.');
  ensure(cost <= 100000000, 'O custo excede o limite de R$ 1 milhão por peça.');
  const margin = input.marginPercent ?? policy.defaultMarginPercent;
  ensure(
    margin >= policy.minimumMarginPercent,
    'A margem de cálculo não pode ser inferior à margem mínima. Use um override justificado.',
  );
  const charges = D(input.feePercent).plus(input.taxPercent).div(100);
  ensure(
    charges.plus(D(margin).div(100)).lt(1),
    'A soma de taxas, impostos e margem deve ser menor que 100%.',
  );
  const roundedCharge = (p: number, rate: number) =>
    D(p).mul(rate).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const net = (p: number) =>
    p - roundedCharge(p, input.feePercent) - roundedCharge(p, input.taxPercent) - cost;
  const sustainable = (p: number, m: number) => D(net(p)).mul(100).gte(D(p).mul(m));
  const price = (m: number) => {
    let p = D(cost)
      .div(D(1).minus(charges).minus(D(m).div(100)))
      .ceil()
      .toNumber();
    ensure(p <= 100000000, 'O preço excede o limite de R$ 1 milhão por peça.');
    while (!sustainable(p, m)) p++;
    return p;
  };
  const minimum = price(policy.minimumMarginPercent),
    suggested = price(margin);
  ensure(input.pixDiscountPercent <= policy.maximumPixPercent, 'Desconto Pix acima da política.');
  const discounted = D(suggested)
    .mul(D(1).minus(D(input.pixDiscountPercent).div(100)))
    .ceil()
    .toNumber();
  ensure(
    discounted >= minimum && sustainable(discounted, policy.minimumMarginPercent),
    'O desconto Pix solicitado viola a margem mínima. Reduza o desconto.',
  );
  ensure(
    !input.benchmarkHigh || input.benchmarkHigh >= input.benchmarkLow,
    'A faixa alta do mercado deve ser maior ou igual à baixa.',
  );
  const final = input.finalPrice === undefined ? discounted : cents(input.finalPrice);
  ensure(final > 0 && final <= 100000000, 'Preço final fora do limite permitido.');
  const isOverride = final !== discounted;
  if (isOverride)
    ensure(
      input.overrideReason.trim().length >= 8,
      'Informe uma justificativa de ao menos 8 caracteres para alterar o preço.',
    );
  const belowMinimum = final < minimum || !sustainable(final, policy.minimumMarginPercent);
  if (belowMinimum)
    ensure(
      role === 'ADMIN' && input.authorizeBelowMinimum && input.overrideReason.trim().length >= 8,
      'Preço abaixo do mínimo exige autorização explícita de um administrador.',
      403,
    );
  const fee = D(final)
    .mul(input.feePercent)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const tax = D(final)
    .mul(input.taxPercent)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const profit = final - fee - tax - cost;
  return {
    input,
    policy,
    breakdown: {
      resin,
      machine,
      reserve,
      finishing,
      painting,
      modeling,
      consumables,
      packaging,
      extras,
      overhead,
    },
    costCents: cost,
    minimumCents: minimum,
    suggestedCents: suggested,
    discountedCents: discounted,
    finalCents: final,
    feeCents: fee,
    taxCents: tax,
    profitCents: profit,
    marginPercent: D(profit).div(final).mul(100).toDecimalPlaces(2).toNumber(),
    isOverride,
    belowMinimum,
  };
}
