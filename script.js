// Initialize footer year stamp
const yearTarget = document.getElementById("year");
if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

// Animate total download counter for subtle motion
const downloadTarget = document.getElementById("downloadCount");
if (downloadTarget) {
  const finalValue = parseInt(downloadTarget.textContent.replace(/,/g, ""), 10);
  let current = Math.max(0, finalValue - 1200);
  const tick = () => {
    current += Math.ceil((finalValue - current) * 0.08);
    if (current >= finalValue) {
      downloadTarget.textContent = finalValue.toLocaleString();
      return;
    }
    downloadTarget.textContent = current.toLocaleString();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Build the downloads chart using Chart.js
const ctx = document.getElementById("downloadsChart");
if (ctx) {
  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "rgba(109, 240, 255, 0.4)");
  gradient.addColorStop(1, "rgba(109, 240, 255, 0)");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [
        {
          label: "Downloads per day",
          data: [18120, 19340, 20410, 21110, 22800, 24780, 26420],
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
            callback: (value) => `${value / 1000}k`,
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
      },
    },
  });
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
