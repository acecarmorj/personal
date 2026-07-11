# Integracao com Google Sheets

## Arquivos principais

- [api.gs](../apps-script/api.gs): API do Google Apps Script
- [app-config.js](../assets/js/app-config.js): URL do Web App
- [shared-data.js](../assets/js/shared-data.js): camada de sincronizacao

## Como publicar

1. Abra a planilha que sera usada como banco de dados.
2. Nessa planilha, acesse `Extensoes > Apps Script`.
3. Cole o conteudo de [api.gs](../apps-script/api.gs).
4. Execute `setupProFitnessSpreadsheet()` uma vez e autorize o acesso.
5. Confirme que as abas foram criadas na mesma planilha.
6. Publique como `Web App` com acesso para quem vai usar o sistema.
7. Copie a URL publicada.
8. Edite [app-config.js](../assets/js/app-config.js) e substitua `COLE_A_URL_DO_WEB_APP_AQUI`.

## O que a API faz

- `setup`: cria ou completa as abas obrigatorias na planilha vinculada.
- `health`: retorna status da API e da planilha.
- `exportAll`: devolve um snapshot completo do banco.
- `importAll`: grava um snapshot completo recebido do frontend.
- `upsert` e `delete`: mantem CRUD por recurso.
- `upsert` compara `updatedAt` e recusa sobrescrita quando a planilha ja possui uma versao mais nova.

## Como usar no sistema

- O painel desktop tem os botoes `Preparar Sheets` e `Sincronizar Sheets`.
- Quando `apiBaseUrl` estiver configurada, app e painel tentam carregar o snapshot remoto ao abrir.
- Quando houver mudancas locais, o sistema tenta sincronizar automaticamente.
- O painel do professor salva primeiro no tablet e envia os registros alterados por uma fila local.
- Se a internet falhar, as pendencias permanecem no aparelho e sao reenviadas automaticamente.
- O indicador de pendencia do tablet pode ser acionado para tentar o envio manualmente e preserva a ultima mensagem de erro.
- O painel administrativo e o app do aluno tambem usam atualizacao por registro nas operacoes comuns, reduzindo o risco de sobrescrever alteracoes de outro aparelho.

## Observacao importante

- A API nao cria uma planilha separada. O primeiro `setupProFitnessSpreadsheet()` precisa ser executado
  pelo editor aberto em `Extensoes > Apps Script`, pois o Web App nao recebe o contexto da planilha ativa.
- Se uma versao anterior criou outra planilha, execute novamente `setupProFitnessSpreadsheet()` dentro da
  planilha correta e publique uma nova versao do Web App.
- Depois de substituir `api.gs` por uma versao nova, execute `setupProFitnessSpreadsheet()` novamente e publique uma nova versao do Web App para acrescentar colunas e codigo sem apagar registros.
- Se estiver abrindo os arquivos HTML diretamente do disco e houver bloqueio de requisicoes do navegador, rode o frontend por um servidor local simples.
