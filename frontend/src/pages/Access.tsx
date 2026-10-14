import { useState } from 'react';
import { KeyRound, ShieldCheck, ArrowRight } from 'lucide-react';
import { api, send, Field, Form, Button, Feedback, useAction } from '../lib';
import { BrandMark } from '../components/BrandMark';

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="login">
      <div className="login-brand">
        <div className="brand large">
          <BrandMark large />
        </div>
        <div className="login-statement">
          <span className="eyebrow">ACESSO PRIVADO · RELIC STUDIOS</span>
          <h1>
            Seu espaço de trabalho,
            <br />
            protegido.
          </h1>
          <p>Convites e recuperações usam links únicos e com validade curta.</p>
        </div>
        <span className="login-footer">IMPRESSÃO 3D · FIGURES · COLECIONÁVEIS</span>
      </div>
      <div className="login-panel">
        <div className="login-form">{children}</div>
      </div>
    </main>
  );
}

function tokenFromLocation() {
  return new URLSearchParams(window.location.search).get('token') ?? '';
}

export function ActivateAccount() {
  const token = tokenFromLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const action = useAction();
  return (
    <PublicShell>
      <span className="eyebrow">PRIMEIRO ACESSO</span>
      <h2>Ative sua conta.</h2>
      <p>Defina sua senha pessoal. O link de convite funciona uma única vez.</p>
      {done ? (
        <>
          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>Conta ativada. Você já pode entrar no estúdio.</span>
          </div>
          <a className="button primary full" href="/">
            Ir para o login <ArrowRight size={18} />
          </a>
        </>
      ) : (
        <Form
          onSubmit={() =>
            void action.run(async () => {
              if (!token) throw new Error('O link de convite está incompleto.');
              if (password !== confirm) throw new Error('As senhas não coincidem.');
              await api('/auth/activate', send('POST', { token, password }));
              setDone(true);
            })
          }
        >
          <Field label="Nova senha" hint="Use pelo menos 12 caracteres.">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirmar senha">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Feedback action={action} />
          <Button className="primary full" busy={action.busy}>
            <KeyRound size={18} /> Ativar conta
          </Button>
        </Form>
      )}
    </PublicShell>
  );
}

export function ResetPassword() {
  const token = tokenFromLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const action = useAction();
  return (
    <PublicShell>
      <span className="eyebrow">RECUPERAÇÃO DE ACESSO</span>
      <h2>Defina uma nova senha.</h2>
      <p>Ao concluir, todas as sessões antigas da conta serão encerradas.</p>
      {done ? (
        <>
          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>Senha redefinida e sessões anteriores revogadas.</span>
          </div>
          <a className="button primary full" href="/">
            Voltar ao login <ArrowRight size={18} />
          </a>
        </>
      ) : (
        <Form
          onSubmit={() =>
            void action.run(async () => {
              if (!token) throw new Error('O link de recuperação está incompleto.');
              if (password !== confirm) throw new Error('As senhas não coincidem.');
              await api('/auth/password-reset', send('POST', { token, password }));
              setDone(true);
            })
          }
        >
          <Field label="Nova senha" hint="Use pelo menos 12 caracteres.">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirmar senha">
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Feedback action={action} />
          <Button className="primary full" busy={action.busy}>
            <KeyRound size={18} /> Redefinir senha
          </Button>
        </Form>
      )}
    </PublicShell>
  );
}
