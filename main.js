const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const initSqlJs = require("sql.js");

const DEFAULT_STATE = {
  sections: [],
  trackers: [],
  logs: {},
  expenses: {},
  profile: {
    name: "",
  },
  preferences: {
    appearance: "system",
    timeFormat: "12",
    desktopWidget: true,
    missedWorkReminders: true,
    missedWorkDismissedSignature: "",
  },
};

let SQL;
let db;
let currentSession = null;
let panelWindow;
let fullWindow;

loadEnvFile();

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    revealFullWindow();
  });

  app.whenReady().then(async () => {
    await initDatabase();
    currentSession = loadSession();
    const showPanel = shouldShowPanelWindow();
    createPanelWindow(showPanel);
    createFullWindow(true);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const showPanel = shouldShowPanelWindow();
        createPanelWindow(showPanel);
        createFullWindow(true);
      } else {
        revealFullWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function createPanelWindow(showPanel = shouldShowPanelWindow()) {
  panelWindow = new BrowserWindow({
    width: 380,
    height: 260,
    minWidth: 340,
    minHeight: 190,
    alwaysOnTop: false,
    resizable: true,
    frame: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    roundedCorners: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    ...(process.platform === "darwin" ? { vibrancy: "under-window", visualEffectState: "active" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  panelWindow.loadFile(path.join(__dirname, "panel.html"));
  panelWindow.once("ready-to-show", () => {
    if (showPanel && panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.showInactive();
    }
  });
}

function createFullWindow(showFullWindow = false) {
  fullWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: showFullWindow,
    backgroundColor: "#f4f6f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  fullWindow.loadFile(path.join(__dirname, "index.html"));
}

function revealFullWindow() {
  if (!fullWindow || fullWindow.isDestroyed()) createFullWindow(true);
  if (fullWindow.isMinimized()) fullWindow.restore();
  fullWindow.show();
  fullWindow.focus();
}

ipcMain.handle("window:open-full", () => {
  revealFullWindow();
  return { ok: true };
});

ipcMain.handle("window:hide-full", () => {
  if (fullWindow && !fullWindow.isDestroyed()) fullWindow.hide();
  return { ok: true };
});

ipcMain.handle("window:close-panel", () => {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
  return { ok: true };
});

ipcMain.handle("window:minimize-panel", () => {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.minimize();
  return { ok: true };
});

ipcMain.handle("window:resize-panel", (_event, size) => {
  if (!panelWindow || panelWindow.isDestroyed()) return { ok: false };
  const height = clamp(Number(size?.height) || 260, 190, 520);
  const [width] = panelWindow.getSize();
  panelWindow.setSize(width, height, false);
  return { ok: true };
});

ipcMain.handle("auth:get-session", () => currentSession);

ipcMain.handle("auth:request-otp", async (_event, rawEmail) => {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, message: "Enter a valid email address." };

  const code = createOtpCode();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const id = crypto.randomUUID();

  db.run("UPDATE otps SET consumed = 1 WHERE email = ? AND consumed = 0", [email]);
  db.run(
    "INSERT INTO otps (id, email, code_hash, expires_at, attempts, consumed, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
    [id, email, hashOtp(email, code), expiresAt, Date.now()],
  );
  persistDatabase();

  const sent = await sendOtpEmail(email, code);
  return {
    ok: true,
    message: sent.sent ? "OTP sent to your email." : "Email is not configured. Use the development OTP shown here.",
    devCode: sent.sent ? "" : code,
  };
});

ipcMain.handle("auth:verify-otp", (_event, payload) => {
  const email = normalizeEmail(payload?.email);
  const code = String(payload?.code || "").trim();
  if (!email || !code) return { ok: false, message: "Enter email and OTP." };

  const row = first(
    "SELECT * FROM otps WHERE email = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1",
    [email],
  );

  if (!row) return { ok: false, message: "Request a new OTP first." };
  if (Number(row.expires_at) < Date.now()) return { ok: false, message: "OTP expired. Request a new one." };
  if (Number(row.attempts) >= 5) return { ok: false, message: "Too many attempts. Request a new OTP." };

  const isMatch = row.code_hash === hashOtp(email, code);
  if (!isMatch) {
    db.run("UPDATE otps SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    persistDatabase();
    return { ok: false, message: "Incorrect OTP." };
  }

  db.run("UPDATE otps SET consumed = 1 WHERE id = ?", [row.id]);
  const user = getOrCreateUser(email);
  currentSession = {
    userId: user.id,
    email: user.email,
  };
  saveSession(currentSession);
  persistDatabase();
  applyPanelWindowPreference(getUserState(currentSession.userId).preferences);
  broadcastSessionUpdated();
  return { ok: true, session: currentSession };
});

ipcMain.handle("auth:logout", () => {
  currentSession = null;
  clearSession();
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.showInactive();
  broadcastSessionUpdated();
  return { ok: true };
});

ipcMain.handle("state:get", () => {
  if (!currentSession) return DEFAULT_STATE;
  return getUserState(currentSession.userId);
});

ipcMain.handle("state:save", (_event, nextState) => {
  if (!currentSession) return { ok: false, message: "Sign in first." };
  const cleanState = sanitizeState(nextState);
  saveUserState(currentSession.userId, cleanState);
  applyPanelWindowPreference(cleanState.preferences);
  broadcastStateUpdated();
  return { ok: true };
});

async function initDatabase() {
  SQL = await initSqlJs();
  const dbPath = getDatabasePath();
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS otps (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      user_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  persistDatabase();
}

function getOrCreateUser(email) {
  const existing = first("SELECT * FROM users WHERE email = ?", [email]);
  if (existing) return existing;

  const user = {
    id: crypto.randomUUID(),
    email,
  };
  db.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [user.id, user.email, Date.now()]);
  db.run("INSERT INTO app_state (user_id, state_json, updated_at) VALUES (?, ?, ?)", [
    user.id,
    JSON.stringify(DEFAULT_STATE),
    Date.now(),
  ]);
  return user;
}

function getUserState(userId) {
  const row = first("SELECT state_json FROM app_state WHERE user_id = ?", [userId]);
  if (!row) return DEFAULT_STATE;

  try {
    return sanitizeState(JSON.parse(row.state_json));
  } catch (error) {
    return DEFAULT_STATE;
  }
}

function saveUserState(userId, nextState) {
  const existing = first("SELECT user_id FROM app_state WHERE user_id = ?", [userId]);
  if (existing) {
    db.run("UPDATE app_state SET state_json = ?, updated_at = ? WHERE user_id = ?", [
      JSON.stringify(nextState),
      Date.now(),
      userId,
    ]);
  } else {
    db.run("INSERT INTO app_state (user_id, state_json, updated_at) VALUES (?, ?, ?)", [
      userId,
      JSON.stringify(nextState),
      Date.now(),
    ]);
  }
  persistDatabase();
}

function sanitizeState(value) {
  if (!value || typeof value !== "object") return DEFAULT_STATE;
  return {
    sections: Array.isArray(value.sections) ? value.sections : [],
    trackers: Array.isArray(value.trackers) ? value.trackers : [],
    logs: value.logs && typeof value.logs === "object" ? value.logs : {},
    expenses: value.expenses && typeof value.expenses === "object" ? value.expenses : {},
    profile: sanitizeProfile(value.profile),
    preferences: sanitizePreferences(value.preferences),
  };
}

function sanitizeProfile(value) {
  const name = typeof value?.name === "string" ? value.name.trim().slice(0, 80) : "";
  return { name };
}

function sanitizePreferences(value) {
  const appearance = ["system", "light", "dark"].includes(value?.appearance) ? value.appearance : "system";
  const timeFormat = ["12", "24"].includes(String(value?.timeFormat)) ? String(value.timeFormat) : "12";
  const desktopWidget = typeof value?.desktopWidget === "boolean" ? value.desktopWidget : true;
  const missedWorkReminders = typeof value?.missedWorkReminders === "boolean" ? value.missedWorkReminders : true;
  const missedWorkDismissedSignature = typeof value?.missedWorkDismissedSignature === "string" ? value.missedWorkDismissedSignature.slice(0, 2000) : "";
  return { appearance, timeFormat, desktopWidget, missedWorkReminders, missedWorkDismissedSignature };
}

function shouldShowPanelWindow() {
  if (!currentSession) return true;
  return getUserState(currentSession.userId).preferences.desktopWidget !== false;
}

function applyPanelWindowPreference(preferences = DEFAULT_STATE.preferences) {
  if (!panelWindow || panelWindow.isDestroyed()) {
    createPanelWindow(preferences.desktopWidget !== false);
    return;
  }
  panelWindow.setAlwaysOnTop(false);
  if (preferences.desktopWidget === false) {
    panelWindow.hide();
    return;
  }
  if (!panelWindow.isVisible()) panelWindow.showInactive();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function first(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

function persistDatabase() {
  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function getDatabasePath() {
  return path.join(app.getPath("userData"), "dailytrack.sqlite");
}

function getSessionPath() {
  return path.join(app.getPath("userData"), "session.json");
}

function loadSession() {
  const sessionPath = getSessionPath();
  if (!fs.existsSync(sessionPath)) return null;
  try {
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    if (!session?.userId || !session?.email) return null;
    return session;
  } catch (error) {
    return null;
  }
}

function saveSession(session) {
  fs.mkdirSync(path.dirname(getSessionPath()), { recursive: true });
  fs.writeFileSync(getSessionPath(), JSON.stringify(session, null, 2));
}

function clearSession() {
  const sessionPath = getSessionPath();
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
}

function broadcastStateUpdated() {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("state:updated"));
}

function broadcastSessionUpdated() {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("session:updated"));
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function createOtpCode() {
  return String(crypto.randomInt(100000, 999999));
}

function hashOtp(email, code) {
  return crypto.createHash("sha256").update(`${email}:${code}:${getOtpSalt()}`).digest("hex");
}

function getOtpSalt() {
  return process.env.OTP_SALT || "dailytrack-local-otp-salt";
}

async function sendOtpEmail(email, code) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { sent: false };

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"${process.env.OTP_FROM || "DailyTrack"}" <${user}>`,
    to: email,
    subject: "Your DailyTrack OTP",
    text: `Your DailyTrack OTP is ${code}. It expires in 10 minutes.`,
  });

  return { sent: true };
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  });
}
