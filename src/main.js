// ============================================================
// MetSim Studio v2.0 — Main Orchestrator
// Wires simulator, UI, charts, alarms, case manager
// ============================================================

import {
  Simulator,
  DEFAULT_PARAMS,
  MESH_SIZES,
  passingToRetained,
  generateFeedPSD,
} from './simulationEngine.js';

import { AlarmSystem, SEVERITY } from './alarmSystem.js';
import { ChartsManager, makeTrendHistory } from './chartsManager.js';
import { saveCase, loadCase, listCases, deleteCase, exportExcel } from './caseManager.js';

// ── Expose utils globally for caseManager's Excel export ────
window._metSimUtils = { MESH_SIZES, passingToRetained, generateFeedPSD };

// ── Core Instances ───────────────────────────────────────────
const sim      = new Simulator(DEFAULT_PARAMS);
const alarms   = new AlarmSystem();
const charts   = new ChartsManager();
let trendHistory = makeTrendHistory();

// ── DOM Elements ─────────────────────────────────────────────
const btnRun         = document.getElementById('btn-run');
const btnPause       = document.getElementById('btn-pause');
const btnReset       = document.getElementById('btn-reset');
const btnExportCsv   = document.getElementById('btn-export-csv');
const btnExportXlsx  = document.getElementById('btn-export-xlsx');
const simStatusBadge = document.getElementById('sim-status-badge');
const simTimer       = document.getElementById('sim-timer');
const simSpeedSelect = document.getElementById('sim-speed');
const btnMobileMenu  = document.getElementById('btn-mobile-menu');
const btnMobileTelemetry = document.getElementById('btn-mobile-telemetry');

// ── Initialization ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initParamListeners();
  charts.initTrendPanels();
  charts.initPSDChart(sim.params.targetP80);
  updateUI();
  renderCaseList();

  btnRun.addEventListener('click',  startSimulation);
  btnPause.addEventListener('click', pauseSimulation);
  btnReset.addEventListener('click', resetSimulation);
  btnExportCsv.addEventListener('click',  exportToCSV);
  btnExportXlsx.addEventListener('click', () => {
    const name = document.getElementById('inp-case-name')?.value || 'Caso_Principal';
    exportExcel(sim, trendHistory, name);
  });

  document.getElementById('btn-reset-params')?.addEventListener('click', () => {
    sim.updateParams(DEFAULT_PARAMS);
    syncInputsFromParams();
    updateUI();
  });

  document.getElementById('btn-quick-feed')?.addEventListener('click', () => {
    const inp = document.getElementById('inp-treatment');
    inp.value = Math.round(parseFloat(inp.value) * 1.2);
    inp.dispatchEvent(new Event('change'));
  });

  document.getElementById('btn-quick-wi')?.addEventListener('click', () => {
    const inp = document.getElementById('inp-wi');
    inp.value = (parseFloat(inp.value) * 1.2).toFixed(1);
    inp.dispatchEvent(new Event('change'));
  });

  document.getElementById('btn-quick-pert-sump')?.addEventListener('click', () => {
    const inp = document.getElementById('inp-sump-water');
    inp.value = Math.round(parseFloat(inp.value) * 1.5);
    inp.dispatchEvent(new Event('change'));
  });

  document.getElementById('btn-quick-apex')?.addEventListener('click', () => {
    const inp = document.getElementById('inp-cyc-apex');
    const cur = parseFloat(inp.value);
    inp.value = Math.max(50, cur - 10);
    inp.dispatchEvent(new Event('change'));
  });

  // Case management
  document.getElementById('btn-save-case')?.addEventListener('click', () => {
    const name = document.getElementById('inp-case-name')?.value?.trim();
    if (!name) { alert('Escribe un nombre para el caso'); return; }
    if (saveCase(sim, name)) {
      showNotification(`Caso "${name}" guardado`, 'success');
      renderCaseList();
    }
  });

  document.getElementById('btn-clear-alarm-log')?.addEventListener('click', () => {
    alarms.clearLog();
    renderAlarmLog();
  });

  // ── Mobile drawer toggles ──
  const scrim  = document.getElementById('scrim');
  const panel  = document.querySelector('.side-params');
  const tele   = document.querySelector('.side-telemetry');

  const setDrawers = open => {
    panel?.classList.toggle('open', open);
    tele?.classList.toggle('open', open);
    if (scrim) scrim.hidden = !open;
    btnMobileMenu?.setAttribute('aria-expanded', String(open));
    btnMobileTelemetry?.setAttribute('aria-expanded', String(open));
  };

  btnMobileMenu?.addEventListener('click', () => setDrawers(!panel?.classList.contains('open')));
  btnMobileTelemetry?.addEventListener('click', () => setDrawers(!tele?.classList.contains('open')));
  scrim?.addEventListener('click', () => setDrawers(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawers(false); });
  // A drawer left open would cover the layout after a rotate/resize to desktop.
  matchMedia('(min-width: 769px)').addEventListener('change', e => { if (e.matches) setDrawers(false); });
});

// ── Tab Switching ────────────────────────────────────────────
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      const view = document.getElementById(`view-${tabName}`);
      view?.classList.add('active');

      if (tabName === 'psd')    { charts.psdChart?.resize(); charts.psdChart?.update(); }
      if (tabName === 'trends') { charts.resizeAll(); }
      if (tabName === 'alarms') { renderAlarmLog(); }
      if (tabName === 'cases')  { renderCaseList(); }
    });
  });
}

// ── Parameter Binding ────────────────────────────────────────
function initParamListeners() {
  const paramMap = [
    { id: 'inp-treatment',    param: 'treatment' },
    { id: 'inp-f80',          param: 'f80' },
    { id: 'inp-wi',           param: 'wi' },
    { id: 'inp-density',      param: 'oreDensity' },
    { id: 'inp-moisture',     param: 'moisture' },
    { id: 'inp-target-p80',   param: 'targetP80' },
    { id: 'inp-efficiency',   param: 'efficiency' },
    { id: 'inp-mill-vol',     param: 'millVolume' },
    { id: 'inp-mill-inv',     param: 'millInventory' },
    { id: 'inp-mill-power',   param: 'millPowerMax' },
    { id: 'inp-mill-water',   param: 'millWater' },
    { id: 'inp-mill-sp-solids', param: 'millSolidsSp' },
    { id: 'inp-sump-vol',     param: 'sumpVolume' },
    { id: 'inp-sump-water',   param: 'sumpWater' },
    { id: 'inp-sump-sp',      param: 'sumpSpLevel' },
    { id: 'inp-pump-cap',     param: 'pumpCapMax' },
    { id: 'inp-pid-kp',       param: 'kp' },
    { id: 'inp-pid-ki',       param: 'ki' },
    { id: 'inp-pid-kd',       param: 'kd' },
    { id: 'inp-cyc-d50c',     param: 'cycD50c' },
    { id: 'inp-cyc-imp',      param: 'cycImperfection' },
    { id: 'inp-cyc-bypass',   param: 'cycBypass' },
    { id: 'inp-cyc-active',   param: 'cycActive' },
    { id: 'inp-cyc-apex',     param: 'cycApex' },
  ];

  paramMap.forEach(({ id, param }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', e => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) { sim.updateParams({ [param]: val }); updateUI(); }
      });
    }
  });

  document.getElementById('inp-mill-water-mode')?.addEventListener('change', e => {
    sim.updateParams({ millWaterMode: e.target.value }); updateUI();
  });
  document.getElementById('inp-pump-mode')?.addEventListener('change', e => {
    sim.updateParams({ pumpMode: e.target.value }); updateUI();
  });
}

function syncInputsFromParams() {
  const p = sim.params;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('inp-treatment', p.treatment);   set('inp-f80', p.f80);
  set('inp-wi', p.wi);                  set('inp-density', p.oreDensity);
  set('inp-moisture', p.moisture);      set('inp-target-p80', p.targetP80);
  set('inp-efficiency', p.efficiency);  set('inp-mill-vol', p.millVolume);
  set('inp-mill-inv', p.millInventory); set('inp-mill-power', p.millPowerMax);
  set('inp-mill-water', p.millWater);   set('inp-mill-sp-solids', p.millSolidsSp);
  set('inp-sump-vol', p.sumpVolume);    set('inp-sump-water', p.sumpWater);
  set('inp-sump-sp', p.sumpSpLevel);    set('inp-pump-cap', p.pumpCapMax);
  set('inp-pid-kp', p.kp);             set('inp-pid-ki', p.ki);
  set('inp-pid-kd', p.kd);
  set('inp-cyc-d50c', p.cycD50c);       set('inp-cyc-imp', p.cycImperfection);
  set('inp-cyc-bypass', p.cycBypass);   set('inp-cyc-active', p.cycActive);
  set('inp-cyc-apex', p.cycApex);
}

// ── Simulation Loop ──────────────────────────────────────────
let lastTimestamp = 0;
let animId = null;
let lastTrendTime = -999;

function startSimulation() {
  if (sim.isRunning) return;
  sim.isRunning = true;
  btnRun.classList.add('ring-2', 'ring-amber-400');
  btnPause.classList.remove('ring-2', 'ring-cyan-400');
  lastTimestamp = performance.now();
  runLoop();
}

function runLoop() {
  if (!sim.isRunning) return;
  const now = performance.now();
  const deltaMs = now - lastTimestamp;
  lastTimestamp = now;

  const speedMult = parseFloat(simSpeedSelect.value) || 20;
  const dtMin = (deltaMs / 1000) * (speedMult / 60);

  sim.step(dtMin);
  alarms.evaluate(sim);

  // Record trend every ~0.05 sim-min
  if (sim.simTime - lastTrendTime >= 0.05) {
    charts.addTrendPoint(sim.simTime, sim, trendHistory);
    lastTrendTime = sim.simTime;
  }

  updateUI();
  animId = requestAnimationFrame(runLoop);
}

function pauseSimulation() {
  sim.isRunning = false;
  btnRun.classList.remove('ring-2', 'ring-amber-400');
  btnPause.classList.add('ring-2', 'ring-cyan-400');
  if (animId) cancelAnimationFrame(animId);
}

function resetSimulation() {
  pauseSimulation();
  sim.reset();
  alarms.clearLog();
  trendHistory = makeTrendHistory();
  lastTrendTime = -999;
  updateUI();
}

// ── Main UI Update ───────────────────────────────────────────
function updateUI() {
  updateStatusBar();
  updateKPICards();
  updatePFDOverlay();
  updateTelemetryPanel();
  updatePSDTab();
  updateQuickStateBar();
  updateAlarmBadge();
  charts.updatePSD(sim.streams);
}

function updateStatusBar() {
  const status = sim.statusText;
  simTimer.innerText = `${sim.simTime.toFixed(2)} min`;
  simStatusBadge.innerText = status;
  simStatusBadge.className = 'px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider text-[10px] ' + {
    'SIN RESOLVER': 'bg-slate-800 text-slate-400 border-slate-700/60',
    'INICIANDO':    'bg-blue-500/20 text-blue-400 border-blue-500/40',
    'ESTADO ESTACIONARIO': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    'TRANSITORIO':  'bg-amber-500/20 text-amber-400 border-amber-500/40',
  }[status] || 'bg-slate-800 text-slate-400 border-slate-700/60';
}

function updateKPICards() {
  const r = sim.isResolved;
  const fmt = (v, d) => r ? (+v).toFixed(d) : '--';
  setText('kpi-energy',      fmt(sim.specificEnergy, 3));
  setText('kpi-power',       r ? Math.round(sim.powerReq) : '--');
  setText('kpi-p80',         fmt(sim.streams.overflow.p80, 1));
  setText('kpi-p80-mill',    `Descarga molino: ${fmt(sim.streams.millDischarge.p80, 1)} µm`);
  setText('kpi-circulating', r ? Math.round(sim.circulatingLoad) : '--');
}

function updatePFDOverlay() {
  setText('card-feed-solids',    sim.streams.feed.solids.toFixed(1));
  setText('card-feed-f80',       Math.round(sim.streams.feed.p80));
  setText('card-feed-wi',        sim.params.wi.toFixed(1));
  setText('card-mill-power',     Math.round(sim.powerReq));
  setText('card-mill-ww',        (sim.streams.millDischarge.ww || 0).toFixed(1));
  setText('card-mill-sp',        sim.params.millSolidsSp.toFixed(1));
  setText('card-mill-water',     sim.params.millWater.toFixed(1));
  setText('card-sump-level',     sim.sumpLevel.toFixed(1));
  setText('card-sump-vol',       sim.sumpVolumeActual.toFixed(1));
  setText('card-pump-speed',     Math.round(sim.pumpSpeedActual));
  setText('card-pump-flow',      Math.round(sim.params.pumpCapMax * sim.pumpSpeedActual / 100));
  setText('card-cycfeed-solids', sim.streams.millDischarge.solids.toFixed(1));
  setText('card-cycfeed-ww',     (sim.streams.sumpOut.ww || 0).toFixed(1));
  setText('card-cycfeed-p80',    Math.round(sim.streams.millDischarge.p80));
  setText('card-of-solids',      sim.streams.overflow.solids.toFixed(1));
  setText('card-of-p80',         sim.streams.overflow.p80.toFixed(1));
  setText('card-uf-solids',      sim.streams.underflow.solids.toFixed(1));
  setText('card-uf-p80',         Math.round(sim.streams.underflow.p80));

  // Sump SVG level
  const svgLevel = document.getElementById('svg-sump-level');
  if (svgLevel) {
    const h = (42 * sim.sumpLevel) / 100;
    svgLevel.setAttribute('y', (67 - h).toString());
    svgLevel.setAttribute('height', h.toString());
    svgLevel.setAttribute('fill', sim.sumpLevel > 85 ? '#dc2626' : sim.sumpLevel > 75 ? '#f59e0b' : '#0284c7');
  }
}

function updateTelemetryPanel() {
  setText('telemetry-status', sim.statusText);
  setText('tel-time',           `${sim.simTime.toFixed(3)} min`);
  setText('tel-mill-inv',       `${sim.millInventoryDyn.toFixed(2)} t`);
  setText('tel-power-util',     `${((sim.powerReq / sim.params.millPowerMax) * 100).toFixed(1)} %`);
  setText('tel-uf-solids',      `${sim.streams.underflow.solids.toFixed(2)} t/h`);
  setText('tel-feed-solids',    `${sim.streams.feed.solids.toFixed(2)} t/h`);
  setText('tel-mill-feed-solids', `${sim.streams.millDischarge.solids.toFixed(2)} t/h`);
  setText('tel-of-solids',      `${sim.streams.overflow.solids.toFixed(2)} t/h`);
  setText('tel-split-uf',       `${(100 - (sim.streams.overflow.solids / (sim.streams.millDischarge.solids + 0.001)) * 100).toFixed(2)} %`);
  setText('tel-p80-of',         `${sim.streams.overflow.p80.toFixed(2)} µm`);
  setText('tel-energy',         `${sim.specificEnergy.toFixed(2)} kWh/t`);
  setText('tel-sump-level',     `${sim.sumpLevel.toFixed(2)} %`);
  setText('tel-pump-flow',      `${(sim.params.pumpCapMax * sim.pumpSpeedActual / 100).toFixed(2)} m³/h`);
  setText('tel-pid-integral',   `${sim.pidState.integral.toFixed(3)}`);
  setText('tel-of-water',       `${sim.streams.overflow.water.toFixed(2)} m³/h`);
  setText('tel-uf-water',       `${sim.streams.underflow.water.toFixed(2)} m³/h`);
  setText('tel-of-rho',         `${(sim.streams.overflow.rhoPulp || 1).toFixed(3)} t/m³`);
  setText('tel-uf-rho',         `${(sim.streams.underflow.rhoPulp || 1).toFixed(3)} t/m³`);
  setText('tel-residual-solids',`${sim.residualSolids.toFixed(4)} t/h`);
  setText('tel-residual-water', `${sim.residualWater.toFixed(4)} m³/h`);

  // Color residual
  const resEl = document.getElementById('tel-residual-solids');
  if (resEl) resEl.className = Math.abs(sim.residualSolids) > 5 ? 'text-red-400 font-bold' : 'text-emerald-400';
}

function updatePSDTab() {
  const r = sim.streams;
  setText('psd-p80-feed',  `${Math.round(r.feed.p80)} µm`);
  setText('psd-p80-mill',  `${Math.round(r.millDischarge.p80)} µm`);
  setText('psd-p80-uf',    `${Math.round(r.underflow.p80)} µm`);
  setText('psd-p80-of',    `${r.overflow.p80.toFixed(1)} µm`);
  setText('psd-ww-mill',   `${(r.millDischarge.ww || 0).toFixed(1)} %`);
  setText('psd-ww-of',     `${(r.overflow.ww || 0).toFixed(1)} %`);
  setText('psd-rho-mill',  `${(r.millDischarge.rhoPulp || 1).toFixed(3)}`);
  setText('psd-rho-of',    `${(r.overflow.rhoPulp || 1).toFixed(3)}`);

  const tbody = document.getElementById('mesh-table-body');
  if (!tbody) return;
  const feedRet = passingToRetained(r.feed.passing);
  let html = '';
  for (let i = 0; i < MESH_SIZES.length; i++) {
    const size = MESH_SIZES[i];
    const sizeLabel = size >= 1000 ? `${(size / 1000).toFixed(2)} mm` : `${size} µm`;
    html += `<tr class="hover:bg-slate-800/40 transition">
      <td class="p-2.5 font-bold text-slate-200">${sizeLabel}</td>
      <td class="p-2.5 text-slate-400">${feedRet[i].toFixed(2)}</td>
      <td class="p-2.5 text-cyan-400">${r.feed.passing[i].toFixed(2)}</td>
      <td class="p-2.5 text-slate-300">${r.millDischarge.passing[i].toFixed(2)}</td>
      <td class="p-2.5 text-orange-400">${r.underflow.passing[i].toFixed(2)}</td>
      <td class="p-2.5 text-emerald-400 font-bold">${r.overflow.passing[i].toFixed(2)}</td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

function updateQuickStateBar() {
  const state = alarms.getOverallState();
  const qsb = document.getElementById('quick-state-bar');
  const qsbIcon = document.getElementById('qsb-icon');
  const qsbText = document.getElementById('qsb-text');
  if (!qsb) return;

  const sumpInfo = `Sump ${sim.sumpLevel.toFixed(1)}%`;
  const clInfo   = `CL ${Math.round(sim.circulatingLoad)}%`;

  qsb.className = qsb.className.replace(/qsb-\w+/g, '');

  if (state === 'ALARM') {
    qsb.classList.add('qsb-alarm');
    if (qsbIcon) qsbIcon.textContent = '🔴';
    if (qsbText) qsbText.textContent = `ALARMA — ${sim.simTime.toFixed(2)} min — ${sumpInfo} — ${clInfo} — ${alarms.getActiveList()[0]?.rule.msg || ''}`;
  } else if (state === 'WARN') {
    qsb.classList.add('qsb-warn');
    if (qsbIcon) qsbIcon.textContent = '🟡';
    if (qsbText) qsbText.textContent = `ADVERTENCIA — ${sim.simTime.toFixed(2)} min — ${sumpInfo} — ${clInfo}`;
  } else {
    qsb.classList.add('qsb-normal');
    if (qsbIcon) qsbIcon.textContent = '🟢';
    if (qsbText) qsbText.textContent = `${sim.statusText} — ${sim.simTime.toFixed(2)} min — ${sumpInfo} — P80 ${sim.streams.overflow.p80.toFixed(1)} µm — ${clInfo}`;
  }
}

function updateAlarmBadge() {
  const state = alarms.getOverallState();
  const badge = document.getElementById('alarm-tab-badge');
  if (!badge) return;
  const count = alarms.activeAlarms.size;
  badge.textContent = count > 0 ? count : '';
  badge.className = count > 0
    ? (state === 'ALARM' ? 'ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500 text-white animate-pulse'
                         : 'ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-slate-900')
    : 'hidden';
}

// ── Alarm Log Renderer ───────────────────────────────────────
function renderAlarmLog() {
  const tbody = document.getElementById('alarm-log-body');
  if (!tbody) return;

  // Active alarms header
  const activeEl = document.getElementById('active-alarms-list');
  if (activeEl) {
    const list = alarms.getActiveList();
    if (list.length === 0) {
      activeEl.innerHTML = '<div class="text-emerald-400 text-xs font-mono py-2">✓ Sin alarmas activas</div>';
    } else {
      activeEl.innerHTML = list.map(e => `
        <div class="flex items-center gap-2 py-1 border-b border-slate-800/40">
          <span class="${e.rule.severity === 'ALARM' ? 'text-red-400' : 'text-amber-400'} text-xs font-mono">
            ${e.rule.severity === 'ALARM' ? '🚨' : '⚠️'} ${e.rule.msg}
          </span>
          <span class="text-slate-500 text-[10px] ml-auto">desde ${e.since.toFixed(2)} min</span>
        </div>
      `).join('');
    }
  }

  // Event log
  if (alarms.eventLog.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500 text-xs">Sin eventos registrados</td></tr>';
    return;
  }
  tbody.innerHTML = alarms.eventLog.map(ev => {
    const cls = ev.severity === 'ALARM' ? 'alarm-row-alarm'
              : ev.severity === 'WARN'  ? 'alarm-row-warn'
              : 'alarm-row-info';
    const icon = ev.severity === 'ALARM' ? '🚨' : ev.severity === 'WARN' ? '⚠️' : 'ℹ️';
    return `<tr class="${cls}">
      <td class="p-2 font-mono text-slate-300">${ev.time} min</td>
      <td class="p-2 text-slate-400">${ev.equipment}</td>
      <td class="p-2">${icon} ${ev.msg}</td>
      <td class="p-2 text-center">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${
          ev.severity === 'ALARM' ? 'bg-red-500/20 text-red-400' :
          ev.severity === 'WARN'  ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-slate-700 text-slate-400'
        }">${ev.severity}</span>
      </td>
    </tr>`;
  }).join('');
}

// ── Case Manager UI ──────────────────────────────────────────
function renderCaseList() {
  const container = document.getElementById('case-list');
  if (!container) return;
  const cases = listCases();
  if (cases.length === 0) {
    container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">No hay casos guardados</p>';
    return;
  }
  container.innerHTML = cases.map(c => `
    <div class="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 hover:border-slate-700 transition group">
      <svg class="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-slate-200 text-xs truncate">${c.name}</div>
        <div class="text-slate-500 text-[10px]">${c.ts}</div>
      </div>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onclick="loadCaseUI('${c.name}')" class="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-[10px] rounded border border-cyan-500/30 transition">Cargar</button>
        <button onclick="deleteCaseUI('${c.name}')" class="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] rounded border border-red-500/30 transition">×</button>
      </div>
    </div>
  `).join('');
}

window.loadCaseUI = function(name) {
  const meta = loadCase(sim, name);
  if (meta) {
    syncInputsFromParams();
    updateUI();
    showNotification(`Caso "${name}" cargado`, 'success');
  } else {
    showNotification('Error al cargar el caso', 'error');
  }
};

window.deleteCaseUI = function(name) {
  if (!confirm(`¿Eliminar caso "${name}"?`)) return;
  deleteCase(name);
  renderCaseList();
};

// ── Toast Notification ───────────────────────────────────────
function showNotification(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed top-16 right-4 z-50 px-4 py-2.5 rounded-lg shadow-xl text-sm font-medium border transition-all
    ${type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
      type === 'error'   ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                           'bg-slate-700 text-slate-200 border-slate-600'}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── CSV Export ───────────────────────────────────────────────
function exportToCSV() {
  let csv = 'Tamaño (um),Alim. Ret (%),Alim. Pas (%),Molino Pas (%),Underflow Pas (%),Overflow Pas (%)\n';
  const feedRet = passingToRetained(sim.streams.feed.passing);
  for (let i = 0; i < MESH_SIZES.length; i++) {
    csv += `${MESH_SIZES[i]},${feedRet[i].toFixed(3)},${sim.streams.feed.passing[i].toFixed(3)},${sim.streams.millDischarge.passing[i].toFixed(3)},${sim.streams.underflow.passing[i].toFixed(3)},${sim.streams.overflow.passing[i].toFixed(3)}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `MetSim_PSD_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Helpers ──────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
