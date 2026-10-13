import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Play,
  Check,
  PackageCheck,
  Wallet,
  Clock,
  Edit3,
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
  Modal,
  Feedback,
  Loading,
  ErrorBox,
  Empty,
  Badge,
  Metric,
  money,
  date,
  num,
  labels,
  type Row,
} from '../lib';
import { FileLinks } from '../components/FileLinks';
export function Orders() {
  const { data, error, loading } = useData<Row[]>('/orders');
  const { user } = useAuth();
  const commercial = user!.role !== 'TEAM';
  const [filter, setFilter] = useState('ACTIVE');
  const rows = data?.filter(
    (o) => filter === 'ALL' || !['DELIVERED', 'CANCELLED'].includes(o.status),
  );
  return (
    <>
      <Header
        eyebrow="DA APROVAÇÃO À ENTREGA"
        title="Pedidos"
        subtitle="Acompanhe cada encomenda, seus prazos e compromissos."
      />
      <div className="toolbar">
        <div className="tabs">
          <button
            className={filter === 'ACTIVE' ? 'active' : ''}
            onClick={() => setFilter('ACTIVE')}
          >
            Em aberto
          </button>
          <button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>
            Todos os pedidos
          </button>
        </div>
        <span className="count">{rows?.length ?? 0} pedidos</span>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        <section className="panel flush">
          {!rows?.length ? (
            <Empty
              title="Novas histórias estão por vir"
              text="Os pedidos nascem de orçamentos aprovados."
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido / cliente</th>
                    <th>Situação</th>
                    <th>Previsão</th>
                    {commercial && <th>Total / recebido</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="row-title" to={`/orders/${o.id}`}>
                          {o.code}
                          <small>{o.client_snapshot.name}</small>
                        </Link>
                      </td>
                      <td>
                        <Badge status={o.status} />
                      </td>
                      <td>{date(o.due_date)}</td>
                      {commercial && (
                        <td className="money">
                          {money(o.total_cents)}
                          <small>{money(o.received_cents)} recebido</small>
                        </td>
                      )}
                      <td>
                        <Link
                          className="icon-button"
                          to={`/orders/${o.id}`}
                          aria-label={`Abrir ${o.code}`}
                        >
                          <ArrowUpRight size={19} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
export function PaymentForm({
  order,
  orders,
  onClose,
  onSaved,
}: {
  order?: Row;
  orders?: Row[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [orderId, setOrderId] = useState(order?.id ?? ''),
    [kind, setKind] = useState(order?.deposit_pending_cents > 0 ? 'DEPOSIT' : 'BALANCE'),
    [method, setMethod] = useState('PIX'),
    [status, setStatus] = useState('RECEIVED'),
    [amount, setAmount] = useState(
      order ? Math.max(0, order.deposit_pending_cents || order.pending_cents) / 100 : 0,
    ),
    [reference, setReference] = useState(''),
    [notes, setNotes] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const action = useAction();
  return (
    <Modal title="Registrar pagamento" onClose={onClose}>
      <Form
        className="modal-body"
        onSubmit={() =>
          void action.run(async () => {
            await api(
              '/payments',
              send('POST', {
                orderId,
                kind,
                method,
                status,
                amountCents: Math.round(amount * 100),
                reference,
                notes,
                idempotencyKey: key,
              }),
            );
            await onSaved();
            onClose();
          })
        }
      >
        {order ? (
          <div className="callout">
            <strong>
              {order.code} · {order.client_snapshot.name}
            </strong>
            <p>
              Total {money(order.total_cents)} · Recebido {money(order.received_cents)} · Pendente{' '}
              {money(order.pending_cents)}
            </p>
          </div>
        ) : (
          <Field label="Pedido">
            <select
              required
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                const o = orders?.find((o) => o.id === e.target.value);
                if (o) {
                  setAmount(Math.max(0, o.pending_cents) / 100);
                  setKind(o.received_cents < o.deposit_cents ? 'DEPOSIT' : 'BALANCE');
                }
              }}
            >
              <option value="">Selecione o pedido</option>
              {orders?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.client_snapshot.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="form-grid">
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {[
                'DEPOSIT',
                'BALANCE',
                'ADDITIONAL',
                ...(user!.role === 'ADMIN' ? ['REFUND'] : []),
              ].map((k) => (
                <option value={k} key={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Método">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {['PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER'].map((k) => (
                <option value={k} key={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor (R$)">
            <input
              required
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(num(e.target.value))}
            />
          </Field>
          <Field label="Situação">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="RECEIVED">Recebido / efetivado</option>
              <option value="PENDING">Pendente / previsto</option>
            </select>
          </Field>
        </div>
        <Field label="Referência / comprovante">
          <input maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label={kind === 'REFUND' ? 'Justificativa do estorno *' : 'Observações'}>
          <textarea
            required={kind === 'REFUND'}
            minLength={kind === 'REFUND' ? 8 : undefined}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <p className="fine-print">
          Confirme o comprovante antes de registrar como recebido. Estornos reduzem o recebido
          líquido e ficam na auditoria.
        </p>
        <Feedback action={action} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <Button busy={action.busy} className="primary">
            Salvar pagamento
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
function PaymentRows({ payments, onChange }: { payments: Row[]; onChange: () => Promise<void> }) {
  const action = useAction();
  return (
    <>
      <Feedback action={action} />
      {!payments.length ? (
        <p className="muted">Nenhum pagamento registrado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo / data</th>
                <th>Método</th>
                <th>Valor</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    {labels[p.kind]}
                    <small>{date(p.received_at ?? p.created_at)}</small>
                  </td>
                  <td>{labels[p.method]}</td>
                  <td className={`money ${p.kind === 'REFUND' ? 'negative' : ''}`}>
                    {p.kind === 'REFUND' ? '− ' : ''}
                    {money(p.amount_cents)}
                  </td>
                  <td>
                    <Badge status={p.status} />
                  </td>
                  <td>
                    {p.status === 'PENDING' && (
                      <div className="button-row">
                        <Button
                          className="small"
                          busy={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              await api(`/payments/${p.id}`, send('PATCH', { status: 'RECEIVED' }));
                              await onChange();
                            }, 'Recebimento confirmado.')
                          }
                        >
                          Confirmar
                        </Button>
                        <Button
                          className="small"
                          busy={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              await api(
                                `/payments/${p.id}`,
                                send('PATCH', { status: 'CANCELLED' }),
                              );
                              await onChange();
                            }, 'Pagamento cancelado.')
                          }
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

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
  step,
  onClose,
  onSaved,
}: {
  step: Row;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { user } = useAuth();
  const team = useData<Row[]>('/team');
  const [status, setStatus] = useState(step.status),
    [assignedTo, setAssignedTo] = useState(step.assigned_to ?? ''),
    [estimatedHours] = useState(Number(step.estimated_hours)),
    [actualHours, setActual] = useState(Number(step.actual_hours)),
    [notes, setNotes] = useState(step.notes),
    [position, setPosition] = useState(step.position);
  const action = useAction();
  const transitions: Record<string, string[]> = {
    WAITING: ['READY', 'BLOCKED', 'CANCELLED'],
    READY: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
    IN_PROGRESS: ['PAUSED', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
    PAUSED: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
    BLOCKED: ['READY', 'CANCELLED'],
  };
  const statuses = [step.status, ...(transitions[step.status] ?? [])].filter(
    (s) => s !== 'CANCELLED' || user!.role === 'ADMIN',
  );
  return (
    <Modal title={labels[step.stage] ?? 'Etapa de produção'} onClose={onClose}>
      <Form
        className="modal-body"
        onSubmit={() =>
          void action.run(async () => {
            await api(
              `/production/${step.id}`,
              send('PATCH', {
                version: step.version,
                status,
                assignedTo: assignedTo || null,
                estimatedHours,
                actualHours,
                notes,
                position,
              }),
            );
            await onSaved();
            onClose();
          })
        }
      >
        <p className="muted">
          {step.snapshot?.description} · Etapa {step.position}
        </p>
        <div className="form-grid">
          <Field label="Status da etapa">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Sem responsável</option>
              {team.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Horas previstas"
            hint="Baseline preservada do orçamento. Alterar horas reais não recalcula o preço vendido."
          >
            <input type="number" step="0.01" min="0" value={estimatedHours} readOnly />
          </Field>
          <Field label="Horas reais">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100000"
              value={actualHours}
              onChange={(e) => setActual(num(e.target.value))}
            />
          </Field>
          {user!.role === 'ADMIN' && !step.started_at && (
            <Field
              label="Ordem da etapa"
              hint="Alteração antes do início; troca com a posição escolhida."
            >
              <input
                type="number"
                min="1"
                max="9"
                value={position}
                onChange={(e) => setPosition(num(e.target.value))}
              />
            </Field>
          )}
        </div>
        <Field label="Observações da produção">
          <textarea maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="fine-print">
          Previsto {estimatedHours.toLocaleString('pt-BR')} h · real {actualHours.toLocaleString('pt-BR')} h
          {actualHours > 0
            ? ` · diferença ${(actualHours - estimatedHours) >= 0 ? '+' : ''}${(actualHours - estimatedHours).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`
            : ' · aguardando apontamento real'}.
        </p>
        {step.started_at && (
          <p className="fine-print">
            Iniciada em {date(step.started_at)}. O início e a conclusão são registrados
            automaticamente.
          </p>
        )}
        <ErrorBox error={team.error} />
        <Feedback action={action} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <Button className="primary" busy={action.busy}>
            Salvar etapa
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
export function OrderDetail() {
  const { id } = useParams();
  const { data: o, error, loading, reload } = useData(`/orders/${id}`);
  const { user } = useAuth();
  const [pay, setPay] = useState(false),
    [step, setStep] = useState<Row | null>(null),
    [job, setJob] = useState<Row | null>(null),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(''),
    [editing, setEditing] = useState(false),
    [dueDate, setDueDate] = useState(''),
    [notes, setNotes] = useState('');
  const action = useAction();
  const commercial = user!.role !== 'TEAM';
  if (loading) return <Loading />;
  if (!o) return <ErrorBox error={error} />;
  const complete = o.steps.filter((s: Row) => ['COMPLETED', 'CANCELLED'].includes(s.status)).length;
  const estimatedHours = o.steps.reduce(
    (sum: number, s: Row) => sum + Number(s.estimated_hours || 0),
    0,
  );
  const actualHours = o.steps.reduce((sum: number, s: Row) => sum + Number(s.actual_hours || 0), 0);
  const hoursVariance = actualHours - estimatedHours;
  const change = (status: string) =>
    void action.run(async () => {
      await api(`/orders/${id}/status`, send('PATCH', { status, version: o.version, reason }));
      setCancel(false);
      await reload();
    }, 'Pedido atualizado.');
  return (
    <>
      <Link to="/orders" className="back-link">
        <ArrowLeft size={16} /> Pedidos
      </Link>
      <Header
        eyebrow="CUIDADO EM CADA ETAPA"
        title={o.code}
        subtitle={`${o.client_snapshot.name} · ${o.client_snapshot.email || 'Cliente cadastrado'}`}
        action={
          commercial && (
            <button onClick={() => setPay(true)}>
              <Plus size={17} /> Registrar pagamento
            </button>
          )
        }
      />
      <Feedback action={action} />
      <div className="detail-strip">
        <Badge status={o.status} />
        <span>
          Previsão <b>{date(o.due_date)}</b>
        </span>
        <span>
          Origem <b>{o.commercial_snapshot.quoteCode}</b>
        </span>
        {commercial && !['DELIVERED', 'CANCELLED'].includes(o.status) && (
          <button
            className="text-button"
            onClick={() => {
              setDueDate(o.due_date.slice(0, 10));
              setNotes(o.notes);
              setEditing(true);
            }}
          >
            <Edit3 size={14} /> Ajustar prazo e notas
          </button>
        )}
      </div>
      <div className="metrics">
        {commercial ? (
          <>
            <Metric
              label="Total do pedido"
              value={money(o.total_cents)}
              detail="Peças e frete separados na proposta"
            />
            <Metric
              label="Recebido líquido"
              value={money(o.received_cents)}
              detail={`Entrada prevista: ${money(o.deposit_cents)}`}
            />
            <Metric
              label="Saldo pendente"
              value={money(o.pending_cents)}
              detail="Quitação antes da entrega"
              accent
            />
          </>
        ) : (
          <>
            <Metric label="Previsão" value={date(o.due_date)} detail="Prazo operacional" />
            <Metric label="Horas registradas" value={`${actualHours} h`} detail="Tempo real da equipe" />
          </>
        )}
        <Metric
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
      </div>
      {commercial && o.cost_report && (
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
        <div>
          <h2>
            {o.status === 'WAITING_PAYMENT'
              ? 'Tudo começa com a entrada.'
              : o.status === 'DELIVERED'
                ? 'Uma criação, uma nova história.'
                : 'A criação está tomando forma.'}
          </h2>
          <p>
            {o.status === 'WAITING_PAYMENT'
              ? commercial
                ? `Aguardando ${money(o.deposit_pending_cents)} de entrada para confirmar o pedido.`
                : 'Aguardando a confirmação da entrada pelo Comercial.'
              : o.status === 'DELIVERED'
                ? `Entrega registrada em ${date(o.delivered_at)}.`
                : commercial
                  ? o.commercial_snapshot.paymentTerms
                  : 'Acompanhe e registre o avanço das etapas de produção.'}
          </p>
        </div>
        <div className="button-row">
          {o.status === 'CONFIRMED' && (
            <Button className="primary" busy={action.busy} onClick={() => change('IN_PRODUCTION')}>
              <Play size={17} /> Iniciar produção
            </Button>
          )}
          {o.status === 'IN_PRODUCTION' && (
            <Button
              className="primary"
              busy={action.busy}
              disabled={complete !== o.steps.length}
              onClick={() => change('READY')}
            >
              <PackageCheck size={17} /> Marcar como pronto
            </Button>
          )}
          {o.status === 'READY' && commercial && (
            <Button className="primary" busy={action.busy} onClick={() => change('DELIVERED')}>
              <Check size={17} /> Concluir entrega
            </Button>
          )}
          {commercial && !['DELIVERED', 'CANCELLED'].includes(o.status) && (
            <button className="text-button danger-text" onClick={() => setCancel(true)}>
              Cancelar pedido
            </button>
          )}
        </div>
      </section>
      {o.items.map((item: Row) => (
        <section className="panel" key={item.id}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {item.snapshot.quantity} UNIDADE(S) ·{' '}
                {item.snapshot.scale || 'ESCALA NÃO INFORMADA'}
              </span>
              <h2>{item.snapshot.description}</h2>
            </div>
            {commercial && <span className="count">{money(item.snapshot.total_cents)}</span>}
          </div>
          {(o.manufacturing_jobs ?? []).some((job: Row) => job.order_item_id === item.id) && (
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
              .filter((s: Row) => s.order_item_id === item.id)
              .map((s: Row) => (
                <div className={`step-row ${s.status === 'COMPLETED' ? 'done' : ''}`} key={s.id}>
                  <span className="step-number">
                    {s.status === 'COMPLETED' ? <Check size={16} /> : s.position}
                  </span>
                  <div className="step-description">
                    <strong>{labels[s.stage]}</strong>
                    <small>
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
                    {s.started_at && (
                      <small>
                        Início: {date(s.started_at)}
                        {s.completed_at ? ` · Conclusão: ${date(s.completed_at)}` : ''}
                      </small>
                    )}
                    {s.notes && <small className="preserve">{s.notes}</small>}
                  </div>
                  <Badge status={s.status} />
                  {!['COMPLETED', 'CANCELLED'].includes(s.status) &&
                    !['CANCELLED', 'DELIVERED'].includes(o.status) && (
                      <button
                        className="small"
                        aria-label={`Atualizar ${labels[s.stage]}`}
                        onClick={() => setStep(s)}
                      >
                        Atualizar
                      </button>
                    )}
                </div>
              ))}
          </div>
        </section>
      ))}
      {commercial && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <Wallet size={19} /> Pagamentos
            </h2>
            <button className="text-button" onClick={() => setPay(true)}>
              <Plus size={15} /> Registrar
            </button>
          </div>
          <PaymentRows payments={o.payments} onChange={reload} />
        </section>
      )}
      {o.notes && (
        <section className="panel">
          <h3>Notas do pedido</h3>
          <p className="preserve">{o.notes}</p>
        </section>
      )}
      <FileLinks entity="orderId" id={id!} />
      {pay && <PaymentForm order={o} onClose={() => setPay(false)} onSaved={reload} />}{' '}
      {job && <JobEditor job={job} onClose={() => setJob(null)} onSaved={reload} />}{' '}
      {step && <StepEditor step={step} onClose={() => setStep(null)} onSaved={reload} />}{' '}
      {cancel && (
        <Modal title="Cancelar pedido" onClose={() => setCancel(false)}>
          <Form className="modal-body" onSubmit={() => change('CANCELLED')}>
            <p>
              O pedido permanece no histórico. Valores recebidos precisam ser estornados antes do
              cancelamento.
            </p>
            <Field label="Motivo do cancelamento">
              <textarea
                required
                minLength={8}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Feedback action={action} />
            <Button className="danger-button" busy={action.busy}>
              Confirmar cancelamento
            </Button>
          </Form>
        </Modal>
      )}
      {editing && (
        <Modal title="Prazo e observações" onClose={() => setEditing(false)}>
          <Form
            className="modal-body"
            onSubmit={() =>
              void action.run(async () => {
                await api(`/orders/${id}`, send('PATCH', { version: o.version, dueDate, notes }));
                setEditing(false);
                await reload();
              })
            }
          >
            <Field label="Data prevista">
              <input
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <Field label="Notas do pedido">
              <textarea value={notes} maxLength={6000} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Feedback action={action} />
            <Button className="primary" busy={action.busy}>
              Salvar ajustes
            </Button>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Production() {
  const { data, error, loading, reload } = useData<Row[]>('/production');
  const { user } = useAuth();
  const canEdit = user!.role === 'ADMIN' || user!.role === 'TEAM';
  const [filter, setFilter] = useState('ACTION'),
    [step, setStep] = useState<Row | null>(null);
  const rows = data?.filter(
    (s) => filter === 'ALL' || ['READY', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'].includes(s.status),
  );
  return (
    <>
      <Header
        eyebrow="NO RITMO DO ATELIÊ"
        title="Produção"
        subtitle="Responsáveis, horas e progresso de cada peça."
      />
      <div className="toolbar">
        <div className="tabs">
          <button
            className={filter === 'ACTION' ? 'active' : ''}
            onClick={() => setFilter('ACTION')}
          >
            Em foco
          </button>
          <button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>
            Todas as etapas ativas
          </button>
        </div>
        <span className="count">{rows?.length ?? 0} etapas</span>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : !rows?.length ? (
        <section className="panel">
          <Empty
            title="A bancada está livre"
            text="Etapas aparecem quando um orçamento aprovado vira pedido."
          />
        </section>
      ) : (
        <div className="production-grid">
          {rows.map((s) => (
            <article className="production-card" key={s.id}>
              <header>
                <Link to={`/orders/${s.order_id}`}>
                  {s.order_code} <ArrowUpRight size={14} />
                </Link>
                <Badge status={s.status} />
              </header>
              <span className="eyebrow">ETAPA {String(s.position).padStart(2, '0')}</span>
              <h3>{labels[s.stage]}</h3>
              <p>{s.snapshot.description}</p>
              <div className="production-meta">
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
              <footer>
                <small>Entrega {date(s.due_date)}</small>
                {canEdit && !['COMPLETED', 'CANCELLED'].includes(s.status) && (
                  <button className="small" onClick={() => setStep(s)}>
                    Atualizar etapa
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
      {step && <StepEditor step={step} onClose={() => setStep(null)} onSaved={reload} />}
    </>
  );
}
export function Payments() {
  const { data, error, loading, reload } = useData<Row[]>('/payments');
  const orders = useData<Row[]>('/orders');
  const [open, setOpen] = useState(false);
  const received =
    data
      ?.filter((p) => p.status === 'RECEIVED')
      .reduce((s, p) => s + (p.kind === 'REFUND' ? -1 : 1) * p.amount_cents, 0) ?? 0;
  return (
    <>
      <Header
        eyebrow="CLAREZA PARA CONTINUAR CRIANDO"
        title="Financeiro"
        subtitle="Entradas, saldos e estornos com rastreabilidade."
        action={
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus size={17} /> Registrar pagamento
          </button>
        }
      />
      <div className="metrics three-metrics">
        <Metric
          label="Recebido líquido"
          value={money(received)}
          detail="Nos últimos 300 lançamentos"
          accent
        />
        <Metric
          label="A receber"
          value={money(
            orders.data
              ?.filter((o) => o.status !== 'CANCELLED')
              .reduce((s, o) => s + o.pending_cents, 0) ?? 0,
          )}
          detail="Saldo dos até 200 pedidos listados"
        />
        <Metric
          label="Lançamentos"
          value={data?.length ?? 0}
          detail="Histórico de pagamentos e estornos"
        />
      </div>
      <ErrorBox error={error || orders.error} />
      {loading ? (
        <Loading />
      ) : (
        <section className="panel">
          <h2>Movimentações</h2>
          {!data?.length ? (
            <Empty
              title="Seu financeiro começa com a primeira entrada"
              text="Registre um pagamento vinculado a um pedido aprovado."
            />
          ) : (
            data.map((p) => (
              <div className="payment-group" key={p.id}>
                <Link className="text-link" to={`/orders/${p.order_id}`}>
                  {p.order_code} · {p.client_snapshot.name} <ArrowUpRight size={14} />
                </Link>
                <PaymentRows
                  payments={[p]}
                  onChange={async () => {
                    await reload();
                    await orders.reload();
                  }}
                />
                {(p.reference || p.notes) && (
                  <small>{[p.reference, p.notes].filter(Boolean).join(' · ')}</small>
                )}
              </div>
            ))
          )}
        </section>
      )}
      {open && (
        <PaymentForm
          orders={orders.data ?? []}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            await reload();
            await orders.reload();
          }}
        />
      )}
    </>
  );
}
