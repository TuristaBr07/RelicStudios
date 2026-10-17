import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus, ArrowRight, PackageCheck, Activity } from 'lucide-react';
import {
  useData,
  useAuth,
  Header,
  Metric,
  Loading,
  ErrorBox,
  Empty,
  Badge,
  money,
  date,
  type Row,
} from '../lib';
export function Dashboard() {
  const { data: d, error, loading } = useData('/dashboard');
  const { user } = useAuth();
  if (loading) return <Loading />;
  if (!d) return <ErrorBox error={error} />;
  return (
    <>
      <Header
        eyebrow="PANORAMA DO ATELIÊ"
        title={`Bom trabalho, ${user!.name.split(' ')[0]}.`}
        subtitle="Cada criação tem seu tempo. Aqui, você acompanha todos eles."
        action={
          user!.role !== 'TEAM' ? (
            <Link className="button primary" to="/quotes/new">
              <Plus size={17} /> Novo orçamento
            </Link>
          ) : (
            <Link className="button primary" to="/production">
              Ver produção <ArrowRight size={17} />
            </Link>
          )
        }
      />
      <ErrorBox error={error} />
      <div className="metrics">
        <Metric
          label="Orçamentos em aberto"
          value={d.openQuotes}
          detail="Rascunhos e propostas válidas"
        />
        <Metric label="Pedidos ativos" value={d.activeOrders} detail="Da entrada até a entrega" />
        <Metric label="Em produção" value={d.inProduction} detail="Criações em andamento" accent />
        <Metric
          label={d.pendingCents !== null ? 'A receber' : 'Horas registradas'}
          value={d.pendingCents !== null ? money(d.pendingCents) : `${d.actualHours} h`}
          detail={d.pendingCents !== null ? 'Saldo dos pedidos' : 'Tempo real da equipe'}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NO HORIZONTE</span>
              <h2>Próximas entregas</h2>
            </div>
            <Link to="/orders" className="text-link">
              Todos os pedidos <ArrowUpRight size={16} />
            </Link>
          </div>
          {!d.due.length ? (
            <Empty
              title="Espaço para novas criações"
              text="Ao aprovar um orçamento e gerar um pedido, a previsão de entrega aparece aqui."
            />
          ) : (
            <div className="delivery-list">
              {d.due.map((o: Row) => (
                <Link key={o.id} to={`/orders/${o.id}`} className="delivery">
                  <span className="delivery-icon">
                    <PackageCheck size={22} />
                  </span>
                  <div>
                    <strong>{o.code}</strong>
                    <small>{o.client_snapshot.name}</small>
                  </div>
                  <Badge status={o.status} />
                  <div className="delivery-date">
                    <strong>{date(o.due_date)}</strong>
                    <small>Previsão de entrega</small>
                  </div>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="studio-card">
          <span className="eyebrow">O VALOR DO SEU TRABALHO</span>
          <h2>
            Arte exige tempo. <br />
            Seu preço deve <br />
            respeitar isso.
          </h2>
          <p>
            A mão de obra faz parte do custo. <br />O lucro vem depois.
          </p>
          {user!.role !== 'TEAM' ? <ActiveLaborRates /> : (
            <p>Consulte as etapas do pedido e registre o tempo real de cada atividade.</p>
          )}
          {user!.role !== 'TEAM' && (
            <Link to="/pricing">
              Calcular uma criação <ArrowRight size={18} />
            </Link>
          )}
        </section>
      </div>
      <div className="dashboard-grid lower">
        {d.revenueCents !== null && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SAÚDE DA OPERAÇÃO</span>
                <h2>Visão financeira</h2>
              </div>
              <WalletMark />
            </div>
            <div className="finance-summary">
              <div>
                <span>Vendas contratadas</span>
                <strong>{money(d.revenueCents)}</strong>
              </div>
              <div>
                <span>Recebido líquido</span>
                <strong>{money(d.receivedCents)}</strong>
              </div>
              <div>
                <span>Custos previstos</span>
                <strong>{money(d.costCents)}</strong>
              </div>
              <div className="profit">
                <span>Lucro previsto das peças</span>
                <strong>{money(d.profitCents)}</strong>
              </div>
            </div>
            <p className="fine-print">
              Acumulado dos pedidos não cancelados. Custos e lucro são estimativas dos orçamentos; o
              frete é separado. Horas reais registradas: {d.actualHours} h.
            </p>
          </section>
        )}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">RASTREABILIDADE</span>
              <h2>Últimas movimentações</h2>
            </div>
            <Activity size={21} />
          </div>
          <div className="activity-list">
            {d.recent.map((r: Row, i: number) => (
              <div key={i}>
                <i />
                <span>
                  <strong>{eventLabel(r.action)}</strong>
                  <small>
                    {r.actor_name ?? 'Sistema'} · {date(r.created_at)}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
function ActiveLaborRates() {
  const { data, error, loading } = useData<Row[]>('/policies');
  const policy = data?.find((p) => p.active);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!policy) return <p>Política de preços indisponível. Consulte o administrador.</p>;
  return <>
    <div className="studio-rates">
      <span>Acabamento<b>{money(policy.settings.finishingHourly * 100)}/h</b></span>
      <span>Pintura<b>{money(policy.settings.paintingHourly * 100)}/h</b></span>
      <span>Modelagem<b>{money(policy.settings.modelingHourly * 100)}/h</b></span>
    </div>
    <small>Política ativa: {policy.name} · v{policy.version}</small>
  </>;
}
function WalletMark() {
  return <span className="circle-mark">R$</span>;
}
const eventNames: Record<string, string> = {
  ADMIN_BOOTSTRAP: 'Ateliê inicializado',
  LOGIN: 'Acesso ao ateliê',
  CLIENT_CREATED: 'Cliente cadastrado',
  CLIENT_UPDATED: 'Cliente atualizado',
  CLIENT_ARCHIVED: 'Cliente arquivado',
  QUOTE_CREATED: 'Orçamento criado',
  QUOTE_APPROVED: 'Orçamento aprovado',
  QUOTE_SENT: 'Orçamento enviado',
  ORDER_CREATED: 'Pedido criado',
  ORDER_CONFIRMED: 'Entrada confirmada',
  ORDER_IN_PRODUCTION: 'Produção iniciada',
  ORDER_READY: 'Pedido pronto',
  ORDER_DELIVERED: 'Pedido entregue',
  PAYMENT_CREATED: 'Pagamento registrado',
  PAYMENT_RECEIVED: 'Recebimento confirmado',
  PAYMENT_REFUND: 'Estorno registrado',
  PRODUCTION_UPDATED: 'Etapa de produção atualizada',
  MANUFACTURING_JOB_UPDATED: 'Job de fabricação atualizado',
  MANUFACTURING_JOB_RETRIED: 'Nova tentativa de fabricação',
  POLICY_VERSION_CREATED: 'Nova política de preços',
  USER_CREATED: 'Usuário criado',
  USER_INVITED: 'Usuário convidado',
  USER_ACTIVATED: 'Conta ativada',
  USER_SUSPENDED: 'Usuário suspenso',
  USER_REACTIVATED: 'Usuário reativado',
  PASSWORD_RESET: 'Senha recuperada',
  PASSWORD_RESET_ISSUED: 'Recuperação de acesso emitida',
  SESSION_REVOKED: 'Sessão encerrada',
  SESSIONS_REVOKED: 'Sessões encerradas',
  FILE_LINKED: 'Referência adicionada',
};
export const eventLabel = (action: string) =>
  eventNames[action] ?? action.replaceAll('_', ' ').toLowerCase();
