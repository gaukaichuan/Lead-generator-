const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const DATA_PATH = path.join(__dirname, "data", "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const EXPORT_DIR = path.join(__dirname, "exports");

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
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
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

  const allPlaces = [];
  let pageToken = "";

  do {
    const searchResponse = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.primaryType,places.websiteUri,places.location,nextPageToken"
      },
      body: JSON.stringify({
        textQuery: String(query || "").trim() || "businesses",
        pageToken,
        maxResultCount: 20,
        regionCode: "MY",
        languageCode: "en",
        rankPreference: "DISTANCE",
        locationRestriction: {
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

    const searchPayload = await readJsonResponse(searchResponse);
    const places = Array.isArray(searchPayload.places) ? searchPayload.places : [];
    allPlaces.push(...places);
    pageToken = searchPayload.nextPageToken || "";
  } while (pageToken && allPlaces.length < 60);

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
          distanceKm !== null ? `Distance: ${distanceKm.toFixed(1)} km` : "",
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
    distanceKm: lead.distanceKm ?? null
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
  appendActivity(
    store,
    lead.id,
    "Outreach auto-sent",
    `${lead.company} was automatically moved to the sent email list after being manually marked as qualified.`
  );
}

async function handleApi(request, response, pathname, options = {}) {
  const store = readStore();
  const googlePlacesFetch = options.googlePlacesFetch || fetch;

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
    const leads = sortLeads(store.leads).filter((lead) => lead.sent);
    sendExcel(
      response,
      "sent-email-export.csv",
      ["Company", "Contact", "Email", "Region", "Source", "Sent Time"],
      leads.map((lead) => [
        lead.company,
        lead.contactName,
        lead.email,
        lead.region,
        lead.source,
        lead.sentAt || "Marked sent"
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
      const leads = sortLeads(store.leads).filter((lead) => lead.sent);
      const filePath = saveExcelFile(
        `sent-email-export-${timestamp}.csv`,
        ["Company", "Contact", "Email", "Region", "Source", "Sent Time"],
        leads.map((lead) => [
          lead.company,
          lead.contactName,
          lead.email,
          lead.region,
          lead.source,
          lead.sentAt || "Marked sent"
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
        appendActivity(store, lead.id, "Outreach marked as sent", `${lead.company} was added to the sent email list.`);
      }
    }

    if (action === "crm" && request.method === "PATCH") {
      if (!lead.crmLogged) {
        lead.crmLogged = true;
        appendActivity(store, lead.id, "Logged to CRM", `${lead.company} was marked as logged in the CRM.`);
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

      const target = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
      sendFile(response, target);
    } catch (error) {
      sendJson(response, 500, { error: "Server error" });
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



