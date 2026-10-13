import { useState } from 'react';
import { Plus, ShieldCheck, History, KeyRound } from 'lucide-react';
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
  num,
  date,
  labels,
  type Row,
} from '../lib';
import { eventLabel } from './Dashboard';
const policyLabels: Record<string, string> = {
  finishingHourly: 'Acabamento (R$/h)',
  paintingHourly: 'Pintura (R$/h)',
  modelingHourly: 'Modelagem (R$/h)',
  reservePercent: 'Reserva de impressão (%)',
  overheadPercent: 'Overhead (%)',
  minimumMarginPercent: 'Margem mínima (%)',
  defaultMarginPercent: 'Margem padrão (%)',
  premiumMinPercent: 'Premium: mínimo (%)',
  premiumMaxPercent: 'Premium: máximo (%)',
  maximumPixPercent: 'Desconto Pix máximo (%)',
  validityDays: 'Validade do orçamento (dias)',
  depositPercent: 'Entrada (%)',
};
function Policies() {
  const { data, error, loading, reload } = useData<Row[]>('/policies?includeInactive=true');
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState<Row>({}),
    [name, setName] = useState('');
  const action = useAction();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">POLÍTICA COMERCIAL</span>
          <h2>Versões de precificação</h2>
        </div>
        <button
          onClick={() => {
            setSettings({ ...data?.find((p) => p.active)?.settings });
            setName('');
            action.clear();
            setOpen(true);
          }}
        >
          <Plus size={16} /> Nova versão
        </button>
      </div>
      <Feedback action={action} />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data?.map((p) => (
          <details className="policy-version" key={p.id} open={p.active}>
            <summary>
              <span>
                <b>{p.name}</b>
                <small>
                  Versão {p.version} · {date(p.created_at)}
                </small>
              </span>
              <span className={`tag ${p.active ? 'green' : ''}`}>
                {p.active ? 'Ativa' : 'Histórico'}
              </span>
            </summary>
            <dl className="policy-values">
              {Object.entries(p.settings).map(([k, v]) => (
                <div key={k}>
                  <dt>{policyLabels[k] ?? k}</dt>
                  <dd>{Number(v).toLocaleString('pt-BR')}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))
      )}
      <p className="fine-print">
        Publicar uma versão ativa a nova política. Orçamentos anteriores preservam seus custos,
        preços e condições.
      </p>
      {open && (
        <Modal title="Publicar nova política" onClose={() => setOpen(false)}>
          <Form
            className="modal-body"
            onSubmit={() =>
              void action.run(async () => {
                await api('/policies', send('POST', { name, settings }));
                setOpen(false);
                await reload();
              }, 'Nova política publicada.')
            }
          >
            <Field label="Nome da versão">
              <input
                required
                minLength={3}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="form-grid">
              {Object.entries(policyLabels).map(([k, label]) => (
                <Field key={k} label={label}>
                  <input
                    required
                    type="number"
                    min="0"
                    step={k === 'validityDays' ? '1' : '0.01'}
                    value={settings[k] ?? ''}
                    onChange={(e) => setSettings({ ...settings, [k]: num(e.target.value) })}
                  />
                </Field>
              ))}
            </div>
            <Feedback action={action} />
            <Button className="primary" busy={action.busy}>
              Publicar nova versão
            </Button>
          </Form>
        </Modal>
      )}
    </section>
  );
}
function Users() {
  const { user } = useAuth();
  const { data, error, reload } = useData<Row[]>('/users');
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [role, setRole] = useState('TEAM');
  const action = useAction();
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          <ShieldCheck size={20} /> Acesso da equipe
        </h2>
        <button
          onClick={() => {
            setName('');
            setEmail('');
            setPassword('');
            setRole('TEAM');
            action.clear();
            setOpen(true);
          }}
        >
          <Plus size={16} /> Novo usuário
        </button>
      </div>
      <Feedback action={action} />
      <ErrorBox error={error} />
      {data?.map((u) => (
        <div className="user-row" key={u.id}>
          <span className="client-avatar">{u.name.slice(0, 1)}</span>
          <div>
            <strong>{u.name}</strong>
            <small>
              {u.email} · {labels[u.role]}
            </small>
          </div>
          <span className={`tag ${u.active ? 'green' : ''}`}>{u.active ? 'Ativo' : 'Inativo'}</span>
          {u.id !== user!.id && (
            <Button
              className="small"
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api(`/users/${u.id}`, send('PATCH', { role: u.role, active: !u.active }));
                  await reload();
                })
              }
            >
              {u.active ? 'Desativar' : 'Reativar'}
            </Button>
          )}
        </div>
      ))}
      {open && (
        <Modal title="Adicionar usuário" onClose={() => setOpen(false)}>
          <Form
            className="modal-body"
            onSubmit={() =>
              void action.run(async () => {
                await api('/users', send('POST', { name, email, password, role }));
                setPassword('');
                setOpen(false);
                await reload();
              })
            }
          >
            <Field label="Nome">
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="E-mail">
              <input
                required
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="Senha inicial"
              hint="Mínimo de 12 caracteres. O usuário pode alterar no primeiro acesso."
            >
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Perfil">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {['TEAM', 'COMMERCIAL', 'ADMIN'].map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Feedback action={action} />
            <Button busy={action.busy} className="primary">
              Criar usuário
            </Button>
          </Form>
        </Modal>
      )}
    </section>
  );
}
function Audit() {
  const [before, setBefore] = useState<string | null>(null);
  const { data, error, loading } = useData<Row[]>(`/audit${before ? `?before=${before}` : ''}`);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REGISTRO IMUTÁVEL</span>
          <h2>
            <History size={19} /> Auditoria
          </h2>
        </div>
        {before && <button onClick={() => setBefore(null)}>Mais recentes</button>}
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="audit-list">
          {data?.map((a) => (
            <details key={a.id}>
              <summary>
                <span>
                  <b>{eventLabel(a.action)}</b>
                  <small>
                    {a.actor_name ?? 'Sistema'} · {new Date(a.created_at).toLocaleString('pt-BR')}
                  </small>
                </span>
                <span className="muted">#{a.id}</span>
              </summary>
              <pre>
                {JSON.stringify(
                  { entidade: a.entity_type, registro: a.entity_id, detalhes: a.details },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
        </div>
      )}
      {data?.length === 100 && (
        <button className="full" onClick={() => setBefore(String(data.at(-1)!.id))}>
          Eventos anteriores
        </button>
      )}
    </section>
  );
}
export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('ACCOUNT'),
    [currentPassword, setCurrent] = useState(''),
    [newPassword, setNew] = useState('');
  const action = useAction();
  return (
    <>
      <Header
        eyebrow="BASES DO ATELIÊ"
        title="Configurações"
        subtitle="Acessos, políticas e um histórico que preserva cada decisão."
      />
      <div className="toolbar">
        <div className="tabs">
          {[
            ['ACCOUNT', 'Minha conta'],
            ...(user!.role === 'ADMIN'
              ? [
                  ['POLICIES', 'Precificação'],
                  ['USERS', 'Equipe'],
                  ['AUDIT', 'Auditoria'],
                ]
              : []),
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key!)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'ACCOUNT' && (
        <section className="panel account-panel">
          <h2>
            <KeyRound size={20} /> Alterar senha
          </h2>
          <p className="muted">
            {user!.name} · {user!.email}
          </p>
          <Form
            onSubmit={() =>
              void action.run(async () => {
                await api('/auth/password', send('POST', { currentPassword, newPassword }));
                setCurrent('');
                setNew('');
              }, 'Senha alterada. As outras sessões foram encerradas.')
            }
          >
            <Field label="Senha atual">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="Nova senha" hint="Use pelo menos 12 caracteres.">
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
              />
            </Field>
            <Feedback action={action} />
            <Button busy={action.busy} className="primary">
              Salvar nova senha
            </Button>
          </Form>
        </section>
      )}
      {tab === 'POLICIES' && <Policies />}
      {tab === 'USERS' && <Users />}
      {tab === 'AUDIT' && <Audit />}
    </>
  );
}
