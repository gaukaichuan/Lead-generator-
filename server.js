const http = require("http");
const fs = require("fs");
const path = require("path");
const tls = require("tls");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const DATA_PATH = path.join(__dirname, "data", "store.json");
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
  "cubehous-wms-system": {
    name: "Cubehous WMS System",
    pitch: "Tighten warehouse control, trace stock movement, and improve picking accuracy."
  },
  "autocount-pos": {
    name: "AutoCount POS",
    pitch: "Upgrade in-store sales handling, stock sync, and branch reporting."
  },
  "autocount-cloud-payroll": {
    name: "AutoCount Cloud Payroll",
    pitch: "Simplify payroll processing, staff records, and monthly compliance work."
  }
};

const EARTH_RADIUS_KM = 6371;

function readStore() {
  return ensureStoreShape(JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
}

function writeStore(store) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(ensureStoreShape(store), null, 2));
}

function ensureStoreShape(store) {
  if (!store || typeof store !== "object") {
    return {
      leads: [],
      activities: [],
      integrations: { bigin: {} }
    };
  }

  if (!Array.isArray(store.leads)) {
    store.leads = [];
  }

  if (!Array.isArray(store.activities)) {
    store.activities = [];
  }

  if (!store.integrations || typeof store.integrations !== "object") {
    store.integrations = {};
  }

  if (!store.integrations.bigin || typeof store.integrations.bigin !== "object") {
    store.integrations.bigin = {};
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
  const user = process.env.GMAIL_SMTP_EMAIL || "";
  const pass = process.env.GMAIL_APP_PASSWORD || "";

  if (!user || !pass) {
    throw new Error("Gmail SMTP is not configured. Set GMAIL_SMTP_EMAIL and GMAIL_APP_PASSWORD on the server.");
  }

  const smtpHost = process.env.GMAIL_SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.GMAIL_SMTP_PORT || 465);
  const replyTo = fromEmail && fromEmail !== user ? fromEmail : "";
  const envelopeFrom = user;
  const messageLines = [
    `From: ${formatMailbox(fromName, user)}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    ...String(body || "").split(/\r?\n/).map(smtpSafeLine)
  ];

  const socket = tls.connect({
    host: smtpHost,
    port: smtpPort,
    servername: smtpHost
  });

  await new Promise((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  const client = createSmtpClient(socket);

  try {
    await client.expectCode(220);
    await client.sendCommand("EHLO localhost", 250);
    await client.sendCommand("AUTH LOGIN", 334);
    await client.sendCommand(Buffer.from(user).toString("base64"), 334);
    await client.sendCommand(Buffer.from(pass).toString("base64"), 235);
    await client.sendCommand(`MAIL FROM:<${envelopeFrom}>`, 250);
    await client.sendCommand(`RCPT TO:<${to}>`, 250);
    await client.sendCommand("DATA", 354);
    socket.write(`${messageLines.join("\r\n")}\r\n.\r\n`);
    const dataResponse = await client.expectCode(250);
    await client.sendCommand("QUIT", 221);
    const idMatch = dataResponse.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/);
    return { messageId: idMatch ? idMatch[1] : "" };
  } finally {
    socket.end();
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

function recommendProduct(lead) {
  if (lead.painPoint === "warehouse-control" || lead.companyType === "warehouse") {
    return {
      productKey: "cubehous-wms-system",
      reason: "Warehouse movement, picking, and stock control are the primary issues."
    };
  }

  if (lead.painPoint === "checkout-pos" || lead.companyType === "retail" || lead.companyType === "fnb") {
    return {
      productKey: "autocount-pos",
      reason: "The business depends on retail counters, outlet reporting, and stock sync."
    };
  }

  if (lead.painPoint === "stock-visibility" || lead.companyType === "wholesale") {
    return {
      productKey: "presoft-mobile-stock",
      reason: "The sales team needs live stock visibility while taking customer orders."
    };
  }

  if (lead.painPoint === "payroll-compliance") {
    return {
      productKey: "autocount-cloud-payroll",
      reason: "Payroll admin and compliance are becoming harder as the team grows."
    };
  }

  return {
    productKey: "autocount-accounting",
    reason: "Finance control and reporting are the best starting point for this lead."
  };
}

function enrichLead(lead) {
  const recommendation = recommendProduct(lead);
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
      productName: products[recommendation.productKey].name,
      pitch: products[recommendation.productKey].pitch
    }
  };
}

function sortLeads(leads) {
  return leads
    .map(enrichLead)
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

function buildSummary(leads) {
  const enriched = sortLeads(leads);
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

function getBiginConnection(store) {
  ensureStoreShape(store);
  return store.integrations.bigin;
}

function getBiginApiDomain(store) {
  return process.env.BIGIN_API_DOMAIN || getBiginConnection(store).apiDomain || "https://www.zohoapis.com";
}

function getBiginRefreshToken(store) {
  return process.env.BIGIN_REFRESH_TOKEN || getBiginConnection(store).refreshToken || "";
}

function ensureBiginClientConfig() {
  if (!getBiginClientId() || !getBiginClientSecret()) {
    throw new Error("Bigin OAuth is not configured. Set BIGIN_CLIENT_ID and BIGIN_CLIENT_SECRET on the server.");
  }
}

function buildBiginConnectUrl(request) {
  ensureBiginClientConfig();
  const authUrl = new URL("/oauth/v2/auth", getBiginAccountsServer());
  authUrl.searchParams.set("client_id", getBiginClientId());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("scope", BIGIN_SCOPES);
  authUrl.searchParams.set("redirect_uri", getBiginRedirectUri(request));
  authUrl.searchParams.set("state", "bigin-connect");
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

async function exchangeBiginAuthorizationCode(request, store, code, fetchImpl = fetch) {
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
  const connection = getBiginConnection(store);
  connection.refreshToken = payload.refresh_token || connection.refreshToken || "";
  connection.apiDomain = payload.api_domain || connection.apiDomain || "https://www.zohoapis.com";
  connection.connectedAt = new Date().toISOString();
  connection.accountsServer = getBiginAccountsServer();
  writeStore(store);
  return connection;
}

async function getBiginAccessToken(store, fetchImpl = fetch) {
  ensureBiginClientConfig();
  const refreshToken = getBiginRefreshToken(store);

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
  const connection = getBiginConnection(store);
  connection.apiDomain = payload.api_domain || connection.apiDomain || "https://www.zohoapis.com";
  connection.lastTokenAt = new Date().toISOString();
  writeStore(store);
  return {
    accessToken: payload.access_token,
    apiDomain: getBiginApiDomain(store)
  };
}

async function createBiginRecord(store, moduleApiName, data, fetchImpl = fetch) {
  const { accessToken, apiDomain } = await getBiginAccessToken(store, fetchImpl);
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

async function getBiginJson(store, path, fetchImpl = fetch) {
  const { accessToken, apiDomain } = await getBiginAccessToken(store, fetchImpl);
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

async function getBiginPipelineMetadata(store, fetchImpl = fetch) {
  const [layoutsPayload, fieldsPayload] = await Promise.all([
    getBiginJson(store, "/bigin/v2/settings/layouts?module=Pipelines", fetchImpl),
    getBiginJson(store, "/bigin/v2/settings/fields?module=Pipelines", fetchImpl)
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

async function resolveBiginPipelineDefaults(store, fetchImpl = fetch) {
  const metadata = await getBiginPipelineMetadata(store, fetchImpl);
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
  const enrichedLead = enrichLead(lead);
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

async function pushLeadToBigin(store, lead, fetchImpl = fetch) {
  if (!lead.bigin || typeof lead.bigin !== "object") {
    lead.bigin = {};
  }

  if (!lead.bigin.companyId) {
    const companyPayload = buildBiginCompanyPayload(lead);
    try {
      const companyDetails = await createBiginRecord(store, "Accounts", companyPayload, fetchImpl);
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
      const contactDetails = await createBiginRecord(store, "Contacts", contactPayload, fetchImpl);
      lead.bigin.contactId = contactDetails.id;
      writeStore(store);
    } catch (error) {
      lead.bigin.lastSyncError = error.message || String(error);
      writeStore(store);
      throw buildBiginDebugError("contact create", "POST /bigin/v2/Contacts", contactPayload, error);
    }
  }

  if (!lead.bigin.dealId) {
    const pipelineDefaults = await resolveBiginPipelineDefaults(store, fetchImpl);
    const dealPayload = buildBiginDealPayload(lead, lead.bigin.companyId, lead.bigin.contactId, pipelineDefaults);
    try {
      const dealDetails = await createBiginRecord(store, "Pipelines", dealPayload, fetchImpl);
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

async function searchGoogleMapsLeads(
  { query, region, companyType, painPoint, latitude, longitude, radiusKm },
  fetchImpl = fetch,
  apiKey = ""
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

  if (firstPage.nextPageToken && allPlaces.length < 40) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    try {
      const nextPage = await fetchSearchPage(firstPage.nextPageToken);
      allPlaces.push(...(Array.isArray(nextPage.places) ? nextPage.places : []));
    } catch (error) {
      // Keep the first page results even if follow-up pagination fails.
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
        email: "",
        phone: details.nationalPhoneNumber || "",
        website: place.websiteUri || details.websiteUri || "",
        role: "",
        industry: place.primaryType || "Business",
        region: region || "Other",
        companyType: companyType || "service",
        painPoint: painPoint || "manual-accounting",
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
function sanitizePreviewLead(lead) {
  const enrichedLead = enrichLead(lead);
  return {
    externalRef: lead.externalRef || "",
    company: lead.company || "",
    contactName: lead.contactName || "",
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

function importExternalLeads(store, incomingLeads) {
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
      `${lead.company} was imported from ${lead.source} and added as a new lead.`
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
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
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
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    });
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

function appendActivity(store, leadId, title, body) {
  store.activities.unshift({
    id: `activity-${Date.now()}`,
    leadId,
    title,
    body,
    createdAt: new Date().toISOString()
  });
}

function autoSendQualifiedLead(store, lead) {
  if (lead.status !== "qualified" || lead.sent) {
    return;
  }

  lead.sent = true;
  lead.sentAt = new Date().toISOString();
  lead.emailStatus = "sent";
  lead.emailLastError = "";
  lead.emailLastAttemptAt = lead.sentAt;
  appendActivity(
    store,
    lead.id,
    "Outreach auto-sent",
    `${lead.company} was automatically moved to the sent email list after being manually marked as qualified.`
  );
}

function getEmailActivityLeads(leads) {
  return sortLeads(leads).filter((lead) => lead.emailStatus === "sent" || lead.emailStatus === "failed");
}

async function handleApi(request, response, pathname, options = {}) {
  const store = readStore();
  const googlePlacesFetch = options.googlePlacesFetch || fetch;
  const sendEmail = options.sendEmail || sendEmailMessage;
  const biginFetch = options.biginFetch || fetch;
  const emailDebugLogger = options.emailDebugLogger;

  if (request.method === "GET" && pathname === "/api/integrations/bigin/connect") {
    response.writeHead(302, { Location: buildBiginConnectUrl(request) });
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/api/integrations/bigin/status") {
    const connection = getBiginConnection(store);
    sendJson(response, 200, {
      connected: Boolean(getBiginRefreshToken(store)),
      apiDomain: getBiginApiDomain(store),
      connectedAt: connection.connectedAt || null,
      lastTokenAt: connection.lastTokenAt || null
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/leads") {
    sendJson(response, 200, {
      leads: sortLeads(store.leads),
      summary: buildSummary(store.leads),
      activities: store.activities.slice(0, 20)
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/export/leads.csv") {
    const query = new URL(request.url, `http://${request.headers.host}`).searchParams.get("query");
    const leads = filterLeadsByQuery(sortLeads(store.leads), query);
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
    const leads = getEmailActivityLeads(store.leads);
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
      const leads = filterLeadsByQuery(sortLeads(store.leads), body.query);
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
      const leads = getEmailActivityLeads(store.leads);
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
      googlePlacesFetch
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
      googlePlacesFetch
    );

    sendJson(response, 200, {
      leads: candidates.map(sanitizePreviewLead)
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

    const { imported, duplicateCount } = importExternalLeads(store, selectedLeads);
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
      createdAt: new Date().toISOString()
    };

    store.leads.unshift(lead);
    appendActivity(
      store,
      lead.id,
      "Lead added",
      `${lead.company} was added from ${lead.source} and automatically checked for KL / Selangor priority.`
    );
    writeStore(store);
    sendJson(response, 201, { lead: enrichLead(lead) });
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
        `${lead.company} received a live email send to ${lead.email}.`
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
        `${lead.company} email send failed: ${failureMessage}`
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

  const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)\/(status|sent|crm)$/);
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
      appendActivity(store, lead.id, "Lead status updated", `${lead.company} is now marked as ${lead.status}.`);
      autoSendQualifiedLead(store, lead);
    }

    if (action === "sent" && request.method === "PATCH") {
      if (!lead.sent) {
        lead.sent = true;
        lead.sentAt = new Date().toISOString();
        lead.emailStatus = "sent";
        lead.emailLastError = "";
        lead.emailLastAttemptAt = lead.sentAt;
        appendActivity(store, lead.id, "Outreach marked as sent", `${lead.company} was added to the sent email list.`);
      }
    }

    if (action === "crm" && request.method === "PATCH") {
      if (!lead.crmLogged) {
        await pushLeadToBigin(store, lead, biginFetch);
        appendActivity(store, lead.id, "Logged to CRM", `${lead.company} was marked as logged in the CRM.`);
      } else if (lead.bigin && lead.bigin.dealId) {
        appendActivity(store, lead.id, "CRM sync skipped", `${lead.company} already has an existing Bigin deal.`);
      }
    }

    writeStore(store);
    sendJson(response, 200, { lead: enrichLead(lead) });
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
      `${removedLead.company} was removed from the queue.`
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
        const store = readStore();

        if (url.searchParams.get("state") === "bigin-connect" && url.searchParams.get("code")) {
          try {
            await exchangeBiginAuthorizationCode(request, store, url.searchParams.get("code"));
            response.writeHead(302, { Location: "/?bigin=connected" });
            response.end();
            return;
          } catch (error) {
            const failureUrl = `/?bigin=error&message=${encodeURIComponent(error.message || "Authorization failed")}`;
            response.writeHead(302, { Location: failureUrl });
            response.end();
            return;
          }
        }

        const params = url.searchParams.toString();
        const destination = params ? `/?${params}` : "/";
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

      const target = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
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
  startServer().then(() => {
    process.stdout.write(`Lead automation app running on http://localhost:${PORT}\n`);
  });
}

module.exports = { createAppServer, startServer };






