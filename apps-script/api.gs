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
 * POST { "action": "importAll", "snapshot": { ... } }
 * POST { "action": "upsert", "resource": "students", "data": { ... } }
 * POST { "action": "delete", "resource": "students", "data": { "id": "..." } }
 */

const SPREADSHEET_ID_PROPERTY = "PROFITNESS_SPREADSHEET_ID";
const TEXT_HEADERS = [
  "id", "studentId", "workoutId", "teacherId", "paymentId", "expenseId", "staffId", "recordId", "deviceId",
  "phone", "birthDate", "date", "time", "startTime", "endTime", "reference", "dueDate", "paidAt", "closedAt",
  "checkedInAt", "checkedOutAt", "clockIn", "clockOut", "createdAt", "updatedAt", "lastLogin", "lastSnapshotAt",
  "enrollmentToken", "enrollmentCompletedAt", "gateCode", "lastGateSyncAt", "reversedAt", "voidedAt", "timestamp"
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
      "source",
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
    headers: ["id", "appName", "timezone", "currency", "logoUrl", "supportPhone", "apiBaseUrl", "lastSnapshotAt", "plans", "modalities", "costCenters", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  log: {
    sheetName: "Log",
    headers: ["timestamp", "action", "resource", "recordId", "payload"]
  }
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = (params.action || "").toLowerCase();
  const resource = (params.resource || "").toLowerCase();
  const id = params.id || "";

  try {
    if (action === "setup" || resource === "setup") {
      return jsonResponse({ ok: true, data: ensureSpreadsheetStructure() });
    }

    const setup = ensureSpreadsheetStructure();

    if (action === "health") {
      return jsonResponse({
        ok: true,
        data: {
          spreadsheetId: setup.spreadsheetId,
          spreadsheetUrl: setup.spreadsheetUrl,
          resources: Object.keys(SHEETS),
          generatedAt: new Date().toISOString()
        }
      });
    }

    if (action === "exportall") {
      return jsonResponse({
        ok: true,
        data: exportAllData(setup)
      });
    }

    if (!resource) {
      return jsonResponse({
        ok: true,
        spreadsheetId: setup.spreadsheetId,
        spreadsheetUrl: setup.spreadsheetUrl,
        resources: Object.keys(SHEETS)
      });
    }

    validateResource(resource);
    const rows = readSheet(resource);
    const payload = id ? rows.find((row) => String(row.id) === String(id)) || null : rows;
    return jsonResponse({ ok: true, data: payload });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message, status: 500 });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = (body.action || "upsert").toLowerCase();

    if (action === "setup") {
      return jsonResponse({ ok: true, data: ensureSpreadsheetStructure() });
    }

    if (action === "importall") {
      const setup = ensureSpreadsheetStructure();
      const snapshot = normalizeSnapshot(body.snapshot || {});
      importAllData(snapshot);
      appendLog({
        timestamp: new Date().toISOString(),
        action: "importAll",
        resource: "snapshot",
        recordId: "",
        payload: JSON.stringify({ keys: Object.keys(snapshot) })
      });
      const imported = {};
      Object.keys(snapshot).forEach((key) => {
        imported[key] = snapshot[key].length;
      });
      return jsonResponse({
        ok: true,
        data: {
          spreadsheetId: setup.spreadsheetId,
          spreadsheetUrl: setup.spreadsheetUrl,
          imported: imported
        }
      });
    }

    const resource = (body.resource || "").toLowerCase();
    const data = body.data || {};

    validateResource(resource);
    ensureSpreadsheetStructure();

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      let response;
      if (action === "delete") {
        response = deleteRow(resource, data.id);
      } else {
        response = upsertRow(resource, data);
      }

      appendLog({
        timestamp: new Date().toISOString(),
        action: action,
        resource: resource,
        recordId: data.id || response.id || "",
        payload: JSON.stringify(data)
      });

      return jsonResponse({ ok: true, data: response });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message, status: 500 });
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

function ensureSpreadsheetStructure(spreadsheetOverride) {
  const spreadsheet = spreadsheetOverride || getOrCreateSpreadsheet();
  const summary = [];

  Object.keys(SHEETS).forEach((resource) => {
    summary.push(ensureSheetStructure(spreadsheet, resource, SHEETS[resource]));
  });

  seedConfigSheet(spreadsheet);
  cleanupUnknownEmptySheets(spreadsheet);

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheets: summary
  };
}

function ensureSheetStructure(spreadsheet, resource, definition) {
  let sheet = spreadsheet.getSheetByName(definition.sheetName);
  let created = false;
  let headersInitialized = false;
  let appendedHeaders = [];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(definition.sheetName);
    created = true;
  }

  const existingHeaders = getHeaders(sheet);

  if (!existingHeaders.length) {
    writeHeaders(sheet, definition.headers);
    headersInitialized = true;
  } else {
    appendedHeaders = definition.headers.filter((header) => !existingHeaders.includes(header));
    if (appendedHeaders.length) {
      const startColumn = existingHeaders.length + 1;
      sheet.getRange(1, startColumn, 1, appendedHeaders.length).setValues([appendedHeaders]);
    }
  }

  formatSheet(sheet, Math.max(getHeaders(sheet).length, definition.headers.length));
  formatTextColumns(sheet, getHeaders(sheet));

  return {
    resource: resource,
    sheetName: definition.sheetName,
    created: created,
    headersInitialized: headersInitialized,
    appendedHeaders: appendedHeaders
  };
}

function seedConfigSheet(spreadsheet) {
  const configSheet = spreadsheet.getSheetByName(SHEETS.config.sheetName);
  if (!configSheet || configSheet.getLastRow() > 1) {
    return;
  }

  const row = [
    "CONFIG-001",
    "Pro Fitness Academia",
    Session.getScriptTimeZone() || "America/Sao_Paulo",
    "BRL",
    "",
    "(22) 98823-3216",
    "",
    ""
  ];

  configSheet.appendRow(row);
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
    throw new Error("Recurso invalido.");
  }
}

function exportAllData(setup) {
  const snapshot = {};
  Object.keys(SHEETS).forEach((resource) => {
    snapshot[resource] = readSheet(resource);
  });

  touchConfigSnapshotMetadata(setup || ensureSpreadsheetStructure());

  return {
    spreadsheetId: (setup || ensureSpreadsheetStructure()).spreadsheetId,
    spreadsheetUrl: (setup || ensureSpreadsheetStructure()).spreadsheetUrl,
    snapshot: snapshot
  };
}

function importAllData(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    Object.keys(SHEETS).forEach((resource) => {
      rewriteSheet(resource, normalized[resource] || []);
    });

    const setup = ensureSpreadsheetStructure();
    touchConfigSnapshotMetadata(setup);
  } finally {
    lock.releaseLock();
  }
}

function normalizeSnapshot(snapshot) {
  const normalized = {};
  Object.keys(SHEETS).forEach((resource) => {
    normalized[resource] = Array.isArray(snapshot[resource]) ? snapshot[resource] : [];
  });
  return normalized;
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

function touchConfigSnapshotMetadata(setup) {
  const configSheet = getSheet("config");
  const headers = getHeaders(configSheet);
  const rows = readSheet("config");
  const first = rows[0] || {};

  const updated = {
    id: first.id || "CONFIG-001",
    appName: first.appName || "Pro Fitness Academia",
    timezone: first.timezone || Session.getScriptTimeZone() || "America/Sao_Paulo",
    currency: first.currency || "BRL",
    logoUrl: first.logoUrl || "",
    supportPhone: first.supportPhone || "(22) 98823-3216",
    apiBaseUrl: first.apiBaseUrl || ScriptApp.getService().getUrl() || "",
    lastSnapshotAt: new Date().toISOString()
  };

  const rowValues = headers.map((header) => serializeValue(updated[header] || ""));

  if (configSheet.getLastRow() > 1) {
    configSheet.getRange(2, 1, 1, headers.length).setValues([rowValues]);
  } else {
    configSheet.appendRow(rowValues);
  }
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

function deleteRow(resource, id) {
  if (!id) {
    throw new Error("Informe o id para excluir.");
  }

  const sheet = getSheet(resource);
  const records = readSheet(resource);
  const index = records.findIndex((row) => String(row.id) === String(id));

  if (index < 0) {
    throw new Error("Registro nao encontrado.");
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

  const headers = values[0];

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

function appendLog(entry) {
  const sheet = getSheet("log");
  const headers = getHeaders(sheet);
  const row = headers.map((header) => serializeValue(entry[header] || ""));
  sheet.appendRow(row);
}

function jsonResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
