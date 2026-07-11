# Arquitetura dos paineis Pro Fitness

## Painel administrativo (`painel.html`)

- Uso principal em notebook.
- Interface exclusiva para computador ou notebook; celular nao e um alvo de uso administrativo.
- Responsavel por financeiro, indicadores, configuracoes e consultas administrativas.
- Pode receber mensalidades e consultar informacoes operacionais consolidadas.
- Nao cria ou edita treinos, avaliacoes, agenda profissional ou registros de acesso.
- Nao exibe medidas corporais, restricoes medicas ou detalhes profissionais.

## Painel do professor (`prof.html`)

- Uso principal em tablet de 8,7 polegadas.
- Responsavel pelo cadastro operacional do aluno, ficha profissional, treinos, avaliacoes, agenda e acesso.
- Pode receber a mensalidade do aluno selecionado, sem acesso ao caixa, despesas ou relatorios financeiros.
- Exibe somente o estado operacional `OK` ou `Bloqueado`.
- Salva primeiro no aparelho e sincroniza os registros alterados com a API.
- Registra entrada e saida dos professores no tablet, inclusive sem internet.

## Ponto da equipe

- Os professores sao cadastrados em Configuracoes no painel administrativo.
- Cada marcacao e gravada em `staffTimeEntries` e sincronizada com a aba `PontoProfessores`.
- O painel exibe o espelho de ponto por professor e periodo, com totais, jornadas abertas, CSV e impressao/PDF.
- O ponto nao e uma lista de chamada de alunos e nao altera o fluxo de presenca dos alunos.

## App do aluno (`index.html`)

- Fora do escopo das melhorias atuais.
- Nao deve ser alterado durante as fases do painel administrativo e do professor.

## Dados compartilhados

- `assets/js/shared-data.js` define modelos, armazenamento local e sincronizacao.
- `apps-script/api.gs` e a fonte principal da API.
- `api.txt` deve permanecer byte a byte identico a `apps-script/api.gs`.
- Alteracoes de esquema devem ser aditivas e executadas por `setupProFitnessSpreadsheet()`.
- Registros sincronizados recebem `updatedAt`, `updatedBy`, `source` e `deviceId` quando a aba oferece essas colunas.
- A API compara `updatedAt` e nao permite que uma versao antiga sobrescreva silenciosamente uma versao mais nova.
- Conflitos e falhas permanecem na fila do tablet; o indicador de pendencia tambem funciona como tentativa manual.

## Publicacao

- O frontend e publicado somente depois da validacao conjunta das fases.
- A API deve ser publicada antes do frontend quando houver novas colunas ou recursos.
- Nunca publicar uma fase intermediaria sem validacao local.
