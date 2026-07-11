# Arquitetura dos paineis Pro Fitness

## Painel administrativo (`painel.html`)

- Uso em notebook.
- Financeiro, configuracoes, indicadores, relatorios, consultas e ponto da equipe.
- Treinos, avaliacoes, agenda profissional e presencas ficam somente para consulta.
- Possui fila de sincronizacao persistente, status visivel, reenvio automatico e botao manual.
- Restauracao de backup exige snapshot completo, mostra um resumo e usa uma unica importacao integral.
- Se a importacao falhar, o snapshot restaurado permanece localmente pendente e bloqueia uma leitura remota que poderia sobrescreve-lo.

## Painel do professor (`prof.html`)

- Uso em tablet de 8,7 polegadas.
- Cadastro operacional, ficha profissional, treinos, avaliacoes, agenda, acesso e presencas.
- Recebe a mensalidade somente do aluno selecionado, sem abrir caixa, despesas ou relatorios gerais.
- Exibe somente `OK` ou `Bloqueado` como situacao operacional do aluno.
- Possui fila offline propria e ponto de entrada e saida do professor.

## Aplicativo do aluno (`index.html`)

- Uso prioritario em celular.
- QR de acesso, ficha prescrita, execucao serie por serie, agenda, frequencia, permanencia, evolucao e mensalidades individuais.
- O aluno nao edita a ficha do professor e nao cria presenca manual; entrada e saida vem dos check-ins da academia.
- Sessoes e series sao salvas primeiro no celular e enviadas por uma fila offline persistente.
- A sessao local possui versao para migracao futura ao login com usuario e senha.
- Nao substitui os paineis administrativo e profissional.

## Dados compartilhados

- `assets/js/shared-data.js`: modelos, migracoes locais e comunicacao com a API.
- `apps-script/api.gs`: API oficial e esquema da planilha.
- `api.txt`: copia textual identica da API.
- `assets/js/finance-core.js`: calculos financeiros reutilizados.

## Regras de sincronizacao

- Alteracoes comuns sao enviadas registro por registro.
- `updatedAt` protege contra sobrescrita por versao antiga.
- Exclusoes tambem transportam a versao conhecida e sao bloqueadas quando o registro remoto mudou.
- `presenceSource` registra a origem da presenca; `source` registra a origem tecnica da sincronizacao.
- Falhas permanecem em fila local no notebook, tablet ou celular do aluno.
- `importAll` e exclusivo para snapshots completos; `importPartial` nao altera colecoes ausentes.

## Estrutura do pacote

A raiz deve conter apenas:

- `index.html`
- `painel.html`
- `prof.html`
- `api.txt`
- `HISTORICO_DESENVOLVIMENTO.txt`

Pastas permitidas:

- `.github/`
- `apps-script/`
- `assets/`
- `docs/`
- `tests/`
- `tools/`

Nao incluir `.git`, `backups`, copias antigas ou arquivos soltos duplicados no ZIP entregue.

O repositorio e validado com `node tests/smoke.mjs`. Uma copia final limpa deve ser validada separadamente com `node tests/smoke.mjs --package`.
