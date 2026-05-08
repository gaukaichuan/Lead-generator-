const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { startServer } = require("../server");

const DATA_PATH = path.join(__dirname, "..", "data", "store.json");
const originalStore = fs.readFileSync(DATA_PATH, "utf8");

function makeLead(index) {
  return {
    id: `lead-export-${index}`,
    company: `Export Company ${index}`,
    contactName: `Contact ${index}`,
    email: `contact${index}@exportco.test`,
    phone: "",
    role: "Manager",
    industry: "Retail",
    region: index % 2 === 0 ? "Kuala Lumpur" : "Johor Bahru",
    companyType: "retail",
    painPoint: "checkout-pos",
    source: "Manual research",
    status: "new",
    notes: "",
    sent: false,
    sentAt: null,
    crmLogged: false,
    createdAt: `2026-04-23T00:${String(index).padStart(2, "0")}:00.000Z`
  };
}

async function main() {
  fs.writeFileSync(DATA_PATH, JSON.stringify({
    leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1)),
    activities: []
  }, null, 2));

  const server = await startServer(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://localhost:${port}/api/export/leads.csv`);
    assert.equal(response.status, 200);

    const body = await response.text();
    const normalized = body.replace(/^\ufeff/, "").trim();
    const rowCount = normalized.split(/\r?\n/).length - 1;

    assert.equal(rowCount, 12);
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
