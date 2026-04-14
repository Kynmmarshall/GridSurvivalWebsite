const path = require("path");
const fs = require("fs");
const { createPrivateKey } = require("crypto");
const express = require("express");
const { google } = require("googleapis");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const downloadsStartDate = process.env.GA4_DOWNLOADS_START_DATE || "2024-01-01";
const analyticsCacheFile = process.env.ANALYTICS_CACHE_FILE || path.join(__dirname, ".runtime", "analytics-cache.json");

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  // eslint-disable-next-line no-console
  console.error("Uncaught exception", error);
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

// Serve static files with cache-busting headers for HTML, CSS, JS
app.use((req, res, next) => {
  // Only target static assets
  if (req.method === "GET" && /\.(html|css|js)$/i.test(req.url)) {
    // HTML: never cache
    if (/\.html$/i.test(req.url)) {
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else {
      // CSS/JS: short cache, force revalidate
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }
  next();
});
app.use(express.static(path.join(__dirname)));

function createRequestId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${random}`;
}

function readAnalyticsCache() {
  try {
    if (!fs.existsSync(analyticsCacheFile)) {
      return null;
    }
    const raw = fs.readFileSync(analyticsCacheFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function writeAnalyticsCache(payload) {
  try {
    const dir = path.dirname(analyticsCacheFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(analyticsCacheFile, JSON.stringify(payload, null, 2), "utf8");
  } catch (_error) {
    // Ignore cache write failures to keep endpoint healthy.
  }
}

function normalizePrivateKey(rawPrivateKey) {
  let key = String(rawPrivateKey || "").trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // Support .env inputs that may contain escaped newlines and CRLF artifacts.
  key = key
    .replace(/\r/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\\//g, "/")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\r/g, "\n")
    .trim();

  const beginMarker = "-----BEGIN PRIVATE KEY-----";
  const endMarker = "-----END PRIVATE KEY-----";
  const beginIndex = key.indexOf(beginMarker);
  const endIndex = key.indexOf(endMarker);

  if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
    const bodyStart = beginIndex + beginMarker.length;
    const rawBody = key.slice(bodyStart, endIndex);

    const normalizedBody = rawBody
      .replace(/[\s\n\r\t]+/g, "")
      .replace(/\\/g, "")
      .replace(/[^A-Za-z0-9+/=]/g, "");

    const bodyLines = normalizedBody.match(/.{1,64}/g) || [];
    key = `${beginMarker}\n${bodyLines.join("\n")}\n${endMarker}`;
  } else {
    key = key
      .replace(/-----BEGIN PRIVATE KEY-----\s*/, "-----BEGIN PRIVATE KEY-----\n")
      .replace(/\s*-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----")
      .trim();
  }

  return `${key}\n`;
}

function assertPrivateKeyFormat(privateKey) {
  try {
    createPrivateKey({ key: privateKey, format: "pem" });
  } catch (error) {
    throw new Error(`Invalid GA4 private key format: ${error.message}`);
  }
}

function readPrivateKeyFromDotenvFile() {
  try {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) {
      return "";
    }

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    const keyStart = lines.findIndex((line) => line.startsWith("GA4_PRIVATE_KEY="));
    if (keyStart === -1) {
      return "";
    }

    const firstLineValue = lines[keyStart]
      .slice("GA4_PRIVATE_KEY=".length)
      .trim();
    if (!firstLineValue) {
      return "";
    }

    if (firstLineValue.includes("-----END PRIVATE KEY-----")) {
      return firstLineValue;
    }

    const collected = [firstLineValue];
    for (let i = keyStart + 1; i < lines.length; i += 1) {
      const currentLine = lines[i];
      const trimmed = currentLine.trim();

      if (!trimmed) {
        continue;
      }

      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) {
        break;
      }

      collected.push(trimmed);
      if (trimmed.includes("-----END PRIVATE KEY-----")) {
        break;
      }
    }

    const reconstructed = collected.join("\n");
    return reconstructed.includes("-----END PRIVATE KEY-----")
      ? reconstructed
      : "";
  } catch (_error) {
    return "";
  }
}

function parseServiceAccountFromEnv() {
  const serviceAccountFile = process.env.GA4_SERVICE_ACCOUNT_FILE;
  if (serviceAccountFile) {
    const filePath = path.resolve(serviceAccountFile);
    const serviceAccount = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (serviceAccount.private_key) {
      serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
      assertPrivateKeyFormat(serviceAccount.private_key);
    }
    return serviceAccount;
  }

  const inlineJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    const serviceAccount = JSON.parse(inlineJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
      assertPrivateKeyFormat(serviceAccount.private_key);
    }
    return serviceAccount;
  }

  const email = process.env.GA4_CLIENT_EMAIL;
  const privateKeyFromBase64 = process.env.GA4_PRIVATE_KEY_BASE64
    ? Buffer.from(process.env.GA4_PRIVATE_KEY_BASE64, "base64").toString("utf8")
    : "";
  let privateKey = process.env.GA4_PRIVATE_KEY || privateKeyFromBase64;

  // Support raw multiline GA4_PRIVATE_KEY blocks in .env files.
  if (email && (!privateKey || !privateKey.includes("-----END PRIVATE KEY-----"))) {
    const keyFromDotenvFile = readPrivateKeyFromDotenvFile();
    if (keyFromDotenvFile) {
      privateKey = keyFromDotenvFile;
    }
  }

  if (email && privateKey) {
    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    assertPrivateKeyFormat(normalizedPrivateKey);

    return {
      client_email: email,
      private_key: normalizedPrivateKey,
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

async function runGA4RealtimeReport(propertyId, body, auth) {
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });
  const result = await analyticsData.properties.runRealtimeReport({
    property: `properties/${propertyId}`,
    requestBody: body,
  });
  return result.data;
}

app.get("/api/analytics", async (req, res) => {
  const requestId = createRequestId();
  try {
    // eslint-disable-next-line no-console
    console.log(
      `[analytics:${requestId}] request host=${req.get("host") || "unknown"} ip=${req.ip || "unknown"}`
    );

    res.set("X-Request-Id", requestId);
    res.set("Cache-Control", "no-store");

    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      // eslint-disable-next-line no-console
      console.error(`[analytics:${requestId}] missing GA4_PROPERTY_ID`);
      return res.status(500).json({ error: "Missing GA4_PROPERTY_ID" });
    }

    const serviceAccount = parseServiceAccountFromEnv();
    if (!serviceAccount) {
      // eslint-disable-next-line no-console
      console.error(`[analytics:${requestId}] missing GA4 service account credentials`);
      return res.status(500).json({
        error: "Missing GA4 service account credentials",
      });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });

    const [overview, downloadsByDay, downloadsTotal] = await Promise.all([
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
      runGA4Report(
        propertyId,
        {
          dateRanges: [{ startDate: downloadsStartDate, endDate: "today" }],
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
        },
        auth
      ),
    ]);

    // Realtime reports are optional and used to reduce perceived delay in GA4 standard reports.
    let realtimeActiveUsers = 0;
    let realtimeDownloads = 0;

    try {
      const [realtimeOverview, realtimeDownloadEvents] = await Promise.all([
        runGA4RealtimeReport(
          propertyId,
          {
            metrics: [{ name: "activeUsers" }],
          },
          auth
        ),
        runGA4RealtimeReport(
          propertyId,
          {
            dimensions: [{ name: "eventName" }],
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
            limit: 1,
          },
          auth
        ),
      ]);

      realtimeActiveUsers = Number(
        realtimeOverview.rows?.[0]?.metricValues?.[0]?.value || 0
      );
      realtimeDownloads = Number(
        realtimeDownloadEvents.rows?.[0]?.metricValues?.[0]?.value || 0
      );
    } catch (_realtimeError) {
      // Keep endpoint healthy even if realtime reporting is unavailable.
    }

    const overviewRow = overview.rows?.[0]?.metricValues || [];
    const activeUsers = Number(overviewRow[0]?.value || 0);
    const avgSessionSeconds = Number(overviewRow[1]?.value || 0);
    const engagementRate = Number(overviewRow[2]?.value || 0);

    const dailyLabels = [];
    const dailyDownloads = [];

    (downloadsByDay.rows || []).forEach((row) => {
      const yyyymmdd = row.dimensionValues?.[0]?.value || "";
      const dayCount = Number(row.metricValues?.[0]?.value || 0);

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

    const totalDownloads = Number(
      downloadsTotal.rows?.[0]?.metricValues?.[0]?.value || 0
    );

    const resolvedActiveUsers = Math.max(activeUsers, realtimeActiveUsers);
    const resolvedTotalDownloads = Math.max(totalDownloads, realtimeDownloads);

    if (dailyLabels.length === 0 && resolvedTotalDownloads > 0) {
      dailyLabels.push("Now");
      dailyDownloads.push(resolvedTotalDownloads);
    }

    const payload = {
      activeUsers: resolvedActiveUsers,
      avgSessionSeconds,
      engagementRate,
      totalDownloads: resolvedTotalDownloads,
      realtimeActiveUsers,
      realtimeDownloads,
      dailyLabels,
      dailyDownloads,
      refreshedAt: new Date().toISOString(),
      stale: false,
    };

    writeAnalyticsCache(payload);
    return res.json(payload);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[analytics:${requestId}] request failed`, {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      status: error?.status,
      responseStatus: error?.response?.status,
      responseData: error?.response?.data,
    });

    const cached = readAnalyticsCache();
    if (cached) {
      // eslint-disable-next-line no-console
      console.warn(`[analytics:${requestId}] serving cached payload`);
      return res.json({
        ...cached,
        stale: true,
        staleReason: "Serving cached analytics while GA4 is unavailable",
        requestId,
      });
    }

    return res.status(500).json({
      error: "Unable to load GA4 analytics",
      details: error.message,
      requestId,
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
