# Continuidade — Relic Studios

Atualizado em 17/10/2026. Este documento é o ponto de entrada para retomar o desenvolvimento sem depender de uma conversa anterior.

## Modelo de trabalho acordado

- Gabriel autorizou autonomia técnica para desenvolvimento e ajustes, com entregas por etapas e informe após cada etapa concluída.
- Cada entrega registra mudanças, evidências de validação, limitações e próximo passo.
- Antes de editar, conferir a branch, o commit atual, mudanças locais e a última execução do CI. A situação real do código e dos testes prevalece sobre resumos antigos.
- Usar commits pequenos e rastreáveis. A `main` é a branch permanente; criar branches temporárias apenas quando necessárias para desenvolvimento ou validação.
- Após integrar uma etapa, remover sua branch temporária remota e local. Não acumular branches soltas.
- Manter outra branch somente quando houver motivo concreto (por exemplo, trabalho pendente ainda não integrado); registrar e informar a justificativa. Nunca excluir trabalho não integrado sem avaliar seu conteúdo.
- Ajustes pequenos de documentação podem ser registrados diretamente na `main`, respeitando as proteções do repositório.
- Atualizar este documento a cada etapa. Não registrar senhas, tokens, dados reais de clientes ou credenciais.

## Base recuperada

- Repositório: `TuristaBr07/RelicStudios`.
- Commit inicial desta retomada: `6b722e2ad7ecdbdaf36c278d31a4819b5682a5a3`.
- Versão técnica: `1.0.1-rc.1`.
- Sistema interno de clientes, fabricação, precificação, orçamentos, pedidos, produção, pagamentos e auditoria.
- React/TypeScript/Vite no frontend; Fastify/TypeScript no backend; PostgreSQL no Render e PGlite para desenvolvimento/testes.
- Node.js 24. Instalação reproduzível com `npm ci --include=dev`.
- Render está documentado como homologação. Não houve acesso ao banco nem validação do ambiente remoto nesta etapa.
- Identidade oficial preservada: baú Relic, grafite, âmbar e creme.

## Decisões de negócio que devem ser preservadas

- Perfis `ADMIN`, `COMMERCIAL` e `TEAM`; a equipe operacional não recebe informações financeiras.
- Precificação baseada em jobs de fabricação MSLA/FDM e valores do slicer; material e tempo respeitam a tecnologia.
- Modelagem é custo único do lote; pintura e acabamento são por unidade.
- Consumo elétrico médio exige calibração: não usar potência nominal como consumo médio.
- Snapshots comerciais e horas previstas aprovadas são imutáveis pelo fluxo operacional; apontamentos reais não recalculam a venda.
- Orçamentos antigos exigem recálculo explícito ao migrar para o modelo atual.
- Convites são compartilhados manualmente; não há envio automático de e-mail contratado/configurado.

O README detalha as regras implementadas. Novos requisitos de negócio não devem ser inferidos apenas a partir do nome de uma tela.

## Etapas

### 1 — Reconhecimento inicial

Concluído: estrutura, README, commits e CI consultados. As três últimas execuções falharam; na mais recente, a geração do orçamento PDF impedia a conclusão de `npm run verify` e bloqueava o E2E.

### 2 — Restaurar a base de validação

Causa confirmada e reproduzida: `frontend/public/assets/relic-logo.png` estava truncado. O bloco IDAT declarava 35.218 bytes, mas o arquivo completo tinha apenas 13.308 bytes. PDFKit rejeitava a imagem com `Incomplete or corrupt PNG file`.

Correção: restaurada a cópia PNG íntegra da identidade oficial preservada no material anterior do projeto, sem redesenhar a marca. A interface e o PDF continuam usando o mesmo caminho do ativo.

Proteções de regressão:

- O teste de PDF exige a presença de uma imagem incorporada, além da assinatura PDF.
- O fluxo E2E verifica se a logo visível do login foi realmente decodificada pelo navegador.

Validações locais:

- Falha original do teste de PDF reproduzida antes da correção.
- `npm run verify`: checagem de tipos, 11 testes e build aprovados.
- `npm audit --audit-level=high`: zero vulnerabilidades reportadas.
- PDF de teste gerado e inspecionado visualmente com a logo incorporada.
- E2E local bloqueado pelo download inválido do Chromium; validação transferida para o GitHub Actions.

Validação remota aprovada em 14/10/2026:

- [CI 38589168265](https://github.com/TuristaBr07/RelicStudios/actions/runs/38589168265), commit `28aa02710360d8be78721c6233fa01bb24025fa6`: checagem de tipos, 11 testes, build, auditoria e E2E concluídos com sucesso.
- O E2E percorreu login com imagem válida, material, cliente, cálculo, orçamento/PDF, aprovação, pedido, entrada, produção, custo realizado, saldo, entrega, financeiro e auditoria. Parte das transições operacionais usa a API autenticada no contexto do navegador.
- Entrega rastreada na [PR #1](https://github.com/TuristaBr07/RelicStudios/pull/1). Consultar seu estado para confirmar a integração; alterações posteriores ao commit acima são documentação de resultado.

### 3 — Homologação no Render (concluída em 17/10/2026)

Histórico do diagnóstico de 14/10/2026, preservado abaixo. Os bloqueios deste diagnóstico foram resolvidos nas atualizações de 15/10 e 17/10.

- PR #1 integrada à main em `5c8a092`. CI da main `4d65491` aprovado, incluindo E2E: [execução 38590427014](https://github.com/TuristaBr07/RelicStudios/actions/runs/38590427014).
- Conferidos Blueprint, carregamento de configuração, inicialização, bootstrap de administrador, migrations e healthcheck.
- Teste local com JavaScript compilado e configuração equivalente ao Render: as quatro migrations passaram no modo gerenciado, incluindo segunda execução sem duplicação e sem criação do papel `relic_runtime`.
- No mesmo teste, passaram origem derivada de `RENDER_EXTERNAL_URL`, healthcheck com consulta ao banco, HTML do frontend, logo íntegra, bloqueio de API sem sessão (401), login, atributos Secure/HttpOnly/SameSite=Strict e rejeição de origem externa (403).
- Limitação: teste executado com PGlite isolado e requisições injetadas. Não valida conectividade do driver pg, TLS, proxy real, banco PostgreSQL hospedado, persistência após reinício nem versão efetivamente implantada.
- CI da main `fc273d97` aprovado: [execução 38626871393](https://github.com/TuristaBr07/RelicStudios/actions/runs/38626871393).
- Integração Render conectada; workspace confirmado pelo usuário: `tea-db4ka6nlot8c73bc3kcg` (My Workspace).
- Serviço existente: `srv-db4kmgk9v7es73a76lj0`, `relic-studios-homolog`, plano free, região virginia, repositório correto e branch main. URL informada pelo Render: https://relic-studios-homolog.onrender.com. Painel: https://dashboard.render.com/web/srv-db4kmgk9v7es73a76lj0.
- Serviço suspenso pelo usuário desde 13/10/2026 às 20:38:24 UTC. Último deploy `dep-db79ddmi0phs738r6vs0` terminou em `build_failed`, ainda no commit antigo `050ff1bd788289cfc9585aba14805c1ac92f8a0c`.
- Causa confirmada nos logs: comando remoto antigo tenta extrair `relic-studios-render.tgz`, inexistente no repositório. Erro: `tar (child): relic-studios-render.tgz: Cannot open: No such file or directory`. O start remoto também contém o prefixo antigo `cd app &&`. O `render.yaml` atual já contém os comandos corretos, mas essas configurações não foram aplicadas ao serviço.
- Banco existente: `dpg-db4km7c9v7es73a761bg-a`, `relic-studios-homolog-db`, PostgreSQL 18, free, virginia, status `available`, sem suspensão. Expiração informada pelo Render: **08/11/2026 às 20:14:22 UTC**; considerar na etapa de operação definitiva.
- Banco mantém `ipAllowList: []`. A consulta de leitura a `schema_migrations` pela integração foi bloqueada antes da execução por não aceitar conexões externas. Preservar essa restrição; disponibilidade da infraestrutura não confirma migrations nem dados. Validar pela aplicação na rede interna.
- A integração permite ler serviço/deploys/logs e disparar deploy, mas não oferece alteração dos comandos nem retomada de serviço suspenso. O painel foi aberto como alternativa e exige autenticação segura do usuário.
- Nenhuma configuração de infraestrutura, plano, permissão de rede ou dado remoto foi alterado neste diagnóstico. Nenhuma branch nova foi criada.

Comandos a aplicar nas configurações do serviço existente, conforme `render.yaml`:

Build Command:
```bash
npm ci --include=dev && npm run verify && npm audit --audit-level=high
```

Start Command:
```bash
node backend/dist/cli/migrate.js && node backend/dist/cli/bootstrap-render.js && node backend/dist/index.js
```

Após salvar, retomar o serviço e acompanhar o deploy da main; evitar deploy duplicado se a alteração já iniciar um automaticamente. Não recriar o arquivo tar como contorno.
- Limpeza pendente: branch remota `fix/restore-logo-validation` já integrada; conexão atual do GitHub não expõe exclusão. Sua cópia local foi removida.

### 3 — Atualização de implantação em 15/10/2026

Esta atualização substitui os bloqueios de acesso e de implantação descritos no diagnóstico de 14/10.

- Login no painel Render concluído pelo usuário e confirmado na conta do workspace correto.
- Build e Start Command do serviço existente corrigidos para os comandos do `render.yaml`; serviço reativado, mantendo plano free, banco e restrições de rede.
- Deploy `dep-db8e05s9v7es738h8sj0` do commit `31a07ba0d6c24b75fc346ea0d5c7d6b4f7e9944b` confirmado como **live** em 15/10/2026 às 14:17:02 UTC (11:17:02 em Brasília). CI desse commit também aprovado: [execução 38632748367](https://github.com/TuristaBr07/RelicStudios/actions/runs/38632748367).
- Build executou verificação de tipos, testes, compilação e auditoria sem bloquear. Auditoria reportou zero vulnerabilidades.
- Logs de inicialização confirmaram: `Migrations aplicadas e checksums conferidos.` e `Administrador inicial já existe; bootstrap ignorado.` O administrador existente foi preservado.
- Verificação externa por HTTPS: `GET /health` retornou HTTP 200 com `status: ok` e `database: connected`; `GET /api/auth/me` sem sessão retornou 401; POST de login com origem externa retornou 403.
- Tela de login carregou no navegador e a logo foi decodificada (1052 × 1600).
- Blueprint `exs-db4kkqbncjis73ft1gg0` ainda apontava para a branch removida `render-homolog-v1.0.1-rc.1`. Corrigido para `main`, caminho `render.yaml`, com Auto Sync reativado.
- Particularidade do painel: a branch removida aparecia como `main` no formulário, com salvamento desabilitado. Foi necessário selecionar temporariamente a branch existente `fix/restore-logo-validation` com Auto Sync pausado, e depois salvar `main`. A proposta intermediária de alterar a branch do serviço para a branch de correção **não foi aprovada**; o serviço continuou na main. Nenhuma branch foi criada. Não aprovar propostas antigas de sincronização.
- Homologação completa ainda pendente: login na própria Relic Studios (credenciais separadas do Render), conferência interna e teste de persistência após reinicialização. Não confundir deploy saudável com aprovação integral dos fluxos.

### 3 — Conclusão da homologação técnica em 17/10/2026

- Versão remota conferida: commit `fe0b0a741134870ebc679b994ef8fa863f2d6d2c`, deploy `dep-db8e39tbedkc73a4mll0`, live desde 15/10 às 14:23:52 UTC. [CI 38750817739](https://github.com/TuristaBr07/RelicStudios/actions/runs/38750817739) concluído com sucesso.
- Serviço ativo na main, com os comandos corretos. Healthcheck HTTPS retornou HTTP 200 e banco conectado.
- Reinicialização após hibernação observada em nova instância em 17/10 às 13:20 UTC: migrations/checksums conferidos e administrador existente preservado pelo bootstrap.
- Login realizado pelo usuário na aplicação e confirmado com perfil Administrador. Não houve redefinição de senha ou alteração de acessos.
- Navegação autenticada verificada em Visão geral, Clientes, Calculadora, Orçamentos, Pedidos, Produção, Fabricação, Financeiro e Configurações. Política de preços e auditoria carregadas.
- Simulação sem gravação: 1 hora de modelagem a R$ 50/h, overhead de 10% e margem de 20% resultaram em custo de R$ 55,00 e preço de R$ 68,75, conforme cálculo independente. Nenhum orçamento ou lançamento foi criado.
- Persistência confirmada para registros existentes após deploy/reinicialização: administrador, política de preços de 09/10, duas impressoras e histórico de auditoria desde 09/10 continuaram disponíveis. Acesso de 17/10 apareceu na auditoria.
- Escopo desta conclusão: infraestrutura, PostgreSQL pela aplicação, autenticação, navegação e persistência dos registros existentes. Não representa aprovação integral das regras de negócio, teste de backup/restauração ou ciclo comercial completo no banco remoto; estes permanecem nas etapas seguintes. O E2E completo segue isolado no CI.
- Pendências operacionais observadas para a etapa 5: nenhum material cadastrado; energia e custo de máquina zerados; consumo médio das impressoras sem calibração. Preservar valores existentes e configurar com dados reais antes do piloto.
- Nenhuma branch nova criada. Limpeza da branch remota já integrada continua pendente pela limitação da conexão GitHub descrita acima.

## Roadmap de entrega

| Etapa | Estado | Critério de saída |
| --- | --- | --- |
| 1. Recuperar contexto | Concluída | Arquitetura e decisões documentadas. |
| 2. Estabilizar base | Concluída | CI e fluxo E2E aprovados. |
| 3. Homologar Render | Concluída | Implantação, login, migrations, PostgreSQL e persistência verificados no ambiente remoto. |
| 4. Revisar regras e fluxos | Pendente | Fluxos essenciais e exceções relevantes consistentes, incluindo precificação, produção, pagamentos e permissões. |
| 5. Finalizar experiência e configuração | Pendente | Interface revisada e parâmetros operacionais configurados com valores reais, sem inventar custos. |
| 6. Preparar operação definitiva | Pendente | Ambiente definitivo definido, acessos conferidos, backup e restauração testados e manutenção documentada. |
| 7. Piloto e entrega | Pendente | Caso representativo concluído, pendências bloqueadoras resolvidas, guia curto e versão de entrega identificada. |

Escopo: concluir os módulos existentes. Funcionalidades novas entram apenas quando necessárias para fechar esses fluxos; outras melhorias ficam para depois da entrega. Custos reais, decisões comerciais ausentes e avaliação do piloto exigem participação de Gabriel.

## Próximo ponto de retomada

1. Iniciar a etapa 4: revisar regras e exceções de precificação, orçamentos, produção, pagamentos e permissões, confrontando implementação, testes e decisões preservadas neste documento.
2. Conferir branch, commit, mudanças locais, CI e estado remoto antes de editar. Preservar dados existentes e executar testes de escrita apenas em banco isolado.
3. Na etapa 5, obter os custos reais e calibrações faltantes. Na etapa 6, resolver a expiração do PostgreSQL free em 08/11/2026, testar backup/restauração e definir operação definitiva.
4. Remover a branch remota de correção já integrada quando houver mecanismo autorizado disponível; não criar branches sem necessidade.

## Comandos de validação

```bash
npm ci --include=dev
npm run verify
npm audit --audit-level=high
npx playwright install --with-deps chromium
npm run test:e2e
```

O E2E usa banco isolado e senha efêmera gerada pelo próprio teste. Não executar testes destrutivos sobre o banco de homologação.
