from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Pattern is not unique in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


pricing = r'''import { Decimal } from 'decimal.js';
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
'''
write('backend/src/modules/pricing.ts', pricing)

pricing_ui = r'''import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calculator,
  ArrowRight,
  Layers,
  Clock,
  SlidersHorizontal,
  Check,
  Plus,
  Trash2,
  Printer,
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
  Feedback,
  Loading,
  ErrorBox,
  money,
  num,
  type Row,
} from '../lib';

export const defaultInput = {
  manufacturingJobs: [],
  finishingHours: 0,
  paintingHours: 0,
  modelingHours: 0,
  consumables: 0,
  packaging: 0,
  extras: 0,
  feePercent: 0,
  taxPercent: 0,
  pixDiscountPercent: 0,
  benchmarkLow: 0,
  benchmarkHigh: 0,
  benchmarkNotes: '',
  overrideReason: '',
  authorizeBelowMinimum: false,
};

const unitLabel = (unit: string) => (unit === 'ML' ? 'mL' : 'g');

export function PricingEditor({
  policies,
  initial,
  initialPolicyId,
  onUse,
  children,
  fixedPolicy = false,
  quantity = 1,
}: {
  policies: Row[];
  initial?: Row;
  initialPolicyId?: string;
  onUse?: (input: Row, result: Row) => void;
  children?: ReactNode;
  fixedPolicy?: boolean;
  quantity?: number;
}) {
  const first =
    policies.find((p) => p.id === initialPolicyId) ??
    policies.find((p) => p.active) ??
    policies[0]!;
  const [policyId, setPolicyId] = useState(first.id),
    [input, setInput] = useState<Row>({
      ...defaultInput,
      marginPercent: first.settings.defaultMarginPercent,
      ...initial,
      manufacturingJobs: Array.isArray(initial?.manufacturingJobs) ? initial.manufacturingJobs : [],
    }),
    [result, setResult] = useState<Row | null>(null);
  const action = useAction(),
    { user } = useAuth();
  const printers = useData<Row[]>('/manufacturing/printers');
  const materials = useData<Row[]>('/manufacturing/materials');
  const policy = policies.find((p) => p.id === policyId)!;
  const jobs = (input.manufacturingJobs ?? []) as Row[];

  useEffect(() => setResult(null), [quantity]);

  function change(key: string, value: unknown) {
    setInput({ ...input, [key]: value });
    setResult(null);
  }

  function changeJob(index: number, patch: Row) {
    change(
      'manufacturingJobs',
      jobs.map((job, current) => (current === index ? { ...job, ...patch } : job)),
    );
  }

  function addJob() {
    const printer = printers.data?.find((p) => p.active) ?? printers.data?.[0];
    if (!printer) return;
    const material = materials.data?.find(
      (m) => m.active && m.technology_code === printer.technology_code,
    );
    if (!material) return;
    change('manufacturingJobs', [
      ...jobs,
      {
        printerId: printer.id,
        materialId: material.id,
        materialAmount: 0,
        printHours: 0,
        outputQuantity: 1,
      },
    ]);
  }

  const numberField = (key: string, label: string, hint?: string, max = 100000) => (
    <Field key={key} label={label} {...(hint ? { hint } : {})}>
      <input
        type="number"
        min="0"
        max={max}
        step="0.01"
        value={input[key] ?? ''}
        onChange={(e) =>
          change(
            key,
            e.target.value === '' && key === 'finalPrice' ? undefined : num(e.target.value),
          )
        }
      />
    </Field>
  );

  const catalogError = printers.error || materials.error;
  const canAddJob =
    !!printers.data?.some((p) =>
      materials.data?.some((m) => m.technology_code === p.technology_code && m.active),
    );

  return (
    <div className="pricing-layout">
      <Form
        className="pricing-form"
        onSubmit={() =>
          void action.run(async () => {
            setResult(
              await api('/pricing/calculate', send('POST', { policyId, input, quantity })),
            );
          }, 'Cálculo validado pelo servidor.')
        }
      >
        {children}
        <section className="panel">
          <div className="panel-heading">
            <div className="section-title">
              <Printer size={19} />
              <h3>Jobs de impressão</h3>
            </div>
            <button type="button" disabled={!canAddJob} onClick={addJob}>
              <Plus size={16} /> Adicionar job
            </button>
          </div>
          <ErrorBox error={catalogError} />
          {printers.loading || materials.loading ? (
            <Loading />
          ) : jobs.length === 0 ? (
            <p className="muted">
              Adicione um job quando a peça exigir impressão. Trabalhos somente de modelagem ou
              acabamento podem ser calculados sem impressora.
            </p>
          ) : (
            jobs.map((job, index) => {
              const printer = printers.data?.find((p) => p.id === job.printerId);
              const compatible = materials.data?.filter(
                (m) => m.technology_code === printer?.technology_code && m.active,
              );
              const material = materials.data?.find((m) => m.id === job.materialId);
              return (
                <section className="panel" key={`${job.printerId}-${index}`}>
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">JOB {String(index + 1).padStart(2, '0')}</span>
                      <h3>{printer?.technology_name ?? 'Impressão'}</h3>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remover job ${index + 1}`}
                      onClick={() =>
                        change(
                          'manufacturingJobs',
                          jobs.filter((_, current) => current !== index),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field label="Impressora">
                      <select
                        value={job.printerId}
                        onChange={(e) => {
                          const next = printers.data?.find((p) => p.id === e.target.value);
                          const firstMaterial = materials.data?.find(
                            (m) => m.active && m.technology_code === next?.technology_code,
                          );
                          changeJob(index, {
                            printerId: e.target.value,
                            materialId: firstMaterial?.id ?? '',
                          });
                        }}
                      >
                        {printers.data?.filter((p) => p.active).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.technology_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Material">
                      <select
                        value={job.materialId}
                        onChange={(e) => changeJob(index, { materialId: e.target.value })}
                      >
                        {compatible?.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={`Material do slicer por job (${unitLabel(material?.unit ?? printer?.material_unit ?? '')})`}
                    >
                      <input
                        required
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={job.materialAmount}
                        onChange={(e) => changeJob(index, { materialAmount: num(e.target.value) })}
                      />
                    </Field>
                    <Field label="Tempo do slicer por job (h)">
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={job.printHours}
                        onChange={(e) => changeJob(index, { printHours: num(e.target.value) })}
                      />
                    </Field>
                    <Field
                      label="Unidades produzidas por job"
                      hint={
                        printer?.print_time_model === 'BATCH_LAYER'
                          ? 'MSLA: informe quantas unidades cabem na mesma placa usando o tempo informado.'
                          : 'FDM: normalmente 1; use mais apenas se o slicer representar um job conjunto.'
                      }
                    >
                      <input
                        required
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        value={job.outputQuantity}
                        onChange={(e) => changeJob(index, { outputQuantity: num(e.target.value) })}
                      />
                    </Field>
                  </div>
                </section>
              );
            })
          )}
          {!canAddJob && !printers.loading && !materials.loading && (
            <p className="fine-print">
              Cadastre ao menos um material ativo compatível em Fabricação antes de calcular uma
              impressão.
            </p>
          )}
          <p className="fine-print">
            Quantidade desta peça no orçamento: {quantity}. O servidor calcula automaticamente
            quantos jobs físicos serão necessários e rateia o custo pelo lote.
          </p>
        </section>

        <section className="panel">
          <div className="section-title">
            <Layers size={19} />
            <h3>Custos complementares</h3>
            <span>POR UNIDADE</span>
          </div>
          <div className="form-grid three">
            {numberField('consumables', 'Consumíveis (R$)')}
            {numberField('packaging', 'Embalagem (R$)')}
            {numberField('extras', 'Custos específicos (R$)')}
          </div>
          <p className="fine-print">
            Reserva de impressão: {policy.settings.reservePercent}% sobre o custo técnico do job.
            Energia usa a média calibrada da impressora e R$ {Number(policy.settings.electricityKwh ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/kWh da política.
          </p>
        </section>

        <section className="panel">
          <div className="section-title">
            <Clock size={19} />
            <h3>Tempo artesanal</h3>
          </div>
          <div className="form-grid three">
            {numberField(
              'finishingHours',
              'Acabamento por unidade (h)',
              `R$ ${policy.settings.finishingHourly}/h`,
            )}
            {numberField(
              'paintingHours',
              'Pintura por unidade (h)',
              `R$ ${policy.settings.paintingHourly}/h`,
            )}
            {numberField(
              'modelingHours',
              'Modelagem do projeto (h)',
              `R$ ${policy.settings.modelingHourly}/h · cobrada uma vez no lote`,
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <SlidersHorizontal size={19} />
            <h3>Política e venda</h3>
          </div>
          <div className="form-grid">
            <Field label="Política de preços">
              <select
                aria-label="Política de preços"
                disabled={fixedPolicy}
                value={policyId}
                onChange={(e) => {
                  setPolicyId(e.target.value);
                  setInput({
                    ...input,
                    marginPercent: policies.find((p) => p.id === e.target.value)!.settings
                      .defaultMarginPercent,
                  });
                  setResult(null);
                }}
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · v{p.version}
                    {p.active ? ' · ativa' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {numberField(
              'marginPercent',
              'Margem desejada (%)',
              'Padrão 20% · premium 25%–30%',
              80,
            )}
            {numberField('feePercent', 'Taxas de venda / pagamento (%)', undefined, 50)}
            {numberField('taxPercent', 'Impostos (%)', 'Informe apenas quando aplicáveis.', 50)}
            {numberField(
              'pixDiscountPercent',
              'Desconto Pix (%)',
              'Até 5%, preservando a margem mínima.',
              5,
            )}
          </div>
          <p className="fine-print">
            Overhead: {policy.settings.overheadPercent}%. Margem mínima:{' '}
            {policy.settings.minimumMarginPercent}% sobre o preço de venda, após taxas, impostos e
            custos.
          </p>
          <details>
            <summary>Benchmark de mercado e ajuste comercial</summary>
            <div className="form-grid">
              {numberField('benchmarkLow', 'Mercado: faixa baixa (R$)')}
              {numberField('benchmarkHigh', 'Mercado: faixa alta (R$)')}
            </div>
            <Field label="Observações do mercado">
              <textarea
                maxLength={2000}
                value={input.benchmarkNotes}
                onChange={(e) => change('benchmarkNotes', e.target.value)}
              />
            </Field>
            {numberField(
              'finalPrice',
              'Preço final manual por unidade (R$)',
              'Deixe vazio para usar o preço calculado.',
            )}
            <Field label="Justificativa do ajuste">
              <textarea
                value={input.overrideReason}
                maxLength={2000}
                onChange={(e) => change('overrideReason', e.target.value)}
              />
            </Field>
            {user!.role === 'ADMIN' && (
              <label className="check warning">
                <input
                  type="checkbox"
                  checked={input.authorizeBelowMinimum}
                  onChange={(e) => change('authorizeBelowMinimum', e.target.checked)}
                />{' '}
                Autorizo explicitamente preço abaixo do mínimo. A justificativa ficará na auditoria.
              </label>
            )}
          </details>
        </section>
        <Feedback action={action} />
        <Button className="primary full" busy={action.busy}>
          <Calculator size={18} /> Calcular preço
        </Button>
      </Form>

      <aside className="pricing-results">
        <div className="result-card">
          <span className="eyebrow">PRECISÃO ANTES DA CRIAÇÃO</span>
          <h2>O valor da peça</h2>
          {result ? (
            <>
              <span className="result-label">Preço final por unidade</span>
              <strong className="result-price">{money(result.finalCents)}</strong>
              <span className={`margin-pill ${result.belowMinimum ? 'danger' : ''}`}>
                {result.marginPercent}% de margem{' '}
                {result.belowMinimum ? '· exceção autorizada' : 'prevista'}
              </span>
              {result.quantity > 1 && (
                <p className="fine-print">
                  Lote de {result.quantity} unidades: {money(result.batchPriceCents)} · custo estimado{' '}
                  {money(result.batchCostCents)}.
                </p>
              )}
              <dl className="price-breakdown">
                <div>
                  <dt>Custo estimado por unidade</dt>
                  <dd>{money(result.costCents)}</dd>
                </div>
                <div>
                  <dt>Preço mínimo Relic</dt>
                  <dd>{money(result.minimumCents)}</dd>
                </div>
                <div>
                  <dt>Preço sugerido</dt>
                  <dd>{money(result.suggestedCents)}</dd>
                </div>
                <div>
                  <dt>Taxas e impostos</dt>
                  <dd>{money(result.feeCents + result.taxCents)}</dd>
                </div>
                <div className="profit">
                  <dt>Lucro previsto por unidade</dt>
                  <dd>{money(result.profitCents)}</dd>
                </div>
              </dl>
              {result.manufacturingJobs?.length > 0 && (
                <details className="cost-details" open>
                  <summary>Jobs de fabricação</summary>
                  {result.manufacturingJobs.map((job: Row, index: number) => (
                    <div key={`${job.printerId}-${index}`}>
                      <span>
                        {job.printerName} · {job.materialName} · {job.runs} job(s)
                      </span>
                      <span>{money(job.totalCents)}</span>
                    </div>
                  ))}
                </details>
              )}
              <details className="cost-details">
                <summary>Composição do custo por unidade</summary>
                {Object.entries(result.breakdown).map(([k, v]) => (
                  <div key={k}>
                    <span>{costNames[k]}</span>
                    <span>{money(v as number)}</span>
                  </div>
                ))}
              </details>
              {onUse && (
                <button type="button" className="primary full" onClick={() => onUse(input, result)}>
                  <Check size={17} /> Usar este cálculo
                </button>
              )}
            </>
          ) : (
            <div className="result-empty">
              <Calculator size={36} />
              <p>Monte os jobs e tempos da peça para visualizar o preço sustentável.</p>
            </div>
          )}
          <div className="result-note">
            O cálculo é validado na API com custos do catálogo. O orçamento preservará a versão da
            política, impressoras, materiais e parâmetros utilizados.
          </div>
        </div>
      </aside>
    </div>
  );
}

const costNames: Record<string, string> = {
  material: 'Material do slicer',
  materialWaste: 'Perda do material',
  machine: 'Máquina',
  maintenance: 'Reserva de manutenção',
  energy: 'Energia',
  reserve: 'Reserva de impressão',
  finishing: 'Acabamento',
  painting: 'Pintura',
  modeling: 'Modelagem',
  consumables: 'Consumíveis',
  packaging: 'Embalagem',
  extras: 'Custos específicos',
  overhead: 'Overhead',
};

export function CalculatorPage() {
  const { data, error, loading } = useData<Row[]>('/policies');
  const navigate = useNavigate();
  return (
    <>
      <Header
        eyebrow="SUSTENTABILIDADE EM CADA PEÇA"
        title="Calculadora de preço"
        subtitle="Jobs reais de impressão, trabalho manual e margem no mesmo cálculo."
        action={
          <span className="subtle-tag">
            Cálculo no servidor <ArrowRight size={15} />
          </span>
        }
      />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <PricingEditor
            policies={data}
            onUse={(input, result) =>
              navigate('/quotes/new', { state: { input, policyId: result.policyId } })
            }
          />
        )
      )}
    </>
  );
}
'''
write('frontend/src/pages/Pricing.tsx', pricing_ui)

pricing_test = r'''import { test } from 'node:test';
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
'''
write('backend/test/pricing.test.ts', pricing_test)

# API de cálculo: resolve custos exclusivamente a partir do catálogo.
replace_once(
    'backend/src/modules/catalog.ts',
    "import { policySchema, pricingInputSchema, calculate } from './pricing.js';",
    "import { policySchema, pricingInputSchema, calculateWithCatalog } from './pricing.js';",
)
replace_once(
    'backend/src/modules/catalog.ts',
    """    const b = z.object({ input: pricingInputSchema, policyId: uuid.optional() }).parse(req.body);\n    const [p] = b.policyId\n      ? await db.query('SELECT * FROM relic.pricing_settings WHERE id=$1 AND active', [b.policyId])\n      : await db.query('SELECT * FROM relic.pricing_settings WHERE active');\n    ensure(p, 'Política ativa não encontrada.', 404);\n    return {\n      ...calculate(b.input, policySchema.parse(p.settings), req.user!.role),\n      policyId: p.id,\n      policyVersion: p.version,\n    };""",
    """    const b = z\n      .object({\n        input: pricingInputSchema,\n        policyId: uuid.optional(),\n        quantity: z.number().int().min(1).max(1000).default(1),\n      })\n      .parse(req.body);\n    const [p] = b.policyId\n      ? await db.query('SELECT * FROM relic.pricing_settings WHERE id=$1 AND active', [b.policyId])\n      : await db.query('SELECT * FROM relic.pricing_settings WHERE active');\n    ensure(p, 'Política ativa não encontrada.', 404);\n    return {\n      ...(await calculateWithCatalog(\n        db,\n        b.input,\n        policySchema.parse(p.settings),\n        req.user!.role,\n        b.quantity,\n      )),\n      policyId: p.id,\n      policyVersion: p.version,\n    };""",
)

# Orçamentos: o servidor recalcula o lote com catálogo e cria jobs físicos no pedido.
replace_once(
    'backend/src/modules/quotes.ts',
    "import { pricingInputSchema, policySchema, calculate } from './pricing.js';",
    "import { pricingInputSchema, policySchema, calculateWithCatalog } from './pricing.js';",
)
replace_once(
    'backend/src/modules/quotes.ts',
    """      const items = b.items.map((item) => ({\n        ...item,\n        calc: calculate(item.input, policy, req.user!.role),\n      }));\n      const subtotal = items.reduce((s, i) => s + i.calc.finalCents * i.quantity, 0),\n        cost = items.reduce((s, i) => s + i.calc.costCents * i.quantity, 0),\n        profit = items.reduce((s, i) => s + i.calc.profitCents * i.quantity, 0);""",
    """      const items = await Promise.all(\n        b.items.map(async (item) => ({\n          ...item,\n          calc: await calculateWithCatalog(tx, item.input, policy, req.user!.role, item.quantity),\n        })),\n      );\n      const subtotal = items.reduce((s, i) => s + i.calc.finalCents * i.quantity, 0),\n        cost = items.reduce((s, i) => s + i.calc.batchCostCents, 0),\n        profit = items.reduce((s, i) => s + i.calc.batchProfitCents, 0);""",
)
old_order = """        for (const [index, stage] of stages.entries()) {\n          const input = item.calculation.input;\n          const hours: Record<string, number> = {\n            PRINTING: input.printHours,\n            PAINTING: input.paintingHours,\n            POST_PROCESSING: input.finishingHours,\n            PREPARATION: input.modelingHours,\n          };\n          await tx.query(\n            'INSERT INTO relic.production_steps(order_id,order_item_id,stage,status,position,estimated_hours) VALUES($1,$2,$3,$4,$5,$6)',\n            [\n              order!.id,\n              oi!.id,\n              stage,\n              index === 0 ? 'READY' : 'WAITING',\n              index + 1,\n              (hours[stage] ?? 0) * item.quantity,\n            ],\n          );\n        }"""
new_order = """        const input = item.calculation.input;\n        const manufacturing = Array.isArray(item.calculation.manufacturingJobs)\n          ? item.calculation.manufacturingJobs\n          : [];\n        let jobPosition = 1;\n        for (const job of manufacturing) {\n          let remaining = item.quantity;\n          for (let run = 1; run <= job.runs; run++) {\n            const output = Math.min(job.outputQuantity, remaining);\n            await tx.query(\n              `INSERT INTO relic.manufacturing_jobs(\n                order_item_id,printer_id,material_id,technology_code,position,status,output_quantity,\n                estimated_material_amount,estimated_minutes,snapshot,created_by\n              ) VALUES($1,$2,$3,$4,$5,'PLANNED',$6,$7,$8,$9,$10)`,\n              [\n                oi!.id,\n                job.printerId,\n                job.materialId,\n                job.technologyCode,\n                jobPosition++,\n                output,\n                job.materialAmountPerRun,\n                Math.round(job.printHoursPerRun * 60),\n                JSON.stringify({ ...job, run, runs: job.runs }),\n                req.user!.id,\n              ],\n            );\n            remaining -= output;\n          }\n        }\n        const legacy = !Array.isArray(input.manufacturingJobs);\n        const printHours = legacy\n          ? Number(input.printHours ?? 0) * item.quantity\n          : manufacturing.reduce(\n              (sum: number, job: Row) => sum + Number(job.printHoursPerRun) * Number(job.runs),\n              0,\n            );\n        const hours: Record<string, number> = {\n          PRINTING: printHours,\n          PAINTING: Number(input.paintingHours ?? 0) * item.quantity,\n          POST_PROCESSING: Number(input.finishingHours ?? 0) * item.quantity,\n          PREPARATION: legacy\n            ? Number(input.modelingHours ?? 0) * item.quantity\n            : Number(input.modelingHours ?? 0),\n        };\n        for (const [index, stage] of stages.entries()) {\n          await tx.query(\n            'INSERT INTO relic.production_steps(order_id,order_item_id,stage,status,position,estimated_hours) VALUES($1,$2,$3,$4,$5,$6)',\n            [\n              order!.id,\n              oi!.id,\n              stage,\n              index === 0 ? 'READY' : 'WAITING',\n              index + 1,\n              hours[stage] ?? 0,\n            ],\n          );\n        }"""
replace_once('backend/src/modules/quotes.ts', old_order, new_order)

# Quantidade participa do preview do preço e revisões antigas exigem recálculo consciente.
replace_once(
    'frontend/src/pages/Quotes.tsx',
    """    let cancelled = false;\n    Promise.all(\n      source.items.map(async (i: Row) => ({""",
    """    if (source.items.some((i: Row) => !Array.isArray(i.calculation?.input?.manufacturingJobs))) {\n      setItems([]);\n      setRepriceError(\n        'Este orçamento usa o modelo antigo de custos. Recalcule cada peça com impressora, material e job antes de criar a revisão.',\n      );\n      setRepricePending(false);\n      return;\n    }\n    let cancelled = false;\n    Promise.all(\n      source.items.map(async (i: Row) => ({""",
)
replace_once(
    'frontend/src/pages/Quotes.tsx',
    "send('POST', { policyId: active.id, input: i.calculation.input }))",
    "send('POST', { policyId: active.id, input: i.calculation.input, quantity: i.quantity }))",
)
replace_once(
    'frontend/src/pages/Quotes.tsx',
    """              fixedPolicy\n              onUse={(input, result) => {""",
    """              fixedPolicy\n              quantity={quantity}\n              onUse={(input, result) => {""",
)

# Política passa a carregar tarifa elétrica; políticas antigas continuam válidas com default zero.
replace_once(
    'frontend/src/pages/Settings.tsx',
    "  modelingHourly: 'Modelagem (R$/h)',\n  reservePercent: 'Reserva de impressão (%)',",
    "  modelingHourly: 'Modelagem (R$/h)',\n  electricityKwh: 'Energia elétrica (R$/kWh)',\n  reservePercent: 'Reserva de impressão (%)',",
)

# Teste integrado passa pelo novo catálogo e garante criação automática do job físico.
integration = read('backend/test/integration.test.ts')
old_input = """    const input = {\n      resinGrams: 100,\n      resinPriceKg: 180,\n      printHours: 4,\n      machineHourlyCost: 2,\n      finishingHours: 1,\n      paintingHours: 2,\n      consumables: 8,\n      packaging: 10,\n    };\n    const calculation = await call('POST', '/api/pricing/calculate', {\n      policyId: policy.id,\n      input,\n    });"""
new_input = """    const [printer] = await db.query(\n      \"SELECT id FROM relic.printers WHERE name='Saturn 4 12K'\",\n    );\n    const [material] = await db.query(\n      `INSERT INTO relic.materials(\n        technology_code,name,manufacturer,variant,unit,package_quantity,package_price_cents,waste_percent\n      ) VALUES('MSLA','Resina integração','Teste','Cinza','ML',1000,18000,5) RETURNING id`,\n    );\n    const input = {\n      manufacturingJobs: [\n        {\n          printerId: printer!.id,\n          materialId: material!.id,\n          materialAmount: 100,\n          printHours: 4,\n          outputQuantity: 2,\n        },\n      ],\n      finishingHours: 1,\n      paintingHours: 2,\n      consumables: 8,\n      packaging: 10,\n    };\n    const calculation = await call('POST', '/api/pricing/calculate', {\n      policyId: policy.id,\n      input,\n      quantity: 2,\n    });"""
if old_input not in integration:
    raise SystemExit('integration input pattern not found')
integration = integration.replace(old_input, new_input, 1)
integration = integration.replace(
    "items: [{ description: 'Peça de validação', quantity: 1, input }],",
    "items: [{ description: 'Peça de validação', quantity: 2, input }],",
    1,
)
integration = integration.replace(
    """    assert.match(order.code, /^PED-\\d{4}-\\d{4}$/);\n\n    await call(""",
    """    assert.match(order.code, /^PED-\\d{4}-\\d{4}$/);\n    const [job] = await db.query(\n      'SELECT output_quantity,estimated_minutes FROM relic.manufacturing_jobs WHERE order_item_id IN (SELECT id FROM relic.order_items WHERE order_id=$1)',\n      [order.id],\n    );\n    assert.equal(job?.output_quantity, 2);\n    assert.equal(job?.estimated_minutes, 240);\n\n    await call(""",
    1,
)
write('backend/test/integration.test.ts', integration)

# Teste de RBAC usa apenas mão de obra; o foco dele não é fabricação.
auth_test = read('backend/test/auth-rbac.test.ts')
old_auth_input = """    const input = {\n      resinGrams: 100,\n      resinPriceKg: 180,\n      printHours: 2,\n      machineHourlyCost: 2,\n      finishingHours: 1,\n      paintingHours: 1,\n      packaging: 10,\n    };"""
new_auth_input = """    const input = {\n      manufacturingJobs: [],\n      finishingHours: 1,\n      paintingHours: 1,\n      packaging: 10,\n    };"""
if old_auth_input not in auth_test:
    raise SystemExit('auth-rbac input pattern not found')
write('backend/test/auth-rbac.test.ts', auth_test.replace(old_auth_input, new_auth_input, 1))

# Documentação funcional da etapa.
replace_once(
    'README.md',
    """## Próxima evolução\n\nA próxima fase funcional será a nova calculadora de fabricação MSLA/FDM usando o catálogo e o modelo de jobs, substituindo os campos genéricos atuais de resina e máquina.\n""",
    """## Calculadora MSLA/FDM\n\nA precificação usa jobs de fabricação em vez de campos genéricos de resina e máquina. Cada job seleciona impressora e material do catálogo e recebe do slicer o material por job, o tempo por job e quantas unidades aquele job produz.\n\nO servidor calcula quantos jobs físicos são necessários para a quantidade comercial, custos de material e perda, máquina, manutenção, energia calibrada, reserva de impressão, mão de obra, overhead, taxas e margem. Em MSLA, várias unidades na mesma placa compartilham o tempo do job; em FDM, o padrão operacional continua sendo um job por unidade, salvo quando o próprio slicer representar um job conjunto.\n\nModelagem é tratada como custo único do item/lote. Pintura e acabamento permanecem custos por unidade. Ao converter um orçamento novo em pedido, os jobs planejados são materializados automaticamente em `manufacturing_jobs` e o tempo de impressão da produção vem desses jobs, sem multiplicação cega pela quantidade.\n\nOrçamentos históricos continuam íntegros. Uma revisão de orçamento criada no modelo antigo exige recálculo explícito no modelo novo, evitando converter automaticamente custos genéricos em materiais ou impressoras que não existiam no snapshot original.\n\n## Próxima evolução\n\nA próxima fase funcional será a estimativa assistida de pintura, acabamento e modelagem, comparando horas previstas e reais sem alterar automaticamente o preço de orçamentos já aprovados.\n""",
)
