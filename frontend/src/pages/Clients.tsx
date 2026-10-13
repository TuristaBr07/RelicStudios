import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Archive, Edit3, History, RotateCcw } from 'lucide-react';
import {
  useData,
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
  money,
  date,
  type Row,
} from '../lib';
const blank = { name: '', email: '', phone: '', document: '', address: '', notes: '' };
export function Clients() {
  const [q, setQ] = useState(''),
    [archived, setArchived] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [history, setHistory] = useState<Row | null>(null);
  const { data, loading, error, reload } = useData<Row[]>(
    `/clients?q=${encodeURIComponent(q)}&archived=${archived}`,
  );
  const action = useAction();
  const [form, setForm] = useState({ ...blank });
  const open = (row?: Row) => {
    action.clear();
    setEdit(row ?? {});
    setForm(
      row
        ? {
            name: row.name,
            email: row.email,
            phone: row.phone,
            document: row.document,
            address: row.address,
            notes: row.notes,
          }
        : { ...blank },
    );
  };
  return (
    <>
      <Header
        eyebrow="RELAÇÕES QUE FICAM"
        title="Clientes"
        subtitle="Pessoas, preferências e a história de cada encomenda."
        action={
          <button className="primary" onClick={() => open()}>
            <Plus size={17} /> Novo cliente
          </button>
        }
      />
      <Feedback action={action} />
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            aria-label="Buscar clientes"
            placeholder="Buscar por nome, e-mail ou telefone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{' '}
          Mostrar arquivados
        </label>
        <span className="count">{data?.length ?? 0} clientes</span>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : !data?.length ? (
        <section className="panel">
          <Empty
            title="Vamos conhecer seu primeiro cliente"
            text="Cadastre quem vai receber a próxima criação da Relic."
            action={
              <button className="primary" onClick={() => open()}>
                Cadastrar cliente
              </button>
            }
          />
        </section>
      ) : (
        <div className="client-grid">
          {data.map((row) => (
            <article className="client-card" key={row.id}>
              <div className="client-card-top">
                <span className="client-avatar">{row.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <h3>{row.name}</h3>
                  <small>Desde {date(row.created_at)}</small>
                </div>
              </div>
              <p>
                {row.email || 'E-mail não informado'}
                <br />
                {row.phone || 'Telefone não informado'}
              </p>
              {row.address && <p className="clamp">{row.address}</p>}
              <footer>
                <button
                  className="text-button"
                  onClick={() =>
                    void action.run(async () => {
                      setHistory(await api(`/clients/${row.id}`));
                    }, '')
                  }
                >
                  <History size={15} /> Histórico
                </button>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Editar ${row.name}`}
                    onClick={() => open(row)}
                  >
                    <Edit3 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${archived ? 'Restaurar' : 'Arquivar'} ${row.name}`}
                    onClick={() =>
                      void action.run(
                        async () => {
                          await api(
                            `/clients/${row.id}`,
                            send('PATCH', {
                              ...Object.fromEntries(Object.keys(blank).map((k) => [k, row[k]])),
                              version: row.version,
                              archived: !archived,
                            }),
                          );
                          await reload();
                        },
                        archived ? 'Cliente restaurado.' : 'Cliente arquivado.',
                      )
                    }
                  >
                    {archived ? <RotateCcw size={17} /> : <Archive size={17} />}
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Editar cliente' : 'Novo cliente'} onClose={() => setEdit(null)}>
          <Form
            className="modal-body"
            onSubmit={() =>
              void action.run(async () => {
                await api(
                  edit.id ? `/clients/${edit.id}` : '/clients',
                  send(edit.id ? 'PATCH' : 'POST', {
                    ...form,
                    ...(edit.id ? { version: edit.version } : {}),
                  }),
                );
                setEdit(null);
                await reload();
              })
            }
          >
            <div className="form-grid">
              <Field label="Nome completo *">
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Telefone / WhatsApp">
                <input
                  value={form.phone}
                  maxLength={40}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="CPF / CNPJ (opcional)">
                <input
                  maxLength={30}
                  value={form.document}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Endereço">
              <textarea
                value={form.address}
                maxLength={1000}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label="Observações">
              <textarea
                value={form.notes}
                maxLength={4000}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <Feedback action={action} />
            <div className="form-actions">
              <button type="button" onClick={() => setEdit(null)}>
                Cancelar
              </button>
              <Button className="primary" busy={action.busy}>
                Salvar cliente
              </Button>
            </div>
          </Form>
        </Modal>
      )}
      {history && (
        <Modal title={history.name} onClose={() => setHistory(null)}>
          <div className="modal-body">
            <h3>Orçamentos</h3>
            {history.quotes.length ? (
              history.quotes.map((r: Row) => (
                <Link className="history-row" key={r.id} to={`/quotes/${r.id}`}>
                  <strong>{r.code}</strong>
                  <Badge status={r.status} />
                  <span>{money(r.total_cents)}</span>
                </Link>
              ))
            ) : (
              <p className="muted">Nenhum orçamento registrado.</p>
            )}
            <h3>Pedidos</h3>
            {history.orders.length ? (
              history.orders.map((r: Row) => (
                <Link className="history-row" key={r.id} to={`/orders/${r.id}`}>
                  <strong>{r.code}</strong>
                  <Badge status={r.status} />
                  <span>{money(r.total_cents)}</span>
                </Link>
              ))
            ) : (
              <p className="muted">Nenhum pedido registrado.</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
