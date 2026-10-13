import { Decimal } from 'decimal.js';
import { z } from 'zod';
import type { Sql } from '../lib/db.js';
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
    electricityKwh: z.number().min(0).max(100).default(0),
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
const manufacturingJobSchema = z
  .object({
    printerId: z.uuid(),
    materialId: z.uuid(),
    materialAmount: z.number().positive().max(100000000),
    printHours: z.number().positive().max(100000),
    outputQuantity: z.number().int().min(1).max(10000),
  })
  .strict();

export const pricingInputSchema = z
  .object({
    manufacturingJobs: z.array(manufacturingJobSchema).max(20).default([]),
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

export type ResolvedManufacturingJob = {
  printerId: string;
  printerName: string;
  materialId: string;
  materialName: string;
  technologyCode: string;
  materialUnit: 'ML' | 'G';
  printTimeModel: 'BATCH_LAYER' | 'ADDITIVE';
  materialAmountPerRun: number;
  printHoursPerRun: number;
  outputQuantity: number;
  runs: number;
  totalOutputCapacity: number;
  materialBaseCents: number;
  materialWasteCents: number;
  machineCents: number;
  maintenanceCents: number;
  energyCents: number;
  reserveCents: number;
  totalCents: number;
  snapshot: {
    packageQuantity: number;
    packagePriceCents: number;
    wastePercent: number;
    machineHourlyCents: number;
    maintenanceReservePercent: number;
    averagePowerWatts: number | null;
    electricityKwh: number;
  };
};

const cents = (v: Decimal.Value) =>
  new Decimal(v).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const round = (v: Decimal.Value) =>
  new Decimal(v).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const ceil = (v: Decimal.Value) => new Decimal(v).ceil().toNumber();

export async function resolveManufacturingJobs(
  db: Sql,
  input: PricingInput,
  policy: Policy,
  quantity: number,
): Promise<ResolvedManufacturingJob[]> {
  const resolved: ResolvedManufacturingJob[] = [];
  for (const job of input.manufacturingJobs) {
    const [row] = await db.query(
      `SELECT p.id AS printer_id,p.name AS printer_name,p.technology_code,
              p.machine_hourly_cents,p.maintenance_reserve_percent,p.estimated_average_power_watts,
              m.id AS material_id,m.name AS material_name,m.unit,m.package_quantity,
              m.package_price_cents,m.waste_percent,t.print_time_model
         FROM relic.printers p
         JOIN relic.materials m ON m.id=$2
         JOIN relic.manufacturing_technologies t ON t.code=p.technology_code
        WHERE p.id=$1 AND p.active AND m.active
          AND m.technology_code=p.technology_code AND t.active`,
      [job.printerId, job.materialId],
    );
    ensure(row, 'Impressora e material precisam estar ativos e usar a mesma tecnologia.', 422);

    const runs = Math.ceil(quantity / job.outputQuantity);
    const packageQuantity = Number(row.package_quantity);
    const packagePriceCents = Number(row.package_price_cents);
    const wastePercent = Number(row.waste_percent);
    const machineHourlyCents = Number(row.machine_hourly_cents);
    const maintenanceReservePercent = Number(row.maintenance_reserve_percent);
    const averagePowerWatts =
      row.estimated_average_power_watts === null
        ? null
        : Number(row.estimated_average_power_watts);
    const totalHours = new Decimal(job.printHours).mul(runs);
    const materialBaseCents = round(
      new Decimal(job.materialAmount)
        .mul(runs)
        .mul(packagePriceCents)
        .div(packageQuantity),
    );
    const materialWasteCents = round(
      new Decimal(materialBaseCents).mul(wastePercent).div(100),
    );
    const machineCents = round(totalHours.mul(machineHourlyCents));
    const maintenanceCents = round(
      new Decimal(machineCents).mul(maintenanceReservePercent).div(100),
    );
    const energyCents = averagePowerWatts
      ? cents(totalHours.mul(averagePowerWatts).div(1000).mul(policy.electricityKwh))
      : 0;
    const reserveBase =
      materialBaseCents + materialWasteCents + machineCents + maintenanceCents + energyCents;
    const reserveCents = round(new Decimal(reserveBase).mul(policy.reservePercent).div(100));

    resolved.push({
      printerId: row.printer_id,
      printerName: row.printer_name,
      materialId: row.material_id,
      materialName: row.material_name,
      technologyCode: row.technology_code,
      materialUnit: row.unit,
      printTimeModel: row.print_time_model,
      materialAmountPerRun: job.materialAmount,
      printHoursPerRun: job.printHours,
      outputQuantity: job.outputQuantity,
      runs,
      totalOutputCapacity: runs * job.outputQuantity,
      materialBaseCents,
      materialWasteCents,
      machineCents,
      maintenanceCents,
      energyCents,
      reserveCents,
      totalCents: reserveBase + reserveCents,
      snapshot: {
        packageQuantity,
        packagePriceCents,
        wastePercent,
        machineHourlyCents,
        maintenanceReservePercent,
        averagePowerWatts,
        electricityKwh: policy.electricityKwh,
      },
    });
  }
  return resolved;
}

export function calculate(
  input: PricingInput,
  policy: Policy,
  role: string,
  quantity = 1,
  manufacturingJobs: ResolvedManufacturingJob[] = [],
) {
  ensure(Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000, 'Quantidade inválida.');
  ensure(
    manufacturingJobs.length === input.manufacturingJobs.length,
    'Os jobs de fabricação precisam ser validados pelo catálogo.',
  );

  const manufacturing = manufacturingJobs.reduce((sum, job) => sum + job.totalCents, 0);
  const material = manufacturingJobs.reduce((sum, job) => sum + job.materialBaseCents, 0);
  const materialWaste = manufacturingJobs.reduce((sum, job) => sum + job.materialWasteCents, 0);
  const machine = manufacturingJobs.reduce((sum, job) => sum + job.machineCents, 0);
  const maintenance = manufacturingJobs.reduce((sum, job) => sum + job.maintenanceCents, 0);
  const energy = manufacturingJobs.reduce((sum, job) => sum + job.energyCents, 0);
  const reserve = manufacturingJobs.reduce((sum, job) => sum + job.reserveCents, 0);
  const finishing = cents(new Decimal(input.finishingHours).mul(policy.finishingHourly).mul(quantity));
  const painting = cents(new Decimal(input.paintingHours).mul(policy.paintingHourly).mul(quantity));
  const modeling = cents(new Decimal(input.modelingHours).mul(policy.modelingHourly));
  const consumables = cents(new Decimal(input.consumables).mul(quantity));
  const packaging = cents(new Decimal(input.packaging).mul(quantity));
  const extras = cents(new Decimal(input.extras).mul(quantity));

  const directBatch = manufacturing + finishing + painting + modeling + consumables + packaging + extras;
  const overhead = round(new Decimal(directBatch).mul(policy.overheadPercent).div(100));
  const batchCost = directBatch + overhead;
  ensure(batchCost > 0, 'Informe ao menos um custo de produção.');
  ensure(batchCost <= 100000000, 'O custo excede o limite de R$ 1 milhão por item.');

  const margin = input.marginPercent ?? policy.defaultMarginPercent;
  ensure(
    margin >= policy.minimumMarginPercent,
    'A margem de cálculo não pode ser inferior à margem mínima. Use um override justificado.',
  );
  const charges = new Decimal(input.feePercent).plus(input.taxPercent).div(100);
  ensure(
    charges.plus(new Decimal(margin).div(100)).lt(1),
    'A soma de taxas, impostos e margem deve ser menor que 100%.',
  );

  const charge = (totalPrice: number, rate: number) =>
    round(new Decimal(totalPrice).mul(rate).div(100));
  const batchNet = (unitPrice: number) => {
    const totalPrice = unitPrice * quantity;
    return totalPrice - charge(totalPrice, input.feePercent) - charge(totalPrice, input.taxPercent) - batchCost;
  };
  const sustainable = (unitPrice: number, targetMargin: number) => {
    const totalPrice = unitPrice * quantity;
    return new Decimal(batchNet(unitPrice)).mul(100).gte(new Decimal(totalPrice).mul(targetMargin));
  };
  const price = (targetMargin: number) => {
    let unitPrice = ceil(
      new Decimal(batchCost)
        .div(quantity)
        .div(new Decimal(1).minus(charges).minus(new Decimal(targetMargin).div(100))),
    );
    ensure(unitPrice * quantity <= 100000000, 'O preço excede o limite de R$ 1 milhão por item.');
    while (!sustainable(unitPrice, targetMargin)) unitPrice++;
    return unitPrice;
  };

  const minimum = price(policy.minimumMarginPercent);
  const suggested = price(margin);
  ensure(input.pixDiscountPercent <= policy.maximumPixPercent, 'Desconto Pix acima da política.');
  const discounted = ceil(
    new Decimal(suggested).mul(new Decimal(1).minus(new Decimal(input.pixDiscountPercent).div(100))),
  );
  ensure(
    discounted >= minimum && sustainable(discounted, policy.minimumMarginPercent),
    'O desconto Pix solicitado viola a margem mínima. Reduza o desconto.',
  );
  ensure(
    !input.benchmarkHigh || input.benchmarkHigh >= input.benchmarkLow,
    'A faixa alta do mercado deve ser maior ou igual à baixa.',
  );

  const final = input.finalPrice === undefined ? discounted : cents(input.finalPrice);
  ensure(final > 0 && final * quantity <= 100000000, 'Preço final fora do limite permitido.');
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

  const batchPrice = final * quantity;
  const batchFee = charge(batchPrice, input.feePercent);
  const batchTax = charge(batchPrice, input.taxPercent);
  const batchProfit = batchPrice - batchFee - batchTax - batchCost;
  const batchBreakdown = {
    material,
    materialWaste,
    machine,
    maintenance,
    energy,
    reserve,
    finishing,
    painting,
    modeling,
    consumables,
    packaging,
    extras,
    overhead,
  };
  const perUnit = Object.fromEntries(
    Object.entries(batchBreakdown).map(([key, amount]) => [key, round(new Decimal(amount).div(quantity))]),
  );

  return {
    input,
    policy,
    quantity,
    manufacturingJobs,
    breakdown: perUnit,
    batchBreakdown,
    costCents: ceil(new Decimal(batchCost).div(quantity)),
    batchCostCents: batchCost,
    minimumCents: minimum,
    suggestedCents: suggested,
    discountedCents: discounted,
    finalCents: final,
    batchPriceCents: batchPrice,
    feeCents: round(new Decimal(batchFee).div(quantity)),
    taxCents: round(new Decimal(batchTax).div(quantity)),
    batchFeeCents: batchFee,
    batchTaxCents: batchTax,
    profitCents: round(new Decimal(batchProfit).div(quantity)),
    batchProfitCents: batchProfit,
    marginPercent: new Decimal(batchProfit).div(batchPrice).mul(100).toDecimalPlaces(2).toNumber(),
    isOverride,
    belowMinimum,
  };
}

export async function calculateWithCatalog(
  db: Sql,
  rawInput: PricingInput,
  rawPolicy: Policy,
  role: string,
  quantity = 1,
) {
  const input = pricingInputSchema.parse(rawInput);
  const policy = policySchema.parse(rawPolicy);
  const parsedQuantity = z.number().int().min(1).max(1000).parse(quantity);
  const jobs = await resolveManufacturingJobs(db, input, policy, parsedQuantity);
  return calculate(input, policy, role, parsedQuantity, jobs);
}
