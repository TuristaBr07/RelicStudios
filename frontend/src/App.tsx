import { useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calculator,
  FileText,
  Package,
  Paintbrush,
  Wallet,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { useAuth, Loading, Field, Form, Button, useAction, Feedback } from './lib';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { CalculatorPage } from './pages/Pricing';
import { Quotes, NewQuote, QuoteDetail } from './pages/Quotes';
import { Orders, OrderDetail, Production, Payments } from './pages/Operations';
import { SettingsPage } from './pages/Settings';
import { ActivateAccount, ResetPassword } from './pages/Access';
const nav = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/clients', label: 'Clientes', icon: Users, commercial: true },
  { to: '/pricing', label: 'Calculadora', icon: Calculator, commercial: true },
  { to: '/quotes', label: 'Orçamentos', icon: FileText, commercial: true },
  { to: '/orders', label: 'Pedidos', icon: Package },
  { to: '/production', label: 'Produção', icon: Paintbrush },
  { to: '/payments', label: 'Financeiro', icon: Wallet, commercial: true },
  { to: '/settings', label: 'Configurações', icon: Settings },
];
function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const action = useAction();
  return (
    <main className="login">
      <div className="login-brand">
        <div className="brand large">
          <span className="brand-symbol">R</span>
          <div>
            RELIC<small>STUDIOS</small>
          </div>
        </div>
        <div className="login-statement">
          <span className="eyebrow">DO IMAGINÁRIO AO TANGÍVEL</span>
          <h1>
            Cada detalhe <br />
            conta uma história.
          </h1>
          <p>
            Um espaço para cuidar de cada criação. <br />
            Do primeiro orçamento à última pincelada.
          </p>
          <div className="sculpture" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        </div>
        <span className="login-footer">COLECIONÁVEIS · ARTE · PRECISÃO</span>
      </div>
      <div className="login-panel">
        <div className="login-form">
          <span className="eyebrow">SEU ATELIÊ, ORGANIZADO</span>
          <h2>Bem-vindo de volta.</h2>
          <p>Acesse a operação da Relic Studios.</p>
          <Form onSubmit={() => void action.run(() => login(email, password), '')}>
            <Field label="E-mail">
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Feedback action={action} />
            <Button className="primary full" busy={action.busy}>
              Entrar no ateliê <ArrowRight size={18} />
            </Button>
          </Form>
          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>
              Acesso privado da equipe. No primeiro uso, crie o administrador pelo procedimento do
              README.
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
export default function App() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const action = useAction();
  if (loading) return <Loading />;
  if (!user) {
    if (location.pathname === '/activate') return <ActivateAccount />;
    if (location.pathname === '/reset-password') return <ResetPassword />;
    return <Login />;
  }
  const commercial = user.role !== 'TEAM';
  const current = nav.find((n) =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink to="/" className="brand">
          <span className="brand-symbol">R</span>
          <div>
            RELIC<small>STUDIOS</small>
          </div>
        </NavLink>
        <span className="nav-label">ESPAÇO DE TRABALHO</span>
        <nav>
          {nav
            .filter((n) => !n.commercial || commercial)
            .map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}>
                <n.icon size={19} />
                <span>{n.label}</span>
                <ChevronRight className="nav-chevron" size={14} />
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <span className="live-dot" /> Ateliê conectado
            <small>Feito para criar com cuidado.</small>
          </div>
          <button className="user-card" onClick={() => void action.run(logout, '')}>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span>
              {user.name}
              <small>
                {user.role === 'ADMIN'
                  ? 'Administrador'
                  : user.role === 'TEAM'
                    ? 'Produção'
                    : 'Comercial'}
              </small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {open && (
        <button className="sidebar-shade" onClick={() => setOpen(false)} aria-label="Fechar menu" />
      )}
      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setOpen(!open)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <span>
            Ateliê <ChevronRight size={13} /> <b>{current?.label ?? 'Detalhes'}</b>
          </span>
          <span className="topbar-date">
            {new Intl.DateTimeFormat('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }).format(new Date())}
          </span>
        </header>
        <main className="page">
          <Feedback action={action} />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            {commercial && (
              <>
                <Route path="/clients" element={<Clients />} />
                <Route path="/pricing" element={<CalculatorPage />} />
                <Route path="/quotes" element={<Quotes />} />
                <Route path="/quotes/new" element={<NewQuote />} />
                <Route path="/quotes/:id" element={<QuoteDetail />} />
                <Route path="/payments" element={<Payments />} />
              </>
            )}
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/production" element={<Production />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          RELIC STUDIOS <span>Detalhes que viram legado.</span>
        </footer>
      </div>
    </div>
  );
}
