// Flowguard-AI Interactive 3D Spatial Clinical Admin Dashboard Application Logic

// Dynamic Base URL: Works seamlessly on localhost, LAN (e.g. http://192.168.1.5:8000), or hosted cloud
const API_BASE_URL = (() => {
  if (typeof window !== "undefined" && window.location) {
    if (window.location.protocol.startsWith("http")) {
      return `${window.location.origin}/api`;
    }
  }
  return "http://localhost:8000/api";
})();

// --- State Repositories ---
let beds = {
  "ICU-01": {
    bed_id: "ICU-01",
    patient_name: "Unassigned Bed 01",
    age_gender: "N/A",
    doctor_name: "Dr. Petra Winburry",
    assigned_nurse: "Nurse Aishani",
    room_no: "ICU Ward 101",
    fluid_type: "Saline 0.9% (500ml)",
    current_volume_ml: 500.0,
    full_volume_ml: 500.0,
    percentage: 100.0,
    flow_rate_mlm: 0.0,
    tte_minutes: 999,
    status: "NORMAL",
    blynk_token: ""
  },
  "ICU-02": {
    bed_id: "ICU-02",
    patient_name: "Unassigned Bed 02",
    age_gender: "N/A",
    doctor_name: "Dr. Petra Winburry",
    assigned_nurse: "Nurse Tejaswini",
    room_no: "ICU Ward 102",
    fluid_type: "Saline 0.9% (500ml)",
    current_volume_ml: 500.0,
    full_volume_ml: 500.0,
    percentage: 100.0,
    flow_rate_mlm: 0.0,
    tte_minutes: 999,
    status: "NORMAL",
    blynk_token: ""
  }
};

let nurses = {
  "NURSE-01": { nurse_id: "NURSE-01", name: "Nurse Aishani", shift: "Morning (07:00 - 15:00)", contact: "+91 98765 43210", status: "On Duty", assigned_count: 1 },
  "NURSE-02": { nurse_id: "NURSE-02", name: "Nurse Tejaswini", shift: "Evening (15:00 - 23:00)", contact: "+91 98765 43211", status: "On Duty", assigned_count: 1 },
  "NURSE-03": { nurse_id: "NURSE-03", name: "Nurse Durga", shift: "Night (23:00 - 07:00)", contact: "+91 98765 43212", status: "On Standby", assigned_count: 0 }
};

let doctors = {
  "DOC-01": { doc_id: "DOC-01", name: "Dr. Petra Winburry", specialty: "Chief Intensivist (ICU)", contact: "+91 98111 22334", status: "Available" },
  "DOC-02": { doc_id: "DOC-02", name: "Dr. Rajesh Kumar", specialty: "General Medicine Lead", contact: "+91 98111 22335", status: "In Surgery" },
  "DOC-03": { doc_id: "DOC-03", name: "Dr. Ananya Roy", specialty: "Pediatric Care Specialist", contact: "+91 98111 22336", status: "Available" }
};

let activeSelectedBed = "ICU-01";
let currentTab = "dashboard";

let blynkToken = localStorage.getItem("blynk_token") || "";
let blynkServer = localStorage.getItem("blynk_server") || "blynk.cloud";
let isSimulationMode = !blynkToken; // If token is present, start in Blynk Live mode!
if (blynkToken && beds["ICU-01"]) beds["ICU-01"].blynk_token = blynkToken;

let isDbConnected = false;
let isSoundEnabled = true;

let alertAudioInterval = null;
let audioCtx = null;

let chartInstance = null;
let analyticsBarInstance = null;
let analyticsDoughnutInstance = null;
let chartHistoryData = { labels: [], volumes: [] };

document.addEventListener("DOMContentLoaded", () => {
  try {
    if (window.lucide) lucide.createIcons();

    initChart();
    setupEventListeners();
    checkDatabaseConnection();
    renderAllViews();

    // Telemetry loop every 3 seconds
    setInterval(updateTelemetry, 3000);
  } catch (err) {
    console.error("Flowguard-AI Init Error:", err);
  }
});

// --- SPA Page View Switcher (Global Window Scope) ---
window.switchTab = function(tabName) {
  currentTab = tabName;
  const views = document.querySelectorAll(".page-view");
  views.forEach(v => v.classList.add("hidden"));

  const target = document.getElementById(`view-${tabName}`);
  if (target) target.classList.remove("hidden");

  const navBtns = document.querySelectorAll("nav button");
  navBtns.forEach(btn => {
    btn.classList.remove("nav-active", "text-white");
    btn.classList.add("text-slate-600");
  });

  const activeBtn = document.getElementById(`nav-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add("nav-active");
    activeBtn.classList.remove("text-slate-600");
  }

  if (tabName === 'analytics') initAnalyticsCharts();
  renderAllViews();
};

// --- Render All Pages & Components ---
function renderAllViews() {
  renderBedCards();
  renderPatientsTable();
  renderNurseRoster();
  renderDoctorsGrid();
  fetchAndRenderAlertLogs();
  setTimeout(init3DTiltEffect, 100);
}

// --- Card Hover Logic (Stationary Cards with Hover Highlights) ---
function init3DTiltEffect() {
  // Card movement disabled as per user request — cards stay stationary with clean glow & bottle highlight
}

// --- Continuous Sound Synthesizer ---
function playAlertChime(freq = 900, type = 'sawtooth') {
  if (!isSoundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, audioCtx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) { console.warn("Audio error:", e); }
}

function manageContinuousAudio(hasActiveCriticalAlert) {
  if (hasActiveCriticalAlert && isSoundEnabled) {
    if (!alertAudioInterval) {
      playAlertChime(950, 'sawtooth');
      alertAudioInterval = setInterval(() => {
        playAlertChime(950, 'sawtooth');
      }, 1500);
    }
  } else {
    if (alertAudioInterval) {
      clearInterval(alertAudioInterval);
      alertAudioInterval = null;
    }
  }
}

// --- SQLite Database Connectivity Check ---
async function checkDatabaseConnection() {
  const dbStatusEl = document.getElementById("db-status");
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (res.ok) {
      isDbConnected = true;
      if (dbStatusEl) {
        dbStatusEl.textContent = "Connected";
        dbStatusEl.className = "text-emerald-600 font-bold";
      }
      await fetchBedsFromDatabase();
      await fetchNursesFromDatabase();
      await fetchDoctorsFromDatabase();
    }
  } catch (err) {
    isDbConnected = false;
    if (dbStatusEl) {
      dbStatusEl.textContent = "Offline (Local State)";
      dbStatusEl.className = "text-slate-400 font-medium";
    }
    renderAllViews();
  }
}

async function fetchBedsFromDatabase() {
  try {
    const res = await fetch(`${API_BASE_URL}/beds`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const newBeds = {};
        data.forEach(bed => { newBeds[bed.bed_id] = bed; });
        beds = newBeds;
      }
      populateBedSelectDropdown();
      renderAllViews();
    }
  } catch (err) { console.warn(err); }
}

async function fetchNursesFromDatabase() {
  try {
    const res = await fetch(`${API_BASE_URL}/nurses`);
    if (res.ok) {
      const data = await res.json();
      const newNurses = {};
      data.forEach(n => { newNurses[n.nurse_id] = n; });
      nurses = newNurses;
      renderNurseRoster();
      populateNurseSelectDropdown();
    }
  } catch (err) { console.warn(err); }
}

async function fetchDoctorsFromDatabase() {
  try {
    const res = await fetch(`${API_BASE_URL}/doctors`);
    if (res.ok) {
      const data = await res.json();
      const newDocs = {};
      data.forEach(d => { newDocs[d.doc_id] = d; });
      doctors = newDocs;
      renderDoctorsGrid();
    }
  } catch (err) { console.warn(err); }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  const toggleBtn = document.getElementById("toggle-sim-btn");
  const simText = document.getElementById("sim-mode-text");
  const soundBtn = document.getElementById("toggle-sound-btn");
  const soundText = document.getElementById("sound-text");

  const openPatientBtn = document.getElementById("open-add-patient-btn");
  const closePatientBtn = document.getElementById("close-patient-modal-btn");
  const patientModal = document.getElementById("patient-modal");
  const patientForm = document.getElementById("admit-patient-form");

  const openNurseBtn = document.getElementById("open-add-nurse-btn");
  const closeNurseBtn = document.getElementById("close-nurse-modal-btn");
  const nurseModal = document.getElementById("nurse-modal");
  const nurseForm = document.getElementById("add-nurse-form");

  populateBedSelectDropdown();
  populateNurseSelectDropdown();

  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      isSoundEnabled = !isSoundEnabled;
      if (soundText) soundText.textContent = isSoundEnabled ? "Audio: Continuous ON" : "Audio: Muted";
      if (!isSoundEnabled && alertAudioInterval) {
        clearInterval(alertAudioInterval);
        alertAudioInterval = null;
      }
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      isSimulationMode = !isSimulationMode;
      updateSimButtonUI();
      if (!isSimulationMode) {
        fetchBlynkHardwareData();
      }
    });
  }

  // Pre-fill hardware setup fields from localStorage
  const tokenInput = document.getElementById("settings-token-input");
  const serverInput = document.getElementById("settings-server-input");
  if (tokenInput && blynkToken) tokenInput.value = blynkToken;
  if (serverInput && blynkServer) serverInput.value = blynkServer;

  updateSimButtonUI();
  updateBlynkStatusUI(false, blynkToken ? "Configured" : "No Token");

  if (openPatientBtn && patientModal) {
    openPatientBtn.addEventListener("click", () => patientModal.classList.remove("hidden"));
  }
  if (closePatientBtn && patientModal) {
    closePatientBtn.addEventListener("click", () => patientModal.classList.add("hidden"));
  }

  if (patientForm) {
    patientForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const bedId = document.getElementById("form-bed-id")?.value.trim().toUpperCase() || "ICU-04";
      const patientName = document.getElementById("form-patient-name")?.value.trim() || "M. Rao";
      const ageGender = document.getElementById("form-age-gender")?.value.trim() || "45/M";
      const doctorName = document.getElementById("form-doctor-name")?.value.trim() || "Dr. Petra Winburry";
      const assignedNurse = document.getElementById("form-assigned-nurse")?.value || "Nurse Aishani";
      const roomNo = document.getElementById("form-room-no")?.value.trim() || "ICU Room 201";
      const fluidType = document.getElementById("form-fluid-type")?.value || "Saline 0.9% (500ml)";
      const fullVol = parseFloat(document.getElementById("form-full-volume")?.value) || 500.0;
      const token = document.getElementById("form-blynk-token")?.value.trim() || "";

      const newBedObj = {
        bed_id: bedId,
        patient_name: patientName,
        age_gender: ageGender,
        doctor_name: doctorName,
        assigned_nurse: assignedNurse,
        room_no: roomNo,
        fluid_type: fluidType,
        full_volume_ml: fullVol,
        current_volume_ml: fullVol,
        percentage: 100.0,
        flow_rate_mlm: 4.6,
        tte_minutes: Math.round(fullVol / 4.6),
        status: "NORMAL",
        blynk_token: token
      };

      beds[bedId] = newBedObj;
      populateBedSelectDropdown();
      renderAllViews();

      if (isDbConnected) {
        try {
          await fetch(`${API_BASE_URL}/beds`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newBedObj)
          });
          await fetchBedsFromDatabase();
        } catch (err) { console.warn(err); }
      }

      if (patientModal) patientModal.classList.add("hidden");
      patientForm.reset();
      alert(`Success: Patient ${patientName} admitted to Bed ${bedId}!`);
    });
  }

  window.openAddNurseModal = function() {
    const idEl = document.getElementById("nurse-form-id");
    const nameEl = document.getElementById("nurse-form-name");
    const titleEl = document.getElementById("nurse-modal-title");
    const nModal = document.getElementById("nurse-modal");

    if (idEl) idEl.value = "";
    if (nameEl) nameEl.value = "";
    if (titleEl) titleEl.innerHTML = `<i data-lucide="user-check" class="w-5 h-5 text-cyan-600"></i> Add Nurse to Roster`;
    if (nModal) nModal.classList.remove("hidden");
  };

  if (openNurseBtn) {
    openNurseBtn.addEventListener("click", window.openAddNurseModal);
  }

  if (closeNurseBtn && nurseModal) {
    closeNurseBtn.addEventListener("click", () => nurseModal.classList.add("hidden"));
  }

  if (nurseForm) {
    nurseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nId = document.getElementById("nurse-form-id")?.value.trim().toUpperCase() || "NURSE-04";
      const nName = document.getElementById("nurse-form-name")?.value.trim() || "Nurse Priya";
      const nShift = document.getElementById("nurse-form-shift")?.value || "Morning (07:00 - 15:00)";
      const nStatus = document.getElementById("nurse-form-status")?.value || "On Duty";
      const nContact = document.getElementById("nurse-form-contact")?.value.trim() || "+91 98765 43210";

      const newNurseObj = { nurse_id: nId, name: nName, shift: nShift, status: nStatus, contact: nContact, assigned_count: 0 };
      nurses[nId] = newNurseObj;
      renderNurseRoster();
      populateNurseSelectDropdown();

      if (isDbConnected) {
        try {
          await fetch(`${API_BASE_URL}/nurses`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newNurseObj)
          });
        } catch (err) { console.warn(err); }
      }

      if (nurseModal) nurseModal.classList.add("hidden");
      nurseForm.reset();
      alert(`Success: ${nName} added to Nurse Roster!`);
    });
  }
}

function openEditNurseModal(nurseId) {
  const n = nurses[nurseId];
  if (!n) return;
  document.getElementById("nurse-form-id").value = n.nurse_id;
  document.getElementById("nurse-form-name").value = n.name;
  document.getElementById("nurse-form-shift").value = n.shift;
  document.getElementById("nurse-form-status").value = n.status;
  document.getElementById("nurse-form-contact").value = n.contact;
  document.getElementById("nurse-modal-title").innerHTML = `<i data-lucide="edit" class="w-5 h-5 text-cyan-600"></i> Edit Nurse Record`;
  document.getElementById("nurse-modal").classList.remove("hidden");
}

function populateBedSelectDropdown() {
  const bedSelect = document.getElementById("bed-select");
  if (!bedSelect) return;
  bedSelect.innerHTML = "";
  Object.keys(beds).forEach(bedId => {
    const opt = document.createElement("option");
    opt.value = bedId;
    opt.textContent = `${bedId} - ${beds[bedId].patient_name || bedId}`;
    if (bedId === activeSelectedBed) opt.selected = true;
    bedSelect.appendChild(opt);
  });
}

function populateNurseSelectDropdown() {
  const select = document.getElementById("form-assigned-nurse");
  if (!select) return;
  select.innerHTML = "";
  Object.values(nurses).forEach(n => {
    const opt = document.createElement("option");
    opt.value = n.name;
    opt.textContent = `${n.name} (${n.shift.split(' ')[0]})`;
    select.appendChild(opt);
  });
}

// --- Render Page View 1: Bed Cards Grid ---
// Map to track stagnation / zero flow duration per bed: { bedId: startTime }
const zeroFlowTimers = {};

// --- Predictive Triage Evaluator Guard (7-Second Weight-Stagnation Occlusion Detection) ---
function evaluateBedStatus(vol, pct, flow, tte, fullVol = 500, bedId = "ICU-01") {
  // 1. Truly Empty
  if (vol <= 5.0 || pct <= 2.0) {
    delete zeroFlowTimers[bedId];
    return "EMPTY";
  }

  // 2. Critical Low threshold: <= 15% of bottle capacity (works for 100ml, 250ml, 500ml, 1000ml)
  const criticalThreshold = Math.max(15.0, fullVol * 0.15);
  if (pct <= 15.0 || vol <= criticalThreshold || (tte <= 5 && pct <= 25.0)) {
    delete zeroFlowTimers[bedId];
    return "CRITICAL_LOW";
  }

  // 3. Occlusion / Line Blockage Check:
  // If weight remains stagnant / flow rate is 0.0 (< 0.1 ml/min) while bottle has fluid:
  // Triggers even if bottle is full (85% - 100%) after the 7-second time limit!
  if (flow < 0.1 && vol > 5.0) {
    if (!zeroFlowTimers[bedId]) {
      zeroFlowTimers[bedId] = Date.now();
    }
    const elapsedSeconds = (Date.now() - zeroFlowTimers[bedId]) / 1000;
    if (elapsedSeconds >= 7.0) {
      return "BLOCKED";
    }
    return "NORMAL"; // 7-second grace window
  }

  // 4. Fluid is actively flowing -> reset stagnation timer
  delete zeroFlowTimers[bedId];
  return "NORMAL";
}

// --- Render Page View 1: Bed Cards Grid ---
function renderBedCards() {
  const container = document.getElementById("bed-grid");
  if (!container) return;
  container.innerHTML = "";

  let hasCritical = false;
  let activeBedsCount = Object.keys(beds).length;
  let normalCount = 0;
  let alertCount = 0;

  Object.values(beds).forEach(bed => {
    const fullVol = bed.full_volume_ml || 500;
    const vol = bed.current_volume_ml !== undefined ? bed.current_volume_ml : fullVol;
    const pct = bed.percentage !== undefined ? bed.percentage : 100;
    const flow = bed.flow_rate_mlm !== undefined ? bed.flow_rate_mlm : 4.6;
    const tte = bed.tte_minutes !== undefined ? bed.tte_minutes : 96;
    const bedId = bed.bed_id || bed.id || "ICU-01";

    // Evaluate status dynamically with 7s stagnation detection
    bed.status = evaluateBedStatus(vol, pct, flow, tte, fullVol, bedId);

    const card = document.createElement("div");
    let badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
    let containerGlow = "card-3d bed-card-item border-slate-200/80";
    
    if (bed.status === "CRITICAL_LOW" || bed.status === "EMPTY") {
      badgeClass = "bg-rose-100 text-rose-700 border-rose-200 font-bold";
      containerGlow = "card-3d bed-card-item bg-rose-50/50 border-rose-300 pulse-glow-red";
      hasCritical = true;
      alertCount++;
    } else if (bed.status === "BLOCKED") {
      badgeClass = "bg-amber-100 text-amber-800 border-amber-200 font-bold";
      containerGlow = "card-3d bed-card-item bg-amber-50/50 border-amber-300 pulse-glow-amber";
      hasCritical = true;
      alertCount++;
    } else {
      normalCount++;
    }

    const patientName = bed.patient_name || bed.bed_id;
    const ageGender = bed.age_gender || "45/M";
    const doctorName = bed.doctor_name || "Dr. Petra Winburry";
    const assignedNurse = bed.assigned_nurse || "Nurse Aishani";
    const fluidType = bed.fluid_type || "Saline 0.9%";

    const strokeDash = 150.8 * (1 - Math.min(100, Math.max(0, pct)) / 100);

    card.className = `${containerGlow} p-5 flex flex-col justify-between`;
    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-extrabold text-cyan-600 bg-cyan-50/80 px-3 py-1 rounded-full border border-cyan-200/80 shadow-xs">${bedId}</span>
              <span class="text-[11px] font-bold text-slate-500">${bed.room_no || 'ICU Ward'}</span>
            </div>
            <h3 class="text-sm font-extrabold text-slate-900 mt-1.5">${patientName} <span class="text-xs font-semibold text-slate-500">(${ageGender})</span></h3>
            <p class="text-[11px] text-slate-500 font-medium mt-0.5">Doc: <strong class="text-slate-700">${doctorName}</strong> | Nurse: <strong class="text-cyan-700">${assignedNurse}</strong></p>
          </div>
          <span class="px-3 py-1 text-[11px] font-extrabold rounded-full border ${badgeClass}">${bed.status}</span>
        </div>

        <div class="flex items-center justify-between gap-3 my-3 bg-white/60 p-3.5 rounded-2xl border border-white/80 shadow-xs">
          <!-- IV Saline Bottle Visual -->
          <div class="iv-bottle-3d-wrapper flex flex-col items-center shrink-0">
            <div class="iv-bottle-cap"></div>
            <div class="iv-bottle-container">
              <div class="iv-bottle-liquid" style="height: ${pct}%;"></div>
            </div>
            <div class="iv-drip-line">
              <div class="iv-drip-drop" style="animation-play-state: ${flow > 0 ? 'running' : 'paused'}"></div>
            </div>
          </div>

          <!-- Circular Glass Percentage Gauge (PrepPilot Style) -->
          <div class="glass-gauge-wrapper shrink-0">
            <svg class="w-16 h-16 transform -rotate-90">
              <circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="4" class="text-slate-200/80" fill="transparent"/>
              <circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="4" class="${pct <= 10 ? 'text-rose-500' : (pct <= 25 ? 'text-amber-500' : 'text-cyan-600')}" stroke-dasharray="150.8" stroke-dashoffset="${strokeDash}" stroke-linecap="round" fill="transparent" style="transition: stroke-dashoffset 0.8s ease;"/>
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span class="text-xs font-black text-slate-900 leading-none">${pct.toFixed(0)}%</span>
              <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-tight scale-90">Fluid</span>
            </div>
          </div>

          <!-- Telemetry Stats Column -->
          <div class="flex-1 space-y-1.5 pl-1">
            <div class="text-[11px] font-bold text-slate-700 truncate">${fluidType}</div>
            <div class="grid grid-cols-2 gap-1.5 text-[11px]">
              <div class="bg-white/80 p-1.5 rounded-xl border border-slate-200/60 shadow-2xs">
                <span class="text-slate-400 text-[9px] uppercase font-bold block">Volume</span>
                <span class="font-extrabold text-slate-900">${vol.toFixed(1)} ml</span>
              </div>
              <div class="bg-white/80 p-1.5 rounded-xl border border-slate-200/60 shadow-2xs">
                <span class="text-slate-400 text-[9px] uppercase font-bold block">Rate</span>
                <span class="font-extrabold text-cyan-600">${flow.toFixed(1)} ml/m</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2 text-xs">
        <div>
          <span class="text-slate-500 font-medium">Est TTE:</span>
          <strong class="${tte <= 5 ? 'text-rose-600 animate-pulse' : 'text-slate-800'} font-bold ml-1">
            ${tte < 900 ? tte + ' mins' : 'N/A'}
          </strong>
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick="triggerResetBottle('${bedId}')" title="Set New Bottle (100% Full Capacity)" class="btn-3d px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-full transition flex items-center gap-1 text-[11px] shadow-sm">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Full
          </button>
          <button onclick="triggerTareHook('${bedId}')" title="Zero Tare Calibration (0.0g Empty Hook)" class="btn-3d px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full transition flex items-center gap-1 text-[11px] shadow-sm">
            <i data-lucide="scale" class="w-3.5 h-3.5"></i> Tare
          </button>
          <button onclick="triggerDischargeBed('${bedId}')" title="Discharge Patient" class="btn-3d px-2 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-full transition">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  const bCount = document.getElementById("stat-active-beds");
  if (bCount) bCount.textContent = activeBedsCount;
  const nCount = document.getElementById("stat-normal-infusions");
  if (nCount) nCount.textContent = normalCount;
  const cCount = document.getElementById("stat-critical-alerts");
  if (cCount) cCount.textContent = alertCount;
  const sBadge = document.getElementById("sidebar-alert-badge");
  if (sBadge) sBadge.textContent = alertCount;

  // Dynamically update Priority Triage Banner
  const banner = document.getElementById("triage-banner");
  if (banner) {
    const criticalBed = Object.values(beds).find(b => b.status === "EMPTY") ||
                        Object.values(beds).find(b => b.status === "CRITICAL_LOW") ||
                        Object.values(beds).find(b => b.status === "BLOCKED");

    if (criticalBed) {
      banner.classList.remove("hidden");
      const cBedId = criticalBed.bed_id || "ICU-01";
      const cRoom = criticalBed.room_no || "ICU Ward";
      const cVol = (criticalBed.current_volume_ml !== undefined ? criticalBed.current_volume_ml : 500).toFixed(1);
      const cTte = criticalBed.tte_minutes !== undefined ? criticalBed.tte_minutes : 96;

      const bannerBedEl = document.getElementById("banner-bed-id");
      if (bannerBedEl) bannerBedEl.textContent = `Bed ${cBedId} (${cRoom})`;

      const bannerTitleEl = document.getElementById("alert-title");
      if (bannerTitleEl) {
        if (criticalBed.status === "EMPTY") {
          bannerTitleEl.innerHTML = `Saline Bottle Empty (0.0 ml remaining) — Immediate Replacement Required!`;
        } else if (criticalBed.status === "BLOCKED") {
          bannerTitleEl.innerHTML = `Infusion Line Blocked/Occluded — Immediate Nurse Intervention Required!`;
        } else {
          bannerTitleEl.innerHTML = `Low Saline Warning (${cVol} ml remaining) — Estimated Empty in <span class="text-rose-600 font-extrabold underline">${cTte < 900 ? cTte + ' Minutes' : 'N/A'}</span>`;
        }
      }

      const bannerBtn = banner.querySelector("button");
      if (bannerBtn) {
        bannerBtn.setAttribute("onclick", `triggerResetBottle('${cBedId}')`);
      }
    } else {
      banner.classList.add("hidden");
    }
  }

  manageContinuousAudio(hasCritical);
  if (window.lucide) lucide.createIcons();
}

// --- Render Nurse Duty Roster Panel ---
function renderNurseRoster() {
  const container = document.getElementById("nurses-full-grid");
  const sidebarContainer = document.getElementById("nurse-roster-container");
  
  if (sidebarContainer) {
    sidebarContainer.innerHTML = "";
    Object.values(nurses).forEach(n => {
      const card = document.createElement("div");
      card.className = "p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between text-xs";
      card.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-cyan-100 text-cyan-700 font-bold flex items-center justify-center text-xs shadow-xs">
            ${n.name.replace('Nurse ', '').charAt(0)}
          </div>
          <div>
            <h4 class="font-bold text-slate-900">${n.name}</h4>
            <p class="text-[10px] text-slate-500">${n.shift}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${n.status === 'On Duty' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">${n.status}</span>
          <button onclick="openEditNurseModal('${n.nurse_id}')" class="text-slate-400 hover:text-cyan-600"><i data-lucide="edit-2" class="w-3.5 h-3.5"></i></button>
        </div>
      `;
      sidebarContainer.appendChild(card);
    });
  }

  if (container) {
    container.innerHTML = "";
    Object.values(nurses).forEach(n => {
      const card = document.createElement("div");
      card.className = "card-3d p-6 space-y-3";
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-cyan-600 text-white font-extrabold flex items-center justify-center text-sm shadow">
              ${n.name.replace('Nurse ', '').charAt(0)}
            </div>
            <div>
              <h3 class="font-extrabold text-slate-900 text-sm">${n.name}</h3>
              <p class="text-xs text-slate-500">${n.nurse_id}</p>
            </div>
          </div>
          <button onclick="openEditNurseModal('${n.nurse_id}')" class="btn-3d px-3 py-1 text-xs font-bold text-cyan-600 bg-cyan-50 rounded-xl border border-cyan-200 hover:bg-cyan-100 flex items-center gap-1">
            <i data-lucide="edit" class="w-3.5 h-3.5"></i> Edit
          </button>
        </div>
        <div class="text-xs space-y-1.5 text-slate-600 pt-3 border-t border-slate-100">
          <div>Shift: <strong class="text-slate-800">${n.shift}</strong></div>
          <div>Duty Status: <strong class="${n.status === 'On Duty' ? 'text-emerald-600' : 'text-slate-500'} font-bold">${n.status}</strong></div>
          <div>Contact: <strong class="text-slate-800">${n.contact}</strong></div>
        </div>
      `;
      container.appendChild(card);
    });
  }
}

// --- Render Patients Table & Doctors ---
function renderPatientsTable() {
  const tbody = document.getElementById("patients-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  Object.values(beds).forEach(b => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 border-b border-slate-100";
    const vol = b.current_volume_ml !== undefined ? b.current_volume_ml : 500;
    const flow = b.flow_rate_mlm !== undefined ? b.flow_rate_mlm : 4.6;

    tr.innerHTML = `
      <td class="py-3 px-4 font-bold text-cyan-600">${b.bed_id}</td>
      <td class="py-3 px-4 font-bold text-slate-900">${b.patient_name}</td>
      <td class="py-3 px-4 text-slate-500">${b.age_gender || '45/M'}</td>
      <td class="py-3 px-4 text-slate-600">${b.room_no || 'ICU Ward'}</td>
      <td class="py-3 px-4 text-slate-600">${b.fluid_type}</td>
      <td class="py-3 px-4 font-mono font-bold">${vol.toFixed(1)} ml</td>
      <td class="py-3 px-4 font-mono font-bold text-cyan-600">${flow.toFixed(1)} ml/m</td>
      <td class="py-3 px-4 text-slate-700">${b.doctor_name || 'Dr. Petra'}</td>
      <td class="py-3 px-4 text-cyan-700 font-semibold">${b.assigned_nurse || 'Nurse Aishani'}</td>
      <td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${b.status === 'NORMAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${b.status}</span></td>
      <td class="py-3 px-4 text-right">
        <button onclick="triggerResetBottle('${b.bed_id}')" class="text-cyan-600 font-bold hover:underline mr-2">Full</button>
        <button onclick="triggerTareHook('${b.bed_id}')" class="text-amber-600 font-bold hover:underline mr-2">Tare</button>
        <button onclick="triggerDischargeBed('${b.bed_id}')" class="text-rose-600 font-bold hover:underline">Discharge</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDoctorsGrid() {
  const container = document.getElementById("doctors-full-grid");
  if (!container) return;
  container.innerHTML = "";
  Object.values(doctors).forEach(d => {
    const card = document.createElement("div");
    card.className = "card-3d p-6 space-y-3";
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=100&auto=format&fit=crop&q=80" class="w-10 h-10 rounded-full object-cover border-2 border-cyan-500 shadow-sm">
          <div>
            <h3 class="font-extrabold text-slate-900 text-sm">${d.name}</h3>
            <p class="text-xs text-cyan-600 font-bold">${d.specialty}</p>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-full text-xs font-bold ${d.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${d.status}</span>
      </div>
      <div class="text-xs space-y-1 text-slate-600 pt-3 border-t border-slate-100">
        <div>Doctor ID: <strong class="text-slate-800">${d.doc_id}</strong></div>
        <div>Contact: <strong class="text-slate-800">${d.contact}</strong></div>
      </div>
    `;
    container.appendChild(card);
  });
}

// --- Render Triage Alert Logs ---
async function fetchAndRenderAlertLogs() {
  const container = document.getElementById("alerts-log-container");
  const fullPageContainer = document.getElementById("alerts-page-full-list");
  if (!container && !fullPageContainer) return;

  if (isDbConnected) {
    try {
      const res = await fetch(`${API_BASE_URL}/alerts`);
      if (res.ok) {
        const logs = await res.json();
        renderAlertLogItems(logs, container, fullPageContainer);
        return;
      }
    } catch (e) { console.warn(e); }
  }

  const fallbackLogs = [
    { id: 1, bed_id: "ICU-02", patient_name: "R. Verma", alert_type: "CRITICAL_LOW", severity: "HIGH", created_at: new Date().toISOString(), blocked_duration_mins: 0, acknowledged: 0, acknowledged_by: "" }
  ];
  renderAlertLogItems(fallbackLogs, container, fullPageContainer);
}

function renderAlertLogItems(logs, container, fullContainer) {
  if (container) container.innerHTML = "";
  if (fullContainer) fullContainer.innerHTML = "";

  logs.forEach(log => {
    if (log.resolved_at) return;

    const informedText = log.acknowledged ? `Informed: Yes (${log.acknowledged_by})` : "Informed: Pending Nurse Ack";
    const itemHTML = `
      <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between text-xs shadow-xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-900">${log.bed_id} (${log.patient_name})</span>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${log.severity === 'HIGH' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}">${log.alert_type}</span>
          </div>
          <p class="text-slate-500 text-[11px] mt-0.5">Occlusion Duration: <strong>${log.blocked_duration_mins} min</strong> | ${informedText}</p>
        </div>
        <div>
          ${log.acknowledged ? 
            `<span class="text-emerald-600 font-bold flex items-center gap-1 text-[11px]"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Ack Done</span>` : 
            `<button onclick="acknowledgeAlert(${log.id})" class="btn-3d px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white font-extrabold rounded-xl text-xs shadow-sm">Ack Alert</button>`
          }
        </div>
      </div>
    `;

    if (container) container.innerHTML += itemHTML;
    if (fullContainer) fullContainer.innerHTML += itemHTML;
  });

  if (window.lucide) lucide.createIcons();
}

async function acknowledgeAlert(alertId) {
  const nurseName = prompt("Enter Nurse Name:", "Nurse Aishani");
  if (!nurseName) return;

  if (isDbConnected) {
    try {
      await fetch(`${API_BASE_URL}/alerts/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, nurse_name: nurseName })
      });
      fetchAndRenderAlertLogs();
    } catch (e) { alert("Error acknowledging alert"); }
  } else {
    alert(`Alert ${alertId} acknowledged by ${nurseName}`);
    fetchAndRenderAlertLogs();
  }
}

// --- Telemetry Loop ---
async function updateTelemetry() {
  if (isSimulationMode || !blynkToken) {
    simulateTelemetryData();
  } else {
    await fetchBlynkHardwareData();
  }

  if (isDbConnected) {
    for (const bedId in beds) {
      const b = beds[bedId];
      if (b) {
        try {
          await fetch(`${API_BASE_URL}/telemetry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bed_id: b.bed_id || bedId,
              volume_ml: b.current_volume_ml !== undefined ? b.current_volume_ml : 500,
              percentage: b.percentage !== undefined ? b.percentage : 100,
              flow_rate_mlm: b.flow_rate_mlm !== undefined ? b.flow_rate_mlm : 4.6,
              tte_minutes: b.tte_minutes !== undefined ? b.tte_minutes : 96,
              status: b.status || "NORMAL"
            })
          });
        } catch (e) { console.warn(e); }
      }
    }
  }

  renderAllViews();
  updateChartData();
}

function simulateTelemetryData() {
  Object.values(beds).forEach(bed => {
    if (!bed) return;
    const full = bed.full_volume_ml || 500;
    let v = bed.current_volume_ml !== undefined ? bed.current_volume_ml : full;
    let rate = bed.flow_rate_mlm !== undefined ? bed.flow_rate_mlm : 4.6;
    if (rate <= 0) rate = 4.6;
    bed.flow_rate_mlm = rate;

    if (v > 0) {
      v -= (rate / 60) * 3; // 3 seconds interval
      if (v < 0) v = 0;
      bed.current_volume_ml = Math.max(0, v);
      bed.percentage = Math.min(100, Math.max(0, (v / full) * 100));
      bed.tte_minutes = rate > 0.1 ? Math.max(1, Math.round(v / rate)) : 999;
      bed.status = evaluateBedStatus(bed.current_volume_ml, bed.percentage, bed.flow_rate_mlm, bed.tte_minutes, full, bed.bed_id || "ICU-01");
    }
  });
}

async function fetchBlynkHardwareData() {
  try {
    for (const bedId in beds) {
      const bed = beds[bedId];
      const tokenToUse = (bed.blynk_token || blynkToken || "").trim();
      if (!tokenToUse || tokenToUse.startsWith("DEMO_")) continue;

      let fetchedData = null;

      // Method 1: Try proxy through backend server (avoids browser CORS & resolves region)
      try {
        const proxyUrl = `${API_BASE_URL}/blynk/telemetry?token=${encodeURIComponent(tokenToUse)}&server=${encodeURIComponent(blynkServer)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const json = await res.json();
          if (json.status === "success" && json.data) {
            fetchedData = json.data;
            if (json.server && json.server !== blynkServer) {
              blynkServer = json.server;
              localStorage.setItem("blynk_server", blynkServer);
            }
          }
        }
      } catch (proxyErr) {
        // Backend offline, fallback to direct browser fetch
      }

      // Method 2: Direct browser fetch fallback (if backend is offline/standalone)
      if (!fetchedData) {
        try {
          const directUrl = `https://${blynkServer}/external/api/get?token=${encodeURIComponent(tokenToUse)}&v0&v1&v2&v3&v4`;
          const res = await fetch(directUrl);
          if (res.ok) {
            const raw = await res.json();
            fetchedData = {
              v0: raw.v0 !== undefined ? raw.v0 : raw.V0,
              v1: raw.v1 !== undefined ? raw.v1 : raw.V1,
              v2: raw.v2 !== undefined ? raw.v2 : raw.V2,
              v3: raw.v3 !== undefined ? raw.v3 : raw.V3,
              v4: raw.v4 !== undefined ? raw.v4 : raw.V4
            };
          }
        } catch (directErr) {
          console.warn("Direct Blynk fetch failed (likely browser CORS policy):", directErr);
        }
      }

      if (fetchedData) {
        const v0 = fetchedData.v0 !== undefined ? fetchedData.v0 : fetchedData.V0;
        const v1 = fetchedData.v1 !== undefined ? fetchedData.v1 : fetchedData.V1;
        const v2 = fetchedData.v2 !== undefined ? fetchedData.v2 : fetchedData.V2;
        const v3 = fetchedData.v3 !== undefined ? fetchedData.v3 : fetchedData.V3;

        const fullVol = bed.full_volume_ml || 500;
        if (v0 !== undefined) {
          bed.current_volume_ml = parseFloat(v0);
          // Recalculate percentage based on bed's configured full volume
          bed.percentage = Math.min(100.0, Math.max(0.0, (bed.current_volume_ml / fullVol) * 100.0));
        } else if (v1 !== undefined) {
          bed.percentage = parseFloat(v1);
        }
        if (v2 !== undefined) bed.flow_rate_mlm = parseFloat(v2);
        if (v3 !== undefined) bed.tte_minutes = parseInt(v3);

        // Re-evaluate clinical status with 7s zero-flow stagnation check
        bed.status = evaluateBedStatus(
          bed.current_volume_ml !== undefined ? bed.current_volume_ml : fullVol,
          bed.percentage !== undefined ? bed.percentage : 100,
          bed.flow_rate_mlm !== undefined ? bed.flow_rate_mlm : 4.6,
          bed.tte_minutes !== undefined ? bed.tte_minutes : 96,
          fullVol,
          bed.bed_id || bedId
        );

        updateBlynkStatusUI(true, "Live (Syncing)");

        if (isDbConnected) {
          try {
            await fetch(`${API_BASE_URL}/telemetry`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bed_id: bed.bed_id,
                volume_ml: bed.current_volume_ml,
                percentage: bed.percentage,
                flow_rate_mlm: bed.flow_rate_mlm,
                tte_minutes: bed.tte_minutes,
                status: bed.status
              })
            });
          } catch (e) { console.warn(e); }
        }
      } else {
        updateBlynkStatusUI(false, "Check Token / CORS");
      }
    }
  } catch (err) {
    console.warn("Telemetry polling error:", err);
  }
}

// --- ZERO TARE (0.0g EMPTY HOOK CALIBRATION) ACTION ---
async function triggerTareHook(bedId) {
  if (!confirm(`Perform Zero Tare for Bed ${bedId}?\n\nMake sure the hanger is EMPTY (no bottle hanging) so the load cell calibrates to 0.0g.`)) return;

  const targetBed = beds[bedId];
  const tokenToUse = (targetBed?.blynk_token || blynkToken || "").trim();

  if (isDbConnected) {
    try {
      await fetch(`${API_BASE_URL}/beds/${bedId}/tare`, { method: "POST" });
    } catch (e) {
      console.warn("Backend tare route failed, sending direct signal:", e);
    }
  }

  if (tokenToUse && !tokenToUse.startsWith("DEMO_")) {
    try {
      // Send V6=1 (Zero Tare) via proxy or direct
      fetch(`${API_BASE_URL}/blynk/update?token=${encodeURIComponent(tokenToUse)}&pin=V6&value=1&server=${encodeURIComponent(blynkServer)}`)
        .catch(() => fetch(`https://${blynkServer}/external/api/update?token=${tokenToUse}&V6=1`).catch(() => {}));
    } catch (e) { console.warn(e); }
  }

  alert(`Zero Tare command sent for Bed ${bedId}!\nEmpty hook calibrated to 0.0g on ESP32 load cell.`);
}

// --- RESET BOTTLE / REFILL ACTION (Supports 100ml, 250ml, 500ml, 1000ml) ---
async function triggerResetBottle(bedId) {
  const targetBed = beds[bedId];
  const currentCap = targetBed?.full_volume_ml || 500;

  const inputCap = prompt(
    `Set New Saline Bottle (100% Full) for Bed ${bedId}:\n\nEnter Bottle Capacity in ml (e.g. 100, 250, 500, 1000):`,
    currentCap
  );
  if (inputCap === null) return; // User cancelled

  const newCapacity = parseFloat(inputCap) > 10.0 ? parseFloat(inputCap) : currentCap;

  if (targetBed) {
    targetBed.full_volume_ml = newCapacity;
    targetBed.current_volume_ml = newCapacity;
    targetBed.percentage = 100.0;
    targetBed.flow_rate_mlm = 0.0;
    targetBed.status = "NORMAL";
    zeroFlowTimers[bedId] = Date.now(); // 7-second grace timer starting upon bottle refill

    const tokenToUse = (targetBed.blynk_token || blynkToken || "").trim();
    if (tokenToUse && !tokenToUse.startsWith("DEMO_")) {
      try {
        // Send V5=1 (Set Full) and V7={capacity} (Sync bottle capacity)
        fetch(`${API_BASE_URL}/blynk/update?token=${encodeURIComponent(tokenToUse)}&pin=V5&value=1&server=${encodeURIComponent(blynkServer)}`)
          .catch(() => fetch(`https://${blynkServer}/external/api/update?token=${tokenToUse}&V5=1`).catch(() => {}));
        fetch(`${API_BASE_URL}/blynk/update?token=${encodeURIComponent(tokenToUse)}&pin=V7&value=${newCapacity}&server=${encodeURIComponent(blynkServer)}`)
          .catch(() => fetch(`https://${blynkServer}/external/api/update?token=${tokenToUse}&V7=${newCapacity}`).catch(() => {}));
      } catch (e) { console.warn(e); }
    }

    manageContinuousAudio(false);
  }

  if (isDbConnected) {
    try {
      await fetch(`${API_BASE_URL}/beds/${bedId}/reset-full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_volume_ml: newCapacity })
      });
      await fetchBedsFromDatabase();
    } catch (e) { console.error(e); }
  }

  renderAllViews();
  resetChartData();
  alert(`Success: Bed ${bedId} refilled to 100% Full (${newCapacity} ml).\nActive alerts cleared and sound chime stopped!`);
}

async function triggerDischargeBed(bedId) {
  if (!confirm(`Are you sure you want to discharge patient and remove Bed ${bedId}?`)) return;

  if (isDbConnected) {
    try {
      await fetch(`${API_BASE_URL}/beds/${bedId}`, { method: "DELETE" });
      await fetchBedsFromDatabase();
      alert(`Bed ${bedId} discharged successfully.`);
      return;
    } catch (e) { console.error(e); }
  }

  delete beds[bedId];
  populateBedSelectDropdown();
  renderAllViews();
}

function downloadCSVReport() {
  if (isDbConnected) {
    window.open(`${API_BASE_URL}/reports/export-csv`, '_blank');
  } else {
    let csv = "Bed ID,Patient Name,Age/Gender,Doctor,Assigned Nurse,Room No,Fluid Type,Current Volume (ml),Full Capacity (ml),Flow Rate (ml/min),Est TTE (mins),Status\n";
    Object.values(beds).forEach(b => {
      const vol = b.current_volume_ml !== undefined ? b.current_volume_ml : 500;
      const full = b.full_volume_ml !== undefined ? b.full_volume_ml : 500;
      const rate = b.flow_rate_mlm !== undefined ? b.flow_rate_mlm : 4.6;
      csv += `"${b.bed_id}","${b.patient_name}","${b.age_gender || '45/M'}","${b.doctor_name || 'Dr. Petra'}","${b.assigned_nurse || 'Nurse Aishani'}","${b.room_no || ''}","${b.fluid_type || ''}",${vol.toFixed(1)},${full},${rate.toFixed(1)},${b.tte_minutes || 96},"${b.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Flowguard_Clinical_Report.csv';
    a.click();
  }
}

function handleGlobalSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) { renderAllViews(); return; }
  // Global filter logic...
}

// --- Chart.js ---
function initChart() {
  const ctx = document.getElementById("weightDepletionChart")?.getContext("2d");
  if (!ctx) return;
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartHistoryData.labels,
      datasets: [{
        label: "Saline Volume (ml)",
        data: chartHistoryData.volumes,
        borderColor: "#0284c7",
        backgroundColor: "rgba(2, 132, 199, 0.08)",
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: "#0ea5e9"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "#f1f5f9" }, ticks: { color: "#64748b", fontSize: 10 } },
        y: { grid: { color: "#f1f5f9" }, ticks: { color: "#64748b", fontSize: 10 }, title: { display: true, text: "Volume (ml)", color: "#94a3b8" } }
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

function initAnalyticsCharts() {
  const barCtx = document.getElementById("analyticsBarChart")?.getContext("2d");
  const pieCtx = document.getElementById("analyticsDoughnutChart")?.getContext("2d");

  if (barCtx && !analyticsBarInstance) {
    analyticsBarInstance = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
        datasets: [{ label: "Infused (ml)", data: [450, 920, 1380, 1850, 2300, 2750, 3200], backgroundColor: "#0284c7" }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  if (pieCtx && !analyticsDoughnutInstance) {
    analyticsDoughnutInstance = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["Normal Flow", "Occlusions", "Critical Low", "Empty"],
        datasets: [{ data: [75, 15, 8, 2], backgroundColor: ["#10b981", "#f59e0b", "#f43f5e", "#64748b"] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

function updateSimButtonUI() {
  const toggleBtn = document.getElementById("toggle-sim-btn");
  const simText = document.getElementById("sim-mode-text");
  if (!toggleBtn || !simText) return;

  if (isSimulationMode) {
    simText.textContent = "Mode: Live Simulation";
    toggleBtn.className = "btn-3d px-4 py-2 rounded-full text-xs font-semibold border border-cyan-200/80 bg-cyan-50/80 text-cyan-700 hover:bg-cyan-100 flex items-center gap-1.5 shadow-2xs";
  } else {
    simText.textContent = "Mode: Blynk Cloud Live";
    toggleBtn.className = "btn-3d px-4 py-2 rounded-full text-xs font-bold border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5 shadow-2xs";
  }
}

function updateBlynkStatusUI(isConnected, message) {
  const badgeDot = document.getElementById("blynk-status-dot");
  const badgeText = document.getElementById("blynk-status-text");
  const connPill = document.getElementById("settings-conn-pill");

  if (badgeDot && badgeText) {
    if (isConnected) {
      badgeDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm animate-pulse";
      badgeText.textContent = `Blynk: Live (${blynkServer.split('.')[0]})`;
    } else if (blynkToken) {
      badgeDot.className = "w-2.5 h-2.5 rounded-full bg-amber-400";
      badgeText.textContent = message || "Blynk: Connecting...";
    } else {
      badgeDot.className = "w-2.5 h-2.5 rounded-full bg-slate-400";
      badgeText.textContent = "Blynk: Not Configured";
    }
  }

  if (connPill) {
    if (isConnected) {
      connPill.className = "text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700";
      connPill.textContent = "Online / Streaming";
    } else {
      connPill.className = "text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500";
      connPill.textContent = blynkToken ? "Standby" : "Unconnected";
    }
  }
}

function saveHardwareSettings() {
  const tok = document.getElementById("settings-token-input")?.value.trim();
  const srv = document.getElementById("settings-server-input")?.value.trim() || "blynk.cloud";

  if (tok) {
    blynkToken = tok;
    blynkServer = srv;
    localStorage.setItem("blynk_token", tok);
    localStorage.setItem("blynk_server", srv);

    // Apply token to default beds
    if (beds[activeSelectedBed]) {
      beds[activeSelectedBed].blynk_token = tok;
    }
    if (beds["ICU-01"]) beds["ICU-01"].blynk_token = tok;

    // Turn off simulation and switch to live Blynk mode
    isSimulationMode = false;
    updateSimButtonUI();
    updateBlynkStatusUI(false, "Connecting to Blynk...");

    // Trigger immediate fetch
    fetchBlynkHardwareData();
    alert(`Success: Blynk Device Auth Code saved!\nSystem switched to Live Blynk Hardware Mode.`);
  } else {
    alert("Please enter a valid Blynk Auth Token.");
  }
}

async function testBlynkConnection() {
  const tok = document.getElementById("settings-token-input")?.value.trim() || blynkToken;
  const srv = document.getElementById("settings-server-input")?.value.trim() || blynkServer;
  const resultBox = document.getElementById("blynk-test-result");
  const testBtn = document.getElementById("test-blynk-btn");

  if (!tok) {
    alert("Please enter a Blynk Auth Token to test.");
    return;
  }

  if (resultBox) {
    resultBox.classList.remove("hidden");
    resultBox.className = "p-3 rounded-xl text-[11px] font-mono whitespace-pre-wrap bg-slate-100 text-slate-700 border border-slate-200";
    resultBox.textContent = `Testing connection to Blynk Cloud (${srv})...\nToken: ${tok.substring(0, 8)}...`;
  }
  if (testBtn) testBtn.textContent = "Testing...";

  try {
    let success = false;
    let details = "";

    // Method 1: Try via backend proxy (recommended, bypasses CORS)
    try {
      const res = await fetch(`${API_BASE_URL}/blynk/telemetry?token=${encodeURIComponent(tok)}&server=${encodeURIComponent(srv)}`);
      const data = await res.json();
      if (res.ok && data.status === "success") {
        success = true;
        details = `✓ Connected via Backend Proxy\nServer: ${data.server}\nDatastreams Received:\n` + JSON.stringify(data.data, null, 2);
      } else {
        details = `Backend proxy response: ` + JSON.stringify(data, null, 2);
      }
    } catch (e) {
      details = `Backend server not reachable (${e.message}). Testing direct browser connection...`;
    }

    // Method 2: If backend not available, test direct browser fetch
    if (!success) {
      try {
        const directRes = await fetch(`https://${srv}/external/api/get?token=${encodeURIComponent(tok)}&v0&v1&v2&v3&v4`);
        if (directRes.ok) {
          const directData = await directRes.json();
          success = true;
          details = `✓ Connected Directly to Blynk Cloud!\nDatastreams: ` + JSON.stringify(directData, null, 2);
        } else {
          details += `\nDirect fetch returned HTTP ${directRes.status}: ${await directRes.text()}`;
        }
      } catch (directErr) {
        details += `\nDirect browser fetch failed (blocked by browser CORS security policy).\nTo resolve this on any laptop, launch the server using 'python start_flowguard.py' or access via http://<HOST_IP>:8000.`;
      }
    }

    if (resultBox) {
      resultBox.className = success 
        ? "p-3 rounded-xl text-[11px] font-mono whitespace-pre-wrap bg-emerald-50 text-emerald-800 border border-emerald-200"
        : "p-3 rounded-xl text-[11px] font-mono whitespace-pre-wrap bg-rose-50 text-rose-800 border border-rose-200";
      resultBox.textContent = details;
    }

    if (success) {
      updateBlynkStatusUI(true, "Connected & Verified");
    }
  } catch (err) {
    if (resultBox) {
      resultBox.className = "p-3 rounded-xl text-[11px] font-mono whitespace-pre-wrap bg-rose-50 text-rose-800 border border-rose-200";
      resultBox.textContent = `Connection error: ${err.message}`;
    }
  } finally {
    if (testBtn) testBtn.textContent = "Test Connection";
  }
}

// Explicit window bindings for inline HTML onclick handlers
window.triggerResetBottle = triggerResetBottle;
window.triggerTareHook = triggerTareHook;
window.triggerDischargeBed = triggerDischargeBed;
window.saveHardwareSettings = saveHardwareSettings;
window.testBlynkConnection = testBlynkConnection;
window.downloadCSVReport = downloadCSVReport;
window.acknowledgeAlert = acknowledgeAlert;
window.openEditNurseModal = openEditNurseModal;
window.handleGlobalSearch = handleGlobalSearch;
