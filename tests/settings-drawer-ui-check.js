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

assert.match(appJs, /function openSettingsDrawer\(/, "Expected settings drawer open logic.");
assert.match(appJs, /function setSettingsPanel\(/, "Expected panel switching logic for settings views.");
assert.match(appJs, /body\.classList\.toggle\("dark-mode"/, "Expected a dark mode toggle for the new settings mode control.");

assert.match(stylesCss, /\.settings-drawer\b/, "Expected drawer styling in styles.css.");
assert.match(stylesCss, /\.mode-toggle\b/, "Expected compact mode toggle styling.");
assert.doesNotMatch(indexHtml, /id="senderEmailForm"/, "Expected the old combined settings form to be removed from the UI.");

console.log("PASS");
