const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { startServer } = require("../server");

const DATA_PATH = path.join(__dirname, "..", "data", "store.json");
const originalStore = fs.readFileSync(DATA_PATH, "utf8");

async function main() {
  fs.writeFileSync(DATA_PATH, JSON.stringify({ leads: [], activities: [] }, null, 2));

  const server = await startServer(0);
  const port = server.address().port;

  try {
    const createResponse = await fetch(`http://localhost:${port}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "Default Status Co",
        contactName: "June Lee",
        email: "june@defaultstatus.co",
        region: "Kuala Lumpur",
        companyType: "service",
        painPoint: "manual-accounting",
        source: "Manual research",
        status: "qualified"
      })
    });

    assert.equal(createResponse.status, 201);

    const payload = await fetch(`http://localhost:${port}/api/leads`).then((response) => response.json());
    assert.equal(payload.leads.length, 1);
    assert.equal(payload.leads[0].status, "new");
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
