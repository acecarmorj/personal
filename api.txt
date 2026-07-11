/**
 * Pro Fitness Academia - Google Apps Script API
 * API REST para Google Sheets.
 *
 * Fluxo recomendado:
 * 1. Cole este arquivo em um projeto Apps Script.
 * 2. Execute setupProFitnessSpreadsheet() uma vez.
 * 3. Publique como Web App.
 * 4. Cole a URL publicada em app-config.js no campo apiBaseUrl.
 *
 * Endpoints:
 * GET  ?action=setup
 * GET  ?action=health
 * GET  ?action=exportAll
 * GET  ?resource=students
 * GET  ?resource=students&id=ALU-001
 * POST { "action": "importAll", "snapshot": { ... } }      // exige snapshot completo
 * POST { "action": "importPartial", "snapshot": { ... } }  // altera somente colecoes enviadas
 * POST { "action": "upsert", "resource": "students", "data": { ... } }
 * POST { "action": "delete", "resource": "students", "data": { "id": "...", "expectedUpdatedAt": "..." } }
 */

const SPREADSHEET_ID_PROPERTY = "PROFITNESS_SPREADSHEET_ID";
const SCHEMA_VERSION_PROPERTY = "PROFITNESS_SCHEMA_VERSION";
const CURRENT_SCHEMA_VERSION = 3;
const TEXT_HEADERS = [
  "id", "studentId", "workoutId", "sessionId", "exerciseItemId", "exerciseId", "teacherId", "paymentId", "expenseId", "staffId", "recordId", "deviceId",
  "phone", "birthDate", "date", "time", "startTime", "endTime", "reference", "dueDate", "paidAt", "closedAt",
  "checkedInAt", "checkedOutAt", "clockIn", "clockOut", "startedAt", "endedAt", "completedAt", "createdAt", "updatedAt", "lastLogin", "lastSnapshotAt",
  "enrollmentToken", "enrollmentCompletedAt", "gateCode", "lastGateSyncAt", "reversedAt", "voidedAt", "timestamp", "presenceSource"
];

const SHEETS = {
  students: {
    sheetName: "Alunos",
    headers: [
      "id",
      "name",
      "phone",
      "email",
      "birthDate",
      "goal",
      "restrictions",
      "status",
      "plan",
      "monthlyFee",
      "notes",
      "createdAt",
      "updatedAt",
      "enrollmentToken",
      "enrollmentStatus",
      "enrollmentCompletedAt",
      "appAccessPolicy",
      "accessBlockReason",
      "gateCode",
      "lastGateSyncAt",
      "avatarUrl",
      "updatedBy",
      "source",
      "deviceId"
    ]
  },
  assessments: {
    sheetName: "Avaliacoes",
    headers: ["id", "studentId", "date", "weight", "height", "imc", "bodyFat", "chest", "waist", "hip", "arm", "thigh", "photos", "notes", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  workouts: {
    sheetName: "Treinos",
    headers: ["id", "studentId", "title", "division", "muscleGroup", "exercises", "exerciseItems", "sets", "reps", "load", "rest", "status", "notes", "createdAt", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  exercises: {
    sheetName: "Exercicios",
    headers: ["id", "name", "muscleGroup", "equipment", "videoUrl", "notes", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  schedule: {
    sheetName: "Agenda",
    headers: [
      "id",
      "studentId",
      "date",
      "time",
      "type",
      "status",
      "notes",
      "title",
      "category",
      "dayOfWeek",
      "startTime",
      "endTime",
      "teacherId",
      "teacherName",
      "location",
      "capacity",
      "recurring",
      "scheduleKind",
      "updatedAt",
      "updatedBy",
      "source",
      "deviceId"
    ]
  },
  payments: {
    sheetName: "Pagamentos",
    headers: ["id", "studentId", "reference", "amount", "discount", "fine", "netAmount", "paidAmount", "dueDate", "status", "method", "paidAt", "recordedBy", "reversalReason", "reversedBy", "reversedAt", "description", "createdAt", "updatedAt", "notes", "updatedBy", "source", "deviceId"]
  },
  movements: {
    sheetName: "Movimentacoes",
    headers: ["id", "date", "time", "type", "category", "description", "amount", "method", "account", "costCenter", "studentId", "paymentId", "expenseId", "status", "voidReason", "voidedBy", "voidedAt", "createdAt", "updatedAt", "notes", "updatedBy", "source", "deviceId"]
  },
  expenses: {
    sheetName: "Despesas",
    headers: ["id", "description", "supplier", "category", "amount", "dueDate", "status", "paidAt", "method", "account", "costCenter", "recurring", "recurrenceId", "document", "createdAt", "updatedAt", "notes", "updatedBy", "source", "deviceId"]
  },
  cashClosings: {
    sheetName: "Fechamentos",
    headers: ["id", "date", "openingBalance", "cashIncome", "cashExpense", "expectedCash", "countedCash", "difference", "totalIncome", "totalExpense", "closedBy", "closedAt", "notes", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  checkins: {
    sheetName: "Checkins",
    headers: [
      "id",
      "studentId",
      "workoutId",
      "date",
      "time",
      "type",
      "checkedInAt",
      "checkedOutAt",
      "presenceSource",
      "presenceStatus",
      "usedLoad",
      "difficulty",
      "pain",
      "notes",
      "updatedAt",
      "updatedBy",
      "source",
      "deviceId"
    ]
  },
  workoutSessions: {
    sheetName: "SessoesTreino",
    headers: ["id", "studentId", "workoutId", "workoutTitle", "division", "startedAt", "endedAt", "durationMinutes", "status", "difficulty", "pain", "notes", "totalSets", "completedSets", "createdAt", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  exerciseSets: {
    sheetName: "SeriesRealizadas",
    headers: ["id", "sessionId", "studentId", "workoutId", "exerciseItemId", "exerciseId", "exerciseName", "setNumber", "targetReps", "actualReps", "targetLoad", "actualLoad", "status", "completedAt", "notes", "createdAt", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  users: {
    sheetName: "Usuarios",
    headers: ["id", "name", "email", "passwordHash", "role", "status", "lastLogin", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  staffTimeEntries: {
    sheetName: "PontoProfessores",
    headers: ["id", "staffId", "staffName", "date", "clockIn", "clockOut", "durationMinutes", "status", "source", "deviceId", "notes", "createdAt", "updatedAt", "updatedBy"]
  },
  config: {
    sheetName: "Config",
    headers: ["id", "appName", "timezone", "currency", "logoUrl", "supportPhone", "whatsappNumber", "apiBaseUrl", "lastSnapshotAt", "schemaVersion", "plans", "modalities", "costCenters", "paymentAlertDays", "paymentGraceDays", "blockAccessOnOverdue", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  log: {
    sheetName: "Log",
    headers: ["timestamp", "action", "resource", "recordId", "changedFields", "actor", "source", "deviceId", "result", "message"]
  }
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = (params.action || "").toLowerCase();
  const resource = resolveResourceName(params.resource || "");
  const id = params.id || "";

  try {
    if (action === "setup" || resource === "setup") {
      return jsonResponse({ ok: true, data: ensureSpreadsheetStructure(null, { fullFormat: true, cleanup: true }) });
    }

    const setup = ensureApiReady();

    if (action === "health") {
      return jsonResponse({
        ok: true,
        data: {
          spreadsheetId: setup.spreadsheetId,
          spreadsheetUrl: setup.spreadsheetUrl,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          resources: Object.keys(SHEETS),
          generatedAt: new Date().toISOString()
        }
      });
    }

    if (action === "exportall") {
      return jsonResponse({ ok: true, data: exportAllData(setup) });
    }

    if (!resource) {
      return jsonResponse({
        ok: true,
        spreadsheetId: setup.spreadsheetId,
        spreadsheetUrl: setup.spreadsheetUrl,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        resources: Object.keys(SHEETS)
      });
    }

    validateResource(resource);
    const rows = readSheet(resource);
    const payload = id ? rows.find((row) => String(row.id) === String(id)) || null : rows;
    return jsonResponse({ ok: true, data: payload });
  } catch (error) {
    return errorResponse(error);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = (body.action || "upsert").toLowerCase();

    if (action === "setup") {
      return jsonResponse({ ok: true, data: ensureSpreadsheetStructure(null, { fullFormat: true, cleanup: true }) });
    }

    const setup = ensureApiReady();

    if (action === "importall") {
      validateCompleteSnapshot(body.snapshot);
      const snapshot = normalizeSnapshot(body.snapshot, Object.keys(SHEETS));
      importAllData(snapshot);
      appendLog(buildAuditLogEntry({
        action: "importAll",
        resource: "snapshot",
        recordId: "",
        data: { resources: Object.keys(snapshot) },
        result: "success",
        message: "Snapshot completo importado."
      }));
      return jsonResponse({
        ok: true,
        data: {
          spreadsheetId: setup.spreadsheetId,
          spreadsheetUrl: setup.spreadsheetUrl,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          imported: countSnapshotRows(snapshot)
        }
      });
    }

    if (action === "importpartial") {
      const snapshot = normalizePartialSnapshot(body.snapshot || {});
      importPartialData(snapshot);
      appendLog(buildAuditLogEntry({
        action: "importPartial",
        resource: "snapshot",
        recordId: "",
        data: { resources: Object.keys(snapshot) },
        result: "success",
        message: "Snapshot parcial importado sem alterar colecoes ausentes."
      }));
      return jsonResponse({
        ok: true,
        data: {
          spreadsheetId: setup.spreadsheetId,
          spreadsheetUrl: setup.spreadsheetUrl,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          imported: countSnapshotRows(snapshot)
        }
      });
    }

    const resource = resolveResourceName(body.resource || "");
    const data = body.data || {};
    validateResource(resource);

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      let response;
      if (action === "delete") {
        response = deleteRow(resource, data.id, data.expectedUpdatedAt);
      } else if (action === "upsert") {
        response = upsertRow(resource, data);
      } else {
        const error = new Error("Acao invalida.");
        error.code = "INVALID_ACTION";
        throw error;
      }

      appendLog(buildAuditLogEntry({
        action: action,
        resource: resource,
        recordId: data.id || response.id || "",
        data: data,
        response: response,
        result: response && response._conflict ? "conflict" : "success",
        message: response && response._conflict ? response._conflictMessage : "Operacao concluida."
      }));

      return jsonResponse({ ok: true, data: response });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return errorResponse(error);
  }
}

function onOpen() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    return;
  }

  rememberSpreadsheet(spreadsheet);
  SpreadsheetApp.getUi()
    .createMenu("Pro Fitness")
    .addItem("Preparar banco de dados", "setupProFitnessSpreadsheet")
    .addToUi();
}

function setupProFitnessSpreadsheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Abra a planilha, acesse Extensoes > Apps Script e execute esta funcao pelo editor vinculado.");
  }

  rememberSpreadsheet(spreadsheet);
  const result = ensureSpreadsheetStructure(spreadsheet);
  Logger.log("Pro Fitness pronto em: " + result.spreadsheetUrl);
  return result;
}

function ensureApiReady() {
  const spreadsheet = getOrCreateSpreadsheet();
  const storedVersion = Number(PropertiesService.getScriptProperties().getProperty(SCHEMA_VERSION_PROPERTY) || 0);
  if (storedVersion < CURRENT_SCHEMA_VERSION) {
    return ensureSpreadsheetStructure(spreadsheet, { fullFormat: false, cleanup: false });
  }
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sheets: []
  };
}

function ensureSpreadsheetStructure(spreadsheetOverride, options) {
  const settings = options || {};
  const spreadsheet = spreadsheetOverride || getOrCreateSpreadsheet();
  const summary = [];

  Object.keys(SHEETS).forEach((resource) => {
    summary.push(ensureSheetStructure(spreadsheet, resource, SHEETS[resource], settings));
  });

  seedConfigSheet(spreadsheet);
  if (settings.cleanup !== false) cleanupUnknownEmptySheets(spreadsheet);
  PropertiesService.getScriptProperties().setProperty(SCHEMA_VERSION_PROPERTY, String(CURRENT_SCHEMA_VERSION));

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sheets: summary
  };
}

function ensureSheetStructure(spreadsheet, resource, definition, options) {
  const settings = options || {};
  let sheet = spreadsheet.getSheetByName(definition.sheetName);
  let created = false;
  let headersInitialized = false;
  let appendedHeaders = [];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(definition.sheetName);
    created = true;
  }

  if (resource === "checkins") migrateCheckinHeaders(sheet);
  if (resource === "log") migrateLogHeaders(sheet);

  const existingHeaders = getHeaders(sheet);

  if (!existingHeaders.length) {
    writeHeaders(sheet, definition.headers);
    headersInitialized = true;
  } else {
    assertUniqueHeaders(existingHeaders, definition.sheetName);
    appendedHeaders = definition.headers.filter((header) => !existingHeaders.includes(header));
    if (appendedHeaders.length) {
      const startColumn = existingHeaders.length + 1;
      sheet.getRange(1, startColumn, 1, appendedHeaders.length).setValues([appendedHeaders]);
    }
  }

  const finalHeaders = getHeaders(sheet);
  assertUniqueHeaders(finalHeaders, definition.sheetName);
  formatTextColumns(sheet, finalHeaders);
  if (settings.fullFormat !== false) {
    formatSheet(sheet, Math.max(finalHeaders.length, definition.headers.length));
  }

  return {
    resource: resource,
    sheetName: definition.sheetName,
    created: created,
    headersInitialized: headersInitialized,
    appendedHeaders: appendedHeaders
  };
}

function migrateCheckinHeaders(sheet) {
  let headers = getRawHeaders(sheet);
  if (!headers.length) return;
  let presenceIndex = headers.indexOf("presenceSource");
  let sourceIndexes = [];
  headers.forEach((header, index) => {
    if (header === "source") sourceIndexes.push(index);
  });

  if (presenceIndex < 0 && sourceIndexes.length) {
    headers[sourceIndexes[0]] = "presenceSource";
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    presenceIndex = sourceIndexes[0];
  }

  headers = getRawHeaders(sheet);
  sourceIndexes = [];
  headers.forEach((header, index) => {
    if (header === "source") sourceIndexes.push(index);
  });

  if (sourceIndexes.length > 1) {
    const keepIndex = sourceIndexes[sourceIndexes.length - 1];
    const duplicateIndexes = sourceIndexes.slice(0, -1);
    const dataRows = Math.max(0, sheet.getLastRow() - 1);
    if (dataRows) {
      const values = sheet.getRange(2, 1, dataRows, headers.length).getValues();
      values.forEach((row) => {
        duplicateIndexes.forEach((index) => {
          if (!row[keepIndex] && row[index]) row[keepIndex] = row[index];
        });
      });
      sheet.getRange(2, 1, dataRows, headers.length).setValues(values);
    }
    duplicateIndexes.sort((a, b) => b - a).forEach((index) => sheet.deleteColumn(index + 1));
  }
}

function migrateLogHeaders(sheet) {
  const headers = getRawHeaders(sheet);
  const payloadIndex = headers.indexOf("payload");
  if (payloadIndex < 0) return;
  const dataRows = Math.max(0, sheet.getLastRow() - 1);
  if (dataRows) sheet.getRange(2, payloadIndex + 1, dataRows, 1).clearContent();
  sheet.deleteColumn(payloadIndex + 1);
}

function getRawHeaders(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => String(header || "").trim());
}

function assertUniqueHeaders(headers, sheetName) {
  const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicates.length) {
    const error = new Error("Cabecalhos duplicados na aba " + sheetName + ": " + [...new Set(duplicates)].join(", "));
    error.code = "DUPLICATE_HEADERS";
    throw error;
  }
}

function seedConfigSheet(spreadsheet) {
  const configSheet = spreadsheet.getSheetByName(SHEETS.config.sheetName);
  if (!configSheet || configSheet.getLastRow() > 1) return;

  const initial = {
    id: "CONFIG-001",
    appName: "Pro Fitness Academia",
    timezone: Session.getScriptTimeZone() || "America/Sao_Paulo",
    currency: "BRL",
    logoUrl: "",
    supportPhone: "(22) 98823-3216",
    whatsappNumber: "5522988233216",
    apiBaseUrl: "",
    lastSnapshotAt: "",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    plans: [],
    modalities: [],
    costCenters: [],
    paymentAlertDays: [7, 3, 0],
    paymentGraceDays: 0,
    blockAccessOnOverdue: true,
    updatedAt: new Date().toISOString(),
    updatedBy: "setup",
    source: "api",
    deviceId: ""
  };
  const headers = getHeaders(configSheet);
  configSheet.appendRow(headers.map((header) => serializeValue(initial[header])));
}

function cleanupUnknownEmptySheets(spreadsheet) {
  const validNames = Object.keys(SHEETS).map((key) => SHEETS[key].sheetName);
  const sheets = spreadsheet.getSheets();

  sheets.forEach((sheet) => {
    const isUnknown = !validNames.includes(sheet.getName());
    const isEmpty = sheet.getLastRow() <= 1 && sheet.getLastColumn() <= 1 && !String(sheet.getRange(1, 1).getValue() || "").trim();

    if (isUnknown && isEmpty && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(sheet);
    }
  });
}

function getOrCreateSpreadsheet() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    rememberSpreadsheet(activeSpreadsheet);
    return activeSpreadsheet;
  }

  const spreadsheetId = getResolvedSpreadsheetId();

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  throw new Error(
    "Planilha nao vinculada. Execute setupProFitnessSpreadsheet() uma vez no Apps Script aberto pela propria planilha."
  );
}

function rememberSpreadsheet(spreadsheet) {
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_PROPERTY, spreadsheet.getId());
}

function getResolvedSpreadsheetId() {
  const savedSpreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY);
  return savedSpreadsheetId || "";
}

function validateResource(resource) {
  if (!resource || !SHEETS[resource]) {
    const error = new Error("Recurso invalido.");
    error.code = "INVALID_RESOURCE";
    throw error;
  }
}

function resolveResourceName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const resolved = Object.keys(SHEETS).find((resource) => resource.toLowerCase() === normalized);
  return resolved || normalized;
}

function exportAllData(setup) {
  const resolvedSetup = setup || ensureApiReady();
  touchConfigSnapshotMetadata(resolvedSetup);
  const snapshot = {};
  Object.keys(SHEETS).forEach((resource) => {
    snapshot[resource] = readSheet(resource);
  });
  return {
    spreadsheetId: resolvedSetup.spreadsheetId,
    spreadsheetUrl: resolvedSetup.spreadsheetUrl,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    snapshot: snapshot
  };
}

function importAllData(snapshot) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    Object.keys(SHEETS).forEach((resource) => rewriteSheet(resource, snapshot[resource]));
    touchConfigSnapshotMetadata(ensureApiReady());
  } finally {
    lock.releaseLock();
  }
}

function importPartialData(snapshot) {
  const resources = Object.keys(snapshot);
  if (!resources.length) {
    const error = new Error("Nenhuma colecao valida foi enviada.");
    error.code = "EMPTY_IMPORT";
    throw error;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    resources.forEach((resource) => rewriteSheet(resource, snapshot[resource]));
    touchConfigSnapshotMetadata(ensureApiReady());
  } finally {
    lock.releaseLock();
  }
}

function validateCompleteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    const error = new Error("Snapshot completo invalido.");
    error.code = "INVALID_SNAPSHOT";
    throw error;
  }
  const missing = Object.keys(SHEETS).filter((resource) => !Array.isArray(snapshot[resource]));
  if (missing.length) {
    const error = new Error("Importacao integral bloqueada. Colecoes ausentes: " + missing.join(", "));
    error.code = "INCOMPLETE_SNAPSHOT";
    throw error;
  }
}

function normalizeSnapshot(snapshot, resources) {
  const normalized = {};
  resources.forEach((resource) => {
    validateResource(resource);
    if (!Array.isArray(snapshot[resource])) {
      const error = new Error("A colecao " + resource + " precisa ser uma lista.");
      error.code = "INVALID_COLLECTION";
      throw error;
    }
    normalized[resource] = snapshot[resource].map((row) => normalizeImportedRow(resource, row));
  });
  return normalized;
}

function normalizeImportedRow(resource, row) {
  const normalized = Object.assign({}, row || {});
  if (resource === "checkins" && !Object.prototype.hasOwnProperty.call(normalized, "presenceSource")) {
    normalized.presenceSource = normalized.entrySource || normalized.source || "";
    normalized.source = normalized.syncSource || "";
  }
  if (resource === "config") normalized.schemaVersion = CURRENT_SCHEMA_VERSION;
  return normalized;
}

function normalizePartialSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    const error = new Error("Snapshot parcial invalido.");
    error.code = "INVALID_SNAPSHOT";
    throw error;
  }
  return normalizeSnapshot(snapshot, Object.keys(snapshot));
}

function countSnapshotRows(snapshot) {
  const counts = {};
  Object.keys(snapshot).forEach((resource) => counts[resource] = snapshot[resource].length);
  return counts;
}

function buildConfigSnapshotMetadata(first, options) {
  const current = first || {};
  const settings = options || {};
  const now = settings.now || new Date().toISOString();
  return Object.assign({}, current, {
    id: current.id || "CONFIG-001",
    appName: current.appName || "Pro Fitness Academia",
    timezone: current.timezone || settings.timezone || "America/Sao_Paulo",
    currency: current.currency || "BRL",
    logoUrl: current.logoUrl || "",
    supportPhone: current.supportPhone || "(22) 98823-3216",
    apiBaseUrl: current.apiBaseUrl || settings.apiBaseUrl || "",
    lastSnapshotAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
    updatedBy: current.updatedBy || "api",
    source: current.source || "api",
    deviceId: current.deviceId || ""
  });
}

function touchConfigSnapshotMetadata(setup) {
  const configSheet = getSheet("config");
  const headers = getHeaders(configSheet);
  const rows = readSheet("config");
  const first = rows[0] || {};
  const updated = buildConfigSnapshotMetadata(first, {
    timezone: Session.getScriptTimeZone() || "America/Sao_Paulo",
    apiBaseUrl: ScriptApp.getService().getUrl() || ""
  });
  const rowValues = headers.map((header) => serializeValue(updated[header]));
  if (configSheet.getLastRow() > 1) configSheet.getRange(2, 1, 1, headers.length).setValues([rowValues]);
  else configSheet.appendRow(rowValues);
}

function rewriteSheet(resource, rows) {
  const sheet = getSheet(resource);
  const headers = SHEETS[resource].headers;
  const values = rows.map((row) => headers.map((header) => serializeValue(row[header])));

  sheet.clearContents();
  writeHeaders(sheet, headers);
  formatTextColumns(sheet, headers);

  if (values.length) {
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }

  formatSheet(sheet, headers.length);
}


function upsertRow(resource, payload) {
  const sheet = getSheet(resource);
  const headers = getHeaders(sheet);

  if (!headers.includes("id")) {
    throw new Error("A aba precisa ter a coluna id.");
  }

  const records = readSheet(resource);
  const incoming = Object.assign({}, payload);
  const serverTimestamp = new Date().toISOString();
  if (headers.includes("updatedAt") && !incoming.updatedAt) incoming.updatedAt = serverTimestamp;
  if (headers.includes("source") && !incoming.source) incoming.source = "api";
  const normalized = normalizePayload(headers, incoming);
  const existingIndex = records.findIndex((row) => String(row.id) === String(normalized.id));

  if (!normalized.id) {
    normalized.id = Utilities.getUuid();
  }

  const rowValues = headers.map((header) => serializeValue(normalized[header]));

  if (existingIndex >= 0) {
    const existing = records[existingIndex];
    if (isIncomingRecordOlder(existing, normalized)) {
      return Object.assign({}, existing, {
        _conflict: true,
        _conflictMessage: "Existe uma versao mais recente deste registro na planilha."
      });
    }
    sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return normalized;
}

function isIncomingRecordOlder(existing, incoming) {
  if (!existing || !incoming || !existing.updatedAt || !incoming.updatedAt) return false;
  const existingTime = new Date(existing.updatedAt).getTime();
  const incomingTime = new Date(incoming.updatedAt).getTime();
  if (isNaN(existingTime) || isNaN(incomingTime)) return false;
  return incomingTime < existingTime;
}

function hasDeleteConflict(existing, expectedUpdatedAt) {
  if (!existing || !existing.updatedAt || !expectedUpdatedAt) return false;
  const existingTime = new Date(existing.updatedAt).getTime();
  const expectedTime = new Date(expectedUpdatedAt).getTime();
  if (!isNaN(existingTime) && !isNaN(expectedTime)) return existingTime !== expectedTime;
  return String(existing.updatedAt) !== String(expectedUpdatedAt);
}

function deleteRow(resource, id, expectedUpdatedAt) {
  if (!id) {
    const error = new Error("Informe o id para excluir.");
    error.code = "MISSING_ID";
    throw error;
  }

  const sheet = getSheet(resource);
  const records = readSheet(resource);
  const index = records.findIndex((row) => String(row.id) === String(id));

  if (index < 0) {
    const error = new Error("Registro nao encontrado.");
    error.code = "NOT_FOUND";
    throw error;
  }

  const existing = records[index];
  if (hasDeleteConflict(existing, expectedUpdatedAt)) {
    return Object.assign({}, existing, {
      _conflict: true,
      _conflictMessage: "O registro foi alterado na planilha depois da ultima leitura e nao foi excluido."
    });
  }

  sheet.deleteRow(index + 2);
  return { id: id, deleted: true };
}

function readSheet(resource) {
  const sheet = getSheet(resource);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map((header) => String(header || "").trim());
  assertUniqueHeaders(headers.filter(Boolean), sheet.getName());

  return values
    .slice(1)
    .filter((row) => row.join("") !== "")
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = parseValue(row[index]);
      });
      return item;
    });
}

function getSheet(resource) {
  const spreadsheet = getOrCreateSpreadsheet();
  const definition = SHEETS[resource];
  const sheet = spreadsheet.getSheetByName(definition.sheetName);

  if (!sheet) {
    throw new Error("Aba nao encontrada: " + definition.sheetName);
  }

  return sheet;
}

function getHeaders(sheet) {
  if (sheet.getLastColumn() === 0) {
    return [];
  }

  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((header) => String(header || "").trim())
    .filter((header) => header);
}

function writeHeaders(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function formatSheet(sheet, columnsCount) {
  if (!columnsCount) {
    return;
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnsCount).setFontWeight("bold").setBackground("#17323d").setFontColor("#ffffff");
  sheet.autoResizeColumns(1, columnsCount);
}

function formatTextColumns(sheet, headers) {
  const dataRows = Math.max(1, sheet.getMaxRows() - 1);
  headers.forEach((header, index) => {
    if (TEXT_HEADERS.includes(header)) {
      sheet.getRange(2, index + 1, dataRows, 1).setNumberFormat("@");
    }
  });
}

function normalizePayload(headers, payload) {
  const normalized = {};

  headers.forEach((header) => {
    normalized[header] = Object.prototype.hasOwnProperty.call(payload, header) ? payload[header] : "";
  });

  return normalized;
}

function serializeValue(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value);
  }
  return value;
}

function parseValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return value;
    }
  }

  return value;
}

function buildAuditLogEntry(options) {
  const settings = options || {};
  const data = settings.data && typeof settings.data === "object" ? settings.data : {};
  return {
    timestamp: new Date().toISOString(),
    action: settings.action || "operation",
    resource: settings.resource || "",
    recordId: settings.recordId || data.id || "",
    changedFields: Object.keys(data).filter((key) => !["passwordHash"].includes(key)),
    actor: data.updatedBy || data.recordedBy || settings.actor || "",
    source: data.source || settings.source || "api",
    deviceId: data.deviceId || settings.deviceId || "",
    result: settings.result || "success",
    message: settings.message || ""
  };
}

function appendLog(entry) {
  const sheet = getSheet("log");
  const headers = getHeaders(sheet);
  const row = headers.map((header) => serializeValue(entry[header]));
  sheet.appendRow(row);
}

function getErrorCode(error) {
  if (error && error.code) return String(error.code);
  const message = String(error && error.message || "");
  if (/conflito|versao mais recente/i.test(message)) return "CONFLICT";
  if (/tempo|timeout|lock/i.test(message)) return "TIMEOUT";
  return "INTERNAL_ERROR";
}

function errorResponse(error) {
  return jsonResponse({
    ok: false,
    errorCode: getErrorCode(error),
    message: error && error.message ? error.message : "Erro interno da API.",
    status: 500
  });
}

function jsonResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
