from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))


manufacturing = 'backend/src/modules/manufacturing.ts'
replace_once(
    manufacturing,
    "import { z } from 'zod';\n",
    "import { z } from 'zod';\nimport { Decimal } from 'decimal.js';\n",
)
replace_once(
    manufacturing,
    """function redactMaterial(row: Row, role: string) {
  if (role !== 'TEAM') return row;
  const safe = { ...row };
  delete safe.package_price_cents;
  delete safe.unit_cost_cents;
  return safe;
}

const printerSelect = `
""",
    """function redactMaterial(row: Row, role: string) {
  if (role !== 'TEAM') return row;
  const safe = { ...row };
  delete safe.package_price_cents;
  delete safe.unit_cost_cents;
  return safe;
}

const moneyRound = (value: Decimal.Value) =>
  new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export function calculateActualManufacturingCost(row: Row) {
  const cost = row.snapshot?.snapshot ?? {};
  const materialAmount =
    row.actual_material_amount === null || row.actual_material_amount === undefined
      ? 0
      : Number(row.actual_material_amount);
  const actualMinutes =
    row.actual_minutes === null || row.actual_minutes === undefined ? 0 : Number(row.actual_minutes);
  const hours = new Decimal(actualMinutes).div(60);
  const packageQuantity = Number(cost.packageQuantity ?? 0);
  const packagePriceCents = Number(cost.packagePriceCents ?? 0);
  const machineHourlyCents = Number(cost.machineHourlyCents ?? 0);
  const maintenanceReservePercent = Number(cost.maintenanceReservePercent ?? 0);
  const averagePowerWatts = cost.averagePowerWatts == null ? null : Number(cost.averagePowerWatts);
  const electricityKwh = Number(cost.electricityKwh ?? 0);
  const materialCents =
    packageQuantity > 0
      ? moneyRound(new Decimal(materialAmount).mul(packagePriceCents).div(packageQuantity))
      : 0;
  const machineCents = moneyRound(hours.mul(machineHourlyCents));
  const maintenanceCents = moneyRound(
    new Decimal(machineCents).mul(maintenanceReservePercent).div(100),
  );
  const energyCents = averagePowerWatts
    ? moneyRound(hours.mul(averagePowerWatts).div(1000).mul(electricityKwh).mul(100))
    : 0;
  return {
    materialCents,
    machineCents,
    maintenanceCents,
    energyCents,
    totalCents: materialCents + machineCents + maintenanceCents + energyCents,
  };
}

const printerSelect = `
""",
)
replace_once(
    manufacturing,
    """  app.get('/api/manufacturing/jobs', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL', 'TEAM');
""",
    """  app.get('/api/manufacturing/jobs', async (req) => {
    roles(req, 'ADMIN', 'COMMERCIAL', 'TEAM');
""",
)
replace_once(
    manufacturing,
    """    return db.query(
      `SELECT j.id,j.order_item_id,j.printer_id,j.material_id,j.technology_code,j.position,
              j.status,j.output_quantity,j.estimated_material_amount,j.actual_material_amount,
              j.estimated_minutes,j.actual_minutes,j.notes,j.started_at,j.completed_at,
              j.version,j.created_at,j.updated_at,
              o.id AS order_id,o.code AS order_code,
              i.snapshot->>'description' AS item_description,
              p.name AS printer_name,m.name AS material_name
         FROM relic.manufacturing_jobs j
         JOIN relic.order_items i ON i.id=j.order_item_id
         JOIN relic.orders o ON o.id=i.order_id
         JOIN relic.printers p ON p.id=j.printer_id
         JOIN relic.materials m ON m.id=j.material_id
         ${where}
        ORDER BY o.created_at DESC,j.position
        LIMIT 500`,
      values,
    );
  });
}
""",
    """    return db.query(
      `SELECT j.id,j.order_item_id,j.printer_id,j.material_id,j.technology_code,j.position,
              j.status,j.output_quantity,j.estimated_material_amount,j.actual_material_amount,
              j.estimated_minutes,j.actual_minutes,j.notes,j.started_at,j.completed_at,
              j.version,j.created_at,j.updated_at,
              o.id AS order_id,o.code AS order_code,
              i.snapshot->>'description' AS item_description,
              p.name AS printer_name,m.name AS material_name,m.unit AS material_unit
         FROM relic.manufacturing_jobs j
         JOIN relic.order_items i ON i.id=j.order_item_id
         JOIN relic.orders o ON o.id=i.order_id
         JOIN relic.printers p ON p.id=j.printer_id
         JOIN relic.materials m ON m.id=j.material_id
         ${where}
        ORDER BY o.created_at DESC,j.position
        LIMIT 500`,
      values,
    );
  });

  app.patch('/api/manufacturing/jobs/:id', async (req) => {
    roles(req, 'ADMIN', 'TEAM');
    const id = getId(req.params);
    const b = z
      .object({
        version: z.number().int().positive(),
        status: z.enum(['PLANNED', 'READY', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
        actualMaterialAmount: z.number().min(0).max(100000000).nullable(),
        actualMinutes: z.number().int().min(0).max(100000000).nullable(),
        notes: z.string().max(4000).default(''),
      })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const [job] = await tx.query(
        `SELECT j.*,i.order_id
           FROM relic.manufacturing_jobs j
           JOIN relic.order_items i ON i.id=j.order_item_id
          WHERE j.id=$1 FOR UPDATE`,
        [id],
      );
      ensure(job, 'Job de fabricação não encontrado.', 404);
      ensure(job.version === b.version, 'O job mudou. Atualize a página antes de salvar.', 409);
      ensure(
        !['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status),
        'Job encerrado não pode ser alterado.',
      );
      const [order] = await tx.query('SELECT status FROM relic.orders WHERE id=$1 FOR UPDATE', [
        job.order_id,
      ]);
      ensure(order && !['DELIVERED', 'CANCELLED'].includes(order.status), 'Pedido encerrado.');
      if (b.status !== job.status) {
        const transitions: Record<string, string[]> = {
          PLANNED: ['READY', 'CANCELLED'],
          READY: ['RUNNING', 'CANCELLED'],
          RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
        };
        ensure(transitions[job.status]?.includes(b.status), 'Transição do job não permitida.');
      }
      if (b.status === 'CANCELLED') roles(req, 'ADMIN');
      if (['RUNNING', 'COMPLETED', 'FAILED'].includes(b.status))
        ensure(order.status === 'IN_PRODUCTION', 'Inicie a produção do pedido antes do job.');
      if (['COMPLETED', 'FAILED'].includes(b.status)) {
        ensure(
          b.actualMaterialAmount !== null && b.actualMinutes !== null,
          'Informe material e tempo reais antes de encerrar o job.',
        );
      }
      const [updated] = await tx.query(
        `UPDATE relic.manufacturing_jobs SET
           status=$1,actual_material_amount=$2,actual_minutes=$3,notes=$4,
           started_at=CASE WHEN $1 IN ('RUNNING','COMPLETED','FAILED') THEN coalesce(started_at,now()) ELSE started_at END,
           completed_at=CASE WHEN $1 IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE completed_at END
         WHERE id=$5 RETURNING *`,
        [b.status, b.actualMaterialAmount, b.actualMinutes, b.notes, id],
      );
      const actualCost = calculateActualManufacturingCost(updated!);
      await audit(tx, req.user!.id, 'MANUFACTURING_JOB_UPDATED', 'manufacturing_jobs', id, {
        from: job.status,
        to: b.status,
        estimatedMaterialAmount: Number(job.estimated_material_amount),
        actualMaterialAmount: b.actualMaterialAmount,
        estimatedMinutes: Number(job.estimated_minutes),
        actualMinutes: b.actualMinutes,
        actualCostCents: actualCost.totalCents,
      });
      const [result] = await tx.query(
        `SELECT j.id,j.order_item_id,j.printer_id,j.material_id,j.technology_code,j.position,
                j.status,j.output_quantity,j.estimated_material_amount,j.actual_material_amount,
                j.estimated_minutes,j.actual_minutes,j.notes,j.started_at,j.completed_at,
                j.version,j.created_at,j.updated_at,p.name AS printer_name,m.name AS material_name,
                m.unit AS material_unit
           FROM relic.manufacturing_jobs j
           JOIN relic.printers p ON p.id=j.printer_id
           JOIN relic.materials m ON m.id=j.material_id
          WHERE j.id=$1`,
        [id],
      );
      return result;
    });
  });
}
""",
)

orders = 'backend/src/modules/orders.ts'
replace_once(
    orders,
    "import { getId, uuid } from './catalog.js';\n",
    "import { getId, uuid } from './catalog.js';\nimport { calculateActualManufacturingCost } from './manufacturing.js';\n",
)
replace_once(
    orders,
    """const teamOrder = (order: Row) => ({
  id: order.id,
""",
    """const teamOrder = (order: Row) => ({
  id: order.id,
""",
)
replace_once(
    orders,
    """});
export async function orderDetail(db: Sql, id: string, financial = true) {
  const [o] = await db.query('SELECT * FROM relic.orders WHERE id=$1', [id]);
""",
    """});

const centsFromHours = (hours: number, hourlyReais: number) =>
  Math.round(hours * hourlyReais * 100);

function laborRate(stage: string, policy: Row) {
  if (stage === 'PRINTING') return 0;
  if (stage === 'PREPARATION') return Number(policy.modelingHourly ?? 0);
  if (['PRIMING', 'PAINTING'].includes(stage)) return Number(policy.paintingHourly ?? 0);
  return Number(policy.finishingHourly ?? 0);
}

function buildCostReport(order: Row, items: Row[], steps: Row[], jobs: Row[]) {
  const policy = order.commercial_snapshot?.policy?.settings ?? {};
  const overheadPercent = Number(policy.overheadPercent ?? 0);
  const reports = items.map((item) => {
    const calculation = item.snapshot?.calculation ?? {};
    const breakdown = calculation.batchBreakdown ?? {};
    const itemJobs = jobs.filter((job) => job.order_item_id === item.id);
    const itemSteps = steps.filter((step) => step.order_item_id === item.id);
    const manufacturing = itemJobs.reduce(
      (sum, job) => sum + calculateActualManufacturingCost(job).totalCents,
      0,
    );
    const labor = itemSteps.reduce(
      (sum, step) =>
        sum + centsFromHours(Number(step.actual_hours ?? 0), laborRate(step.stage, policy)),
      0,
    );
    const complementary =
      Number(breakdown.consumables ?? 0) +
      Number(breakdown.packaging ?? 0) +
      Number(breakdown.extras ?? 0);
    const direct = manufacturing + labor + complementary;
    const overhead = Math.round((direct * overheadPercent) / 100);
    const actual = direct + overhead;
    const estimated = Number(calculation.batchCostCents ?? 0);
    return {
      orderItemId: item.id,
      description: item.snapshot?.description ?? '',
      estimatedCostCents: estimated,
      actualCostCents: actual,
      varianceCents: actual - estimated,
      manufacturingActualCents: manufacturing,
      laborActualCents: labor,
      complementaryQuotedCents: complementary,
      overheadActualCents: overhead,
      jobsCompleted: itemJobs.filter((job) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status))
        .length,
      jobsTotal: itemJobs.length,
      stepsCompleted: itemSteps.filter((step) => ['COMPLETED', 'CANCELLED'].includes(step.status)).length,
      stepsTotal: itemSteps.length,
    };
  });
  const actualCostCents = reports.reduce((sum, item) => sum + item.actualCostCents, 0);
  const estimatedCostCents = Number(order.cost_cents ?? 0);
  const subtotalCents = Number(order.commercial_snapshot?.subtotalCents ?? order.total_cents ?? 0);
  return {
    isFinal: order.status === 'DELIVERED',
    estimatedCostCents,
    actualCostCents,
    varianceCents: actualCostCents - estimatedCostCents,
    actualProfitCents: subtotalCents - actualCostCents,
    subtotalCents,
    items: reports,
    note: 'Material e tempo reais vêm dos jobs; horas reais vêm da produção. Consumíveis, embalagem e extras permanecem pelos valores aprovados até existir apontamento específico. A reserva de impressão não é tratada como gasto realizado.',
  };
}

export async function orderDetail(db: Sql, id: string, financial = true) {
  const [o] = await db.query('SELECT * FROM relic.orders WHERE id=$1', [id]);
""",
)
replace_once(
    orders,
    """  const items = await db.query(
    "SELECT * FROM relic.order_items WHERE order_id=$1 ORDER BY (snapshot->>'position')::integer",
    [id],
  );
  if (!financial)
    return {
      ...teamOrder(o!),
      items: items.map((item) => ({ ...item, snapshot: operationalSnapshot(item.snapshot) })),
      steps: steps.map((step) => ({ ...step, snapshot: operationalSnapshot(step.snapshot) })),
      payments: [],
    };
""",
    """  const items = await db.query(
    "SELECT * FROM relic.order_items WHERE order_id=$1 ORDER BY (snapshot->>'position')::integer",
    [id],
  );
  const jobs = await db.query(
    `SELECT j.*,p.name AS printer_name,m.name AS material_name,m.unit AS material_unit
       FROM relic.manufacturing_jobs j
       JOIN relic.order_items i ON i.id=j.order_item_id
       JOIN relic.printers p ON p.id=j.printer_id
       JOIN relic.materials m ON m.id=j.material_id
      WHERE i.order_id=$1
      ORDER BY (i.snapshot->>'position')::integer,j.position`,
    [id],
  );
  const operationalJobs = jobs.map(({ snapshot: _snapshot, created_by: _createdBy, ...job }) => job);
  if (!financial)
    return {
      ...teamOrder(o!),
      items: items.map((item) => ({ ...item, snapshot: operationalSnapshot(item.snapshot) })),
      steps: steps.map((step) => ({ ...step, snapshot: operationalSnapshot(step.snapshot) })),
      manufacturing_jobs: operationalJobs,
      payments: [],
    };
""",
)
replace_once(
    orders,
    """    pending_cents: Math.max(0, o.total_cents - paid),
    deposit_pending_cents: Math.max(0, o.deposit_cents - paid),
    items,
    steps,
    payments: await db.query(
""",
    """    pending_cents: Math.max(0, o.total_cents - paid),
    deposit_pending_cents: Math.max(0, o.deposit_cents - paid),
    items,
    steps,
    manufacturing_jobs: operationalJobs,
    cost_report: buildCostReport(o!, items, steps, jobs),
    payments: await db.query(
""",
)

frontend = 'frontend/src/pages/Operations.tsx'
replace_once(
    frontend,
    """function PaymentRows({ payments, onChange }: { payments: Row[]; onChange: () => Promise<void> }) {
""",
    """function PaymentRows({ payments, onChange }: { payments: Row[]; onChange: () => Promise<void> }) {
""",
)
replace_once(
    frontend,
    """}
export function StepEditor({
""",
    """}

const jobStatusLabels: Record<string, string> = {
  PLANNED: 'Planejado',
  READY: 'Pronto para imprimir',
  RUNNING: 'Imprimindo',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
};

function JobEditor({
  job,
  onClose,
  onSaved,
}: {
  job: Row;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState(job.status),
    [actualMaterial, setActualMaterial] = useState(
      job.actual_material_amount == null ? '' : String(job.actual_material_amount),
    ),
    [actualHours, setActualHours] = useState(
      job.actual_minutes == null ? '' : String(Number(job.actual_minutes) / 60),
    ),
    [notes, setNotes] = useState(job.notes ?? '');
  const action = useAction();
  const transitions: Record<string, string[]> = {
    PLANNED: ['READY', 'CANCELLED'],
    READY: ['RUNNING', 'CANCELLED'],
    RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  };
  const statuses = [job.status, ...(transitions[job.status] ?? [])].filter(
    (value) => value !== 'CANCELLED' || user!.role === 'ADMIN',
  );
  const closing = ['COMPLETED', 'FAILED'].includes(status);
  return (
    <Modal title={`Job ${job.position} · ${job.printer_name}`} onClose={onClose}>
      <Form
        className="modal-body"
        onSubmit={() =>
          void action.run(async () => {
            await api(
              `/manufacturing/jobs/${job.id}`,
              send('PATCH', {
                version: job.version,
                status,
                actualMaterialAmount: actualMaterial === '' ? null : num(actualMaterial),
                actualMinutes: actualHours === '' ? null : Math.round(num(actualHours) * 60),
                notes,
              }),
            );
            await onSaved();
            onClose();
          })
        }
      >
        <p className="muted">
          {job.material_name} · previsto {Number(job.estimated_material_amount).toLocaleString('pt-BR')} {job.material_unit} · {(Number(job.estimated_minutes) / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h
        </p>
        <div className="form-grid">
          <Field label="Status do job">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((value) => (
                <option value={value} key={value}>
                  {jobStatusLabels[value] ?? value}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Material real (${job.material_unit})`}>
            <input
              required={closing}
              type="number"
              min="0"
              step="0.001"
              value={actualMaterial}
              onChange={(e) => setActualMaterial(e.target.value)}
            />
          </Field>
          <Field label="Tempo real (h)">
            <input
              required={closing}
              type="number"
              min="0"
              step="0.01"
              value={actualHours}
              onChange={(e) => setActualHours(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Observações do job">
          <textarea maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="fine-print">
          Ao concluir ou registrar falha, material e tempo reais tornam-se obrigatórios e alimentam o custo realizado. A reserva comercial do orçamento não é contabilizada como gasto real.
        </p>
        <Feedback action={action} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <Button className="primary" busy={action.busy}>Salvar job</Button>
        </div>
      </Form>
    </Modal>
  );
}

export function StepEditor({
""",
)
replace_once(
    frontend,
    """  const [pay, setPay] = useState(false),
    [step, setStep] = useState<Row | null>(null),
    [cancel, setCancel] = useState(false),
""",
    """  const [pay, setPay] = useState(false),
    [step, setStep] = useState<Row | null>(null),
    [job, setJob] = useState<Row | null>(null),
    [cancel, setCancel] = useState(false),
""",
)
replace_once(
    frontend,
    """      <section className="panel order-actions">
""",
    """      {commercial && o.cost_report && (
        <>
          <div className="metrics three-metrics">
            <Metric
              label="Custo previsto"
              value={money(o.cost_report.estimatedCostCents)}
              detail="Baseline aprovada no orçamento"
            />
            <Metric
              label={o.cost_report.isFinal ? 'Custo realizado' : 'Custo realizado até agora'}
              value={money(o.cost_report.actualCostCents)}
              detail={`Variação ${o.cost_report.varianceCents >= 0 ? '+' : '−'} ${money(Math.abs(o.cost_report.varianceCents))}`}
              accent
            />
            <Metric
              label="Resultado sobre as peças"
              value={money(o.cost_report.actualProfitCents)}
              detail={o.cost_report.isFinal ? 'Lucro realizado antes do frete' : 'Parcial enquanto a produção está aberta'}
            />
          </div>
          <p className="fine-print">{o.cost_report.note}</p>
        </>
      )}
      <section className="panel order-actions">
""",
)
replace_once(
    frontend,
    """          <div className="steps-list">
            {o.steps
""",
    """          {(o.manufacturing_jobs ?? []).some((job: Row) => job.order_item_id === item.id) && (
            <>
              <h3>Jobs de impressão</h3>
              <div className="steps-list">
                {(o.manufacturing_jobs ?? [])
                  .filter((job: Row) => job.order_item_id === item.id)
                  .map((printJob: Row) => (
                    <div className={`step-row ${printJob.status === 'COMPLETED' ? 'done' : ''}`} key={printJob.id}>
                      <span className="step-number">{printJob.position}</span>
                      <div className="step-description">
                        <strong>{printJob.printer_name} · {printJob.material_name}</strong>
                        <small>
                          Previsto: {Number(printJob.estimated_material_amount).toLocaleString('pt-BR')} {printJob.material_unit} · {(Number(printJob.estimated_minutes) / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h
                        </small>
                        {(printJob.actual_material_amount != null || printJob.actual_minutes != null) && (
                          <small>
                            Real: {printJob.actual_material_amount == null ? '—' : `${Number(printJob.actual_material_amount).toLocaleString('pt-BR')} ${printJob.material_unit}`} · {printJob.actual_minutes == null ? '—' : `${(Number(printJob.actual_minutes) / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`}
                          </small>
                        )}
                        {printJob.notes && <small className="preserve">{printJob.notes}</small>}
                      </div>
                      <span className="count">{jobStatusLabels[printJob.status] ?? printJob.status}</span>
                      {(user!.role === 'ADMIN' || user!.role === 'TEAM') &&
                        !['COMPLETED', 'FAILED', 'CANCELLED'].includes(printJob.status) && (
                          <button className="small" onClick={() => setJob(printJob)}>Atualizar job</button>
                        )}
                    </div>
                  ))}
              </div>
            </>
          )}
          <h3>Etapas de produção</h3>
          <div className="steps-list">
            {o.steps
""",
)
replace_once(
    frontend,
    """      {pay && <PaymentForm order={o} onClose={() => setPay(false)} onSaved={reload} />}{' '}
      {step && <StepEditor step={step} onClose={() => setStep(null)} onSaved={reload} />}{' '}
""",
    """      {pay && <PaymentForm order={o} onClose={() => setPay(false)} onSaved={reload} />}{' '}
      {job && <JobEditor job={job} onClose={() => setJob(null)} onSaved={reload} />}{' '}
      {step && <StepEditor step={step} onClose={() => setStep(null)} onSaved={reload} />}{' '}
""",
)

integration = 'backend/test/integration.test.ts'
replace_once(
    integration,
    """    const [job] = await db.query(
      'SELECT output_quantity,estimated_minutes FROM relic.manufacturing_jobs WHERE order_item_id IN (SELECT id FROM relic.order_items WHERE order_id=$1)',
      [order.id],
    );
""",
    """    const [job] = await db.query(
      'SELECT id,status,version,output_quantity,estimated_minutes FROM relic.manufacturing_jobs WHERE order_item_id IN (SELECT id FROM relic.order_items WHERE order_id=$1)',
      [order.id],
    );
""",
)
replace_once(
    integration,
    """    const detail = await call('GET', `/api/orders/${order.id}`);
    assert.equal(detail.status, 'CONFIRMED');
    assert.equal(detail.received_cents, order.deposit_cents);
""",
    """    let detail = await call('GET', `/api/orders/${order.id}`);
    assert.equal(detail.status, 'CONFIRMED');
    assert.equal(detail.received_cents, order.deposit_cents);
    await call('PATCH', `/api/orders/${order.id}/status`, {
      status: 'IN_PRODUCTION',
      version: detail.version,
      reason: '',
    });

    let jobState = (await call('GET', `/api/manufacturing/jobs?orderId=${order.id}`))[0];
    jobState = await call('PATCH', `/api/manufacturing/jobs/${job!.id}`, {
      version: jobState.version,
      status: 'READY',
      actualMaterialAmount: null,
      actualMinutes: null,
      notes: '',
    });
    jobState = await call('PATCH', `/api/manufacturing/jobs/${job!.id}`, {
      version: jobState.version,
      status: 'RUNNING',
      actualMaterialAmount: 105,
      actualMinutes: 250,
      notes: 'Job em execução',
    });
    jobState = await call('PATCH', `/api/manufacturing/jobs/${job!.id}`, {
      version: jobState.version,
      status: 'COMPLETED',
      actualMaterialAmount: 110,
      actualMinutes: 270,
      notes: 'Job concluído',
    });
    assert.equal(jobState.status, 'COMPLETED');

    detail = await call('GET', `/api/orders/${order.id}`);
    let preparation = detail.steps.find((step: any) => step.stage === 'PREPARATION');
    preparation = await call('PATCH', `/api/production/${preparation.id}`, {
      version: preparation.version,
      status: 'IN_PROGRESS',
      assignedTo: null,
      estimatedHours: Number(preparation.estimated_hours),
      actualHours: 0.5,
      notes: '',
      position: preparation.position,
    });
    preparation = await call('PATCH', `/api/production/${preparation.id}`, {
      version: preparation.version,
      status: 'COMPLETED',
      assignedTo: null,
      estimatedHours: Number(preparation.estimated_hours),
      actualHours: 0.75,
      notes: 'Modelagem concluída',
      position: preparation.position,
    });
    assert.equal(preparation.status, 'COMPLETED');

    detail = await call('GET', `/api/orders/${order.id}`);
    assert(detail.cost_report.actualCostCents > 0);
    assert(detail.cost_report.items[0].manufacturingActualCents > 0);
    assert(detail.cost_report.items[0].laborActualCents > 0);
    assert.equal(detail.manufacturing_jobs[0].status, 'COMPLETED');
    assert.equal(detail.manufacturing_jobs[0].snapshot, undefined);
""",
)

readme = 'README.md'
replace_once(
    readme,
    """## Próxima evolução

A próxima fase funcional será consolidar produção e custo realizado, usando jobs e horas reais para analisar desvios sem modificar retroativamente orçamentos aprovados.""",
    """## Custo realizado

Jobs de fabricação registram material e tempo reais. Ao concluir ou registrar falha, ambos são obrigatórios. O custo realizado usa o snapshot comercial do próprio job para material, máquina, manutenção e energia, preservando os preços e parâmetros existentes quando o orçamento foi aprovado.

Horas reais das etapas são convertidas em custo pelo snapshot da política do pedido: preparação/modelagem usa modelagem, primer/pintura usa pintura e as demais atividades manuais usam produção/acabamento. Tempo de impressão não é contado novamente como mão de obra.

O pedido apresenta custo previsto × realizado, variação e resultado sobre as peças. Consumíveis, embalagem e extras permanecem pelos valores aprovados até existir apontamento específico. A reserva de impressão continua sendo proteção comercial do orçamento e não é registrada como gasto realizado. Nenhum desvio operacional altera retroativamente o preço vendido.

## Próxima evolução

A próxima fase funcional será aplicar a identidade visual oficial da Relic em login, aplicação e documentos, removendo a identidade provisória existente.""",
)
