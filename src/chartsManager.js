// ============================================================
// MetSim Studio v2.0 — Charts Manager
// 8 real-time trend panels with independent Y axes
// ============================================================

import Chart from 'chart.js/auto';
import { MESH_SIZES } from './simulationEngine.js';

// Shared Chart.js defaults for all mini panels
const PANEL_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  elements: { point: { radius: 0 }, line: { borderWidth: 1.5, tension: 0.3 } },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 10, padding: 6 },
    },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#94a3b8',
      bodyColor: '#f1f5f9',
      bodyFont: { family: 'JetBrains Mono', size: 10 },
    },
  },
  scales: {
    x: {
      ticks: { color: '#475569', font: { size: 9, family: 'JetBrains Mono' }, maxTicksLimit: 6 },
      grid: { color: 'rgba(51,65,85,0.3)' },
      title: { display: false },
    },
  },
};

function makeYAxis(color, label = '', position = 'left', hidden = false) {
  return {
    type: 'linear',
    position,
    display: !hidden,
    title: { display: !!label, text: label, color, font: { size: 9 } },
    ticks: { color, font: { size: 9, family: 'JetBrains Mono' }, maxTicksLimit: 5 },
    grid: { color: position === 'left' ? 'rgba(51,65,85,0.3)' : 'transparent' },
  };
}

export class ChartsManager {
  constructor() {
    this.charts = {};
    this.psdChart = null;
    this.maxPoints = 200;
  }

  /** Initialize all 8 trend panels */
  initTrendPanels() {
    // 1. P80 Trends
    this.charts.p80 = this._make('trend-p80', {
      datasets: [
        { label: 'P80 Overflow', borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', yAxisID: 'y', fill: true },
        { label: 'P80 Molino', borderColor: '#94a3b8', yAxisID: 'y' },
        { label: 'Objetivo', borderColor: '#ef4444', borderDash: [4, 3], yAxisID: 'y' },
      ],
      scales: { y: makeYAxis('#22c55e', 'P80 (µm)') },
    });

    // 2. Solid Flows
    this.charts.flows = this._make('trend-flows', {
      datasets: [
        { label: 'Feed Fresco', borderColor: '#38bdf8', yAxisID: 'y' },
        { label: 'Feed Molino', borderColor: '#94a3b8', yAxisID: 'y' },
        { label: 'Underflow', borderColor: '#f97316', yAxisID: 'y' },
        { label: 'Overflow', borderColor: '#22c55e', yAxisID: 'y' },
      ],
      scales: { y: makeYAxis('#94a3b8', 'Sólidos (t/h)') },
    });

    // 3. Circulating Load
    this.charts.cl = this._make('trend-cl', {
      datasets: [
        { label: 'Carga Circ. (%)', borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.07)', yAxisID: 'y', fill: true },
      ],
      scales: { y: makeYAxis('#f97316', 'CL (%)') },
    });

    // 4. Mill Inventory
    this.charts.inventory = this._make('trend-inventory', {
      datasets: [
        { label: 'Inventario (t)', borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.08)', yAxisID: 'y', fill: true },
      ],
      scales: { y: makeYAxis('#60a5fa', 'Inventario (t)') },
    });

    // 5. Mill Power
    this.charts.power = this._make('trend-power', {
      datasets: [
        { label: 'Potencia (kW)', borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.07)', yAxisID: 'y', fill: true },
        { label: 'Máx Potencia', borderColor: '#dc2626', borderDash: [4, 3], yAxisID: 'y' },
      ],
      scales: { y: makeYAxis('#f59e0b', 'Potencia (kW)') },
    });

    // 6. Sump Level
    this.charts.sump = this._make('trend-sump', {
      datasets: [
        { label: 'Nivel Sump (%)', borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.08)', yAxisID: 'y', fill: true },
        { label: 'Setpoint', borderColor: '#f59e0b', borderDash: [4, 3], yAxisID: 'y' },
      ],
      scales: { y: { ...makeYAxis('#38bdf8', 'Nivel (%)'), min: 0, max: 100 } },
    });

    // 7. Pulp Density
    this.charts.pulp = this._make('trend-pulp', {
      datasets: [
        { label: '% Sól. ciclones', borderColor: '#a78bfa', yAxisID: 'y' },
        { label: 'Dens. Pulpa (t/m³)', borderColor: '#e879f9', yAxisID: 'y2' },
      ],
      scales: {
        y:  makeYAxis('#a78bfa', '% Sólidos w/w'),
        y2: makeYAxis('#e879f9', 'ρ Pulpa (t/m³)', 'right'),
      },
    });

    // 8. Water Balance
    this.charts.water = this._make('trend-water', {
      datasets: [
        { label: 'Agua Molino', borderColor: '#06b6d4', yAxisID: 'y' },
        { label: 'Agua Sump', borderColor: '#0891b2', yAxisID: 'y' },
        { label: 'Agua O/F', borderColor: '#22c55e', yAxisID: 'y' },
        { label: 'Agua U/F', borderColor: '#f97316', yAxisID: 'y' },
      ],
      scales: { y: makeYAxis('#06b6d4', 'Agua (m³/h)') },
    });
  }

  /** Initialize PSD chart */
  initPSDChart(targetP80) {
    const ctx = document.getElementById('chart-psd');
    if (!ctx) return;
    this.psdChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: MESH_SIZES.map(x => x >= 1000 ? `${(x/1000).toFixed(1)}mm` : `${x}µm`),
        datasets: [
          { label: 'Alimentación', data: [], borderColor: '#38bdf8', borderWidth: 2, pointRadius: 2, fill: false },
          { label: 'Descarga Molino', data: [], borderColor: '#94a3b8', borderWidth: 2, pointRadius: 2, fill: false },
          { label: 'Underflow', data: [], borderColor: '#f97316', borderWidth: 2, pointRadius: 2, fill: false },
          { label: 'Overflow', data: [], borderColor: '#22c55e', borderWidth: 3, pointRadius: 3, fill: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            title: { display: true, text: 'Tamaño de Malla', color: '#94a3b8', font: { size: 11 } },
            ticks: { color: '#64748b', font: { size: 10 } },
            grid: { color: 'rgba(51,65,85,0.4)' },
            reverse: true,
          },
          y: {
            title: { display: true, text: '% Pasante Acumulado', color: '#94a3b8', font: { size: 11 } },
            min: 0, max: 100,
            ticks: { color: '#64748b' },
            grid: { color: 'rgba(51,65,85,0.4)' },
          },
        },
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { family: 'Inter', size: 11 } } },
          annotation: {
            annotations: {
              targetLine: {
                type: 'line',
                xMin: null, xMax: null,
                yMin: 80, yMax: 80,
                borderColor: '#ef4444',
                borderWidth: 1.5,
                borderDash: [5, 4],
                label: { content: 'P80 Target = 80%', display: true, color: '#ef4444', font: { size: 10 } },
              },
            },
          },
        },
      },
    });
    this.psdTargetP80 = targetP80;
  }

  /** Update PSD chart with latest stream data */
  updatePSD(streams) {
    if (!this.psdChart) return;
    this.psdChart.data.datasets[0].data = streams.feed.passing;
    this.psdChart.data.datasets[1].data = streams.millDischarge.passing;
    this.psdChart.data.datasets[2].data = streams.underflow.passing;
    this.psdChart.data.datasets[3].data = streams.overflow.passing;
    this.psdChart.update('none');
  }

  /**
   * Add a data point to all trend charts.
   * @param {number} t - Simulation time (min)
   * @param {Simulator} sim
   */
  addTrendPoint(t, sim, trendHistory) {
    const label = t.toFixed(2);
    const h = trendHistory;

    // Push to all history arrays
    h.timestamps.push(label);
    h.p80_of.push(+sim.streams.overflow.p80.toFixed(2));
    h.p80_mill.push(+sim.streams.millDischarge.p80.toFixed(2));
    h.p80_target.push(sim.params.targetP80);
    h.feed_solids.push(+sim.streams.feed.solids.toFixed(2));
    h.mill_feed_solids.push(+(sim.streams.feed.solids + sim.streams.underflow.solids).toFixed(2));
    h.uf_solids.push(+sim.streams.underflow.solids.toFixed(2));
    h.of_solids.push(+sim.streams.overflow.solids.toFixed(2));
    h.cl.push(+sim.circulatingLoad.toFixed(1));
    h.inventory.push(+sim.millInventoryDyn.toFixed(2));
    h.power.push(+sim.powerReq.toFixed(0));
    h.power_max.push(sim.params.millPowerMax);
    h.sump_level.push(+sim.sumpLevel.toFixed(2));
    h.sump_sp.push(sim.params.sumpSpLevel);
    h.ww_cycfeed.push(+(sim.streams.sumpOut.ww || 0).toFixed(2));
    h.rho_pulp.push(+(sim.streams.sumpOut.rhoPulp || 1).toFixed(3));
    h.water_mill.push(+sim.params.millWater.toFixed(2));
    h.water_sump.push(+sim.params.sumpWater.toFixed(2));
    h.water_of.push(+sim.streams.overflow.water.toFixed(2));
    h.water_uf.push(+sim.streams.underflow.water.toFixed(2));

    // Trim to maxPoints
    for (const key of Object.keys(h)) {
      if (h[key].length > this.maxPoints) h[key].shift();
    }

    // Update charts
    const labels = h.timestamps;
    this._setData(this.charts.p80,       labels, [h.p80_of, h.p80_mill, h.p80_target]);
    this._setData(this.charts.flows,     labels, [h.feed_solids, h.mill_feed_solids, h.uf_solids, h.of_solids]);
    this._setData(this.charts.cl,        labels, [h.cl]);
    this._setData(this.charts.inventory, labels, [h.inventory]);
    this._setData(this.charts.power,     labels, [h.power, h.power_max]);
    this._setData(this.charts.sump,      labels, [h.sump_level, h.sump_sp]);
    this._setData(this.charts.pulp,      labels, [h.ww_cycfeed, h.rho_pulp]);
    this._setData(this.charts.water,     labels, [h.water_mill, h.water_sump, h.water_of, h.water_uf]);
  }

  _setData(chart, labels, dataArrays) {
    if (!chart) return;
    chart.data.labels = labels;
    dataArrays.forEach((arr, i) => {
      if (chart.data.datasets[i]) chart.data.datasets[i].data = arr;
    });
    chart.update('none');
  }

  _make(canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    return new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: config.datasets.map(d => ({ ...d, data: [] })) },
      options: {
        ...PANEL_DEFAULTS,
        scales: { x: PANEL_DEFAULTS.scales.x, ...config.scales },
      },
    });
  }

  resizeAll() {
    Object.values(this.charts).forEach(c => c && c.resize());
    this.psdChart && this.psdChart.resize();
  }

  destroyAll() {
    Object.values(this.charts).forEach(c => c && c.destroy());
    this.psdChart && this.psdChart.destroy();
    this.charts = {};
    this.psdChart = null;
  }
}

/** Create a fresh trend history object (all arrays empty) */
export function makeTrendHistory() {
  return {
    timestamps: [],
    p80_of: [], p80_mill: [], p80_target: [],
    feed_solids: [], mill_feed_solids: [], uf_solids: [], of_solids: [],
    cl: [], inventory: [],
    power: [], power_max: [],
    sump_level: [], sump_sp: [],
    ww_cycfeed: [], rho_pulp: [],
    water_mill: [], water_sump: [], water_of: [], water_uf: [],
  };
}
