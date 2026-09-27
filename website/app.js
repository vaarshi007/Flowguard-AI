// Flowguard-AI Web Dashboard Logic, SQLite Backend & Blynk REST API Bridge

const API_BASE_URL = "http://localhost:8000/api";

// --- Initial Fallback State (Volume in ml, Flow Rate in ml/min) ---
let beds = {
  "ICU-01": {
    bed_id: "ICU-01",
    patient_name: "A. Sharma (Bed 104)",
    room_no: "ICU Room 104",
    fluid_type: "Saline 0.9% (500ml)",
    current_volume_ml: 442.5,
    full_volume_ml: 500.0,
    percentage: 88.5,
    flow_rate_mlm: 4.6, // ml/min
    tte_minutes: 96,
    status: "NORMAL",
    blynk_token: "DEMO_TOKEN_1"
  },
  "ICU-02": {
    bed_id: "ICU-02",
    patient_name: "R. Verma (Bed 108)",
    room_no: "ICU Room 108",
    fluid_type: "Dextrose 5% (500ml)",
    current_volume_ml: 22.0,
    full_volume_ml: 500.0,
    percentage: 4.4,
    flow_rate_mlm: 5.1,
    tte_minutes: 4,
    status: "CRITICAL_LOW",
    blynk_token: "DEMO_TOKEN_2"
  },
  "ICU-03": {
    bed_id: "ICU-03",
    patient_name: "K. Patel (Bed 112)",
    room_no: "ICU Room 112",
    fluid_type: "Ringer's Lactate (1000ml)",
    current_volume_ml: 780.0,
    full_volume_ml: 1000.0,
    percentage: 78.0,
    flow_rate_mlm: 0.0, // Blocked line!
    tte_minutes: 999,
    status: "BLOCKED",
    blynk_token: "DEMO_TOKEN_3"
  }
};

let activeSelectedBed = "ICU-01";
let isSimulationMode = true;
let isDbConnected = false;
let isSoundEnabled = true;
let audioCtx = null;

let blynkToken = localStorage.getItem("blynk_token") || "";
let blynkServer = localStorage.getItem("blynk_server") || "blynk.cloud";
let chartInstance = null;
let chartHistoryData = { labels: [], volumes: [] };

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();

  initChart();
  setupEventListeners();
  checkDatabaseConnection();

  // Telemetry loop every 3 seconds
  setInterval(updateTelemetry, 3000);
});

// --- Sound Alert Synthesizer (Web Audio API) ---
function playAlertChime(freq = 880, type = 'sine') {
  if (!isSoundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    console.warn("Audio play error:", e);
  }
}

// --- Database Connectivity Check ---
async function checkDatabaseConnection() {
  const dbStatusEl = document.getElementById("db-status");
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (res.ok) {
      isDbConnected = true;
      if (dbStatusEl) {
        dbStatusEl.textContent = "Connected";
        dbStatusEl.className = "text-emerald-400 font-bold";
      }
      await fetchBedsFromDatabase();
    }
  } catch (err) {
    isDbConnected = false;
    if (dbStatusEl) {
      dbStatusEl.textContent = "Offline (Local State)";
      dbStatusEl.className = "text-slate-400";
    }
  }
}

async function fetchBedsFromDatabase() {
  try {
    const res = await fetch(`${API_BASE_URL}/beds`);
    if (res.ok) {
      const data = await res.json();
      const newBeds = {};
      data.forEach(bed => {
        newBeds[bed.bed_id] = bed;
      });
      beds = newBeds;
      populateBedSelectDropdown();
      renderBedCards();
    }
  } catch (err) {
    console.warn("Could not fetch beds from API:", err);
  }
}

// --- Setup UI Event Listeners ---
function setupEventListeners() {
  const toggleBtn = document.getElementById("toggle-sim-btn");
  const simText = document.getElementById("sim-mode-text");
  const soundBtn = document.getElementById("toggle-sound-btn");
  const soundText = document.getElementById("sound-text");
  const exportCsvBtn = document.getElementById("export-csv-btn");

  const openSettingsBtn = document.getElementById("open-settings-btn");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  const settingsModal = document.getElementById("settings-modal");

  const openPatientBtn = document.getElementById("open-add-patient-btn");
  const closePatientBtn = document.getElementById("close-patient-modal-btn");
  const patientModal = document.getElementById("patient-modal");
  const patientForm = document.getElementById("admit-patient-form");

  const openAlertsBtn = document.getElementById("open-alerts-log-btn");
  const closeAlertsBtn = document.getElementById("close-alerts-modal-btn");
  const alertsModal = document.getElementById("alerts-modal");

  const bedSelect = document.getElementById("bed-select");
  const tokenInput = document.getElementById("blynk-token-input");
  const serverInput = document.getElementById("blynk-server-input");

  populateBedSelectDropdown();

  if (blynkToken) {
    tokenInput.value = blynkToken;
    serverInput.value = blynkServer;
    isSimulationMode = false;
    simText.textContent = "Mode: Blynk Cloud Live";
  }

  // Toggle Sound Alerts
  soundBtn.addEventListener("click", () => {
    isSoundEnabled = !isSoundEnabled;
    soundText.textContent = isSoundEnabled ? "Audio: ON" : "Audio: OFF";
    soundBtn.classList.toggle("bg-cyan-500/10");
    soundBtn.classList.toggle("bg-slate-800");
    if (isSoundEnabled) playAlertChime(660);
  });

  // Export CSV
  exportCsvBtn.addEventListener("click", downloadCSVReport);

  toggleBtn.addEventListener("click", () => {
    isSimulationMode = !isSimulationMode;
    simText.textContent = isSimulationMode ? "Mode: Live Simulation" : "Mode: Blynk Cloud Live";
  });

  openSettingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
  closeSettingsBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));
  saveSettingsBtn.addEventListener("click", () => {
    blynkToken = tokenInput.value.trim();
    blynkServer = serverInput.value;
    localStorage.setItem("blynk_token", blynkToken);
    localStorage.setItem("blynk_server", blynkServer);
    if (blynkToken) {
      isSimulationMode = false;
      simText.textContent = "Mode: Blynk Cloud Live";
    }
    settingsModal.classList.add("hidden");
  });

  // Admit Patient Modal
  openPatientBtn.addEventListener("click", () => patientModal.classList.remove("hidden"));
  closePatientBtn.addEventListener("click", () => patientModal.classList.add("hidden"));
  patientForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bedId = document.getElementById("form-bed-id").value.trim().toUpperCase();
    const patientName = document.getElementById("form-patient-name").value.trim();
    const roomNo = document.getElementById("form-room-no").value.trim();
    const fluidType = document.getElementById("form-fluid-type").value;
    const fullVol = parseFloat(document.getElementById("form-full-volume").value);
    const token = document.getElementById("form-blynk-token").value.trim();

    const payload = {
      bed_id: bedId,
      patient_name: patientName,
      room_no: roomNo,
      fluid_type: fluidType,
      full_volume_ml: fullVol,
      blynk_token: token
    };

    if (isDbConnected) {
      try {
        await fetch(`${API_BASE_URL}/beds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        await fetchBedsFromDatabase();
      } catch (err) {
        console.error("Failed to save bed:", err);
      }
    } else {
      beds[bedId] = {
        ...payload,
        current_volume_ml: fullVol,
        percentage: 100.0,
        flow_rate_mlm: 4.6,
        tte_minutes: 108,
        status: "NORMAL"
      };
      populateBedSelectDropdown();
      renderBedCards();
    }

    patientModal.classList.add("hidden");
    patientForm.reset();
  });

  // Triage Alerts Modal
  openAlertsBtn.addEventListener("click", () => {
    alertsModal.classList.remove("hidden");
    fetchAndRenderAlertLogs();
  });
  closeAlertsBtn.addEventListener("click", () => alertsModal.classList.add("hidden"));

  bedSelect.addEventListener("change", (e) => {
    activeSelectedBed = e.target.value;
    const selected = beds[activeSelectedBed];
    document.getElementById("selected-bed-label").textContent = selected ? selected.patient_name || selected.name : activeSelectedBed;
    resetChartData();
  });
}

function populateBedSelectDropdown() {
  const bedSelect = document.getElementById("bed-select");
  if (!bedSelect) return;
  bedSelect.innerHTML = "";
  Object.keys(beds).forEach(bedId => {
    const opt = document.createElement("option");
    opt.value = bedId;
    opt.textContent = `${bedId} - ${beds[bedId].patient_name || beds[bedId].name || bedId}`;
    if (bedId === activeSelectedBed) opt.selected = true;
    bedSelect.appendChild(opt);
  });
}

// --- Render Ward Bed Cards ---
function renderBedCards() {
  const container = document.getElementById("bed-grid");
  if (!container) return;
  container.innerHTML = "";

  let hasCritical = false;

  Object.values(beds).forEach(bed => {
    const card = document.createElement("div");
    
    let badgeClass = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    let containerGlow = "border-slate-800 bg-slate-950";
    
    if (bed.status === "CRITICAL_LOW" || bed.status === "EMPTY") {
      badgeClass = "bg-rose-500/20 text-rose-400 border-rose-500/30";
      containerGlow = "border-rose-500/40 bg-rose-950/10 pulse-glow-red";
      hasCritical = true;
    } else if (bed.status === "BLOCKED") {
      badgeClass = "bg-amber-500/20 text-amber-400 border-amber-500/30";
      containerGlow = "border-amber-500/40 bg-amber-950/10 pulse-glow-amber";
      hasCritical = true;
    }

    const vol = bed.current_volume_ml !== undefined ? bed.current_volume_ml : bed.currentWeight || 500;
    const pct = bed.percentage !== undefined ? bed.percentage : 100;
    const flow = bed.flow_rate_mlm !== undefined ? bed.flow_rate_mlm : (bed.flow_rate || 4.6);
    const tte = bed.tte_minutes !== undefined ? bed.tte_minutes : 99;
    const patientName = bed.patient_name || bed.patient || bed.bed_id;
    const fluidType = bed.fluid_type || bed.fluidType || "Saline 0.9%";
    const bedId = bed.bed_id || bed.id;

    card.className = `${containerGlow} border rounded-2xl p-5 shadow-xl transition-all hover:scale-[1.01] flex flex-col justify-between`;

    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between mb-3">
          <div>
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">${bedId}</span>
            <h3 class="text-base font-bold text-slate-100">${patientName}</h3>
            <p class="text-xs text-slate-400">${fluidType}</p>
          </div>
          <span class="px-2.5 py-1 text-xs font-bold rounded-full border ${badgeClass}">
            ${bed.status}
          </span>
        </div>

        <div class="flex items-center gap-5 my-4 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <div class="flex flex-col items-center">
            <div class="iv-bottle-cap"></div>
            <div class="iv-bottle-container">
              <div class="iv-bottle-liquid" style="height: ${pct}%;"></div>
            </div>
            <div class="iv-drip-line">
              <div class="iv-drip-drop" style="animation-play-state: ${flow > 0 ? 'running' : 'paused'}"></div>
            </div>
          </div>

          <div class="flex-1 space-y-2">
            <div>
              <div class="flex justify-between text-xs text-slate-400 mb-1">
                <span>Fluid Level</span>
                <span class="font-mono font-bold text-slate-200">${pct.toFixed(1)}%</span>
              </div>
              <div class="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div class="bg-gradient-to-r from-teal-500 to-cyan-400 h-full rounded-full transition-all duration-700" style="width: ${pct}%"></div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs pt-1">
              <div class="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span class="text-slate-400 text-[10px] uppercase block">Volume</span>
                <span class="font-bold text-slate-100 font-mono text-sm">${vol.toFixed(1)} ml</span>
              </div>
              <div class="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span class="text-slate-400 text-[10px] uppercase block">Flow Rate</span>
                <span class="font-bold text-teal-400 font-mono text-sm">${flow.toFixed(1)} ml/m</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
        <div class="text-xs">
          <span class="text-slate-400">Est. Time-To-Empty:</span>
          <strong class="${tte <= 5 ? 'text-rose-400 animate-pulse' : 'text-slate-200'} font-mono ml-1">
            ${tte < 900 ? tte + ' mins' : 'N/A'}
          </strong>
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick="triggerResetBottle('${bedId}')" title="Set New Bottle (100%)" class="px-2.5 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-semibold rounded-lg transition flex items-center gap-1">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Set Full
          </button>
          <button onclick="triggerDischargeBed('${bedId}')" title="Discharge Patient" class="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs rounded-lg transition flex items-center">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  if (hasCritical && isSoundEnabled) {
    playAlertChime(950, 'sawtooth');
  }

  if (window.lucide) lucide.createIcons();
}

// --- Telemetry Loop ---
async function updateTelemetry() {
  if (isSimulationMode || !blynkToken) {
    simulateTelemetryData();
  } else {
    await fetchBlynkHardwareData();
  }

  if (isDbConnected) {
    const b = beds["ICU-01"];
    if (b) {
      try {
        await fetch(`${API_BASE_URL}/telemetry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bed_id: b.bed_id || "ICU-01",
            volume_ml: b.current_volume_ml !== undefined ? b.current_volume_ml : 440,
            percentage: b.percentage !== undefined ? b.percentage : 88,
            flow_rate_mlm: b.flow_rate_mlm !== undefined ? b.flow_rate_mlm : 4.6,
            tte_minutes: b.tte_minutes !== undefined ? b.tte_minutes : 96,
            status: b.status || "NORMAL"
          })
        });
      } catch (e) {
        console.warn("Telemetry post error:", e);
      }
    }
  }

  renderBedCards();
  updateChartData();
}

function simulateTelemetryData() {
  const bed1 = beds["ICU-01"];
  if (bed1) {
    let v = bed1.current_volume_ml !== undefined ? bed1.current_volume_ml : 442.5;
    let rate = bed1.flow_rate_mlm !== undefined ? bed1.flow_rate_mlm : 4.6;
    if (v > 10) {
      v -= (rate / 60) * 3;
      if (v < 0) v = 0;
      bed1.current_volume_ml = v;
      bed1.percentage = (v / (bed1.full_volume_ml || 500)) * 100;
      bed1.tte_minutes = Math.max(1, Math.round(v / rate));
    }
  }
}

async function fetchBlynkHardwareData() {
  try {
    const url = `https://${blynkServer}/external/api/get?token=${blynkToken}&V0&V1&V2&V3&V4`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const liveBed = beds["ICU-01"];
      if (liveBed) {
        if (data.V0 !== undefined) liveBed.current_volume_ml = parseFloat(data.V0);
        if (data.V1 !== undefined) liveBed.percentage = parseFloat(data.V1);
        if (data.V2 !== undefined) liveBed.flow_rate_mlm = parseFloat(data.V2);
        if (data.V3 !== undefined) liveBed.tte_minutes = parseInt(data.V3);
        if (data.V4 !== undefined) liveBed.status = data.V4;
      }
    }
  } catch (err) {
    console.warn("Blynk fetch error:", err);
  }
}

// --- Actions: Reset Bottle & Discharge Bed ---
async function triggerResetBottle(bedId) {
  if (isDbConnected) {
    try {
      await fetch(`${API_BASE_URL}/beds/${bedId}/reset-full`, { method: "POST" });
      await fetchBedsFromDatabase();
      alert(`Success: Bed ${bedId} reset to 100% full (ml) in SQLite Database!`);
      return;
    } catch (e) {
      console.error(e);
    }
  }

  const targetBed = beds[bedId];
  if (targetBed) {
    const full = targetBed.full_volume_ml || 500;
    targetBed.current_volume_ml = full;
    targetBed.percentage = 100.0;
    targetBed.status = "NORMAL";
    renderBedCards();
    resetChartData();
    alert(`Success: ${bedId} reset to 100% Full (${full} ml)!`);
  }
}

async function triggerDischargeBed(bedId) {
  if (!confirm(`Are you sure you want to discharge patient and remove Bed ${bedId}?`)) return;

  if (isDbConnected) {
    try {
      await fetch(`${API_BASE_URL}/beds/${bedId}`, { method: "DELETE" });
      await fetchBedsFromDatabase();
      alert(`Bed ${bedId} removed successfully.`);
      return;
    } catch (e) {
      console.error(e);
    }
  }

  delete beds[bedId];
  populateBedSelectDropdown();
  renderBedCards();
}

function triggerDischargeSelected() {
  triggerDischargeBed(activeSelectedBed);
}

function triggerResetSelected() {
  triggerResetBottle(activeSelectedBed);
}

// --- Download Excel / CSV Audit Report ---
function downloadCSVReport() {
  if (isDbConnected) {
    window.open(`${API_BASE_URL}/reports/export-csv`, '_blank');
  } else {
    // Generate Client CSV
    let csv = "Bed ID,Patient Name,Room No,Fluid Type,Current Volume (ml),Full Capacity (ml),Flow Rate (ml/min),Est TTE (mins),Status,Informed Status\n";
    Object.values(beds).forEach(b => {
      const vol = b.current_volume_ml !== undefined ? b.current_volume_ml : 500;
      const full = b.full_volume_ml !== undefined ? b.full_volume_ml : 500;
      const rate = b.flow_rate_mlm !== undefined ? b.flow_rate_mlm : 4.6;
      csv += `"${b.bed_id || b.id}","${b.patient_name || b.patient}","${b.room_no || ''}","${b.fluid_type || ''}",${vol.toFixed(1)},${full},${rate.toFixed(1)},${b.tte_minutes || 99},"${b.status}","Informed: Yes (Nurse Aishani)"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Flowguard_Clinical_Report.csv';
    a.click();
  }
}

// --- Render Triage Audit Logs ---
async function fetchAndRenderAlertLogs() {
  const container = document.getElementById("alerts-log-container");
  if (!container) return;
  container.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">Loading audit logs...</div>`;

  if (isDbConnected) {
    try {
      const res = await fetch(`${API_BASE_URL}/alerts`);
      if (res.ok) {
        const logs = await res.json();
        if (logs.length === 0) {
          container.innerHTML = `<div class="text-xs text-slate-500 p-4 text-center">No alerts logged yet.</div>`;
          return;
        }

        container.innerHTML = "";
        logs.forEach(log => {
          const div = document.createElement("div");
          div.className = "p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs";
          const informedText = log.acknowledged ? `Informed: Yes (${log.acknowledged_by})` : "Informed: Pending Nurse Ack";

          div.innerHTML = `
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-200">${log.bed_id} (${log.patient_name})</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${log.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}">${log.alert_type}</span>
              </div>
              <p class="text-slate-400 text-[11px] mt-0.5">Occlusion/Blocked Duration: <strong>${log.blocked_duration_mins} min</strong> | ${informedText}</p>
            </div>
            <div>
              ${log.acknowledged ? 
                `<span class="text-emerald-400 font-semibold flex items-center gap-1"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Ack Done</span>` : 
                `<button onclick="acknowledgeAlert(${log.id})" class="px-2.5 py-1 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-lg transition">Ack Alert</button>`
              }
            </div>
          `;
          container.appendChild(div);
        });
        if (window.lucide) lucide.createIcons();
        return;
      }
    } catch (e) {
      console.warn("Could not fetch alerts log:", e);
    }
  }

  // Fallback static view
  container.innerHTML = `
    <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
      <div>
        <span class="font-bold text-slate-200">ICU-03 (K. Patel)</span> — <span class="text-amber-400 font-semibold">BLOCKED</span>
        <p class="text-slate-400 text-[11px] mt-0.5">Flow Rate: 0.0 ml/min for 1 min | Informed: Yes (Nurse Aishani at 20:15)</p>
      </div>
      <button onclick="alert('Acknowledged as Duty Nurse')" class="px-2.5 py-1 bg-teal-500 text-slate-950 font-bold rounded-lg text-xs">Ack Alert</button>
    </div>
  `;
}

async function acknowledgeAlert(alertId) {
  const nurseName = prompt("Enter Nurse Name:", "Nurse Aishani");
  if (!nurseName) return;

  try {
    await fetch(`${API_BASE_URL}/alerts/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId, nurse_name: nurseName })
    });
    fetchAndRenderAlertLogs();
  } catch (e) {
    alert("Error acknowledging alert");
  }
}

// --- Chart.js ---
function initChart() {
  const ctx = document.getElementById("weightDepletionChart").getContext("2d");
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartHistoryData.labels,
      datasets: [{
        label: "Saline Volume (ml)",
        data: chartHistoryData.volumes,
        borderColor: "#14b8a6",
        backgroundColor: "rgba(20, 184, 166, 0.1)",
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: "#2dd4bf"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "rgba(51, 65, 85, 0.4)" }, ticks: { color: "#94a3b8", fontSize: 10 } },
        y: { grid: { color: "rgba(51, 65, 85, 0.4)" }, ticks: { color: "#94a3b8", fontSize: 10 }, title: { display: true, text: "Volume (ml)", color: "#64748b" } }
      },
      plugins: { legend: { display: false } }
    }
  });

  resetChartData();
}

function resetChartData() {
  const selected = beds[activeSelectedBed] || Object.values(beds)[0];
  chartHistoryData.labels = [];
  chartHistoryData.volumes = [];
  const now = new Date();
  const v = selected.current_volume_ml !== undefined ? selected.current_volume_ml : 500;
  const rate = selected.flow_rate_mlm !== undefined ? selected.flow_rate_mlm : 4.6;

  for (let i = 10; i >= 0; i--) {
    const timeStr = new Date(now.getTime() - i * 5000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    chartHistoryData.labels.push(timeStr);
    chartHistoryData.volumes.push(v + i * (rate / 12));
  }

  if (chartInstance) {
    chartInstance.data.labels = chartHistoryData.labels;
    chartInstance.data.datasets[0].data = chartHistoryData.volumes;
    chartInstance.update();
  }
}

function updateChartData() {
  if (!chartInstance) return;
  const selected = beds[activeSelectedBed] || Object.values(beds)[0];
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const v = selected.current_volume_ml !== undefined ? selected.current_volume_ml : 0;

  chartHistoryData.labels.push(timeStr);
  chartHistoryData.volumes.push(v);

  if (chartHistoryData.labels.length > 20) {
    chartHistoryData.labels.shift();
    chartHistoryData.volumes.shift();
  }

  chartInstance.update("quiet");
}
