// ============================================================
// MetSim Studio v2.0 — Simulation Engine
// Motor matemático industrial: PBM, Tromp, PID, Balance Agua
// ============================================================

// Mesh Size Classes (µm) — 20 standard sieve fractions (coarse → fine)
export const MESH_SIZES = [
  25400, 19000, 12700, 9500, 6700, 4750, 3350, 2360,
  1700, 1180, 850, 600, 425, 300, 212, 150, 106, 75, 53, 38
];
const N_CLASSES = MESH_SIZES.length;

// ── Default Simulation Parameters ──────────────────────────
export const DEFAULT_PARAMS = {
  // Feed
  treatment:    100.0,   // t/h fresh feed solids
  f80:         10000.0,  // µm
  wi:           14.0,    // kWh/t Bond Work Index
  oreDensity:    2.70,   // t/m³
  moisture:      3.0,    // % weight

  // Objective
  targetP80:   150.0,   // µm
  efficiency:   92.0,   // %

  // Ball Mill
  millVolume:  120.0,   // m³
  millInventory: 85.0,  // t initial charge
  millPowerMax: 2200,   // kW installed
  millWater:    60.0,   // m³/h added to mill (manual mode)
  millWaterMode: 'manual', // 'manual' | 'auto'
  millSolidsSp:  70.0,  // % w/w setpoint (auto mode)

  // Sump & Pump
  sumpVolume:  160.0,   // m³
  sumpWater:    20.0,   // m³/h dilution water
  pumpMode:    'auto',  // 'auto' | 'manual'
  sumpSpLevel:  55.0,   // % level setpoint
  pumpCapMax:  380.0,   // m³/h max pump capacity
  pumpSpeedBase: 70.0,  // % base speed (manual)
  kp:            2.0,   // PID Proportional gain
  ki:            0.15,  // PID Integral gain
  kd:            0.4,   // PID Derivative gain

  // Cyclone (Plitt-Nageswararao inspired)
  cycD50c:     105.0,   // µm cut size
  cycImperfection: 0.32,// Imperfection (alpha = 1/imperfection for Tromp)
  cycBypass:    12.0,   // % bypass to underflow (Rf water fraction proxy)
  cycActive:      6,    // number of active cyclones
  cycApex:      100,    // mm apex diameter
  cycVortex:    180,    // mm vortex finder diameter
  cycPressure:  100,    // kPa feed pressure

  // PBM Austin parameters
  pbmAlpha:    0.62,    // breakage rate exponent
  pbmMu:       2.4,     // mu parameter
  pbmPhi:      0.72,    // phi for B matrix
  pbmGamma:    0.70,    // gamma for B matrix
  pbmBeta:     3.8,     // beta for B matrix
  pbmDref:     1000.0,  // µm reference size for S
};

// ── Utilities ───────────────────────────────────────────────

/** Clamp a value between lo and hi */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Generate Rosin-Rammler cumulative % passing for a PSD with given P80.
 * Used for feed initialization and cyclone product approximation.
 */
export function generateFeedPSD(f80, n = 0.85) {
  const x0 = f80 / Math.pow(-Math.log(0.2), 1 / n);
  return MESH_SIZES.map(x => clamp((1 - Math.exp(-Math.pow(x / x0, n))) * 100, 0.01, 99.99));
}

/**
 * Interpolate P80 (size at 80% cumulative passing) from an array of % passing.
 * Uses log-linear interpolation for accuracy.
 */
export function interpolateP80(passingArray) {
  for (let i = 0; i < N_CLASSES - 1; i++) {
    const p1 = passingArray[i];
    const p2 = passingArray[i + 1];
    if (p1 >= 80 && p2 <= 80) {
      if (Math.abs(p1 - p2) < 1e-6) return MESH_SIZES[i];
      const logD1 = Math.log10(MESH_SIZES[i]);
      const logD2 = Math.log10(MESH_SIZES[i + 1]);
      return Math.pow(10, logD1 + ((80 - p1) / (p2 - p1)) * (logD2 - logD1));
    }
  }
  if (passingArray[N_CLASSES - 1] >= 80) return MESH_SIZES[N_CLASSES - 1];
  return MESH_SIZES[0];
}

/** Convert cumulative % passing array to individual retained % per sieve */
export function passingToRetained(passing) {
  const retained = [];
  let prev = 100.0;
  for (let i = 0; i < N_CLASSES; i++) {
    retained.push(Math.max(0, prev - passing[i]));
    prev = passing[i];
  }
  return retained;
}

/** Convert mass fraction array (sums to 1.0) to cumulative % passing */
function massFractionToPassing(mf) {
  const passing = new Array(N_CLASSES);
  let cumRetained = 0;
  for (let i = 0; i < N_CLASSES; i++) {
    cumRetained += mf[i];
    passing[i] = clamp((1 - cumRetained) * 100, 0.01, 99.99);
  }
  return passing;
}

// ── PBM: Austin Breakage Functions ──────────────────────────

/**
 * Selection (breakage rate) function S_i using Austin model.
 * S_i = alpha * (d_i / d_ref)^mu  [1/min]
 */
function computeSelectionRates(params) {
  const { pbmAlpha, pbmMu, pbmDref, millPowerMax, treatment } = params;
  // Scale alpha by specific power: more power → faster breakage
  const powerFactor = clamp(params._powerReq / (millPowerMax || 2200), 0.3, 1.2);
  const S = new Array(N_CLASSES);
  for (let i = 0; i < N_CLASSES; i++) {
    S[i] = pbmAlpha * Math.pow(MESH_SIZES[i] / pbmDref, pbmMu) * powerFactor;
  }
  return S;
}

/**
 * Breakage distribution function B_ij (fraction of j that goes to i after breakage).
 * B_ij = phi*(d_i/d_j)^gamma + (1-phi)*(d_i/d_j)^beta  for i < j
 * Normalised so sum over i < j = 1 for each j.
 */
function computeBreakageMatrix(params) {
  const { pbmPhi, pbmGamma, pbmBeta } = params;
  // B[i][j] — fraction of class j that appears in class i after breakage (i < j)
  const B = Array.from({ length: N_CLASSES }, () => new Array(N_CLASSES).fill(0));
  for (let j = 1; j < N_CLASSES; j++) {
    let total = 0;
    for (let i = j + 1; i < N_CLASSES; i++) {
      const ratio = MESH_SIZES[i] / MESH_SIZES[j];
      B[i][j] = pbmPhi * Math.pow(ratio, pbmGamma) + (1 - pbmPhi) * Math.pow(ratio, pbmBeta);
      total += B[i][j];
    }
    // Normalise
    if (total > 0) {
      for (let i = j + 1; i < N_CLASSES; i++) B[i][j] /= total;
    }
  }
  return B;
}

/**
 * One PBM integration step (Euler explicit).
 * Updates mass fractions in-place for a given residence time dt [min].
 * m: mass fractions array (sums to 1), S: selection rates, B: breakage matrix
 */
function stepPBM(m, S, B, dt) {
  const dm = new Array(N_CLASSES).fill(0);
  for (let i = 0; i < N_CLASSES; i++) {
    dm[i] = -S[i] * m[i]; // breakage out of class i
    for (let j = 0; j < i; j++) {
      dm[i] += B[i][j] * S[j] * m[j]; // appearance from coarser class j
    }
  }
  let total = 0;
  for (let i = 0; i < N_CLASSES; i++) {
    m[i] = Math.max(0, m[i] + dm[i] * dt);
    total += m[i];
  }
  // Re-normalise to avoid drift
  if (total > 1e-9) for (let i = 0; i < N_CLASSES; i++) m[i] /= total;
}

// ── Cyclone Tromp Classification ────────────────────────────

/**
 * Compute cyclone partition (fraction to underflow) per size class.
 * Uses full Tromp curve: Y_i = Ra + (1-Ra) / (1 + (d50c/d_i)^alpha)
 * Returns array of length N_CLASSES with values in [0,1].
 */
function computeTrompCurve(d50c, imperfection, bypass) {
  const alpha = 1.0 / Math.max(0.05, imperfection); // steepness
  const Ra = clamp(bypass / 100, 0.01, 0.5);        // bypass fraction
  return MESH_SIZES.map(d => {
    const Ei = Ra + (1 - Ra) / (1 + Math.pow(d50c / d, alpha));
    return clamp(Ei, 0.001, 0.999);
  });
}

/**
 * Apply Tromp classification to a solid stream.
 * Returns {ufMassFrac, ofMassFrac, ufSolids, ofSolids}
 */
function classifyCyclone(feedMassFrac, feedSolids, trompCurve) {
  const ufMF = new Array(N_CLASSES);
  const ofMF = new Array(N_CLASSES);
  let ufSolids = 0, ofSolids = 0;

  for (let i = 0; i < N_CLASSES; i++) {
    const yi = trompCurve[i];
    ufMF[i] = feedMassFrac[i] * yi;
    ofMF[i] = feedMassFrac[i] * (1 - yi);
    ufSolids += feedMassFrac[i] * feedSolids * yi;
    ofSolids += feedMassFrac[i] * feedSolids * (1 - yi);
  }

  // Normalise fractions
  const ufTot = ufMF.reduce((a, b) => a + b, 0);
  const ofTot = ofMF.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N_CLASSES; i++) {
    ufMF[i] = ufTot > 0 ? ufMF[i] / ufTot : 0;
    ofMF[i] = ofTot > 0 ? ofMF[i] / ofTot : 0;
  }
  return { ufMF, ofMF, ufSolids: Math.max(0, ufSolids), ofSolids: Math.max(0, ofSolids) };
}

// ── Water Balance Helpers ────────────────────────────────────

/** Compute pulp stream properties from solids (t/h) and water (m³/h). */
function computeStreamProps(solids, water, oreDensity) {
  const totalMass = solids + water;                   // t/h (water ρ=1)
  const volSolids = solids / oreDensity;              // m³/h
  const totalVol  = volSolids + water;                // m³/h
  const ww = totalMass > 0 ? (solids / totalMass) * 100 : 0;  // % w/w
  const vv = totalVol  > 0 ? (volSolids / totalVol) * 100 : 0; // % v/v
  const rhoPulp = totalVol > 0 ? totalMass / totalVol : 1.0;   // t/m³
  return { ww, vv, rhoPulp, flowrate: totalVol };
}

// ── Main Simulator Class ─────────────────────────────────────

export class Simulator {
  constructor(params = DEFAULT_PARAMS) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this._reset();
  }

  _reset() {
    const p = this.params;
    this.isResolved = false;
    this.isRunning  = false;
    this.simTime    = 0.0; // min
    this.statusText = 'SIN RESOLVER';

    // PID state
    this.pidState = { integral: 0, prevError: 0 };

    // Dynamic scalars
    this.sumpLevel          = p.sumpSpLevel;
    this.sumpVolumeActual   = (p.sumpVolume * p.sumpSpLevel) / 100;
    this.circulatingLoad    = 300.0;   // %
    this.powerReq           = 1600;    // kW
    this.specificEnergy     = 11.0;    // kWh/t
    this.pumpSpeedActual    = p.pumpSpeedBase;
    this.millInventoryDyn   = p.millInventory; // t (dynamic)
    this.residualSolids     = 0;
    this.residualWater      = 0;

    // Mill internal mass fractions (PBM state) — initialized from F80
    this._initMillMassFrac();

    // Streams — {solids, water, massFrac, passing, p80, ww, vv, rhoPulp, flowrate}
    this.streams = {
      feed:         this._makeStream(p.treatment, p.treatment * p.moisture / (100 - p.moisture), null, p.f80),
      millDischarge:this._makeStream(p.treatment * 4, 150, null, 1200),
      sumpOut:      this._makeStream(p.treatment * 4, 170, null, 1200),
      overflow:     this._makeStream(p.treatment, 65, null, p.targetP80),
      underflow:    this._makeStream(p.treatment * 3, 105, null, 1600),
    };

    this._recomputeSteadyState();
  }

  _initMillMassFrac() {
    // Init PBM mass fractions from ground material approximation
    const f80 = this.params.f80;
    const p80_ground = Math.max(200, f80 * 0.12);
    const passing = generateFeedPSD(p80_ground);
    const retained = passingToRetained(passing);
    const total = retained.reduce((a, b) => a + b, 0);
    this._millMassFrac = retained.map(r => r / total);
  }

  _makeStream(solids, water, massFrac, p80) {
    const mf = massFrac || (() => {
      const ret = passingToRetained(generateFeedPSD(p80));
      const s = ret.reduce((a, b) => a + b, 0);
      return ret.map(r => r / s);
    })();
    const passing = massFractionToPassing(mf);
    const actualP80 = interpolateP80(passing);
    return {
      solids, water,
      massFrac: mf,
      passing,
      p80: isNaN(actualP80) ? p80 : actualP80,
      ...computeStreamProps(solids, water, this.params.oreDensity),
    };
  }

  _updateStreamFromMassFrac(stream, solids, water, massFrac) {
    stream.solids   = Math.max(0, solids);
    stream.water    = Math.max(0, water);
    stream.massFrac = massFrac;
    stream.passing  = massFractionToPassing(massFrac);
    stream.p80      = interpolateP80(stream.passing);
    Object.assign(stream, computeStreamProps(stream.solids, stream.water, this.params.oreDensity));
  }

  // ── Steady-State Recalculation ────────────────────────────

  _recomputeSteadyState() {
    const p = this.params;
    const feedSolids = p.treatment;

    // ── 1. Feed stream ──
    const feedWater = (feedSolids * p.moisture) / (100 - p.moisture);
    const feedMF = (() => {
      const ret = passingToRetained(generateFeedPSD(p.f80));
      const s = ret.reduce((a, b) => a + b, 0);
      return ret.map(r => r / s);
    })();
    this._updateStreamFromMassFrac(this.streams.feed, feedSolids, feedWater, feedMF);

    // ── 2. Bond-Law power estimate ──
    const p80target = Math.max(45, Math.min(500, p.targetP80 * (100 / p.efficiency)));
    let energyPerTon = 10 * p.wi * (1 / Math.sqrt(p80target) - 1 / Math.sqrt(p.f80));
    energyPerTon = Math.max(3, energyPerTon);

    // ── 3. Mill feed = fresh + underflow (circulating load) ──
    // Estimate CL from apex/pump interplay
    const pumpFactor = p.pumpCapMax / 380.0;
    const apexFactor = 100.0 / p.cycApex;
    const targetCL = clamp(300.0 * Math.pow(pumpFactor, 1.5) * Math.pow(apexFactor, 0.7), 80, 800);
    this.circulatingLoad = targetCL;

    const underflowSolids = feedSolids * (targetCL / 100);
    const millFeedSolids  = feedSolids + underflowSolids;

    this.specificEnergy = energyPerTon;
    this.powerReq = clamp(feedSolids * energyPerTon * 1.4, 100, p.millPowerMax * 1.05);
    this.params._powerReq = this.powerReq; // pass to PBM

    // ── 4. Mill water balance ──
    let millWaterAdded = p.millWater;
    if (p.millWaterMode === 'auto') {
      // Auto-calculate water to hit millSolidsSp (% w/w)
      const sp = p.millSolidsSp / 100;
      millWaterAdded = Math.max(0, (millFeedSolids * (1 - sp)) / sp - feedWater - underflowSolids * 0.35);
    }
    const underflowWater   = underflowSolids * 0.35; // estimate until cyclone computed
    const millWaterTotal   = millWaterAdded + feedWater + underflowWater;

    // Mill discharge = ground product
    // Use PBM integration approximation: residence time = inventory / feed
    const tauMill = Math.max(0.01, this.millInventoryDyn / millFeedSolids); // min
    const S = computeSelectionRates(p);
    const B = computeBreakageMatrix(p);
    // Clone and step mass fractions for residence time
    const mfMill = [...this._millMassFrac];
    stepPBM(mfMill, S, B, tauMill * 0.8); // partial step to get discharge estimate

    this._updateStreamFromMassFrac(this.streams.millDischarge, millFeedSolids, millWaterTotal, mfMill);

    // ── 5. Sump water ──
    const sumpWaterTotal = millWaterTotal + p.sumpWater;
    const pumpFlowVol    = this.streams.millDischarge.flowrate + p.sumpWater;

    this._updateStreamFromMassFrac(this.streams.sumpOut, millFeedSolids, sumpWaterTotal, mfMill);

    // ── 6. Cyclone classification (Tromp per class) ──
    const d50c = clamp(p.cycD50c, 20, 1000);
    const trompCurve = computeTrompCurve(d50c, p.cycImperfection, p.cycBypass);
    const { ufMF, ofMF, ufSolids, ofSolids } = classifyCyclone(mfMill, millFeedSolids, trompCurve);

    // Water split: water bypass to underflow Rf ~ bypass/100
    const Rf = clamp(p.cycBypass / 100 * 1.2, 0.05, 0.60);
    const ufWater = sumpWaterTotal * Rf;
    const ofWater = sumpWaterTotal * (1 - Rf);

    this._updateStreamFromMassFrac(this.streams.underflow, ufSolids, ufWater, ufMF);
    this._updateStreamFromMassFrac(this.streams.overflow,  ofSolids, ofWater, ofMF);

    this.circulatingLoad = feedSolids > 0 ? (ufSolids / feedSolids) * 100 : 300;

    // ── 7. Pump speed (PID initialisation) ──
    const pumpSpeedCalc = clamp((pumpFlowVol / p.pumpCapMax) * 100, 20, 100);
    this.pumpSpeedActual = pumpSpeedCalc;
    this.sumpLevel = p.sumpSpLevel + (pumpFlowVol > p.pumpCapMax ? 10 : 0);
    this.sumpVolumeActual = (p.sumpVolume * this.sumpLevel) / 100;

    // ── 8. Mass balance residuals ──
    const totalWaterIn  = feedWater + millWaterAdded + p.sumpWater;
    const totalWaterOut = this.streams.overflow.water + this.streams.underflow.water;
    this.residualSolids = feedSolids - this.streams.overflow.solids;
    this.residualWater  = totalWaterIn - totalWaterOut;
  }

  updateParams(newParams) {
    this.params = { ...this.params, ...newParams };
    this._recomputeSteadyState();
  }

  // ── Dynamic Step (called by animation loop) ────────────────

  step(dtMin) {
    const p = this.params;
    this.simTime += dtMin;

    // Clamp dt for numerical stability
    const dt = Math.min(dtMin, 0.05);

    // ── A. PBM: evolve mill internal state ──
    this.params._powerReq = this.powerReq;
    const S = computeSelectionRates(p);
    const B = computeBreakageMatrix(p);

    // Mix feed into mill mass fractions
    const feedSolids     = p.treatment;
    const feedWater      = (feedSolids * p.moisture) / (100 - p.moisture);
    const underflowSolids = this.streams.underflow.solids;
    const millFeedSolids  = feedSolids + underflowSolids;

    // Mass-weighted mixing of feed and recirculating underflow into mill
    const millTotal = this.millInventoryDyn + millFeedSolids * dt;
    const feedMF    = (() => {
      const ret = passingToRetained(generateFeedPSD(p.f80));
      const s = ret.reduce((a, b) => a + b, 0);
      return ret.map(r => r / s);
    })();

    for (let i = 0; i < N_CLASSES; i++) {
      const inFlux = (feedSolids * dt * feedMF[i] + underflowSolids * dt * this.streams.underflow.massFrac[i]);
      this._millMassFrac[i] = (this._millMassFrac[i] * this.millInventoryDyn + inFlux) / millTotal;
    }
    const mfNorm = this._millMassFrac.reduce((a, b) => a + b, 0);
    if (mfNorm > 0) this._millMassFrac = this._millMassFrac.map(m => m / mfNorm);

    // Grind: step PBM for dt minutes
    stepPBM(this._millMassFrac, S, B, dt);

    // ── B. Mill discharge ──
    let millWaterAdded = p.millWater;
    if (p.millWaterMode === 'auto') {
      const sp = p.millSolidsSp / 100;
      millWaterAdded = Math.max(0, (millFeedSolids * (1 - sp)) / sp - feedWater - this.streams.underflow.water * 0.5);
    }
    const millWaterTotal = millWaterAdded + feedWater + this.streams.underflow.water;

    // Power from Bond (updated)
    const millP80 = interpolateP80(massFractionToPassing(this._millMassFrac));
    const p80Bond = Math.max(45, Math.min(p.f80 * 0.95, millP80));
    const Ew = 10 * p.wi * (1 / Math.sqrt(p80Bond) - 1 / Math.sqrt(p.f80));
    this.specificEnergy = Math.max(2, Ew);
    this.powerReq = clamp(feedSolids * this.specificEnergy * 1.4, 100, p.millPowerMax * 1.05);

    // Mill inventory: material balance with discharge
    const dischargeSolids = millFeedSolids;
    this.millInventoryDyn = clamp(this.millInventoryDyn + (millFeedSolids - dischargeSolids) * dt * 0.02 + (Math.random() - 0.5) * 0.3, p.millInventory * 0.5, p.millInventory * 1.5);

    this._updateStreamFromMassFrac(this.streams.millDischarge, millFeedSolids, millWaterTotal, [...this._millMassFrac]);

    // ── C. Sump dynamics ──
    const sumpWaterTotal = millWaterTotal + p.sumpWater;
    const pumpFlowVol    = this.streams.millDischarge.flowrate + p.sumpWater;

    // PID controller for pump speed
    const error = this.sumpLevel - p.sumpSpLevel;
    this.pidState.integral = clamp(this.pidState.integral + error * dt, -60, 60);
    const derivative = (error - this.pidState.prevError) / Math.max(dt, 0.001);
    this.pidState.prevError = error;
    const pidOutput = p.kp * error + p.ki * this.pidState.integral + p.kd * derivative;
    this.pumpSpeedActual = clamp(70 + pidOutput, 20, 100);

    const pumpFlowActual = p.pumpCapMax * (this.pumpSpeedActual / 100);

    // Sump level dynamics: CSTR volume balance
    const volumeIn  = pumpFlowVol;              // m³/h inflow
    const volumeOut = pumpFlowActual;           // m³/h pump out
    const dVdt      = (volumeIn - volumeOut);   // m³/h net change
    const dLdt      = (dVdt / p.sumpVolume) * 100; // %/h
    this.sumpLevel = clamp(this.sumpLevel + dLdt * dt / 60 + (Math.random() - 0.5) * 0.08, 2, 99);
    this.sumpVolumeActual = (p.sumpVolume * this.sumpLevel) / 100;

    // ── D. Cyclone classification ──
    const d50c = clamp(p.cycD50c, 20, 1000);
    const trompCurve = computeTrompCurve(d50c, p.cycImperfection, p.cycBypass);
    const { ufMF, ofMF, ufSolids, ofSolids } = classifyCyclone(
      this._millMassFrac, millFeedSolids, trompCurve
    );

    const Rf = clamp(p.cycBypass / 100 * 1.2, 0.05, 0.60);
    const ufWater = sumpWaterTotal * Rf;
    const ofWater = sumpWaterTotal * (1 - Rf);

    this._updateStreamFromMassFrac(this.streams.underflow, ufSolids, ufWater, ufMF);
    this._updateStreamFromMassFrac(this.streams.overflow, ofSolids, ofWater, ofMF);
    this._updateStreamFromMassFrac(this.streams.sumpOut, millFeedSolids, sumpWaterTotal, [...this._millMassFrac]);

    // ── E. Feed stream ──
    const feedMFfinal = (() => {
      const ret = passingToRetained(generateFeedPSD(p.f80));
      const s = ret.reduce((a, b) => a + b, 0);
      return ret.map(r => r / s);
    })();
    this._updateStreamFromMassFrac(this.streams.feed, feedSolids, feedWater, feedMFfinal);

    // ── F. Circulating load ──
    this.circulatingLoad = feedSolids > 0 ? (ufSolids / feedSolids) * 100 : 300;

    // ── G. Mass balance residuals ──
    const totalWaterIn  = feedWater + millWaterAdded + p.sumpWater;
    const totalWaterOut = this.streams.overflow.water + this.streams.underflow.water;
    this.residualSolids = feedSolids - this.streams.overflow.solids;
    this.residualWater  = totalWaterIn - totalWaterOut;

    // ── H. Status ──
    if (this.simTime > 0.02) {
      this.isResolved = true;
      this.statusText = this.simTime < 0.5 ? 'INICIANDO' : 'TRANSITORIO';
      if (Math.abs(this.sumpLevel - p.sumpSpLevel) < 3 && Math.abs(this.residualSolids) < 2) {
        this.statusText = 'ESTADO ESTACIONARIO';
      }
    }
  }

  reset() {
    this._reset();
  }

  /** Export full simulation snapshot as serialisable object */
  toJSON() {
    return {
      meta: { version: '2.0', timestamp: Date.now() },
      params: { ...this.params },
      state: {
        simTime: this.simTime,
        sumpLevel: this.sumpLevel,
        circulatingLoad: this.circulatingLoad,
        powerReq: this.powerReq,
        specificEnergy: this.specificEnergy,
        pumpSpeedActual: this.pumpSpeedActual,
        millInventoryDyn: this.millInventoryDyn,
        residualSolids: this.residualSolids,
        residualWater: this.residualWater,
      },
      streams: Object.fromEntries(
        Object.entries(this.streams).map(([k, v]) => [k, {
          solids: v.solids, water: v.water, p80: v.p80,
          ww: v.ww, vv: v.vv, rhoPulp: v.rhoPulp,
          passing: v.passing,
        }])
      ),
    };
  }

  /** Restore simulator state from a JSON snapshot */
  fromJSON(snapshot) {
    this.updateParams(snapshot.params);
    if (snapshot.state) {
      Object.assign(this, snapshot.state);
    }
  }
}
