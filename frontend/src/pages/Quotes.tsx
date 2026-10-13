import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  Download,
  Check,
  Send,
  Package,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import {
  useData,
  useAction,
  api,
  send,
  Header,
  Field,
  Button,
  Modal,
  Feedback,
  Loading,
  ErrorBox,
  Empty,
  Badge,
  money,
  date,
  num,
  type Row,
} from '../lib';
import { PricingEditor } from './Pricing';
import { FileLinks } from '../components/FileLinks';
export function Quotes() {
  const { data, error, loading } = useData<Row[]>('/quotes');
  const [status, setStatus] = useState('ALL');
  const filtered = data?.filter((q) => status === 'ALL' || q.status === status);
  return (
    <>
      <Header
        eyebrow="DO INTERESSE À ENCOMENDA"
        title="Orçamentos"
        subtitle="Propostas claras, custos preservados e decisões registradas."
        action={
          <Link className="button primary" to="/quotes/new">
            <Plus size={17} /> Novo orçamento
          </Link>
        }
      />
      <div className="toolbar">
        <div className="tabs">
          {[
            ['ALL', 'Todos'],
            ['DRAFT', 'Rascunhos'],
            ['SENT', 'Enviados'],
            ['APPROVED', 'Aprovados'],
          ].map(([value, label]) => (
            <button
              className={status === value ? 'active' : ''}
              key={value}
              onClick={() => setStatus(value!)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="count">{filtered?.length ?? 0} propostas</span>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        <section className="panel flush">
          {!filtered?.length ? (
            <Empty
              title="A próxima criação começa aqui"
              text="Monte uma proposta com os custos calculados e a identidade da Relic."
              action={
                <Link to="/quotes/new" className="button primary">
                  Criar orçamento
                </Link>
              }
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Orçamento / cliente</th>
                    <th>Situação</th>
                    <th>Validade</th>
                    <th>Valor total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link to={`/quotes/${q.id}`} className="row-title">
                          {q.code}
                          <small>{q.client_snapshot.name}</small>
                        </Link>
                      </td>
                      <td>
                        <Badge status={q.status} />
                      </td>
                      <td>{date(q.valid_until)}</td>
                      <td className="money">{money(q.total_cents)}</td>
                      <td>
                        <Link
                          className="icon-button"
                          to={`/quotes/${q.id}`}
                          aria-label={`Abrir ${q.code}`}
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
export function NewQuote() {
  const navigate = useNavigate(),
    location = useLocation();
  const seed = location.state as Row | null;
  const clients = useData<Row[]>('/clients'),
    policies = useData<Row[]>('/policies');
  const source = seed?.fromQuote;
  const [clientId, setClientId] = useState(source?.client_id ?? ''),
    [policyId, setPolicyId] = useState(seed?.policyId ?? ''),
    [items, setItems] = useState<Row[]>(source?.items.map((i: Row) => ({
      description: i.description,
      characterName: i.character_name,
      scale: i.scale,
      quantity: i.quantity,
      input: i.calculation.input,
      result: null,
    })) ?? []),
    [adding, setAdding] = useState(!!seed?.input),
    [description, setDescription] = useState(''),
    [characterName, setCharacterName] = useState(''),
    [scale, setScale] = useState(''),
    [quantity, setQuantity] = useState(1),
    [shipping, setShipping] = useState(source?source.shipping_cents/100:0),
    [leadDays, setLeadDays] = useState(source?.lead_days ?? 14),
    [notes, setNotes] = useState(source?.notes ?? ''),
    [repricePending, setRepricePending] = useState(!!source),
    [repriceError, setRepriceError] = useState('');
  const action = useAction();
  const activePolicy = policyId || policies.data?.find((p) => p.active)?.id;
  useEffect(() => {
    if (!source || !repricePending || !policies.data?.length) return;
    const active = policies.data.find((p) => p.active);
    if (!active) {
      setItems([]);
      setRepriceError('Nenhuma política de preços ativa está disponível.');
      setRepricePending(false);
      return;
    }
    let cancelled = false;
    Promise.all(
      source.items.map(async (i: Row) => ({
        description: i.description,
        characterName: i.character_name,
        scale: i.scale,
        quantity: i.quantity,
        input: i.calculation.input,
        result: await api('/pricing/calculate',
          send('POST', { policyId: active.id, input: i.calculation.input })),
      })),
    )
      .then((repriced) => {
        if (cancelled) return;
        setItems(repriced);
        setPolicyId(active.id);
        setRepricePending(false);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setItems([]);
        setRepriceError(`${error.message} Os itens da revisão não foram copiados.`);
        setRepricePending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [policies.data, repricePending, source]);
  const save = () =>
    void action.run(async () => {
      const q = await api(
        '/quotes',
        send('POST', {
          clientId,
          policyId: activePolicy,
          items: items.map(({ description, characterName, scale, quantity, input }) => ({
            description,
            characterName,
            scale,
            quantity,
            input,
          })),
          shippingCents: Math.round(shipping * 100),
          leadDays,
          notes,
        }),
      );
      navigate(`/quotes/${q.id}`);
    });
  return (
    <>
      <Link to="/quotes" className="back-link">
        <ArrowLeft size={16} /> Orçamentos
      </Link>
      <Header
        eyebrow="UMA NOVA CRIAÇÃO"
        title="Novo orçamento"
        subtitle="Adicione peças calculadas. O servidor confirma os valores ao salvar."
      />
      <Feedback action={action} />
      <ErrorBox error={clients.error || policies.error || repriceError} />
      {clients.loading || policies.loading || repricePending ? (
        <Loading />
      ) : (
        <>
          <section className="panel">
            <div className="form-grid three">
              <Field label="Cliente *">
                <select
                  aria-label="Cliente"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Selecione um cliente</option>
                  {clients.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Política de preços">
                <select
                  value={activePolicy ?? ''}
                  disabled={items.length > 0}
                  onChange={(e) => setPolicyId(e.target.value)}
                >
                  {policies.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · v{p.version}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prazo após a entrada (dias)">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={leadDays}
                  onChange={(e) => setLeadDays(num(e.target.value))}
                />
              </Field>
            </div>
            {!clients.data?.length && (
              <p className="hint">
                Primeiro, <Link to="/clients">cadastre um cliente</Link>.
              </p>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PEÇAS DA PROPOSTA</span>
                <h2>Itens do orçamento</h2>
              </div>
              <button
                onClick={() => {
                  setDescription('');
                  setCharacterName('');
                  setScale('');
                  setQuantity(1);
                  setAdding(true);
                }}
              >
                <Plus size={16} /> Adicionar peça
              </button>
            </div>
            {!items.length ? (
              <Empty
                title="O que vamos criar?"
                text="Cada peça recebe seu próprio cálculo de materiais, tempo e margem."
              />
            ) : (
              items.map((i, n) => (
                <div className="quote-item" key={n}>
                  <span className="item-number">{String(n + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{i.description}</strong>
                    <small>
                      {[i.characterName, i.scale, `${i.quantity} unidade(s)`]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                    <span className="muted">
                      {money(i.result.finalCents)} por unidade · margem {i.result.marginPercent}%
                    </span>
                  </div>
                  <strong>{money(i.result.finalCents * i.quantity)}</strong>
                  <button
                    className="icon-button"
                    aria-label={`Remover ${i.description}`}
                    onClick={() => setItems(items.filter((_, x) => x !== n))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))
            )}
          </section>
          <div className="two-columns">
            <section className="panel">
              <Field label="Observações para o cliente">
                <textarea
                  rows={4}
                  maxLength={6000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalhes da peça, acabamento e condições específicas."
                />
              </Field>
            </section>
            <section className="panel">
              <Field label="Frete separado (R$)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(num(e.target.value))}
                />
              </Field>
              <div className="total-line">
                <span>Total da proposta</span>
                <strong>
                  {money(
                    items.reduce((s, i) => s + i.result.finalCents * i.quantity, 0) +
                      Math.round(shipping * 100),
                  )}
                </strong>
              </div>
              <Button
                className="primary full"
                disabled={!clientId || !items.length}
                busy={action.busy}
                onClick={save}
              >
                Salvar orçamento <Check size={17} />
              </Button>
            </section>
          </div>
        </>
      )}
      {adding && policies.data && (
        <Modal wide title="Calcular peça do orçamento" onClose={() => setAdding(false)}>
          <div className="modal-body">
            <PricingEditor
              policies={policies.data}
              initialPolicyId={activePolicy}
              {...(seed?.input && items.length === 0 ? { initial: seed.input } : {})}
              fixedPolicy
              onUse={(input, result) => {
                if (description.trim().length < 2) return;
                setItems([
                  ...items,
                  { description, characterName, scale, quantity, input, result },
                ]);
                setAdding(false);
                setPolicyId(result.policyId);
              }}
            >
              <section className="panel">
                <div className="form-grid">
                  <Field label="Nome da peça *">
                    <input
                      required
                      minLength={2}
                      maxLength={300}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </Field>
                  <Field label="Personagem / produto">
                    <input
                      maxLength={150}
                      value={characterName}
                      onChange={(e) => setCharacterName(e.target.value)}
                    />
                  </Field>
                  <Field label="Escala">
                    <input
                      value={scale}
                      maxLength={50}
                      placeholder="Ex.: 1:8"
                      onChange={(e) => setScale(e.target.value)}
                    />
                  </Field>
                  <Field label="Quantidade">
                    <input
                      type="number"
                      required
                      min="1"
                      max="1000"
                      step="1"
                      value={quantity}
                      onChange={(e) => setQuantity(num(e.target.value))}
                    />
                  </Field>
                </div>
              </section>
            </PricingEditor>
          </div>
        </Modal>
      )}
    </>
  );
}
export function QuoteDetail() {
  const { id } = useParams();
  const { data: q, error, loading, reload } = useData(`/quotes/${id}`);
  const action = useAction(),
    navigate = useNavigate();
  async function status(value: string) {
    await api(`/quotes/${id}/status`, send('PATCH', { status: value, version: q.version }));
    await reload();
  }
  if (loading) return <Loading />;
  if (!q) return <ErrorBox error={error} />;
  return (
    <>
      <Link className="back-link" to="/quotes">
        <ArrowLeft size={16} /> Orçamentos
      </Link>
      <Header
        eyebrow="PROPOSTA COMERCIAL"
        title={q.code}
        subtitle={`${q.client_snapshot.name} · Criado em ${date(q.created_at)}`}
        action={
          <a className="button" href={`/api/quotes/${id}/pdf`} download>
            <Download size={17} /> Baixar PDF
          </a>
        }
      />
      <Feedback action={action} />
      <div className="detail-strip">
        <Badge status={q.status} />
        <span>
          Válido até <b>{date(q.valid_until)}</b>
        </span>
        <span>
          Prazo <b>{q.lead_days} dias após entrada</b>
        </span>
        <span>
          Política <b>v{q.policy_snapshot.version}</b>
        </span>
      </div>
      <div className="two-columns weighted">
        <section className="panel">
          <h2>Peças e acabamento</h2>
          {q.items.map((i: Row) => (
            <div className="quote-item" key={i.id}>
              <span className="item-number">{String(i.position).padStart(2, '0')}</span>
              <div>
                <strong>{i.description}</strong>
                <small>
                  {[i.character_name, i.scale, `${i.quantity} unidade(s)`]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
                <span className="muted">{money(i.unit_price_cents)} por unidade</span>
              </div>
              <strong>{money(i.total_cents)}</strong>
            </div>
          ))}
          <div className="note-block">
            <h3>Condições de pagamento</h3>
            <p>{q.payment_terms}</p>
            {q.notes && (
              <>
                <h3>Observações</h3>
                <p className="preserve">{q.notes}</p>
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">RESUMO COMERCIAL</span>
          <dl className="price-breakdown">
            <div>
              <dt>Peças</dt>
              <dd>{money(q.subtotal_cents)}</dd>
            </div>
            <div>
              <dt>Frete separado</dt>
              <dd>{money(q.shipping_cents)}</dd>
            </div>
            <div>
              <dt>Custos previstos</dt>
              <dd>{money(q.cost_cents)}</dd>
            </div>
            <div>
              <dt>Lucro previsto</dt>
              <dd>{money(q.profit_cents)}</dd>
            </div>
          </dl>
          <div className="total-line">
            <span>Total</span>
            <strong>{money(q.total_cents)}</strong>
          </div>
          <div className="action-stack">
            <button onClick={()=>navigate('/quotes/new',{state:{fromQuote:q}})}>Duplicar para revisar</button>
            {q.status === 'DRAFT' && (
              <Button
                busy={action.busy}
                onClick={() =>
                  void action.run(() => status('SENT'), 'Proposta marcada como enviada.')
                }
              >
                <Send size={16} /> Marcar como enviado
              </Button>
            )}
            {['DRAFT', 'SENT'].includes(q.status) && (
              <Button
                className="primary"
                busy={action.busy}
                onClick={() => void action.run(() => status('APPROVED'), 'Aprovação registrada.')}
              >
                <Check size={16} /> Registrar aprovação
              </Button>
            )}
            {q.status === 'SENT' && (
              <Button
                busy={action.busy}
                onClick={() => void action.run(() => status('REJECTED'), 'Recusa registrada.')}
              >
                Registrar recusa
              </Button>
            )}
            {['DRAFT', 'SENT'].includes(q.status) && (
              <Button
                busy={action.busy}
                onClick={() => void action.run(() => status('CANCELLED'), 'Orçamento cancelado.')}
              >
                Cancelar orçamento
              </Button>
            )}
            {q.status === 'APPROVED' && !q.order_id && (
              <Button
                className="primary"
                busy={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const o = await api(`/quotes/${id}/order`, send('POST', {}));
                    navigate(`/orders/${o.id}`);
                  })
                }
              >
                <Package size={17} /> Gerar pedido
              </Button>
            )}
            {q.order_id && (
              <Link to={`/orders/${q.order_id}`} className="button primary">
                Abrir {q.order_code} <ArrowUpRight size={17} />
              </Link>
            )}
          </div>
          <p className="fine-print">
            Registrar aprovação confirma a decisão do cliente e congela a proposta. Não envia
            mensagens automaticamente.
          </p>
        </section>
      </div>
      <FileLinks entity="quoteId" id={id!} />
    </>
  );
}
