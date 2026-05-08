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
        id: "lead-test-001",
        company: "Test Company",
        contactName: "Casey Tan",
        email: "casey@test-company.com",
        phone: "",
        role: "Manager",
        industry: "Retail",
        region: "Kuala Lumpur",
        companyType: "retail",
        painPoint: "checkout-pos",
        source: "Manual research",
        status: "new",
        notes: "",
        sent: false,
        sentAt: null,
        crmLogged: false,
        createdAt: "2026-04-23T00:00:00.000Z"
      }
    ],
    activities: []
  }, null, 2));

  const server = await startServer(0);
  const port = server.address().port;

  try {
    const updateResponse = await fetch(`http://localhost:${port}/api/leads/lead-test-001/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "qualified" })
    });

    assert.equal(updateResponse.status, 200);

    const leadsResponse = await fetch(`http://localhost:${port}/api/leads`);
    const payload = await leadsResponse.json();
    const lead = payload.leads.find((item) => item.id === "lead-test-001");

    assert.equal(lead.status, "qualified");
    assert.equal(lead.sent, true);
    assert.ok(lead.sentAt);
    assert.equal(payload.summary.sentLeads, 1);
    assert.ok(payload.activities.some((activity) => activity.title === "Outreach auto-sent"));
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
