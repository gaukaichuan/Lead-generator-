const state = {
  leads: [],
  activities: [],
  selectedLeadId: null,
  activeWorkspace: "overview",
  activeExportView: null,
  emailActivityFilter: "all",
  queueProductFilter: "all",
  queuePage: 1,
  activeEmailLeadId: null,
  selectedQueueLeadIds: new Set(),
  currentLocation: null,
  isResolvingLocation: false,
  googleMapsResults: [],
  selectedGoogleMapsResults: new Set(),
  emailDrafts: {},
  settingsReturnPanel: "home",
  senderName: "Your Name",
  senderEmail: "sales@example.com",
  emailTemplateSubject: "{{productName}} idea for {{company}}",
  emailTemplateBody: [
    "Hi {{contactName}},",
    "",
    "I came across {{company}} while reviewing businesses from {{source}} in {{region}}.",
    "Based on your setup in {{industry}}, I believe {{productName}} could be a strong fit.",
    "",
    "{{pitch}}",
    "",
    "The main opportunity I see is around {{reason}}.",
    "",
    "If helpful, I can walk you through a short demo based on your current workflow.",
    "",
    "Best,",
    "{{senderName}}",
    "{{senderEmail}}"
  ].join("\n")
};

const body = document.body;
const QUEUE_PAGE_SIZE = 5;
const SENDER_SETTINGS_KEY = "lead-generator-sender-settings";
const THEME_SETTINGS_KEY = "lead-generator-theme-mode";

const leadForm = document.getElementById("leadForm");
const googleMapsImportForm = document.getElementById("googleMapsImportForm");
const googleMapsImportButton = document.getElementById("googleMapsImportButton");
const googleMapsRadiusInput = document.getElementById("googleMapsRadiusInput");
const googleMapsRadiusValue = document.getElementById("googleMapsRadiusValue");
const googleMapsQueryInput = document.getElementById("googleMapsQueryInput");
const googleMapsLatitudeInput = document.getElementById("googleMapsLatitudeInput");
const googleMapsLongitudeInput = document.getElementById("googleMapsLongitudeInput");
const retryLiveLocationButton = document.getElementById("retryLiveLocationButton");
const locationStatusTitle = document.getElementById("locationStatusTitle");
const locationStatusMessage = document.getElementById("locationStatusMessage");
const googleMapsResultsModal = document.getElementById("googleMapsResultsModal");
const closeGoogleMapsResultsModal = document.getElementById("closeGoogleMapsResultsModal");
const googleMapsResultsList = document.getElementById("googleMapsResultsList");
const googleMapsResultsSummary = document.getElementById("googleMapsResultsSummary");
const googleMapsResultsEmpty = document.getElementById("googleMapsResultsEmpty");
const selectAllGoogleMapsResults = document.getElementById("selectAllGoogleMapsResults");
const clearGoogleMapsResults = document.getElementById("clearGoogleMapsResults");
const importSelectedGoogleMapsResults = document.getElementById("importSelectedGoogleMapsResults");
const inlineGoogleMapsResultsPanel = document.getElementById("inlineGoogleMapsResultsPanel");
const inlineGoogleMapsResultsList = document.getElementById("inlineGoogleMapsResultsList");
const inlineGoogleMapsResultsSummary = document.getElementById("inlineGoogleMapsResultsSummary");
const inlineGoogleMapsResultsEmpty = document.getElementById("inlineGoogleMapsResultsEmpty");
const inlineSelectAllGoogleMapsResults = document.getElementById("inlineSelectAllGoogleMapsResults");
const inlineClearGoogleMapsResults = document.getElementById("inlineClearGoogleMapsResults");
const inlineImportSelectedGoogleMapsResults = document.getElementById("inlineImportSelectedGoogleMapsResults");
const loadDemoLeadsButton = document.getElementById("loadDemoLeads");
const refreshLeadsButton = document.getElementById("refreshLeads");
const searchInput = document.getElementById("searchInput");
const queueProductFilter = document.getElementById("queueProductFilter");
const leadList = document.getElementById("leadList");
const queueBulkSummary = document.getElementById("queueBulkSummary");
const selectVisibleQueueLeads = document.getElementById("selectVisibleQueueLeads");
const clearSelectedQueueLeads = document.getElementById("clearSelectedQueueLeads");
const openBulkEmailComposer = document.getElementById("openBulkEmailComposer");
const previousQueuePage = document.getElementById("previousQueuePage");
const nextQueuePage = document.getElementById("nextQueuePage");
const queuePageIndicator = document.getElementById("queuePageIndicator");
const workspaceTabs = Array.from(document.querySelectorAll("[data-workspace]"));
const workspaceOverview = document.getElementById("workspaceOverview");
const workspaceIntake = document.getElementById("workspaceIntake");
const workspaceQueue = document.getElementById("workspaceQueue");
const workspaceExport = document.getElementById("workspaceExport");
const pageEyebrow = document.getElementById("pageEyebrow");
const pageTitle = document.getElementById("pageTitle");
const pageDescription = document.getElementById("pageDescription");
const leadDetailModal = document.getElementById("leadDetailModal");
const closeLeadDetailModal = document.getElementById("closeLeadDetailModal");
const detailTitle = document.getElementById("detailTitle");
const detailBadge = document.getElementById("detailBadge");
const detailStatusStrip = document.getElementById("detailStatusStrip");
const detailCard = document.getElementById("detailCard");
const crmErrorModal = document.getElementById("crmErrorModal");
const closeCrmErrorModal = document.getElementById("closeCrmErrorModal");
const crmErrorMessage = document.getElementById("crmErrorMessage");

const metricTotal = document.getElementById("metricTotal");
const metricTotalTrend = document.getElementById("metricTotalTrend");
const metricManual = document.getElementById("metricManual");
const metricManualTrend = document.getElementById("metricManualTrend");
const metricMaps = document.getElementById("metricMaps");
const metricMapsTrend = document.getElementById("metricMapsTrend");
const metricRegions = document.getElementById("metricRegions");
const metricRegionsTrend = document.getElementById("metricRegionsTrend");

const openSettingsDrawerButton = document.getElementById("openSettingsDrawer");
const closeSettingsDrawerButton = document.getElementById("closeSettingsDrawer");
const settingsDrawerShell = document.getElementById("settingsDrawerShell");
const settingsDrawerOverlay = document.getElementById("settingsDrawerOverlay");
const settingsDrawer = document.getElementById("settingsDrawer");
const settingsDrawerTitle = document.getElementById("settingsDrawerTitle");
const settingsHomePanel = document.getElementById("settingsHomePanel");
const settingsEmailPanel = document.getElementById("settingsEmailPanel");
const openEmailSettingsPanel = document.getElementById("openEmailSettingsPanel");
const backToSettingsHome = document.getElementById("backToSettingsHome");
const modeToggle = document.getElementById("modeToggle");
const settingsCurrentSenderEmail = document.getElementById("settingsCurrentSenderEmail");
const senderDetailsModal = document.getElementById("senderDetailsModal");
const closeSenderDetailsModal = document.getElementById("closeSenderDetailsModal");
const cancelSenderDetails = document.getElementById("cancelSenderDetails");
const senderDetailsForm = document.getElementById("senderDetailsForm");
const templateEditorModal = document.getElementById("templateEditorModal");
const closeTemplateEditorModal = document.getElementById("closeTemplateEditorModal");
const cancelTemplateEditor = document.getElementById("cancelTemplateEditor");
const templateEditorForm = document.getElementById("templateEditorForm");
const openSenderDetailsModalButton = document.getElementById("openSenderDetailsModal");
const openTemplateEditorModalButton = document.getElementById("openTemplateEditorModal");
const senderNameInput = document.getElementById("senderNameInput");
const senderEmailInput = document.getElementById("senderEmailInput");
const emailTemplateSubjectInput = document.getElementById("emailTemplateSubjectInput");
const emailTemplateBodyInput = document.getElementById("emailTemplateBodyInput");
const senderEmailStatus = document.getElementById("senderEmailStatus");

const showExportQueue = null; // removed — outbound is now tab-based UI
const showExportEmailActivity = null; // removed — outbound is now tab-based UI
const exportPreviewPanel = null; // removed
const exportPreviewEyebrow = null; // removed
const exportPreviewTitle = null; // removed
const exportPreviewButton = null; // removed
const emailActivityFilterWrap = null; // removed
const emailActivityFilter = null; // removed
const exportQueueTable = null; // removed
const exportEmailTable = null; // removed
const exportQueueBody = null; // removed
const exportEmailBody = null; // removed
const exportPreviewEmpty = null; // removed
const exportSaveNote = null; // removed

const emailDetailModal = document.getElementById("emailDetailModal");
const closeEmailDetail = document.getElementById("closeEmailDetail");
const emailDetailTitle = document.getElementById("emailDetailTitle");
const emailDetailRecipient = document.getElementById("emailDetailRecipient");
const emailDetailSubject = document.getElementById("emailDetailSubject");
const emailDetailBody = document.getElementById("emailDetailBody");
const sendEmailDraft = document.getElementById("sendEmailDraft");
const resetEmailDraft = document.getElementById("resetEmailDraft");
const bulkEmailModal = document.getElementById("bulkEmailModal");
const closeBulkEmailModal = document.getElementById("closeBulkEmailModal");
const bulkEmailRecipients = document.getElementById("bulkEmailRecipients");
const bulkEmailSubject = document.getElementById("bulkEmailSubject");
const bulkEmailBody = document.getElementById("bulkEmailBody");
const sendBulkEmailDraft = document.getElementById("sendBulkEmailDraft");
const resetBulkEmailDraft = document.getElementById("resetBulkEmailDraft");
const notificationCenter = document.getElementById("notificationCenter");
const overviewLeadCount = document.getElementById("overviewLeadCount");
const overviewPriorityCount = document.getElementById("overviewPriorityCount");
const overviewLeadTable = document.getElementById("overviewLeadTable");
const overviewActivityList = document.getElementById("overviewActivityList");
const biginConnectGate = document.getElementById("biginConnectGate");
const biginConnectMessage = document.getElementById("biginConnectMessage");
const connectBiginButton = document.getElementById("connectBiginButton");
const retryBiginStatusButton = document.getElementById("retryBiginStatusButton");
const appShell = document.getElementById("appShell");

const demoLeadTemplates = [
  {
    companyPrefix: "Auto Parts Trading",
    contactName: "Melissa Ong",
    phone: "+60 12-328 4419",
    role: "Operations Manager",
    industry: "Wholesale distribution",
    region: "Petaling Jaya",
    companyType: "wholesale",
    painPoint: "stock-visibility",
    source: "Google Maps",
    notes: "Sales team takes orders by phone and often confirms stock manually before closing deals."
  },
  {
    companyPrefix: "Fresh Hub",
    contactName: "Jason Lee",
    phone: "+60 3-3342 1188",
    role: "Warehouse Supervisor",
    industry: "Cold-chain warehouse",
    region: "Klang",
    companyType: "warehouse",
    painPoint: "warehouse-control",
    source: "Google Maps",
    notes: "Warehouse team has receiving, picking, and bin tracking issues during peak hours."
  },
  {
    companyPrefix: "Fashion House",
    contactName: "Aina Rahman",
    phone: "+60 3-2143 5602",
    role: "Store Director",
    industry: "Retail fashion",
    region: "Kuala Lumpur",
    companyType: "retail",
    painPoint: "checkout-pos",
    source: "Google Maps",
    notes: "Two outlets are running separate cashier workflows and daily sales consolidation is slow."
  },
  {
    companyPrefix: "Creative Print",
    contactName: "Farid Tan",
    phone: "",
    role: "Finance Lead",
    industry: "Commercial printing",
    region: "Subang Jaya",
    companyType: "manufacturing",
    painPoint: "manual-accounting",
    source: "LinkedIn",
    notes: "Finance reports are still compiled manually at month end and stock cost tracking is inconsistent."
  },
  {
    companyPrefix: "Wellness Group",
    contactName: "Nur Sofia",
    phone: "",
    role: "HR Admin",
    industry: "Healthcare services",
    region: "Johor Bahru",
    companyType: "service",
    painPoint: "payroll-compliance",
    source: "LinkedIn",
    notes: "Outside the priority area but still a possible payroll opportunity."
  },
  {
    companyPrefix: "Home Living",
    contactName: "Daniel Wong",
    phone: "+60 3-5524 8891",
    role: "Retail Operations Lead",
    industry: "Furniture retail",
    region: "Shah Alam",
    companyType: "retail",
    painPoint: "checkout-pos",
    source: "Google Maps",
    notes: "Branch sales are active, but stock sync and cashier consolidation are still handled manually."
  },
  {
    companyPrefix: "Parts Network",
    contactName: "Kelvin Lim",
    phone: "+60 12-611 8044",
    role: "Sales Manager",
    industry: "Industrial parts distribution",
    region: "Puchong",
    companyType: "wholesale",
    painPoint: "stock-visibility",
    source: "Directory",
    notes: "Sales reps need live stock checks before committing delivery dates to dealers."
  },
  {
    companyPrefix: "Family Clinic Group",
    contactName: "Siti Hajar",
    phone: "+60 3-4266 7201",
    role: "HR Executive",
    industry: "Clinic services",
    region: "Ampang",
    companyType: "service",
    painPoint: "payroll-compliance",
    source: "LinkedIn",
    notes: "The team is growing across multiple clinics and payroll administration is getting harder to control."
  },
  {
    companyPrefix: "Precision Works",
    contactName: "Marcus Yap",
    phone: "+60 3-8734 5518",
    role: "Finance Manager",
    industry: "Light manufacturing",
    region: "Kajang",
    companyType: "manufacturing",
    painPoint: "manual-accounting",
    source: "Manual research",
    notes: "Month-end reports and costing are still consolidated from spreadsheets."
  },
  {
    companyPrefix: "Fulfillment Point",
    contactName: "Nadia Ariff",
    phone: "+60 3-8322 1940",
    role: "Warehouse Admin",
    industry: "Ecommerce fulfillment",
    region: "Other",
    companyType: "warehouse",
    painPoint: "warehouse-control",
    source: "Referral",
    notes: "The warehouse has outgrown manual picking sheets and wants clearer inventory movement control."
  }
];

function createDemoLeads(existingCount, batchSize = 5) {
  return Array.from({ length: batchSize }, (_, index) => {
    const sequence = existingCount + index + 1;
    const template = demoLeadTemplates[(sequence - 1) % demoLeadTemplates.length];
    const label = `Demo ${sequence}`;
    const companySlug = `${template.companyPrefix}-${sequence}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    return {
      company: `${label} ${template.companyPrefix}`,
      contactName: template.contactName,
      email: `${companySlug}@demo.local`,
      phone: template.phone,
      role: template.role,
      industry: template.industry,
      region: template.region,
      companyType: template.companyType,
      painPoint: template.painPoint,
      source: template.source,
      status: "new",
      notes: template.notes
    };
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    let message = "Request failed";
    let payload = null;
    try {
      payload = await response.json();
      message = payload.error || message;
    } catch (error) {
      // Keep the fallback error when the response is not JSON.
    }
    const requestError = new Error(message);
    requestError.payload = payload;
    requestError.status = response.status;
    throw requestError;
  }

  return response.json();
}

function setLocationStatus(title, message, mode = "idle") {
  locationStatusTitle.textContent = title;
  locationStatusMessage.textContent = message;
  locationStatusTitle.dataset.mode = mode;
}

function syncLocationInputs() {
  googleMapsLatitudeInput.value = state.currentLocation ? String(state.currentLocation.latitude) : "";
  googleMapsLongitudeInput.value = state.currentLocation ? String(state.currentLocation.longitude) : "";
}

function updateLocationUi() {
  syncLocationInputs();
  if (!state.currentLocation) {
    setLocationStatus(
      "Waiting for location",
      "Allow browser location access so the import only keeps leads near your current position. If the browser blocks it, enable device location services and try again.",
      "idle"
    );
    return;
  }

  setLocationStatus(
    "Location locked",
    `Using your live location at ${state.currentLocation.latitude.toFixed(4)}, ${state.currentLocation.longitude.toFixed(4)}.`,
    "ready"
  );
}

function updateRadiusDisplay() {
  if (!googleMapsRadiusValue || !googleMapsRadiusInput) {
    return;
  }

  const radiusKm = Number(googleMapsRadiusInput.value) || 15;
  googleMapsRadiusValue.textContent = `${radiusKm} KM`;
}

function readLiveLocation() {
  if (!navigator.geolocation) {
    throw new Error("This browser does not support live location access.");
  }

  if (state.isResolvingLocation) {
    return Promise.resolve(state.currentLocation);
  }

  state.isResolvingLocation = true;

  setLocationStatus("Checking your location", "Waiting for browser permission so the radius filter can run.", "loading");

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        state.isResolvingLocation = false;
        updateLocationUi();
        resolve(state.currentLocation);
      },
      () => {
        state.currentLocation = null;
        state.isResolvingLocation = false;
        updateLocationUi();
        reject(new Error("Location access is required for Google Maps radius filtering. Turn on device location services, allow this browser to use your location, and try again."));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 300000
      }
    );
  });
}

async function ensureLiveLocation() {
  if (state.currentLocation) {
    return state.currentLocation;
  }

  return readLiveLocation();
}

function loadSenderSettings() {
  try {
    const raw = window.localStorage.getItem(SENDER_SETTINGS_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    state.senderName = parsed.senderName || state.senderName;
    state.senderEmail = parsed.senderEmail || state.senderEmail;
    state.emailTemplateSubject = parsed.emailTemplateSubject || state.emailTemplateSubject;
    state.emailTemplateBody = parsed.emailTemplateBody || state.emailTemplateBody;
  } catch (error) {
    // Keep defaults if browser storage is unavailable or malformed.
  }
}

function saveSenderSettings() {
  window.localStorage.setItem(
    SENDER_SETTINGS_KEY,
    JSON.stringify({
      senderName: state.senderName,
      senderEmail: state.senderEmail,
      emailTemplateSubject: state.emailTemplateSubject,
      emailTemplateBody: state.emailTemplateBody
    })
  );
}

function loadThemeMode() {
  try {
    const raw = window.localStorage.getItem(THEME_SETTINGS_KEY);
    if (raw === "dark") {
      body.classList.add("dark-mode");
    }
  } catch (error) {
    // Keep the default theme when browser storage is unavailable.
  }
}

function saveThemeMode() {
  try {
    window.localStorage.setItem(THEME_SETTINGS_KEY, body.classList.contains("dark-mode") ? "dark" : "light");
  } catch (error) {
    // Ignore storage failures and keep the in-memory theme change.
  }
}

function renderSenderSettings() {
  senderNameInput.value = state.senderName;
  senderEmailInput.value = state.senderEmail;
  emailTemplateSubjectInput.value = state.emailTemplateSubject;
  emailTemplateBodyInput.value = state.emailTemplateBody;
  senderEmailStatus.textContent = `Current sender: ${state.senderName} <${state.senderEmail}>. New and refreshed drafts will use the saved template.`;
  settingsCurrentSenderEmail.textContent = state.senderEmail;
}

function setSettingsPanel(panelName) {
  const showingEmail = panelName === "email";
  settingsHomePanel.classList.toggle("active", !showingEmail);
  settingsEmailPanel.classList.toggle("active", showingEmail);
  settingsDrawerTitle.textContent = showingEmail ? "Email Setup" : "Settings";
}

function openSettingsDrawer() {
  setSettingsPanel(state.settingsReturnPanel || "home");
  settingsDrawerShell.hidden = false;
  settingsDrawer.setAttribute("aria-hidden", "false");
  syncBodyLock();
}

function closeSettingsDrawer({ resetPanel = true } = {}) {
  settingsDrawerShell.hidden = true;
  settingsDrawer.setAttribute("aria-hidden", "true");
  if (resetPanel) {
    state.settingsReturnPanel = "home";
    setSettingsPanel("home");
  }
  syncBodyLock();
}

function openModal(modalElement) {
  modalElement.hidden = false;
  syncBodyLock();
}

function closeModal(modalElement) {
  modalElement.hidden = true;
  syncBodyLock();
}

function toggleThemeMode() {
  body.classList.toggle("dark-mode");
  saveThemeMode();
}

function openSettingsEditorModal(modalElement) {
  state.settingsReturnPanel = "email";
  closeSettingsDrawer({ resetPanel: false });
  openModal(modalElement);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function selectedLead() {
  return state.leads.find((lead) => lead.id === state.selectedLeadId) || null;
}

function getFilteredLeads() {
  const query = searchInput.value.trim().toLowerCase();
  return state.leads.filter((lead) => {
    if (state.queueProductFilter !== "all" && lead.recommendation.productName !== state.queueProductFilter) {
      return false;
    }
    const searchable = [
      lead.company,
      lead.contactName,
      lead.region,
      lead.source,
      lead.recommendation.productName,
      lead.industry
    ].join(" ").toLowerCase();
    return searchable.includes(query);
  });
}

function getQueueLeads() {
  const filtered = getFilteredLeads();
  const start = (state.queuePage - 1) * QUEUE_PAGE_SIZE;
  return filtered.slice(start, start + QUEUE_PAGE_SIZE);
}

function getQueuePageCount() {
  return Math.max(1, Math.ceil(getFilteredLeads().length / QUEUE_PAGE_SIZE));
}

function clampQueuePage() {
  state.queuePage = Math.min(Math.max(state.queuePage, 1), getQueuePageCount());
}

function selectedQueueLeads() {
  return state.leads.filter((lead) => state.selectedQueueLeadIds.has(lead.id));
}

function showNotification(title, message) {
  const card = document.createElement("article");
  card.className = "notification-card";
  card.innerHTML = `
    <strong>${title}</strong>
    <p>${message}</p>
  `;
  notificationCenter.prepend(card);

  window.setTimeout(() => {
    card.remove();
  }, 3200);
}

function showCrmErrorDetails(message) {
  crmErrorMessage.textContent = message || "No CRM error details were captured.";
  openModal(crmErrorModal);
}

function googleMapsResultKey(lead) {
  return lead.externalRef || `${lead.company}-${lead.phone}-${lead.region}`;
}

function createGoogleMapsResultCard(lead, key) {
  const card = document.createElement("article");
  card.className = "google-result-card";
  card.innerHTML = `
    <input class="google-result-checkbox" type="checkbox" ${state.selectedGoogleMapsResults.has(key) ? "checked" : ""}>
    <div class="google-result-copy">
      <div class="google-result-top">
        <strong>${lead.company}</strong>
        <span class="mini-tag">${lead.distanceKm !== null && lead.distanceKm !== undefined ? `${lead.distanceKm.toFixed(1)} km` : "Nearby"}</span>
      </div>
      <p>${lead.notes || "Imported from Google Maps."}</p>
      <div class="google-result-meta">
        <span>${lead.phone || "No phone"}</span>
        <span>${lead.website || "No website"}</span>
      </div>
      <label class="google-result-email-field">
        <span>Company Email</span>
        <input class="google-result-email-input" type="email" placeholder="Auto-detected from website (editable)" value="${lead.email || ""}">
      </label>
      <span class="google-result-recommendation">${lead.recommendation?.productName || lead.recommendedProduct || "Recommendation pending"}</span>
    </div>
  `;

  const checkbox = card.querySelector(".google-result-checkbox");
  const emailInput = card.querySelector(".google-result-email-input");
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.selectedGoogleMapsResults.add(key);
    } else {
      state.selectedGoogleMapsResults.delete(key);
    }
    renderGoogleMapsResultsModal();
  });

  emailInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  emailInput.addEventListener("input", () => {
    lead.email = emailInput.value.trim();
  });

  return card;
}

function setGoogleMapsImportButtonsState(disabled, text) {
  [importSelectedGoogleMapsResults, inlineImportSelectedGoogleMapsResults].filter(Boolean).forEach((button) => {
    button.disabled = disabled;
    if (text) {
      button.textContent = text;
    }
  });
}

function renderGoogleMapsResultsModal() {
  const targets = [
    {
      panel: inlineGoogleMapsResultsPanel,
      list: inlineGoogleMapsResultsList,
      summary: inlineGoogleMapsResultsSummary,
      empty: inlineGoogleMapsResultsEmpty
    },
    {
      panel: null,
      list: googleMapsResultsList,
      summary: googleMapsResultsSummary,
      empty: googleMapsResultsEmpty
    }
  ].filter((target) => target.list && target.summary && target.empty);

  const selectedCount = state.selectedGoogleMapsResults.size;
  const totalCount = state.googleMapsResults.length;

  targets.forEach((target) => {
    if (target.panel) {
      target.panel.hidden = false;
    }
    target.list.innerHTML = "";
    target.summary.textContent = `${totalCount} nearby business${totalCount === 1 ? "" : "es"} found. ${selectedCount} selected for import.`;
    target.empty.hidden = totalCount > 0;
  });

  setGoogleMapsImportButtonsState(selectedCount === 0, null);

  state.googleMapsResults.forEach((lead) => {
    const key = googleMapsResultKey(lead);
    targets.forEach((target) => {
      target.list.appendChild(createGoogleMapsResultCard(lead, key));
    });
  });
}

const workspaceMeta = {
  overview: {
    eyebrow: "Overview",
    title: "Lead Operations Dashboard",
    description: "Track intake, qualification, outreach, and CRM follow-up from one workspace."
  },
  intake: {
    eyebrow: "Inbound Scanner",
    title: "Capture New Leads",
    description: "Add lead details, source, area, and business pain points before they enter the queue."
  },
  queue: {
    eyebrow: "CRM Manager",
    title: "Lead Queue and Qualification",
    description: "Review the active pipeline, mark qualified leads, and keep CRM actions visible."
  },
  export: {
    eyebrow: "Outbound Tools",
    title: "Email Activity and Export",
    description: "Review sent outreach and export queue or email records for reporting."
  }
};

function renderPageHeader() {
  const meta = workspaceMeta[state.activeWorkspace] || workspaceMeta.overview;
  pageEyebrow.textContent = meta.eyebrow;
  pageTitle.textContent = meta.title;
  if (pageDescription) pageDescription.textContent = meta.description;
}

function renderWorkspace() {
  workspaceOverview.hidden = state.activeWorkspace !== "overview";
  workspaceIntake.hidden = state.activeWorkspace !== "intake";
  workspaceQueue.hidden = state.activeWorkspace !== "queue";
  workspaceExport.hidden = state.activeWorkspace !== "export";

  workspaceTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.workspace === state.activeWorkspace);
  });

  renderPageHeader();
}

function getSentLeads() {
  return state.leads.filter((lead) => lead.sent);
}

function getEmailActivityLeads() {
  return state.leads.filter((lead) => lead.emailStatus === "sent" || lead.emailStatus === "failed").filter((lead) => {
    if (state.emailActivityFilter === "all") {
      return true;
    }

    return lead.emailStatus === state.emailActivityFilter;
  });
}

function formatEmailStatus(status) {
  if (status === "sent") {
    return "Sent";
  }

  if (status === "failed") {
    return "Failed";
  }

  return "Pending";
}

function renderQueueProductFilter() {
  const currentValue = state.queueProductFilter;
  const options = ["all", ...new Set(state.leads.map((lead) => lead.recommendation.productName).filter(Boolean))];
  queueProductFilter.innerHTML = "";
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option === "all" ? "All products" : option;
    queueProductFilter.appendChild(node);
  });
  if (options.includes(currentValue)) {
    queueProductFilter.value = currentValue;
  } else {
    state.queueProductFilter = "all";
    queueProductFilter.value = "all";
  }
}

function applyTemplate(template, lead) {
  const replacements = {
    contactName: lead.contactName || "there",
    company: lead.company || "your business",
    source: lead.source || "manual research",
    region: lead.region || "your market",
    industry: lead.industry || "your industry",
    productName: lead.recommendation.productName,
    pitch: lead.recommendation.pitch,
    reason: lead.recommendation.reason,
    senderName: state.senderName,
    senderEmail: state.senderEmail
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] || "");
}

function buildEmailContent(lead) {
  const subject = applyTemplate(state.emailTemplateSubject, lead).trim();
  const body = applyTemplate(state.emailTemplateBody, lead).trim();

  return { subject, body };
}

function getEmailDraft(lead) {
  if (!state.emailDrafts[lead.id]) {
    state.emailDrafts[lead.id] = buildEmailContent(lead);
  }

  return state.emailDrafts[lead.id];
}

function openEmailEditor(lead) {
  const draft = getEmailDraft(lead);
  state.activeEmailLeadId = lead.id;
  leadDetailModal.hidden = true;
  emailDetailTitle.textContent = lead.company;
  emailDetailRecipient.textContent = lead.email || "No recipient email stored";
  emailDetailSubject.value = draft.subject;
  emailDetailBody.value = draft.body;
  emailDetailModal.hidden = false;
  syncBodyLock();
}

async function sendActiveEmailDraft() {
  if (!state.activeEmailLeadId) {
    return;
  }

  const lead = state.leads.find((item) => item.id === state.activeEmailLeadId);
  if (!lead) {
    showNotification("Send failed", "The selected lead could not be found.");
    return;
  }

  if (!lead.email) {
    showNotification("Send failed", "This lead does not have a recipient email address yet.");
    return;
  }

  const subject = emailDetailSubject.value.trim();
  const bodyText = emailDetailBody.value.trim();
  if (!subject || !bodyText) {
    showNotification("Send failed", "Subject and message are required before sending.");
    return;
  }

  sendEmailDraft.disabled = true;
  sendEmailDraft.textContent = "Sending...";

  try {
    await request(`/api/leads/${lead.id}/send-email`, {
      method: "POST",
      body: JSON.stringify({
        senderName: state.senderName,
        senderEmail: state.senderEmail,
        subject,
        body: bodyText
      })
    });

    state.emailDrafts[lead.id] = {
      subject,
      body: bodyText
    };
    showNotification("Email sent", `Message sent to ${lead.email}.`);
    await loadLeads();
    emailDetailModal.hidden = false;
    syncBodyLock();
  } catch (error) {
    console.error("EMAIL_SEND_DEBUG", {
      leadId: lead.id,
      company: lead.company,
      recipient: lead.email,
      senderName: state.senderName,
      senderEmail: state.senderEmail,
      status: error.status || null,
      serverDebug: error.payload?.debug || null,
      message: error.message || "The email could not be sent."
    });
    showNotification("Send failed", error.message || "The email could not be sent.");
  } finally {
    sendEmailDraft.disabled = false;
    sendEmailDraft.textContent = "Send Email";
  }
}

function renderMetrics(summary) {
  const manualCount = state.leads.filter(l => l.source === "Manual Entry" || l.source === "Manual research").length;
  const mapsCount = state.leads.filter(l => l.source === "Google Maps").length;
  const uniqueRegions = [...new Set(state.leads.map(l => l.region).filter(Boolean))].length;

  metricTotal.textContent = String(summary.totalLeads);
  metricManual.textContent = String(manualCount);
  metricMaps.textContent = String(mapsCount);
  metricRegions.textContent = String(uniqueRegions);

  metricTotalTrend.textContent = summary.totalLeads > 0 ? `▲ ${summary.totalLeads} total` : "— none yet";
  metricManualTrend.textContent = manualCount > 0 ? `▲ ${manualCount} added` : "— none yet";
  metricMapsTrend.textContent = mapsCount > 0 ? `▲ ${mapsCount} found` : "— none yet";
  metricRegionsTrend.textContent = uniqueRegions > 0 ? `▲ ${uniqueRegions} covered` : "— none yet";

  overviewLeadCount.textContent = `${summary.totalLeads} active lead${summary.totalLeads === 1 ? "" : "s"}`;
  overviewPriorityCount.textContent = `${summary.priorityLeads} in priority market`;
}

function renderOverview() {
  overviewLeadTable.innerHTML = "";
  overviewActivityList.innerHTML = "";

  const recentLeads = state.leads.slice(0, 5);
  const recentActivities = state.activities.slice(0, 4);

  if (!recentLeads.length) {
    overviewLeadTable.innerHTML = '<p class="empty-state">No leads yet. Add one from Inbound Scanner or load demo data.</p>';
  } else {
    recentLeads.forEach((lead) => {
      const row = document.createElement("article");
      row.className = "mini-row";
      row.innerHTML = `
        <div class="mini-row-copy">
          <strong>${lead.company}</strong>
          <span>${lead.contactName} | ${lead.region}</span>
          <span class="mini-row-meta">${lead.source} | ${lead.status}</span>
        </div>
        <div class="mini-row-side">
          <span class="mini-tag">${lead.recommendation.productName}</span>
          <span class="mini-time">${formatDate(lead.createdAt)}</span>
        </div>
      `;
      overviewLeadTable.appendChild(row);
    });
  }

  if (!recentActivities.length) {
    overviewActivityList.innerHTML = '<p class="empty-state">Recent actions will appear here once the team starts working leads.</p>';
  } else {
    recentActivities.forEach((activity) => {
      const card = document.createElement("article");
      card.className = "overview-activity-card";
      card.innerHTML = `
        <div class="overview-activity-top">
          <strong>${activity.title}</strong>
          <span class="mini-tag">${formatDate(activity.createdAt)}</span>
        </div>
        <p>${activity.body}</p>
      `;
      overviewActivityList.appendChild(card);
    });
  }
}

function renderLeadList() {
  clampQueuePage();
  const filtered = getQueueLeads();
  leadList.innerHTML = "";

  filtered.forEach((lead) => {
    const card = document.createElement("article");
    card.className = `lead-card${lead.id === state.selectedLeadId ? " active" : ""}${lead.sent ? " sent-card" : ""}${lead.crmLogged ? " crm-card" : ""}`;
    const isSelected = state.selectedQueueLeadIds.has(lead.id);
    card.innerHTML = `
      <div class="lead-meta">
        <span class="pill">${lead.region}</span>
        <span class="pill">${lead.source}</span>
        ${lead.priorityArea ? '<span class="pill priority-pill">Priority</span>' : ""}
        ${lead.sent ? '<span class="pill sent-pill">Email Sent</span>' : ""}
        ${lead.crmLogged ? '<span class="pill crm-pill">CRM Logged</span>' : ""}
      </div>
      <div class="lead-card-header">
        <input class="lead-select" type="checkbox" ${isSelected ? "checked" : ""}>
        <h3>${lead.company}</h3>
      </div>
      <p>${lead.contactName} | ${lead.industry}</p>
      <p>Recommended: ${lead.recommendation.productName}</p>
      <p>Status: ${lead.status}</p>
    `;
    const checkbox = card.querySelector(".lead-select");
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedQueueLeadIds.add(lead.id);
      } else {
        state.selectedQueueLeadIds.delete(lead.id);
      }
      renderQueueBulkSummary();
    });
    card.addEventListener("click", () => {
      state.selectedLeadId = lead.id;
      renderLeadList();
      renderLeadDetail();
      leadDetailModal.hidden = false;
      syncBodyLock();
    });
    leadList.appendChild(card);
  });

  const pageCount = getQueuePageCount();
  queuePageIndicator.textContent = `Page ${state.queuePage} of ${pageCount}`;
  previousQueuePage.disabled = state.queuePage <= 1;
  nextQueuePage.disabled = state.queuePage >= pageCount;
  renderQueueBulkSummary();
}

function renderQueueBulkSummary() {
  const selected = selectedQueueLeads();
  const withEmail = selected.filter((lead) => String(lead.email || "").trim());
  queueBulkSummary.textContent = `${selected.length} selected (${withEmail.length} with email)`;
  openBulkEmailComposer.disabled = withEmail.length === 0;
}

function openBulkEmailModal() {
  const leadsWithEmail = selectedQueueLeads().filter((lead) => String(lead.email || "").trim());
  if (!leadsWithEmail.length) {
    showNotification("No recipients", "Select one or more leads with email addresses first.");
    return;
  }
  bulkEmailRecipients.textContent = leadsWithEmail.map((lead) => `${lead.company} <${lead.email}>`).join(", ");
  bulkEmailSubject.value = state.emailTemplateSubject;
  bulkEmailBody.value = state.emailTemplateBody;
  openModal(bulkEmailModal);
}

function closeBulkEmailEditor() {
  closeModal(bulkEmailModal);
}

async function sendBulkEmails() {
  const leadsWithEmail = selectedQueueLeads().filter((lead) => String(lead.email || "").trim());
  if (!leadsWithEmail.length) {
    showNotification("No recipients", "Select one or more leads with email addresses first.");
    return;
  }

  const subjectTemplate = bulkEmailSubject.value.trim();
  const bodyTemplate = bulkEmailBody.value.trim();
  if (!subjectTemplate || !bodyTemplate) {
    showNotification("Template missing", "Subject and message template are required.");
    return;
  }

  sendBulkEmailDraft.disabled = true;
  sendBulkEmailDraft.textContent = "Sending...";
  let successCount = 0;
  let failureCount = 0;

  for (const lead of leadsWithEmail) {
    try {
      await request(`/api/leads/${lead.id}/send-email`, {
        method: "POST",
        body: JSON.stringify({
          senderName: state.senderName,
          senderEmail: state.senderEmail,
          subject: applyTemplate(subjectTemplate, lead).trim(),
          body: applyTemplate(bodyTemplate, lead).trim()
        })
      });
      successCount += 1;
    } catch (error) {
      failureCount += 1;
    }
  }

  sendBulkEmailDraft.disabled = false;
  sendBulkEmailDraft.textContent = "Send Bulk Email";
  closeBulkEmailEditor();
  await loadLeads();
  showNotification("Bulk email completed", `${successCount} sent, ${failureCount} failed.`);
}

function fieldRow(icon, label, value, hasValue, isLink, tagClass) {
  const display = value || "Not stored";
  const empty = !hasValue;
  const check = hasValue ? `<span class="detail-check yes">✓</span>` : `<span class="detail-check no"></span>`;
  let valueHtml = `<span class="detail-value ${empty ? "empty" : ""}">${display}</span>`;
  if (isLink && value) {
    valueHtml = `<a class="detail-value link" href="${value}" target="_blank" rel="noreferrer">${value}</a>`;
  }
  if (tagClass && value) {
    valueHtml = `<span class="detail-value"><span class="${tagClass}">${display}</span></span>`;
  }
  return `<div class="detail-field-row">
    <span class="detail-field-icon">${icon}</span>
    <span class="detail-field-label">${label}</span>
    ${valueHtml}
    ${check}
  </div>`;
}

function renderLeadDetail() {
  const lead = selectedLead();

  if (!lead) {
    detailTitle.textContent = "Select a lead";
    detailBadge.textContent = "No lead selected";
    detailStatusStrip.innerHTML = "";
    detailCard.className = "detail-card";
    detailCard.innerHTML = "<p>Select a lead from the list to view its source, priority, and recommended system.</p>";
    return;
  }

  detailTitle.textContent = lead.company;
  detailBadge.textContent = lead.priorityArea ? "Priority area" : "Standard area";
  detailStatusStrip.innerHTML = `
    <span class="state-pill ${lead.status === "qualified" ? "state-qualified" : lead.status === "unqualified" ? "state-unqualified" : "state-new"}">${lead.status}</span>
    <span class="state-pill ${lead.sent ? "state-sent" : "state-pending"}">${lead.sent ? "Email Sent" : "Email Pending"}</span>
    <span class="state-pill ${lead.crmLogged ? "state-crm" : "state-pending"}">${lead.crmLogged ? "CRM Logged" : "CRM Pending"}</span>
  `;

  // Data completeness score
  const allFields = [lead.email, lead.phone, lead.website, lead.role, lead.source, lead.region !== "Other", lead.industry, lead.companyType];
  const filledCount = allFields.filter(f => f && f !== "N/A" && f !== "Not stored").length;
  const totalFields = allFields.length;
  const completenessPct = Math.round(filledCount / totalFields * 100);
  const scoreLevel = completenessPct < 40 ? "low" : completenessPct < 70 ? "mid" : "high";

  const initials = (lead.company || "").split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
  const industryLabel = lead.industry ? lead.industry.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "N/A";

  detailCard.className = "detail-card compact-detail";
  detailCard.innerHTML = `
    <div class="detail-compact-header">
      <div class="detail-avatar">${initials}</div>
      <div class="detail-header-info">
        <h3>${lead.company}</h3>
        <p class="detail-meta">Business Contact · ${lead.region}</p>
      </div>
      <span class="detail-status-pill">${lead.status}</span>
    </div>

    <div class="detail-score-bar">
      <span class="detail-score-label">Data</span>
      <div class="detail-score-track"><div class="detail-score-fill ${scoreLevel}" style="width:${completenessPct}%"></div></div>
      <span class="detail-score-pct ${scoreLevel}">${completenessPct}%</span>
    </div>

    <div class="detail-fields">
      ${fieldRow("", "Email", lead.email, false)}
      ${fieldRow("", "Phone", lead.phone, true)}
      ${fieldRow("", "Website", lead.website, false, true)}
      ${fieldRow("", "Role", lead.role, false)}
    </div>

    <div class="detail-section-label">Profile</div>
    <div class="detail-fields">
      ${fieldRow("🗺️", "Source", lead.source, true, false, "tag amber")}
      ${fieldRow("", "Region", lead.region, lead.region !== "Other", false, lead.region !== "Other" ? "tag purple" : "")}
      ${fieldRow("", "Industry", industryLabel, true)}
      ${fieldRow("", "B-Type", lead.companyTypeLabel || "N/A", !!lead.companyType)}
    </div>

    <div class="detail-section-label">Recommendation</div>
    <div class="detail-product-card">
      <h4>${lead.recommendation.productName}</h4>
      <p>${lead.recommendation.pitch}</p>
    </div>

    ${lead.notes ? `<div class="detail-notes-row"><strong>Notes</strong> — ${lead.notes}</div>` : ""}

    <div class="detail-actions">
      <button class="detail-btn primary" data-action="email"> Send Email</button>
      <button class="detail-btn" data-action="qualified">✓ Qualified</button>
      <button class="detail-btn danger" data-action="delete">🗑 Delete</button>
    </div>
  `;

  detailCard.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const action = button.dataset.action;
        if (action === "email") {
          openEmailEditor(lead);
          return;
        }

        if (action === "delete") {
          const shouldDelete = window.confirm(`Remove ${lead.company} from the lead queue?`);
          if (!shouldDelete) {
            return;
          }
          await request(`/api/leads/${lead.id}`, { method: "DELETE" });
          state.selectedLeadId = null;
          leadDetailModal.hidden = true;
          await loadLeads();
          showNotification("Lead removed", `${lead.company} was deleted from the lead queue.`);
          return;
        } else if (action === "sent") {
          await request(`/api/leads/${lead.id}/sent`, { method: "PATCH" });
          showNotification("Email sent", `${lead.company} was added to Email Activity.`);
        } else if (action === "crm") {
          await request(`/api/leads/${lead.id}/crm`, { method: "PATCH" });
          showNotification("CRM updated", `${lead.company} was logged to Bigin CRM.`);
        } else {
          await request(`/api/leads/${lead.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: action })
          });

          if (action === "qualified") {
            showNotification("Lead qualified", `${lead.company} is now qualified. Send the email separately when you're ready.`);
          } else {
            showNotification("Lead updated", `${lead.company} is now marked as ${action}.`);
          }
        }

        await loadLeads();
        leadDetailModal.hidden = false;
      } catch (error) {
        if (button.dataset.action === "crm") {
          showNotification("CRM sync failed", error.message || "This lead could not be pushed into Bigin.");
          showCrmErrorDetails(error.message || "This lead could not be pushed into Bigin.");
        } else {
          showNotification("Action failed", error.message || "This lead update could not be completed.");
        }
      }
    });
  });
}





// Stub — old export preview replaced by outbound tab-based UI (functionality pending)
function renderExportQueueTable() {}
function renderExportEmailTable() {}
function renderExportPreview() {}

async function saveExcelFile(type) {
  const body = {
    type,
    query: searchInput.value.trim()
  };
  return request("/api/export/save", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function exportUrlForType(type) {
  if (type === "leads") {
    const query = encodeURIComponent(searchInput.value.trim());
    return `/api/export/leads.csv${query ? `?query=${query}` : ""}`;
  }

  return "/api/export/sent.csv";
}

async function exportExcel(type, filename) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Excel-compatible CSV file",
            accept: {
              "text/csv": [".csv"]
            }
          }
        ]
      });

      const response = await fetch(exportUrlForType(type));
      if (!response.ok) {
        throw new Error("Export download failed");
      }

      const blob = await response.blob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();

      exportSaveNote.textContent = `Saved: ${handle.name}`;
      showNotification("Excel exported", `${filename} was saved to your chosen location.`);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        showNotification("Export cancelled", "No file was saved.");
        return;
      }
    }
  }

  const result = await saveExcelFile(type);
  exportSaveNote.textContent = `Saved: ${result.filePath}`;
  showNotification("Excel exported", `Saved to ${result.filePath}`);
}

function syncBodyLock() {
  const shouldLock =
    !leadDetailModal.hidden ||
    !emailDetailModal.hidden ||
    !bulkEmailModal.hidden ||
    !settingsDrawerShell.hidden ||
    !senderDetailsModal.hidden ||
    !templateEditorModal.hidden ||
    !crmErrorModal.hidden ||
    !googleMapsResultsModal.hidden ||
    !biginConnectGate.hidden;

  body.classList.toggle("modal-open", shouldLock);
}

function getBiginUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    status: params.get("bigin") || "",
    message: params.get("message") || ""
  };
}

function clearBiginUrlState() {
  const url = new URL(window.location.href);
  url.searchParams.delete("bigin");
  url.searchParams.delete("message");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function showBiginConnectGate(message) {
  biginConnectMessage.textContent =
    message || "Authorize Bigin once and the system will keep using the saved CRM refresh token automatically on later visits.";
  biginConnectGate.hidden = false;
  if (appShell) {
    appShell.hidden = true;
  }
  syncBodyLock();
}

function hideBiginConnectGate() {
  biginConnectGate.hidden = true;
  if (appShell) {
    appShell.hidden = false;
  }
  syncBodyLock();
}

async function checkBiginConnection() {
  const urlState = getBiginUrlState();

  try {
    const payload = await request("/api/integrations/bigin/status");

    if (payload.connected) {
      hideBiginConnectGate();
      if (urlState.status === "connected") {
        showNotification("CRM connected", "Zoho Bigin is ready and the workspace has been unlocked.");
      }
      if (urlState.status || urlState.message) {
        clearBiginUrlState();
      }
      return true;
    }

    const defaultMessage = "Connect Zoho Bigin before using the system. After the first login, the saved CRM refresh token will be reused automatically.";
    const errorMessage =
      urlState.status === "error" && urlState.message
        ? `Bigin authorization failed: ${urlState.message}`
        : defaultMessage;
    showBiginConnectGate(errorMessage);
    if (urlState.status || urlState.message) {
      clearBiginUrlState();
    }
    return false;
  } catch (error) {
    showBiginConnectGate(`Unable to check Bigin connection: ${error.message || "Unknown CRM status error"}`);
    return false;
  }
}

async function startApp() {
  const connected = await checkBiginConnection();
  if (!connected) {
    return;
  }

  await loadLeads();
  if (!state.currentLocation && !state.isResolvingLocation) {
    ensureLiveLocation().catch(() => {
      // Keep the UI passive until the user interacts with the import flow.
    });
  }
}

async function loadDemoLeads() {
  const existingKeys = new Set(
    state.leads.map((lead) => `${String(lead.company || "").trim().toLowerCase()}::${String(lead.email || "").trim().toLowerCase()}`)
  );
  const generatedDemoLeads = createDemoLeads(state.leads.length, 5);
  const missingDemoLeads = generatedDemoLeads.filter((lead) => {
    const key = `${lead.company.trim().toLowerCase()}::${lead.email.trim().toLowerCase()}`;
    return !existingKeys.has(key);
  });

  loadDemoLeadsButton.disabled = true;
  loadDemoLeadsButton.textContent = "Loading...";

  try {
    for (const lead of missingDemoLeads) {
      await request("/api/leads", {
        method: "POST",
        body: JSON.stringify(lead)
      });
    }

    await loadLeads();
    showNotification("Demo leads added", `${missingDemoLeads.length} new demo lead(s) were added without duplicating your existing data.`);
  } finally {
    loadDemoLeadsButton.disabled = false;
    loadDemoLeadsButton.textContent = "Load Demo";
  }
}

async function loadLeads() {
  const payload = await request("/api/leads");
  state.leads = payload.leads;
  state.activities = payload.activities;
  state.selectedQueueLeadIds = new Set(Array.from(state.selectedQueueLeadIds).filter((id) => state.leads.some((lead) => lead.id === id)));

  if (!selectedLead() && state.leads.length > 0) {
    state.selectedLeadId = state.leads[0].id;
  }

  clampQueuePage();

  renderMetrics(payload.summary);
  renderOverview();
  renderQueueProductFilter();
  renderLeadList();
  renderLeadDetail();
  renderWorkspace();
  renderExportPreview();
}

googleMapsImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(googleMapsImportForm);
  const body = Object.fromEntries(formData.entries());

  const radiusKm = Number(body.radiusKm);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    showNotification("Radius required", "Please enter a valid radius in kilometers before importing.");
    googleMapsRadiusInput.focus();
    return;
  }

  googleMapsImportButton.disabled = true;
  googleMapsImportButton.textContent = "Searching...";

  try {
    await ensureLiveLocation();
    body.latitude = googleMapsLatitudeInput.value;
    body.longitude = googleMapsLongitudeInput.value;

    const payload = await request("/api/google-maps/search", {
      method: "POST",
      body: JSON.stringify(body)
    });

    state.googleMapsResults = Array.isArray(payload.leads) ? payload.leads : [];
    state.selectedGoogleMapsResults = new Set();
    renderGoogleMapsResultsModal();
  } catch (error) {
    showNotification("Search failed", error.message || "Google Maps search could not be completed.");
  } finally {
    googleMapsImportButton.disabled = false;
    googleMapsImportButton.textContent = "Search Google Maps";
  }
});

googleMapsRadiusInput.addEventListener("input", updateRadiusDisplay);

if (retryLiveLocationButton) {
  retryLiveLocationButton.addEventListener("click", () => {
    retryLiveLocationButton.disabled = true;
    retryLiveLocationButton.textContent = "Detecting...";

    readLiveLocation()
      .catch((error) => {
        showNotification("Location required", error.message || "Unable to detect your location.");
      })
      .finally(() => {
        retryLiveLocationButton.disabled = false;
        retryLiveLocationButton.textContent = "Detect Current Location";
      });
  });
}

[googleMapsQueryInput, googleMapsRadiusInput].forEach((element) => {
  element.addEventListener("focus", () => {
    if (state.currentLocation || state.isResolvingLocation) {
      return;
    }

    ensureLiveLocation().catch(() => {
      // The submit flow will show the full error again if permission is denied.
    });
  });
});

if (leadForm) {
  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(leadForm);
    const body = Object.fromEntries(formData.entries());

    const requiredFields = [
      "company",
      "contactName",
      "email",
      "region",
      "source",
      "companyType",
      "painPoint",
      "status"
    ];

    const missingField = requiredFields.find((field) => !String(body[field] || "").trim());
    if (missingField) {
      window.alert("Please fill in all required fields marked with * before saving the lead.");
      return;
    }

    const payload = await request("/api/leads", {
      method: "POST",
      body: JSON.stringify(body)
    });
    leadForm.reset();
    state.queuePage = 1;
    state.selectedLeadId = payload.lead?.id || null;
    await loadLeads();
    showNotification("Lead saved", `${body.company} was added to the lead queue.`);
  });
}

refreshLeadsButton.addEventListener("click", loadLeads);
loadDemoLeadsButton.addEventListener("click", loadDemoLeads);
searchInput.addEventListener("input", () => {
  state.queuePage = 1;
  renderLeadList();
  if (state.activeExportView === "queue") {
    renderExportPreview();
  }
});
queueProductFilter.addEventListener("change", () => {
  state.queueProductFilter = queueProductFilter.value;
  state.queuePage = 1;
  renderLeadList();
});
selectVisibleQueueLeads.addEventListener("click", () => {
  getQueueLeads().forEach((lead) => state.selectedQueueLeadIds.add(lead.id));
  renderLeadList();
});
clearSelectedQueueLeads.addEventListener("click", () => {
  state.selectedQueueLeadIds = new Set();
  renderLeadList();
});
openBulkEmailComposer.addEventListener("click", openBulkEmailModal);
previousQueuePage.addEventListener("click", () => {
  if (state.queuePage > 1) {
    state.queuePage -= 1;
    renderLeadList();
  }
});
nextQueuePage.addEventListener("click", () => {
  const pageCount = getQueuePageCount();
  if (state.queuePage < pageCount) {
    state.queuePage += 1;
    renderLeadList();
  }
});
workspaceTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeWorkspace = tab.dataset.workspace;
    renderWorkspace();
    renderExportPreview();
    if (state.activeWorkspace === "intake" && !state.currentLocation && !state.isResolvingLocation) {
      ensureLiveLocation().catch(() => {
        // Submit flow will show the full permission error if needed.
      });
    }
  });
});

closeLeadDetailModal.addEventListener("click", () => {
  leadDetailModal.hidden = true;
  syncBodyLock();
});

closeGoogleMapsResultsModal.addEventListener("click", () => {
  googleMapsResultsModal.hidden = true;
  syncBodyLock();
});

closeCrmErrorModal.addEventListener("click", () => closeModal(crmErrorModal));

googleMapsResultsModal.addEventListener("click", (event) => {
  if (event.target === googleMapsResultsModal) {
    googleMapsResultsModal.hidden = true;
    syncBodyLock();
  }
});

crmErrorModal.addEventListener("click", (event) => {
  if (event.target === crmErrorModal) {
    closeModal(crmErrorModal);
  }
});

[selectAllGoogleMapsResults, inlineSelectAllGoogleMapsResults].filter(Boolean).forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedGoogleMapsResults = new Set();
    renderGoogleMapsResultsModal();
  });
});

[clearGoogleMapsResults, inlineClearGoogleMapsResults].filter(Boolean).forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedGoogleMapsResults = new Set();
    renderGoogleMapsResultsModal();
  });
});

async function handleImportSelectedGoogleMapsResults() {
  const selectedLeads = state.googleMapsResults.filter((lead) => state.selectedGoogleMapsResults.has(googleMapsResultKey(lead)));
  if (!selectedLeads.length) {
    showNotification("Nothing selected", "Select at least one shop before importing.");
    return;
  }

  setGoogleMapsImportButtonsState(true, "Importing...");

  try {
    const payload = await request("/api/google-maps/import-selected", {
      method: "POST",
      body: JSON.stringify({ leads: selectedLeads })
    });
    googleMapsResultsModal.hidden = true;
    syncBodyLock();
    await loadLeads();
    googleMapsImportForm.reset();
    googleMapsRadiusInput.value = "15";
    updateRadiusDisplay();
    googleMapsLatitudeInput.value = state.currentLocation ? String(state.currentLocation.latitude) : "";
    googleMapsLongitudeInput.value = state.currentLocation ? String(state.currentLocation.longitude) : "";
    state.googleMapsResults = [];
    state.selectedGoogleMapsResults = new Set();
    if (inlineGoogleMapsResultsPanel) {
      inlineGoogleMapsResultsPanel.hidden = true;
    }
    showNotification(
      "Google Maps import complete",
      `${payload.importedCount || 0} lead(s) imported${payload.duplicateCount ? `, ${payload.duplicateCount} duplicate(s) skipped` : ""}.`
    );
  } catch (error) {
    showNotification("Import failed", error.message || "Selected Google Maps shops could not be imported.");
  } finally {
    setGoogleMapsImportButtonsState(state.selectedGoogleMapsResults.size === 0, "Import Selected");
  }
}

[importSelectedGoogleMapsResults, inlineImportSelectedGoogleMapsResults].filter(Boolean).forEach((button) => {
  button.addEventListener("click", handleImportSelectedGoogleMapsResults);
});

leadDetailModal.addEventListener("click", (event) => {
  if (event.target === leadDetailModal) {
    leadDetailModal.hidden = true;
    syncBodyLock();
  }
});

openSettingsDrawerButton.addEventListener("click", openSettingsDrawer);
closeSettingsDrawerButton.addEventListener("click", closeSettingsDrawer);
settingsDrawerOverlay.addEventListener("click", () => closeSettingsDrawer());
openEmailSettingsPanel.addEventListener("click", () => {
  state.settingsReturnPanel = "email";
  setSettingsPanel("email");
});
backToSettingsHome.addEventListener("click", () => {
  state.settingsReturnPanel = "home";
  setSettingsPanel("home");
});
modeToggle.addEventListener("click", toggleThemeMode);

openSenderDetailsModalButton.addEventListener("click", () => openSettingsEditorModal(senderDetailsModal));
openTemplateEditorModalButton.addEventListener("click", () => openSettingsEditorModal(templateEditorModal));
closeSenderDetailsModal.addEventListener("click", () => closeModal(senderDetailsModal));
cancelSenderDetails.addEventListener("click", () => closeModal(senderDetailsModal));
closeTemplateEditorModal.addEventListener("click", () => closeModal(templateEditorModal));
cancelTemplateEditor.addEventListener("click", () => closeModal(templateEditorModal));

[senderDetailsModal, templateEditorModal].forEach((modalElement) => {
  modalElement.addEventListener("click", (event) => {
    if (event.target === modalElement) {
      closeModal(modalElement);
    }
  });
});

senderDetailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(senderDetailsForm);
  const senderName = String(formData.get("senderName") || "").trim();
  const senderEmail = String(formData.get("senderEmail") || "").trim();

  if (!senderEmail) {
    return;
  }

  state.senderName = senderName || "Your Name";
  state.senderEmail = senderEmail;
  state.emailDrafts = {};
  saveSenderSettings();
  renderSenderSettings();
  closeModal(senderDetailsModal);
  showNotification("Sender details updated", `Outgoing drafts will now use ${state.senderName} <${state.senderEmail}>.`);

  if (state.activeEmailLeadId) {
    const lead = state.leads.find((item) => item.id === state.activeEmailLeadId);
    if (lead) {
      const refreshedDraft = getEmailDraft(lead);
      emailDetailSubject.value = refreshedDraft.subject;
      emailDetailBody.value = refreshedDraft.body;
    }
  }
});

templateEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(templateEditorForm);
  const emailTemplateSubject = String(formData.get("emailTemplateSubject") || "").trim();
  const emailTemplateBody = String(formData.get("emailTemplateBody") || "").trim();

  if (!emailTemplateSubject || !emailTemplateBody) {
    return;
  }

  state.emailTemplateSubject = emailTemplateSubject;
  state.emailTemplateBody = emailTemplateBody;
  state.emailDrafts = {};
  saveSenderSettings();
  renderSenderSettings();
  closeModal(templateEditorModal);
  showNotification("Email template updated", "New and refreshed drafts will use the saved template.");

  if (state.activeEmailLeadId) {
    const lead = state.leads.find((item) => item.id === state.activeEmailLeadId);
    if (lead) {
      const refreshedDraft = getEmailDraft(lead);
      emailDetailSubject.value = refreshedDraft.subject;
      emailDetailBody.value = refreshedDraft.body;
    }
  }
});

closeEmailDetail.addEventListener("click", () => {
  state.activeEmailLeadId = null;
  emailDetailModal.hidden = true;
  syncBodyLock();
});
closeBulkEmailModal.addEventListener("click", closeBulkEmailEditor);
bulkEmailModal.addEventListener("click", (event) => {
  if (event.target === bulkEmailModal) {
    closeBulkEmailEditor();
  }
});
resetBulkEmailDraft.addEventListener("click", () => {
  bulkEmailSubject.value = state.emailTemplateSubject;
  bulkEmailBody.value = state.emailTemplateBody;
});
sendBulkEmailDraft.addEventListener("click", sendBulkEmails);

emailDetailModal.addEventListener("click", (event) => {
  if (event.target === emailDetailModal) {
    state.activeEmailLeadId = null;
    emailDetailModal.hidden = true;
    syncBodyLock();
  }
});

emailDetailSubject.addEventListener("input", () => {
  if (!state.activeEmailLeadId) {
    return;
  }

  const lead = state.leads.find((item) => item.id === state.activeEmailLeadId);
  if (!lead) {
    return;
  }

  const draft = getEmailDraft(lead);
  draft.subject = emailDetailSubject.value;
});

emailDetailBody.addEventListener("input", () => {
  if (!state.activeEmailLeadId) {
    return;
  }

  const lead = state.leads.find((item) => item.id === state.activeEmailLeadId);
  if (!lead) {
    return;
  }

  const draft = getEmailDraft(lead);
  draft.body = emailDetailBody.value;
});

resetEmailDraft.addEventListener("click", () => {
  if (!state.activeEmailLeadId) {
    return;
  }

  const lead = state.leads.find((item) => item.id === state.activeEmailLeadId);
  if (!lead) {
    return;
  }

  state.emailDrafts[lead.id] = buildEmailContent(lead);
  emailDetailSubject.value = state.emailDrafts[lead.id].subject;
  emailDetailBody.value = state.emailDrafts[lead.id].body;
  showNotification("Draft reset", `${lead.company} email draft was restored to the default version.`);
});

sendEmailDraft.addEventListener("click", sendActiveEmailDraft);

connectBiginButton.addEventListener("click", () => {
  window.location.href = "/api/integrations/bigin/connect";
});

retryBiginStatusButton.addEventListener("click", async () => {
  retryBiginStatusButton.disabled = true;
  retryBiginStatusButton.textContent = "Checking...";
  try {
    const connected = await checkBiginConnection();
    if (connected) {
      await loadLeads();
    }
  } finally {
    retryBiginStatusButton.disabled = false;
    retryBiginStatusButton.textContent = "Retry Connection Check";
  }
});

// ===== OUTBOUND TABS =====
const obTabs = document.querySelectorAll('.ob-tab');
const obTabContents = {
  campaigns: document.getElementById('obTabCampaigns'),
  sent: document.getElementById('obTabSent'),
  replies: document.getElementById('obTabReplies')
};

obTabs.forEach(function(tab) {
  tab.addEventListener('click', function() {
    obTabs.forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    var target = tab.getAttribute('data-ob-tab');
    Object.keys(obTabContents).forEach(function(key) {
      obTabContents[key].hidden = key !== target;
    });
  });
});

// Old export buttons removed — outbound is now tab-based UI (functionality pending)

loadSenderSettings();
loadThemeMode();
renderSenderSettings();
updateLocationUi();
updateRadiusDisplay();
startApp();








