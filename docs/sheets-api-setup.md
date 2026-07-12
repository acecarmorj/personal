# Integracao segura com Google Sheets

## Arquivos oficiais

- `apps-script/api.gs`: fonte editavel da API.
- `api.txt`: copia obrigatoria e byte a byte identica.
- `apps-script/.clasp.json`: configuracao do projeto Apps Script.
- `assets/js/app-config.js`: URL, ambiente e identificador da demonstracao.

## Preparacao pelo editor

1. Abra a planilha vinculada e acesse `Extensoes > Apps Script`.
2. Substitua o codigo por `apps-script/api.gs`.
3. Execute `setupProFitnessSpreadsheet()` pelo editor.
4. O primeiro setup cria automaticamente o pepper se ele ainda nao existir.
5. Em demonstracao, o primeiro setup tambem cria as contas demo uma unica vez; depois importe `assets/data/demo.json`.
6. Publique uma nova versao do Web App executada pelo proprietario e acessivel por qualquer pessoa.
7. O acesso anonimo ao Web App permite abrir o login; a API valida token e permissao internamente em toda operacao protegida.
8. Confirme `schemaVersion: 8` no retorno do setup e teste somente `GET ?action=health` sem autenticacao.

`setup`, inicializacao do pepper e criacao das contas demo nunca sao expostos pela interface ou por endpoint publico.

## Superficie da API

- Publico: `GET action=health` e `POST action=login`.
- Sessao: `logout`, `session` e `changePassword`.
- Aluno: `studentBootstrap`, `studentUpsert`, `studentDelete` e `requestGateToken`.
- Professor: `professorBootstrap`, `paymentContext`, `receivePayment` e `staffPresenceUpsert`.
- Administracao: snapshot, CRUD autorizado, contas, sessoes, importacao, exportacao e restauracao demo.
- Catraca simulada: `validateGate`, exigindo `gate.validate`.

Tokens sao enviados somente no corpo de requisicoes POST. `health` nao revela planilha, recursos, contagens ou IDs internos.

## Permissoes principais

- Aluno: apenas seus dados e registros de execucao.
- Professor: `professional.read`, `professional.write`, `payments.receive`, `staff.presence` e `gate.validate`.
- Administrador: `professional.read`, `finance.manage`, `users.manage`, `backups.manage`, `staff.presence.read` e `gate.validate`.
- Administrador nao recebe `professional.write` e professor nao recebe `finance.manage` por padrao.

## Sincronizacao

- Notebook, tablet e celular possuem armazenamento e filas separados por ambiente, superficie e conta.
- O aluno sincroniza somente sessoes e series proprias.
- O professor recebe pacote operacional sem financeiro geral e registra recebimento por endpoint dedicado.
- O administrador pode exportar e importar snapshot operacional; `Contas`, `Sessoes`, tokens e tentativas de acesso nunca entram no snapshot.
- Conflitos continuam protegidos por `updatedAt` e `expectedUpdatedAt`.

## Restauracao demonstrativa

- Exige administrador com `backups.manage`.
- Exige ambiente `demo` e frase `RESTAURAR DEMONSTRACAO`.
- Cria uma copia completa da planilha no Drive antes de importar.
- Falha do backup impede a restauracao.
- O servidor recusa a operacao em producao.

## Testes

- `node tests/smoke.mjs`: sintaxe, esquema, permissoes, PWA, pacote por perfil e base ficticia.
- `node tests/smoke.mjs --package`: valida copia limpa sem `.git` ou backups operacionais.


## Seguranca de sessao e diagnostico

- O endpoint publico `GET ?action=health` e somente leitura e nunca executa setup ou migracao.
- Migracoes sao aplicadas por `setupProFitnessSpreadsheet()` ou por operacoes autenticadas que exigem a estrutura atual.
- O painel administrativo permite consultar e revogar sessoes e ver tentativas recentes de login.
- A revogacao ou expiracao detectada limpa a sessao e os dados locais da interface correspondente.
- O desbloqueio do tablet renova a sessao existente e nao cria uma segunda sessao.
- A validacao do QR usa `LockService`, impedindo duas baixas simultaneas do mesmo token.
