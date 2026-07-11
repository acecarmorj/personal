# Integracao com Google Sheets

## Arquivos oficiais

- `apps-script/api.gs`: fonte editavel da API.
- `api.txt`: copia obrigatoria e identica da API, mantida na raiz.
- `apps-script/.clasp.json`: unica configuracao do Clasp.
- `assets/js/app-config.js`: URL do Web App.
- `assets/js/shared-data.js`: modelos, armazenamento local e comunicacao remota.

## Publicacao segura

1. Abra a planilha que sera usada como banco.
2. Acesse `Extensoes > Apps Script` nessa propria planilha.
3. Substitua o codigo pelo conteudo de `apps-script/api.gs`.
4. Execute `setupProFitnessSpreadsheet()` e autorize o acesso.
5. Confirme que a resposta informa `schemaVersion: 3`.
6. Publique uma **nova versao** do Web App.
7. Confirme ou atualize a URL em `assets/js/app-config.js`.
8. Teste `?action=health` e `?action=exportAll` antes de usar o sistema.

## Endpoints

- `GET ?action=setup`: cria, migra e formata a estrutura completa.
- `GET ?action=health`: informa planilha, recursos e versao do esquema.
- `GET ?action=exportAll`: exporta todas as colecoes e atualiza os metadados sem apagar catalogos.
- `GET ?resource=students`: consulta um recurso.
- `POST action=upsert`: cria ou atualiza um registro.
- `POST action=delete`: exclui por ID e aceita `expectedUpdatedAt` para impedir a remocao de uma versao alterada.
- `POST action=importAll`: substituicao integral, aceita somente snapshot completo.
- `POST action=importPartial`: substitui apenas as colecoes enviadas.

## Sincronizacao

### Notebook

- Salva primeiro no `localStorage`.
- Mantem fila persistente de operacoes pendentes.
- Restauracoes integrais usam uma unica chamada `importAll`; se o envio falhar, o snapshot completo permanece pendente no navegador.
- Reenvia ao abrir o painel, a cada minuto, quando a internet volta ou ao clicar em `Sincronizar agora`.
- Mostra quantidade pendente, ultimo envio e falhas da API.
- Uma falha nao e ignorada e nao apaga o dado local.

### Tablet

- Mantem a fila propria do professor.
- Salva e trabalha offline.
- Reenvia automaticamente ao recuperar a conexao.

### Celular do aluno

- Sincroniza somente aluno, sessoes, series e check-ins alterados pelo aplicativo.
- Consolida mudancas repetidas da mesma serie antes do envio.
- Nao atualiza a base remota enquanto existir alteracao local pendente.
- O botao de status permite repetir o envio manualmente.

### Conflitos

- A API compara `updatedAt`.
- Um registro antigo nao substitui silenciosamente um registro mais novo.
- Uma exclusao informa `expectedUpdatedAt` e e bloqueada se o registro remoto tiver sido editado.
- Em conflito, a operacao permanece pendente para conferencia.

## Teste de integracao recomendado

1. Criar ou editar um aluno no tablet.
2. Confirmar a linha na planilha.
3. Sincronizar o notebook e conferir o aluno.
4. Registrar um pagamento no notebook.
5. Confirmar `Pagamentos` e `Movimentacoes` na planilha.
6. Desligar a internet, fazer uma alteracao e confirmar a pendencia.
7. Restaurar a internet e verificar o envio sem duplicacao.
8. Tentar excluir offline um registro alterado em outro dispositivo e confirmar que a exclusao fica pendente.
9. Iniciar um treino no aluno, concluir uma serie e confirmar as linhas em `SessoesTreino` e `SeriesRealizadas`.

## Testes automatizados

- `node tests/smoke.mjs`: valida o repositorio de desenvolvimento, incluindo sintaxe, API, HTML e regras funcionais.
- `node tests/smoke.mjs --package`: valida uma copia final limpa e exige ausencia de `.git`, `.gitignore` e `backups`.

## Observacoes

- A API nao cria outra planilha automaticamente.
- Requisicoes comuns nao executam redimensionamento e formatacao completa de todas as abas.
- Depois de qualquer mudanca estrutural, execute novamente o `setup` e publique uma nova versao.
