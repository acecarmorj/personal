/**
 * PersonalPro - Google Apps Script API
 * API REST para Google Sheets.
 *
 * Fluxo recomendado:
 * 1. Cole este arquivo em um projeto Apps Script.
 * 2. Execute setupPersonalProSpreadsheet() uma vez.
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

const SPREADSHEET_ID = "COLE_O_ID_DA_PLANILHA_AQUI";
const SPREADSHEET_ID_PROPERTY = "PERSONALPRO_SPREADSHEET_ID";
const DEFAULT_SPREADSHEET_NAME = "PersonalPro Database";

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
      "enrollmentToken",
      "enrollmentStatus",
      "enrollmentCompletedAt",
      "appAccessPolicy",
      "accessBlockReason",
      "gateCode",
      "lastGateSyncAt",
      "avatarUrl"
    ]
  },
  assessments: {
    sheetName: "Avaliacoes",
    headers: ["id", "studentId", "date", "weight", "height", "imc", "bodyFat", "chest", "waist", "hip", "arm", "thigh", "photos", "notes"]
  },
  workouts: {
    sheetName: "Treinos",
    headers: ["id", "studentId", "title", "division", "muscleGroup", "exercises", "sets", "reps", "load", "rest", "status", "notes", "createdAt"]
  },
  exercises: {
    sheetName: "Exercicios",
    headers: ["id", "name", "muscleGroup", "equipment", "videoUrl", "notes"]
  },
  schedule: {
    sheetName: "Agenda",
    headers: ["id", "studentId", "date", "time", "type", "status", "notes"]
  },
  payments: {
    sheetName: "Pagamentos",
    headers: ["id", "studentId", "reference", "amount", "dueDate", "status", "method", "paidAt", "notes"]
  },
  checkins: {
    sheetName: "Checkins",
    headers: ["id", "studentId", "workoutId", "date", "usedLoad", "difficulty", "pain", "notes"]
  },
  users: {
    sheetName: "Usuarios",
    headers: ["id", "name", "email", "passwordHash", "role", "status", "lastLogin"]
  },
  config: {
    sheetName: "Config",
    headers: ["id", "appName", "timezone", "currency", "logoUrl", "supportPhone", "apiBaseUrl", "lastSnapshotAt"]
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
      ensureSpreadsheetStructure();
      const snapshot = normalizeSnapshot(body.snapshot || {});
      importAllData(snapshot);
      appendLog({
        timestamp: new Date().toISOString(),
        action: "importAll",
        resource: "snapshot",
        recordId: "",
        payload: JSON.stringify({ keys: Object.keys(snapshot) })
      });
      return jsonResponse({ ok: true, data: exportAllData() });
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

function setupPersonalProSpreadsheet() {
  const result = ensureSpreadsheetStructure();
  Logger.log("PersonalPro pronto em: " + result.spreadsheetUrl);
  return result;
}

function ensureSpreadsheetStructure() {
  const spreadsheet = getOrCreateSpreadsheet();
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
    "PersonalPro",
    Session.getScriptTimeZone() || "America/Sao_Paulo",
    "BRL",
    "",
    "",
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
  const spreadsheetId = getResolvedSpreadsheetId();

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  const spreadsheet = SpreadsheetApp.create(DEFAULT_SPREADSHEET_NAME);
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_PROPERTY, spreadsheet.getId());
  return spreadsheet;
}

function getResolvedSpreadsheetId() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "COLE_O_ID_DA_PLANILHA_AQUI") {
    return SPREADSHEET_ID;
  }
  return PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY) || "";
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
    appName: first.appName || "PersonalPro",
    timezone: first.timezone || Session.getScriptTimeZone() || "America/Sao_Paulo",
    currency: first.currency || "BRL",
    logoUrl: first.logoUrl || "",
    supportPhone: first.supportPhone || "",
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

  const normalized = normalizePayload(headers, payload);
  const records = readSheet(resource);
  const existingIndex = records.findIndex((row) => String(row.id) === String(normalized.id));

  if (!normalized.id) {
    normalized.id = Utilities.getUuid();
  }

  const rowValues = headers.map((header) => serializeValue(normalized[header]));

  if (existingIndex >= 0) {
    sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return normalized;
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
