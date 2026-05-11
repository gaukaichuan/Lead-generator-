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
        id: "lead-send-001",
        company: "Customer Test Sdn Bhd",
        contactName: "Jackson Gau",
        email: "Jacksongau123@gmail.com",
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

  const sentMessages = [];
  const server = await startServer(0, {
    sendEmail: async (payload) => {
      sentMessages.push(payload);
      return { messageId: "mock-message-id" };
    }
  });
  const port = server.address().port;

  try {
    const sendResponse = await fetch(`http://localhost:${port}/api/leads/lead-send-001/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderName: "Jackson Gau",
        senderEmail: "jacksongau0204@gmail.com",
        subject: "test outreach email",
        body: "This is a real SMTP test message."
      })
    });

    assert.equal(sendResponse.status, 200);
    const payload = await sendResponse.json();
    assert.equal(payload.messageId, "mock-message-id");
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].to, "Jacksongau123@gmail.com");
    assert.equal(sentMessages[0].fromName, "Jackson Gau");
    assert.equal(sentMessages[0].fromEmail, "jacksongau0204@gmail.com");
    assert.equal(sentMessages[0].subject, "test outreach email");

    const store = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    const updatedLead = store.leads.find((lead) => lead.id === "lead-send-001");
    assert.equal(updatedLead.sent, true);
    assert.ok(updatedLead.sentAt);
    assert.ok(store.activities.some((activity) => activity.title === "Outreach email sent"));
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
