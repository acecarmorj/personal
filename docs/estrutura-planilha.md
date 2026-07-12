# Estrutura da planilha Pro Fitness Academia

A fonte oficial da API e `apps-script/api.gs`. Depois de substituir a API, execute `setupProFitnessSpreadsheet()` pela planilha vinculada para criar ou migrar a estrutura sem apagar registros existentes.

## Versao da estrutura

- `schemaVersion`: **8**
- A versao fica registrada nas propriedades do Apps Script e na aba `Config`.
- Requisicoes comuns nao reformatam todas as abas. A preparacao completa ocorre no `setup` ou quando a versao da estrutura precisa ser migrada.
- O esquema 3 adicionou sessoes de treino e series realizadas; o esquema 4 adicionou autenticacao; o esquema 5 adicionou QR temporario; o esquema 6 preserva logins e matriculas com zeros a esquerda; o esquema 8 registra composicao do plano, valor-base e desconto da matricula.
- `Contas` e `Sessoes` sao privadas e nao fazem parte de snapshots operacionais.

## Abas

Todas as abas operacionais usam `updatedAt`, `updatedBy`, `source` e `deviceId` quando esses campos existem. `source` representa a origem tecnica da sincronizacao, como `tablet-professor`, `painel-administrativo`, `app-aluno` ou `api`.

### `Alunos`
`id`, `enrollmentNumber`, `cpf`, `accountId`, `name`, `phone`, `email`, `birthDate`, `goal`, `restrictions`, `status`, `plan`, `selectedModalities`, `baseMonthlyFee`, `planDiscountType`, `planDiscountPercent`, `monthlyFee`, `notes`, `createdAt`, `updatedAt`, `enrollmentToken`, `enrollmentStatus`, `enrollmentCompletedAt`, `appAccessPolicy`, `accessBlockReason`, `gateCode`, `lastGateSyncAt`, `avatarUrl`, `updatedBy`, `source`, `deviceId`

### `Avaliacoes`
`id`, `studentId`, `date`, `weight`, `height`, `imc`, `bodyFat`, `chest`, `waist`, `hip`, `arm`, `thigh`, `photos`, `notes`, `updatedAt`, `updatedBy`, `source`, `deviceId`

### `Treinos`
`id`, `studentId`, `title`, `division`, `muscleGroup`, `exercises`, `exerciseItems`, `sets`, `reps`, `load`, `rest`, `status`, `notes`, `createdAt`, `updatedAt`, `updatedBy`, `source`, `deviceId`

`exerciseItems` guarda cada exercicio em JSON com `id`, `exerciseId`, `name`, `sets`, `reps`, `load`, `rest` e `notes`. `exerciseId` vincula o item ao catalogo e `exercises` preserva os nomes para compatibilidade.

### `Exercicios`
`id`, `name`, `muscleGroup`, `equipment`, `videoUrl`, `notes`, `updatedAt`, `updatedBy`, `source`, `deviceId`

### `Agenda`
`id`, `studentId`, `date`, `time`, `type`, `status`, `notes`, `title`, `category`, `dayOfWeek`, `startTime`, `endTime`, `teacherId`, `teacherName`, `location`, `capacity`, `recurring`, `scheduleKind`, `updatedAt`, `updatedBy`, `source`, `deviceId`

- Agenda individual: `studentId`, `date`, `time` e status do atendimento.
- Grade fixa: `scheduleKind = weekly-class`, `recurring = true` e `dayOfWeek` de `0` a `6`.

### `Pagamentos`
`id`, `studentId`, `reference`, `amount`, `discount`, `fine`, `netAmount`, `paidAmount`, `dueDate`, `status`, `method`, `paidAt`, `recordedBy`, `reversalReason`, `reversedBy`, `reversedAt`, `description`, `createdAt`, `updatedAt`, `notes`, `updatedBy`, `source`, `deviceId`

### `Movimentacoes`
`id`, `date`, `time`, `type`, `category`, `description`, `amount`, `method`, `account`, `costCenter`, `studentId`, `paymentId`, `expenseId`, `status`, `voidReason`, `voidedBy`, `voidedAt`, `createdAt`, `updatedAt`, `notes`, `updatedBy`, `source`, `deviceId`

### `Despesas`
`id`, `description`, `supplier`, `category`, `amount`, `dueDate`, `status`, `paidAt`, `method`, `account`, `costCenter`, `recurring`, `recurrenceId`, `document`, `createdAt`, `updatedAt`, `notes`, `updatedBy`, `source`, `deviceId`

### `Fechamentos`
`id`, `date`, `openingBalance`, `cashIncome`, `cashExpense`, `expectedCash`, `countedCash`, `difference`, `totalIncome`, `totalExpense`, `closedBy`, `closedAt`, `notes`, `updatedAt`, `updatedBy`, `source`, `deviceId`

### `Checkins`
`id`, `studentId`, `workoutId`, `date`, `time`, `type`, `checkedInAt`, `checkedOutAt`, `presenceSource`, `presenceStatus`, `usedLoad`, `difficulty`, `pain`, `notes`, `updatedAt`, `updatedBy`, `source`, `deviceId`

- `presenceSource`: origem operacional da presenca, por exemplo `catraca`, `app`, `painel-professor-tablet` ou `painel-administrativo`.
- `source`: origem tecnica da sincronizacao.
- A migracao do esquema 2 converte a primeira coluna antiga chamada `source` em `presenceSource` e preserva uma unica coluna `source` tecnica.
- `type = access` representa entrada e saida da academia; `type = workout` representa registro de treino.

### `SessoesTreino`
`id`, `studentId`, `workoutId`, `workoutTitle`, `division`, `startedAt`, `endedAt`, `durationMinutes`, `status`, `difficulty`, `pain`, `notes`, `totalSets`, `completedSets`, `createdAt`, `updatedAt`, `updatedBy`, `source`, `deviceId`

Uma linha representa uma execucao completa ou em andamento da ficha do professor.

### `SeriesRealizadas`
`id`, `sessionId`, `studentId`, `workoutId`, `exerciseItemId`, `exerciseId`, `exerciseName`, `setNumber`, `targetReps`, `actualReps`, `targetLoad`, `actualLoad`, `status`, `completedAt`, `notes`, `createdAt`, `updatedAt`, `updatedBy`, `source`, `deviceId`

Cada linha representa uma serie prevista ou concluida e permite calcular volume, carga e aderencia sem alterar a prescricao original.

### `Usuarios`
`id`, `accountId`, `name`, `cpf`, `email`, `passwordHash`, `role`, `status`, `lastLogin`, `updatedAt`, `updatedBy`, `source`, `deviceId`

`passwordHash` e legado e nao e exportado. As credenciais oficiais ficam exclusivamente em `Contas`.

### `Contas` (privada)
`id`, `personType`, `personId`, `login`, `email`, `role`, `permissions`, `active`, `passwordHash`, `passwordSalt`, `passwordAlgorithm`, `passwordVersion`, `passwordIterations`, `mustChangePassword`, `temporaryPasswordExpiresAt`, `failedAttempts`, `lockedUntil`, `lastLoginAt`, `passwordChangedAt`, `sessionVersion`, `createdAt`, `updatedAt`

### `Sessoes` (privada)
`id`, `accountId`, `tokenHash`, `deviceId`, `deviceName`, `createdAt`, `lastUsedAt`, `expiresAt`, `idleExpiresAt`, `revokedAt`, `revokedReason`, `ipReference`, `userAgentReference`, `sessionVersion`

### `TokensAcesso` e `TentativasAcesso` (privadas)
Guardam somente hash do QR temporario, validade, uso e auditoria da validacao. O token original permanece no celular durante no maximo 60 segundos.


### `TentativasLogin` (privada)

Registra somente metadados de autenticacao: `id`, `timestamp`, `login`, `accountId`, `result`, `reason`, `deviceId`, `deviceName` e `userAgentReference`. Nunca armazena senha, token ou hash de senha.

### `PresencaProfessores`
`id`, `staffId`, `staffName`, `date`, `clockIn`, `clockOut`, `durationMinutes`, `status`, `source`, `deviceId`, `notes`, `createdAt`, `updatedAt`, `updatedBy`

### `Config`
`id`, `appName`, `environment`, `datasetId`, `timezone`, `currency`, `logoUrl`, `supportPhone`, `whatsappNumber`, `apiBaseUrl`, `lastSnapshotAt`, `schemaVersion`, `plans`, `modalities`, `costCenters`, `paymentAlertDays`, `paymentGraceDays`, `blockAccessOnOverdue`, `updatedAt`, `updatedBy`, `source`, `deviceId`

`plans`, `modalities`, `costCenters` e `paymentAlertDays` sao arrays em JSON. As regras de mensalidade definem avisos, tolerancia e bloqueio do QR do aluno.

### `Log`
`timestamp`, `action`, `resource`, `recordId`, `changedFields`, `actor`, `source`, `deviceId`, `result`, `message`

O log guarda somente metadados da operacao e nomes dos campos alterados. Nao copia o registro completo, restricoes de saude, dados financeiros integrais ou senhas.

## Importacao e backup

- `importAll` exige um snapshot completo com todas as colecoes. Se uma colecao estiver ausente, a API bloqueia a importacao.
- `importPartial` altera somente as colecoes enviadas e nao esvazia as demais.
- A restauracao pelo painel mostra data e quantidades do backup antes da confirmacao.
- A restauracao usa uma unica chamada `importAll` e permanece pendente localmente se a API estiver indisponivel.
- Exclusoes enviam `expectedUpdatedAt`; se a versao remota mudou, a API devolve conflito e preserva a linha.
- Backups devem ficar fora da pasta do projeto e fora do ZIP de producao.

## Responsabilidades

### `painel.html`
Administracao, financeiro, configuracoes, estatisticas e presenca da equipe. Dados profissionais do aluno ficam somente para consulta.

### `prof.html`
Cadastro operacional do aluno, ficha profissional, treinos, avaliacoes, agenda, presencas, permanencia do professor e recebimento da mensalidade do aluno selecionado.

### `index.html`
Aplicativo individual mobile-first com login por matricula, troca de senha temporaria, QR assinado, ficha prescrita, execucao de series, agenda, frequencia, permanencia, evolucao, mensalidades e fila offline por conta.
