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
        id: "lead-send-code-001",
        company: "Socket Debug Sdn Bhd",
        contactName: "Chris Yap",
        email: "chris@example.com",
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

  const server = await startServer(0, {
    sendEmail: async () => {
      throw { code: "ECONNRESET" };
    }
  });
  const port = server.address().port;

  try {
    const sendResponse = await fetch(`http://localhost:${port}/api/leads/lead-send-code-001/send-email`, {
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
    assert.equal(payload.error, "Email send failed: ECONNRESET");
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
