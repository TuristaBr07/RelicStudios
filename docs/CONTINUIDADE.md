# Continuidade — Relic Studios

Atualizado em 14/10/2026. Este documento é o ponto de entrada para retomar o desenvolvimento sem depender de uma conversa anterior.

## Modelo de trabalho acordado

- Gabriel autorizou autonomia técnica para desenvolvimento e ajustes, com entregas por etapas e informe após cada etapa concluída.
- Cada entrega registra mudanças, evidências de validação, limitações e próximo passo.
- Antes de editar, conferir a branch, o commit atual, mudanças locais e a última execução do CI. A situação real do código e dos testes prevalece sobre resumos antigos.
- Usar commits pequenos e rastreáveis; validar correções em branch antes de integrar à `main`.
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
- E2E local bloqueado pelo download inválido do Chromium; validação transferida para o GitHub Actions. Resultado remoto ainda pendente neste registro.

## Próximo ponto de retomada

1. Concluir o CI da correção, incluindo o E2E que antes era ignorado. Corrigir falhas reveladas sem enfraquecer os testes.
2. Registrar o resultado e a referência da entrega integrada.
3. Conferir a homologação no Render antes de declarar o ambiente pronto para uso. O sucesso do CI não comprova implantação, configuração nem integridade do banco remoto.

## Comandos de validação

```bash
npm ci --include=dev
npm run verify
npm audit --audit-level=high
npx playwright install --with-deps chromium
npm run test:e2e
```

O E2E usa banco isolado e senha efêmera gerada pelo próprio teste. Não executar testes destrutivos sobre o banco de homologação.
