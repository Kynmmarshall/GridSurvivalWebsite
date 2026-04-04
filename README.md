# Grid Survival Website

## Live GA4 Analytics Setup

This project now supports live analytics cards and chart data via a secure server endpoint (`/api/analytics`).

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` values into your VPS environment (or your process manager config):

- `GA4_PROPERTY_ID`
- `GA4_CLIENT_EMAIL` + `GA4_PRIVATE_KEY`
- or `GA4_SERVICE_ACCOUNT_JSON`
- optional: `GA4_DOWNLOADS_START_DATE` (default: `2024-01-01`) for all-time download totals
- optional: `ANALYTICS_CACHE_FILE` (default: `.runtime/analytics-cache.json`) to persist last-known analytics across restarts

Important: The service account must have **Viewer/Analyst** access to your GA4 property.

### 3. Set your GA4 Measurement ID for front-end tracking

In `index.html`, set:

```html
<body data-ga4-id="G-XXXXXXXXXX" data-analytics-endpoint="/api/analytics">
```

Replace `G-XXXXXXXXXX` with your real measurement ID.

### 4. Start the site

```bash
npm start
```

### 5. Verify

- Open your site and check that the analytics status text says `Live data from GA4`.
- In GA4 Realtime, confirm your visit/events appear.

## Notes

- The front-end never exposes GA4 private credentials.
- If `/api/analytics` is temporarily unavailable, the API serves the last saved analytics snapshot instead of zero values.
- Keep your `.env` file outside git and do not delete the analytics cache file during deploy scripts.
