# Relic Studios

Sistema privado de gestão da Relic Studios para clientes, precificação, orçamentos, pedidos, produção, pagamentos e auditoria.

## Continuidade do desenvolvimento

Consulte [o estado e o ponto de retomada](docs/CONTINUIDADE.md) antes de iniciar uma etapa.
Esse registro reúne decisões preservadas, evidências de validação e pendências; deve ser atualizado a cada entrega.

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

## Segurança e acesso

A aplicação utiliza sessão em cookie `HttpOnly`, `Secure` em HTTPS e `SameSite=Strict`, proteção CSRF/origin, rate limit, Helmet, senhas derivadas com `scrypt`, auditoria de ações críticas e validações de integridade no banco.

Contas de equipe são criadas por convite: o administrador gera um link de ativação de uso único, e o próprio usuário define a senha. Links de recuperação também são de uso único, têm validade curta e revogam as sessões anteriores após a troca. Tokens brutos nunca são armazenados no banco.

Perfis permanentes: `ADMIN`, `COMMERCIAL` e `TEAM`. O backend aplica RBAC; `TEAM` recebe somente os dados operacionais dos pedidos e da produção, sem preço, custo, margem, lucro ou pagamentos.

Em **Minha conta**, cada usuário pode revisar as sessões ativas e revogar acessos antigos.

A entrega automática de convites por e-mail não faz parte da infraestrutura atual: o link é exibido uma única vez ao administrador para compartilhamento por canal seguro.

## Fabricação

A aplicação possui um catálogo de tecnologias, impressoras e materiais separado das regras comerciais.

Tecnologias iniciais:

- `MSLA`: material em mL e tempo de impressão por placa/camada (`BATCH_LAYER`);
- `FDM`: material em gramas e tempo normalmente aditivo por job (`ADDITIVE`).

Equipamentos iniciais cadastrados:

- ELEGOO Saturn 4 12K: MSLA, volume útil `218.88 × 122.88 × 220 mm`, referência elétrica `24 V / 6 A` (144 W);
- Creality Ender-3 V3 SE: FDM, volume útil `220 × 220 × 250 mm`, potência nominal `350 W`.

Potência nominal não é tratada como consumo médio. O campo de consumo médio permanece sem valor até existir medição/calibração real. Custos de aquisição, máquina/h e manutenção também devem ser configurados administrativamente antes de entrarem na precificação.

Materiais são cadastrados na unidade determinada pela tecnologia. O sistema deriva o custo unitário da quantidade e do preço da embalagem e preserva um percentual separado para perdas.

A estrutura `manufacturing_jobs` representa jobs físicos vinculados a itens de pedidos, com impressora, material, quantidade produzida, material e tempo estimados/reais. Novos pedidos materializam automaticamente os jobs aprovados no orçamento.

## Calculadora MSLA/FDM

A precificação usa jobs de fabricação em vez de campos genéricos de resina e máquina. Cada job seleciona impressora e material do catálogo e recebe do slicer o material por job, o tempo por job e quantas unidades aquele job produz.

O servidor calcula quantos jobs físicos são necessários para a quantidade comercial, custos de material e perda, máquina, manutenção, energia calibrada, reserva de impressão, mão de obra, overhead, taxas e margem. Em MSLA, várias unidades na mesma placa compartilham o tempo do job; em FDM, o padrão operacional continua sendo um job por unidade, salvo quando o próprio slicer representar um job conjunto.

Modelagem é tratada como custo único do item/lote. Pintura e acabamento permanecem custos por unidade. Ao converter um orçamento novo em pedido, os jobs planejados são materializados automaticamente em `manufacturing_jobs` e o tempo de impressão da produção vem desses jobs, sem multiplicação cega pela quantidade.

Orçamentos históricos continuam íntegros. Uma revisão de orçamento criada no modelo antigo exige recálculo explícito no modelo novo, evitando converter automaticamente custos genéricos em materiais ou impressoras que não existiam no snapshot original.

## Estimativa assistida de trabalho

Acabamento, pintura e modelagem podem ser estimados de três formas: horas diretas, soma de etapas ou três pontos PERT (`(O + 4M + P) / 6`). Os componentes e premissas ficam preservados no snapshot do orçamento.

Acabamento e pintura permanecem por unidade; modelagem continua sendo um custo único do lote. Ao gerar o pedido, as horas efetivas aprovadas alimentam as etapas de produção como baseline. A produção registra horas reais separadamente e mostra a diferença previsto × realizado; alterar horas reais nunca reabre nem recalcula o preço comercial aprovado.

As horas previstas não podem ser sobrescritas pela tela operacional. Uma futura necessidade de replanejamento deve ter um conceito separado da baseline comercial, preservando o histórico original.

## Custo realizado

Jobs de fabricação registram material e tempo reais. Ao concluir ou registrar falha, ambos são obrigatórios. O custo realizado usa o snapshot comercial do próprio job para material, máquina, manutenção e energia, preservando os preços e parâmetros existentes quando o orçamento foi aprovado.

Horas reais das etapas são convertidas em custo pelo snapshot da política do pedido: preparação/modelagem usa modelagem, primer/pintura usa pintura e as demais atividades manuais usam produção/acabamento. Tempo de impressão não é contado novamente como mão de obra.

O pedido apresenta custo previsto × realizado, variação e resultado sobre as peças. Consumíveis, embalagem e extras permanecem pelos valores aprovados até existir apontamento específico. A reserva de impressão continua sendo proteção comercial do orçamento e não é registrada como gasto realizado. Nenhum desvio operacional altera retroativamente o preço vendido.

## Identidade visual

A aplicação usa a identidade oficial da Relic Studios no login, nos fluxos públicos de acesso, na navegação interna e nos orçamentos comerciais. O símbolo do baú é o ativo principal da marca e a interface adota a paleta grafite, âmbar e creme utilizada nos materiais comerciais.

A identidade visual é aplicada como uma camada de tema separada da base estrutural da interface, permitindo evoluir a apresentação sem misturar regras de negócio com estilização. O orçamento PDF utiliza a mesma marca, paleta e hierarquia visual para manter consistência entre o sistema interno e o documento enviado ao cliente.
