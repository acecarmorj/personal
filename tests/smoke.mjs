import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMode = process.argv.includes("--package");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const hash = (relativePath) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");

const javascriptFiles = [
  "assets/js/finance-core.js",
  "assets/js/shared-data.js",
  "assets/js/app.js",
  "assets/js/painel.js",
  "assets/js/prof.js",
  "tools/generate-demo-data.mjs"
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}

const apiSource = read("apps-script/api.gs");
const apiCheck = spawnSync(process.execPath, ["--check", "-"], { cwd: root, input: apiSource, encoding: "utf8" });
assert.equal(apiCheck.status, 0, `apps-script/api.gs: ${apiCheck.stderr}`);
assert.equal(hash("api.txt"), hash("apps-script/api.gs"), "api.txt deve ser identico a apps-script/api.gs");

const apiContext = { Date, JSON, Object, Array, String, Number, Math, Set, Map };
vm.runInNewContext(`${apiSource}\nthis.__apiTest = { SHEETS, CURRENT_SCHEMA_VERSION, buildConfigSnapshotMetadata, validateCompleteSnapshot, normalizePartialSnapshot, hasDeleteConflict, resolveResourceName };`, apiContext);
const api = apiContext.__apiTest;
assert.equal(api.CURRENT_SCHEMA_VERSION, 3, "schemaVersion da API deve ser 3");

for (const [resource, definition] of Object.entries(api.SHEETS)) {
  const headers = [...definition.headers];
  assert.equal(new Set(headers).size, headers.length, `Cabecalhos duplicados em ${resource}`);
}
assert.equal(api.SHEETS.checkins.headers.filter((header) => header === "source").length, 1, "Checkins deve ter uma unica coluna source");
assert.ok(api.SHEETS.checkins.headers.includes("presenceSource"), "Checkins deve possuir presenceSource");
assert.ok(api.SHEETS.config.headers.includes("schemaVersion"), "Config deve registrar schemaVersion");
assert.ok(api.SHEETS.workoutSessions, "API deve possuir SessoesTreino");
assert.ok(api.SHEETS.exerciseSets, "API deve possuir SeriesRealizadas");
assert.ok(!api.SHEETS.log.headers.includes("payload"), "Log remoto nao deve armazenar payload completo");
assert.equal(api.resolveResourceName("staffTimeEntries"), "staffTimeEntries", "API deve resolver recursos compostos");
assert.equal(api.resolveResourceName("WORKOUTSESSIONS"), "workoutSessions", "API deve resolver novos recursos sem diferenciar caixa");

const originalConfig = {
  id: "CFG-TEST",
  plans: [{ id: "P1", name: "Plano teste", monthlyFee: 99 }],
  modalities: ["Natacao"],
  costCenters: ["geral"],
  updatedBy: "Administrador",
  source: "painel-administrativo",
  deviceId: "DEV-1"
};
const metadataConfig = JSON.parse(JSON.stringify(api.buildConfigSnapshotMetadata(originalConfig, {
  now: "2026-07-11T12:00:00.000Z",
  timezone: "America/Sao_Paulo",
  apiBaseUrl: "https://example.test/exec"
})));
assert.deepEqual(metadataConfig.plans, originalConfig.plans, "Atualizacao de metadados deve preservar planos");
assert.deepEqual(metadataConfig.modalities, originalConfig.modalities, "Atualizacao de metadados deve preservar modalidades");
assert.deepEqual(metadataConfig.costCenters, originalConfig.costCenters, "Atualizacao de metadados deve preservar centros de custo");
assert.equal(metadataConfig.schemaVersion, 3);

const completeApiSnapshot = Object.fromEntries(Object.keys(api.SHEETS).map((resource) => [resource, []]));
assert.equal(api.validateCompleteSnapshot(completeApiSnapshot), undefined);
let incompleteCode = "";
try {
  api.validateCompleteSnapshot({ students: [] });
} catch (error) {
  incompleteCode = error.code;
}
assert.equal(incompleteCode, "INCOMPLETE_SNAPSHOT", "API deve bloquear snapshot integral incompleto");
const partial = JSON.parse(JSON.stringify(api.normalizePartialSnapshot({ students: [] })));
assert.deepEqual(Object.keys(partial), ["students"], "Importacao parcial deve manter somente colecoes enviadas");
assert.match(apiSource, /action === "importpartial"/, "API deve implementar importPartial");
assert.match(apiSource, /ensureApiReady/, "API deve usar verificacao leve nas requisicoes comuns");
assert.match(apiSource, /buildAuditLogEntry/, "API deve gerar log tecnico reduzido");
assert.equal(api.hasDeleteConflict({ updatedAt: "2026-07-11T10:00:00.000Z" }, "2026-07-11T10:00:00.000Z"), false);
assert.equal(api.hasDeleteConflict({ updatedAt: "2026-07-11T10:05:00.000Z" }, "2026-07-11T10:00:00.000Z"), true, "Exclusao deve detectar edicao remota posterior");

const financeContext = { window: {} };
vm.runInNewContext(read("assets/js/finance-core.js"), financeContext);
const finance = financeContext.window.ProFitnessFinance;
const partialPayment = { amount: 150, discount: 10, fine: 5, paidAmount: 50, status: "parcial", dueDate: "2026-07-10" };
assert.equal(finance.netAmount(partialPayment), 145);
assert.equal(finance.outstandingAmount(partialPayment), 95);
assert.equal(finance.effectivePaymentStatus(partialPayment, "2026-07-11"), "parcial");

const storage = new Map();
const sharedContext = {
  window: { location: { pathname: "/painel.html" }, setTimeout, clearTimeout },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  },
  Intl,
  Date,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  Map,
  Set,
  console,
  fetch: async () => { throw new Error("fetch nao esperado no teste"); },
  AbortController,
  URL,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(read("assets/js/shared-data.js"), sharedContext);
const Store = sharedContext.window.ProFitnessStore;
const emptyCollections = ["students", "assessments", "workouts", "schedule", "payments", "movements", "expenses", "cashClosings", "checkins", "workoutSessions", "exerciseSets", "exercises", "users", "staffTimeEntries", "config", "log"];
const cleanSnapshot = Object.fromEntries(emptyCollections.map((key) => [key, []]));
const migratedClean = Store.migrateData(cleanSnapshot);
for (const key of emptyCollections) assert.equal(migratedClean[key].length, 0, `Backup limpo deve manter ${key} vazio`);
assert.equal(Store.validateCompleteSnapshot(cleanSnapshot), true);
const legacyCompleteSnapshot = { ...cleanSnapshot };
delete legacyCompleteSnapshot.workoutSessions;
delete legacyCompleteSnapshot.exerciseSets;
assert.equal(Store.validateCompleteSnapshot(legacyCompleteSnapshot), true, "Backup anterior deve continuar restauravel sem sessoes e series");
assert.equal(Store.migrateData(legacyCompleteSnapshot).workoutSessions.length, 0);
assert.equal(Store.migrateData(legacyCompleteSnapshot).exerciseSets.length, 0);
const workoutSession = JSON.parse(JSON.stringify(Store.createWorkoutSessionRecord({ studentId: "ALU-1", workoutId: "TR-1", startedAt: "2026-07-11T10:00:00.000Z" })));
assert.equal(workoutSession.status, "em_andamento");
assert.equal(workoutSession.studentId, "ALU-1");
const exerciseSet = JSON.parse(JSON.stringify(Store.createExerciseSetRecord({ sessionId: workoutSession.id, exerciseName: "Supino", setNumber: 2, actualReps: 10, actualLoad: 30 })));
assert.equal(exerciseSet.setNumber, 2);
assert.equal(exerciseSet.actualLoad, 30);
const overdueAccessSnapshot = Store.migrateData({
  ...cleanSnapshot,
  students: [{ id: "ALU-ACCESS", name: "Aluno", status: "ativo", enrollmentStatus: "ativo", appAccessPolicy: "auto" }],
  payments: [{ id: "PG-ACCESS", studentId: "ALU-ACCESS", reference: Store.currentMonth(), dueDate: "2026-07-01", status: "vencido", amount: 89.9 }],
  config: [{ id: "CONFIG-001", blockAccessOnOverdue: false, paymentGraceDays: 0 }]
});
assert.equal(Store.getAccessState(overdueAccessSnapshot, "ALU-ACCESS").allowsGate, true, "Config deve permitir acesso com mensalidade vencida quando bloqueio automatico estiver desligado");
overdueAccessSnapshot.config[0].blockAccessOnOverdue = true;
assert.equal(Store.getAccessState(overdueAccessSnapshot, "ALU-ACCESS").allowsGate, false, "Config deve bloquear atraso quando regra estiver ativa");
const deleteBefore = { ...cleanSnapshot, students: [{ id: "ALU-DEL", updatedAt: "2026-07-11T10:00:00.000Z" }] };
const deleteOperations = JSON.parse(JSON.stringify(Store.buildRemoteRecordOperations(deleteBefore, cleanSnapshot, ["students"])));
assert.equal(deleteOperations.length, 1);
assert.equal(deleteOperations[0].action, "delete");
assert.equal(deleteOperations[0].data.expectedUpdatedAt, "2026-07-11T10:00:00.000Z", "Exclusao deve transportar a versao conhecida");

const oldCheckinSnapshot = Object.fromEntries(emptyCollections.map((key) => [key, []]));
oldCheckinSnapshot.checkins = [{ id: "CK-OLD", studentId: "ALU-1", type: "access", source: "catraca" }];
const migratedCheckin = JSON.parse(JSON.stringify(Store.migrateData(oldCheckinSnapshot).checkins[0]));
assert.equal(migratedCheckin.presenceSource, "catraca", "Source antigo deve migrar para presenceSource");
assert.equal(migratedCheckin.source, "", "Source tecnico nao deve reutilizar automaticamente a origem operacional antiga");

const htmlPairs = [
  ["index.html", "assets/js/app.js"],
  ["painel.html", "assets/js/painel.js"],
  ["prof.html", "assets/js/prof.js"]
];

for (const [htmlFile, jsFile] of htmlPairs) {
  const html = read(htmlFile);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${htmlFile} possui IDs duplicados`);
  const idSet = new Set(ids);
  const references = [...read(jsFile).matchAll(/getElementById\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  const dynamicIds = new Set(["logoutButton", "sectionTitle"]);
  const missing = [...new Set(references)].filter((id) => !idSet.has(id) && !dynamicIds.has(id));
  assert.deepEqual(missing, [], `${jsFile} referencia IDs ausentes: ${missing.join(", ")}`);
}

for (const cssFile of ["assets/css/style.css", "assets/css/painel.css", "assets/css/prof.css"]) {
  const css = read(cssFile);
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, `${cssFile} possui chaves desbalanceadas`);
}

const panelHtml = read("painel.html");
const panelJs = read("assets/js/painel.js");
const studentJs = read("assets/js/app.js");
const studentHtml = read("index.html");
const professorJs = read("assets/js/prof.js");
const professorHtml = read("prof.html");
assert.match(panelHtml, /Resumo administrativo/, "Painel administrativo deve possuir resumo de consulta");
assert.doesNotMatch(panelHtml, /id="newStudentButton"/, "Painel administrativo nao deve cadastrar aluno");
assert.match(professorHtml, /id="newProfessorStudent"/, "Painel do professor deve cadastrar aluno");
assert.match(professorHtml, /id="toggleStaffClockButton"/, "Painel do professor deve registrar entrada e saida");
assert.match(panelHtml, /id="staffTimePrintableReport"/, "Painel administrativo deve exibir o relatorio de ponto");
assert.doesNotMatch(professorHtml, /Caixa diario|Despesas da academia|Relatorios e resultados/, "Painel do professor nao deve expor modulos financeiros administrativos");
assert.match(panelHtml, /id="adminSyncStatus"/, "Painel deve mostrar status de sincronizacao");
assert.match(panelHtml, /id="adminPendingSyncButton"/, "Painel deve permitir reenviar pendencias");
assert.match(panelHtml, /id="paymentRulesForm"/, "Painel deve configurar alertas e bloqueio do aluno");
assert.match(panelJs, /ADMIN_SYNC_QUEUE_KEY/, "Painel deve possuir fila persistente");
assert.match(panelJs, /ADMIN_PENDING_SNAPSHOT_KEY/, "Painel deve preservar restauracao integral pendente");
assert.match(panelJs, /flushAdminSyncQueue/, "Painel deve reenviar a fila");
assert.doesNotMatch(panelJs, /catch\(\(\) => null\)/, "Painel nao deve ignorar falhas de sincronizacao silenciosamente");
assert.match(panelJs, /Store\.validateCompleteSnapshot\(snapshot\)/, "Restauracao deve validar snapshot completo");
const restoreBlock = panelJs.slice(panelJs.indexOf("async function restoreDataBackup"), panelJs.indexOf("function parseCsvRows"));
assert.match(restoreBlock, /saveAdminPendingSnapshot/, "Restauracao deve manter snapshot completo pendente ate o envio");
assert.doesNotMatch(restoreBlock, /enqueueAdminSyncOperations/, "Restauracao integral nao deve criar milhares de operacoes individuais");
assert.match(panelJs, /Store\.pushRemoteSnapshot\(pendingSnapshot\.snapshot\)/, "Restauracao deve usar importAll em uma unica chamada");
const pushSnapshotBlock = read("assets/js/shared-data.js").slice(
  read("assets/js/shared-data.js").indexOf("async function pushRemoteSnapshot"),
  read("assets/js/shared-data.js").indexOf("async function pushRemotePartialSnapshot")
);
assert.doesNotMatch(pushSnapshotBlock, /saveData\(/, "Envio remoto de snapshot nao deve sobrescrever alteracoes locais feitas durante a requisicao");
assert.match(studentJs, /STUDENT_SYNC_QUEUE_KEY/, "App do aluno deve possuir fila offline persistente");
assert.match(studentJs, /flushStudentSyncQueue/, "App do aluno deve reenviar pendencias");
assert.match(studentJs, /workoutSessions.*exerciseSets.*checkins/s, "Fila do aluno deve sincronizar sessoes, series e treinos");
assert.doesNotMatch(studentJs, /catch\(\(\) => null\)/, "App do aluno nao deve ignorar falhas de sincronizacao");
assert.doesNotMatch(studentJs, /syncSnapshotChanges/, "App do aluno deve usar fila incremental propria");
for (const screen of ["home", "workouts", "agenda", "evolution", "payments"]) {
  assert.match(studentHtml, new RegExp(`data-screen="${screen}"`), `App do aluno deve possuir navegacao ${screen}`);
}
assert.match(studentHtml, /id="workoutSessionDialog"/, "App deve possuir execucao de treino em tela dedicada");
assert.doesNotMatch(studentHtml, /id="restoreDemoButton"/, "App publicado nao deve expor restauracao de demonstracao");
assert.match(professorJs, /exerciseId/, "Professor deve preservar vinculo com catalogo de exercicios");

if (packageMode) {
  const allowedRootFiles = new Set(["index.html", "painel.html", "prof.html", "api.txt", "HISTORICO_DESENVOLVIMENTO.txt"]);
  const allowedRootDirectories = new Set([".github", "apps-script", "assets", "docs", "tests", "tools"]);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile()) assert.ok(allowedRootFiles.has(entry.name), `Arquivo indevido na raiz: ${entry.name}`);
    if (entry.isDirectory()) assert.ok(allowedRootDirectories.has(entry.name), `Pasta indevida no pacote: ${entry.name}`);
  }
  assert.equal(exists(".git"), false, "ZIP final nao deve conter .git");
  assert.equal(exists("backups"), false, "ZIP final nao deve conter backups");
}
assert.match(read("HISTORICO_DESENVOLVIMENTO.txt"), /ULTIMA ATUALIZACAO: 11\/07\/2026/);
assert.match(read("docs/estrutura-planilha.md"), /presenceSource/);
assert.match(read("docs/sheets-api-setup.md"), /schemaVersion: 3/);
const demoTool = read("tools/generate-demo-data.mjs");
assert.match(demoTool, /PersonalPro-backups/, "Gerador deve salvar backups fora do projeto por padrao");
assert.doesNotMatch(demoTool, /payload:\s*JSON\.stringify/, "Gerador nao deve recriar payload integral no log");
assert.match(apiSource, /migrateLogHeaders/, "API deve remover a coluna antiga payload durante a migracao");

console.log(`Smoke tests (${packageMode ? "pacote" : "repositorio"}): OK`);
