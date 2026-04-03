require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createPrivateKey } = require("crypto");

function normalizePrivateKey(rawPrivateKey) {
  let key = String(rawPrivateKey || "").trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

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

function reportPrivateKey(label, key) {
  const normalized = normalizePrivateKey(key);
  const hasBegin = normalized.includes("BEGIN PRIVATE KEY");
  const hasEnd = normalized.includes("END PRIVATE KEY");

  const body = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const validBodyChars = /^[A-Za-z0-9+/=]+$/.test(body);
  const invalidChars = Array.from(
    new Set(body.split("").filter((ch) => !/[A-Za-z0-9+/=]/.test(ch)))
  );

  let pemOk = false;
  let pemError = "";
  try {
    createPrivateKey({ key: normalized, format: "pem" });
    pemOk = true;
  } catch (error) {
    pemError = error.message;
  }

  console.log(`source=${label}`);
  console.log(`raw_length=${String(key || "").length}`);
  console.log(`normalized_length=${normalized.length}`);
  console.log(`has_begin=${hasBegin}`);
  console.log(`has_end=${hasEnd}`);
  console.log(`body_length=${body.length}`);
  console.log(`body_chars_valid=${validBodyChars}`);
  if (!validBodyChars) {
    console.log(`body_invalid_chars=${JSON.stringify(invalidChars)}`);
  }
  console.log(`pem_ok=${pemOk}`);
  if (!pemOk) {
    console.log(`pem_error=${pemError}`);
  }
}

function run() {
  const keyFile = process.env.GA4_SERVICE_ACCOUNT_FILE;
  const inlineJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
  const keyBase64 = process.env.GA4_PRIVATE_KEY_BASE64;
  const keyDirect = process.env.GA4_PRIVATE_KEY;

  console.log(`property_id_present=${Boolean(process.env.GA4_PROPERTY_ID)}`);
  console.log(`client_email_present=${Boolean(process.env.GA4_CLIENT_EMAIL)}`);
  console.log(`service_account_file_present=${Boolean(keyFile)}`);
  console.log(`service_account_json_present=${Boolean(inlineJson)}`);
  console.log(`private_key_present=${Boolean(keyDirect)}`);
  console.log(`private_key_base64_present=${Boolean(keyBase64)}`);

  if (keyFile) {
    const abs = path.resolve(keyFile);
    console.log(`resolved_key_file=${abs}`);
    console.log(`key_file_exists=${fs.existsSync(abs)}`);
    if (fs.existsSync(abs)) {
      const json = JSON.parse(fs.readFileSync(abs, "utf8"));
      reportPrivateKey("GA4_SERVICE_ACCOUNT_FILE.private_key", json.private_key);
    }
    return;
  }

  if (inlineJson) {
    const json = JSON.parse(inlineJson);
    reportPrivateKey("GA4_SERVICE_ACCOUNT_JSON.private_key", json.private_key);
    return;
  }

  if (keyBase64) {
    const decoded = Buffer.from(keyBase64, "base64").toString("utf8");
    reportPrivateKey("GA4_PRIVATE_KEY_BASE64(decoded)", decoded);
    return;
  }

  reportPrivateKey("GA4_PRIVATE_KEY", keyDirect);
}

run();