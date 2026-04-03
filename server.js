const path = require("path");
const express = require("express");
const { google } = require("googleapis");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

function parseServiceAccountFromEnv() {
  const inlineJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const email = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY;
  if (email && privateKey) {
    return {
      client_email: email,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

async function runGA4Report(propertyId, body, auth) {
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });
  const result = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: body,
  });
  return result.data;
}

app.get("/api/analytics", async (_req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return res.status(500).json({ error: "Missing GA4_PROPERTY_ID" });
    }

    const serviceAccount = parseServiceAccountFromEnv();
    if (!serviceAccount) {
      return res.status(500).json({
        error: "Missing GA4 service account credentials",
      });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });

    const [overview, downloadsByDay] = await Promise.all([
      runGA4Report(
        propertyId,
        {
          dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
          metrics: [
            { name: "activeUsers" },
            { name: "averageSessionDuration" },
            { name: "engagementRate" },
          ],
        },
        auth
      ),
      runGA4Report(
        propertyId,
        {
          dateRanges: [{ startDate: "6daysAgo", endDate: "today" }],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              stringFilter: {
                value: "download_click",
                matchType: "EXACT",
              },
            },
          },
          orderBys: [{ dimension: { dimensionName: "date" } }],
        },
        auth
      ),
    ]);

    const overviewRow = overview.rows?.[0]?.metricValues || [];
    const activeUsers = Number(overviewRow[0]?.value || 0);
    const avgSessionSeconds = Number(overviewRow[1]?.value || 0);
    const engagementRate = Number(overviewRow[2]?.value || 0);

    const dailyLabels = [];
    const dailyDownloads = [];
    let totalDownloads = 0;

    (downloadsByDay.rows || []).forEach((row) => {
      const yyyymmdd = row.dimensionValues?.[0]?.value || "";
      const dayCount = Number(row.metricValues?.[0]?.value || 0);
      totalDownloads += dayCount;

      if (yyyymmdd.length === 8) {
        const year = yyyymmdd.slice(0, 4);
        const month = yyyymmdd.slice(4, 6);
        const day = yyyymmdd.slice(6, 8);
        const date = new Date(`${year}-${month}-${day}T00:00:00`);
        dailyLabels.push(
          date.toLocaleDateString("en-US", { weekday: "short" })
        );
      } else {
        dailyLabels.push(yyyymmdd);
      }

      dailyDownloads.push(dayCount);
    });

    return res.json({
      activeUsers,
      avgSessionSeconds,
      engagementRate,
      totalDownloads,
      dailyLabels,
      dailyDownloads,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load GA4 analytics",
      details: error.message,
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Grid Survival site running on port ${port}`);
});
