const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { startServer } = require("../server");

const DATA_PATH = path.join(__dirname, "..", "data", "store.json");
const originalStore = fs.readFileSync(DATA_PATH, "utf8");

async function main() {
  fs.writeFileSync(DATA_PATH, JSON.stringify({
    leads: [
      {
        id: "lead-send-fail-001",
        company: "Debug Mail Sdn Bhd",
        contactName: "Taylor Ong",
        email: "taylor@example.com",
        phone: "",
        role: "Owner",
        industry: "Retail",
        region: "Kuala Lumpur",
        companyType: "retail",
        painPoint: "checkout-pos",
        source: "Manual research",
        status: "qualified",
        notes: "",
        sent: false,
        sentAt: null,
        crmLogged: false,
        createdAt: "2026-05-11T00:00:00.000Z"
      }
    ],
    activities: []
  }, null, 2));

  const debugLogs = [];
  const server = await startServer(0, {
    sendEmail: async () => {
      throw new Error("535-5.7.8 Username and Password not accepted.");
    },
    emailDebugLogger: (entry) => {
      debugLogs.push(entry);
    }
  });
  const port = server.address().port;

  try {
    const sendResponse = await fetch(`http://localhost:${port}/api/leads/lead-send-fail-001/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderName: "Jackson Gau",
        senderEmail: "presoftjackson@gmail.com",
        subject: "Debug send",
        body: "This should fail."
      })
    });

    assert.equal(sendResponse.status, 500);
    const payload = await sendResponse.json();
    assert.equal(payload.error, "Email send failed: 535-5.7.8 Username and Password not accepted.");
    assert.ok(payload.debug);
    assert.equal(payload.debug.leadId, "lead-send-fail-001");
    assert.equal(payload.debug.recipient, "taylor@example.com");
    assert.equal(payload.debug.senderEmail, "presoftjackson@gmail.com");
    assert.equal(debugLogs.length, 1);
    assert.equal(debugLogs[0].event, "email_send_failed");
    assert.equal(debugLogs[0].leadId, "lead-send-fail-001");
    assert.equal(debugLogs[0].recipient, "taylor@example.com");
    assert.equal(debugLogs[0].senderEmail, "presoftjackson@gmail.com");
    assert.equal(debugLogs[0].errorMessage, "535-5.7.8 Username and Password not accepted.");

    const store = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    const unchangedLead = store.leads.find((lead) => lead.id === "lead-send-fail-001");
    assert.equal(unchangedLead.sent, false);
    assert.equal(unchangedLead.sentAt, null);
    console.log("PASS");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    fs.writeFileSync(DATA_PATH, originalStore);
  }
}

main().catch((error) => {
  fs.writeFileSync(DATA_PATH, originalStore);
  console.error(error);
  process.exitCode = 1;
});
