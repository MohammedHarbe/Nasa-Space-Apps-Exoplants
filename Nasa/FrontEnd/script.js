// ---- CONFIG ----
// same machine: keep localhost; in prod, change to your API domain.
const API_BASE = "http://localhost:8080";

// ====== UI BOOT ======
document.addEventListener("DOMContentLoaded", () => {
  // Header scroll effect
  window.addEventListener("scroll", () => {
    const header = document.querySelector("header");
    if (!header) return;
    if (window.scrollY > 50) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  });

  // Tabs
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      const pane = document.querySelector(
        `.tab-content[data-tab="${tab.dataset.tab}"]`
      );
      if (pane) pane.classList.add("active");
    });
  });

  // Smooth nav
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute("href"));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Get Started → scroll to classify section
  document.querySelector(".get-started")?.addEventListener("click", () => {
    document.getElementById("classify")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });

  // Background stars + canvas planet
  createStarfield();
  animateHeroCanvas();

  // Hook the form to our model-only prediction
  const planetForm = document.getElementById("planetForm");
  if (planetForm) planetForm.addEventListener("submit", onPredictClick);

  // Optional extra button (kept for compatibility)
  document.getElementById("predictBtn")?.addEventListener("click", onPredictClick);
});

// ====== MODEL-ONLY INTEGRATION ======

/**
 * Collect features to send to the backend.
 * Preferred: add data-feature="exact_training_column" on each input.
 * Fallback: if no data-feature inputs exist, we read all inputs inside #planetForm
 * and use their ids as keys (backend can map them).
 */
function collectFeatures() {
  const withAttrs = document.querySelectorAll("[data-feature]");
  const features = {};

  if (withAttrs.length) {
    withAttrs.forEach((el) => {
      const key = el.dataset.feature; // training column name
      let val = el.value;
      if (el.type === "number" || el.inputMode === "numeric") {
        const num = parseFloat(val);
        val = Number.isNaN(num) ? null : num; // let the imputer handle nulls
      }
      features[key] = val;
    });
    return features;
  }

  // fallback: use ids from all inputs inside the form (no HTML changes needed)
  const form = document.getElementById("planetForm");
  form?.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.id) return;
    let val = el.value;
    if (el.type === "number" || el.inputMode === "numeric") {
      const num = parseFloat(val);
      val = Number.isNaN(num) ? null : num;
    }
    features[el.id] = val; // backend should map ids->training features or ignore extras
  });
  return features;
}

async function predictOne(features) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // expected: { prediction: "…", probabilities: [..] }
}

async function onPredictClick(e) {
  e.preventDefault();

  // just for showing the details card (not required for the API)
  const mass   = parseFloat(document.getElementById("mass")?.value ?? "");
  const radius = parseFloat(document.getElementById("radius")?.value ?? "");
  const period = parseFloat(document.getElementById("period")?.value ?? "");
  const temp   = parseFloat(document.getElementById("temp")?.value ?? "");

  const resultCard = document.getElementById("result");
  if (resultCard) {
    resultCard.className = "result-card";
    resultCard.innerHTML = `<p class="loading-message" style="text-align:center;padding:20px;">
      ... جاري التنبؤ بواسطة النموذج ...
    </p>`;
  }

  try {
    const feats = collectFeatures();
    const data  = await predictOne(feats); // { prediction, probabilities? }

    const predLabel = (data.prediction || "").toString().toUpperCase();
    // common NASA labels: CONFIRMED / CANDIDATE / FALSE POSITIVE
    const isExo = ["CONFIRMED", "CANDIDATE", "EXOPLANET"].includes(predLabel);

    let confidence = 75;
    if (Array.isArray(data.probabilities) && data.probabilities.length) {
      confidence = Math.round(Math.max(...data.probabilities) * 100);
    }

    displayResult(isExo, confidence, { mass, radius, period, temp });
    showResult(data); // optional raw display if you add an element with id="resultRaw"
  } catch (err) {
    console.error(err);
    displayResult(false, 0, { mass, radius, period, temp, error: "API Error" });
  }
}

// Optional helper if you want to dump raw text somewhere
function showResult(data) {
  const labelEl = document.getElementById("resultRaw"); // optional span/div
  if (labelEl) labelEl.textContent = `Prediction: ${data.prediction}`;
}

// ====== RESULT RENDERER (GLOBAL) ======
function displayResult(isExo, confidence, data) {
  const resultCard = document.getElementById("result");
  if (!resultCard) return;

  if (data.error) {
    resultCard.className = "result-card error";
    resultCard.innerHTML = `
      <span class="icon">⚠️</span>
      <h3>فشل التحليل (API Error)</h3>
      <p>حدث خطأ أثناء الاتصال بخادم النموذج. تأكد أن الباك إند يعمل بشكل سليم على <code>${API_BASE}</code>.</p>
    `;
    resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  resultCard.className = "result-card" + (isExo ? " success" : " error");

  const detailsHtml = `
    <div class="data-details">
      <p>Mass: ${data.mass ?? "-"} Earth masses</p>
      <p>Radius: ${data.radius ?? "-"} km</p>
      <p>Orbital Period: ${data.period ?? "-"} days</p>
      <p>Temperature: ${data.temp ?? "-"} K</p>
    </div>
  `;

  resultCard.innerHTML = `
    <span class="icon">${isExo ? "✅" : "❌"}</span>
    <h3>${isExo ? "Exoplanet Detected!" : "Not an Exoplanet"}</h3>
    <p>${isExo ? "This celestial body shows characteristics of an exoplanet."
                : "This celestial body resembles a solar system planet."}</p>
    ${detailsHtml}
    <div class="confidence">
      <p>Confidence: ${confidence}%</p>
      <div class="confidence-bar"><div class="fill" style="width:${confidence}%"></div></div>
    </div>
  `;

  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ====== VISUALS (stars + canvas) ======
function createStarfield() {
  const starfield = document.getElementById("starfield");
  if (!starfield) return;
  const starCount = 200;

  for (let i = 0; i < starCount; i++) {
    const star = document.createElement("div");
    star.className = "star";

    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const size = Math.random() * 3;
    const opacity = 0.1 + Math.random() * 0.9;
    const delay = Math.random() * 5;
    const duration = 3 + Math.random() * 7;

    star.style.cssText = `
      position:absolute; left:${x}%; top:${y}%;
      width:${size}px; height:${size}px;
      background:white; border-radius:50%;
      opacity:${opacity};
      animation: twinkle ${duration}s infinite ${delay}s;
    `;
    starfield.appendChild(star);
  }
}

function animateHeroCanvas() {
  const canvas = document.getElementById("planetCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let time = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Stars
    for (let i = 0; i < 50; i++) {
      ctx.beginPath();
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = Math.random() * 1.5;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(time * 0.02 + i) * 0.4})`;
      ctx.fill();
    }

    // Nebulas
    const nebulas = [
      { x: canvas.width * 0.2, y: canvas.height * 0.3, r: 100, c: "rgba(138,43,226,0.15)" },
      { x: canvas.width * 0.7, y: canvas.height * 0.6, r: 80,  c: "rgba(25,25,112,0.2)" },
      { x: canvas.width * 0.5, y: canvas.height * 0.5, r: 60,  c: "rgba(0,191,255,0.1)" }
    ];
    nebulas.forEach((n, i) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * (0.95 + 0.05 * Math.sin(time * 0.02 + i)), 0, Math.PI * 2);
      ctx.fillStyle = n.c;
      ctx.fill();
    });

    // Central planet
    const g = ctx.createRadialGradient(200, 200, 50, 200, 200, 150);
    g.addColorStop(0, "#4ECDC4");
    g.addColorStop(0.5, "#2D7A8E");
    g.addColorStop(1, "#0A1F2A");
    ctx.beginPath();
    ctx.arc(200, 200, 150, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Craters
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dist = 50 + Math.random() * 80;
      const x = 200 + Math.cos(ang) * dist;
      const y = 200 + Math.sin(ang) * dist;
      const r = 5 + Math.random() * 15;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(10,31,42,${0.5 + Math.random() * 0.3})`;
      ctx.fill();
    }

    // Rings
    [170, 185, 200].forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(200, 200, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(6,182,212,${0.3 - i * 0.1})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Orbiting planets
    const planets = [
      { color: "#FF6B6B", radius: 30, orbit: 400, speed: 0.0003 },
      { color: "#4ECDC4", radius: 25, orbit: 300, speed: 0.0005 },
      { color: "#95E1D3", radius: 20, orbit: 250, speed: 0.0007 },
    ];
    planets.forEach((p) => {
      const x = 200 + Math.cos(time * p.speed) * p.orbit;
      const y = 200 + Math.sin(time * p.speed) * p.orbit;

      const glow = ctx.createRadialGradient(x, y, 0, x, y, p.radius * 1.5);
      glow.addColorStop(0, p.color);
      glow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x - p.radius / 3, y - p.radius / 3, p.radius / 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fill();
    });

    time += 0.05;
    requestAnimationFrame(draw);
  }
  draw();
}
