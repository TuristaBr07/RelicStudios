import { useEffect, useState, type ReactNode } from 'react';
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
