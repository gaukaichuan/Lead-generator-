const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leadgen-data-"));
const persistentDir = path.join(tempRoot, "persistent-store");
process.env.LEAD_DATA_DIR = persistentDir;

const { startServer } = require("../server");

async function main() {
  const server = await startServer(0);
  const port = server.address().port;
  const dataPath = path.join(persistentDir, "store.json");

  try {
    const createResponse = await fetch(`http://localhost:${port}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "Persistent Storage Sdn Bhd",
        contactName: "Ava Lim",
        email: "ava@persistent.test",
        region: "Kuala Lumpur",
        companyType: "service",
        painPoint: "manual-accounting",
        source: "Manual research",
        status: "new"
      })
    });

    assert.equal(createResponse.status, 201);
    assert.ok(fs.existsSync(dataPath));

    const stored = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    assert.equal(stored.leads.length, 1);
    assert.equal(stored.leads[0].company, "Persistent Storage Sdn Bhd");
    assert.ok(Array.isArray(stored.activities));
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

    delete process.env.LEAD_DATA_DIR;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  delete process.env.LEAD_DATA_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
