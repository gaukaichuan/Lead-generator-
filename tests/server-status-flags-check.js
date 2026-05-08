const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { startServer } = require("../server");

const DATA_PATH = path.join(__dirname, "..", "data", "store.json");
const originalStore = fs.readFileSync(DATA_PATH, "utf8");

async function main() {
  fs.writeFileSync(DATA_PATH, JSON.stringify({
    leads: [
      {
        id: "lead-test-002",
        company: "Flag Check Co",
        contactName: "Ivy Tan",
        email: "ivy@flagcheck.co",
        phone: "",
        role: "Director",
        industry: "Services",
        region: "Petaling Jaya",
        companyType: "service",
        painPoint: "manual-accounting",
        source: "Manual research",
        status: "new",
        notes: "",
        sent: true,
        sentAt: "2026-04-23T01:00:00.000Z",
        crmLogged: true,
        createdAt: "2026-04-23T00:00:00.000Z"
      }
    ],
    activities: []
  }, null, 2));

  const server = await startServer(0);
  const port = server.address().port;

  try {
    await fetch(`http://localhost:${port}/api/leads/lead-test-002/sent`, { method: "PATCH" });
    await fetch(`http://localhost:${port}/api/leads/lead-test-002/crm`, { method: "PATCH" });

    const leadsResponse = await fetch(`http://localhost:${port}/api/leads`);
    const payload = await leadsResponse.json();
    const lead = payload.leads.find((item) => item.id === "lead-test-002");

    assert.equal(lead.sentAt, "2026-04-23T01:00:00.000Z");
    assert.equal(lead.crmLogged, true);
    assert.equal(payload.activities.length, 0);
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
