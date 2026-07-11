import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const hash = (relativePath) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");

const javascriptFiles = [
  "assets/js/finance-core.js",
  "assets/js/shared-data.js",
  "assets/js/app.js",
  "assets/js/painel.js",
  "assets/js/prof.js"
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}

const apiCheck = spawnSync(process.execPath, ["--check", "-"], {
  cwd: root,
  input: read("apps-script/api.gs"),
  encoding: "utf8"
});
assert.equal(apiCheck.status, 0, `apps-script/api.gs: ${apiCheck.stderr}`);
assert.equal(hash("api.txt"), hash("apps-script/api.gs"), "api.txt deve ser identico a apps-script/api.gs");
const apiSource = read("apps-script/api.gs");
for (const requiredField of ["paidAmount", "costCenter", "reversalReason", "voidReason", "recurrenceId", "staffId", "durationMinutes", "updatedBy", "source", "deviceId"]) {
  assert.match(apiSource, new RegExp(`\\"${requiredField}\\"`), `API deve conter ${requiredField}`);
}
assert.match(apiSource, /staffTimeEntries\s*:/, "API deve conter o recurso staffTimeEntries");
assert.match(apiSource, /isIncomingRecordOlder/, "API deve rejeitar sobrescrita por registro antigo");

const financeContext = { window: {} };
vm.runInNewContext(read("assets/js/finance-core.js"), financeContext);
const finance = financeContext.window.ProFitnessFinance;
const partialPayment = { amount: 150, discount: 10, fine: 5, paidAmount: 50, status: "parcial", dueDate: "2026-07-10" };
assert.equal(finance.netAmount(partialPayment), 145);
assert.equal(finance.outstandingAmount(partialPayment), 95);
assert.equal(finance.effectivePaymentStatus(partialPayment, "2026-07-11"), "parcial");

const storage = new Map();
const sharedContext = {
  window: { location: { pathname: "/painel.html" } },
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
const emptyCollections = ["students", "assessments", "workouts", "schedule", "payments", "movements", "expenses", "cashClosings", "checkins", "exercises", "users", "staffTimeEntries", "config", "log"];
const cleanSnapshot = Object.fromEntries(emptyCollections.map((key) => [key, []]));
const migratedClean = sharedContext.window.ProFitnessStore.migrateData(cleanSnapshot);
for (const key of emptyCollections) assert.equal(migratedClean[key].length, 0, `Backup limpo deve manter ${key} vazio`);

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
const professorHtml = read("prof.html");
assert.match(panelHtml, /Resumo administrativo/, "Painel administrativo deve possuir resumo de consulta");
assert.doesNotMatch(panelHtml, /id="newStudentButton"/, "Painel administrativo nao deve cadastrar aluno");
assert.match(professorHtml, /id="newProfessorStudent"/, "Painel do professor deve cadastrar aluno");
assert.match(professorHtml, /id="toggleStaffClockButton"/, "Painel do professor deve registrar entrada e saida");
assert.match(panelHtml, /id="staffTimePrintableReport"/, "Painel administrativo deve exibir o relatorio de ponto");
assert.doesNotMatch(professorHtml, /Caixa diario|Despesas da academia|Relatorios e resultados/, "Painel do professor nao deve expor modulos financeiros administrativos");

console.log("Smoke tests: OK");
