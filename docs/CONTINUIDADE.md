# Continuidade — Relic Studios

Atualizado em 14/10/2026. Este documento é o ponto de entrada para retomar o desenvolvimento sem depender de uma conversa anterior.

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

### 3 — Homologação no Render (em andamento)

Preparação concluída em 14/10/2026; validação remota pendente.

- PR #1 integrada à main em `5c8a092`. CI da main `4d65491` aprovado, incluindo E2E: [execução 38590427014](https://github.com/TuristaBr07/RelicStudios/actions/runs/38590427014).
- Conferidos Blueprint, carregamento de configuração, inicialização, bootstrap de administrador, migrations e healthcheck.
- Teste local com JavaScript compilado e configuração equivalente ao Render: as quatro migrations passaram no modo gerenciado, incluindo segunda execução sem duplicação e sem criação do papel `relic_runtime`.
- No mesmo teste, passaram origem derivada de `RENDER_EXTERNAL_URL`, healthcheck com consulta ao banco, HTML do frontend, logo íntegra, bloqueio de API sem sessão (401), login, atributos Secure/HttpOnly/SameSite=Strict e rejeição de origem externa (403).
- Limitação: teste executado com PGlite isolado e requisições injetadas. Não valida conectividade do driver pg, TLS, proxy real, banco PostgreSQL hospedado, persistência após reinício nem versão efetivamente implantada.
- O endereço público e o identificador do serviço não foram encontrados no repositório nem no contexto anterior disponível. Integração Render encontrada, mas ainda não conectada. Necessário conectar a conta para inspecionar serviço, deploys e logs.
- Nenhuma alteração de infraestrutura, acesso ao banco remoto ou nova branch foi realizada nesta preparação.
- Limpeza pendente: branch remota `fix/restore-logo-validation` já integrada; conexão atual do GitHub não expõe exclusão. Sua cópia local foi removida.

## Roadmap de entrega

| Etapa | Estado | Critério de saída |
| --- | --- | --- |
| 1. Recuperar contexto | Concluída | Arquitetura e decisões documentadas. |
| 2. Estabilizar base | Concluída | CI e fluxo E2E aprovados. |
| 3. Homologar Render | Em andamento | Implantação, login, migrations, PostgreSQL e persistência verificados no ambiente remoto. |
| 4. Revisar regras e fluxos | Pendente | Fluxos essenciais e exceções relevantes consistentes, incluindo precificação, produção, pagamentos e permissões. |
| 5. Finalizar experiência e configuração | Pendente | Interface revisada e parâmetros operacionais configurados com valores reais, sem inventar custos. |
| 6. Preparar operação definitiva | Pendente | Ambiente definitivo definido, acessos conferidos, backup e restauração testados e manutenção documentada. |
| 7. Piloto e entrega | Pendente | Caso representativo concluído, pendências bloqueadoras resolvidas, guia curto e versão de entrega identificada. |

Escopo: concluir os módulos existentes. Funcionalidades novas entram apenas quando necessárias para fechar esses fluxos; outras melhorias ficam para depois da entrega. Custos reais, decisões comerciais ausentes e avaliação do piloto exigem participação de Gabriel.

## Próximo ponto de retomada

1. Verificar se a integração Render foi conectada; se sim, localizar o serviço vinculado a `TuristaBr07/RelicStudios` e confirmar o commit implantado e o resultado do deploy.
2. Validar URL real, healthcheck, logs sem expor segredos, migrations e persistência. Não tratar teste local ou CI como prova de implantação.
3. Concluir a etapa 3 antes da revisão funcional da etapa 4. Preservar dados existentes e não executar o E2E destrutivo no banco remoto.

## Comandos de validação

```bash
npm ci --include=dev
npm run verify
npm audit --audit-level=high
npx playwright install --with-deps chromium
npm run test:e2e
```

O E2E usa banco isolado e senha efêmera gerada pelo próprio teste. Não executar testes destrutivos sobre o banco de homologação.
