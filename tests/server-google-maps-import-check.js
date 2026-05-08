const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { startServer } = require("../server");

const DATA_PATH = path.join(__dirname, "..", "data", "store.json");
const originalStore = fs.readFileSync(DATA_PATH, "utf8");
const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

async function main() {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  fs.writeFileSync(DATA_PATH, JSON.stringify({ leads: [], activities: [] }, null, 2));

  const calls = [];
  const mockFetch = async (url) => {
    calls.push(String(url));

    if (String(url).includes(":searchText")) {
      return jsonResponse({
        places: [
          {
            id: "place-1",
            displayName: { text: "KL Auto Mart" },
            formattedAddress: "Kuala Lumpur, Malaysia",
            primaryType: "car_dealer",
            websiteUri: "https://example.com/kl-auto"
          },
          {
            id: "place-2",
            displayName: { text: "Selangor Retail Hub" },
            formattedAddress: "Shah Alam, Selangor, Malaysia",
            primaryType: "store"
          }
        ]
      });
    }

    if (String(url).includes("/places/place-1")) {
      return jsonResponse({
        id: "place-1",
        nationalPhoneNumber: "03-1234 5678"
      });
    }

    if (String(url).includes("/places/place-2")) {
      return jsonResponse({
        id: "place-2",
        nationalPhoneNumber: "03-8765 4321"
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const server = await startServer(0, { googlePlacesFetch: mockFetch });
  const port = server.address().port;

  try {
    const firstResponse = await fetch(`http://localhost:${port}/api/import/google-maps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "accounting software retail in kuala lumpur",
        region: "Kuala Lumpur",
        companyType: "retail",
        painPoint: "checkout-pos"
      })
    });
    assert.equal(firstResponse.status, 201);
    const firstPayload = await firstResponse.json();
    assert.equal(firstPayload.importedCount, 2);
    assert.equal(firstPayload.duplicateCount, 0);
    assert.equal(firstPayload.leads[0].source, "Google Maps");
    assert.equal(firstPayload.leads[0].status, "new");

    const secondResponse = await fetch(`http://localhost:${port}/api/import/google-maps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "accounting software retail in kuala lumpur",
        region: "Kuala Lumpur",
        companyType: "retail",
        painPoint: "checkout-pos"
      })
    });
    assert.equal(secondResponse.status, 201);
    const secondPayload = await secondResponse.json();
    assert.equal(secondPayload.importedCount, 0);
    assert.equal(secondPayload.duplicateCount, 2);

    const store = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    assert.equal(store.leads.length, 2);
    assert.match(store.leads[0].notes, /Imported from Google Maps/);
    assert.equal(calls.filter((item) => item.includes(":searchText")).length, 2);
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

    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    }
    fs.writeFileSync(DATA_PATH, originalStore);
  }
}

main().catch((error) => {
  if (originalApiKey === undefined) {
    delete process.env.GOOGLE_MAPS_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
  }
  fs.writeFileSync(DATA_PATH, originalStore);
  console.error(error);
  process.exitCode = 1;
});
