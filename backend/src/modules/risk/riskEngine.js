/**
 * Risk Engine - Central risk evaluation service
 * This is the ONLY place risk logic should be calculated.
 * All callers must pass a normalized snapshot and receive { risk_level, reasons }
 */

const THRESHOLDS = {
  RED: {
    hr_high: 125,
    spo2_low: 90,
    systolic_bp_low: 90,
    rr_high: 25,
    temp_high: 38.5,
    lactate_high: 4.0,
    glucose_low: 3.0,
    glucose_high: 15.0,
  },
  YELLOW: {
    hr_high: 100,
    hr_low: 50,
    spo2_low: 94,
    systolic_bp_low: 100,
    rr_high: 20,
    temp_high: 38.0,
    lactate_high: 2.0,
    glucose_low: 4.0,
    glucose_high: 10.0,
  },
};

const CRITICAL_FLAGS = new Set([
  'hypotension',
  'sepsis_concern',
  'respiratory_distress',
  'bleeding',
  'neurological_change',
]);

const WARNING_FLAGS = new Set([
  'tachycardia',
  'low_urine_output',
  'device_issue',
  'infection_concern',
  'other',
]);

/**
 * Evaluate patient risk from a normalized snapshot.
 * @param {Object} snapshot
 * @param {number|null} snapshot.hr
 * @param {number|null} snapshot.systolic_bp
 * @param {number|null} snapshot.spo2
 * @param {number|null} snapshot.rr
 * @param {number|null} snapshot.temp_c
 * @param {number|null} snapshot.lactate
 * @param {number|null} snapshot.glucose
 * @param {string[]} snapshot.active_flags  - array of flag_type strings
 * @param {string|null} snapshot.risk_override - 'red' | 'yellow' | 'green' | null
 * @returns {{ risk_level: 'red'|'yellow'|'green', reasons: string[], last_evaluated_at: string }}
 */
function evaluateRisk(snapshot) {
  const {
    hr, systolic_bp, spo2, rr, temp_c, lactate, glucose,
    active_flags = [],
    risk_override = null,
  } = snapshot;

  const reasons = [];
  let computedLevel = 'green';

  // --- Red vitals ---
  if (hr != null && hr > THRESHOLDS.RED.hr_high) {
    reasons.push(`HR critically elevated (${hr} bpm)`);
    computedLevel = 'red';
  }
  if (spo2 != null && spo2 < THRESHOLDS.RED.spo2_low) {
    reasons.push(`SpO2 critically low (${spo2}%)`);
    computedLevel = 'red';
  }
  if (systolic_bp != null && systolic_bp < THRESHOLDS.RED.systolic_bp_low) {
    reasons.push(`Severe hypotension (SBP ${systolic_bp} mmHg)`);
    computedLevel = 'red';
  }
  if (rr != null && rr > THRESHOLDS.RED.rr_high) {
    reasons.push(`Respiratory rate critically high (${rr}/min)`);
    computedLevel = 'red';
  }
  if (temp_c != null && temp_c >= THRESHOLDS.RED.temp_high) {
    reasons.push(`High fever (${temp_c}°C)`);
    computedLevel = 'red';
  }
  if (lactate != null && lactate > THRESHOLDS.RED.lactate_high) {
    reasons.push(`Lactate critically elevated (${lactate} mmol/L)`);
    computedLevel = 'red';
  }

  // --- Critical flags ---
  for (const flag of active_flags) {
    if (CRITICAL_FLAGS.has(flag)) {
      reasons.push(`Active critical flag: ${flag.replace(/_/g, ' ')}`);
      computedLevel = 'red';
    }
  }

  // --- Yellow vitals (only if not already red) ---
  if (computedLevel !== 'red') {
    if (hr != null && (hr > THRESHOLDS.YELLOW.hr_high || hr < THRESHOLDS.YELLOW.hr_low)) {
      reasons.push(`HR abnormal (${hr} bpm)`);
      computedLevel = 'yellow';
    }
    if (spo2 != null && spo2 < THRESHOLDS.YELLOW.spo2_low) {
      reasons.push(`SpO2 low (${spo2}%)`);
      computedLevel = 'yellow';
    }
    if (systolic_bp != null && systolic_bp < THRESHOLDS.YELLOW.systolic_bp_low) {
      reasons.push(`Low blood pressure (SBP ${systolic_bp} mmHg)`);
      computedLevel = 'yellow';
    }
    if (rr != null && rr > THRESHOLDS.YELLOW.rr_high) {
      reasons.push(`Elevated respiratory rate (${rr}/min)`);
      computedLevel = 'yellow';
    }
    if (temp_c != null && temp_c >= THRESHOLDS.YELLOW.temp_high) {
      reasons.push(`Fever (${temp_c}°C)`);
      computedLevel = 'yellow';
    }
    if (lactate != null && lactate > THRESHOLDS.YELLOW.lactate_high) {
      reasons.push(`Lactate elevated (${lactate} mmol/L)`);
      computedLevel = 'yellow';
    }

    // Warning flags
    for (const flag of active_flags) {
      if (WARNING_FLAGS.has(flag)) {
        reasons.push(`Active flag: ${flag.replace(/_/g, ' ')}`);
        computedLevel = 'yellow';
      }
    }
  }

  // --- Clinician override (takes precedence over computed) ---
  const final_level = risk_override || computedLevel;
  if (risk_override && risk_override !== computedLevel) {
    reasons.push(`Clinician override: ${risk_override}`);
  }

  return {
    risk_level: final_level,
    reasons,
    last_evaluated_at: new Date().toISOString(),
  };
}

module.exports = { evaluateRisk, THRESHOLDS };
