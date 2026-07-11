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
`id`, `name`, `phone`, `email`, `birthDate`, `goal`, `restrictions`, `status`, `plan`, `monthlyFee`, `notes`, `createdAt`, `updatedAt`, `enrollmentToken`, `enrollmentStatus`, `enrollmentCompletedAt`, `appAccessPolicy`, `accessBlockReason`, `gateCode`, `lastGateSyncAt`, `avatarUrl`

### `Avaliacoes`
`id`, `studentId`, `date`, `weight`, `height`, `imc`, `bodyFat`, `chest`, `waist`, `hip`, `arm`, `thigh`, `photos`, `notes`, `updatedAt`

### `Treinos`
`id`, `studentId`, `title`, `division`, `muscleGroup`, `exercises`, `exerciseItems`, `sets`, `reps`, `load`, `rest`, `status`, `notes`, `createdAt`, `updatedAt`

### `Exercicios`
`id`, `name`, `muscleGroup`, `equipment`, `videoUrl`, `notes`

### `Agenda`
`id`, `studentId`, `date`, `time`, `type`, `status`, `notes`, `title`, `category`, `dayOfWeek`, `startTime`, `endTime`, `teacherId`, `teacherName`, `location`, `capacity`, `recurring`, `scheduleKind`, `updatedAt`

- Aulas individuais usam `studentId`, `date`, `time` e os status da agenda do aluno.
- A grade fixa usa `scheduleKind = weekly-class`, `recurring = true` e `dayOfWeek` de `0` (domingo) a `6` (sabado).
- `teacherId` fica preparado para o futuro modulo Professores; `teacherName` permite uso imediato no painel.

### `Pagamentos`
`id`, `studentId`, `reference`, `amount`, `discount`, `fine`, `netAmount`, `paidAmount`, `dueDate`, `status`, `method`, `paidAt`, `recordedBy`, `reversalReason`, `reversedBy`, `reversedAt`, `description`, `createdAt`, `updatedAt`, `notes`

### `Movimentacoes`
`id`, `date`, `time`, `type`, `category`, `description`, `amount`, `method`, `account`, `costCenter`, `studentId`, `paymentId`, `expenseId`, `status`, `voidReason`, `voidedBy`, `voidedAt`, `createdAt`, `updatedAt`, `notes`

### `Despesas`
`id`, `description`, `supplier`, `category`, `amount`, `dueDate`, `status`, `paidAt`, `method`, `account`, `costCenter`, `recurring`, `recurrenceId`, `document`, `createdAt`, `updatedAt`, `notes`

### `Fechamentos`
`id`, `date`, `openingBalance`, `cashIncome`, `cashExpense`, `expectedCash`, `countedCash`, `difference`, `totalIncome`, `totalExpense`, `closedBy`, `closedAt`, `notes`

### `Checkins`
`id`, `studentId`, `workoutId`, `date`, `time`, `type`, `checkedInAt`, `checkedOutAt`, `source`, `presenceStatus`, `usedLoad`, `difficulty`, `pain`, `notes`, `updatedAt`

- Use `type = access` para entradas da catraca e `type = workout` para treinos realizados.
- `checkedInAt` e `checkedOutAt` usam data/hora ISO e alimentam o indicador "Na academia agora".

### `Usuarios`
`id`, `name`, `email`, `passwordHash`, `role`, `status`, `lastLogin`, `updatedAt`, `updatedBy`, `source`, `deviceId`

### `PontoProfessores`
`id`, `staffId`, `staffName`, `date`, `clockIn`, `clockOut`, `durationMinutes`, `status`, `source`, `deviceId`, `notes`, `createdAt`, `updatedAt`, `updatedBy`

- `clockIn` e `clockOut` usam data/hora ISO.
- `durationMinutes` guarda o tempo calculado entre entrada e saida.
- Registros sem `clockOut` aparecem como jornada aberta no relatorio administrativo.
- O relatorio por professor e periodo fica em `painel.html > Equipe e ponto`.

### `Config`
`id`, `appName`, `timezone`, `currency`, `logoUrl`, `supportPhone`, `apiBaseUrl`, `lastSnapshotAt`, `plans`, `modalities`, `costCenters`, `updatedAt`

### `Log`
`timestamp`, `action`, `resource`, `recordId`, `payload`

## Boas praticas

- Use `id` unico em todas as abas.
- Salve arrays e objetos em JSON nas colunas `photos`, `exercises`, `exerciseItems` e `payload`.
- `exerciseItems` guarda cada exercicio do treino com `id`, `name`, `sets`, `reps`, `load`, `rest` e `notes`; `exercises` continua guardando os nomes para compatibilidade.
- Padronize datas em `YYYY-MM-DD` e horarios em `HH:MM`.
- Use validacao de dados no Sheets para campos como `status`, `type`, `method`, `role`, `enrollmentStatus` e `appAccessPolicy`.
- Proteja a aba `Usuarios` e, se necessario, mova autenticacao para outro servico.
- O painel do professor envia alteracoes registro por registro e mantem uma fila local quando a internet falha.
- As abas operacionais recebem `updatedBy`, `source` e `deviceId` para auditoria; `updatedAt` e usado na deteccao de conflitos.
- O painel administrativo e exclusivo para computador ou notebook.
- Depois de atualizar `api.gs`, execute novamente `setupProFitnessSpreadsheet()` para acrescentar novas colunas sem apagar dados.


## Responsabilidades das interfaces

### `painel.html` — administração e financeiro no notebook

- Uso principal pela administração da academia.
- Cadastro e acompanhamento financeiro, mensalidades, caixa, despesas, fechamentos e relatórios.
- A área de alunos é somente para consulta e estatísticas operacionais.
- O painel do notebook não cria nem edita treinos, avaliações físicas, dados de saúde, agenda individual ou presenças.
- O administrador pode receber mensalidades e consultar o que foi lançado pelo professor.

### `prof.html` — operação do professor no tablet

- Uso principal pelo professor em tablet de 8,7 polegadas.
- Cadastro e edição da ficha do aluno, objetivo, restrições e observações profissionais.
- Criação e edição de treinos, exercícios, avaliações físicas, agenda e presenças.
- Cadastro de novos alunos.
- Pode receber a mensalidade do aluno selecionado e dar baixa, mas não acessa caixa, despesas, relatórios ou histórico financeiro geral.
- O status operacional mostrado ao professor é somente `OK` ou `Bloqueado`.
- O tablet tambem registra o ponto de entrada e saida do professor; nao se trata de lista de chamada de alunos.

### `index.html` — aplicativo do aluno

- Consulta individual do próprio aluno.
- Não substitui os painéis administrativo ou do professor.
