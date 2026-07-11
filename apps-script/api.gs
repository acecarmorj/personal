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
 * Endpoints publicos: somente GET ?action=health e POST action=login.
 * Todas as demais operacoes usam POST, token no corpo e permissao validada no servidor.
 * Setup, segredo de autenticacao e contas demonstrativas sao funcoes exclusivas do editor vinculado.
 */

const SPREADSHEET_ID_PROPERTY = "PROFITNESS_SPREADSHEET_ID";
const SCHEMA_VERSION_PROPERTY = "PROFITNESS_SCHEMA_VERSION";
const AUTH_PEPPER_PROPERTY = "PROFITNESS_AUTH_PEPPER";
const CURRENT_SCHEMA_VERSION = 7;
const AUTH_RESOURCE_NAMES = ["accounts", "sessions", "gateTokens", "accessAttempts", "loginAttempts"];
const PASSWORD_ALGORITHM = "PBKDF2-HMAC-SHA256";
const PASSWORD_VERSION = 1;
const PASSWORD_ITERATIONS = 120000;
const ROLE_PERMISSIONS = {
  student: ["student.self.read", "student.self.write", "gate.request"],
  professor: ["students.read", "students.write", "professional.read", "professional.write", "payments.receive", "staff.presence", "gate.validate"],
  admin: ["students.read", "professional.read", "payments.receive", "finance.manage", "users.manage", "backups.manage", "reports.read", "staff.presence.read", "settings.manage", "gate.validate"]
};
const TEXT_HEADERS = [
  "id", "studentId", "workoutId", "sessionId", "accountId", "personId", "exerciseItemId", "exerciseId", "teacherId", "paymentId", "expenseId", "staffId", "recordId", "deviceId",
  "phone", "birthDate", "date", "time", "startTime", "endTime", "reference", "dueDate", "paidAt", "closedAt",
  "checkedInAt", "checkedOutAt", "clockIn", "clockOut", "startedAt", "endedAt", "completedAt", "createdAt", "updatedAt", "lastLogin", "lastSnapshotAt",
  "enrollmentNumber", "login", "cpf", "enrollmentToken", "enrollmentCompletedAt", "gateCode", "lastGateSyncAt", "reversedAt", "voidedAt", "timestamp", "presenceSource",
  "lockedUntil", "lastLoginAt", "passwordChangedAt", "temporaryPasswordExpiresAt", "lastUsedAt", "expiresAt", "idleExpiresAt", "revokedAt"
];

const SHEETS = {
  students: {
    sheetName: "Alunos",
    headers: [
      "id",
      "enrollmentNumber",
      "cpf",
      "accountId",
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
    headers: ["id", "accountId", "name", "cpf", "email", "passwordHash", "role", "status", "lastLogin", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  accounts: {
    sheetName: "Contas",
    headers: ["id", "personType", "personId", "login", "email", "role", "permissions", "active", "passwordHash", "passwordSalt", "passwordAlgorithm", "passwordVersion", "passwordIterations", "mustChangePassword", "temporaryPasswordExpiresAt", "failedAttempts", "lockedUntil", "lastLoginAt", "passwordChangedAt", "sessionVersion", "createdAt", "updatedAt"]
  },
  sessions: {
    sheetName: "Sessoes",
    headers: ["id", "accountId", "tokenHash", "deviceId", "deviceName", "createdAt", "lastUsedAt", "expiresAt", "idleExpiresAt", "revokedAt", "revokedReason", "ipReference", "userAgentReference", "sessionVersion"]
  },
  gateTokens: {
    sheetName: "TokensAcesso",
    headers: ["id", "studentId", "accountId", "tokenHash", "expiresAt", "usedAt", "status", "createdAt", "deviceId"]
  },
  accessAttempts: {
    sheetName: "TentativasAcesso",
    headers: ["id", "timestamp", "studentId", "tokenId", "result", "reason", "validatedBy", "deviceId"]
  },
  loginAttempts: {
    sheetName: "TentativasLogin",
    headers: ["id", "timestamp", "login", "accountId", "result", "reason", "deviceId", "deviceName", "userAgentReference"]
  },
  staffTimeEntries: {
    sheetName: "PresencaProfessores",
    headers: ["id", "staffId", "staffName", "date", "clockIn", "clockOut", "durationMinutes", "status", "source", "deviceId", "notes", "createdAt", "updatedAt", "updatedBy"]
  },
  config: {
    sheetName: "Config",
    headers: ["id", "appName", "environment", "datasetId", "timezone", "currency", "logoUrl", "supportPhone", "whatsappNumber", "apiBaseUrl", "lastSnapshotAt", "schemaVersion", "plans", "modalities", "costCenters", "paymentAlertDays", "paymentGraceDays", "blockAccessOnOverdue", "updatedAt", "updatedBy", "source", "deviceId"]
  },
  log: {
    sheetName: "Log",
    headers: ["timestamp", "action", "resource", "recordId", "changedFields", "actor", "source", "deviceId", "result", "message"]
  }
};

function getSnapshotResourceNames() {
  return Object.keys(SHEETS).filter((resource) => !AUTH_RESOURCE_NAMES.includes(resource));
}

function initializeAuthSecrets() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(AUTH_PEPPER_PROPERTY)) {
    properties.setProperty(AUTH_PEPPER_PROPERTY, Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  }
  return { ok: true, configured: true };
}

function getAuthPepper() {
  const properties = PropertiesService.getScriptProperties();
  let pepper = properties.getProperty(AUTH_PEPPER_PROPERTY);
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(AUTH_PEPPER_PROPERTY, pepper);
  }
  return pepper;
}

function validatePasswordStrength(password) {
  const value = String(password || "");
  if (value.length < 8 || value.length > 128 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    const error = new Error("A senha deve possuir de 8 a 128 caracteres, com letras e numeros.");
    error.code = "WEAK_PASSWORD";
    throw error;
  }
  return value;
}

function createPasswordSalt() {
  const randomSource = Utilities.newBlob(Utilities.getUuid() + Utilities.getUuid()).getBytes();
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, randomSource));
}

function pbkdf2Sha256(passwordBytes, saltBytes, iterations, keyLength) {
  const rounds = Math.max(1, Number(iterations || PASSWORD_ITERATIONS));
  const desiredLength = Math.max(16, Number(keyLength || 32));
  const output = [];
  let blockIndex = 1;
  while (output.length < desiredLength) {
    const suffix = [(blockIndex >>> 24) & 255, (blockIndex >>> 16) & 255, (blockIndex >>> 8) & 255, blockIndex & 255];
    let current = hmacSha256Bytes(passwordBytes, saltBytes.concat(suffix));
    const block = current.slice();
    for (let round = 1; round < rounds; round += 1) {
      current = hmacSha256Bytes(passwordBytes, current);
      for (let index = 0; index < block.length; index += 1) block[index] ^= current[index];
    }
    output.push.apply(output, block);
    blockIndex += 1;
  }
  return output.slice(0, desiredLength);
}

function hmacSha256Bytes(keyBytes, valueBytes) {
  let key = (keyBytes || []).map((value) => value & 255);
  if (key.length > 64) key = sha256Bytes(key);
  while (key.length < 64) key.push(0);
  const inner = key.map((value) => value ^ 0x36).concat((valueBytes || []).map((value) => value & 255));
  const outer = key.map((value) => value ^ 0x5c).concat(sha256Bytes(inner));
  return sha256Bytes(outer);
}

function sha256Bytes(input) {
  const constants = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const bytes = (input || []).map((value) => value & 255);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  [high, low].forEach((word) => bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255));
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array(64);
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      words[index] = ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotate(words[index - 15], 7) ^ rotate(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotate(words[index - 2], 17) ^ rotate(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h=g; g=f; f=e; e=(d+temp1)>>>0; d=c; c=b; b=a; a=(temp1+temp2)>>>0;
    }
    [a,b,c,d,e,f,g,h].forEach((value, index) => hash[index] = (hash[index] + value) >>> 0);
  }
  const output = [];
  hash.forEach((word) => output.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255));
  return output;
}

function derivePasswordCredential(password, pepper, options) {
  const settings = options || {};
  const iterations = Math.max(1, Number(settings.iterations || PASSWORD_ITERATIONS));
  const salt = settings.salt || createPasswordSalt();
  const passwordBytes = Utilities.newBlob(String(password) + "\u001f" + String(pepper || "")).getBytes();
  const saltBytes = Utilities.base64Decode(salt).map((value) => value & 255);
  return {
    passwordHash: Utilities.base64Encode(pbkdf2Sha256(passwordBytes, saltBytes, iterations, 32)),
    passwordSalt: salt,
    passwordAlgorithm: PASSWORD_ALGORITHM,
    passwordVersion: PASSWORD_VERSION,
    passwordIterations: iterations
  };
}

function hashPassword(password) {
  return derivePasswordCredential(validatePasswordStrength(password), getAuthPepper());
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  return difference === 0;
}

function verifyPassword(password, account) {
  if (!account || account.passwordAlgorithm !== PASSWORD_ALGORITHM || Number(account.passwordVersion) !== PASSWORD_VERSION) return false;
  const credential = derivePasswordCredential(String(password || ""), getAuthPepper(), {
    salt: account.passwordSalt,
    iterations: Number(account.passwordIterations || PASSWORD_ITERATIONS)
  });
  return constantTimeEqual(credential.passwordHash, account.passwordHash);
}

function generateTemporaryPassword() {
  const source = String(Utilities.getUuid()).replace(/-/g, "");
  return "Pf" + source.slice(0, 5) + source.slice(-5) + "7";
}

function createSessionToken() {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.newBlob(Utilities.getUuid() + Utilities.getUuid() + new Date().toISOString()).getBytes()
  )).replace(/=+$/g, "") + "." + String(Utilities.getUuid()).replace(/-/g, "");
}

function hashSessionToken(token) {
  const bytes = Utilities.newBlob(String(token || "") + "\u001f" + getAuthPepper()).getBytes();
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)).replace(/=+$/g, "");
}

function createReferenceHash(value) {
  if (!value) return "";
  const bytes = Utilities.newBlob(String(value) + "\u001f" + getAuthPepper()).getBytes();
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)).replace(/=+$/g, "").slice(0, 24);
}

function getSessionPolicy(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "student") return { absoluteMinutes: 43200, idleMinutes: 10080 };
  if (normalized === "professor") return { absoluteMinutes: 720, idleMinutes: 15 };
  return { absoluteMinutes: 480, idleMinutes: 30 };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 0) * 60000);
}

function createAuthSession(account, context) {
  const settings = context || {};
  const now = new Date();
  const policy = getSessionPolicy(account.role);
  const token = createSessionToken();
  const session = {
    id: Utilities.getUuid(),
    accountId: account.id,
    tokenHash: hashSessionToken(token),
    deviceId: String(settings.deviceId || ""),
    deviceName: String(settings.deviceName || "Dispositivo nao identificado").slice(0, 120),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    expiresAt: addMinutes(now, policy.absoluteMinutes).toISOString(),
    idleExpiresAt: addMinutes(now, policy.idleMinutes).toISOString(),
    revokedAt: "",
    revokedReason: "",
    ipReference: createReferenceHash(settings.ipReference || ""),
    userAgentReference: createReferenceHash(settings.userAgent || ""),
    sessionVersion: Number(account.sessionVersion || 1)
  };
  upsertRow("sessions", session);
  return { token: token, session: sanitizeSession(session) };
}

function sanitizeSession(session) {
  const safe = Object.assign({}, session || {});
  delete safe.tokenHash;
  delete safe.ipReference;
  delete safe.userAgentReference;
  return safe;
}

function getSessionState(session) {
  if (!session) return "unknown";
  if (session.revokedAt) return "revoked";
  const now = Date.now();
  if (new Date(session.expiresAt).getTime() <= now || new Date(session.idleExpiresAt).getTime() <= now) return "expired";
  return "active";
}

function listManagedSessions() {
  const accounts = readSheet("accounts");
  const accountMap = Object.fromEntries(accounts.map((account) => [String(account.id), account]));
  return readSheet("sessions")
    .map((session) => {
      const account = accountMap[String(session.accountId)] || {};
      return Object.assign({}, sanitizeSession(session), {
        accountLogin: account.login || "Conta removida",
        accountRole: account.role || "",
        state: getSessionState(session)
      });
    })
    .sort((left, right) => String(right.lastUsedAt || right.createdAt || "").localeCompare(String(left.lastUsedAt || left.createdAt || "")))
    .slice(0, 200);
}

function appendLoginAttempt(details) {
  try {
    const sheet = getSheet("loginAttempts");
    const headers = getHeaders(sheet);
    const entry = Object.assign({
      id: Utilities.getUuid(),
      timestamp: new Date().toISOString(),
      login: "",
      accountId: "",
      result: "unknown",
      reason: "",
      deviceId: "",
      deviceName: "",
      userAgentReference: ""
    }, details || {});
    sheet.appendRow(headers.map((header) => serializeValue(entry[header])));
  } catch (error) {
    // Uma falha de auditoria nao deve impedir o login nem revelar credenciais.
  }
}

function listRecentLoginAttempts() {
  return readSheet("loginAttempts")
    .sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")))
    .slice(0, 200);
}

function sanitizeManagedAccount(account) {
  const safe = sanitizeAccount(account);
  safe.failedAttempts = Number(account && account.failedAttempts || 0);
  safe.lockedUntil = account && account.lockedUntil || "";
  return safe;
}

function getAccountById(accountId) {
  return readSheet("accounts").find((account) => String(account.id) === String(accountId)) || null;
}

function revokeSession(sessionId, reason) {
  const session = readSheet("sessions").find((item) => String(item.id) === String(sessionId));
  if (!session || session.revokedAt) return false;
  upsertRow("sessions", Object.assign({}, session, {
    revokedAt: new Date().toISOString(),
    revokedReason: String(reason || "revogada"),
    updatedAt: new Date().toISOString()
  }));
  return true;
}

function revokeAccountSessions(accountId, reason) {
  const sessions = readSheet("sessions").filter((item) => String(item.accountId) === String(accountId) && !item.revokedAt);
  sessions.forEach((session) => revokeSession(session.id, reason || "conta_atualizada"));
  return sessions.length;
}

function authenticateSessionToken(token, options) {
  const settings = options || {};
  if (!token) {
    const error = new Error("Autenticacao obrigatoria.");
    error.code = "AUTH_REQUIRED";
    throw error;
  }
  const tokenHash = hashSessionToken(token);
  const session = readSheet("sessions").find((item) => constantTimeEqual(item.tokenHash, tokenHash));
  const now = new Date();
  if (!session || session.revokedAt) {
    const error = new Error("Sessao invalida ou revogada.");
    error.code = "INVALID_SESSION";
    throw error;
  }
  if (new Date(session.expiresAt).getTime() <= now.getTime() || new Date(session.idleExpiresAt).getTime() <= now.getTime()) {
    revokeSession(session.id, "expirada");
    const error = new Error("Sessao expirada.");
    error.code = "SESSION_EXPIRED";
    throw error;
  }
  const account = getAccountById(session.accountId);
  if (!account || account.active === false || String(account.active).toLowerCase() === "false" || Number(account.sessionVersion || 1) !== Number(session.sessionVersion || 1)) {
    revokeSession(session.id, "conta_inativa_ou_alterada");
    const error = new Error("Conta inativa ou sessao desatualizada.");
    error.code = "ACCOUNT_INACTIVE";
    throw error;
  }
  let activeSession = session;
  if (settings.touch !== false) {
    const policy = getSessionPolicy(account.role);
    activeSession = Object.assign({}, session, {
      lastUsedAt: now.toISOString(),
      idleExpiresAt: addMinutes(now, policy.idleMinutes).toISOString()
    });
    upsertRow("sessions", activeSession);
  }
  return { account: account, session: sanitizeSession(activeSession), token: token };
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = (params.action || "").toLowerCase();
  try {
    if (action === "health") {
      return jsonResponse({
        ok: true,
        environment: getConfiguredEnvironmentReadOnly(),
        version: "2026.07",
        schemaVersion: Number(PropertiesService.getScriptProperties().getProperty(SCHEMA_VERSION_PROPERTY) || 0),
        configured: Boolean(getResolvedSpreadsheetId())
      });
    }
    const error = new Error("Use POST para operacoes da API.");
    error.code = "METHOD_NOT_ALLOWED";
    throw error;
  } catch (error) {
    return errorResponse(error);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = (body.action || "upsert").toLowerCase();

    if (action === "setup") {
      const error = new Error("O setup deve ser executado somente pelo editor vinculado a planilha.");
      error.code = "SETUP_NOT_PUBLIC";
      throw error;
    }

    const setup = ensureApiReady();
    if (action === "login") return jsonResponse({ ok: true, data: handleLogin(body) });
    const auth = authenticateSessionToken(body.token);

    if (action === "logout") {
      revokeSession(auth.session.id, "logout");
      return jsonResponse({ ok: true, data: { loggedOut: true } });
    }

    if (action === "session") {
      return jsonResponse({ ok: true, data: { account: sanitizeAccount(auth.account), session: auth.session } });
    }

    if (action === "unlocksession") {
      return jsonResponse({ ok: true, data: unlockCurrentSession(auth, body) });
    }

    if (action === "changepassword") {
      return jsonResponse({ ok: true, data: changeOwnPassword(auth, body) });
    }

    if (action === "studentbootstrap") {
      requirePermission(auth.account, "student.self.read");
      return jsonResponse({ ok: true, data: buildStudentBootstrap(auth.account) });
    }

    if (action === "studentupsert" || action === "studentdelete") {
      requirePermission(auth.account, "student.self.write");
      return jsonResponse({ ok: true, data: handleStudentMutation(auth.account, action, body) });
    }

    if (action === "professorbootstrap") {
      requirePermission(auth.account, "professional.read");
      return jsonResponse({ ok: true, data: buildProfessorBootstrap(auth.account) });
    }

    if (action === "paymentcontext") {
      requirePermission(auth.account, "payments.receive");
      return jsonResponse({ ok: true, data: getProfessorPaymentContext(body.studentId, body.reference) });
    }

    if (action === "receivepayment") {
      requirePermission(auth.account, "payments.receive");
      return jsonResponse({ ok: true, data: receiveStudentPayment(auth.account, body.data || {}) });
    }

    if (action === "staffpresenceupsert") {
      requirePermission(auth.account, "staff.presence");
      return jsonResponse({ ok: true, data: upsertOwnStaffPresence(auth.account, body.data || {}) });
    }

    if (action === "listaccounts") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: readSheet("accounts").map(sanitizeManagedAccount) });
    }

    if (action === "createaccount") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: createManagedAccount(body.data || {}, auth.account) });
    }

    if (action === "resetpassword") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: resetManagedPassword(body.accountId, auth.account) });
    }

    if (action === "updateaccount") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: updateManagedAccount(body.data || {}, auth.account) });
    }

    if (action === "listsessions") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: listManagedSessions() });
    }

    if (action === "listloginattempts") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: listRecentLoginAttempts() });
    }

    if (action === "revokesession") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: { revoked: revokeSession(body.sessionId, "revogada_pela_administracao") } });
    }

    if (action === "revokeaccountsessions") {
      requirePermission(auth.account, "users.manage");
      return jsonResponse({ ok: true, data: { revoked: revokeAccountSessions(body.accountId, "revogadas_pela_administracao") } });
    }

    if (action === "restoredemo") {
      requirePermission(auth.account, "backups.manage");
      return jsonResponse({ ok: true, data: restoreDemoSnapshot(body, auth.account) });
    }

    if (action === "requestgatetoken") {
      requirePermission(auth.account, "gate.request");
      return jsonResponse({ ok: true, data: issueGateToken(auth.account, body.deviceId) });
    }

    if (action === "validategate") {
      requirePermission(auth.account, "gate.validate");
      return jsonResponse({ ok: true, data: validateGateToken(auth.account, body.payload, body.deviceId) });
    }

    if (action === "exportall") {
      requirePermission(auth.account, "backups.manage");
      return jsonResponse({ ok: true, data: exportAllData(setup) });
    }

    if (action === "importall") {
      requirePermission(auth.account, "backups.manage");
      validateCompleteSnapshot(body.snapshot);
      const snapshot = normalizeSnapshot(body.snapshot, getSnapshotResourceNames());
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
          schemaVersion: CURRENT_SCHEMA_VERSION,
          imported: countSnapshotRows(snapshot)
        }
      });
    }

    if (action === "importpartial") {
      requirePermission(auth.account, "backups.manage");
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
          schemaVersion: CURRENT_SCHEMA_VERSION,
          imported: countSnapshotRows(snapshot)
        }
      });
    }

    const resource = resolveResourceName(body.resource || "");
    const data = body.data || {};
    validateResource(resource);
    if (AUTH_RESOURCE_NAMES.includes(resource)) {
      const error = new Error("Recurso privado de autenticacao.");
      error.code = "PRIVATE_RESOURCE";
      throw error;
    }
    if (String(auth.account.role) === "student") {
      const error = new Error("O aluno deve usar os endpoints individuais.");
      error.code = "FORBIDDEN";
      throw error;
    }

    if (action === "read") {
      authorizeGenericOperation(auth.account, resource, "read");
      const rows = sanitizeResourceRows(resource, readSheet(resource));
      const payload = body.id ? rows.find((row) => String(row.id) === String(body.id)) || null : rows;
      return jsonResponse({ ok: true, data: payload });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      let response;
      authorizeGenericOperation(auth.account, resource, action);
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
        data: Object.assign({}, data, { updatedBy: auth.account.id }),
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

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function findAccountByLogin(login) {
  const normalized = normalizeLogin(login);
  return readSheet("accounts").find((account) => normalizeLogin(account.login) === normalized || normalizeLogin(account.email) === normalized) || null;
}

function handleLogin(body) {
  const login = normalizeLogin(body.login);
  const password = String(body.password || "");
  const attemptBase = {
    login: login,
    deviceId: String(body.deviceId || ""),
    deviceName: String(body.deviceName || "").slice(0, 120),
    userAgentReference: createReferenceHash(body.userAgent || "")
  };
  if (!login || !password) {
    appendLoginAttempt(Object.assign({}, attemptBase, { result: "rejected", reason: "Usuario ou senha nao informados." }));
    const error = new Error("Informe usuario e senha.");
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }
  const account = findAccountByLogin(login);
  const now = new Date();
  if (!account) {
    derivePasswordCredential(password, getAuthPepper(), { salt: createPasswordSalt(), iterations: PASSWORD_ITERATIONS });
    appendLoginAttempt(Object.assign({}, attemptBase, { result: "rejected", reason: "Login inexistente ou senha invalida." }));
    const error = new Error("Usuario ou senha invalidos.");
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }
  attemptBase.accountId = account.id;
  if (account.active === false || String(account.active).toLowerCase() === "false") {
    appendLoginAttempt(Object.assign({}, attemptBase, { result: "inactive", reason: "Conta inativa." }));
    const error = new Error("Conta indisponivel. Procure a administracao.");
    error.code = "ACCOUNT_INACTIVE";
    throw error;
  }
  if (account.lockedUntil && new Date(account.lockedUntil).getTime() > now.getTime()) {
    appendLoginAttempt(Object.assign({}, attemptBase, { result: "locked", reason: "Conta temporariamente bloqueada." }));
    const error = new Error("Conta temporariamente bloqueada. Tente novamente mais tarde.");
    error.code = "ACCOUNT_LOCKED";
    throw error;
  }
  if (account.temporaryPasswordExpiresAt && account.mustChangePassword && new Date(account.temporaryPasswordExpiresAt).getTime() <= now.getTime()) {
    appendLoginAttempt(Object.assign({}, attemptBase, { result: "expired_password", reason: "Senha temporaria expirada." }));
    const error = new Error("A senha temporaria expirou. Solicite uma nova a administracao.");
    error.code = "TEMPORARY_PASSWORD_EXPIRED";
    throw error;
  }
  if (!verifyPassword(password, account)) {
    const failedAttempts = Number(account.failedAttempts || 0) + 1;
    const lockedUntil = failedAttempts >= 5 ? addMinutes(now, 15).toISOString() : "";
    upsertRow("accounts", Object.assign({}, account, {
      failedAttempts: failedAttempts >= 5 ? 0 : failedAttempts,
      lockedUntil: lockedUntil,
      updatedAt: now.toISOString()
    }));
    appendLoginAttempt(Object.assign({}, attemptBase, {
      result: lockedUntil ? "locked" : "rejected",
      reason: lockedUntil ? "Conta bloqueada apos cinco tentativas incorretas." : "Senha incorreta."
    }));
    const error = new Error(lockedUntil ? "Conta bloqueada por 15 minutos apos tentativas incorretas." : "Usuario ou senha invalidos.");
    error.code = lockedUntil ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS";
    throw error;
  }
  const upgradedCredential = Number(account.passwordIterations || 0) === PASSWORD_ITERATIONS ? {} : derivePasswordCredential(password, getAuthPepper(), { iterations: PASSWORD_ITERATIONS });
  const updatedAccount = Object.assign({}, account, upgradedCredential, {
    failedAttempts: 0,
    lockedUntil: "",
    lastLoginAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
  upsertRow("accounts", updatedAccount);
  const issued = createAuthSession(updatedAccount, {
    deviceId: body.deviceId,
    deviceName: body.deviceName,
    userAgent: body.userAgent,
    ipReference: body.ipReference
  });
  appendLoginAttempt(Object.assign({}, attemptBase, { result: "success", reason: "Login realizado." }));
  return { token: issued.token, session: issued.session, account: sanitizeAccount(updatedAccount) };
}

function changeOwnPassword(auth, body) {
  const account = getAccountById(auth.account.id);
  if (!account || !verifyPassword(String(body.currentPassword || ""), account)) {
    const error = new Error("A senha atual nao confere.");
    error.code = "INVALID_CURRENT_PASSWORD";
    throw error;
  }
  const credential = hashPassword(body.newPassword);
  const now = new Date().toISOString();
  const updated = Object.assign({}, account, credential, {
    mustChangePassword: false,
    temporaryPasswordExpiresAt: "",
    passwordChangedAt: now,
    sessionVersion: Number(account.sessionVersion || 1) + 1,
    failedAttempts: 0,
    lockedUntil: "",
    updatedAt: now
  });
  upsertRow("accounts", updated);
  revokeAccountSessions(account.id, "senha_alterada");
  const issued = createAuthSession(updated, {
    deviceId: body.deviceId || auth.session.deviceId,
    deviceName: body.deviceName || auth.session.deviceName,
    userAgent: body.userAgent
  });
  return { token: issued.token, session: issued.session, account: sanitizeAccount(updated) };
}

function getStudentIdForAccount(account) {
  if (String(account && account.role || "") !== "student" || !account.personId) {
    const error = new Error("Conta de aluno sem vinculo cadastral.");
    error.code = "STUDENT_LINK_REQUIRED";
    throw error;
  }
  return String(account.personId);
}

function buildStudentBootstrap(account) {
  const studentId = getStudentIdForAccount(account);
  const student = readSheet("students").find((item) => String(item.id) === studentId);
  if (!student) {
    const error = new Error("Cadastro do aluno nao encontrado.");
    error.code = "STUDENT_NOT_FOUND";
    throw error;
  }
  const own = (resource) => sanitizeResourceRows(resource, readSheet(resource).filter((item) => String(item.studentId) === studentId));
  const workouts = own("workouts");
  const workoutIds = new Set(workouts.map((item) => String(item.id)));
  const exerciseIds = new Set();
  workouts.forEach((workout) => (Array.isArray(workout.exerciseItems) ? workout.exerciseItems : []).forEach((item) => {
    if (item.exerciseId) exerciseIds.add(String(item.exerciseId));
  }));
  const schedule = sanitizeResourceRows("schedule", readSheet("schedule").filter((item) => !item.studentId || String(item.studentId) === studentId));
  const config = readSheet("config")[0] || {};
  return {
    student: sanitizeStudentSelf(student),
    workouts: workouts,
    exercises: sanitizeResourceRows("exercises", readSheet("exercises").filter((item) => exerciseIds.has(String(item.id)))),
    workoutSessions: own("workoutSessions"),
    exerciseSets: own("exerciseSets"),
    schedule: schedule,
    checkins: own("checkins"),
    assessments: own("assessments"),
    payments: own("payments"),
    config: [{
      id: config.id || "CONFIG-001",
      appName: config.appName || "Pro Fitness Academia",
      environment: config.environment || "demo",
      datasetId: config.datasetId || "",
      timezone: config.timezone || "America/Sao_Paulo",
      currency: config.currency || "BRL",
      supportPhone: config.supportPhone || "",
      whatsappNumber: config.whatsappNumber || "",
      paymentAlertDays: config.paymentAlertDays || [7, 3, 0],
      paymentGraceDays: Number(config.paymentGraceDays || 0),
      blockAccessOnOverdue: config.blockAccessOnOverdue !== false
    }]
  };
}

function handleStudentMutation(account, action, body) {
  const studentId = getStudentIdForAccount(account);
  const resource = resolveResourceName(body.resource || "");
  if (!["workoutSessions", "exerciseSets"].includes(resource)) {
    const error = new Error("O aluno nao pode alterar este recurso.");
    error.code = "FORBIDDEN";
    throw error;
  }
  const data = Object.assign({}, body.data || {}, {
    studentId: studentId,
    updatedBy: account.id,
    source: "app-aluno"
  });
  if (action === "studentdelete") {
    const existing = readSheet(resource).find((item) => String(item.id) === String(data.id) && String(item.studentId) === studentId);
    if (!existing) {
      const error = new Error("Registro do aluno nao encontrado.");
      error.code = "NOT_FOUND";
      throw error;
    }
    return deleteRow(resource, data.id, data.expectedUpdatedAt);
  }
  if (resource === "workoutSessions") {
    const workout = readSheet("workouts").find((item) => String(item.id) === String(data.workoutId) && String(item.studentId) === studentId);
    if (!workout) {
      const error = new Error("Treino nao pertence ao aluno autenticado.");
      error.code = "FORBIDDEN";
      throw error;
    }
  }
  if (resource === "exerciseSets") {
    const session = readSheet("workoutSessions").find((item) => String(item.id) === String(data.sessionId) && String(item.studentId) === studentId);
    if (!session) {
      const error = new Error("Sessao de treino nao pertence ao aluno autenticado.");
      error.code = "FORBIDDEN";
      throw error;
    }
  }
  return upsertRow(resource, data);
}

function sanitizeStudentSelf(student) {
  const safe = Object.assign({}, student || {});
  ["accountId", "enrollmentToken", "updatedBy", "source", "deviceId"].forEach((field) => delete safe[field]);
  return safe;
}

function getStaffProfile(account) {
  return readSheet("users").find((user) => String(user.accountId) === String(account.id) || String(user.id) === String(account.personId)) || null;
}

function buildProfessorBootstrap(account) {
  const profile = getStaffProfile(account);
  const payments = readSheet("payments");
  const configRecord = readSheet("config")[0] || {};
  const students = readSheet("students").map((student) => sanitizeStudentForProfessor(student, payments, configRecord));
  const publicConfig = getProfessorPublicConfig();
  return {
    students: students,
    assessments: sanitizeResourceRows("assessments", readSheet("assessments")),
    workouts: sanitizeResourceRows("workouts", readSheet("workouts")),
    schedule: sanitizeResourceRows("schedule", readSheet("schedule")),
    checkins: sanitizeResourceRows("checkins", readSheet("checkins")),
    workoutSessions: sanitizeResourceRows("workoutSessions", readSheet("workoutSessions")),
    exerciseSets: sanitizeResourceRows("exerciseSets", readSheet("exerciseSets")),
    exercises: sanitizeResourceRows("exercises", readSheet("exercises")),
    users: profile ? [sanitizeResourceRows("users", [profile])[0]] : [],
    staffTimeEntries: sanitizeResourceRows("staffTimeEntries", readSheet("staffTimeEntries").filter((entry) => String(entry.staffId) === String(account.personId))),
    config: [publicConfig]
  };
}

function sanitizeStudentForProfessor(student, payments, config) {
  const safe = sanitizeResourceRows("students", [student])[0];
  ["monthlyFee", "accountId", "cpf", "enrollmentToken", "gateCode", "accessBlockReason"].forEach((field) => delete safe[field]);
  safe.operationalAccess = getProfessorOperationalAccess(student, payments, config);
  return safe;
}

function getProfessorOperationalAccess(student, paymentRows, configRecord) {
  if (!student || student.status !== "ativo" || student.appAccessPolicy === "bloqueado" || student.enrollmentStatus !== "ativo") {
    return { status: "bloqueado", label: "Bloqueado", allowsGate: false, reason: "Acesso indisponivel. Encaminhe o aluno a administracao." };
  }
  if (student.appAccessPolicy === "liberado") return { status: "liberado", label: "OK", allowsGate: true, reason: "Acesso autorizado." };
  const payments = (paymentRows || []).filter((payment) => String(payment.studentId) === String(student.id)).sort((a, b) => String(b.dueDate || "").localeCompare(String(a.dueDate || "")));
  const month = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Sao_Paulo", "yyyy-MM");
  const payment = payments.find((item) => String(item.reference) === month) || payments[0];
  const config = configRecord || {};
  if (payment && ["vencido", "pendente", "parcial"].includes(String(payment.status)) && config.blockAccessOnOverdue !== false && String(config.blockAccessOnOverdue) !== "false") {
    const due = new Date(String(payment.dueDate || "") + "T12:00:00");
    due.setDate(due.getDate() + Number(config.paymentGraceDays || 0));
    if (due.getTime() < new Date().getTime()) return { status: "bloqueado", label: "Bloqueado", allowsGate: false, reason: "Acesso indisponivel. Encaminhe o aluno a administracao." };
  }
  return { status: "liberado", label: "OK", allowsGate: true, reason: "Acesso autorizado." };
}

function getProfessorPublicConfig() {
  const config = readSheet("config")[0] || {};
  return {
    id: config.id || "CONFIG-001",
    appName: config.appName || "Pro Fitness Academia",
    environment: config.environment || "demo",
    datasetId: config.datasetId || "",
    timezone: config.timezone || "America/Sao_Paulo",
    plans: config.plans || [],
    modalities: config.modalities || []
  };
}

function getProfessorPaymentContext(studentId, reference) {
  const student = readSheet("students").find((item) => String(item.id) === String(studentId));
  if (!student) {
    const error = new Error("Aluno nao encontrado.");
    error.code = "NOT_FOUND";
    throw error;
  }
  const selectedReference = String(reference || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Sao_Paulo", "yyyy-MM"));
  const payment = readSheet("payments").find((item) => String(item.studentId) === String(studentId) && String(item.reference) === selectedReference) || null;
  return {
    student: { id: student.id, name: student.name, plan: student.plan },
    reference: selectedReference,
    payment: payment ? sanitizeResourceRows("payments", [payment])[0] : null,
    suggestedAmount: Number(payment && payment.amount || student.monthlyFee || 0)
  };
}

function receiveStudentPayment(account, payload) {
  const context = getProfessorPaymentContext(payload.studentId, payload.reference);
  if (context.payment && ["pago", "estornado", "cancelado"].includes(String(context.payment.status))) {
    const error = new Error("Este pagamento ja possui registro definitivo. Ajustes devem ser feitos pela administracao.");
    error.code = "PAYMENT_LOCKED";
    throw error;
  }
  const amount = Number(payload.amount || context.suggestedAmount || 0);
  const discount = Math.max(0, Number(payload.discount || 0));
  const fine = Math.max(0, Number(payload.fine || 0));
  const netAmount = Math.max(0, amount - discount + fine);
  const paidAmount = Math.max(0, Number(payload.paidAmount || netAmount));
  if (amount <= 0 || paidAmount <= 0 || paidAmount > netAmount) {
    const error = new Error("Valores do recebimento sao invalidos.");
    error.code = "INVALID_PAYMENT";
    throw error;
  }
  const profile = getStaffProfile(account);
  const now = new Date();
  const payment = Object.assign({}, context.payment || {}, {
    id: context.payment && context.payment.id || Utilities.getUuid(),
    studentId: context.student.id,
    reference: context.reference,
    amount: amount,
    discount: discount,
    fine: fine,
    netAmount: netAmount,
    paidAmount: paidAmount,
    dueDate: payload.dueDate || now.toISOString().slice(0, 10),
    status: paidAmount < netAmount ? "parcial" : "pago",
    method: String(payload.method || "pix"),
    paidAt: payload.paidAt || now.toISOString().slice(0, 10),
    recordedBy: profile && profile.name || account.id,
    description: "Mensalidade",
    notes: String(payload.notes || ""),
    createdAt: context.payment && context.payment.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    updatedBy: account.id,
    source: "tablet-professor"
  });
  const savedPayment = upsertRow("payments", payment);
  const movement = upsertRow("movements", {
    id: Utilities.getUuid(), date: payment.paidAt, time: Utilities.formatDate(now, Session.getScriptTimeZone() || "America/Sao_Paulo", "HH:mm"), type: "entrada", category: "mensalidade",
    description: "Mensalidade " + payment.reference + " - " + context.student.name, amount: paidAmount, method: payment.method, account: "caixa-principal",
    studentId: payment.studentId, paymentId: payment.id, status: "confirmado", createdAt: now.toISOString(), updatedAt: now.toISOString(), updatedBy: account.id, source: "tablet-professor"
  });
  appendLog(buildAuditLogEntry({ action: "receivePayment", resource: "payments", recordId: savedPayment.id, actor: account.id, result: "success", message: "Recebimento individual registrado pelo professor." }));
  return { payment: savedPayment, movement: movement, student: context.student };
}

function upsertOwnStaffPresence(account, payload) {
  const profile = getStaffProfile(account);
  const existing = payload.id ? readSheet("staffTimeEntries").find((entry) => String(entry.id) === String(payload.id)) : null;
  if (existing && String(existing.staffId) !== String(account.personId)) {
    const error = new Error("Registro de presenca pertence a outro professor.");
    error.code = "FORBIDDEN";
    throw error;
  }
  return upsertRow("staffTimeEntries", Object.assign({}, existing || {}, payload, {
    id: existing && existing.id || payload.id || Utilities.getUuid(),
    staffId: account.personId,
    staffName: profile && profile.name || account.login,
    updatedAt: new Date().toISOString(),
    updatedBy: account.id,
    source: "tablet-professor"
  }));
}

function createManagedAccount(payload, actor) {
  const login = normalizeLogin(payload.login);
  const role = String(payload.role || "").toLowerCase();
  if (!login || !["student", "professor", "admin"].includes(role)) {
    const error = new Error("Informe login e perfil validos.");
    error.code = "INVALID_ACCOUNT";
    throw error;
  }
  if (findAccountByLogin(login)) {
    const error = new Error("Este login ou e-mail ja esta em uso.");
    error.code = "DUPLICATE_LOGIN";
    throw error;
  }
  const temporaryPassword = generateTemporaryPassword();
  const now = new Date();
  const account = Object.assign({
    id: Utilities.getUuid(), personType: role === "student" ? "student" : "staff", personId: String(payload.personId || ""), login: login,
    email: normalizeLogin(payload.email), role: role, permissions: Array.isArray(payload.permissions) ? payload.permissions : [], active: true,
    mustChangePassword: true, temporaryPasswordExpiresAt: addMinutes(now, 72 * 60).toISOString(), failedAttempts: 0, lockedUntil: "", lastLoginAt: "",
    passwordChangedAt: "", sessionVersion: 1, createdAt: now.toISOString(), updatedAt: now.toISOString()
  }, hashPassword(temporaryPassword));
  upsertRow("accounts", account);
  linkAccountToPerson(account);
  appendLog(buildAuditLogEntry({ action: "createAccount", resource: "accounts", recordId: account.id, actor: actor.id, result: "success", message: "Conta criada pela administracao." }));
  return { account: sanitizeAccount(account), temporaryPassword: temporaryPassword };
}

function linkAccountToPerson(account) {
  if (!account.personId) return;
  if (account.role === "student") {
    const student = readSheet("students").find((item) => String(item.id) === String(account.personId));
    if (student) upsertRow("students", Object.assign({}, student, { accountId: account.id, enrollmentNumber: student.enrollmentNumber || account.login, updatedAt: new Date().toISOString() }));
    return;
  }
  const user = readSheet("users").find((item) => String(item.id) === String(account.personId));
  if (user) upsertRow("users", Object.assign({}, user, { accountId: account.id, updatedAt: new Date().toISOString() }));
}

function resetManagedPassword(accountId, actor) {
  const account = getAccountById(accountId);
  if (!account) {
    const error = new Error("Conta nao encontrada.");
    error.code = "NOT_FOUND";
    throw error;
  }
  const temporaryPassword = generateTemporaryPassword();
  const now = new Date();
  const updated = Object.assign({}, account, hashPassword(temporaryPassword), {
    mustChangePassword: true, temporaryPasswordExpiresAt: addMinutes(now, 72 * 60).toISOString(), sessionVersion: Number(account.sessionVersion || 1) + 1,
    failedAttempts: 0, lockedUntil: "", updatedAt: now.toISOString()
  });
  upsertRow("accounts", updated);
  revokeAccountSessions(account.id, "senha_redefinida");
  appendLog(buildAuditLogEntry({ action: "resetPassword", resource: "accounts", recordId: account.id, actor: actor.id, result: "success", message: "Senha temporaria redefinida." }));
  return { account: sanitizeAccount(updated), temporaryPassword: temporaryPassword };
}

function updateManagedAccount(payload, actor) {
  const account = getAccountById(payload.id);
  if (!account) {
    const error = new Error("Conta nao encontrada.");
    error.code = "NOT_FOUND";
    throw error;
  }
  const updated = Object.assign({}, account, {
    active: payload.active !== false && String(payload.active) !== "false",
    permissions: Array.isArray(payload.permissions) ? payload.permissions : account.permissions,
    sessionVersion: Number(account.sessionVersion || 1) + 1,
    updatedAt: new Date().toISOString()
  });
  upsertRow("accounts", updated);
  revokeAccountSessions(account.id, "conta_atualizada");
  appendLog(buildAuditLogEntry({ action: "updateAccount", resource: "accounts", recordId: account.id, actor: actor.id, result: "success", message: "Conta atualizada pela administracao." }));
  return sanitizeAccount(updated);
}

function restoreDemoSnapshot(body, actor) {
  if (getConfiguredEnvironment() !== "demo") {
    const error = new Error("Restauracao demonstrativa bloqueada fora do ambiente demo.");
    error.code = "DEMO_ONLY";
    throw error;
  }
  if (String(body.confirmation || "").trim().toUpperCase() !== "RESTAURAR DEMONSTRACAO") {
    const error = new Error("Frase de confirmacao incorreta.");
    error.code = "CONFIRMATION_REQUIRED";
    throw error;
  }
  validateCompleteSnapshot(body.snapshot);
  const snapshot = normalizeSnapshot(body.snapshot, getSnapshotResourceNames());
  const spreadsheet = getOrCreateSpreadsheet();
  const backupName = "Pro Fitness - backup antes da restauracao - " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Sao_Paulo", "yyyy-MM-dd HH-mm-ss");
  const backupFile = DriveApp.getFileById(spreadsheet.getId()).makeCopy(backupName);
  importAllData(snapshot);
  appendLog(buildAuditLogEntry({ action: "restoreDemo", resource: "snapshot", actor: actor.id, result: "success", message: "Demonstracao restaurada apos backup automatico." }));
  return { restored: true, backupFileId: backupFile.getId(), imported: countSnapshotRows(snapshot) };
}

function signGateValue(value) {
  const signature = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(value)).getBytes(), Utilities.newBlob(getAuthPepper()).getBytes());
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, "");
}

function issueGateToken(account, deviceId) {
  const studentId = getStudentIdForAccount(account);
  const student = readSheet("students").find((item) => String(item.id) === studentId);
  const access = getProfessorOperationalAccess(student, readSheet("payments"), readSheet("config")[0] || {});
  if (!access.allowsGate) return { allowed: false, status: "blocked", reason: "Acesso indisponivel. Procure a administracao." };
  const token = createSessionToken();
  const now = new Date();
  const expiresAt = addMinutes(now, 1).toISOString();
  const record = {
    id: Utilities.getUuid(), studentId: studentId, accountId: account.id, tokenHash: hashSessionToken(token), expiresAt: expiresAt,
    usedAt: "", status: "issued", createdAt: now.toISOString(), deviceId: String(deviceId || "")
  };
  upsertRow("gateTokens", record);
  const signature = signGateValue(token + "|" + expiresAt);
  return { allowed: true, expiresAt: expiresAt, payload: JSON.stringify({ type: "profitness-gate", version: 1, token: token, expiresAt: expiresAt, signature: signature }) };
}

function validateGateTokenUnlocked(account, rawPayload, deviceId) {
  let payload;
  try {
    payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch (error) {
    return registerGateAttempt(account, null, "invalid", "Codigo invalido.", deviceId);
  }
  if (!payload || payload.type !== "profitness-gate" || !constantTimeEqual(signGateValue(String(payload.token || "") + "|" + String(payload.expiresAt || "")), payload.signature)) {
    return registerGateAttempt(account, null, "invalid", "Assinatura invalida.", deviceId);
  }
  const hash = hashSessionToken(payload.token);
  const tokenRecord = readSheet("gateTokens").find((item) => constantTimeEqual(item.tokenHash, hash));
  if (!tokenRecord) return registerGateAttempt(account, null, "invalid", "Codigo inexistente.", deviceId);
  if (tokenRecord.usedAt || tokenRecord.status === "used") return registerGateAttempt(account, tokenRecord, "reused", "Codigo ja utilizado.", deviceId);
  if (new Date(tokenRecord.expiresAt).getTime() <= Date.now() || String(tokenRecord.expiresAt) !== String(payload.expiresAt)) {
    upsertRow("gateTokens", Object.assign({}, tokenRecord, { status: "expired" }));
    return registerGateAttempt(account, tokenRecord, "expired", "Codigo expirado.", deviceId);
  }
  const student = readSheet("students").find((item) => String(item.id) === String(tokenRecord.studentId));
  if (!student) return registerGateAttempt(account, tokenRecord, "not_found", "Aluno inexistente.", deviceId);
  const access = getProfessorOperationalAccess(student, readSheet("payments"), readSheet("config")[0] || {});
  const now = new Date();
  upsertRow("gateTokens", Object.assign({}, tokenRecord, { usedAt: now.toISOString(), status: "used" }));
  if (!access.allowsGate) return registerGateAttempt(account, tokenRecord, "blocked", "Acesso bloqueado. Encaminhe a administracao.", deviceId);
  upsertRow("checkins", {
    id: Utilities.getUuid(), studentId: student.id, date: Utilities.formatDate(now, Session.getScriptTimeZone() || "America/Sao_Paulo", "yyyy-MM-dd"),
    time: Utilities.formatDate(now, Session.getScriptTimeZone() || "America/Sao_Paulo", "HH:mm"), type: "access", checkedInAt: now.toISOString(), checkedOutAt: "",
    presenceSource: "catraca-simulada", presenceStatus: "presente", notes: "Entrada validada por QR temporario.", updatedAt: now.toISOString(), updatedBy: account.id, source: "gate-simulator", deviceId: String(deviceId || "")
  });
  const result = registerGateAttempt(account, tokenRecord, "allowed", "Acesso liberado.", deviceId);
  result.student = { id: student.id, name: student.name };
  return result;
}

function validateGateToken(account, rawPayload, deviceId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return validateGateTokenUnlocked(account, rawPayload, deviceId);
  } finally {
    lock.releaseLock();
  }
}

function registerGateAttempt(account, tokenRecord, result, reason, deviceId) {
  upsertRow("accessAttempts", {
    id: Utilities.getUuid(), timestamp: new Date().toISOString(), studentId: tokenRecord && tokenRecord.studentId || "", tokenId: tokenRecord && tokenRecord.id || "",
    result: result, reason: reason, validatedBy: account.id, deviceId: String(deviceId || "")
  });
  return { allowed: result === "allowed", result: result, reason: reason };
}

function getConfiguredEnvironmentReadOnly() {
  try {
    const spreadsheetId = getResolvedSpreadsheetId();
    if (!spreadsheetId) return "unknown";
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(SHEETS.config.sheetName);
    if (!sheet || sheet.getLastRow() < 2) return "unknown";
    const headers = getHeaders(sheet);
    const environmentIndex = headers.indexOf("environment");
    if (environmentIndex < 0) return "unknown";
    const value = String(sheet.getRange(2, environmentIndex + 1).getValue() || "").trim().toLowerCase();
    return value === "production" ? "production" : value === "demo" ? "demo" : "unknown";
  } catch (error) {
    return "unknown";
  }
}

function getConfiguredEnvironment() {
  try {
    const config = readSheet("config")[0] || {};
    const value = String(config.environment || "").toLowerCase();
    return value === "production" ? "production" : value === "demo" ? "demo" : "unknown";
  } catch (error) {
    return "unknown";
  }
}

function requireTemporaryAdminRole(account) {
  if (String(account && account.role || "").toLowerCase() !== "admin") {
    const error = new Error("Operacao exclusiva da administracao.");
    error.code = "FORBIDDEN";
    throw error;
  }
}

function sanitizeAccount(account) {
  const safe = Object.assign({}, account || {});
  ["passwordHash", "passwordSalt", "passwordAlgorithm", "passwordVersion", "passwordIterations", "failedAttempts", "lockedUntil"].forEach((field) => delete safe[field]);
  safe.permissions = getAccountPermissions(account);
  return safe;
}

function getAccountPermissions(account) {
  const role = String(account && account.role || "").toLowerCase();
  const defaults = ROLE_PERMISSIONS[role] || [];
  const custom = Array.isArray(account && account.permissions) ? account.permissions : [];
  return [...new Set(defaults.concat(custom).map((permission) => String(permission || "").trim()).filter(Boolean))];
}

function hasPermission(account, permission) {
  return getAccountPermissions(account).includes(String(permission || ""));
}

function requirePermission(account, permission) {
  if (!hasPermission(account, permission)) {
    const error = new Error("Voce nao possui permissao para esta operacao.");
    error.code = "FORBIDDEN";
    throw error;
  }
  return true;
}

function authorizeGenericOperation(account, resource, action) {
  const operation = String(action || "read").toLowerCase();
  const professionalResources = ["assessments", "workouts", "schedule", "checkins", "workoutSessions", "exerciseSets", "exercises"];
  const financeResources = ["payments", "movements", "expenses", "cashClosings"];
  if (resource === "students") return requirePermission(account, operation === "read" ? "students.read" : "students.write");
  if (professionalResources.includes(resource)) return requirePermission(account, operation === "read" ? "professional.read" : "professional.write");
  if (financeResources.includes(resource)) return requirePermission(account, "finance.manage");
  if (resource === "staffTimeEntries") return requirePermission(account, "staff.presence.read");
  if (resource === "users") return requirePermission(account, "users.manage");
  if (resource === "config") return requirePermission(account, operation === "read" ? "settings.manage" : "settings.manage");
  if (resource === "log") return requirePermission(account, "reports.read");
  const error = new Error("Operacao nao autorizada para este recurso.");
  error.code = "FORBIDDEN";
  throw error;
}

function sanitizeResourceRows(resource, rows) {
  return (rows || []).map((row) => {
    const safe = Object.assign({}, row);
    if (resource === "users") delete safe.passwordHash;
    if (resource === "config") delete safe.apiBaseUrl;
    return safe;
  });
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
    .addItem("Inicializar autenticacao", "initializeAuthSecrets")
    .addItem("Criar acessos demonstrativos", "initializeDemoAuthentication")
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

function initializeDemoAuthentication() {
  ensureApiReady();
  if (getConfiguredEnvironment() !== "demo") throw new Error("Contas demonstrativas so podem ser criadas no ambiente demo.");
  initializeAuthSecrets();
  const now = new Date();
  const definitions = [
    { id: "ACC-DEMO-ADMIN", personType: "staff", personId: "USR-ADMIN-001", login: "admin.demo", email: "administracao@exemplo.com", role: "admin" },
    { id: "ACC-DEMO-PROF", personType: "staff", personId: "USR-PROF-006", login: "prof.rafael", email: "rafael.costa@exemplo.com", role: "professor" },
    { id: "ACC-DEMO-STUDENT", personType: "student", personId: "ALU-DEMO-001", login: "000001", email: "aluno001@exemplo.com", role: "student" },
    { id: "ACC-DEMO-BLOCKED", personType: "student", personId: "ALU-DEMO-002", login: "000002", email: "aluno002@exemplo.com", role: "student", lockedUntil: addMinutes(now, 60).toISOString() }
  ];
  const accounts = definitions.map((definition) => {
    const existing = getAccountById(definition.id) || {};
    const account = Object.assign({}, existing, definition, hashPassword("Demo1234"), {
      permissions: [], active: true, mustChangePassword: false, temporaryPasswordExpiresAt: "", failedAttempts: 0,
      lockedUntil: definition.lockedUntil || "", lastLoginAt: existing.lastLoginAt || "", passwordChangedAt: now.toISOString(),
      sessionVersion: Number(existing.sessionVersion || 1), createdAt: existing.createdAt || now.toISOString(), updatedAt: now.toISOString()
    });
    upsertRow("accounts", account);
    linkAccountToPerson(account);
    return sanitizeAccount(account);
  });
  const expiredSession = {
    id: "SES-DEMO-EXPIRED", accountId: "ACC-DEMO-STUDENT", tokenHash: "demonstracao-sem-token-original", deviceId: "CELULAR-ANTIGO",
    deviceName: "Celular antigo", createdAt: addMinutes(now, -180).toISOString(), lastUsedAt: addMinutes(now, -150).toISOString(),
    expiresAt: addMinutes(now, -120).toISOString(), idleExpiresAt: addMinutes(now, -120).toISOString(), revokedAt: "", revokedReason: "", ipReference: "", userAgentReference: "", sessionVersion: 1
  };
  upsertRow("sessions", expiredSession);
  Logger.log("Acessos demonstrativos atualizados com sucesso.");
  return { ok: true, accounts: accounts.map((account) => ({ login: account.login, role: account.role })) };
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

  migrateLegacyStaffPresenceSheet(spreadsheet);

  Object.keys(SHEETS).forEach((resource) => {
    summary.push(ensureSheetStructure(spreadsheet, resource, SHEETS[resource], settings));
  });

  seedConfigSheet(spreadsheet);
  migrateDemoAccountLogins();
  if (settings.cleanup !== false) cleanupUnknownEmptySheets(spreadsheet);
  PropertiesService.getScriptProperties().setProperty(SCHEMA_VERSION_PROPERTY, String(CURRENT_SCHEMA_VERSION));
  if (getConfiguredEnvironment() === "demo" && readSheet("accounts").length === 0) initializeDemoAuthentication();

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sheets: summary
  };
}

function migrateDemoAccountLogins() {
  if (getConfiguredEnvironment() !== "demo") return;
  const expected = { "ACC-DEMO-STUDENT": "000001", "ACC-DEMO-BLOCKED": "000002" };
  readSheet("accounts").forEach((account) => {
    if (expected[account.id] && String(account.login) !== expected[account.id]) {
      upsertRow("accounts", Object.assign({}, account, { login: expected[account.id], updatedAt: new Date().toISOString() }));
    }
  });
}

function migrateLegacyStaffPresenceSheet(spreadsheet) {
  const legacy = spreadsheet.getSheetByName("PontoProfessores");
  const current = spreadsheet.getSheetByName(SHEETS.staffTimeEntries.sheetName);
  if (legacy && !current) legacy.setName(SHEETS.staffTimeEntries.sheetName);
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
    environment: "demo",
    datasetId: "pro-fitness-demo-2026-07",
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
  getSnapshotResourceNames().forEach((resource) => {
    snapshot[resource] = sanitizeResourceRows(resource, readSheet(resource));
  });
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    snapshot: snapshot
  };
}

function importAllData(snapshot) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    getSnapshotResourceNames().forEach((resource) => rewriteSheet(resource, snapshot[resource]));
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
  const missing = getSnapshotResourceNames().filter((resource) => !Array.isArray(snapshot[resource]));
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
  const resources = Object.keys(snapshot);
  const privateResources = resources.filter((resource) => AUTH_RESOURCE_NAMES.includes(resolveResourceName(resource)));
  if (privateResources.length) {
    const error = new Error("Colecoes privadas de autenticacao nao podem ser importadas como snapshot.");
    error.code = "PRIVATE_RESOURCE";
    throw error;
  }
  return normalizeSnapshot(snapshot, resources);
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
    environment: current.environment || "demo",
    datasetId: current.datasetId || "pro-fitness-demo-2026-07",
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
    changedFields: Object.keys(data).filter((key) => !["passwordHash", "passwordSalt", "password", "temporaryPassword", "token", "tokenHash"].includes(key)),
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
