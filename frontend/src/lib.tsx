import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from 'react';
import { X, LoaderCircle, Inbox, ArrowUpRight } from 'lucide-react';
export type Row = Record<string, any>;
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TEAM' | 'COMMERCIAL';
};
let token = '';
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token, ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !url.includes('/auth/login'))
      window.dispatchEvent(new Event('relic:unauthorized'));
    throw new Error(
      data.issues?.length
        ? `${data.error} ${data.issues.map((i: Row) => i.message).join(' ')}`
        : (data.error ?? 'Falha ao comunicar com o servidor.'),
    );
  }
  return data as T;
}
export const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}>({ user: null, loading: true, login: async () => {}, logout: async () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/auth/me')
      .then((d) => {
        setUser(d.user);
        token = d.csrfToken;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    const expire = () => {
      setUser(null);
      token = '';
    };
    window.addEventListener('relic:unauthorized', expire);
    return () => window.removeEventListener('relic:unauthorized', expire);
  }, []);
  async function login(email: string, password: string) {
    const d = await api('/auth/login', send('POST', { email, password }));
    token = d.csrfToken;
    setUser(d.user);
  }
  async function logout() {
    await api('/auth/logout', send('POST', {}));
    token = '';
    setUser(null);
  }
  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export const money = (value: number | string | null = 0) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value ?? 0) / 100,
  );
export const date = (s: string | undefined) =>
  s
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
        new Date(s.length === 10 ? `${s}T12:00:00Z` : s),
      )
    : '—';
export const num = (value: string) => Number(value || 0);
export const labels: Record<string, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
  WAITING_PAYMENT: 'Aguardando entrada',
  CONFIRMED: 'Confirmado',
  IN_PRODUCTION: 'Em produção',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  WAITING: 'Aguardando',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausado',
  COMPLETED: 'Concluído',
  BLOCKED: 'Bloqueado',
  PENDING: 'Pendente',
  RECEIVED: 'Recebido',
  DEPOSIT: 'Entrada',
  BALANCE: 'Saldo',
  ADDITIONAL: 'Complemento',
  REFUND: 'Estorno',
  PIX: 'Pix',
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Crédito',
  DEBIT_CARD: 'Débito',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
  PREPARATION: 'Preparação / modelagem',
  PRINTING: 'Impressão',
  POST_PROCESSING: 'Pós-processamento',
  ASSEMBLY: 'Montagem',
  PRIMING: 'Primer',
  PAINTING: 'Pintura',
  FINALIZATION: 'Finalização',
  QUALITY_CHECK: 'Controle de qualidade',
  PACKAGING: 'Embalagem',
  ADMIN: 'Administrador',
  TEAM: 'Produção',
  COMMERCIAL: 'Comercial',
};
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <i />
      {labels[status] ?? status}
    </span>
  );
}
export function useData<T = any>(url: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setError('');
    try {
      const d = await api<T>(url);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error-box">
      {error}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" aria-live="polite">
      <LoaderCircle className="spin" size={22} /> Carregando o ateliê…
    </div>
  );
}
export function Empty({
  title = 'Nenhum registro por aqui',
  text = 'Os registros aparecerão conforme a operação avançar.',
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Header({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
            id,
            ...(hint ? { 'aria-describedby': `${id}-hint` } : {}),
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Button({
  busy = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={busy || props.disabled}>
      {busy ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const items = [
          ...document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not(:disabled),[role="dialog"] input:not(:disabled),[role="dialog"] select:not(:disabled),[role="dialog"] textarea,[role="dialog"] a[href]',
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    (
      document.querySelector<HTMLElement>('[role="dialog"] input') ??
      document.querySelector<HTMLElement>('[role="dialog"] button')
    )?.focus();
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? 'wide' : ''}`}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  async function run(fn: () => Promise<void>, message = 'Salvo com sucesso.') {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await fn();
      setSuccess(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    success,
    run,
    clear: () => {
      setError('');
      setSuccess('');
    },
  };
}
export function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      <ErrorBox error={action.error} />
      {action.success && (
        <div role="status" className="success-box">
          {action.success}
        </div>
      )}
    </>
  );
}
export function Form({
  onSubmit,
  children,
  className = '',
}: {
  onSubmit: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      className={className}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}
export function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? 'accent' : ''}`}>
      <div className="metric-label">
        {label}
        <ArrowUpRight size={17} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
