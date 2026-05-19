const http = require("http");
const fs = require("fs");
const path = require("path");
const tls = require("tls");
const { URL } = require("url");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const cookie = require("cookie");

// ===== SESSION MANAGEMENT =====
const SESSION_COOKIE_NAME = "lg_session";
const SESSION_DURATION_DAYS = 7;
const activeSessions = new Map(); // sessionId -> { username, role, createdAt, lastAccess }

function createSession(username, role) {
  const sessionId = generateSessionId();
  activeSessions.set(sessionId, { username, role, createdAt: Date.now(), lastAccess: Date.now() });
  return sessionId;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  // Check expiry (7 days)
  if (Date.now() - session.lastAccess > SESSION_DURATION_DAYS * 86400000) {
    activeSessions.delete(sessionId);
    return null;
  }
  session.lastAccess = Date.now();
  return session;
}

function destroySession(sessionId) {
  if (sessionId) activeSessions.delete(sessionId);
}

function generateSessionId() {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Buffer.from(bytes).toString("base64url");
}

function parseSessionCookie(request) {
  const cookieHeader = request.headers.cookie || "";
  const parsed = cookie.parse(cookieHeader);
  return parsed[SESSION_COOKIE_NAME] || null;
}

function serializeSessionCookie(sessionId) {
  return cookie.serialize(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 86400
  });
}

function setAuthCookie(response, sessionId) {
  response.setHeader("Set-Cookie", serializeSessionCookie(sessionId));
}

function clearAuthCookie(response) {
  response.setHeader("Set-Cookie", cookie.serialize(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  }));
}

function requireAuth(request, response, store) {
  const sessionId = parseSessionCookie(request);
  const session = getSession(sessionId);
  if (!session) {
    sendJson(response, 401, { error: "Not authenticated" });
    return null;
  }
  return session;
}

const PORT = Number(process.env.PORT || 3000);
const LOCAL_DEFAULT_DATA_PATH = path.join(__dirname, "data", "store.json");

function resolveDataPath() {
  if (process.env.LEAD_DATA_PATH) {
    return path.resolve(process.env.LEAD_DATA_PATH);
  }

  if (process.env.LEAD_DATA_DIR) {
    return path.join(path.resolve(process.env.LEAD_DATA_DIR), "store.json");
  }

  // Railway persistent volumes (if configured)
  const persistentCandidates = [process.env.RAILWAY_VOLUME_MOUNT_PATH, process.env.RAILWAY_PERSISTENT_DIR, "/data"];
  for (const candidate of persistentCandidates) {
    if (!candidate) {
      continue;
    }

    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return path.join(resolved, "store.json");
    }
  }

  // Railway fallback: use /tmp which is always writable
  if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_NAME) {
    const tmpDir = path.join("/tmp", "leadgen");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return path.join(tmpDir, "store.json");
  }

  return LOCAL_DEFAULT_DATA_PATH;
}

const DATA_PATH = resolveDataPath();
const PUBLIC_DIR = path.join(__dirname, "public");
const EXPORT_DIR = path.join(__dirname, "exports");
const BIGIN_DEFAULT_STAGE = process.env.BIGIN_DEFAULT_STAGE || "Qualification";
const BIGIN_DEFAULT_PIPELINE_NAME = process.env.BIGIN_PIPELINE_NAME || "";
const BIGIN_DEFAULT_SUB_PIPELINE = process.env.BIGIN_SUB_PIPELINE_NAME || "";
const BIGIN_SCOPES =
  process.env.BIGIN_SCOPES || "ZohoBigin.modules.ALL,ZohoBigin.settings.layouts.READ,ZohoBigin.settings.fields.READ";

const priorityAreas = [
  "kuala lumpur",
  "petaling jaya",
  "subang jaya",
  "shah alam",
  "puchong",
  "klang",
  "cheras",
  "ampang",
  "kajang",
  "selangor"
];

const products = {
  "autocount-accounting": {
    name: "AutoCount Accounting",
    pitch: "Improve accounting control, reporting speed, and day-to-day finance visibility."
  },
  "presoft-mobile-stock": {
    name: "Presoft Mobile Stock",
    pitch: "Give sales teams live stock visibility and reduce order mistakes on the road."
  },
  "cubehous-wms": {
    name: "Cubehous WMS",
    pitch: "Tighten warehouse control, trace stock movement, and improve picking accuracy."
  },
  "autocount-pos": {
    name: "AutoCount POS",
    pitch: "Upgrade in-store sales handling, stock sync, and branch reporting."
  },
  "autocount-payroll": {
    name: "AutoCount Payroll",
    pitch: "Simplify payroll processing, staff records, and monthly compliance work."
  }
};

const EARTH_RADIUS_KM = 6371;

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function defaultStore() {
  return {
    leads: [],
    activities: [],
    users: [],
    products: [],
    emailTemplates: [],
    defaultTemplateId: ""
  };
}

async function ensureDefaultUsers(store) {
  if (!Array.isArray(store.users)) {
    store.users = [];
  }

  // Check if admin exists
  const hasAdmin = store.users.some(u => u.username === "admin");
  const hasUser = store.users.some(u => u.username === "user");

  if (!hasAdmin) {
    store.users.push({
      username: "admin",
      passwordHash: await hashPassword("admin123"),
      role: "admin",
      displayName: "Admin",
      bigin: {}
    });
  }

  if (!hasUser) {
    store.users.push({
      username: "user",
      passwordHash: await hashPassword("user123"),
      role: "user",
      displayName: "Staff User",
      bigin: {}
    });
  }
}

function seedDefaultProducts(store) {
  if (!Array.isArray(store.products)) {
    store.products = [];
  }
  if (store.products.length > 0) return; // Already seeded

  const defaults = [
    { key: "autocount-accounting", name: "AutoCount Accounting", pitch: "Improve accounting control, reporting speed, and day-to-day finance visibility.", icon: "accounting", color: "blue" },
    { key: "autocount-pos", name: "AutoCount POS", pitch: "Upgrade in-store sales handling, stock sync, and branch reporting.", icon: "pos", color: "green" },
    { key: "presoft-mobile-stock", name: "Presoft Mobile Stock", pitch: "Give sales teams live stock visibility and reduce order mistakes on the road.", icon: "stock", color: "amber" },
    { key: "cubehous-wms", name: "Cubehous WMS", pitch: "Tighten warehouse control, trace stock movement, and improve picking accuracy.", icon: "wms", color: "purple" },
    { key: "autocount-payroll", name: "AutoCount Payroll", pitch: "Simplify payroll processing, staff records, and monthly compliance work.", icon: "payroll", color: "pink" }
  ];

  store.products = defaults.map((d, i) => ({
    id: `prod_default_${i}`,
    key: d.key,
    name: d.name,
    pitch: d.pitch,
    icon: d.icon,
    color: d.color,
    active: true,
    createdAt: new Date().toISOString()
  }));

  writeStore(store);
}

function seedDefaultEmailTemplates(store) {
  if (!Array.isArray(store.emailTemplates)) {
    store.emailTemplates = [];
  }
  if (store.emailTemplates.length > 0) return;

  store.emailTemplates = [
    {
      id: "tmpl_default_1",
      name: "General Outreach",
      subject: "{{productName}} idea for {{company}}",
      body: "Hi {{contactName}},\n\nI came across {{company}} while reviewing businesses from {{source}} in {{region}}.\n\nBased on your setup in {{industry}}, I believe {{productName}} could be a strong fit.\n\n{{pitch}}\n\nThe main opportunity I see is around the areas you're currently working to improve.\n\n{{productBlocks}}\n\nBest,\n{{senderName}}\n{{senderEmail}}"
    },
    {
      id: "tmpl_default_2",
      name: "Follow-up",
      subject: "Following up — {{productName}} for {{company}}",
      body: "Hi {{contactName}},\n\nI wanted to follow up on my previous message about {{productName}} for {{company}}.\n\nI understand you're busy, but I truly believe this could help with:\n\n{{pitch}}\n\n{{productBlocks}}\n\nWould you be open to a quick 10-minute call this week?\n\nBest regards,\n{{senderName}}"
    },
    {
      id: "tmpl_default_3",
      name: "Partnership Inquiry",
      subject: "Partnership opportunity — {{company}} x {{productName}}",
      body: "Dear {{contactName}},\n\nI'm reaching out from LeadGen AI. We've identified {{company}} as a potential partner for our {{productName}} solution.\n\n{{pitch}}\n\n{{productBlocks}}\n\nWe'd love to explore how we can work together to benefit businesses in {{region}}.\n\nLooking forward to your response.\n\nSincerely,\n{{senderName}}\n{{senderEmail}}"
    }
  ];
  store.defaultTemplateId = "tmpl_default_1";
  writeStore(store);
}

// Migrate old global bigin to admin user
function migrateGlobalBigin(store) {
  if (store.integrations && store.integrations.bigin) {
    if (!Array.isArray(store.users)) store.users = [];
    let adminUser = store.users.find(u => u.username === "admin");
    if (!adminUser) {
      adminUser = { username: "admin", bigin: {} };
      store.users.push(adminUser);
    }
    adminUser.bigin = { ...store.integrations.bigin };
    delete store.integrations.bigin;
    if (Object.keys(store.integrations).length === 0) {
      delete store.integrations;
    }
  }
}

function ensureDataFile() {
  const dataDir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(DATA_PATH)) {
    return;
  }

  if (DATA_PATH !== LOCAL_DEFAULT_DATA_PATH && fs.existsSync(LOCAL_DEFAULT_DATA_PATH)) {
    fs.copyFileSync(LOCAL_DEFAULT_DATA_PATH, DATA_PATH);
    return;
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(defaultStore(), null, 2));
}

async function readStore() {
  ensureDataFile();
  let store = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  store = ensureStoreShape(store);

  // Migrate old global bigin on first read
  if (store.integrations && store.integrations.bigin) {
    migrateGlobalBigin(store);
    writeStore(store);
  }

  // Ensure default users exist (first run)
  if (!store.users || store.users.length === 0) {
    await ensureDefaultUsers(store);
    writeStore(store);
  }

  // Seed default products if none exist
  seedDefaultProducts(store);

  // Seed default email templates if none exist
  seedDefaultEmailTemplates(store);

  return store;
}

function writeStore(store) {
  ensureDataFile();
  fs.writeFileSync(DATA_PATH, JSON.stringify(ensureStoreShape(store), null, 2));
}

function ensureStoreShape(store) {
  if (!store || typeof store !== "object") {
    return { leads: [], activities: [], users: [], products: [] };
  }

  if (!Array.isArray(store.leads)) {
    store.leads = [];
  }

  if (!Array.isArray(store.activities)) {
    store.activities = [];
  }

  if (!Array.isArray(store.users)) {
    store.users = [];
  }

  if (!Array.isArray(store.products)) {
    store.products = [];
  }

  if (!Array.isArray(store.emailTemplates)) {
    store.emailTemplates = [];
  }

  if (!store.defaultTemplateId) {
    store.defaultTemplateId = "";
  }

  // Ensure each user has a bigin object
  store.users.forEach(user => {
    if (!user.bigin || typeof user.bigin !== "object") {
      user.bigin = {};
    }
  });

  // Clean up old integrations structure
  if (store.integrations && store.integrations.bigin) {
    delete store.integrations.bigin;
    if (Object.keys(store.integrations).length === 0) {
      delete store.integrations;
    }
  }

  store.leads = store.leads.map((lead) => ({
    ...lead,
    emailStatus: lead.emailStatus || (lead.sent ? "sent" : "not_sent"),
    emailLastError: lead.emailLastError || "",
    emailLastAttemptAt: lead.emailLastAttemptAt || lead.sentAt || null
  }));

  return store;
}

function createSmtpClient(socket) {
  let buffer = "";
  let pending = null;

  function consumeLines() {
    if (!pending) {
      return;
    }

    const lines = buffer.split("\r\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line) {
        continue;
      }
      pending.lines.push(line);
      if (/^\d{3} /.test(line)) {
        const resolver = pending.resolve;
        const response = pending.lines.join("\n");
        pending = null;
        resolver(response);
      }
    }
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    consumeLines();
  });

  function readResponse() {
    return new Promise((resolve) => {
      pending = { resolve, lines: [] };
      consumeLines();
    });
  }

  async function expectCode(expectedCode) {
    const response = await readResponse();
    if (!response.startsWith(String(expectedCode))) {
      throw new Error(`SMTP error: ${response}`);
    }
    return response;
  }

  async function sendCommand(command, expectedCode) {
    socket.write(`${command}\r\n`);
    return expectCode(expectedCode);
  }

  return { expectCode, sendCommand };
}

function smtpSafeLine(line) {
  return line.startsWith(".") ? `.${line}` : line;
}

function formatMailbox(name, email) {
  if (!name) {
    return email;
  }

  const safeName = String(name).replace(/"/g, "");
  return `"${safeName}" <${email}>`;
}

async function sendEmailMessage({ to, fromName, fromEmail, subject, body }) {
  const provider = String(process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
  const recipient = String(to || "").trim();
  const messageSubject = String(subject || "");
  const messageBody = String(body || "");

  if (provider === "brevo") {
    const apiKey = process.env.BREVO_API_KEY || "";
    const brevoFromEmail = String(process.env.BREVO_FROM_EMAIL || fromEmail || "").trim();
    const brevoFromName = String(fromName || process.env.BREVO_FROM_NAME || "LeadGen AI").replace(/"/g, "");
    const replyTo = String(fromEmail || "").trim();

    if (!apiKey) {
      throw new Error("Brevo is not configured. Set BREVO_API_KEY on the server.");
    }

    if (!brevoFromEmail) {
      throw new Error("Brevo is not configured. Set BREVO_FROM_EMAIL on the server.");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender: {
          name: brevoFromName,
          email: brevoFromEmail
        },
        to: [{ email: recipient }],
        subject: messageSubject,
        textContent: messageBody,
        ...(replyTo ? { replyTo: { email: replyTo, name: brevoFromName } } : {})
      })
    });

    const rawPayload = await response.text();
    let payload = {};
    try {
      payload = rawPayload ? JSON.parse(rawPayload) : {};
    } catch (parseError) {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(`Brevo send failed: ${payload.message || rawPayload || `HTTP ${response.status}`}`);
    }

    const messageId = payload.messageId || payload.messageIds?.[0] || "";
    return { messageId: messageId ? String(messageId) : "" };
  }

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY || "";
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || "";
    const resendFromName = String(fromName || process.env.RESEND_FROM_NAME || "LeadGen AI").replace(/"/g, "");
    const replyTo = String(fromEmail || "").trim();

    if (!apiKey) {
      throw new Error("Resend is not configured. Set RESEND_API_KEY on the server.");
    }

    if (!resendFromEmail) {
      throw new Error("Resend is not configured. Set RESEND_FROM_EMAIL on the server.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `"${resendFromName}" <${resendFromEmail}>`,
        to: [recipient],
        subject: messageSubject,
        text: messageBody,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });

    const rawPayload = await response.text();
    let payload = {};
    try {
      payload = rawPayload ? JSON.parse(rawPayload) : {};
    } catch (parseError) {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(`Resend send failed: ${payload.message || rawPayload || `HTTP ${response.status}`}`);
    }

    return { messageId: payload.id ? String(payload.id) : "" };
  }

  const user = process.env.GMAIL_SMTP_EMAIL || "";
  const pass = process.env.GMAIL_APP_PASSWORD || "";

  if (!user || !pass) {
    throw new Error("Gmail SMTP is not configured. Set GMAIL_SMTP_EMAIL and GMAIL_APP_PASSWORD on the server.");
  }

  const smtpHost = process.env.GMAIL_SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.GMAIL_SMTP_PORT || 587);
  const timeoutMs = Number(process.env.GMAIL_SMTP_TIMEOUT_MS || 20000);
  const socketTimeoutMs = Number(process.env.GMAIL_SMTP_SOCKET_TIMEOUT_MS || 20000);

  const secure =
    typeof process.env.GMAIL_SMTP_SECURE === "string"
      ? process.env.GMAIL_SMTP_SECURE.trim().toLowerCase() === "true"
      : smtpPort === 465;

  const replyTo = fromEmail && fromEmail !== user ? fromEmail : "";

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    auth: { user, pass },
    requireTLS: !secure,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: socketTimeoutMs,
    tls: {
      servername: smtpHost
    }
  });

  try {
    const result = await transporter.sendMail({
      from: formatMailbox(fromName, user),
      to: recipient,
      ...(replyTo ? { replyTo } : {}),
      subject: messageSubject,
      text: messageBody
    });

    return { messageId: result && result.messageId ? String(result.messageId) : "" };
  } catch (error) {
    const hostLabel = `${smtpHost}:${smtpPort}`;
    const hint = smtpPort === 465
      ? "Hint: many cloud hosts block outbound port 465; try GMAIL_SMTP_PORT=587 and GMAIL_SMTP_SECURE=false."
      : smtpPort === 587
        ? "Hint: use STARTTLS on 587 (GMAIL_SMTP_SECURE=false)."
        : "";
    const message = error && error.message ? error.message : String(error || "Unknown SMTP error");
    throw new Error(`SMTP send failed via ${hostLabel}: ${message}${hint ? ` ${hint}` : ""}`);
  }
}

function normalizeLeadIdentityPart(value) {
  return String(value || "").trim().toLowerCase();
}

function makeLeadIdentity(lead) {
  return [
    normalizeLeadIdentityPart(lead.company),
    normalizeLeadIdentityPart(lead.phone),
    normalizeLeadIdentityPart(lead.region)
  ].join("::");
}

function isPriorityArea(region) {
  return priorityAreas.includes(String(region || "").trim().toLowerCase());
}

function humanizePainPoint(painPoint) {
  const dictionary = {
    "manual-accounting": "manual accounting and delayed reporting",
    "stock-visibility": "poor stock visibility for sales and ordering",
    "warehouse-control": "warehouse control and picking errors",
    "checkout-pos": "slow retail checkout and branch reporting gaps",
    "payroll-compliance": "payroll admin and compliance pressure"
  };

  return dictionary[painPoint] || painPoint;
}

function companyTypeLabel(companyType) {
  const labels = {
    retail: "Retail",
    fnb: "F&B",
    wholesale: "Wholesale",
    warehouse: "Warehouse",
    service: "Service",
    manufacturing: "Manufacturing"
  };

  return labels[companyType] || companyType;
}

function extractWebsiteFromNotes(notes) {
  const match = String(notes || "").match(/Website:\s*(https?:\/\/\S+)/i);
  return match ? match[1].trim() : "";
}

function removeWebsiteFromNotes(notes) {
  return String(notes || "")
    .replace(/\s*Website:\s*https?:\/\/\S+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeLeadWebsite(lead) {
  return String(lead.website || "").trim() || extractWebsiteFromNotes(lead.notes);
}

const PRODUCT_REASONS = {
  "autocount-accounting": "Finance control and reporting are a strong fit for this lead profile.",
  "autocount-pos": "Retail counters, outlet reporting, and stock sync are the main leverage points.",
  "presoft-mobile-stock": "Sales teams often need live stock visibility while closing orders.",
  "cubehous-wms-system": "Warehouse movement, picking, and stock control look like the core challenge.",
  "autocount-cloud-payroll": "Payroll admin and compliance pressure tends to grow with team size."
};

const BASE_PRODUCT_WEIGHTS = {
  "autocount-accounting": 26,
  "autocount-pos": 22,
  "presoft-mobile-stock": 18,
  "cubehous-wms-system": 18,
  "autocount-cloud-payroll": 16
};

function hashToUnitInterval(seed) {
  const str = String(seed || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

function weightedRandomProductKey(weights, seed) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (!entries.length || total <= 0) {
    return "autocount-accounting";
  }

  let r = hashToUnitInterval(seed) * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) {
      return key;
    }
  }

  return entries[entries.length - 1][0];
}

function mergeWeights(base, boosts) {
  const merged = { ...base };
  Object.entries(boosts).forEach(([key, delta]) => {
    if (merged[key] !== undefined) {
      merged[key] = Math.max(0, merged[key] + delta);
    }
  });
  return merged;
}

function recommendProduct(lead) {
  const painPoint = String(lead.painPoint || "").trim();
  const companyType = String(lead.companyType || "").trim().toLowerCase();
  const industry = String(lead.industry || "").toLowerCase();

  if (painPoint === "warehouse-control" || companyType === "warehouse") {
    return {
      productKey: "cubehous-wms-system",
      reason: PRODUCT_REASONS["cubehous-wms-system"]
    };
  }

  if (painPoint === "checkout-pos" || companyType === "retail" || companyType === "fnb") {
    return {
      productKey: "autocount-pos",
      reason: PRODUCT_REASONS["autocount-pos"]
    };
  }

  if (painPoint === "stock-visibility" || companyType === "wholesale") {
    return {
      productKey: "presoft-mobile-stock",
      reason: PRODUCT_REASONS["presoft-mobile-stock"]
    };
  }

  if (painPoint === "payroll-compliance") {
    return {
      productKey: "autocount-cloud-payroll",
      reason: PRODUCT_REASONS["autocount-cloud-payroll"]
    };
  }

  if (painPoint === "manual-accounting") {
    return {
      productKey: "autocount-accounting",
      reason: PRODUCT_REASONS["autocount-accounting"]
    };
  }

  const seedBase = [lead.id, lead.company, lead.phone, lead.region, lead.externalRef].filter(Boolean).join("::") || String(Math.random());

  const boosts = {};
  if (/warehouse|fulfillment|logistics|storage|pick\b|picking/i.test(industry)) {
    boosts["cubehous-wms-system"] = 28;
    boosts["presoft-mobile-stock"] = 6;
  }
  if (/retail|restaurant|f&b|cafe|boutique|salon|store\b|outlet/i.test(industry)) {
    boosts["autocount-pos"] = 26;
  }
  if (/wholesale|distributor|dealer|trading\b/i.test(industry)) {
    boosts["presoft-mobile-stock"] = 26;
    boosts["autocount-accounting"] = 8;
  }
  if (/manufacturing|factory|production/i.test(industry)) {
    boosts["autocount-accounting"] = 14;
    boosts["cubehous-wms-system"] = 10;
  }
  if (/clinic|hospital|hr\b|payroll|staffing/i.test(industry)) {
    boosts["autocount-cloud-payroll"] = 22;
  }

  const weights = mergeWeights(BASE_PRODUCT_WEIGHTS, boosts);
  const productKey = weightedRandomProductKey(weights, `${seedBase}|weighted-v1`);

  return {
    productKey,
    reason: PRODUCT_REASONS[productKey] || PRODUCT_REASONS["autocount-accounting"]
  };
}

function resolveProductInfo(store, productKey) {
  // Try store.products first (Product Manager)
  if (Array.isArray(store.products)) {
    const pm = store.products.find(p => p.key === productKey && p.active !== false);
    if (pm) return { name: pm.name, pitch: pm.pitch };
  }
  // Fallback to hardcoded products
  return products[productKey] || { name: productKey, pitch: "" };
}

function enrichLead(store, lead) {
  const recommendation = recommendProduct(lead);
  const info = resolveProductInfo(store, recommendation.productKey);
  const website = normalizeLeadWebsite(lead);
  return {
    ...lead,
    website,
    notes: removeWebsiteFromNotes(lead.notes),
    priorityArea: isPriorityArea(lead.region),
    companyTypeLabel: companyTypeLabel(lead.companyType),
    painPointLabel: humanizePainPoint(lead.painPoint),
    recommendation: {
      ...recommendation,
      productName: info.name,
      pitch: info.pitch
    }
  };
}

function sortLeads(store, leads) {
  return leads
    .map((lead) => enrichLead(store, lead))
    .sort((left, right) => {
      if (left.priorityArea !== right.priorityArea) {
        return left.priorityArea ? -1 : 1;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

function describeError(error, fallback = "Unknown error") {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error.code === "string" && error.code.trim()) {
    return error.code.trim();
  }

  if (typeof error.name === "string" && error.name.trim()) {
    return error.name.trim();
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch (serializationError) {
    // Fall through to the final fallback.
  }

  return fallback;
}

function buildEmailDebugContext({ lead, senderName, senderEmail, subject }) {
  return {
    event: "email_send_failed",
    leadId: lead.id,
    company: lead.company,
    recipient: String(lead.email || "").trim(),
    senderName,
    senderEmail,
    smtpUser: process.env.GMAIL_SMTP_EMAIL || "",
    subject,
    timestamp: new Date().toISOString()
  };
}

function logEmailSendFailure(logger, context, error) {
  const logEntry = {
    ...context,
    errorMessage: describeError(error, "Unknown email error"),
    errorStack: error && error.stack ? error.stack : ""
  };

  if (typeof logger === "function") {
    logger(logEntry);
    return;
  }

  console.error("EMAIL_SEND_DEBUG", logEntry);
}

function buildSummary(store, leads) {
  const enriched = sortLeads(store, leads);
  return {
    totalLeads: enriched.length,
    qualifiedLeads: enriched.filter((lead) => lead.status === "qualified").length,
    priorityLeads: enriched.filter((lead) => lead.priorityArea).length,
    sentLeads: enriched.filter((lead) => lead.sent).length,
    crmLogged: enriched.filter((lead) => lead.crmLogged).length
  };
}

async function readJsonResponse(response) {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json();
}

function readTextResponse(response) {
  return response.text();
}

function getBaseUrl(request) {
  const host = request.headers.host || `localhost:${PORT}`;
  const protocol =
    request.headers["x-forwarded-proto"] ||
    (String(host).includes("localhost") || String(host).startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

function getBiginAccountsServer() {
  return process.env.BIGIN_ACCOUNTS_SERVER || "https://accounts.zoho.com";
}

function getBiginRedirectUri(request) {
  return process.env.BIGIN_REDIRECT_URI || `${getBaseUrl(request)}/oauth/callback`;
}

function getBiginClientId() {
  return process.env.BIGIN_CLIENT_ID || "";
}

function getBiginClientSecret() {
  return process.env.BIGIN_CLIENT_SECRET || "";
}

// ===== PER-USER BIGIN =====
function getUserBigin(store, username) {
  const user = store.users.find(u => u.username === username);
  if (!user) throw new Error("User not found");
  if (!user.bigin || typeof user.bigin !== "object") {
    user.bigin = {};
  }
  return user.bigin;
}

function getUserBiginApiDomain(store, username) {
  return process.env.BIGIN_API_DOMAIN || getUserBigin(store, username).apiDomain || "https://www.zohoapis.com";
}

function getUserBiginRefreshToken(store, username) {
  return process.env.BIGIN_REFRESH_TOKEN || getUserBigin(store, username).refreshToken || "";
}

function ensureBiginClientConfig() {
  if (!getBiginClientId() || !getBiginClientSecret()) {
    throw new Error("Bigin OAuth is not configured. Set BIGIN_CLIENT_ID and BIGIN_CLIENT_SECRET on the server.");
  }
}

function buildBiginConnectUrl(request, username) {
  ensureBiginClientConfig();
  const authUrl = new URL("/oauth/v2/auth", getBiginAccountsServer());
  authUrl.searchParams.set("client_id", getBiginClientId());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "login");
  authUrl.searchParams.set("scope", BIGIN_SCOPES);
  authUrl.searchParams.set("redirect_uri", getBiginRedirectUri(request));
  authUrl.searchParams.set("state", "bigin-connect:" + (username || ""));
  return authUrl.toString();
}

async function readJsonErrorAware(response) {
  const raw = await readTextResponse(response);
  let payload = null;

  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      (payload && (payload.error_description || payload.error || payload.message)) || raw || `HTTP ${response.status}`
    );
  }

  return payload || {};
}

async function exchangeBiginAuthorizationCode(request, store, username, code, fetchImpl = fetch) {
  ensureBiginClientConfig();

  const tokenResponse = await fetchImpl(`${getBiginAccountsServer()}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getBiginClientId(),
      client_secret: getBiginClientSecret(),
      redirect_uri: getBiginRedirectUri(request),
      code
    })
  });

  const payload = await readJsonErrorAware(tokenResponse);
  const connection = getUserBigin(store, username);
  connection.refreshToken = payload.refresh_token || connection.refreshToken || "";
  connection.apiDomain = payload.api_domain || connection.apiDomain || "https://www.zohoapis.com";
  connection.connectedAt = new Date().toISOString();
  connection.accountsServer = getBiginAccountsServer();
  writeStore(store);
  return connection;
}

async function getUserBiginAccessToken(store, username, fetchImpl = fetch) {
  ensureBiginClientConfig();
  const refreshToken = getUserBiginRefreshToken(store, username);

  if (!refreshToken) {
    throw new Error("Bigin is not connected yet. Open /api/integrations/bigin/connect once to authorize it first.");
  }

  const tokenResponse = await fetchImpl(`${getBiginAccountsServer()}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getBiginClientId(),
      client_secret: getBiginClientSecret(),
      refresh_token: refreshToken
    })
  });

  const payload = await readJsonErrorAware(tokenResponse);
  const connection = getUserBigin(store, username);
  connection.apiDomain = payload.api_domain || connection.apiDomain || "https://www.zohoapis.com";
  connection.lastTokenAt = new Date().toISOString();
  writeStore(store);
  return {
    accessToken: payload.access_token,
    apiDomain: getUserBiginApiDomain(store, username)
  };
}

async function createBiginRecord(store, username, moduleApiName, data, fetchImpl = fetch) {
  const { accessToken, apiDomain } = await getUserBiginAccessToken(store, username, fetchImpl);
  const endpoint = `${apiDomain}/bigin/v2/${moduleApiName}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Zoho-oauthtoken ${accessToken}`
    },
    body: JSON.stringify({
      data: [data],
      trigger: []
    })
  });

  const payload = await readJsonErrorAware(response);
  const item = Array.isArray(payload.data) ? payload.data[0] : null;

  if (!item || item.status !== "success") {
    throw new Error(
      (item && (item.message || item.code)) || payload.message || "Bigin rejected the record creation request."
    );
  }

  return item.details || {};
}

async function getUserBiginJson(store, username, path, fetchImpl = fetch) {
  const { accessToken, apiDomain } = await getUserBiginAccessToken(store, username, fetchImpl);
  const normalizedPath = String(path || "").startsWith("/") ? path : `/${path}`;
  const endpoint = `${apiDomain}${normalizedPath}`;
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`
    }
  });

  return readJsonErrorAware(response);
}

async function getUserBiginPipelineMetadata(store, username, fetchImpl = fetch) {
  const [layoutsPayload, fieldsPayload] = await Promise.all([
    getUserBiginJson(store, username, "/bigin/v2/settings/layouts?module=Pipelines", fetchImpl),
    getUserBiginJson(store, username, "/bigin/v2/settings/fields?module=Pipelines", fetchImpl)
  ]);

  const layouts = Array.isArray(layoutsPayload.layouts) ? layoutsPayload.layouts : [];
  const fields = Array.isArray(fieldsPayload.fields) ? fieldsPayload.fields : [];
  const pipelineField = fields.find((field) => field.api_name === "Pipeline") || null;
  const subPipelineField = fields.find((field) => field.api_name === "Sub_Pipeline") || null;
  const stageField = fields.find((field) => field.api_name === "Stage") || null;

  return { layouts, pipelineField, subPipelineField, stageField };
}

function choosePipelineLayout(layouts) {
  const preferredName = BIGIN_DEFAULT_PIPELINE_NAME.trim().toLowerCase();
  if (preferredName) {
    const exactMatch = layouts.find((layout) => String(layout.display_label || layout.name || "").trim().toLowerCase() === preferredName);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return (
    layouts.find((layout) => layout.status === "active" && layout.visible !== false) ||
    layouts.find((layout) => layout.visible !== false) ||
    layouts[0] ||
    null
  );
}

function chooseSubPipelineValue(subPipelineField) {
  const values = Array.isArray(subPipelineField && subPipelineField.pick_list_values)
    ? subPipelineField.pick_list_values
    : [];
  const preferredName = BIGIN_DEFAULT_SUB_PIPELINE.trim().toLowerCase();
  if (preferredName) {
    const exactMatch = values.find((value) => String(value.actual_value || value.display_value || "").trim().toLowerCase() === preferredName);
    if (exactMatch) {
      return exactMatch.actual_value || exactMatch.display_value;
    }
  }

  const defaultMatch = values.find((value) =>
    /sales pipeline standard/i.test(String(value.actual_value || value.display_value || ""))
  );
  if (defaultMatch) {
    return defaultMatch.actual_value || defaultMatch.display_value;
  }

  const fallback = values[0];
  return fallback ? fallback.actual_value || fallback.display_value : "";
}

function chooseStageValue(stageField) {
  const values = Array.isArray(stageField && stageField.pick_list_values) ? stageField.pick_list_values : [];
  const preferredStage = BIGIN_DEFAULT_STAGE.trim().toLowerCase();

  const exactMatch = values.find((value) => String(value.actual_value || value.display_value || "").trim().toLowerCase() === preferredStage);
  if (exactMatch) {
    return exactMatch.actual_value || exactMatch.display_value;
  }

  const fallback = values[0];
  return fallback ? fallback.actual_value || fallback.display_value : BIGIN_DEFAULT_STAGE;
}

async function resolveBiginPipelineDefaults(store, username, fetchImpl = fetch) {
  const metadata = await getUserBiginPipelineMetadata(store, username, fetchImpl);
  const pipelineLayout = choosePipelineLayout(metadata.layouts);
  const subPipeline = chooseSubPipelineValue(metadata.subPipelineField);
  const stage = chooseStageValue(metadata.stageField);

  if (!pipelineLayout) {
    throw new Error("No visible Bigin pipeline layout was found for deal creation.");
  }

  if (!subPipeline) {
    throw new Error("No Bigin Sub_Pipeline value was found for deal creation.");
  }

  if (!stage) {
    throw new Error("No Bigin Stage value was found for deal creation.");
  }

  return {
    pipelineId: pipelineLayout.id,
    pipelineName: pipelineLayout.display_label || pipelineLayout.name || "",
    subPipeline,
    stage
  };
}

function buildBiginDebugError(step, endpoint, payload, error) {
  const errorMessage = error && error.message ? error.message : String(error || "Unknown Bigin error");
  return new Error(
    `Bigin ${step} failed. endpoint=${endpoint} payload=${JSON.stringify(payload)} error=${errorMessage}`
  );
}

function splitContactName(fullName) {
  const normalized = String(fullName || "").trim();
  if (!normalized || /^business contact$/i.test(normalized)) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: "", lastName: parts[0] };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]
  };
}

function buildBusinessNatureDetails(lead) {
  return [
    lead.industry ? `Business nature (industry): ${lead.industry}` : "",
    lead.companyType ? `Business nature (type): ${companyTypeLabel(lead.companyType)}` : ""
  ].filter(Boolean);
}

function buildBiginCompanyPayload(lead) {
  const website = normalizeLeadWebsite(lead);
  return {
    Account_Name: lead.company || "Unnamed Company",
    Phone: lead.phone || undefined,
    Website: website || undefined,
    Industry: lead.industry || undefined,
    Description: [
      lead.source ? `Source: ${lead.source}` : "",
      lead.region ? `Region: ${lead.region}` : "",
      ...buildBusinessNatureDetails(lead),
      removeWebsiteFromNotes(lead.notes)
    ]
      .filter(Boolean)
      .join("\n"),
    Billing_City: lead.region || undefined
  };
}

function buildBiginContactPayload(lead, companyId) {
  const { firstName, lastName } = splitContactName(lead.contactName);
  const fallbackLastName = lastName || lead.company || "Business Contact";
  return {
    First_Name: firstName || undefined,
    Last_Name: fallbackLastName,
    Email: lead.email || undefined,
    Phone: lead.phone || undefined,
    Account_Name: companyId ? { id: companyId } : undefined,
    Description: lead.role || undefined
  };
}

function buildBiginDealPayload(lead, companyId, contactId, pipelineDefaults) {
  const enrichedLead = enrichLead(store, lead);
  const closeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const payload = {
    Deal_Name: `${lead.company || "Lead"} - ${enrichedLead.recommendation.productName}`,
    Pipeline: pipelineDefaults.pipelineId,
    Sub_Pipeline: pipelineDefaults.subPipeline,
    Stage: pipelineDefaults.stage,
    Closing_Date: closeDate,
    Account_Name: companyId ? { id: companyId } : undefined,
    Contact_Name: contactId ? { id: contactId } : undefined,
    Description: [
      `Recommended product: ${enrichedLead.recommendation.productName}`,
      `Reason: ${enrichedLead.recommendation.reason}`,
      lead.source ? `Source: ${lead.source}` : "",
      ...buildBusinessNatureDetails(lead),
      normalizeLeadWebsite(lead) ? `Website: ${normalizeLeadWebsite(lead)}` : "",
      removeWebsiteFromNotes(lead.notes)
    ]
      .filter(Boolean)
      .join("\n")
  };
  return payload;
}

async function pushLeadToBigin(store, username, lead, fetchImpl = fetch) {
  if (!lead.bigin || typeof lead.bigin !== "object") {
    lead.bigin = {};
  }

  if (!lead.bigin.companyId) {
    const companyPayload = buildBiginCompanyPayload(lead);
    try {
      const companyDetails = await createBiginRecord(store, username, "Accounts", companyPayload, fetchImpl);
      lead.bigin.companyId = companyDetails.id;
      lead.bigin.companyName = lead.company || "";
      writeStore(store);
    } catch (error) {
      lead.bigin.lastSyncError = error.message || String(error);
      writeStore(store);
      throw buildBiginDebugError("company create", "POST /bigin/v2/Accounts", companyPayload, error);
    }
  }

  const shouldCreateContact = Boolean(
    String(lead.contactName || "").trim() || String(lead.email || "").trim() || String(lead.phone || "").trim()
  );
  if (shouldCreateContact && !lead.bigin.contactId) {
    const contactPayload = buildBiginContactPayload(lead, lead.bigin.companyId);
    try {
      const contactDetails = await createBiginRecord(store, username, "Contacts", contactPayload, fetchImpl);
      lead.bigin.contactId = contactDetails.id;
      writeStore(store);
    } catch (error) {
      lead.bigin.lastSyncError = error.message || String(error);
      writeStore(store);
      throw buildBiginDebugError("contact create", "POST /bigin/v2/Contacts", contactPayload, error);
    }
  }

  if (!lead.bigin.dealId) {
    const pipelineDefaults = await resolveBiginPipelineDefaults(store, username, fetchImpl);
    const dealPayload = buildBiginDealPayload(lead, lead.bigin.companyId, lead.bigin.contactId, pipelineDefaults);
    try {
      const dealDetails = await createBiginRecord(store, username, "Pipelines", dealPayload, fetchImpl);
      lead.bigin.dealId = dealDetails.id;
      lead.bigin.pipelineId = pipelineDefaults.pipelineId;
      lead.bigin.pipelineName = pipelineDefaults.pipelineName;
      lead.bigin.subPipeline = pipelineDefaults.subPipeline;
      lead.bigin.dealStage = pipelineDefaults.stage;
      writeStore(store);
    } catch (error) {
      lead.bigin.lastSyncError = error.message || String(error);
      writeStore(store);
      throw buildBiginDebugError("deal create", "POST /bigin/v2/Pipelines", dealPayload, error);
    }
  }

  lead.crmLogged = true;
  lead.bigin.lastSyncedAt = new Date().toISOString();
  lead.bigin.lastSyncError = "";
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function calculateDistanceKm(from, to) {
  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);

  if ([lat1, lon1, lat2, lon2].some((item) => Number.isNaN(item))) {
    return null;
  }

  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function unique(values) {
  return Array.from(new Set(values));
}

function normalizeWebsiteUrl(rawUrl) {
  const normalized = String(rawUrl || "").trim();
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function websiteOrigin(urlString) {
  try {
    return new URL(urlString).origin;
  } catch (error) {
    return "";
  }
}

function websiteHost(urlString) {
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

function guessEmailFromWebsite(websiteUrl) {
  const host = websiteHost(websiteUrl).replace(/^www\./i, "");
  if (!host) {
    return "";
  }

  const blockedHosts = ["facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "linkedin.com"];
  if (blockedHosts.some((blocked) => host.endsWith(blocked))) {
    return "";
  }

  return `info@${host}`;
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractEmailsFromText(text) {
  const matches = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const blacklist = ["example.com", "sentry.io", "wix.com", "godaddy.com", "cloudflare.com"];
  return unique(
    matches
      .map((email) => email.trim().toLowerCase())
      .filter((email) => {
        const domain = email.split("@")[1] || "";
        if (!domain) {
          return false;
        }
        return !blacklist.some((blocked) => domain.endsWith(blocked));
      })
  );
}

function pickBestWebsiteEmail(emails, siteHost) {
  if (!emails.length) {
    return "";
  }

  const normalizedHost = String(siteHost || "").replace(/^www\./i, "").toLowerCase();
  const sorted = [...emails].sort((left, right) => {
    const leftDomain = (left.split("@")[1] || "").replace(/^www\./i, "");
    const rightDomain = (right.split("@")[1] || "").replace(/^www\./i, "");
    const leftMatch = normalizedHost && leftDomain.endsWith(normalizedHost);
    const rightMatch = normalizedHost && rightDomain.endsWith(normalizedHost);
    if (leftMatch !== rightMatch) {
      return leftMatch ? -1 : 1;
    }
    return left.length - right.length;
  });

  return sorted[0] || "";
}

async function discoverEmailFromWebsite(websiteUrl, fetchImpl = fetch) {
  const url = normalizeWebsiteUrl(websiteUrl);
  if (!url) {
    return "";
  }

  const origin = websiteOrigin(url);
  const host = websiteHost(url);
  if (!origin || !host) {
    return "";
  }

  const candidates = unique([url, `${origin}/contact`, `${origin}/contact-us`, `${origin}/about`]);
  const collected = [];

  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(fetchImpl, candidate, {
        method: "GET",
        headers: {
          "User-Agent": "LeadGenAI/1.0 (+email-discovery)"
        }
      });
      if (!response.ok) {
        continue;
      }
      const html = await response.text();
      collected.push(...extractEmailsFromText(html));
      if (collected.length) {
        break;
      }
    } catch (error) {
      // Ignore website lookup failures and keep import flow moving.
    }
  }

  return pickBestWebsiteEmail(unique(collected), host);
}

async function searchGoogleMapsLeads(
  { query, region, companyType, painPoint, latitude, longitude, radiusKm },
  fetchImpl = fetch,
  apiKey = "",
  websiteFetchImpl = fetch
) {
  apiKey = apiKey || process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) {
    throw new Error("Google Maps API key is not configured.");
  }

  const fetchSearchPage = async (pageToken = "") => {
    const searchResponse = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.primaryType,places.websiteUri,places.location,nextPageToken"
      },
      body: JSON.stringify({
        textQuery: String(query || "").trim() || "businesses",
        ...(pageToken ? { pageToken } : {}),
        maxResultCount: 20,
        regionCode: "MY",
        languageCode: "en",
        rankPreference: "DISTANCE",
        locationBias: {
          circle: {
            center: {
              latitude: Number(latitude),
              longitude: Number(longitude)
            },
            radius: Number(radiusKm) * 1000
          }
        }
      })
    });

    return readJsonResponse(searchResponse);
  };

  const allPlaces = [];
  const firstPage = await fetchSearchPage();
  allPlaces.push(...(Array.isArray(firstPage.places) ? firstPage.places : []));

  let pageToken = firstPage.nextPageToken;
  while (pageToken && allPlaces.length < 60) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    try {
      const nextPage = await fetchSearchPage(pageToken);
      allPlaces.push(...(Array.isArray(nextPage.places) ? nextPage.places : []));
      pageToken = nextPage.nextPageToken;
    } catch (error) {
      break;
    }
  }

  const detailedPlaces = await Promise.all(
    allPlaces.map(async (place) => {
      if (!place.id) {
        return null;
      }

      const detailsResponse = await fetchImpl(`https://places.googleapis.com/v1/places/${place.id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,nationalPhoneNumber,websiteUri"
        }
      });

      const details = await readJsonResponse(detailsResponse);
      const placeLocation = place.location || null;
      const distanceKm =
        placeLocation && latitude !== undefined && longitude !== undefined
          ? calculateDistanceKm(
              { latitude, longitude },
              { latitude: placeLocation.latitude, longitude: placeLocation.longitude }
            )
          : null;

      return {
        company: place.displayName && place.displayName.text ? place.displayName.text : "Unknown business",
        contactName: "Business Contact",
        email:
          (await discoverEmailFromWebsite(place.websiteUri || details.websiteUri || "", websiteFetchImpl)) ||
          guessEmailFromWebsite(place.websiteUri || details.websiteUri || ""),
        phone: details.nationalPhoneNumber || "",
        website: place.websiteUri || details.websiteUri || "",
        role: "",
        industry: place.primaryType || "Business",
        region: region || "Other",
        companyType: companyType || "",
        painPoint: painPoint || "",
        source: "Google Maps",
        status: "new",
        notes: [
          "Imported from Google Maps.",
          place.formattedAddress ? `Address: ${place.formattedAddress}` : "",
          distanceKm !== null ? `Distance: ${distanceKm.toFixed(1)} km` : ""
        ].filter(Boolean).join(" "),
        externalRef: place.id,
        distanceKm,
        location: placeLocation
      };
    })
  );

  const normalizedRadiusKm = Number(radiusKm);
  const hasRadiusFilter =
    Number.isFinite(normalizedRadiusKm) &&
    normalizedRadiusKm > 0 &&
    latitude !== undefined &&
    longitude !== undefined;

  return detailedPlaces.filter((place) => {
    if (!place) {
      return false;
    }

    if (!hasRadiusFilter) {
      return true;
    }

    return place.distanceKm !== null && place.distanceKm <= normalizedRadiusKm;
  });
}

async function searchGoogleMapsViaApify(
  { query, region, companyType, painPoint, latitude, longitude, radiusKm },
  maxResults = 500,
  fetchImpl = fetch
) {
  const apifyToken = process.env.APIFY_TOKEN || "";
  if (!apifyToken) {
    throw new Error("Apify API token is not configured. Set APIFY_TOKEN in environment variables.");
  }

  const actorId = process.env.APIFY_GOOGLE_MAPS_ACTOR_ID || "compass/crawler-google-places";
  const limit = Number(process.env.APIFY_MAX_RESULTS) || maxResults || 500;

  // Build search query
  const searchQuery = String(query || "").trim() || "businesses";
  const locationQuery = latitude && longitude
    ? `${searchQuery} near ${latitude},${longitude}`
    : searchQuery;

  // Start the Apify actor run
  const encodedActorId = encodeURIComponent(actorId);
  const runResponse = await fetchImpl(`https://api.apify.com/v2/acts/${encodedActorId}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apifyToken}`
    },
    body: JSON.stringify({
      searchStringsArray: [locationQuery],
      maxCrawledPlacesPerSearch: limit,
      language: "en",
      country: "MY",
      includeHistogram: false
    })
  });

  if (!runResponse.ok) {
    const errText = await runResponse.text();
    throw new Error(`Apify run failed: ${errText}`);
  }

  const runData = await runResponse.json();
  const runId = runData.data.id;

  // Poll for completion (max 5 minutes)
  const maxWait = 300000;
  const pollInterval = 3000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const statusResponse = await fetchImpl(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { "Authorization": `Bearer ${apifyToken}` }
    });
    const statusData = await statusResponse.json();
    const status = statusData.data.status;

    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify scraper failed: ${statusData.data.statusMessage || status}`);
    }
    // TIMING-RUNNING or STARTING — keep polling
  }

  // Fetch results from dataset
  const datasetResponse = await fetchImpl(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json&clean=true&desc=true&limit=${limit}`,
    {
      method: "GET",
      headers: { "Authorization": `Bearer ${apifyToken}` }
    }
  );

  if (!datasetResponse.ok) {
    const errText = await datasetResponse.text();
    throw new Error(`Apify dataset fetch failed: ${errText}`);
  }

  const items = await datasetResponse.json();

  if (!Array.isArray(items)) {
    return [];
  }

  // Debug: log first item's keys to see what fields Apify returns
  if (items.length > 0) {
    console.log("[Apify] First result keys:", Object.keys(items[0]));
    console.log("[Apify] First result sample:", JSON.stringify(items[0], null, 2).slice(0, 500));
  }

  // Map Apify results to internal lead format
  return items.map((item) => {
    const website = String(item.website || "").trim();
    const email = String(item.email || "").trim() || guessEmailFromWebsite(website);
    // Apify returns address under multiple possible field names depending on actor
    const address = String(
      item.address || item.formattedAddress || item.streetAddress ||
      item.fullAddress || item.street || ""
    ).trim();
    const placeId = String(item.placeId || item.place_id || item.id || "");
    // Extract lat/lng if available
    const lat = item.lat || item.latitude;
    const lng = item.lng || item.longitude;
    const location = (lat && lng) ? { lat: Number(lat), lng: Number(lng) } : null;

    return {
      company: item.name || item.title || "Unknown business",
      contactName: "Business Contact",
      email,
      phone: String(item.phone || "").trim(),
      website,
      role: "",
      industry: item.category || "Business",
      region: region || "Other",
      companyType: companyType || "",
      painPoint: painPoint || "",
      source: "Google Maps (Apify)",
      status: "new",
      notes: [
        "Imported from Google Maps via Apify.",
        address ? `Address: ${address}` : "",
        item.rating ? `Rating: ${item.rating} (${item.reviews || 0} reviews)` : ""
      ].filter(Boolean).join(" "),
      externalRef: placeId || `apify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      distanceKm: null,
      location
    };
  });
}

function sanitizePreviewLead(store, lead) {
  const enrichedLead = enrichLead(store, lead);
  return {
    externalRef: lead.externalRef || "",
    company: lead.company || "",
    contactName: lead.contactName || "",
    email: lead.email || "",
    phone: lead.phone || "",
    website: normalizeLeadWebsite(lead),
    industry: lead.industry || "",
    region: lead.region || "",
    companyType: lead.companyType || "",
    painPoint: lead.painPoint || "",
    source: lead.source || "Google Maps",
    notes: removeWebsiteFromNotes(lead.notes),
    distanceKm: lead.distanceKm ?? null,
    recommendation: enrichedLead.recommendation,
    recommendedProduct: enrichedLead.recommendation.productName
  };
}

function importExternalLeads(store, incomingLeads, assignedTo) {
  const existingKeys = new Set(store.leads.map(makeLeadIdentity));
  const imported = [];
  let duplicateCount = 0;

  incomingLeads.forEach((incomingLead) => {
    const lead = {
      id: `lead-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      company: incomingLead.company || "",
      contactName: incomingLead.contactName || "Business Contact",
      email: incomingLead.email || "",
      phone: incomingLead.phone || "",
      website: incomingLead.website || "",
      role: incomingLead.role || "",
      industry: incomingLead.industry || "",
      region: incomingLead.region || "",
      companyType: incomingLead.companyType || "",
      painPoint: incomingLead.painPoint || "",
      source: incomingLead.source || "Manual research",
      status: "new",
      notes: incomingLead.notes || "",
      sent: false,
      sentAt: null,
      emailStatus: "not_sent",
      emailLastError: "",
      emailLastAttemptAt: null,
      crmLogged: false,
      assignedTo: assignedTo || "system",
      createdAt: new Date().toISOString(),
      externalRef: incomingLead.externalRef || ""
    };

    const identity = makeLeadIdentity(lead);
    if (existingKeys.has(identity)) {
      duplicateCount += 1;
      return;
    }

    existingKeys.add(identity);
    store.leads.unshift(lead);
    imported.push(lead);
    appendActivity(
      store,
      lead.id,
      "Lead imported",
      `${lead.company} was imported from ${lead.source} and added as a new lead.`,
      assignedTo
    );
  });

  return { imported, duplicateCount };
}

function escapeCsvValue(value) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildExcelTable(columns, rows) {
  const lines = [
    columns.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(","))
  ];
  return `\ufeff${lines.join("\r\n")}`;
}

function sendExcel(response, filename, columns, rows) {
  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  response.end(buildExcelTable(columns, rows));
}

function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

function saveExcelFile(filename, columns, rows) {
  ensureExportDir();
  const filePath = path.join(EXPORT_DIR, filename);
  fs.writeFileSync(filePath, buildExcelTable(columns, rows), "utf8");
  return filePath;
}

function filterLeadsByQuery(leads, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return leads;
  }

  return leads.filter((lead) => {
    const searchable = [
      lead.company,
      lead.contactName,
      lead.region,
      lead.source,
      lead.recommendation.productName,
      lead.industry
    ].join(" ").toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };

  try {
    const file = fs.readFileSync(filePath);
    const headers = {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    };
    // Add cache-busting for HTML files to ensure fresh UI loads
    if (extension === ".html") {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    response.writeHead(200, headers);
    response.end(file);
  } catch (error) {
    response.writeHead(404);
    response.end("Not found");
  }
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function appendActivity(store, leadId, title, body, performedBy) {
  store.activities.unshift({
    id: `activity-${Date.now()}`,
    leadId,
    title,
    body,
    performedBy: performedBy || "system",
    createdAt: new Date().toISOString()
  });
}

function autoSendQualifiedLead(store, lead) {
  if (lead.status !== "qualified") {
    return;
  }
}

function getEmailActivityLeads(store, leads) {
  return sortLeads(store, leads).filter((lead) => lead.emailStatus === "sent" || lead.emailStatus === "failed");
}

async function handleApi(request, response, pathname, options = {}) {
  let store;
  try {
    store = await readStore();
  } catch (err) {
    console.error('Data file error, using fallback:', err.message);
    store = defaultStore();
  }
  const googlePlacesFetch = options.googlePlacesFetch || fetch;
  const websiteFetch = options.websiteFetch || googlePlacesFetch;
  const sendEmail = options.sendEmail || sendEmailMessage;
  const biginFetch = options.biginFetch || fetch;
  const emailDebugLogger = options.emailDebugLogger;

  // ===== AUTH ENDPOINTS (no auth required) =====

  if (request.method === "POST" && pathname === "/api/auth/login") {
    const body = await readRequestBody(request);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!username || !password) {
      sendJson(response, 400, { error: "Username and password are required." });
      return;
    }

    const user = store.users.find(u => u.username === username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      sendJson(response, 401, { error: "Invalid username or password." });
      return;
    }

    const sessionId = createSession(user.username, user.role);
    setAuthCookie(response, sessionId);
    sendJson(response, 200, {
      username: user.username,
      role: user.role,
      displayName: user.displayName || user.username
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const sessionId = parseSessionCookie(request);
    destroySession(sessionId);
    clearAuthCookie(response);
    sendJson(response, 200, { message: "Logged out." });
    return;
  }

  if (request.method === "GET" && pathname === "/api/auth/session") {
    const sessionId = parseSessionCookie(request);
    const session = getSession(sessionId);
    if (!session) {
      sendJson(response, 401, { error: "Not authenticated" });
      return;
    }
    sendJson(response, 200, {
      username: session.username,
      role: session.role,
      displayName: session.username
    });
    return;
  }

  // ===== ALL OTHER API ROUTES REQUIRE AUTH =====
  const session = requireAuth(request, response, store);
  if (!session) return;

  // ===== SELF-SERVICE BIGIN (all users can see/manage their own) =====

  if (request.method === "GET" && pathname === "/api/bigin/my-status") {
    const connection = getUserBigin(store, session.username);
    sendJson(response, 200, {
      username: session.username,
      displayName: session.username,
      role: session.role,
      connected: Boolean(getUserBiginRefreshToken(store, session.username)),
      connectedAt: connection.connectedAt || null,
      apiDomain: getUserBiginApiDomain(store, session.username)
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/bigin/disconnect") {
    const user = store.users.find(u => u.username === session.username);
    if (!user) {
      sendJson(response, 404, { error: "User not found." });
      return;
    }
    user.bigin = {};
    writeStore(store);
    sendJson(response, 200, { message: "Bigin disconnected." });
    return;
  }

  // ===== PRODUCT MANAGER ENDPOINTS =====

  if (request.method === "GET" && pathname === "/api/products") {
    sendJson(response, 200, { products: store.products });
    return;
  }

  if (request.method === "POST" && pathname === "/api/products") {
    const body = await readRequestBody(request);
    const product = {
      id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      key: String(body.key || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || `custom-${Date.now()}`,
      name: String(body.name || "").trim(),
      pitch: String(body.pitch || "").trim(),
      icon: String(body.icon || "").trim(),
      color: String(body.color || "blue").trim(),
      active: body.active !== false,
      createdAt: new Date().toISOString()
    };
    if (!product.name) {
      sendJson(response, 400, { error: "Product name is required." });
      return;
    }
    store.products.push(product);
    writeStore(store);
    sendJson(response, 201, { product });
    return;
  }

  if (request.method === "PATCH" && pathname.startsWith("/api/products/")) {
    const id = pathname.split("/api/products/")[1];
    const body = await readRequestBody(request);
    const idx = store.products.findIndex(p => p.id === id);
    if (idx === -1) {
      sendJson(response, 404, { error: "Product not found." });
      return;
    }
    if (body.name !== undefined) store.products[idx].name = String(body.name).trim();
    if (body.pitch !== undefined) store.products[idx].pitch = String(body.pitch).trim();
    if (body.icon !== undefined) store.products[idx].icon = String(body.icon).trim();
    if (body.color !== undefined) store.products[idx].color = String(body.color).trim();
    if (body.active !== undefined) store.products[idx].active = Boolean(body.active);
    if (body.key !== undefined) store.products[idx].key = String(body.key).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    writeStore(store);
    sendJson(response, 200, { product: store.products[idx] });
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/products/")) {
    const id = pathname.split("/api/products/")[1];
    const idx = store.products.findIndex(p => p.id === id);
    if (idx === -1) {
      sendJson(response, 404, { error: "Product not found." });
      return;
    }
    store.products.splice(idx, 1);
    writeStore(store);
    sendJson(response, 200, { message: "Product deleted." });
    return;
  }

  // ===== EMAIL TEMPLATES ENDPOINTS =====

  if (request.method === "GET" && pathname === "/api/templates") {
    sendJson(response, 200, {
      templates: store.emailTemplates,
      defaultTemplateId: store.defaultTemplateId
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/templates") {
    const body = await readRequestBody(request);
    const tmpl = {
      id: `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: String(body.name || "").trim(),
      subject: String(body.subject || "").trim(),
      body: String(body.body || "").trim(),
      createdAt: new Date().toISOString()
    };
    if (!tmpl.name || !tmpl.subject || !tmpl.body) {
      sendJson(response, 400, { error: "Name, subject, and body are required." });
      return;
    }
    store.emailTemplates.push(tmpl);
    if (!store.defaultTemplateId) {
      store.defaultTemplateId = tmpl.id;
    }
    writeStore(store);
    sendJson(response, 201, { template: tmpl });
    return;
  }

  if (request.method === "PATCH" && pathname.startsWith("/api/templates/")) {
    const id = pathname.split("/api/templates/")[1];
    if (id === "default") {
      const body = await readRequestBody(request);
      const tmplId = body.templateId;
      const exists = store.emailTemplates.find(t => t.id === tmplId);
      if (!exists) {
        sendJson(response, 404, { error: "Template not found." });
        return;
      }
      store.defaultTemplateId = tmplId;
      writeStore(store);
      sendJson(response, 200, { message: "Default template updated.", defaultTemplateId: tmplId });
      return;
    }
    const body = await readRequestBody(request);
    const idx = store.emailTemplates.findIndex(t => t.id === id);
    if (idx === -1) {
      sendJson(response, 404, { error: "Template not found." });
      return;
    }
    if (body.name !== undefined) store.emailTemplates[idx].name = String(body.name).trim();
    if (body.subject !== undefined) store.emailTemplates[idx].subject = String(body.subject).trim();
    if (body.body !== undefined) store.emailTemplates[idx].body = String(body.body).trim();
    writeStore(store);
    sendJson(response, 200, { template: store.emailTemplates[idx] });
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/templates/")) {
    const id = pathname.split("/api/templates/")[1];
    const idx = store.emailTemplates.findIndex(t => t.id === id);
    if (idx === -1) {
      sendJson(response, 404, { error: "Template not found." });
      return;
    }
    store.emailTemplates.splice(idx, 1);
    if (store.defaultTemplateId === id) {
      store.defaultTemplateId = store.emailTemplates[0]?.id || "";
    }
    writeStore(store);
    sendJson(response, 200, { message: "Template deleted." });
    return;
  }

  // ===== ADMIN-ONLY ENDPOINTS =====
  if (pathname.startsWith("/api/admin/")) {
    if (session.role !== "admin") {
      sendJson(response, 403, { error: "Admin access required." });
      return;
    }

    // GET /api/admin/bigin-connections - list all users' BigIN status
    if (request.method === "GET" && pathname === "/api/admin/bigin-connections") {
      const connections = store.users.map(u => ({
        username: u.username,
        displayName: u.displayName || u.username,
        role: u.role,
        connected: Boolean(u.bigin && u.bigin.refreshToken),
        connectedAt: (u.bigin && u.bigin.connectedAt) || null,
        apiDomain: (u.bigin && u.bigin.apiDomain) || null
      }));
      sendJson(response, 200, { users: connections });
      return;
    }

    // POST /api/admin/bigin-connections/:username/disconnect
    const disconnectMatch = pathname.match(/^\/api\/admin\/bigin-connections\/([^/]+)\/disconnect$/);
    if (disconnectMatch && request.method === "POST") {
      const [, targetUsername] = disconnectMatch;
      const targetUser = store.users.find(u => u.username === targetUsername);
      if (!targetUser) {
        sendJson(response, 404, { error: "User not found." });
        return;
      }
      targetUser.bigin = {};
      writeStore(store);
      sendJson(response, 200, { message: `Bigin disconnected for ${targetUser.displayName || targetUser.username}.` });
      return;
    }

    // GET /api/admin/bigin-status - summary stats
    if (request.method === "GET" && pathname === "/api/admin/bigin-status") {
      const total = store.users.length;
      const connected = store.users.filter(u => u.bigin && u.bigin.refreshToken).length;
      sendJson(response, 200, { total, connected, disconnected: total - connected });
      return;
    }
  }

  // ===== BIGIN ENDPOINTS =====

  if (request.method === "GET" && pathname === "/api/integrations/bigin/connect") {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const forUser = url.searchParams.get("for") || session.username;
    response.writeHead(302, { Location: buildBiginConnectUrl(request, forUser) });
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/api/integrations/bigin/status") {
    const connection = getUserBigin(store, session.username);
    sendJson(response, 200, {
      connected: Boolean(getUserBiginRefreshToken(store, session.username)),
      apiDomain: getUserBiginApiDomain(store, session.username),
      connectedAt: connection.connectedAt || null,
      lastTokenAt: connection.lastTokenAt || null
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/leads") {
    // Admin sees all activities; regular users see only their own
    const activities = session.role === "admin"
      ? store.activities.slice(0, 20)
      : store.activities.filter(a => a.performedBy === session.username).slice(0, 20);

    sendJson(response, 200, {
      leads: sortLeads(store, store.leads),
      summary: buildSummary(store, store.leads),
      activities
    });
    return;
  }

  if (request.method === "DELETE" && pathname === "/api/leads") {
    const count = store.leads.length;
    store.leads = [];
    writeStore(store);
    sendJson(response, 200, { message: `Cleared ${count} leads.`, cleared: count });
    return;
  }

  if (request.method === "GET" && pathname === "/api/export/leads.csv") {
    const query = new URL(request.url, `http://${request.headers.host}`).searchParams.get("query");
    const leads = filterLeadsByQuery(sortLeads(store, store.leads), query);
    sendExcel(
      response,
      "lead-queue-export.csv",
      ["Company", "Contact", "Email", "Phone", "Region", "Source", "Priority", "Recommended Product", "Status"],
      leads.map((lead) => [
        lead.company,
        lead.contactName,
        lead.email,
        lead.phone || "",
        lead.region,
        lead.source,
        lead.priorityArea ? "Priority" : "Standard",
        lead.recommendation.productName,
        lead.status
      ])
    );
    return;
  }

  if (request.method === "GET" && pathname === "/api/export/sent.csv") {
    const leads = getEmailActivityLeads(store, store.leads);
    sendExcel(
      response,
      "sent-email-export.csv",
      ["Company", "Contact", "Email", "Region", "Source", "Status", "Attempted Time", "Error"],
      leads.map((lead) => [
        lead.company,
        lead.contactName,
        lead.email,
        lead.region,
        lead.source,
        lead.emailStatus,
        lead.emailLastAttemptAt || lead.sentAt || "Not attempted",
        lead.emailLastError || ""
      ])
    );
    return;
  }

  if (request.method === "POST" && pathname === "/api/export/save") {
    const body = await readRequestBody(request);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (body.type === "leads") {
      const leads = filterLeadsByQuery(sortLeads(store, store.leads), body.query);
      const filePath = saveExcelFile(
        `lead-queue-export-${timestamp}.csv`,
        ["Company", "Contact", "Email", "Phone", "Region", "Source", "Priority", "Recommended Product", "Status"],
        leads.map((lead) => [
          lead.company,
          lead.contactName,
          lead.email,
          lead.phone || "",
          lead.region,
          lead.source,
          lead.priorityArea ? "Priority" : "Standard",
          lead.recommendation.productName,
          lead.status
        ])
      );
      sendJson(response, 200, { filePath });
      return;
    }

    if (body.type === "sent") {
      const leads = getEmailActivityLeads(store, store.leads);
      const filePath = saveExcelFile(
        `sent-email-export-${timestamp}.csv`,
        ["Company", "Contact", "Email", "Region", "Source", "Status", "Attempted Time", "Error"],
        leads.map((lead) => [
          lead.company,
          lead.contactName,
          lead.email,
          lead.region,
          lead.source,
          lead.emailStatus,
          lead.emailLastAttemptAt || lead.sentAt || "Not attempted",
          lead.emailLastError || ""
        ])
      );
      sendJson(response, 200, { filePath });
      return;
    }

    sendJson(response, 400, { error: "Unsupported export type" });
    return;
  }

  if (request.method === "POST" && pathname === "/api/import/google-maps") {
    const body = await readRequestBody(request);
    if (!String(body.query || "").trim()) {
      sendJson(response, 400, { error: "A Google Maps search query is required." });
      return;
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      sendJson(response, 400, { error: "Google Maps API key is not configured on the server." });
      return;
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const radiusKm = Number(body.radiusKm);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      sendJson(response, 400, { error: "Your live location is required before importing from Google Maps." });
      return;
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      sendJson(response, 400, { error: "Please enter a valid radius in kilometers." });
      return;
    }

    const externalLeads = await searchGoogleMapsLeads(
      {
        query: body.query,
        region: body.region,
        companyType: body.companyType,
        painPoint: body.painPoint,
        latitude,
        longitude,
        radiusKm
      },
      googlePlacesFetch,
      "",
      websiteFetch
    );

    const { imported, duplicateCount } = importExternalLeads(store, externalLeads);
    writeStore(store);
    sendJson(response, 201, {
      importedCount: imported.length,
      duplicateCount,
      leads: imported.map(enrichLead)
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/google-maps/search") {
    const body = await readRequestBody(request);
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const radiusKm = Number(body.radiusKm);

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      sendJson(response, 400, { error: "Google Maps API key is not configured on the server." });
      return;
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      sendJson(response, 400, { error: "Your live location is required before searching Google Maps." });
      return;
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      sendJson(response, 400, { error: "Please enter a valid radius in kilometers." });
      return;
    }

    const candidates = await searchGoogleMapsLeads(
      {
        query: body.query,
        region: body.region,
        companyType: body.companyType,
        painPoint: body.painPoint,
        latitude,
        longitude,
        radiusKm
      },
      googlePlacesFetch,
      "",
      websiteFetch
    );

    const existingIdentities = new Set(store.leads.map(makeLeadIdentity));

    const deduplicated = candidates.filter((candidate) => {
      const identity = makeLeadIdentity(candidate);
      return !existingIdentities.has(identity);
    });

    sendJson(response, 200, {
      leads: deduplicated.map((lead) => sanitizePreviewLead(store, lead)),
      filteredCount: candidates.length - deduplicated.length
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/google-maps/apify-search") {
    const body = await readRequestBody(request);
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const radiusKm = Number(body.radiusKm);
    const maxResults = Number(body.maxResults) || 500;

    if (!process.env.APIFY_TOKEN) {
      sendJson(response, 400, { error: "Apify API token is not configured on the server." });
      return;
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      sendJson(response, 400, { error: "Your live location is required before searching Google Maps." });
      return;
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      sendJson(response, 400, { error: "Please enter a valid radius in kilometers." });
      return;
    }

    const candidates = await searchGoogleMapsViaApify(
      {
        query: body.query,
        region: body.region,
        companyType: body.companyType,
        painPoint: body.painPoint,
        latitude,
        longitude,
        radiusKm
      },
      maxResults,
      fetch
    );

    const existingIdentities = new Set(store.leads.map(makeLeadIdentity));

    const deduplicated = candidates.filter((candidate) => {
      const identity = makeLeadIdentity(candidate);
      return !existingIdentities.has(identity);
    });

    sendJson(response, 200, {
      leads: deduplicated.map((lead) => sanitizePreviewLead(store, lead)),
      filteredCount: candidates.length - deduplicated.length
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/google-maps/import-selected") {
    const body = await readRequestBody(request);
    const selectedLeads = Array.isArray(body.leads) ? body.leads : [];

    if (!selectedLeads.length) {
      sendJson(response, 400, { error: "Select at least one shop before importing." });
      return;
    }

    const { imported, duplicateCount } = importExternalLeads(store, selectedLeads, session.username);
    writeStore(store);
    sendJson(response, 201, {
      importedCount: imported.length,
      duplicateCount,
      leads: imported.map(enrichLead)
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/leads") {
    const body = await readRequestBody(request);
    const lead = {
      id: `lead-${Date.now()}`,
      company: body.company || "",
      contactName: body.contactName || "",
      email: body.email || "",
      phone: body.phone || "",
      website: body.website || "",
      role: body.role || "",
      industry: body.industry || "",
      region: body.region || "",
      companyType: body.companyType || "",
      painPoint: body.painPoint || "",
      source: body.source || "Manual research",
      status: "new",
      notes: body.notes || "",
      sent: false,
      sentAt: null,
      emailStatus: "not_sent",
      emailLastError: "",
      emailLastAttemptAt: null,
      crmLogged: false,
      assignedTo: session.username,
      createdAt: new Date().toISOString()
    };

    store.leads.unshift(lead);
    appendActivity(
      store,
      lead.id,
      "Lead added",
      `${lead.company} was added from ${lead.source} and automatically checked for KL / Selangor priority.`,
      session.username
    );
    writeStore(store);
    sendJson(response, 201, { lead: enrichLead(store, lead) });
    return;
  }

  const sendEmailMatch = pathname.match(/^\/api\/leads\/([^/]+)\/send-email$/);
  if (sendEmailMatch && request.method === "POST") {
    const [, leadId] = sendEmailMatch;
    const lead = store.leads.find((item) => item.id === leadId);

    if (!lead) {
      sendJson(response, 404, { error: "Lead not found" });
      return;
    }

    if (!String(lead.email || "").trim()) {
      sendJson(response, 400, { error: "This lead does not have a recipient email address." });
      return;
    }

    const body = await readRequestBody(request);
    const senderName = String(body.senderName || "").trim() || "LeadGen AI";
    const senderEmail = String(body.senderEmail || "").trim() || process.env.GMAIL_SMTP_EMAIL || "";
    const subject = String(body.subject || "").trim();
    const messageBody = String(body.body || "").trim();

    if (!subject || !messageBody) {
      sendJson(response, 400, { error: "Subject and message body are required before sending." });
      return;
    }

    try {
      const mailResult = await sendEmail({
        to: String(lead.email).trim(),
        fromName: senderName,
        fromEmail: senderEmail,
        subject,
        body: messageBody
      });

      lead.sent = true;
      lead.sentAt = new Date().toISOString();
      lead.emailStatus = "sent";
      lead.emailLastError = "";
      lead.emailLastAttemptAt = lead.sentAt;
      appendActivity(
        store,
        lead.id,
        "Outreach email sent",
        `${lead.company} received a live email send to ${lead.email}.`,
        session.username
      );
      writeStore(store);
      sendJson(response, 200, {
        success: true,
        messageId: mailResult && mailResult.messageId ? mailResult.messageId : ""
      });
      return;
    } catch (error) {
      const failureMessage = describeError(error, "Unknown SMTP error");
      lead.emailStatus = "failed";
      lead.emailLastError = failureMessage;
      lead.emailLastAttemptAt = new Date().toISOString();
      appendActivity(
        store,
        lead.id,
        "Outreach email failed",
        `${lead.company} email send failed: ${failureMessage}`,
        session.username
      );
      writeStore(store);
      const debug = buildEmailDebugContext({ lead, senderName, senderEmail, subject });
      logEmailSendFailure(emailDebugLogger, debug, error);
      sendJson(response, 500, {
        error: `Email send failed: ${failureMessage}`,
        debug
      });
      return;
    }
  }

  const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)\/(status|sent|crm|edit)$/);
  if (leadMatch) {
    const [, leadId, action] = leadMatch;
    const lead = store.leads.find((item) => item.id === leadId);

    if (!lead) {
      sendJson(response, 404, { error: "Lead not found" });
      return;
    }

    if (action === "status" && request.method === "PATCH") {
      const body = await readRequestBody(request);
      lead.status = body.status || lead.status;
      appendActivity(store, lead.id, "Lead status updated", `${lead.company} is now marked as ${lead.status}.`, session.username);
      autoSendQualifiedLead(store, lead);
    }

    if (action === "edit" && request.method === "PATCH") {
      const body = await readRequestBody(request);
      const updatable = ['company','contactName','email','phone','website','role','industry','region','companyType','painPoint','source','notes','status','assignedTo'];
      let changed = false;
      for (const field of updatable) {
        if (body[field] !== undefined && lead[field] !== body[field]) {
          lead[field] = body[field];
          changed = true;
        }
      }
      if (changed) {
        appendActivity(store, lead.id, "Lead updated", `${lead.company} details were edited manually.`, session.username);
      }
    }

    if (action === "sent" && request.method === "PATCH") {
      if (!lead.sent) {
        lead.sent = true;
        lead.sentAt = new Date().toISOString();
        lead.emailStatus = "sent";
        lead.emailLastError = "";
        lead.emailLastAttemptAt = lead.sentAt;
        appendActivity(store, lead.id, "Outreach marked as sent", `${lead.company} was added to the sent email list.`, session.username);
      }
    }

    if (action === "crm" && request.method === "PATCH") {
      if (!lead.crmLogged) {
        try {
          await pushLeadToBigin(store, session.username, lead, biginFetch);
          appendActivity(store, lead.id, "Logged to CRM", `${lead.company} was marked as logged in the CRM.`, session.username);
        } catch (crmError) {
          writeStore(store);
          sendJson(response, 500, { error: crmError.message || "CRM sync failed" });
          return;
        }
      } else if (lead.bigin && lead.bigin.dealId) {
        appendActivity(store, lead.id, "CRM sync skipped", `${lead.company} already has an existing Bigin deal.`, session.username);
      }
    }

    writeStore(store);
    sendJson(response, 200, { lead: enrichLead(store, lead) });
    return;
  }

  const deleteMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const [, leadId] = deleteMatch;
    const leadIndex = store.leads.findIndex((item) => item.id === leadId);

    if (leadIndex === -1) {
      sendJson(response, 404, { error: "Lead not found" });
      return;
    }

    const [removedLead] = store.leads.splice(leadIndex, 1);
    appendActivity(
      store,
      removedLead.id,
      "Lead removed",
      `${removedLead.company} was removed from the queue.`,
      session.username
    );
    writeStore(store);
    sendJson(response, 200, { success: true });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function createAppServer(options = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname.startsWith("/api/")) {
        await handleApi(request, response, pathname, options);
        return;
      }

      if (pathname === "/oauth/callback") {
        const sessionId = parseSessionCookie(request);
        const session = getSession(sessionId);
        const destination = "/modern.html";
        const failureDestination = `/modern.html?error=${encodeURIComponent("OAuth authorization failed")}`;

        if (!session) {
          response.writeHead(302, { Location: destination });
          response.end();
          return;
        }

        const store = await readStore();

        const state = url.searchParams.get("state") || "";
        if (state.startsWith("bigin-connect:") && url.searchParams.get("code")) {
          const targetUser = state.replace("bigin-connect:", "");
          // Allow admin to connect Bigin for any user; others must match their own session
          if (session.role !== "admin" && targetUser && targetUser !== session.username) {
            response.writeHead(302, { Location: `${failureDestination}&message=${encodeURIComponent("Session mismatch")}` });
            response.end();
            return;
          }
          try {
            await exchangeBiginAuthorizationCode(request, store, targetUser || session.username, url.searchParams.get("code"));
            response.writeHead(302, { Location: `${destination}?bigin=connected` });
            response.end();
            return;
          } catch (error) {
            response.writeHead(302, { Location: `${failureDestination}&message=${encodeURIComponent(error.message || "Authorization failed")}` });
            response.end();
            return;
          }
        }

        sendHtml(
          response,
          200,
          `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=${destination}">
    <title>OAuth callback received</title>
  </head>
  <body>
    <p>Authorization received. Returning to the app...</p>
    <p><a href="${destination}">Continue</a></p>
  </body>
</html>`
        );
        return;
      }

      const target = pathname === "/" ? path.join(PUBLIC_DIR, "login.html") : path.join(PUBLIC_DIR, pathname);
      sendFile(response, target);
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Server error" });
    }
  });
}

function startServer(port = PORT, options = {}) {
  const server = createAppServer(options);
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (require.main === module) {
  // Ensure data directory and file exist before starting
  (async () => {
    try {
      ensureDataFile();
      await readStore();
      process.stdout.write(`Lead automation app running on http://localhost:${PORT}\n`);
      process.stdout.write(`Data file: ${DATA_PATH}\n`);
    } catch (err) {
      process.stderr.write(`Warning: Could not initialize data file: ${err.message}\n`);
      process.stderr.write(`Falling back to in-memory store.\n`);
    }
    startServer().catch((err) => {
      process.stderr.write(`Server failed to start: ${err.message}\n`);
      process.exit(1);
    });
  })();
}

module.exports = { createAppServer, startServer };






