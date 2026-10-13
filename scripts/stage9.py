from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


pricing = 'backend/src/modules/pricing.ts'
replace_once(
    pricing,
    "const value = z.number().finite().min(0).max(100000);\nconst manufacturingJobSchema = z\n",
    """const value = z.number().finite().min(0).max(100000);
const laborComponentSchema = z
  .object({
    label: z.string().trim().min(2).max(120),
    hours: value,
  })
  .strict();

export const laborEstimateSchema = z
  .union([
    z.object({ mode: z.literal('DIRECT'), hours: value }).strict(),
    z
      .object({
        mode: z.literal('COMPONENTS'),
        components: z.array(laborComponentSchema).min(1).max(20),
      })
      .strict(),
    z
      .object({
        mode: z.literal('PERT'),
        optimistic: value,
        mostLikely: value,
        pessimistic: value,
      })
      .strict(),
  ])
  .superRefine((estimate, ctx) => {
    if (
      estimate.mode === 'PERT' &&
      !(estimate.optimistic <= estimate.mostLikely && estimate.mostLikely <= estimate.pessimistic)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'A estimativa deve seguir otimista ≤ provável ≤ pessimista.',
      });
    }
  });
export type LaborEstimate = z.infer<typeof laborEstimateSchema>;

const laborEstimatesSchema = z
  .object({
    finishing: laborEstimateSchema.optional(),
    painting: laborEstimateSchema.optional(),
    modeling: laborEstimateSchema.optional(),
  })
  .strict()
  .default({});

const manufacturingJobSchema = z
""",
)
replace_once(
    pricing,
    "    manufacturingJobs: z.array(manufacturingJobSchema).max(20).default([]),\n    finishingHours: value.default(0),\n",
    "    manufacturingJobs: z.array(manufacturingJobSchema).max(20).default([]),\n    laborEstimates: laborEstimatesSchema,\n    finishingHours: value.default(0),\n",
)
replace_once(
    pricing,
    "const ceil = (v: Decimal.Value) => new Decimal(v).ceil().toNumber();\n\nexport async function resolveManufacturingJobs(\n",
    """const ceil = (v: Decimal.Value) => new Decimal(v).ceil().toNumber();

export function resolveLaborEstimate(estimate: LaborEstimate | undefined, fallbackHours = 0) {
  if (!estimate) return { mode: 'DIRECT' as const, hours: fallbackHours };
  if (estimate.mode === 'DIRECT') return estimate;
  if (estimate.mode === 'COMPONENTS') {
    const hours = new Decimal(
      estimate.components.reduce((sum, component) => sum + component.hours, 0),
    )
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
    return { ...estimate, hours };
  }
  const hours = new Decimal(estimate.optimistic)
    .plus(new Decimal(estimate.mostLikely).mul(4))
    .plus(estimate.pessimistic)
    .div(6)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
  return { ...estimate, hours };
}

export function resolveLaborEstimates(input: PricingInput) {
  return {
    finishing: resolveLaborEstimate(input.laborEstimates.finishing, input.finishingHours),
    painting: resolveLaborEstimate(input.laborEstimates.painting, input.paintingHours),
    modeling: resolveLaborEstimate(input.laborEstimates.modeling, input.modelingHours),
  };
}

export async function resolveManufacturingJobs(
""",
)
replace_once(
    pricing,
    """  const reserve = manufacturingJobs.reduce((sum, job) => sum + job.reserveCents, 0);
  const finishing = cents(new Decimal(input.finishingHours).mul(policy.finishingHourly).mul(quantity));
  const painting = cents(new Decimal(input.paintingHours).mul(policy.paintingHourly).mul(quantity));
  const modeling = cents(new Decimal(input.modelingHours).mul(policy.modelingHourly));
  const consumables = cents(new Decimal(input.consumables).mul(quantity));
""",
    """  const reserve = manufacturingJobs.reduce((sum, job) => sum + job.reserveCents, 0);
  const laborEstimates = resolveLaborEstimates(input);
  const effectiveInput: PricingInput = {
    ...input,
    finishingHours: laborEstimates.finishing.hours,
    paintingHours: laborEstimates.painting.hours,
    modelingHours: laborEstimates.modeling.hours,
  };
  const finishing = cents(
    new Decimal(laborEstimates.finishing.hours).mul(policy.finishingHourly).mul(quantity),
  );
  const painting = cents(
    new Decimal(laborEstimates.painting.hours).mul(policy.paintingHourly).mul(quantity),
  );
  const modeling = cents(new Decimal(laborEstimates.modeling.hours).mul(policy.modelingHourly));
  const consumables = cents(new Decimal(input.consumables).mul(quantity));
""",
)
replace_once(
    pricing,
    """  return {
    input,
    policy,
    quantity,
    manufacturingJobs,
""",
    """  return {
    input: effectiveInput,
    policy,
    quantity,
    manufacturingJobs,
    laborEstimates,
""",
)

orders = 'backend/src/modules/orders.ts'
replace_once(
    orders,
    """      ensure(s?.version === b.version, 'Etapa alterada. Atualize a página.', 409);
      ensure(
        !['COMPLETED', 'CANCELLED'].includes(s.status),
        'Etapa encerrada não pode ser modificada.',
      );
""",
    """      ensure(s?.version === b.version, 'Etapa alterada. Atualize a página.', 409);
      ensure(
        !['COMPLETED', 'CANCELLED'].includes(s.status),
        'Etapa encerrada não pode ser modificada.',
      );
      ensure(
        Number(s.estimated_hours) === b.estimatedHours,
        'As horas estimadas vêm do orçamento e permanecem como baseline. Registre apenas as horas reais.',
        422,
      );
""",
)
replace_once(
    orders,
    """      await audit(tx, req.user!.id, 'PRODUCTION_UPDATED', 'production_steps', id, {
        from: s.status,
        to: b.status,
        actualHours: b.actualHours,
        assignedTo: b.assignedTo,
      });
""",
    """      await audit(tx, req.user!.id, 'PRODUCTION_UPDATED', 'production_steps', id, {
        from: s.status,
        to: b.status,
        estimatedHours: Number(s.estimated_hours),
        actualHours: b.actualHours,
        varianceHours: Number((b.actualHours - Number(s.estimated_hours)).toFixed(2)),
        assignedTo: b.assignedTo,
      });
""",
)

frontend = 'frontend/src/pages/Pricing.tsx'
replace_once(
    frontend,
    """export const defaultInput = {
  manufacturingJobs: [],
  finishingHours: 0,
""",
    """export const defaultInput = {
  manufacturingJobs: [],
  laborEstimates: {},
  finishingHours: 0,
""",
)
replace_once(
    frontend,
    """const unitLabel = (unit: string) => (unit === 'ML' ? 'mL' : 'g');

export function PricingEditor({
""",
    """const unitLabel = (unit: string) => (unit === 'ML' ? 'mL' : 'g');
type LaborKind = 'finishing' | 'painting' | 'modeling';
const laborMeta: Record<LaborKind, { title: string; field: string; scope: string; presets: string[] }> = {
  finishing: {
    title: 'Acabamento',
    field: 'finishingHours',
    scope: 'por unidade',
    presets: ['Remoção de suportes', 'Lixamento', 'Correções e massa', 'Preparação para montagem'],
  },
  painting: {
    title: 'Pintura',
    field: 'paintingHours',
    scope: 'por unidade',
    presets: ['Preparação', 'Primer', 'Cores base', 'Sombras e luzes', 'Detalhes', 'Olhos / rosto', 'Finalização'],
  },
  modeling: {
    title: 'Modelagem',
    field: 'modelingHours',
    scope: 'uma vez no lote',
    presets: ['Referências e planejamento', 'Base / modelagem', 'Detalhamento', 'Cortes e encaixes', 'Preparação para impressão', 'Revisões'],
  },
};

function previewLaborHours(estimate: Row, fallback = 0) {
  if (!estimate || !estimate.mode) return fallback;
  if (estimate.mode === 'DIRECT') return Number(estimate.hours ?? 0);
  if (estimate.mode === 'COMPONENTS')
    return Number(
      (estimate.components ?? []).reduce(
        (sum: number, component: Row) => sum + Number(component.hours ?? 0),
        0,
      ).toFixed(2),
    );
  return Number(
    ((Number(estimate.optimistic ?? 0) + 4 * Number(estimate.mostLikely ?? 0) + Number(estimate.pessimistic ?? 0)) / 6).toFixed(2),
  );
}

export function PricingEditor({
""",
)
replace_once(
    frontend,
    """  const catalogError = printers.error || materials.error;
  const canAddJob =
    !!printers.data?.some((p) =>
      materials.data?.some((m) => m.technology_code === p.technology_code && m.active),
    );

  return (
""",
    """  const catalogError = printers.error || materials.error;
  const canAddJob =
    !!printers.data?.some((p) =>
      materials.data?.some((m) => m.technology_code === p.technology_code && m.active),
    );

  function changeLabor(kind: LaborKind, estimate: Row) {
    const meta = laborMeta[kind];
    const hours = previewLaborHours(estimate, Number(input[meta.field] ?? 0));
    setInput({
      ...input,
      laborEstimates: { ...(input.laborEstimates ?? {}), [kind]: estimate },
      [meta.field]: hours,
    });
    setResult(null);
  }

  function laborEditor(kind: LaborKind) {
    const meta = laborMeta[kind];
    const fallback = Number(input[meta.field] ?? 0);
    const estimate = (input.laborEstimates?.[kind] ?? { mode: 'DIRECT', hours: fallback }) as Row;
    const hours = previewLaborHours(estimate, fallback);
    const hourly = Number(policy.settings[`${kind}Hourly`]);
    const switchMode = (mode: string) => {
      if (mode === 'DIRECT') return changeLabor(kind, { mode, hours });
      if (mode === 'PERT')
        return changeLabor(kind, {
          mode,
          optimistic: hours,
          mostLikely: hours,
          pessimistic: hours,
        });
      return changeLabor(kind, {
        mode: 'COMPONENTS',
        components: meta.presets.map((label, index) => ({ label, hours: index === 0 ? hours : 0 })),
      });
    };
    return (
      <section className="panel" key={kind}>
        <div className="panel-heading">
          <div>
            <h3>{meta.title}</h3>
            <small>R$ {hourly.toLocaleString('pt-BR')}/h · {meta.scope}</small>
          </div>
          <strong>{hours.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h</strong>
        </div>
        <Field label="Forma de estimar">
          <select value={estimate.mode} onChange={(e) => switchMode(e.target.value)}>
            <option value="DIRECT">Horas diretas</option>
            <option value="COMPONENTS">Por etapas</option>
            <option value="PERT">Três pontos (PERT)</option>
          </select>
        </Field>
        {estimate.mode === 'DIRECT' && (
          <Field label="Horas estimadas">
            <input
              type="number"
              min="0"
              max="100000"
              step="0.01"
              value={estimate.hours ?? 0}
              onChange={(e) => changeLabor(kind, { mode: 'DIRECT', hours: num(e.target.value) })}
            />
          </Field>
        )}
        {estimate.mode === 'COMPONENTS' && (
          <>
            {(estimate.components ?? []).map((component: Row, index: number) => (
              <div className="form-grid" key={`${kind}-${index}`}>
                <Field label={`Etapa ${index + 1}`}>
                  <input
                    maxLength={120}
                    value={component.label}
                    onChange={(e) =>
                      changeLabor(kind, {
                        ...estimate,
                        components: estimate.components.map((item: Row, current: number) =>
                          current === index ? { ...item, label: e.target.value } : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Horas">
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    step="0.01"
                    value={component.hours}
                    onChange={(e) =>
                      changeLabor(kind, {
                        ...estimate,
                        components: estimate.components.map((item: Row, current: number) =>
                          current === index ? { ...item, hours: num(e.target.value) } : item,
                        ),
                      })
                    }
                  />
                </Field>
                <button
                  type="button"
                  className="icon-button"
                  disabled={estimate.components.length <= 1}
                  aria-label={`Remover etapa ${index + 1}`}
                  onClick={() =>
                    changeLabor(kind, {
                      ...estimate,
                      components: estimate.components.filter((_: Row, current: number) => current !== index),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="small"
              disabled={(estimate.components ?? []).length >= 20}
              onClick={() =>
                changeLabor(kind, {
                  ...estimate,
                  components: [...estimate.components, { label: 'Nova etapa', hours: 0 }],
                })
              }
            >
              <Plus size={14} /> Adicionar etapa
            </button>
          </>
        )}
        {estimate.mode === 'PERT' && (
          <div className="form-grid three">
            {[
              ['optimistic', 'Otimista'],
              ['mostLikely', 'Mais provável'],
              ['pessimistic', 'Pessimista'],
            ].map(([key, label]) => (
              <Field key={key} label={`${label} (h)`}>
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  value={estimate[key] ?? 0}
                  onChange={(e) => changeLabor(kind, { ...estimate, [key]: num(e.target.value) })}
                />
              </Field>
            ))}
          </div>
        )}
        <p className="fine-print">
          {estimate.mode === 'PERT'
            ? 'PERT = (otimista + 4 × mais provável + pessimista) / 6. O servidor valida a ordem dos três valores.'
            : estimate.mode === 'COMPONENTS'
              ? 'A estimativa é a soma das etapas. Os componentes ficam preservados no orçamento para referência futura.'
              : 'Use horas diretas quando a atividade já for previsível.'}
        </p>
      </section>
    );
  }

  return (
""",
)
replace_once(
    frontend,
    """        <section className="panel">
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
""",
    """        <section className="panel">
          <div className="section-title">
            <Clock size={19} />
            <h3>Estimativa de trabalho artesanal</h3>
          </div>
          <p className="muted">
            Escolha horas diretas, detalhe o trabalho por etapas ou use três pontos quando houver
            incerteza. A estimativa aprovada vira a baseline da produção; horas reais não alteram o
            preço do orçamento.
          </p>
          {(['finishing', 'painting', 'modeling'] as LaborKind[]).map(laborEditor)}
        </section>
""",
)

operations = 'frontend/src/pages/Operations.tsx'
replace_once(
    operations,
    """  const [status, setStatus] = useState(step.status),
    [assignedTo, setAssignedTo] = useState(step.assigned_to ?? ''),
    [estimatedHours, setEstimated] = useState(Number(step.estimated_hours)),
    [actualHours, setActual] = useState(Number(step.actual_hours)),
""",
    """  const [status, setStatus] = useState(step.status),
    [assignedTo, setAssignedTo] = useState(step.assigned_to ?? ''),
    [estimatedHours] = useState(Number(step.estimated_hours)),
    [actualHours, setActual] = useState(Number(step.actual_hours)),
""",
)
replace_once(
    operations,
    """          <Field label="Horas estimadas">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100000"
              value={estimatedHours}
              onChange={(e) => setEstimated(num(e.target.value))}
            />
          </Field>
""",
    """          <Field
            label="Horas previstas"
            hint="Baseline preservada do orçamento. Alterar horas reais não recalcula o preço vendido."
          >
            <input type="number" step="0.01" min="0" value={estimatedHours} readOnly />
          </Field>
""",
)
replace_once(
    operations,
    """        <Field label="Observações da produção">
          <textarea maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {step.started_at && (
""",
    """        <Field label="Observações da produção">
          <textarea maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="fine-print">
          Previsto {estimatedHours.toLocaleString('pt-BR')} h · real {actualHours.toLocaleString('pt-BR')} h
          {actualHours > 0
            ? ` · diferença ${(actualHours - estimatedHours) >= 0 ? '+' : ''}${(actualHours - estimatedHours).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`
            : ' · aguardando apontamento real'}.
        </p>
        {step.started_at && (
""",
)
replace_once(
    operations,
    """  const complete = o.steps.filter((s: Row) => ['COMPLETED', 'CANCELLED'].includes(s.status)).length;
  const actualHours = o.steps.reduce((sum: number, s: Row) => sum + Number(s.actual_hours || 0), 0);
  const change = (status: string) =>
""",
    """  const complete = o.steps.filter((s: Row) => ['COMPLETED', 'CANCELLED'].includes(s.status)).length;
  const estimatedHours = o.steps.reduce(
    (sum: number, s: Row) => sum + Number(s.estimated_hours || 0),
    0,
  );
  const actualHours = o.steps.reduce((sum: number, s: Row) => sum + Number(s.actual_hours || 0), 0);
  const hoursVariance = actualHours - estimatedHours;
  const change = (status: string) =>
""",
)
replace_once(
    operations,
    """        <Metric
          label="Etapas concluídas"
          value={`${complete} / ${o.steps.length}`}
          detail="Inclui etapas canceladas com justificativa"
        />
""",
    """        <Metric
          label="Etapas concluídas"
          value={`${complete} / ${o.steps.length}`}
          detail="Inclui etapas canceladas com justificativa"
        />
        <Metric
          label="Horas previstas / reais"
          value={`${estimatedHours.toLocaleString('pt-BR')} / ${actualHours.toLocaleString('pt-BR')} h`}
          detail={
            actualHours > 0
              ? `Diferença ${hoursVariance >= 0 ? '+' : ''}${hoursVariance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`
              : 'Baseline do orçamento; aguardando apontamentos reais'
          }
        />
""",
)
replace_once(
    operations,
    """                    <small>
                      {s.assignee_name ?? 'Sem responsável'} · {Number(s.actual_hours)} h reais /{' '}
                      {Number(s.estimated_hours)} h previstas
                    </small>
""",
    """                    <small>
                      {s.assignee_name ?? 'Sem responsável'} · {Number(s.actual_hours)} h reais /{' '}
                      {Number(s.estimated_hours)} h previstas
                    </small>
                    {Number(s.actual_hours) > 0 && (
                      <small>
                        Diferença{' '}
                        {Number(s.actual_hours) - Number(s.estimated_hours) >= 0 ? '+' : ''}
                        {(Number(s.actual_hours) - Number(s.estimated_hours)).toLocaleString('pt-BR', {
                          maximumFractionDigits: 2,
                        })}{' '}
                        h
                      </small>
                    )}
""",
)
replace_once(
    operations,
    """              <div className="production-meta">
                <span>{s.assignee_name ?? 'Sem responsável'}</span>
                <span>
                  <Clock size={14} /> {Number(s.actual_hours)} / {Number(s.estimated_hours)} h
                </span>
              </div>
""",
    """              <div className="production-meta">
                <span>{s.assignee_name ?? 'Sem responsável'}</span>
                <span>
                  <Clock size={14} /> {Number(s.actual_hours)} / {Number(s.estimated_hours)} h
                </span>
              </div>
              <small>
                {Number(s.actual_hours) > 0
                  ? `Diferença ${Number(s.actual_hours) - Number(s.estimated_hours) >= 0 ? '+' : ''}${(
                      Number(s.actual_hours) - Number(s.estimated_hours)
                    ).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`
                  : 'Aguardando apontamento de horas reais'}
              </small>
""",
)

pricing_test = 'backend/test/pricing.test.ts'
replace_once(
    pricing_test,
    """  type ResolvedManufacturingJob,
} from '../src/modules/pricing.js';
""",
    """  resolveLaborEstimate,
  type ResolvedManufacturingJob,
} from '../src/modules/pricing.js';
""",
)
replace_once(
    pricing_test,
    """test('modelagem é custo único do lote e pintura/acabamento escalam com quantidade', () => {
""",
    """test('estimativa assistida soma componentes e aplica PERT no servidor', () => {
  const assisted = pricingInputSchema.parse({
    ...input,
    laborEstimates: {
      finishing: {
        mode: 'COMPONENTS',
        components: [
          { label: 'Lixamento', hours: 0.75 },
          { label: 'Correções', hours: 1.25 },
        ],
      },
      painting: { mode: 'PERT', optimistic: 5, mostLikely: 7, pessimistic: 10 },
      modeling: { mode: 'DIRECT', hours: 2 },
    },
  });
  const result = calculate(assisted, policy, 'COMMERCIAL', 2, [job]);
  assert.equal(result.laborEstimates.finishing.hours, 2);
  assert.equal(result.laborEstimates.painting.hours, 7.17);
  assert.equal(result.laborEstimates.modeling.hours, 2);
  assert.equal(result.input.paintingHours, 7.17);
  assert.equal(result.batchBreakdown.finishing, 12000);
  assert.equal(result.batchBreakdown.painting, 57360);
  assert.equal(result.batchBreakdown.modeling, 10000);
  assert.equal(
    resolveLaborEstimate({ mode: 'PERT', optimistic: 5, mostLikely: 7, pessimistic: 10 }).hours,
    7.17,
  );
  assert.throws(() =>
    pricingInputSchema.parse({
      ...input,
      laborEstimates: {
        painting: { mode: 'PERT', optimistic: 8, mostLikely: 4, pessimistic: 6 },
      },
    }),
  );
});

test('modelagem é custo único do lote e pintura/acabamento escalam com quantidade', () => {
""",
)

integration = 'backend/test/integration.test.ts'
replace_once(
    integration,
    """      finishingHours: 1,
      paintingHours: 2,
      consumables: 8,
""",
    """      laborEstimates: {
        finishing: {
          mode: 'COMPONENTS',
          components: [
            { label: 'Lixamento', hours: 0.5 },
            { label: 'Correções', hours: 0.5 },
          ],
        },
        painting: { mode: 'PERT', optimistic: 1, mostLikely: 2, pessimistic: 4 },
        modeling: { mode: 'DIRECT', hours: 0.5 },
      },
      consumables: 8,
""",
)
replace_once(
    integration,
    """    assert.equal(job?.output_quantity, 2);
    assert.equal(job?.estimated_minutes, 240);

    await call(
""",
    """    assert.equal(job?.output_quantity, 2);
    assert.equal(job?.estimated_minutes, 240);
    const [paintingStep] = await db.query(
      \"SELECT id,status,position,version,estimated_hours FROM relic.production_steps WHERE order_id=$1 AND stage='PAINTING'\",
      [order.id],
    );
    assert.equal(Number(paintingStep?.estimated_hours), 4.34);
    const tamperedEstimate = await call(
      'PATCH',
      `/api/production/${paintingStep!.id}`,
      {
        version: paintingStep!.version,
        status: paintingStep!.status,
        assignedTo: null,
        estimatedHours: Number(paintingStep!.estimated_hours) + 1,
        actualHours: 0,
        notes: '',
        position: paintingStep!.position,
      },
      422,
    );
    assert.match(tamperedEstimate.error, /baseline/);

    await call(
""",
)

readme = 'README.md'
replace_once(
    readme,
    "A estrutura `manufacturing_jobs` representa jobs físicos vinculados a itens de pedidos, com impressora, material, quantidade produzida, material e tempo estimados/reais. A criação automática desses jobs será integrada à calculadora e aos pedidos na próxima etapa.\n",
    "A estrutura `manufacturing_jobs` representa jobs físicos vinculados a itens de pedidos, com impressora, material, quantidade produzida, material e tempo estimados/reais. Novos pedidos materializam automaticamente os jobs aprovados no orçamento.\n",
)
replace_once(
    readme,
    """## Próxima evolução

A próxima fase funcional será a estimativa assistida de pintura, acabamento e modelagem, comparando horas previstas e reais sem alterar automaticamente o preço de orçamentos já aprovados.
""",
    """## Estimativa assistida de trabalho

Acabamento, pintura e modelagem podem ser estimados de três formas: horas diretas, soma de etapas ou três pontos PERT (`(O + 4M + P) / 6`). Os componentes e premissas ficam preservados no snapshot do orçamento.

Acabamento e pintura permanecem por unidade; modelagem continua sendo um custo único do lote. Ao gerar o pedido, as horas efetivas aprovadas alimentam as etapas de produção como baseline. A produção registra horas reais separadamente e mostra a diferença previsto × realizado; alterar horas reais nunca reabre nem recalcula o preço comercial aprovado.

As horas previstas não podem ser sobrescritas pela tela operacional. Uma futura necessidade de replanejamento deve ter um conceito separado da baseline comercial, preservando o histórico original.

## Próxima evolução

A próxima fase funcional será consolidar produção e custo realizado, usando jobs e horas reais para analisar desvios sem modificar retroativamente orçamentos aprovados.
""",
)
