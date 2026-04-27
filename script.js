// GA4 setup: replace data-ga4-id in index.html with your real Measurement ID (G-XXXXXXX)
function initGA4() {
  const measurementId = document.body?.dataset?.ga4Id;
  if (!measurementId || measurementId === "G-XXXXXXXXXX") {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip: true,
  });

  const gaScript = document.createElement("script");
  gaScript.async = true;
  gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(gaScript);
}

function trackCTAEvents() {
  const trackedLinks = document.querySelectorAll("[data-ga-event]");
  trackedLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (typeof window.gtag !== "function") {
        return;
      }

      const href = link.getAttribute("href") || "";
      const isExternalUrl = /^https?:\/\//i.test(href);
      const opensNewTab = (link.getAttribute("target") || "").toLowerCase() === "_blank";

      let didNavigate = false;
      const completeNavigation = () => {
        if (didNavigate || !isExternalUrl || opensNewTab) {
          return;
        }
        didNavigate = true;
        window.location.href = href;
      };

      if (isExternalUrl && !opensNewTab) {
        event.preventDefault();
        setTimeout(completeNavigation, 1200);
      }

      window.gtag("event", link.dataset.gaEvent, {
        event_category: "engagement",
        event_label: link.dataset.gaLabel || link.textContent.trim(),
        link_url: href,
        transport_type: "beacon",
        event_timeout: 1500,
        event_callback: () => {
          completeNavigation();
          setTimeout(loadLiveAnalytics, 1500);
        },
      });
    });
  });
}

function animateIntegerValue(target, endValue) {
  const safeEnd = Number.isFinite(endValue) ? Math.max(0, Math.round(endValue)) : 0;
  let current = 0;
  const tick = () => {
    current += Math.ceil((safeEnd - current) * 0.1);
    if (current >= safeEnd) {
      target.textContent = safeEnd.toLocaleString();
      return;
    }
    target.textContent = current.toLocaleString();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function formatDuration(seconds) {
  const mins = Math.max(0, Math.round(seconds / 60));
  return `${mins}m`;
}

function formatPercent(ratio) {
  const pct = Math.max(0, ratio * 100);
  return `${pct.toFixed(1)}%`;
}

let downloadsChart;
const ANALYTICS_REFRESH_MS = 30000;
const PLAYER_COUNT_REFRESH_MS = 30000;

function buildAnalyticsEndpointCandidates() {
  const configured = (document.body?.dataset?.analyticsEndpoint || "").trim();
  const candidates = [configured, "/api/analytics", `${window.location.origin}/api/analytics`];

  if (window.location.hostname && window.location.port !== "6060") {
    const scheme = window.location.protocol === "http:" ? "http:" : "https:";
    candidates.push(`${scheme}//${window.location.hostname}:6060/api/analytics`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function buildPlayerCountEndpointCandidates() {
  const candidates = ["/api/player-count", `${window.location.origin}/api/player-count`];

  if (window.location.hostname && window.location.port !== "6060") {
    const scheme = window.location.protocol === "http:" ? "http:" : "https:";
    candidates.push(`${scheme}//${window.location.hostname}:6060/api/player-count`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function fetchAnalyticsPayload() {
  const endpoints = buildAnalyticsEndpointCandidates();
  let lastError = new Error("No analytics endpoint configured");

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${endpoint}`);
      }

      const data = await response.json();
      return { data, endpoint };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function fetchPlayerCountPayload() {
  const endpoints = buildPlayerCountEndpointCandidates();
  let lastError = new Error("No player count endpoint configured");

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${endpoint}`);
      }

      const data = await response.json();
      return { data, endpoint };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function createDownloadsChart() {
  const canvas = document.getElementById("downloadsChart");
  if (!canvas) {
    return;
  }

  if (typeof window.Chart !== "function") {
    return;
  }

  const gradient = canvas.getContext("2d").createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "rgba(109, 240, 255, 0.4)");
  gradient.addColorStop(1, "rgba(109, 240, 255, 0)");

  downloadsChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Downloads per day",
          data: [],
          fill: true,
          backgroundColor: gradient,
          borderColor: "#6df0ff",
          borderWidth: 3,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: "rgba(5, 11, 28, 0.9)",
          borderColor: "rgba(109, 240, 255, 0.5)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#7c8aa4",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
        y: {
          ticks: {
            color: "#7c8aa4",
            callback: (value) => Number(value).toLocaleString(),
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
      },
    },
  });
}

async function loadLiveAnalytics() {
  const status = document.getElementById("analyticsStatus");
  const totalVisitorsEl = document.getElementById("totalVisitors");
  const avgSessionEl = document.getElementById("avgSession");
  const downloadCountEl = document.getElementById("downloadCount");
  const retentionEl = document.getElementById("retentionRate");

  try {
    const { data } = await fetchAnalyticsPayload();
    const liveUsers = Math.max(data.activeUsers || 0, data.realtimeActiveUsers || 0);
    const liveDownloads = Math.max(data.totalDownloads || 0, data.realtimeDownloads || 0);

    if (totalVisitorsEl) {
      animateIntegerValue(totalVisitorsEl, liveUsers);
    }
    if (downloadCountEl) {
      animateIntegerValue(downloadCountEl, liveDownloads);
    }
    if (avgSessionEl) {
      avgSessionEl.textContent = formatDuration(data.avgSessionSeconds || 0);
    }
    if (retentionEl) {
      retentionEl.textContent = formatPercent(data.engagementRate || 0);
    }

    if (downloadsChart && Array.isArray(data.dailyLabels) && Array.isArray(liveUsers)) {
      downloadsChart.data.labels = data.dailyLabels;
      downloadsChart.data.datasets[0].data = liveUsers;
      downloadsChart.update();
    }

    if (status) {
      status.textContent = data.stale
        ? "Showing last saved analytics (GA4 temporarily unavailable)"
        : "Live data from GA4";
    }
  } catch (error) {
    if (totalVisitorsEl) {
      totalVisitorsEl.textContent = "--";
    }
    if (avgSessionEl) {
      avgSessionEl.textContent = "--";
    }
    if (downloadCountEl) {
      downloadCountEl.textContent = "--";
    }
    if (retentionEl) {
      retentionEl.textContent = "--";
    }
    if (downloadsChart) {
      downloadsChart.data.labels = [];
      downloadsChart.data.datasets[0].data = [];
      downloadsChart.update();
    }
    if (status) {
      const reason = String(error?.message || "unknown error").slice(0, 120);
      status.textContent = `Live analytics unavailable (${reason}).`;
    }
  }
}

async function loadTotalPlayersFromLeaderboard() {
  const totalPlayersCountEl = document.getElementById("totalPlayersCount");
  if (!totalPlayersCountEl) {
    return;
  }

  try {
    const { data } = await fetchPlayerCountPayload();
    const totalPlayersCount = Number(data?.totalPlayers || 0);
    animateIntegerValue(totalPlayersCountEl, totalPlayersCount);
  } catch (_error) {
    totalPlayersCountEl.textContent = "--";
  }
}

initGA4();
trackCTAEvents();
createDownloadsChart();
loadLiveAnalytics();
loadTotalPlayersFromLeaderboard();
setInterval(loadLiveAnalytics, ANALYTICS_REFRESH_MS);
setInterval(loadTotalPlayersFromLeaderboard, PLAYER_COUNT_REFRESH_MS);

// Initialize footer year stamp
const yearTarget = document.getElementById("year");
if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

// Ensure gallery slots only pull images from the assets folder
const gallerySlots = document.querySelectorAll(".gallery-slot[data-image]");
gallerySlots.forEach((slot) => {
  const fileName = slot.dataset.image?.trim();
  const pathLabel = slot.querySelector("[data-path]");
  if (!fileName) {
    if (pathLabel) {
      pathLabel.textContent = "Add filename inside assets/";
    }
    return;
  }

  const assetPath = `assets/${fileName}`;
  if (pathLabel) {
    pathLabel.textContent = assetPath;
  }

  const preview = new Image();
  preview.src = assetPath;
  preview.onload = () => {
    slot.style.setProperty("--slot-image", `url('${assetPath}')`);
    slot.classList.add("has-image");
  };
  preview.onerror = () => {
    slot.classList.remove("has-image");
  };
});

// Scroll-triggered reveal animations
const animatedNodes = document.querySelectorAll("[data-animate]");
if (animatedNodes.length) {
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.2,
        rootMargin: "0px 0px -5% 0px",
      }
    );

    animatedNodes.forEach((node) => {
      const delay = node.dataset.delay;
      if (delay) {
        node.style.setProperty("--delay", `${parseFloat(delay)}s`);
      }
      revealObserver.observe(node);
    });
  } else {
    animatedNodes.forEach((node) => node.classList.add("is-visible"));
  }
}
