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
  "assets/js/demo-data.js",
  "assets/js/shared-data.js",
  "assets/js/app.js",
  "assets/js/painel.js",
  "assets/js/prof.js",
  "assets/js/pwa.js",
  "sw.js",
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

const toSignedBytes = (buffer) => [...buffer].map((value) => value > 127 ? value - 256 : value);
const apiContext = {
  Date, JSON, Object, Array, String, Number, Math, Set, Map,
  Utilities: {
    DigestAlgorithm: { SHA_256: "sha256" },
    newBlob: (value) => ({ getBytes: () => toSignedBytes(Buffer.from(String(value), "utf8")) }),
    base64Encode: (bytes) => Buffer.from(bytes.map((value) => value & 255)).toString("base64"),
    base64Decode: (value) => toSignedBytes(Buffer.from(String(value), "base64")),
    computeDigest: (_algorithm, bytes) => toSignedBytes(crypto.createHash("sha256").update(Buffer.from(bytes.map((value) => value & 255))).digest()),
    computeHmacSha256Signature: (value, key) => toSignedBytes(crypto.createHmac("sha256", Buffer.from(key.map((item) => item & 255))).update(Buffer.from(value.map((item) => item & 255))).digest()),
    getUuid: () => "12345678-1234-1234-1234-123456789abc"
  }
};
vm.runInNewContext(`${apiSource}\nthis.__apiTest = { SHEETS, CURRENT_SCHEMA_VERSION, getSnapshotResourceNames, buildConfigSnapshotMetadata, validateCompleteSnapshot, normalizePartialSnapshot, hasDeleteConflict, resolveResourceName, derivePasswordCredential, constantTimeEqual, getSessionPolicy, sanitizeSession, getAccountPermissions, hasPermission, authorizeGenericOperation, normalizeLogin };`, apiContext);
const api = apiContext.__apiTest;
assert.equal(api.CURRENT_SCHEMA_VERSION, 9, "schemaVersion da API deve ser 9");

for (const [resource, definition] of Object.entries(api.SHEETS)) {
  const headers = [...definition.headers];
  assert.equal(new Set(headers).size, headers.length, `Cabecalhos duplicados em ${resource}`);
}
assert.equal(api.SHEETS.checkins.headers.filter((header) => header === "source").length, 1, "Checkins deve ter uma unica coluna source");
assert.ok(api.SHEETS.checkins.headers.includes("presenceSource"), "Checkins deve possuir presenceSource");
assert.ok(api.SHEETS.config.headers.includes("schemaVersion"), "Config deve registrar schemaVersion");
assert.ok(api.SHEETS.workoutSessions, "API deve possuir SessoesTreino");
assert.ok(api.SHEETS.exerciseSets, "API deve possuir SeriesRealizadas");
assert.ok(api.SHEETS.accounts, "API deve possuir Contas");
assert.ok(api.SHEETS.sessions, "API deve possuir Sessoes");
assert.ok(api.SHEETS.gateTokens, "API deve possuir tokens temporarios de acesso");
assert.ok(api.SHEETS.accessAttempts, "API deve auditar tentativas de acesso");
assert.ok(api.SHEETS.loginAttempts, "API deve auditar tentativas de login");
assert.ok(api.SHEETS.students.headers.includes("enrollmentNumber"), "Aluno deve possuir numero de matricula");
assert.ok(api.SHEETS.students.headers.includes("accountId"), "Aluno deve vincular uma conta");
for (const header of ["collectionLastContactAt", "collectionContactType", "collectionNotes", "paymentPromiseDate"]) {
  assert.ok(api.SHEETS.payments.headers.includes(header), `Pagamentos deve possuir ${header}`);
}
assert.ok(!api.getSnapshotResourceNames().includes("accounts"), "Snapshot nao deve exportar contas");
assert.ok(!api.getSnapshotResourceNames().includes("sessions"), "Snapshot nao deve exportar sessoes");
assert.ok(!api.SHEETS.log.headers.includes("payload"), "Log remoto nao deve armazenar payload completo");
assert.equal(api.resolveResourceName("staffTimeEntries"), "staffTimeEntries", "API deve resolver recursos compostos");
assert.equal(api.resolveResourceName("WORKOUTSESSIONS"), "workoutSessions", "API deve resolver novos recursos sem diferenciar caixa");
const passwordOptions = { salt: Buffer.from("salt-individual").toString("base64"), iterations: 10 };
const passwordA = JSON.parse(JSON.stringify(api.derivePasswordCredential("SenhaDemo123", "pepper-test", passwordOptions)));
const passwordB = JSON.parse(JSON.stringify(api.derivePasswordCredential("SenhaDemo123", "pepper-test", passwordOptions)));
const passwordC = JSON.parse(JSON.stringify(api.derivePasswordCredential("OutraSenha123", "pepper-test", passwordOptions)));
const expectedPasswordHash = crypto.pbkdf2Sync(Buffer.from("SenhaDemo123\u001fpepper-test", "utf8"), Buffer.from("salt-individual", "utf8"), 10, 32, "sha256").toString("base64");
assert.equal(passwordA.passwordHash, expectedPasswordHash, "Implementacao V8 deve corresponder ao PBKDF2-HMAC-SHA256 padrao");
assert.equal(passwordA.passwordHash, passwordB.passwordHash, "PBKDF2 deve ser deterministico com os mesmos parametros");
assert.notEqual(passwordA.passwordHash, passwordC.passwordHash, "PBKDF2 deve diferenciar senhas");
assert.equal(api.constantTimeEqual(passwordA.passwordHash, passwordB.passwordHash), true);
assert.equal(api.constantTimeEqual(passwordA.passwordHash, passwordC.passwordHash), false);
assert.equal(passwordA.passwordAlgorithm, "PBKDF2-HMAC-SHA256");
assert.equal(passwordA.passwordVersion, 1);
assert.equal(api.getSessionPolicy("professor").idleMinutes, 15, "Tablet do professor deve bloquear por inatividade curta");
assert.equal(api.getSessionPolicy("admin").absoluteMinutes, 480, "Sessao administrativa deve ser limitada");
const publicSession = JSON.parse(JSON.stringify(api.sanitizeSession({ id: "S1", tokenHash: "segredo", ipReference: "ip", userAgentReference: "ua", deviceName: "Tablet" })));
assert.equal(publicSession.tokenHash, undefined, "Sessao devolvida nao deve revelar hash do token");
assert.equal(publicSession.ipReference, undefined, "Sessao devolvida nao deve revelar referencia de IP");
const professorAccount = { role: "professor", permissions: [] };
const adminAccount = { role: "admin", permissions: [] };
assert.equal(api.hasPermission(professorAccount, "payments.receive"), true, "Professor deve poder receber mensalidade individual");
assert.equal(api.hasPermission(professorAccount, "finance.manage"), false, "Professor nao deve acessar financeiro geral");
assert.equal(api.hasPermission(professorAccount, "professional.write"), true, "Professor deve editar dados profissionais");
assert.equal(api.hasPermission(adminAccount, "professional.read"), true, "Administrador deve consultar dados profissionais");
assert.equal(api.hasPermission(adminAccount, "professional.write"), false, "Administrador nao deve editar dados profissionais por padrao");
assert.equal(api.hasPermission(adminAccount, "finance.manage"), true, "Administrador deve gerir financeiro");
assert.equal(api.hasPermission(professorAccount, "staff.presence"), true, "Professor deve registrar presenca operacional");
assert.equal(api.hasPermission(adminAccount, "staff.presence.read"), true, "Administrador deve consultar permanencia da equipe");
assert.throws(() => api.authorizeGenericOperation(professorAccount, "payments", "read"), /permissao/i, "Professor nao pode listar pagamentos pelo CRUD geral");
assert.equal(api.normalizeLogin(" 000123 "), "000123", "Login deve preservar zeros a esquerda da matricula");

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
assert.equal(metadataConfig.schemaVersion, 9);

const completeApiSnapshot = Object.fromEntries(api.getSnapshotResourceNames().map((resource) => [resource, []]));
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
assert.match(apiSource, /METHOD_NOT_ALLOWED/, "API deve bloquear leituras publicas fora do health");
const healthBlock = apiSource.slice(apiSource.indexOf("function doGet"), apiSource.indexOf("function doPost"));
assert.doesNotMatch(healthBlock, /ensureApiReady/, "Health publico nao deve executar migracao");
assert.match(apiSource, /SETUP_NOT_PUBLIC/, "Setup nao deve ser exposto pelo Web App");
assert.match(apiSource, /RESTAURAR DEMONSTRACAO/, "Restauracao demo deve exigir frase reforcada");
assert.match(apiSource, /DriveApp\.getFileById/, "Restauracao demo deve criar copia da planilha antes de importar");
assert.match(apiSource, /getConfiguredEnvironment\(\) !== "demo"/, "Restauracao demo deve ser recusada em producao");
assert.match(apiSource, /action === "requestgatetoken"/, "QR deve ser emitido somente para aluno autenticado");
assert.match(apiSource, /action === "validategate"/, "Leitor deve validar QR no servidor");
assert.match(apiSource, /LockService\.getScriptLock\(\)/, "Validacao do QR deve usar trava atomica");
assert.match(apiSource, /action === "listloginattempts"/, "Administrador deve consultar tentativas de login");
assert.match(apiSource, /action === "revokeaccountsessions"/, "Administrador deve encerrar todas as sessoes de uma conta");
assert.match(apiSource, /action === "unlocksession"/, "Tablet deve desbloquear a sessao atual sem novo login");
assert.match(apiSource, /Codigo ja utilizado/, "QR deve detectar reutilizacao");
assert.match(apiSource, /action === "studentbootstrap"/, "API deve fornecer pacote individual autenticado");
assert.match(apiSource, /\["workoutSessions", "exerciseSets"\]/, "Aluno deve alterar somente sessoes e series proprias");
assert.match(apiSource, /action === "professorbootstrap"/, "Professor deve receber pacote operacional proprio");
assert.match(apiSource, /action === "receivepayment"/, "Recebimento do professor deve usar endpoint dedicado");
assert.match(apiSource, /action === "staffpresenceupsert"/, "Presenca do professor deve validar a conta autenticada");
assert.match(apiSource, /ensureApiReady/, "API deve usar verificacao leve nas requisicoes comuns");
assert.match(apiSource, /buildAuditLogEntry/, "API deve gerar log tecnico reduzido");
assert.doesNotMatch(apiSource, /Logger\.log\([^\n]*Demo1234/, "Senha demonstrativa nao deve aparecer no Logger");
assert.equal(api.hasDeleteConflict({ updatedAt: "2026-07-11T10:00:00.000Z" }, "2026-07-11T10:00:00.000Z"), false);
assert.equal(api.hasDeleteConflict({ updatedAt: "2026-07-11T10:05:00.000Z" }, "2026-07-11T10:00:00.000Z"), true, "Exclusao deve detectar edicao remota posterior");

const financeContext = { window: {} };
vm.runInNewContext(read("assets/js/finance-core.js"), financeContext);
const finance = financeContext.window.ProFitnessFinance;
const partialPayment = { amount: 150, discount: 10, fine: 5, paidAmount: 50, status: "parcial", dueDate: "2026-07-10" };
assert.equal(finance.netAmount(partialPayment), 145);
assert.equal(finance.outstandingAmount(partialPayment), 95);
assert.equal(finance.effectivePaymentStatus(partialPayment, "2026-07-11"), "parcial");
assert.equal(finance.isDelinquent(partialPayment, "2026-07-11"), true, "Pagamento parcial vencido deve permanecer na inadimplencia");
const movementSummary = finance.summarizeMovements([
  { type: "entrada", amount: 200, status: "confirmado" },
  { type: "entrada", amount: 999, status: "estornado" },
  { type: "saida", amount: 65, status: "confirmado" }
]);
assert.equal(movementSummary.income, 200);
assert.equal(movementSummary.expense, 65);
assert.equal(movementSummary.result, 135, "Resultado deve ser entradas menos saidas sem estornos");
const delinquency = finance.delinquencySummary([
  { studentId: "A", amount: 100, paidAmount: 0, status: "vencido", dueDate: "2026-07-01" },
  { studentId: "B", amount: 100, paidAmount: 50, status: "parcial", dueDate: "2026-07-01" },
  { studentId: "C", amount: 100, status: "pago", dueDate: "2026-07-01" },
  { studentId: "D", amount: 100, status: "cancelado", dueDate: "2026-07-01" }
], "2026-07-13");
assert.equal(delinquency.expected, 300);
assert.equal(delinquency.overdue, 150);
assert.equal(delinquency.rate, 50);
assert.equal(delinquency.studentCount, 2);
const recovery = finance.recoverySummary([
  { studentId: "A", amount: 100, paidAmount: 100, status: "pago", dueDate: "2026-06-10", paidAt: "2026-07-05" },
  { studentId: "B", amount: 100, paidAmount: 0, status: "vencido", dueDate: "2026-06-10" }
], "2026-07", "2026-07-13");
assert.equal(recovery.recovered, 100);
assert.equal(recovery.previousDebtOpen, 100);
assert.equal(recovery.rate, 50);
const allocation = finance.allocateAmount(119.9, [{ name: "Musculacao", weight: 89.9 }, { name: "Natacao", weight: 30 }]);
assert.ok(Math.abs(allocation.reduce((total, item) => total + item.value, 0) - 119.9) < 0.000001, "Rateio por modalidade deve preservar o valor total");

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
assert.equal(typeof Store.persistLocalDemoStudent, "function", "Store deve exportar persistencia de aluno demonstrativo");
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

for (const cssFile of ["assets/css/brand.css", "assets/css/style.css", "assets/css/painel.css", "assets/css/prof.css", "assets/css/login.css"]) {
  const css = read(cssFile);
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, `${cssFile} possui chaves desbalanceadas`);
}

const panelHtml = read("painel.html");
assert.match(panelHtml, /id="gateSimulatorDialog"/, "Painel deve demonstrar catraca sem hardware real");
assert.doesNotMatch(panelHtml, /id="setupSheetsButton"/, "Painel nao deve expor setup da planilha");
const panelJs = read("assets/js/painel.js");
const studentJs = read("assets/js/app.js");
const studentHtml = read("index.html");
const professorJs = read("assets/js/prof.js");
const professorHtml = read("prof.html");
const studentCss = read("assets/css/style.css");
const professorCss = read("assets/css/prof.css");
const brandCss = read("assets/css/brand.css");
const sharedJs = read("assets/js/shared-data.js");
for (const html of [studentHtml, professorHtml, panelHtml]) {
  assert.match(html, /assets\/css\/brand\.css\?v=20260714-brand-harmony-v2/, "Todos os modulos devem carregar os tokens compartilhados da marca");
  assert.match(html, /family=DM\+Mono[^\"]*family=Sora/, "Todos os modulos devem carregar Sora e DM Mono");
  assert.match(html, /content="#d8b53d" name="theme-color"|name="theme-color" content="#d8b53d"/, "Todos os modulos devem usar o dourado suave no tema do navegador");
}
assert.doesNotMatch(studentHtml, /Barlow\+Condensed|Manrope/, "Aluno nao deve restaurar a tipografia divergente");
assert.match(brandCss, /--brand-font-sans:\s*"Sora"/, "Tokens devem definir Sora como fonte principal");
assert.match(brandCss, /--brand-font-mono:\s*"DM Mono"/, "Tokens devem definir DM Mono para rotulos tecnicos");
assert.match(brandCss, /--brand-gold:\s*#d8b53d/, "Tokens devem preservar o dourado suave aprovado");
assert.match(studentCss, /--font-display:\s*var\(--brand-font-sans/, "Aluno deve herdar a tipografia principal compartilhada");
assert.match(professorCss, /font-family:\s*var\(--font-mono\)/, "Professor deve usar DM Mono nos rotulos operacionais");
assert.match(panelHtml, /data-panel="ficha"[\s\S]*?<h3>Resumo<\/h3>/, "Painel administrativo deve possuir resumo de consulta");
for (const label of ["Painel", "Alunos", "Grade", "Equipe", "Financeiro", "Config"]) {
  assert.match(panelHtml, new RegExp(`<span>${label}<\\/span>`), `Navegacao administrativa deve exibir ${label}`);
}
assert.match(read("assets/css/painel.css"), /grid-template-columns:\s*repeat\(6,\s*minmax\(76px,\s*1fr\)\)/, "Navegacao desktop deve manter os seis modulos em uma linha");
assert.doesNotMatch(panelHtml, /id="newStudentButton"/, "Painel administrativo nao deve cadastrar aluno");
assert.match(professorHtml, /id="newProfessorStudent"/, "Painel do professor deve cadastrar aluno");
assert.match(professorHtml, /id="toggleStaffClockButton"/, "Painel do professor deve registrar entrada e saida");
assert.match(professorHtml, /id="profLoginForm"/, "Tablet deve exigir login individual do professor");
assert.match(professorHtml, /id="profLockView"/, "Tablet deve possuir bloqueio por inatividade");
assert.match(professorHtml, /class="prof-view-hero"/, "Professor deve possuir inicio operacional com hierarquia visual");
assert.match(professorHtml, /id="installProfessorAppButton"/, "Professor deve poder instalar o aplicativo no aparelho");
assert.match(professorHtml, /id="profHeaderMenu"/, "Acoes secundarias do professor devem ficar em menu compacto");
assert.match(professorHtml, /class="prof-nav-icon"/, "Navegacao do professor deve usar icones SVG consistentes");
assert.match(professorHtml, /Agora e a seguir/, "Inicio do professor deve priorizar a agenda operacional");
assert.match(professorHtml, /id="studentActionsMore"/, "Ficha do aluno deve agrupar acoes secundarias");
assert.match(professorHtml, /prof\.webmanifest/, "Professor deve possuir manifesto PWA proprio");
assert.doesNotMatch(professorHtml, /class="prof-photo-header/, "Professor autenticado nao deve repetir o cabecalho fotografico");
assert.match(professorHtml, /class="prof-session-logo"[\s\S]*pro-fitness-logo-oficial\.jpg/, "Professor deve usar o logotipo oficial no cabecalho funcional");
assert.doesNotMatch(professorHtml + professorJs, /profCurrentInitials/, "Cabecalho do professor nao deve manter avatar textual obsoleto");
assert.match(professorJs, /fetchProfessorBootstrap/, "Professor nao deve baixar snapshot administrativo");
assert.doesNotMatch(professorJs, /Store\.fetchRemoteSnapshot/, "Tablet nao deve chamar exportacao integral");
assert.match(professorJs, /eligibleProfessors\.filter\(\(professor\) => String\(professor\.id\) === personId\)/, "Professor ativo deve permanecer vinculado a conta autenticada");
assert.match(professorCss, /orientation:\s*landscape[\s\S]*min-width:\s*900px[\s\S]*grid-template-columns:\s*92px/, "Tablet horizontal deve usar trilho lateral compacto");
assert.match(professorCss, /max-width:\s*899px[\s\S]*position:\s*fixed[\s\S]*grid-template-columns:\s*repeat\(4/, "Celular e tablet vertical devem usar navegacao inferior");
assert.match(panelHtml, /id="staffTimePrintableReport"/, "Painel administrativo deve exibir o relatorio de presenca e permanencia");
assert.doesNotMatch(professorHtml, /Caixa diario|Despesas da academia|Relatorios e resultados/, "Painel do professor nao deve expor modulos financeiros administrativos");
assert.match(panelHtml, /id="adminSyncStatus"/, "Painel deve mostrar status de sincronizacao");
assert.match(panelHtml, /id="adminLoginForm"/, "Painel administrativo deve exigir login");
assert.match(panelHtml, /id="accountForm"/, "Painel deve gerenciar contas sem editar a planilha manualmente");
assert.match(panelHtml, /id="sessionList"/, "Painel deve listar sessoes ativas");
assert.match(panelHtml, /id="loginAttemptList"/, "Painel deve listar tentativas de login");
assert.match(panelJs, /listAccountsRemote/, "Painel deve listar contas pela API protegida");
assert.match(panelJs, /listSessionsRemote/, "Painel deve consultar sessoes pela API protegida");
assert.match(panelJs, /listLoginAttemptsRemote/, "Painel deve consultar tentativas de login");
assert.match(panelJs, /revokeSessionRemote/, "Painel deve revogar sessoes individuais");
assert.match(panelHtml, /id="adminPendingSyncButton"/, "Painel deve permitir reenviar pendencias");
assert.match(panelHtml, /id="paymentRulesForm"/, "Painel deve configurar alertas e bloqueio do aluno");
assert.match(panelJs, /ADMIN_SYNC_QUEUE_PREFIX/, "Painel deve possuir fila persistente por conta");
assert.match(panelJs, /ADMIN_PENDING_SNAPSHOT_PREFIX/, "Painel deve preservar restauracao integral pendente por conta");
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
assert.match(studentJs, /STUDENT_SYNC_QUEUE_PREFIX/, "App do aluno deve possuir fila offline persistente por conta");
assert.match(studentJs, /flushStudentSyncQueue/, "App do aluno deve reenviar pendencias");
assert.match(studentJs, /STUDENT_SYNC_RESOURCES = \["workoutSessions", "exerciseSets"\]/, "Fila do aluno deve sincronizar somente sessoes e series");
assert.doesNotMatch(studentJs, /catch\(\(\) => null\)/, "App do aluno nao deve ignorar falhas de sincronizacao");
assert.doesNotMatch(studentJs, /syncSnapshotChanges/, "App do aluno deve usar fila incremental propria");
for (const screen of ["home", "workouts", "agenda", "evolution", "payments", "more"]) {
  assert.match(studentHtml, new RegExp(`data-screen="${screen}"`), `App do aluno deve possuir navegacao ${screen}`);
}
assert.match(studentHtml, /id="workoutSessionDialog"/, "App deve possuir execucao de treino em tela dedicada");
assert.match(studentHtml, /id="bottomGateQrButton"/, "Navegacao inferior deve destacar o QR de acesso");
assert.doesNotMatch(studentHtml, /id="homeAccessPass"|id="openGateQrButton"/, "Inicio nao deve repetir o acesso que ja existe no QR central");
assert.doesNotMatch(studentHtml, /class="student-photo-header/, "Area autenticada do aluno deve usar apenas o cabecalho funcional");
assert.match(studentHtml, /class="brand-logo-small"/, "Cabecalho funcional deve usar o logotipo oficial da academia");
assert.match(studentHtml, /id="restTimerPanel"/, "Treino deve possuir cronometro de descanso");
assert.match(studentHtml, /id="installStudentAppButton"/, "Aluno deve poder adicionar o app a tela inicial");
assert.match(studentJs, /function parseRestSeconds/, "Descanso deve interpretar o intervalo prescrito pelo professor");
assert.match(studentJs, /<span>Anterior<\/span>/, "Execucao deve mostrar a carga e repeticoes anteriores");
assert.match(studentJs, /class="compact-workout-copy"/, "Proximo treino deve usar uma faixa compacta");
assert.match(studentJs, /class="payment-compact-main"/, "Mensalidade atual deve usar resumo discreto");
assert.match(studentJs, /!authSession \|\| authSession\.account\?\.role !== "student"/, "Sincronizacao do aluno nao deve iniciar sem autenticacao");
assert.match(studentCss, /\.student-view \.bottom-navigation[\s\S]*safe-area-inset-bottom/, "Navegacao do aluno deve respeitar a area segura do celular");
assert.match(studentHtml, /id="studentLoginForm"/, "App do aluno deve pedir matricula e senha");
assert.match(studentHtml, /id="studentPasswordChangeForm"/, "App deve exigir troca da senha temporaria");
assert.doesNotMatch(studentHtml, /id="restoreDemoButton"/, "App publicado nao deve expor restauracao de demonstracao");
assert.doesNotMatch(studentHtml, /futureLoginButton|Acessar demonstracao/, "Login do aluno nao deve exibir botao de demonstracao");
assert.match(professorJs, /exerciseId/, "Professor deve preservar vinculo com catalogo de exercicios");
assert.match(professorHtml, /data-student-module="resultados"/, "Professor deve analisar treinos realizados");
assert.match(professorJs, /renderProfessorTrainingResults/, "Professor deve ver sessoes, series, carga, dor e dificuldade");
assert.match(studentHtml, /id="physicalEvolutionGrid"/, "Aluno deve acompanhar evolucao das avaliacoes fisicas");
for (const redundant of ["MINHA ROTINA", "SUA SEMANA", "SEU PROGRESSO", "SUA CONTA", "ULTIMAS MENSALIDADES"]) {
  assert.doesNotMatch(studentHtml.toUpperCase(), new RegExp(redundant), `App do aluno nao deve repetir o subtitulo ${redundant}`);
}
assert.match(studentHtml, /<h2>Presencas<\/h2>/, "Agenda do aluno deve usar o titulo direto Presencas");
assert.match(studentHtml, /<h2>Avaliacao fisica<\/h2>/, "Evolucao deve usar o titulo direto Avaliacao fisica");
assert.match(studentHtml, /<h2>Cargas por exercicio<\/h2>/, "Evolucao deve usar o titulo direto Cargas por exercicio");
assert.match(studentHtml, /manifest\.webmanifest/, "App do aluno deve ser instalavel");
assert.doesNotMatch(studentHtml + panelHtml, /cdnjs\.cloudflare\.com\/ajax\/libs\/qrcodejs/, "QR Code nao deve depender de CDN");
assert.ok(exists("assets/vendor/qrcode.min.js"), "Biblioteca de QR deve estar no projeto");
assert.ok(exists("manifest.webmanifest"), "PWA deve possuir manifesto");
assert.ok(exists("sw.js"), "PWA deve possuir service worker");
assert.doesNotMatch(read("sw.js"), /apiBaseUrl|script\.google\.com/, "Service worker nao deve armazenar respostas autenticadas da API");
assert.doesNotMatch(read("assets/css/style.css"), /font-size:\s*0\.49rem/, "Interface mobile nao deve usar fonte de 0.49rem");
assert.match(read("assets/css/style.css"), /#onboardingView\[hidden\]/, "Login do aluno deve desaparecer depois da autenticacao");
assert.match(read("assets/css/style.css"), /#studentView\[hidden\]/, "Aplicativo do aluno deve permanecer oculto antes da autenticacao");
assert.match(read("assets/css/prof.css"), /#profAuthView\[hidden\]/, "Login do professor deve desaparecer depois da autenticacao");
assert.match(read("assets/css/prof.css"), /#profLockView\[hidden\]/, "Bloqueio do tablet deve alternar sem sobrepor telas");
assert.match(read("assets/css/prof.css"), /#profAppShell\[hidden\]/, "Aplicativo do professor deve permanecer oculto sem sessao");
assert.match(professorJs, /function formatNumber\(/, "Resultados do professor devem formatar cargas sem erro de execucao");
assert.match(read("assets/js/app-config.js"), /environmentLabel:\s*"Demonstracao"/, "Selo demo deve usar rotulo curto");

assert.match(sharedJs, /function loginDemoLocal/, "Store deve oferecer login demonstrativo local");
assert.match(sharedJs, /clearAuthenticatedLocalData/, "Sessao invalida deve limpar dados locais");
assert.match(sharedJs, /validateAuthSessionRemote/, "Interfaces devem validar revogacao e expiracao no servidor");
assert.match(sharedJs, /invalidatesCurrentSession/, "Resposta atrasada nao deve apagar uma sessao criada depois da requisicao");
assert.match(professorJs, /unlockSessionRemote/, "Desbloqueio do tablet nao deve criar uma nova sessao");
assert.match(studentJs + professorJs + panelJs, /setFormBusy/, "Logins devem bloquear duplo clique e mostrar processamento");
assert.match(sharedJs, /LOCAL_DEMO_ACCOUNTS/, "Credenciais demo devem ser limitadas ao ambiente demo");
assert.doesNotMatch(professorHtml, /profDemoLoginButton|Acessar como professor demonstrativo/, "Login do professor nao deve exibir botao de demonstracao");
assert.doesNotMatch(panelHtml, /adminDemoLoginButton|Acessar demonstracao administrativa/, "Login administrativo nao deve exibir botao de demonstracao");
assert.match(sharedJs, /getLocalDemoAccounts\(\)\[normalizedLogin\]/, "Credenciais demo digitadas devem abrir a demonstracao local");
assert.match(sharedJs, /localDemoRuntimeSnapshot/, "Base demonstrativa grande deve permanecer somente em memoria");
assert.doesNotMatch(sharedJs, /localStorage\.setItem\(LOCAL_DEMO_MASTER_KEY/, "Base demonstrativa completa nao deve ser duplicada no localStorage");
assert.match(read("sw.js"), /profitness-shell-20260721-mobile-boundary-v1/, "Service worker deve invalidar o cache da contencao mobile");
assert.match(read("sw.js"), /\.\/assets\/css\/brand\.css/, "Service worker deve disponibilizar os tokens de marca offline");
assert.match(professorJs, /renderHomeAgendaFlow/, "Agenda inicial deve interpretar agora, proxima atividade e encerramento");
assert.match(professorJs, /aria-busy/, "Atualizacao do professor deve comunicar estado de carregamento");
const professorManifest = JSON.parse(read("prof.webmanifest"));
assert.equal(professorManifest.start_url, "./prof.html?source=pwa", "PWA da equipe deve abrir no professor");
assert.equal(professorManifest.theme_color, "#d8b53d", "PWA da equipe deve usar o dourado suave compartilhado");
assert.equal(JSON.parse(read("manifest.webmanifest")).theme_color, "#d8b53d", "PWA do aluno deve usar o dourado suave compartilhado");
assert.equal(professorManifest.shortcuts.length, 3, "PWA da equipe deve oferecer tres atalhos operacionais");
assert.ok(exists("assets/images/pf-prof-icon.svg"), "Icone instalavel do professor deve estar no pacote");

assert.match(panelHtml, /Matricular novo aluno/, "Painel deve oferecer matricula administrativa direta");
assert.match(panelHtml, /unlockStudentAccessButton/, "Ficha administrativa deve oferecer desbloqueio de acesso");
assert.match(panelHtml, /data-filter="inadimplentes"/, "Lista de alunos deve oferecer filtro de inadimplentes");
assert.match(panelHtml, /id="studentAccessAlert"/, "Ficha do aluno deve possuir aviso visivel do motivo do bloqueio");
assert.match(panelJs, /activeFilter === "inadimplentes"/, "Filtro de inadimplentes deve estar implementado");
assert.match(panelJs, /roster-block-reason/, "Cartao do aluno bloqueado deve exibir o motivo do bloqueio");
assert.match(panelHtml, /id="toggleFinanceValuesButton"/, "Financeiro deve oferecer controle para ocultar valores");
assert.match(panelJs, /function setFinanceValuesVisibility/, "Privacidade dos valores financeiros deve estar implementada");
assert.match(panelJs, /R\$ •••••/, "Valores financeiros devem ser mascarados sem desaparecer completamente");
assert.doesNotMatch(panelHtml, /id="financeQuickStudentSearch"/, "Barra financeira nao deve repetir a selecao de aluno");
assert.doesNotMatch(panelHtml, /finance-actions-menu|Outras acoes/, "As tres acoes financeiras devem permanecer visiveis");
assert.match(panelHtml, /id="quickReceivePaymentButton"[\s\S]*id="newExpenseButton"[\s\S]*id="newMovementButton"/, "Recebimento, despesa e lancamento devem aparecer juntos no topo");
assert.match(panelJs, /label: "Resultado liquido"/, "Resumo deve destacar o resultado liquido");
assert.match(panelHtml, /id="collectionMetricGrid"/, "Mensalidades deve possuir Central de Cobranca");
assert.match(panelHtml, /data-collection-aging="1-7"/, "Central de Cobranca deve separar atrasos de 1 a 7 dias");
assert.match(panelHtml, /data-collection-aging="31\+"/, "Central de Cobranca deve separar atrasos acima de 30 dias");
assert.match(panelHtml, /id="collectionPlanFilter"/, "Central de Cobranca deve filtrar por plano");
assert.match(panelHtml, /id="collectionDueStart"[\s\S]*id="collectionDueEnd"/, "Central de Cobranca deve filtrar por periodo de vencimento");
assert.match(panelHtml, /id="collectionContactDialog"/, "Central de Cobranca deve registrar contatos");
assert.match(panelJs, /function getCollectionDebtors/, "Inadimplencia deve ser consolidada por aluno");
assert.match(panelJs, /function buildCollectionWhatsApp/, "Central de Cobranca deve gerar mensagem de WhatsApp");
assert.match(panelJs, /collectionLastContactAt[\s\S]*paymentPromiseDate/, "Contato e promessa de pagamento devem ser persistidos");
assert.match(read("assets/js/shared-data.js"), /collectionLastContactAt[\s\S]*paymentPromiseDate/, "Store deve preservar dados da cobranca");
assert.match(panelHtml, /id="financeManagementMetrics"/, "Resumo deve possuir indicadores gerenciais");
assert.match(panelHtml, /id="financeManagementTrend"/, "Resumo deve possuir grafico gerencial de 12 meses");
assert.match(panelHtml, /id="financeModalityRevenue"/, "Resumo deve detalhar receita por modalidade");
assert.match(panelJs, /\[30, 60, 90\]\.map\(getFinanceForecastHorizon\)/, "Fluxo de caixa deve projetar 30, 60 e 90 dias");
assert.match(panelJs, /getRecentMonths\(reference, 12\)/, "Visao gerencial deve cobrir os ultimos 12 meses");
assert.match(panelJs, /label: "Resultado liquido"[\s\S]*function getStudentRevenueComponents/, "Resultado e rateio por modalidade devem permanecer no resumo");
assert.match(panelJs, /delinquencyRate[\s\S]*recoveryRate/, "Visao gerencial deve calcular inadimplencia e recuperacao");
assert.match(panelHtml, /id="reportPeriodPreset"/, "Relatorios devem oferecer atalhos de periodo");
assert.match(panelHtml, /class="report-advanced-filters"/, "Filtros secundarios do relatorio devem ficar recolhidos");
assert.match(panelJs, /function applyReportPeriodPreset/, "Atalhos de periodo devem atualizar as datas");
assert.match(panelJs, /\["Media por entrada"/, "Relatorio nao deve chamar media por lancamento de ticket medio");
assert.match(panelJs, /const received = payments\.filter[\s\S]*const overdue = payments\.filter\(isPaymentDelinquent\)/, "Relatorio individual deve considerar pagamentos parciais e saldo vencido");
assert.doesNotMatch(panelJs, /function getFinanceQuickStudentLabel|function renderFinanceQuickStudentOptions|function findFinanceQuickStudent/, "Codigo da busca financeira removida nao deve permanecer morto");
assert.match(panelJs, /function unlockSelectedStudentAccess/, "Desbloqueio administrativo deve estar implementado");
assert.match(panelJs, /duplicateEnrollment/, "Matricula administrativa deve impedir numero duplicado");
assert.ok(exists("assets/images/pro-fitness-header-oficial.jpg"), "Cabecalho oficial aprovado deve estar no pacote");
assert.ok(exists("assets/images/pro-fitness-header-fino.jpg"), "Cabecalho fino deve estar no pacote");
assert.match(panelHtml, /enrollmentOfferings/, "Matricula deve listar planos e modalidades configurados");
assert.match(panelHtml, /planDiscountType/, "Matricula deve oferecer desconto casal, familia e personalizado");
assert.match(panelHtml, /generateAccess/, "Matricula deve gerar acesso na mesma tela");
assert.match(panelJs, /createAccountRemote/, "Matricula deve criar a conta do aluno");
assert.match(panelHtml, /id="generateStudentAccessButton"/, "Ficha administrativa deve permitir recuperar a geracao de acesso");
assert.match(panelJs, /function openSelectedStudentAccess/, "Recuperacao posterior do acesso deve estar implementada");
assert.match(panelJs, /!existingStudent\?\.accountId && studentForm\.elements\.generateAccess\.checked/, "Nova tentativa deve gerar acesso para cadastro salvo sem conta");
assert.match(apiSource, /action: "reuseAccount"/, "API deve reutilizar com seguranca a conta da mesma pessoa");
assert.match(read("assets/js/shared-data.js"), /reused: true/, "Demonstracao deve permitir nova tentativa idempotente para a mesma pessoa");
assert.match(panelJs, /baseMonthlyFee/, "Matricula deve calcular subtotal antes do desconto");
assert.match(read("assets/js/shared-data.js"), /persistLocalDemoStudent/, "Aluno criado na demo deve permanecer disponivel entre os paineis");
assert.match(studentHtml, /assets\/js\/demo-data\.js/, "Aluno deve carregar a base demo incorporada");
assert.match(professorHtml, /assets\/js\/demo-data\.js/, "Professor deve carregar a base demo incorporada");
assert.match(panelHtml, /assets\/js\/demo-data\.js/, "Administrador deve carregar a base demo incorporada");
assert.ok(panelHtml.indexOf('id="adminDailyGrid"') < panelHtml.indexOf("Agenda semanal"), "Agenda semanal deve vir depois dos indicadores administrativos");
assert.ok(panelHtml.indexOf("Agenda semanal") < panelHtml.indexOf("Frequencia nos ultimos 7 dias"), "Agenda semanal deve aparecer antes dos graficos de frequencia");

for (const html of [studentHtml, professorHtml, panelHtml]) {
  assert.match(html, /assets\/images\/pro-fitness-fachada\.png/, "Todos os logins devem destacar a foto da academia");
  assert.match(html, /assets\/css\/login\.css/, "Todos os logins devem compartilhar a mesma identidade visual");
  assert.match(html, /Desenvolvido por <strong>@almir\.lk<\/strong>/, "Todos os modulos devem exibir o credito do desenvolvedor");
}
for (const html of [studentHtml, professorHtml]) {
  assert.match(html, /maximum-scale=1(?:\.0)?/, "Aluno e professor devem limitar o zoom para manter a experiencia de aplicativo");
  assert.match(html, /user-scalable=no/, "Aluno e professor nao devem permitir zoom por pinca");
}
assert.match(studentCss, /html\s*\{[\s\S]*?overflow-x:\s*clip/, "Aluno deve conter o deslocamento horizontal na raiz");
assert.match(professorCss, /html\s*\{[\s\S]*?overflow-x:\s*clip/, "Professor deve conter o deslocamento horizontal na raiz");
assert.match(panelHtml, /admin-wordmark-header/, "Administracao deve manter a barra institucional compacta");
assert.match(studentHtml, /assets\/images\/pro-fitness-logo-oficial\.jpg/, "Aluno deve usar o logotipo oficial no cabecalho compacto");
assert.match(studentJs, /more-profile-status \$\{access\.blocked \? "blocked" : "ok"\}/, "Perfil resumido deve distinguir acesso liberado e bloqueado");
assert.match(studentCss, /PERFIL CLARO E TREINOS EM AMARELO-PALHA/, "Aluno deve usar perfil claro e treinos com amarelo suave");
assert.match(studentCss, /\.student-view \.segmented-filter button\.active \{[\s\S]*?background: linear-gradient\(145deg, #777c76, #656a64\)/, "Filtro de treinos do aluno deve destacar a selecao em cinza");
assert.match(studentCss, /\.student-view \.week-day\.active \{[\s\S]*?background: linear-gradient\(145deg, #777c76, #656a64\)/, "Agenda do aluno deve destacar o dia ativo em cinza");
assert.match(professorCss, /PROFESSOR EM CINZA-CONCRETO/, "Professor deve usar a composicao clara inspirada na fachada");
assert.ok(exists("assets/css/login.css"), "O desenho compartilhado do login deve estar no pacote");
assert.match(read("assets/css/login.css"), /\.login-hero-photo/, "Login deve possuir tratamento fotografico responsivo");
assert.match(read("assets/css/login.css"), /\.login-developer-credit/, "Credito do login deve permanecer legivel");
assert.match(read("assets/css/login.css"), /#adminAuthView\[hidden\]/, "Login administrativo deve desaparecer depois da autenticacao");
assert.match(read("assets/css/login.css"), /#profAuthView\[hidden\]/, "Login do professor deve desaparecer depois da autenticacao");
assert.match(read("assets/css/login.css"), /#onboardingView\[hidden\]/, "Login do aluno deve desaparecer depois da autenticacao");
for (const cssFile of ["assets/css/style.css", "assets/css/prof.css", "assets/css/painel.css"]) {
  const css = read(cssFile);
  assert.match(css, /\.developer-credit\s*\{/, `${cssFile} deve estilizar o credito`);
  assert.doesNotMatch(css.match(/\.developer-credit\s*\{[^}]+\}/s)?.[0] || "", /display:\s*none|visibility:\s*hidden|font-size:\s*0\.[0-5]rem/, `${cssFile} deve manter o credito legivel`);
}

class QuotaStorage {
  constructor(limit) {
    this.limit = limit;
    this.values = new Map();
  }

  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  removeItem(key) { this.values.delete(String(key)); }
  setItem(key, value) {
    const next = new Map(this.values);
    next.set(String(key), String(value));
    const used = [...next].reduce((total, [itemKey, itemValue]) => total + itemKey.length + itemValue.length, 0);
    if (used > this.limit) {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values = next;
  }
}

async function validateDemoLoginWithSmallStorage(pageName, login, expectedRole) {
  const localStorage = new QuotaStorage(256 * 1024);
  const runtimeWindow = {
    PROFITNESS_CONFIG: { environment: "demo", allowDemoReset: true },
    location: { pathname: `/${pageName}` },
    setTimeout,
    clearTimeout
  };
  const context = {
    window: runtimeWindow,
    localStorage,
    navigator: { platform: "Teste", userAgent: "PersonalPro smoke" },
    AbortController,
    Array,
    Boolean,
    Date,
    Intl,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    clearTimeout,
    console,
    setTimeout
  };
  vm.runInNewContext(read("assets/js/demo-data.js"), context);
  vm.runInNewContext(read("assets/js/shared-data.js"), context);
  const store = runtimeWindow.ProFitnessStore;
  const session = await store.loginRemote(login, "Demo1234");
  assert.equal(session.account.role, expectedRole, `${pageName} deve autenticar o perfil demonstrativo correto`);
  const bootstrap = expectedRole === "student"
    ? await store.fetchStudentBootstrap()
    : expectedRole === "professor"
      ? await store.fetchProfessorBootstrap()
      : store.loadData();
  const snapshot = expectedRole === "admin" ? bootstrap : {
      ...store.createEmptySnapshot(),
      ...bootstrap,
      ...(bootstrap.student ? { students: [bootstrap.student] } : {})
    };
  if (expectedRole === "admin") assert.equal(snapshot.students.length, 50, "Painel demo deve carregar os 50 alunos sem persistir a base");
  store.saveData(snapshot);
  const storageKeys = [...localStorage.values.keys()];
  assert.ok(!storageKeys.some((key) => key.includes("demo-master") || key.endsWith("-data-v1")), `${pageName} nao deve persistir a base demonstrativa grande`);
}

await validateDemoLoginWithSmallStorage("index.html", "000001", "student");
await validateDemoLoginWithSmallStorage("prof.html", "prof.rafael", "professor");
await validateDemoLoginWithSmallStorage("painel.html", "admin.demo", "admin");

// Uma matricula criada no painel deve abrir no app do aluno com a senha gerada.
{
  const localStorage = new QuotaStorage(256 * 1024);
  const buildStore = (pageName) => {
    const runtimeWindow = {
      PROFITNESS_CONFIG: { environment: "demo", allowDemoReset: true },
      location: { pathname: `/${pageName}` },
      setTimeout,
      clearTimeout
    };
    const context = {
      window: runtimeWindow, localStorage,
      navigator: { platform: "Teste", userAgent: "PersonalPro smoke" },
      AbortController, Array, Boolean, Date, Intl, JSON, Map, Math, Number, Object, Promise, Set, String,
      clearTimeout, console, setTimeout
    };
    vm.runInNewContext(read("assets/js/demo-data.js"), context);
    vm.runInNewContext(read("assets/js/shared-data.js"), context);
    return runtimeWindow.ProFitnessStore;
  };
  const adminStore = buildStore("painel.html");
  await adminStore.loginRemote("admin.demo", "Demo1234");
  const student = adminStore.createStudentRecord({ id: "ALU-SMOKE-LOGIN", enrollmentNumber: "009999", name: "Aluno Integracao", status: "ativo" });
  adminStore.persistLocalDemoStudent(student);
  const credentials = await adminStore.createAccountRemote({ personType: "student", personId: student.id, login: student.enrollmentNumber, role: "student", active: true });
  const retry = await adminStore.createAccountRemote({ personType: "student", personId: student.id, login: student.enrollmentNumber, role: "student", active: true });
  assert.equal(retry.reused, true, "Nova tentativa deve reutilizar a conta demonstrativa da mesma matricula");

  const studentStore = buildStore("index.html");
  await studentStore.loginRemote(student.enrollmentNumber, credentials.temporaryPassword);
  const bootstrap = await studentStore.fetchStudentBootstrap();
  assert.equal(bootstrap.student.id, student.id, "App do aluno deve abrir o cadastro criado no painel");
}

// As credenciais demonstrativas devem tolerar espacos acidentais e nao chamar a API remota.
{
  const localStorage = new QuotaStorage(256 * 1024);
  const runtimeWindow = {
    PROFITNESS_CONFIG: { environment: "demo", allowDemoReset: true },
    location: { pathname: "/prof.html" },
    setTimeout,
    clearTimeout
  };
  const context = {
    window: runtimeWindow, localStorage,
    navigator: { platform: "Teste", userAgent: "PersonalPro smoke" },
    AbortController, Array, Boolean, Date, Intl, JSON, Map, Math, Number, Object, Promise, Set, String,
    clearTimeout, console, setTimeout
  };
  vm.runInNewContext(read("assets/js/demo-data.js"), context);
  vm.runInNewContext(read("assets/js/shared-data.js"), context);
  const session = await runtimeWindow.ProFitnessStore.loginRemote("  PROF.RAFAEL  ", "  Demo1234  ");
  assert.equal(session.account.role, "professor", "Login demonstrativo do professor deve ser local e tolerar espacos acidentais");
}

if (packageMode) {
  const allowedRootFiles = new Set(["index.html", "painel.html", "prof.html", "api.txt", "HISTORICO_DESENVOLVIMENTO.txt", "manifest.webmanifest", "prof.webmanifest", "sw.js"]);
  const allowedRootDirectories = new Set([".github", "apps-script", "assets", "docs", "tests", "tools"]);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile()) assert.ok(allowedRootFiles.has(entry.name), `Arquivo indevido na raiz: ${entry.name}`);
    if (entry.isDirectory()) assert.ok(allowedRootDirectories.has(entry.name), `Pasta indevida no pacote: ${entry.name}`);
  }
  assert.equal(exists(".git"), false, "ZIP final nao deve conter .git");
  assert.equal(exists("backups"), false, "ZIP final nao deve conter backups");
}
assert.match(read("HISTORICO_DESENVOLVIMENTO.txt"), /ULTIMA ATUALIZACAO: 21\/07\/2026/);
assert.match(read("docs/estrutura-planilha.md"), /presenceSource/);
assert.match(read("docs/sheets-api-setup.md"), /schemaVersion: 9/);
const demoTool = read("tools/generate-demo-data.mjs");
assert.match(demoTool, /PersonalPro-backups/, "Gerador deve salvar backups fora do projeto por padrao");
assert.doesNotMatch(demoTool, /payload:\s*JSON\.stringify/, "Gerador nao deve recriar payload integral no log");
assert.match(apiSource, /migrateLogHeaders/, "API deve remover a coluna antiga payload durante a migracao");
const officialDemo = JSON.parse(read("assets/data/demo.json"));
assert.equal(officialDemo.snapshot.students.length, 50, "Demonstracao oficial deve possuir 50 alunos");
assert.equal(officialDemo.snapshot.users.filter((user) => user.role === "professor").length, 6, "Demonstracao deve possuir seis professores");
assert.equal(officialDemo.snapshot.payments.filter((payment) => payment.reference === "2026-07" && payment.status === "vencido").length, 5, "Inadimplencia atual deve ser 10 por cento");
assert.equal(officialDemo.snapshot.students[0].enrollmentNumber, "000001", "Matricula ficticia deve preservar zeros a esquerda");
assert.ok(officialDemo.snapshot.workoutSessions.some((session) => session.status === "interrompida" && session.pain === "moderada"), "Demo deve possuir treino interrompido com dor");
assert.ok(officialDemo.snapshot.payments.some((payment) => payment.status === "parcial"), "Demo deve possuir pagamento parcial");
assert.ok(officialDemo.snapshot.payments.some((payment) => payment.status === "estornado"), "Demo deve possuir pagamento estornado");
const demoWaterExpenses = officialDemo.snapshot.expenses.filter((expense) => expense.description === "Conta de agua");
assert.deepEqual(demoWaterExpenses.map((expense) => expense.amount), [612.4, 684.7, 731.2], "Contas de agua ficticias devem preservar os tres valores aprovados");
assert.equal(officialDemo.snapshot.expenses.some((expense) => expense.category === "aluguel" || expense.description === "Aluguel"), false, "Demo nao deve possuir despesa de aluguel");
demoWaterExpenses.forEach((expense) => {
  const movement = officialDemo.snapshot.movements.find((item) => item.expenseId === expense.id && item.status !== "estornado");
  assert.equal(movement?.amount, expense.amount, `Conta de agua ${expense.id} deve corresponder a saida do caixa`);
});
assert.match(read("painel.html"), /id="financeReviewDialog"/, "Painel deve possuir a janela de revisao financeira");
assert.match(read("assets/js/painel.js"), /financial-reconciliation-repaired/, "Correcao financeira deve gerar registro de auditoria");
assert.match(read("painel.html"), /painel\.css\?v=20260714-titlebar-v1/, "Painel deve invalidar o cache da nova barra institucional");
assert.match(read("painel.html"), /painel\.js\?v=20260714-panel-polish-v1/, "Painel deve invalidar o cache da correcao de rolagem");
assert.match(read("assets/css/painel.css"), /POLIMENTO VISUAL FINAL DO PAINEL ADMINISTRATIVO/, "Painel deve preservar a camada final de acabamento visual");
assert.ok(read("assets/js/painel.js").includes("financeSearchFilter?.focus({ preventScroll: true });"), "A aba Mensalidades nao deve deslocar a pagina ao focar o filtro");
assert.match(read("painel.html"), /class="admin-panel-brand"/, "Painel deve usar o cabecalho institucional em HTML");
assert.doesNotMatch(read("painel.html"), /class="official-header-banner"/, "Painel nao deve restaurar a fotografia na barra superior");
assert.match(read("assets/css/painel.css"), /Barra institucional do painel/, "Painel deve preservar o acabamento da nova barra superior");

console.log(`Smoke tests (${packageMode ? "pacote" : "repositorio"}): OK`);
