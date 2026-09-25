// ============================================================
// MetSim Studio v2.0 — Alarm System
// Traffic-light semaphores and timestamped event log
// ============================================================

/** Alarm severity levels */
export const SEVERITY = { ALARM: 'ALARM', WARN: 'WARN', INFO: 'INFO' };

/** Alarm rule definitions */
const ALARM_RULES = [
  {
    id: 'sump_alarm',
    label: 'Sump',
    check: (sim) => sim.sumpLevel > 85,
    msg: 'Nivel Sump > 85% — Desborde inminente',
    severity: SEVERITY.ALARM,
  },
  {
    id: 'sump_warn',
    label: 'Sump',
    check: (sim) => sim.sumpLevel > 75 && sim.sumpLevel <= 85,
    msg: 'Nivel Sump > 75%',
    severity: SEVERITY.WARN,
  },
  {
    id: 'sump_low',
    label: 'Sump',
    check: (sim) => sim.sumpLevel < 15,
    msg: 'Nivel Sump < 15% — Riesgo de cavitación',
    severity: SEVERITY.ALARM,
  },
  {
    id: 'power_over',
    label: 'Molino',
    check: (sim) => sim.powerReq > sim.params.millPowerMax * 0.97,
    msg: 'Molino sobre potencia (>97% máx)',
    severity: SEVERITY.ALARM,
  },
  {
    id: 'power_warn',
    label: 'Molino',
    check: (sim) => sim.powerReq > sim.params.millPowerMax * 0.90 && sim.powerReq <= sim.params.millPowerMax * 0.97,
    msg: 'Potencia molino > 90% capacidad',
    severity: SEVERITY.WARN,
  },
  {
    id: 'pump_sat',
    label: 'Bomba',
    check: (sim) => sim.pumpSpeedActual >= 98,
    msg: 'Bomba saturada al 100% — Sin capacidad de control',
    severity: SEVERITY.WARN,
  },
  {
    id: 'cl_high',
    label: 'Ciclón',
    check: (sim) => sim.circulatingLoad > 500,
    msg: 'Carga Circulante > 500% — Riesgo de bola de nieve',
    severity: SEVERITY.ALARM,
  },
  {
    id: 'cl_warn',
    label: 'Ciclón',
    check: (sim) => sim.circulatingLoad > 400 && sim.circulatingLoad <= 500,
    msg: 'Carga Circulante > 400%',
    severity: SEVERITY.WARN,
  },
  {
    id: 'p80_off_spec',
    label: 'Producto',
    check: (sim) => sim.streams.overflow.p80 > sim.params.targetP80 * 1.15,
    msg: 'P80 Overflow fuera de especificación (+15%)',
    severity: SEVERITY.ALARM,
  },
  {
    id: 'p80_warn',
    label: 'Producto',
    check: (sim) => sim.streams.overflow.p80 > sim.params.targetP80 * 1.05 && sim.streams.overflow.p80 <= sim.params.targetP80 * 1.15,
    msg: 'P80 Overflow ligeramente fuera de spec (+5%)',
    severity: SEVERITY.WARN,
  },
  {
    id: 'balance_warn',
    label: 'Balance',
    check: (sim) => Math.abs(sim.residualSolids) > 5,
    msg: `Balance de masa: residual > 5 t/h`,
    severity: SEVERITY.WARN,
  },
];

export class AlarmSystem {
  constructor() {
    this.activeAlarms = new Map();  // id → {rule, since}
    this.eventLog     = [];         // [{time, equipment, msg, severity}]
    this.maxLogSize   = 200;
  }

  /**
   * Evaluate all rules against current simulator state.
   * Fires new alarms, clears resolved ones.
   * @param {Simulator} sim
   */
  evaluate(sim) {
    if (!sim.isResolved) return;

    for (const rule of ALARM_RULES) {
      const triggered = rule.check(sim);

      if (triggered && !this.activeAlarms.has(rule.id)) {
        // New alarm
        this.activeAlarms.set(rule.id, { rule, since: sim.simTime });
        this._addEvent(sim.simTime, rule.label, rule.msg, rule.severity);
      } else if (!triggered && this.activeAlarms.has(rule.id)) {
        // Cleared
        const entry = this.activeAlarms.get(rule.id);
        this._addEvent(sim.simTime, rule.label, `✓ Normalizado: ${rule.msg}`, SEVERITY.INFO);
        this.activeAlarms.delete(rule.id);
      }
    }
  }

  _addEvent(time, equipment, msg, severity) {
    this.eventLog.unshift({ time: time.toFixed(2), equipment, msg, severity });
    if (this.eventLog.length > this.maxLogSize) this.eventLog.pop();
  }

  /**
   * Overall traffic light state: 'ALARM' | 'WARN' | 'NORMAL'
   */
  getOverallState() {
    let hasAlarm = false, hasWarn = false;
    for (const [, entry] of this.activeAlarms) {
      if (entry.rule.severity === SEVERITY.ALARM) hasAlarm = true;
      if (entry.rule.severity === SEVERITY.WARN)  hasWarn  = true;
    }
    if (hasAlarm) return 'ALARM';
    if (hasWarn)  return 'WARN';
    return 'NORMAL';
  }

  /** Get all currently active alarm entries sorted by severity */
  getActiveList() {
    return [...this.activeAlarms.values()]
      .sort((a, b) => {
        const order = { ALARM: 0, WARN: 1, INFO: 2 };
        return order[a.rule.severity] - order[b.rule.severity];
      });
  }

  clearLog() {
    this.eventLog = [];
    this.activeAlarms.clear();
  }
}
