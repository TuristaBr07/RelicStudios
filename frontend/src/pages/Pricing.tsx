import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, ArrowRight, Layers, Clock, SlidersHorizontal, Check } from 'lucide-react';
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
  resinGrams: 0,
  resinPriceKg: 0,
  printHours: 0,
  machineHourlyCost: 0,
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
export function PricingEditor({
  policies,
  initial,
  initialPolicyId,
  onUse,
  children,
  fixedPolicy = false,
}: {
  policies: Row[];
  initial?: Row;
  initialPolicyId?: string;
  onUse?: (input: Row, result: Row) => void;
  children?: ReactNode;
  fixedPolicy?: boolean;
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
    }),
    [result, setResult] = useState<Row | null>(null);
  const action = useAction(),
    { user } = useAuth();
  const policy = policies.find((p) => p.id === policyId)!;
  function change(key: string, value: unknown) {
    setInput({ ...input, [key]: value });
    setResult(null);
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
  return (
    <div className="pricing-layout">
      <Form
        className="pricing-form"
        onSubmit={() =>
          void action.run(async () => {
            setResult(await api('/pricing/calculate', send('POST', { policyId, input })));
          }, 'Cálculo validado pelo servidor.')
        }
      >
        {children}
        <section className="panel">
          <div className="section-title">
            <Layers size={19} />
            <h3>Materiais e máquina</h3>
            <span>POR UNIDADE</span>
          </div>
          <div className="form-grid three">
            {numberField('resinGrams', 'Resina (g)')}
            {numberField('resinPriceKg', 'Resina: preço por kg (R$)')}
            {numberField('printHours', 'Tempo de impressão (h)')}
            {numberField('machineHourlyCost', 'Custo da máquina (R$/h)')}
            {numberField('consumables', 'Consumíveis (R$)')}
            {numberField('packaging', 'Embalagem (R$)')}
            {numberField('extras', 'Custos específicos (R$)')}
          </div>
          <p className="fine-print">
            Reserva de impressão: {policy.settings.reservePercent}% sobre resina + máquina.
            Impressão e trabalho manual são calculados separadamente.
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
              'Acabamento (h)',
              `R$ ${policy.settings.finishingHourly}/h`,
            )}
            {numberField('paintingHours', 'Pintura (h)', `R$ ${policy.settings.paintingHourly}/h`)}
            {numberField(
              'modelingHours',
              'Modelagem (h)',
              `R$ ${policy.settings.modelingHourly}/h`,
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
              'Preço final manual (R$)',
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
              <dl className="price-breakdown">
                <div>
                  <dt>Custo real estimado</dt>
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
                  <dt>Lucro previsto</dt>
                  <dd>{money(result.profitCents)}</dd>
                </div>
              </dl>
              <details className="cost-details">
                <summary>Composição do custo</summary>
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
              <p>Preencha os custos da peça e calcule para visualizar o preço sustentável.</p>
            </div>
          )}
          <div className="result-note">
            O cálculo é validado na API. O orçamento preservará a versão da política utilizada.
          </div>
        </div>
      </aside>
    </div>
  );
}
const costNames: Record<string, string> = {
  resin: 'Resina',
  machine: 'Máquina',
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
        subtitle="Valorize o trabalho manual. Proteja a margem do ateliê."
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
