// Flowguard-AI Interactive 3D Spatial Clinical Admin Dashboard Application Logic

const API_BASE_URL = "http://localhost:8000/api";

// --- State Repositories ---
let beds = {
  "ICU-01": {
    bed_id: "ICU-01",
    patient_name: "A. Sharma",
    age_gender: "52/M",
    doctor_name: "Dr. Petra Winburry",
    assigned_nurse: "Nurse Aishani",
    room_no: "ICU Room 104",
    fluid_type: "Saline 0.9% (500ml)",
    current_volume_ml: 442.5,
    full_volume_ml: 500.0,
    percentage: 88.5,
    flow_rate_mlm: 4.6,
    tte_minutes: 96,
    status: "NORMAL",
    blynk_token: "DEMO_TOKEN_1"
  },
  "ICU-02": {
    bed_id: "ICU-02",
    patient_name: "R. Verma",
    age_gender: "38/F",
    doctor_name: "Dr. Petra Winburry",
    assigned_nurse: "Nurse Aishani",
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
    patient_name: "K. Patel",
    age_gender: "61/M",
    doctor_name: "Dr. Rajesh Kumar",
    assigned_nurse: "Nurse Tejaswini",
    room_no: "ICU Room 112",
    fluid_type: "Ringer's Lactate (1000ml)",
    current_volume_ml: 780.0,
    full_volume_ml: 1000.0,
    percentage: 78.0,
    flow_rate_mlm: 0.0,
    tte_minutes: 999,
    status: "BLOCKED",
    blynk_token: "DEMO_TOKEN_3"
  }
};

let nurses = {
  "NURSE-01": { nurse_id: "NURSE-01", name: "Nurse Aishani", shift: "Morning (07:00 - 15:00)", contact: "+91 98765 43210", status: "On Duty", assigned_count: 2 },
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
let isSimulationMode = true;
let isDbConnected = false;
let isSoundEnabled = true;

let alertAudioInterval = null;
let audioCtx = null;

let blynkToken = localStorage.getItem("blynk_token") || "";
let blynkServer = localStorage.getItem("blynk_server") || "blynk.cloud";

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
      if (simText) simText.textContent = isSimulationMode ? "Mode: Live Simulation" : "Mode: Blynk Cloud Live";
    });
  }

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
function renderBedCards() {
  const container = document.getElementById("bed-grid");
  if (!container) return;
  container.innerHTML = "";

  let hasCritical = false;
  let activeBedsCount = Object.keys(beds).length;
  let normalCount = 0;
  let alertCount = 0;

  Object.values(beds).forEach(bed => {
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

    const vol = bed.current_volume_ml !== undefined ? bed.current_volume_ml : 500;
    const pct = bed.percentage !== undefined ? bed.percentage : 100;
    const flow = bed.flow_rate_mlm !== undefined ? bed.flow_rate_mlm : 4.6;
    const tte = bed.tte_minutes !== undefined ? bed.tte_minutes : 96;
    const patientName = bed.patient_name || bed.bed_id;
    const ageGender = bed.age_gender || "45/M";
    const doctorName = bed.doctor_name || "Dr. Petra Winburry";
    const assignedNurse = bed.assigned_nurse || "Nurse Aishani";
    const fluidType = bed.fluid_type || "Saline 0.9%";
    const bedId = bed.bed_id || bed.id;

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
          <button onclick="triggerResetBottle('${bedId}')" title="Set New Bottle (100%)" class="btn-3d px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-full transition flex items-center gap-1 text-[11px] shadow-sm">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Set Full
          </button>
          <button onclick="triggerDischargeBed('${bedId}')" title="Discharge Patient" class="btn-3d px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-full transition">
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

  const banner = document.getElementById("triage-banner");
  if (banner) {
    if (alertCount > 0) banner.classList.remove("hidden");
    else banner.classList.add("hidden");
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
        <button onclick="triggerResetBottle('${b.bed_id}')" class="text-cyan-600 font-bold hover:underline mr-2">Reset</button>
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
      } catch (e) { console.warn(e); }
    }
  }

  renderAllViews();
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
  } catch (err) { console.warn(err); }
}

// --- RESET BOTTLE / REFILL ACTION ---
async function triggerResetBottle(bedId) {
  const targetBed = beds[bedId];
  if (targetBed) {
    const full = targetBed.full_volume_ml || 500;
    targetBed.current_volume_ml = full;
    targetBed.percentage = 100.0;
    targetBed.status = "NORMAL";

    manageContinuousAudio(false);
  }

  if (isDbConnected) {
    try {
      await fetch(`${API_BASE_URL}/beds/${bedId}/reset-full`, { method: "POST" });
      await fetchBedsFromDatabase();
    } catch (e) { console.error(e); }
  }

  renderAllViews();
  resetChartData();
  alert(`Success: ${bedId} refilled to 100% Full (${beds[bedId]?.full_volume_ml || 500} ml). Active alerts cleared!`);
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

function saveHardwareSettings() {
  const tok = document.getElementById("settings-token-input")?.value;
  if (tok) {
    localStorage.setItem("blynk_token", tok);
    alert("Hardware settings saved successfully!");
  }
}
