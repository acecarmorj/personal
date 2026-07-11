# Estrutura sugerida da planilha Pro Fitness Academia

O arquivo [api.gs](../apps-script/api.gs) ja pode criar a estrutura automaticamente.

## Inicializacao automatica

1. Abra a planilha que sera o banco de dados.
2. Acesse `Extensoes > Apps Script` nessa propria planilha.
3. Cole o arquivo `api.gs` e execute `setupProFitnessSpreadsheet()` uma vez.

A funcao registra em `Script Properties` o ID da planilha onde o script esta vinculado e cria as abas nela.
Depois dessa primeira execucao, `GET ?action=setup` e `POST { "action": "setup" }` apenas conferem ou
completam a estrutura da mesma planilha. A API nao cria outra planilha automaticamente.

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
`id`, `studentId`, `date`, `time`, `type`, `status`, `notes`, `title`, `category`, `dayOfWeek`, `startTime`, `endTime`, `teacherId`, `teacherName`, `location`, `capacity`, `recurring`, `scheduleKind`

- Aulas individuais usam `studentId`, `date`, `time` e os status da agenda do aluno.
- A grade fixa usa `scheduleKind = weekly-class`, `recurring = true` e `dayOfWeek` de `0` (domingo) a `6` (sabado).
- `teacherId` fica preparado para o futuro modulo Professores; `teacherName` permite uso imediato no painel.

### `Pagamentos`
`id`, `studentId`, `reference`, `amount`, `discount`, `fine`, `netAmount`, `dueDate`, `status`, `method`, `paidAt`, `description`, `createdAt`, `notes`

### `Movimentacoes`
`id`, `date`, `time`, `type`, `category`, `description`, `amount`, `method`, `account`, `studentId`, `paymentId`, `expenseId`, `status`, `createdAt`, `notes`

### `Despesas`
`id`, `description`, `supplier`, `category`, `amount`, `dueDate`, `status`, `paidAt`, `method`, `account`, `recurring`, `document`, `createdAt`, `notes`

### `Fechamentos`
`id`, `date`, `openingBalance`, `cashIncome`, `cashExpense`, `expectedCash`, `countedCash`, `difference`, `totalIncome`, `totalExpense`, `closedBy`, `closedAt`, `notes`

### `Checkins`
`id`, `studentId`, `workoutId`, `date`, `time`, `type`, `checkedInAt`, `checkedOutAt`, `source`, `presenceStatus`, `usedLoad`, `difficulty`, `pain`, `notes`

- Use `type = access` para entradas da catraca e `type = workout` para treinos realizados.
- `checkedInAt` e `checkedOutAt` usam data/hora ISO e alimentam o indicador "Na academia agora".

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
