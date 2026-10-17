import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  ShieldCheck,
  History,
  KeyRound,
  Copy,
  MonitorSmartphone,
  RefreshCw,
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
  electricityKwh: 'Energia elétrica (R$/kWh)',
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
const policyLimits: Record<string, [number, number]> = {
  finishingHourly: [30, 10000], paintingHourly: [40, 10000], modelingHourly: [50, 10000],
  electricityKwh: [0, 100], reservePercent: [0, 100], overheadPercent: [0, 100],
  minimumMarginPercent: [15, 80], defaultMarginPercent: [15, 80], premiumMinPercent: [15, 80],
  premiumMaxPercent: [15, 80], maximumPixPercent: [0, 5], validityDays: [1, 90], depositPercent: [1, 100],
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
          disabled={loading || !data?.some((p) => p.active)}
          onClick={() => {
            setSettings({ electricityKwh: 0, ...data?.find((p) => p.active)?.settings });
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
              {Object.entries({ electricityKwh: 0, ...p.settings }).map(([k, v]) => (
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
                <Field key={k} label={label} hint={k === 'electricityKwh' ? 'Tarifa efetiva por kWh da conta de energia. Zero exclui energia do custo.' : `De ${policyLimits[k]![0]} a ${policyLimits[k]![1]}.`}>
                  <input
                    required
                    type="number"
                    min={policyLimits[k]![0]}
                    max={policyLimits[k]![1]}
                    step={k === 'validityDays' ? '1' : '0.01'}
                    value={settings[k] ?? ''}
                    onChange={(e) => setSettings({ ...settings, [k]: num(e.target.value) })}
                  />
                </Field>
              ))}
            </div>
            <p className="fine-print">As margens devem seguir a ordem: mínima ≤ padrão ≤ premium mínimo ≤ premium máximo. A nova versão será usada nos próximos cálculos.</p>
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

type AccessLink = { title: string; url: string; expiresAt: string };

function AccessLinkModal({ link, onClose }: { link: AccessLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={link.title} onClose={onClose}>
      <div className="modal-body">
        <p className="muted">
          Compartilhe o link por um canal seguro. Ele é de uso único e não será exibido novamente após fechar esta janela.
        </p>
        <Field label="Link de acesso">
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <p className="fine-print">Validade: {new Date(link.expiresAt).toLocaleString('pt-BR')}.</p>
        <Button
          className="primary full"
          onClick={() =>
            void navigator.clipboard.writeText(link.url).then(() => {
              setCopied(true);
            })
          }
        >
          <Copy size={16} /> {copied ? 'Link copiado' : 'Copiar link'}
        </Button>
      </div>
    </Modal>
  );
}

function Users() {
  const { user } = useAuth();
  const { data, error, reload } = useData<Row[]>('/users');
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState('TEAM'),
    [link, setLink] = useState<AccessLink | null>(null);
  const action = useAction();

  const updateUser = async (u: Row, patch: Partial<Row>) => {
    await api(
      `/users/${u.id}`,
      send('PATCH', { role: patch.role ?? u.role, status: patch.status ?? u.status }),
    );
    await reload();
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            <ShieldCheck size={20} /> Acesso da equipe
          </h2>
          <p className="muted">Convites, perfis e recuperação sem compartilhar senhas iniciais.</p>
        </div>
        <button
          onClick={() => {
            setName('');
            setEmail('');
            setRole('TEAM');
            action.clear();
            setOpen(true);
          }}
        >
          <Plus size={16} /> Convidar usuário
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
              {u.last_login_at ? ` · último acesso ${date(u.last_login_at)}` : ''}
            </small>
          </div>
          <span className={`tag ${u.status === 'ACTIVE' ? 'green' : ''}`}>{labels[u.status] ?? u.status}</span>
          {u.id !== user!.id && (
            <div className="button-row">
              <select
                aria-label={`Perfil de ${u.name}`}
                value={u.role}
                disabled={action.busy}
                onChange={(e) => void action.run(() => updateUser(u, { role: e.target.value }))}
              >
                {['TEAM', 'COMMERCIAL', 'ADMIN'].map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
              </select>
              {u.status === 'PENDING' && (
                <Button
                  className="small"
                  busy={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      const r = await api(`/users/${u.id}/invitation`, send('POST', {}));
                      setLink({
                        title: 'Novo link de convite',
                        url: r.invitationUrl,
                        expiresAt: r.invitationExpiresAt,
                      });
                      await reload();
                    })
                  }
                >
                  <RefreshCw size={14} /> Novo convite
                </Button>
              )}
              {u.status === 'ACTIVE' && (
                <>
                  <Button
                    className="small"
                    busy={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        const r = await api(`/users/${u.id}/password-reset`, send('POST', {}));
                        setLink({
                          title: 'Link de recuperação',
                          url: r.resetUrl,
                          expiresAt: r.resetExpiresAt,
                        });
                      })
                    }
                  >
                    Recuperar acesso
                  </Button>
                  <Button
                    className="small"
                    busy={action.busy}
                    onClick={() => void action.run(() => updateUser(u, { status: 'SUSPENDED' }))}
                  >
                    Suspender
                  </Button>
                </>
              )}
              {u.status === 'SUSPENDED' && (
                <Button
                  className="small"
                  busy={action.busy}
                  onClick={() => void action.run(() => updateUser(u, { status: 'ACTIVE' }))}
                >
                  Reativar
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      {open && (
        <Modal title="Convidar usuário" onClose={() => setOpen(false)}>
          <Form
            className="modal-body"
            onSubmit={() =>
              void action.run(async () => {
                const r = await api('/users', send('POST', { name, email, role }));
                setOpen(false);
                setLink({
                  title: 'Link de convite',
                  url: r.invitationUrl,
                  expiresAt: r.invitationExpiresAt,
                });
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
            <Field label="Perfil">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {['TEAM', 'COMMERCIAL', 'ADMIN'].map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
              </select>
            </Field>
            <p className="fine-print">
              O usuário ficará pendente até definir a própria senha pelo link de convite.
            </p>
            <Feedback action={action} />
            <Button busy={action.busy} className="primary">
              Criar convite
            </Button>
          </Form>
        </Modal>
      )}
      {link && <AccessLinkModal link={link} onClose={() => setLink(null)} />}
    </section>
  );
}

function Sessions() {
  const { data, error, loading, reload } = useData<Row[]>('/auth/sessions');
  const action = useAction();
  return (
    <section className="panel account-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <MonitorSmartphone size={20} /> Sessões ativas
          </h2>
          <p className="muted">Revogue acessos antigos sem alterar sua senha.</p>
        </div>
        <Button
          className="small"
          busy={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api('/auth/sessions/revoke-others', send('POST', {}));
              await reload();
            }, 'Outras sessões encerradas.')
          }
        >
          Encerrar outras
        </Button>
      </div>
      <Feedback action={action} />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        data?.map((s) => (
          <div className="user-row" key={s.id}>
            <span className="client-avatar">
              <MonitorSmartphone size={16} />
            </span>
            <div>
              <strong>{s.current ? 'Esta sessão' : 'Sessão ativa'}</strong>
              <small>
                {s.ip_address || 'IP não informado'} · último uso {new Date(s.last_seen_at).toLocaleString('pt-BR')}
              </small>
              <small>{s.user_agent || 'Navegador não identificado'}</small>
            </div>
            {s.current ? (
              <span className="tag green">Atual</span>
            ) : (
              <Button
                className="small"
                busy={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api(`/auth/sessions/${s.id}`, { method: 'DELETE' });
                    await reload();
                  }, 'Sessão encerrada.')
                }
              >
                Encerrar
              </Button>
            )}
          </div>
        ))
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
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') ?? 'ACCOUNT';
  const tab = user!.role === 'ADMIN' && ['POLICIES', 'USERS', 'AUDIT'].includes(requestedTab) ? requestedTab : 'ACCOUNT';
  const setTab = (value: string) => setParams(value === 'ACCOUNT' ? {} : { tab: value });
  const [currentPassword, setCurrent] = useState(''),
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
        <>
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
          <Sessions />
        </>
      )}
      {tab === 'POLICIES' && <Policies />}
      {tab === 'USERS' && <Users />}
      {tab === 'AUDIT' && <Audit />}
    </>
  );
}
