# Integracao com Google Sheets

## Arquivos principais

- [api.gs](../apps-script/api.gs): API do Google Apps Script
- [app-config.js](../assets/js/app-config.js): URL do Web App
- [shared-data.js](../assets/js/shared-data.js): camada de sincronizacao

## Como publicar

1. Crie um projeto no Google Apps Script.
2. Cole o conteudo de [api.gs](../apps-script/api.gs).
3. Execute `setupPersonalProSpreadsheet()` uma vez.
4. Publique como `Web App` com acesso para quem vai usar o sistema.
5. Copie a URL publicada.
6. Edite [app-config.js](../assets/js/app-config.js) e substitua `COLE_A_URL_DO_WEB_APP_AQUI`.

## O que a API faz

- `setup`: cria a planilha e todas as abas obrigatorias.
- `health`: retorna status da API e da planilha.
- `exportAll`: devolve um snapshot completo do banco.
- `importAll`: grava um snapshot completo recebido do frontend.
- `upsert` e `delete`: mantem CRUD por recurso.

## Como usar no sistema

- O painel desktop tem os botoes `Preparar Sheets` e `Sincronizar Sheets`.
- Quando `apiBaseUrl` estiver configurada, app e painel tentam carregar o snapshot remoto ao abrir.
- Quando houver mudancas locais, o sistema tenta sincronizar automaticamente.

## Observacao importante

- Se estiver abrindo os arquivos HTML diretamente do disco e houver bloqueio de requisicoes do navegador, rode o frontend por um servidor local simples.
