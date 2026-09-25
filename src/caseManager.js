// ============================================================
// MetSim Studio v2.0 — Case Manager
// Save/Load JSON cases + Excel export (SheetJS)
// ============================================================

const CASE_PREFIX = 'metsim_v2_case_';

// ── JSON Save / Load ─────────────────────────────────────────

/**
 * Save the current simulator snapshot to localStorage.
 * @param {Simulator} sim
 * @param {string} name - Case name
 */
export function saveCase(sim, name) {
  if (!name || !name.trim()) return;
  const snapshot = sim.toJSON();
  snapshot.meta.name = name.trim();
  try {
    localStorage.setItem(CASE_PREFIX + name.trim(), JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.error('MetSim: Error saving case', e);
    return false;
  }
}

/**
 * Load a saved case into the simulator.
 * @param {Simulator} sim
 * @param {string} name - Case name
 * @returns {object|null} The snapshot metadata or null if not found
 */
export function loadCase(sim, name) {
  const raw = localStorage.getItem(CASE_PREFIX + name);
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw);
    sim.fromJSON(snapshot);
    return snapshot.meta;
  } catch (e) {
    console.error('MetSim: Error loading case', e);
    return null;
  }
}

/**
 * List all saved case names.
 * @returns {Array<{name, ts}>}
 */
export function listCases() {
  const cases = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CASE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        cases.push({
          name: data.meta?.name || key.replace(CASE_PREFIX, ''),
          ts: data.meta?.timestamp ? new Date(data.meta.timestamp).toLocaleString() : '—',
        });
      } catch {}
    }
  }
  return cases.sort((a, b) => b.ts.localeCompare(a.ts));
}

/**
 * Delete a saved case by name.
 */
export function deleteCase(name) {
  localStorage.removeItem(CASE_PREFIX + name);
}

// ── Excel Export (SheetJS) ────────────────────────────────────

/**
 * Export simulation data to a multi-sheet Excel file.
 * Requires window.XLSX from SheetJS CDN.
 * @param {Simulator} sim
 * @param {object} trendHistory - The trends history object from main.js
 * @param {string} caseName
 */
export function exportExcel(sim, trendHistory, caseName = 'MetSim_Case') {
  if (!window.XLSX) {
    alert('SheetJS no disponible. Verifica la conexión a Internet.');
    return;
  }
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `MetSim Studio v2.0 — ${caseName}`,
    Author: 'MetSim Studio',
    CreatedDate: new Date(),
  };

  // ── Sheet 1: Parameters ──
  const p = sim.params;
  const paramRows = [
    ['PARÁMETROS DEL CASO', caseName],
    ['Fecha', new Date().toLocaleString()],
    [],
    ['ALIMENTACIÓN', ''],
    ['Tratamiento (t/h)', p.treatment],
    ['F80 (µm)', p.f80],
    ['Wi Bond (kWh/t)', p.wi],
    ['Densidad mineral (t/m³)', p.oreDensity],
    ['Humedad feed (%)', p.moisture],
    [],
    ['OBJETIVO', ''],
    ['P80 objetivo (µm)', p.targetP80],
    ['Eficiencia (%)', p.efficiency],
    [],
    ['MOLINO DE BOLAS', ''],
    ['Volumen útil (m³)', p.millVolume],
    ['Inventario inicial (t)', p.millInventory],
    ['Potencia máx (kW)', p.millPowerMax],
    ['Agua molino (m³/h)', p.millWater],
    ['Control agua', p.millWaterMode],
    ['SP sólidos descarga (% w/w)', p.millSolidsSp],
    [],
    ['SUMP Y BOMBA', ''],
    ['Volumen sump (m³)', p.sumpVolume],
    ['Agua sump (m³/h)', p.sumpWater],
    ['Setpoint nivel (%)', p.sumpSpLevel],
    ['Capacidad bomba (m³/h)', p.pumpCapMax],
    ['Kp PID', p.kp],
    ['Ki PID', p.ki],
    ['Kd PID', p.kd],
    [],
    ['CICLÓN', ''],
    ['d50c (µm)', p.cycD50c],
    ['Imperfección', p.cycImperfection],
    ['Bypass (%)', p.cycBypass],
    ['Ciclones activos', p.cycActive],
    ['Diámetro apex (mm)', p.cycApex],
    ['Diámetro vortex (mm)', p.cycVortex],
    ['Presión feed (kPa)', p.cycPressure],
    [],
    ['RESULTADOS PRINCIPALES', ''],
    ['P80 Overflow actual (µm)', sim.streams.overflow.p80.toFixed(2)],
    ['Carga Circulante (%)', sim.circulatingLoad.toFixed(1)],
    ['Potencia requerida (kW)', sim.powerReq.toFixed(0)],
    ['Energía específica (kWh/t)', sim.specificEnergy.toFixed(3)],
    ['Nivel Sump (%)', sim.sumpLevel.toFixed(1)],
    ['Residual sólidos (t/h)', sim.residualSolids.toFixed(3)],
    ['Residual agua (m³/h)', sim.residualWater.toFixed(3)],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(paramRows);
  ws1['!cols'] = [{ wch: 32 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Parámetros');

  // ── Sheet 2: Granulometry ──
  const { MESH_SIZES, passingToRetained } = window._metSimUtils;
  const headers2 = ['Tamaño (µm)', 'Alim. Ret (%)', 'Alim. Pas (%)', 'Molino Pas (%)', 'Underflow Pas (%)', 'Overflow Pas (%)', 'Tromp (%)'];
  const feedRet = passingToRetained(sim.streams.feed.passing);
  const grainRows = [headers2];
  for (let i = 0; i < MESH_SIZES.length; i++) {
    const trompVal = sim.streams.underflow.solids > 0
      ? ((sim.streams.underflow.massFrac?.[i] || 0) / ((sim.streams.underflow.massFrac?.[i] || 0) + (sim.streams.overflow.massFrac?.[i] || 0) + 1e-9) * 100).toFixed(2)
      : '—';
    grainRows.push([
      MESH_SIZES[i],
      feedRet[i].toFixed(2),
      sim.streams.feed.passing[i].toFixed(2),
      sim.streams.millDischarge.passing[i].toFixed(2),
      sim.streams.underflow.passing[i].toFixed(2),
      sim.streams.overflow.passing[i].toFixed(2),
      trompVal,
    ]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(grainRows);
  ws2['!cols'] = [{ wch: 14 }, ...Array(6).fill({ wch: 16 })];
  XLSX.utils.book_append_sheet(wb, ws2, 'Granulometría');

  // ── Sheet 3: Mass Balance per Stream ──
  const streamNames = ['feed', 'millDischarge', 'sumpOut', 'overflow', 'underflow'];
  const streamLabels = ['Alimentación Fresca', 'Descarga Molino', 'Salida Sump', 'Overflow (Producto)', 'Underflow (Recirc.)'];
  const headers3 = ['Corriente', 'Sólidos (t/h)', 'Agua (m³/h)', 'P80 (µm)', '% Sólidos w/w', '% Sólidos v/v', 'Densidad Pulpa (t/m³)', 'Flujo Total (m³/h)'];
  const balanceRows = [headers3];
  for (let i = 0; i < streamNames.length; i++) {
    const s = sim.streams[streamNames[i]];
    balanceRows.push([
      streamLabels[i],
      s.solids.toFixed(2),
      s.water.toFixed(2),
      s.p80.toFixed(1),
      (s.ww || 0).toFixed(2),
      (s.vv || 0).toFixed(2),
      (s.rhoPulp || 1).toFixed(3),
      (s.flowrate || 0).toFixed(2),
    ]);
  }
  balanceRows.push([]);
  balanceRows.push(['BALANCE GLOBAL', '', '', '', '', '', '', '']);
  balanceRows.push(['Residual Sólidos (t/h)', sim.residualSolids.toFixed(4)]);
  balanceRows.push(['Residual Agua (m³/h)', sim.residualWater.toFixed(4)]);
  const ws3 = XLSX.utils.aoa_to_sheet(balanceRows);
  ws3['!cols'] = [{ wch: 22 }, ...Array(7).fill({ wch: 16 })];
  XLSX.utils.book_append_sheet(wb, ws3, 'Balance de Masa');

  // ── Sheet 4: Trend History ──
  const tKeys = Object.keys(trendHistory).filter(k => k !== 'timestamps');
  const headers4 = ['Tiempo (min)', ...tKeys];
  const trendRows = [headers4];
  const len = trendHistory.timestamps.length;
  for (let i = 0; i < len; i++) {
    trendRows.push([
      trendHistory.timestamps[i],
      ...tKeys.map(k => trendHistory[k][i] ?? ''),
    ]);
  }
  const ws4 = XLSX.utils.aoa_to_sheet(trendRows);
  ws4['!cols'] = [{ wch: 14 }, ...Array(tKeys.length).fill({ wch: 18 })];
  XLSX.utils.book_append_sheet(wb, ws4, 'Tendencias');

  // Write file
  const fileName = `MetSim_${caseName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
