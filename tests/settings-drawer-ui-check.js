const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(__dirname, "..", "public", "index.html");
const appPath = path.join(__dirname, "..", "public", "app.js");
const stylesPath = path.join(__dirname, "..", "public", "styles.css");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const appJs = fs.readFileSync(appPath, "utf8");
const stylesCss = fs.readFileSync(stylesPath, "utf8");

assert.match(indexHtml, /id="openSettingsDrawer"/, "Expected a dedicated settings drawer trigger in the header.");
assert.match(indexHtml, /id="settingsDrawer"/, "Expected the new settings drawer container.");
assert.match(indexHtml, /id="openSenderDetailsModal"/, "Expected an Edit sender details action in the email setup page.");
assert.match(indexHtml, /id="openTemplateEditorModal"/, "Expected an Edit email template action in the email setup page.");
assert.match(indexHtml, /id="senderDetailsModal"/, "Expected the sender details modal markup.");
assert.match(indexHtml, /id="templateEditorModal"/, "Expected the template editor modal markup.");
assert.match(indexHtml, /id="biginConnectGate"/, "Expected a Bigin connection gate before the main app loads.");
assert.match(indexHtml, /id="connectBiginButton"/, "Expected a dedicated button to start Bigin authorization.");
assert.match(indexHtml, /id="emailActivityFilter"/, "Expected an email activity status filter control.");
assert.match(indexHtml, /<th>Status<\/th>/, "Expected a status column in the email activity table.");

assert.match(appJs, /function openSettingsDrawer\(/, "Expected settings drawer open logic.");
assert.match(appJs, /function setSettingsPanel\(/, "Expected panel switching logic for settings views.");
assert.match(appJs, /async function checkBiginConnection\(/, "Expected startup Bigin connection check logic.");
assert.match(appJs, /function getEmailActivityLeads\(/, "Expected email activity filtering logic.");
assert.match(appJs, /body\.classList\.toggle\("dark-mode"/, "Expected a dark mode toggle for the new settings mode control.");

assert.match(stylesCss, /\.settings-drawer\b/, "Expected drawer styling in styles.css.");
assert.match(stylesCss, /\.mode-toggle\b/, "Expected compact mode toggle styling.");
assert.match(stylesCss, /\.bigin-connect-gate\b/, "Expected dedicated styling for the Bigin login gate.");
assert.match(stylesCss, /\.email-activity-filter\b/, "Expected styling for the email activity filter.");
assert.doesNotMatch(indexHtml, /id="senderEmailForm"/, "Expected the old combined settings form to be removed from the UI.");

console.log("PASS");
