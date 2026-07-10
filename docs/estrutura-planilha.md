# Estrutura sugerida da planilha Pro Fitness Academia

O arquivo [api.gs](../apps-script/api.gs) ja pode criar a estrutura automaticamente.

## Inicializacao automatica

Use uma destas opcoes:

- Executar manualmente a funcao `setupProFitnessSpreadsheet()` no editor do Google Apps Script.
- Chamar `GET ?action=setup` na URL publicada do Web App.
- Chamar `POST` com `{ "action": "setup" }`.

Se `SPREADSHEET_ID` continuar com o placeholder, a API cria uma nova planilha e salva o ID em `Script Properties`.
Se `SPREADSHEET_ID` estiver preenchido, ela usa essa planilha e garante as abas e cabecalhos obrigatorios.

## Fluxo novo de matricula e acesso

- O painel gera o QR de matricula a partir de `enrollmentToken`.
- O app do aluno le esse QR e finaliza a matricula uma unica vez.
- Depois da primeira matricula, o token inicial e consumido e o QR deixa de funcionar.
- Se precisar refazer a matricula, o painel deve reemitir um novo QR e colocar o aluno novamente como `pendente`.
- O QR da roleta usa `gateCode`.
- O bloqueio de acesso pode ser automatico pelo financeiro ou manual pelo painel.

## Abas obrigatorias

### `Alunos`
`id`, `name`, `phone`, `email`, `birthDate`, `goal`, `restrictions`, `status`, `plan`, `monthlyFee`, `notes`, `createdAt`, `enrollmentToken`, `enrollmentStatus`, `enrollmentCompletedAt`, `appAccessPolicy`, `accessBlockReason`, `gateCode`, `lastGateSyncAt`, `avatarUrl`

### `Avaliacoes`
`id`, `studentId`, `date`, `weight`, `height`, `imc`, `bodyFat`, `chest`, `waist`, `hip`, `arm`, `thigh`, `photos`, `notes`

### `Treinos`
`id`, `studentId`, `title`, `division`, `muscleGroup`, `exercises`, `sets`, `reps`, `load`, `rest`, `status`, `notes`, `createdAt`

### `Exercicios`
`id`, `name`, `muscleGroup`, `equipment`, `videoUrl`, `notes`

### `Agenda`
`id`, `studentId`, `date`, `time`, `type`, `status`, `notes`

### `Pagamentos`
`id`, `studentId`, `reference`, `amount`, `dueDate`, `status`, `method`, `paidAt`, `notes`

### `Checkins`
`id`, `studentId`, `workoutId`, `date`, `usedLoad`, `difficulty`, `pain`, `notes`

### `Usuarios`
`id`, `name`, `email`, `passwordHash`, `role`, `status`, `lastLogin`

### `Config`
`id`, `appName`, `timezone`, `currency`, `logoUrl`, `supportPhone`

### `Log`
`timestamp`, `action`, `resource`, `recordId`, `payload`

## Boas praticas

- Use `id` unico em todas as abas.
- Salve arrays e objetos em JSON nas colunas `photos`, `exercises` e `payload`.
- Padronize datas em `YYYY-MM-DD` e horarios em `HH:MM`.
- Use validacao de dados no Sheets para campos como `status`, `type`, `method`, `role`, `enrollmentStatus` e `appAccessPolicy`.
- Proteja a aba `Usuarios` e, se necessario, mova autenticacao para outro servico.
