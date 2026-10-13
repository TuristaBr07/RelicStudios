# Relic Studios

Sistema privado de gestão da Relic Studios para clientes, precificação, orçamentos, pedidos, produção, pagamentos e auditoria.

## Estado atual

- versão técnica: `1.0.1-rc.1`;
- branch única: `main`;
- ambiente atual: Render para validação;
- banco do ambiente atual: PostgreSQL gerenciado pelo Render;
- este ambiente ainda não deve ser tratado como produção definitiva.

## Stack

- Frontend: React + TypeScript + Vite;
- Backend: Node.js + TypeScript + Fastify;
- Banco: PostgreSQL;
- validação: Zod;
- testes: `node:test` + PGlite para integração e Playwright para fluxo ponta a ponta.

## Estrutura

```text
backend/                 API, regras de negócio e testes
frontend/                interface web e testes E2E
database/migrations/     migrations SQL
scripts/                 utilitários locais e servidor E2E
.github/workflows/       validação contínua
render.yaml              infraestrutura atual do Render
```

## Desenvolvimento local

Requer Node.js 24.

```bash
npm ci
npm run setup
npm run dev
```

O modo local usa PostgreSQL embarcado (PGlite) e sobe a aplicação em `http://localhost:8080`.

Para criar o primeiro administrador local:

```bash
npm run admin -- --name "Administrador" --email "admin@example.com"
```

A senha é solicitada de forma interativa e não é gravada no repositório.

## Validação

```bash
npm run verify
```

Executa typecheck, testes automatizados do backend e build dos workspaces.

Para o fluxo ponta a ponta:

```bash
npx playwright install chromium
npm run test:e2e
```

O GitHub Actions executa `verify`, auditoria de dependências e E2E automaticamente na `main` e em pull requests.

## Render

O Blueprint `render.yaml` mantém um Web Service Node e PostgreSQL. O serviço executa migrations antes de iniciar a API e o frontend é servido pelo próprio Fastify no mesmo domínio.

Variáveis sensíveis, como `SESSION_SECRET`, credenciais do banco e senha de bootstrap, devem existir apenas no ambiente do Render e nunca no Git.

## Segurança já presente

A aplicação utiliza sessão em cookie `HttpOnly`, `Secure` em HTTPS e `SameSite=Strict`, proteção CSRF/origin, rate limit, Helmet, senhas derivadas com `scrypt`, auditoria de ações críticas e validações de integridade no banco.

## Próxima evolução

A próxima fase funcional será tratada separadamente: autenticação/usuários e matriz de permissões. Mudanças de regra de negócio não fazem parte desta etapa de infraestrutura.
