/**
 * Daikin DCSA R-32 Refrigerant Pipe Sizing — Calculation Engine
 *
 * Methodology:
 *   - ASHRAE Handbook of Refrigeration (2014), Chapter 1
 *   - Darcy-Weisbach pressure drop with Churchill friction factor
 *   - Suction line design target: ≤ 2°F equivalent temperature drop
 *   - Liquid line: velocity < 300 ft/min
 *   - Suction horizontal minimum velocity: ≥ 500 ft/min (at rated capacity)
 *   - Suction vertical riser minimum velocity: ≥ 1,000 ft/min (at minimum capacity)
 *   - All capacities are PER CIRCUIT (half total unit capacity for DCSA dual-circuit units)
 */

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const BTU_PER_TON = 12000;  // BTU/hr per ton
const MAX_LL_VEL = 300;    // ft/min — max liquid line velocity (Daikin IM 1402)
const MIN_SL_H_VEL = 500;    // ft/min — min suction horizontal velocity (Daikin IM 1402)
const MIN_SL_V_VEL = 1000;   // ft/min — min suction riser velocity (Daikin IM 1402)
const TARGET_DT = 2.0;    // °F — target suction line temperature drop (ASHRAE)
const MAX_PIPE_LEN = 150;    // ft — max actual pipe length (Daikin IM 1402)
const MAX_VERT_LEN = 60;     // ft — max vertical actual pipe length (Daikin IM 1402)
const MIN_SUBCOOL = 10;     // °F — min recommended subcooling (Daikin IM 1402)
const SH_MIN = 10;     // °F — min superheat setting (Daikin IM 1402)
const SH_MAX = 15;     // °F — max superheat setting (Daikin IM 1402)

// ─── TABLE 6: DCSA CONNECTION SIZES (minimum pipe sizes per circuit) ─────────
// Source: Daikin IM 1402, Table 6, page 32
// Keys: model group → efficiency level → {c1s, c1l, c2s, c2l} in inches OD
// These are MINIMUM pipe sizes — field piping must not be smaller than these.
const DCSATABLE6 = {
  // Models 020, 025, 030, 034
  'A': {
    Standard: { c1s: '1-1/8', c1l: '7/8', c2s: '1-1/8', c2l: '7/8' },
    High: { c1s: '1-1/8', c1l: '7/8', c2s: '1-1/8', c2l: '7/8' },
    Premium: { c1s: '1-1/8', c1l: '7/8', c2s: '1-1/8', c2l: '7/8' },
  },
  // Model 031
  'B': {
    Standard: { c1s: '1-1/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
    High: { c1s: '1-1/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
    Premium: { c1s: '1-3/8', c1l: '7/8', c2s: '1-3/8', c2l: '7/8' },
  },
  // Models 035, 040
  'C': {
    Standard: { c1s: '1-1/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
    High: { c1s: '1-1/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
    Premium: { c1s: '1-5/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
  },
  // Models 045, 050, 052, 055, 060, 068, 075
  'D': {
    Standard: { c1s: '1-5/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
    High: { c1s: '1-5/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
    Premium: { c1s: '1-5/8', c1l: '7/8', c2s: '1-5/8', c2l: '7/8' },
  },
};

function getModelGroup(modelNum) {
  if ([20, 25, 30, 34].includes(modelNum)) return 'A';
  if ([31].includes(modelNum)) return 'B';
  if ([35, 40].includes(modelNum)) return 'C';
  return 'D';  // 45,50,52,55,60,68,75
}

// Convert fractional inch string to decimal
function fracToDecimal(s) {
  const map = { '7/8': 0.875, '1-1/8': 1.125, '1-3/8': 1.375, '1-5/8': 1.625, '2-1/8': 2.125 };
  return map[s] || parseFloat(s) || 0.875;
}

// ─── TABLE 7: DCSA FACTORY REFRIGERANT CHARGE (lbs per circuit) ──────────────
// Source: Daikin IM 1402, Table 7, page 33
const DCSA_CHARGE = {
  20: { c1: 17.54, c2: 17.37 },
  25: { c1: 17.30, c2: 17.13 },
  30: { c1: 17.90, c2: 17.73 },
  31: { c1: 27.12, c2: 24.96 },
  34: { c1: 17.60, c2: 17.43 },
  35: { c1: 27.10, c2: 24.76 },
  40: { c1: 26.89, c2: 24.55 },
  45: { c1: 48.48, c2: 45.61 },
  50: { c1: 28.60, c2: 24.31 },
  52: { c1: 28.15, c2: 23.90 },
  55: { c1: 48.12, c2: 45.30 },
  60: { c1: 47.72, c2: 44.91 },
  68: { c1: 46.98, c2: 44.17 },
  75: { c1: 46.18, c2: 43.40 },
};

// ─── FIELD PIPING CHARGE TABLE (lbs per 100 ft, Type L copper) ───────────────
// Source: Daikin IM 1402, page 33
// [OD_in, liq_lbs_per_100ft, suct_lbs_per_100ft]
const CHARGE_PER_100FT = [
  [0.375, 3.06, 0.08],
  [0.500, 5.67, 0.15],
  [0.625, 9.19, 0.25],
  [0.875, 19.06, 0.51],
  [1.125, 32.51, 0.88],
  [1.375, 49.47, 1.33],
  [1.625, 70.18, 1.89],
  [2.125, 121.80, 3.28],
  [2.625, 187.89, 5.06],
  [3.125, 268.22, 7.23],
  [3.625, 362.96, 9.78],
  [4.125, 471.60, 12.71],
];

function getChargePer100ft(OD_in, isLiquid) {
  // Find closest OD in table
  let closest = CHARGE_PER_100FT[0];
  let minDiff = Infinity;
  for (const row of CHARGE_PER_100FT) {
    const diff = Math.abs(row[0] - OD_in);
    if (diff < minDiff) { minDiff = diff; closest = row; }
  }
  return isLiquid ? closest[1] : closest[2];
}

// ─── UTILITY ─────────────────────────────────────────────────────────────────
function fmtVel(v) { return v.toFixed(0) + ' ft/min'; }
function fmtPipe(p) { return p ? p.label : '—'; }
function fmtDT(dt) { return dt.toFixed(2) + ' °F'; }
function fmtDP(dp) { return dp.toFixed(3) + ' psi'; }

// ─── FITTING EQUIVALENT LENGTH CALCULATOR ────────────────────────────────────
/**
 * Given fitting quantities and a pipe OD, return total equivalent length (ft).
 */
function calcFittingEqLen(fittings, OD_in) {
  let total = 0;
  for (const [key, qty] of Object.entries(fittings)) {
    if (qty > 0) {
      total += qty * R32.getEqLen(OD_in, key);
    }
  }
  return total;
}

// ─── PIPE SELECTION ──────────────────────────────────────────────────────────
/**
 * Find the smallest pipe that satisfies the given constraint function.
 * constraintFn(pipe) returns { ok: bool, details: {} }
 */
function selectPipe(constraintFn) {
  for (const pipe of R32.PIPE_SIZES) {
    const result = constraintFn(pipe);
    if (result.ok) return { pipe, details: result.details };
  }
  return { pipe: null, details: {} };
}

// ─── MASS FLOW RATE ──────────────────────────────────────────────────────────
/**
 * Calculate refrigerant mass flow rate for a given capacity.
 * massFlow = Q_BTUhr / hfg  (lb/hr)
 * hfg is the latent heat at SST.
 */
function massFlowRate(tons, SST_F) {
  const props = R32.satProps(SST_F);
  const Q_BTUhr = tons * BTU_PER_TON;
  return Q_BTUhr / props.hfg;   // lb/hr
}

// ─── TOTAL EQUIVALENT LENGTH ─────────────────────────────────────────────────
/**
 * Given straight length + fittings dict + pipe OD, return total equivalent length.
 * Iterates: first estimate pipe (no fittings) → get OD → calc fitting EL → recalc.
 * We do two passes which is sufficient for convergence.
 */
function totalEqLen(straightLen, fittings, OD_in) {
  const fittingEl = calcFittingEqLen(fittings, OD_in);
  return straightLen + fittingEl;
}

// ─── LIQUID LINE SIZING ───────────────────────────────────────────────────────
/**
 * Size the liquid line for a circuit.
 *
 * @param {number} tons        - Circuit cooling capacity (tons)
 * @param {number} SST_F       - Saturated suction temperature (°F)
 * @param {number} CT_F        - Condensing temperature (°F)
 * @param {number} subcool_F   - Subcooling (°F)
 * @param {number} straightLen - Straight pipe length (ft)
 * @param {object} fittings    - {key: qty}
 * @returns {object}
 */
function sizeLiquidLine(tons, SST_F, CT_F, subcool_F, straightLen, fittings,
  elevDiff = 0, elevDir = 'above', minOD = 0, overrideOD = null) {
  // Liquid properties at condensing temperature minus subcooling
  const T_liq = CT_F - subcool_F;
  const props = R32.satProps(Math.min(T_liq, 130));
  const massFlow = massFlowRate(tons, SST_F);

  // Elevation pressure effect on liquid line (Daikin IM 1402, p.27)
  // Liquid density ~56 lb/ft³ → 1 ft head ≈ 56/144 psi = 0.389 psi/ft
  const elevPsi = elevDiff * (props.rhoL / 144);  // psi
  // If evaporator above: elevation ADDS to pressure drop (refrigerant must lift)
  // If evaporator below: elevation SUBTRACTS from pressure drop (gravity assists)
  let elevSign = 0;
  if (elevDir === 'above') elevSign = 1;
  else if (elevDir === 'below') elevSign = -1;

  const dPdT_sat = R32.dPdT(T_liq);

  let chosen = null, details = {};
  for (const pipe of R32.PIPE_SIZES) {
    if (overrideOD) {
      if (Math.abs(pipe.OD - overrideOD) > 0.001) continue;
    } else {
      // Enforce Table 6 minimum pipe size
      if (pipe.OD < minOD - 0.001) continue;
    }

    const EL = totalEqLen(straightLen, fittings, pipe.OD);
    const Q_ft3hr = massFlow / props.rhoL;
    const vel_fpm = (Q_ft3hr / 60) / pipe.A;

    const pd = R32.pressureDropPer100ft(massFlow, props.rhoL, props.muL, pipe.OD, pipe.ID);
    const dP_friction = pd.dP_psi * (EL / 100);
    const dP_total = dP_friction + elevSign * elevPsi;  // net liquid line ΔP
    const dT_loss = dP_total / dPdT_sat;

    if (overrideOD || vel_fpm <= MAX_LL_VEL) {
      chosen = pipe;
      details = {
        velocity: vel_fpm, massFlow, EL, dP_friction, dP_elev: elevSign * elevPsi,
        dP_total, dT_loss, rhoL: props.rhoL, elevDiff, elevDir, isOverride: !!overrideOD
      };
      break;
    }
  }

  if (!chosen && !overrideOD) {
    // Fall back to largest available pipe
    const pipe = R32.PIPE_SIZES[R32.PIPE_SIZES.length - 1];
    const EL = totalEqLen(straightLen, fittings, pipe.OD);
    const Q_ft3hr = massFlow / props.rhoL;
    const vel_fpm = (Q_ft3hr / 60) / pipe.A;
    const pd = R32.pressureDropPer100ft(massFlow, props.rhoL, props.muL, pipe.OD, pipe.ID);
    const dP_friction = pd.dP_psi * (EL / 100);
    const dP_total = dP_friction + elevSign * elevPsi;
    const dT_loss = dP_total / dPdT_sat;
    chosen = pipe;
    details = {
      velocity: vel_fpm, massFlow, EL, dP_friction, dP_elev: elevSign * elevPsi,
      dP_total, dT_loss, rhoL: props.rhoL, elevDiff, elevDir, oversized: true
    };
  }

  return { pipe: chosen, details };
}

// ─── SUCTION LINE – HORIZONTAL ───────────────────────────────────────────────
/**
 * Size horizontal suction line for rated capacity.
 * Constraints:
 *   1. ΔT equivalent ≤ 2°F  (pressure drop limit)
 *   2. Velocity ≥ 500 ft/min (oil return)
 */
function sizeHorizontalSuction(tons, SST_F, superheat_F, straightLen, fittings, minOD = 0, overrideOD = null) {
  const massFlow = massFlowRate(tons, SST_F);
  const rhoV = R32.superheatedVaporDensity(SST_F, superheat_F);
  const muV = R32.superheatedVaporViscosity(SST_F, superheat_F);
  const dPdT = R32.dPdT(SST_F);  // psi/°F

  let chosen = null, details = {};

  for (const pipe of R32.PIPE_SIZES) {
    if (overrideOD) {
      if (Math.abs(pipe.OD - overrideOD) > 0.001) continue;
    } else {
      if (pipe.OD < minOD - 0.001) continue;  // enforce Table 6 minimum
    }
    const EL = totalEqLen(straightLen, fittings, pipe.OD);
    const pd = R32.pressureDropPer100ft(massFlow, rhoV, muV, pipe.OD, pipe.ID);
    const dP_total = pd.dP_psi * (EL / 100);
    const dT_equiv = dP_total / dPdT;
    const vel_fpm = pd.velocity_fpm;

    const okDT = dT_equiv <= TARGET_DT;
    const okVel = vel_fpm >= MIN_SL_H_VEL;

    if (overrideOD || (okDT && okVel)) {
      chosen = pipe;
      details = { velocity: vel_fpm, massFlow, EL, dP_total, dT_equiv, rhoV, okVel, okDT, isOverride: !!overrideOD };
      break;
    }
  }

  // If no pipe satisfies both constraints, find best compromise
  if (!chosen && !overrideOD) {
    let best = null, bestScore = Infinity;
    for (const pipe of R32.PIPE_SIZES) {
      if (pipe.OD < minOD - 0.001) continue;
      const EL = totalEqLen(straightLen, fittings, pipe.OD);
      const pd = R32.pressureDropPer100ft(massFlow, rhoV, muV, pipe.OD, pipe.ID);
      const dP_total = pd.dP_psi * (EL / 100);
      const dT_equiv = dP_total / dPdT;
      const vel_fpm = pd.velocity_fpm;
      const score = (dT_equiv > TARGET_DT ? (dT_equiv - TARGET_DT) : 0)
        + (vel_fpm < MIN_SL_H_VEL ? 3 * (MIN_SL_H_VEL - vel_fpm) / MIN_SL_H_VEL : 0);
      if (score < bestScore) {
        bestScore = score;
        best = pipe;
        details = {
          velocity: vel_fpm, massFlow, EL, dP_total, dT_equiv, rhoV,
          okVel: vel_fpm >= MIN_SL_H_VEL,
          okDT: dT_equiv <= TARGET_DT,
          compromise: true,
        };
      }
    }
    chosen = best;
  }

  return { pipe: chosen, details };
}

// ─── SUCTION LINE – VERTICAL RISER ───────────────────────────────────────────
/**
 * Size vertical suction riser.
 * Sized for MINIMUM circuit capacity to ensure oil return ≥ 1,000 ft/min.
 * Also checks ΔT ≤ 2°F at rated capacity.
 *
 * @param {number} tons           - Rated circuit capacity (tons)
 * @param {number} minCapPct      - Minimum capacity as decimal (e.g. 0.25)
 * @param {number} SST_F
 * @param {number} superheat_F
 * @param {number} straightLen    - Riser height (ft)
 * @param {object} fittings
 */
function sizeVerticalRiser(tons, minCapPct, SST_F, superheat_F, straightLen, fittings, minOD = 0, overrideOD = null) {
  const tonsMin = tons * (minCapPct / 100);
  const massFlowRated = massFlowRate(tons, SST_F);
  const massFlowMin = massFlowRate(tonsMin, SST_F);

  const rhoV = R32.superheatedVaporDensity(SST_F, superheat_F);
  const muV = R32.superheatedVaporViscosity(SST_F, superheat_F);
  const dPdT = R32.dPdT(SST_F);

  let chosen = null, details = {};

  for (const pipe of R32.PIPE_SIZES) {
    if (overrideOD) {
      if (Math.abs(pipe.OD - overrideOD) > 0.001) continue;
    } else {
      if (pipe.OD < minOD - 0.001) continue;  // enforce Table 6 minimum
    }
    const EL = totalEqLen(straightLen, fittings, pipe.OD);

    const pdMin = R32.pressureDropPer100ft(massFlowMin, rhoV, muV, pipe.OD, pipe.ID);
    const pdRated = R32.pressureDropPer100ft(massFlowRated, rhoV, muV, pipe.OD, pipe.ID);
    const velMin = pdMin.velocity_fpm;
    const dP_rated = pdRated.dP_psi * (EL / 100);
    const dT_rated = dP_rated / dPdT;

    const okVelMin = velMin >= MIN_SL_V_VEL;
    const okDT = dT_rated <= TARGET_DT;

    if (overrideOD || (okVelMin && okDT)) {
      chosen = pipe;
      details = {
        velocityMin: velMin, velocityRated: pdRated.velocity_fpm,
        massFlowMin, massFlowRated, EL, dP_rated, dT_rated,
        rhoV, okVelMin, okDT, tonsMin, isOverride: !!overrideOD
      };
      break;
    }
  }

  // Compromise selection if no pipe satisfies both
  if (!chosen && !overrideOD) {
    let best = null, bestScore = Infinity;
    for (const pipe of R32.PIPE_SIZES) {
      if (pipe.OD < minOD - 0.001) continue;
      const EL = totalEqLen(straightLen, fittings, pipe.OD);
      const pdMin = R32.pressureDropPer100ft(massFlowMin, rhoV, muV, pipe.OD, pipe.ID);
      const pdRated = R32.pressureDropPer100ft(massFlowRated, rhoV, muV, pipe.OD, pipe.ID);
      const velMin = pdMin.velocity_fpm;
      const dT_rated = (pdRated.dP_psi * (EL / 100)) / dPdT;
      const score = (velMin < MIN_SL_V_VEL ? 5 * (MIN_SL_V_VEL - velMin) / MIN_SL_V_VEL : 0)
        + (dT_rated > TARGET_DT ? (dT_rated - TARGET_DT) : 0);
      if (score < bestScore) {
        bestScore = score;
        best = pipe;
        details = {
          velocityMin: velMin, velocityRated: pdRated.velocity_fpm,
          massFlowMin, massFlowRated, EL,
          dP_rated: pdRated.dP_psi * (EL / 100),
          dT_rated, rhoV,
          okVelMin: velMin >= MIN_SL_V_VEL,
          okDT: dT_rated <= TARGET_DT,
          compromise: true, tonsMin
        };
      }
    }
    chosen = best;
  }

  return { pipe: chosen, details };
}

// ─── DISCHARGE LINE (MHGRH) ───────────────────────────────────────────────────
/**
 * Size discharge line for rated capacity (MHGRH).
 * Target velocity 500-3500 FPM, friction pressure drop < ~5 PSI.
 */
function sizeDischargeLine(tons, SST_F, CT_F, straightLen, fittings, minOD = 0, overrideOD = null) {
  const massFlow = massFlowRate(tons, SST_F);
  // Discharge gas is highly superheated vapor at condensing pressure.
  // Approximation: use sats at CT_F and correct with ideal gas for discharge temp (est. CT + 30°F).
  const dischargeTemp = CT_F + 30;
  const propsCT = R32.satProps(CT_F);
  const T_sat_abs = CT_F + 459.67;
  const T_sup_abs = dischargeTemp + 459.67;
  const rhoV = propsCT.rhoV * (T_sat_abs / T_sup_abs);
  const muV = propsCT.muV * Math.pow(T_sup_abs / T_sat_abs, 0.7);

  let chosen = null, details = {};

  for (const pipe of R32.PIPE_SIZES) {
    if (overrideOD) {
      if (Math.abs(pipe.OD - overrideOD) > 0.001) continue;
    } else {
      if (pipe.OD < minOD - 0.001) continue; // enforce Table 6 minimum
    }
    const EL = totalEqLen(straightLen, fittings, pipe.OD);
    const pd = R32.pressureDropPer100ft(massFlow, rhoV, muV, pipe.OD, pipe.ID);
    const dP_total = pd.dP_psi * (EL / 100);
    const vel_fpm = pd.velocity_fpm;

    const okDP = dP_total <= 5.0;     // Target friction drop ~5 PSI
    const okVelMin = vel_fpm >= 500;  // Minimum 500 FPM for oil return
    const okVelMax = vel_fpm <= 3500; // Max 3500 FPM

    if (overrideOD || ((okDP || dP_total <= 7.0) && okVelMin && okVelMax)) {
      chosen = pipe;
      details = { velocity: vel_fpm, massFlow, EL, dP_total, rhoV, okVelMin, okVelMax, okDP, isOverride: !!overrideOD };
      break;
    }
  }

  // Fallback selection if no pipe satisfies constraints perfectly
  if (!chosen && !overrideOD) {
    let best = null, bestScore = Infinity;
    for (const pipe of R32.PIPE_SIZES) {
      if (pipe.OD < minOD - 0.001) continue;
      const EL = totalEqLen(straightLen, fittings, pipe.OD);
      const pd = R32.pressureDropPer100ft(massFlow, rhoV, muV, pipe.OD, pipe.ID);
      const dP_total = pd.dP_psi * (EL / 100);
      const vel_fpm = pd.velocity_fpm;
      const score = (vel_fpm < 500 ? 10 * (500 - vel_fpm) / 500 : 0) + (dP_total > 5.0 ? (dP_total - 5.0) : 0);
      if (score < bestScore) {
        bestScore = score;
        best = pipe;
        details = {
          velocity: vel_fpm, massFlow, EL, dP_total, rhoV,
          okVelMin: vel_fpm >= 500, okVelMax: vel_fpm <= 3500, okDP: dP_total <= 5.0, compromise: true
        };
      }
    }
    chosen = best;
  }

  return { pipe: chosen, details };
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function statusBadge(ok, label) {
  return `<span class="badge ${ok ? 'badge-ok' : 'badge-warn'}">${label}</span>`;
}

// ─── MAIN CALCULATE FUNCTION ──────────────────────────────────────────────────
function calculate() {
  // ── Read inputs ──
  const jobName = document.getElementById('jobName').value.trim() || '—';
  const preparedBy = document.getElementById('preparedBy').value.trim() || '—';
  const jobDate = document.getElementById('jobDate').value || '—';
  const projectNum = document.getElementById('projectNumber').value.trim() || '—';
  const modelVal = document.getElementById('dcsamodel').value || '';
  const effLevel = document.getElementById('efficiencyLevel').value || 'Standard';

  const totalTons = parseFloat(document.getElementById('totalCapacity').value);
  const CT_F = parseFloat(document.getElementById('condensingTemp').value);
  const SST_F = parseFloat(document.getElementById('sst').value);
  const superheat = parseFloat(document.getElementById('superheat').value);
  const subcooling = parseFloat(document.getElementById('subcooling').value);

  // Elevation difference
  const elevDiff = Math.abs(parseFloat(document.getElementById('elevDiff').value) || 0);
  const elevDir = document.getElementById('elevDir').value; // 'above' or 'below'

  // Validate
  if (isNaN(totalTons) || totalTons <= 0) {
    alert('Please enter a valid Total Unit Cooling (Tons).');
    return;
  }

  const undergroundOk = document.getElementById('constraintUnderground').checked;
  const retrofitOk = document.getElementById('constraintRetrofit').checked;
  if (!undergroundOk || !retrofitOk) {
    alert("Please confirm the A2L Mandatory Safety Constraints to proceed.");
    return;
  }

  // Per-circuit capacity (two equal circuits)
  const circuitTons = totalTons / 2;

  // ── Table 6 minimum connection sizes ──
  let minConnSizes = null;
  let modelNum = null;
  if (modelVal) {
    modelNum = parseInt(modelVal.replace('DCSA', ''));
    const grp = getModelGroup(modelNum);
    minConnSizes = DCSATABLE6[grp] ? DCSATABLE6[grp][effLevel] : null;
  }

  // ── Liquid line inputs ──
  const llLength = parseFloat(document.getElementById('llLength').value) || 60;
  const llOverride = parseFloat(document.getElementById('llOverride').value) || null;
  const llFittings = {
    '90std': parseInt(document.getElementById('ll_90std').value) || 0,
    '90lr': parseInt(document.getElementById('ll_90lr').value) || 0,
    '45': parseInt(document.getElementById('ll_45').value) || 0,
    sol: parseInt(document.getElementById('ll_sol').value) || 0,
    drier: parseInt(document.getElementById('ll_drier').value) || 0,
    sight: parseInt(document.getElementById('ll_sight').value) || 0,
    gate: parseInt(document.getElementById('ll_gate').value) || 0,
    swinchk: parseInt(document.getElementById('ll_check').value) || 0,
  };

  // ── Suction horizontal inputs ──
  const slhLength = parseFloat(document.getElementById('slhLength').value) || 50;
  const slhOverride = parseFloat(document.getElementById('slhOverride').value) || null;
  const slhFittings = {
    '90std': parseInt(document.getElementById('slh_90std').value) || 0,
    '90lr': parseInt(document.getElementById('slh_90lr').value) || 0,
    '45': parseInt(document.getElementById('slh_45').value) || 0,
    gate: parseInt(document.getElementById('slh_gate').value) || 0,
    swinchk: parseInt(document.getElementById('slh_check').value) || 0,
    suctfilt: parseInt(document.getElementById('slh_filter').value) || 0,
  };

  // ── Suction vertical riser inputs ──
  const slvLength = parseFloat(document.getElementById('slvLength').value) || 0;
  const minCapPct = parseFloat(document.getElementById('minCapacityPct').value) || 25;
  const slvOverride = parseFloat(document.getElementById('slvOverride').value) || null;
  const slvFittings = {
    '90std': parseInt(document.getElementById('slv_90std').value) || 0,
    '90lr': parseInt(document.getElementById('slv_90lr').value) || 0,
    '45': parseInt(document.getElementById('slv_45').value) || 0,
    swinchk: parseInt(document.getElementById('slv_check').value) || 0,
  };

  // ── Discharge Line inputs (MHGRH) ──
  const dlLength = parseFloat(document.getElementById('dlLength').value) || 0;
  const dlOverride = parseFloat(document.getElementById('dlOverride').value) || null;
  const dlFittings = {
    '90std': parseInt(document.getElementById('dl_90std').value) || 0,
    '90lr': parseInt(document.getElementById('dl_90lr').value) || 0,
    '45': parseInt(document.getElementById('dl_45').value) || 0,
    sol: parseInt(document.getElementById('dl_sol').value) || 0,
    gate: parseInt(document.getElementById('dl_gate').value) || 0,
    swinchk: parseInt(document.getElementById('dl_check').value) || 0,
  };

  // ── Minimum pipe OD constraints from Table 6 ──
  // Per-circuit: circuits are assumed equal so use average of c1 and c2 connection sizes.
  // Use the larger of c1/c2 as the minimum (conservative).
  let minSuctionOD = 0, minLiquidOD = 0;
  if (minConnSizes) {
    minSuctionOD = Math.max(fracToDecimal(minConnSizes.c1s), fracToDecimal(minConnSizes.c2s));
    minLiquidOD = Math.max(fracToDecimal(minConnSizes.c1l), fracToDecimal(minConnSizes.c2l));
  }

  // ── Run calculations (pass minimum OD constraints) ──
  const llResult = sizeLiquidLine(circuitTons, SST_F, CT_F, subcooling, llLength, llFittings,
    elevDiff, elevDir, minLiquidOD, llOverride);
  const slhResult = sizeHorizontalSuction(circuitTons, SST_F, superheat, slhLength, slhFittings,
    minSuctionOD, slhOverride);
  const slvResult = (slvLength > 0)
    ? sizeVerticalRiser(circuitTons, minCapPct, SST_F, superheat, slvLength, slvFittings,
      minSuctionOD, slvOverride)
    : null;
  const dlResult = (dlLength > 0)
    ? sizeDischargeLine(circuitTons, SST_F, CT_F, dlLength, dlFittings, minSuctionOD, dlOverride)
    : null;

  // ── Display results ──
  displayResults({
    jobName, preparedBy, jobDate, projectNum,
    model: modelVal ? modelVal.replace('DCSA', 'DCSA ') : '',
    modelNum, effLevel, minConnSizes,
    totalTons, circuitTons, CT_F, SST_F, superheat, subcooling,
    elevDiff, elevDir,
    llLength, llFittings, llResult,
    slhLength, slhFittings, slhResult,
    slvLength, slvFittings, slvResult, minCapPct,
    dlLength, dlFittings, dlResult,
  });
}

// ─── FITTING LABEL UPDATER ────────────────────────────────────────────────────
/**
 * After calculation, annotate each fitting label in a tab with its
 * equivalent length for the selected pipe OD.
 *
 * @param {string} prefix   - e.g. 'll', 'slh', 'slv'
 * @param {number} OD_in    - Selected pipe OD in inches
 * @param {Array}  rows     - Array of [inputId, fittingKey, baseLabelText]
 */
function updateFittingLabels(prefix, OD_in, rows) {
  rows.forEach(([inputId, fittingKey, baseLabel]) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    // The label element immediately precedes the input inside .fitting-row
    const row = input.closest('.fitting-row');
    if (!row) return;
    const lbl = row.querySelector('label');
    if (!lbl) return;
    const eqLen = R32.getEqLen(OD_in, fittingKey);
    lbl.innerHTML = `${baseLabel} <span class="eq-len">(${eqLen.toFixed(1)} ft eq.)</span>`;
  });
}

// ─── DISPLAY RESULTS ─────────────────────────────────────────────────────────
function displayResults(d) {
  const section = document.getElementById('resultsSection');
  section.style.display = '';

  const warnings = [];  // design warnings (amber)
  const notices = [];  // informational notices (blue)

  // ══ DAIKIN IM 1402 COMPLIANCE CHECKS ══════════════════════════════════════

  // 1. Pipe length limits (actual lengths, not equivalent)
  const totalSuctionActual = d.slhLength + d.slvLength;
  if (d.llLength > MAX_PIPE_LEN)
    warnings.push(`Liquid line actual length (${d.llLength} ft) exceeds Daikin's 150 ft maximum — warranty void. Reduce run length (IM 1402).`);
  if (totalSuctionActual > MAX_PIPE_LEN)
    warnings.push(`Total suction actual length (${totalSuctionActual} ft horizontal + vertical) exceeds Daikin's 150 ft maximum — warranty void (IM 1402).`);
  if (d.slvLength > MAX_VERT_LEN)
    warnings.push(`Vertical suction riser height (${d.slvLength} ft) exceeds Daikin's 60 ft maximum vertical limit — warranty void (IM 1402).`);

  // 2. Subcooling
  if (d.subcooling < MIN_SUBCOOL)
    warnings.push(`Subcooling (${d.subcooling}°F) is below Daikin's recommended minimum of 10°F. Insufficient subcooling increases risk of liquid line flashing (IM 1402).`);

  // 3. Superheat setting range (informational)
  if (d.superheat < SH_MIN || d.superheat > SH_MAX)
    notices.push(`Superheat setting (${d.superheat}°F) is outside Daikin's recommended TX valve range of 10–15°F. Low superheat risks liquid floodback; high superheat reduces capacity (IM 1402).`);

  // 4. Elevation subcooling margin warning
  const ll = d.llResult;
  if (d.elevDiff > 0 && d.elevDir === 'above' && ll.details.dT_loss > d.subcooling)
    warnings.push(`Liquid line total subcooling loss (${ll.details.dT_loss.toFixed(1)}°F including ${d.elevDiff} ft elevation lift) exceeds available subcooling (${d.subcooling}°F) — refrigerant will flash before expansion valve. Increase subcooling or reduce pipe length/elevation.`);

  // ── Liquid Line ──────────────────────────────────────────────────────────
  document.getElementById('res_ll_size').textContent = fmtPipe(ll.pipe) + (ll.details.isOverride ? ' (Manual)' : '');
  const llOk = ll.details.velocity <= MAX_LL_VEL;
  const elevNote = d.elevDiff > 0
    ? ` &nbsp;|&nbsp; Elevation ${d.elevDir === 'above' ? '▲' : '▼'} ${d.elevDiff} ft: ${d.elevDir === 'above' ? '+' : '−'}${fmtDP(Math.abs(ll.details.dP_elev))}`
    : '';
  document.getElementById('res_ll_details').innerHTML =
    `Velocity: <strong>${fmtVel(ll.details.velocity)}</strong> &nbsp;|&nbsp; ` +
    `Eq. Length: ${ll.details.EL.toFixed(1)} ft &nbsp;|&nbsp; ` +
    `Friction ΔP: ${fmtDP(ll.details.dP_friction)}${elevNote} &nbsp;|&nbsp; ` +
    `Net ΔP: ${fmtDP(ll.details.dP_total)} &nbsp;|&nbsp; ` +
    `Subcooling Loss: <strong>${ll.details.dT_loss.toFixed(2)} °F</strong>`;
  document.getElementById('res_ll_status').innerHTML =
    statusBadge(llOk, llOk ? `✓ ${fmtVel(ll.details.velocity)} ≤ 300 ft/min` : `⚠ ${fmtVel(ll.details.velocity)} exceeds 300 ft/min`);
  if (!llOk) warnings.push(`Liquid line velocity (${fmtVel(ll.details.velocity)}) exceeds 300 ft/min — risk of liquid hammering when solenoid valve closes. Use larger pipe (IM 1402).`);

  // ── Suction Horizontal ───────────────────────────────────────────────────
  const slh = d.slhResult;
  document.getElementById('res_slh_size').textContent = fmtPipe(slh.pipe) + (slh.details.isOverride ? ' (Manual)' : '');
  const slhOkVel = slh.details.okVel;
  const slhOkDT = slh.details.okDT;
  document.getElementById('res_slh_details').innerHTML =
    `Velocity: <strong>${fmtVel(slh.details.velocity)}</strong> &nbsp;|&nbsp; ` +
    `Eq. Length: ${slh.details.EL.toFixed(1)} ft &nbsp;|&nbsp; ` +
    `ΔP: ${fmtDP(slh.details.dP_total)} &nbsp;|&nbsp; ` +
    `Temp Drop Equiv: <strong>${fmtDT(slh.details.dT_equiv)}</strong>`;
  document.getElementById('res_slh_status').innerHTML =
    statusBadge(slhOkVel, slhOkVel ? `✓ ${fmtVel(slh.details.velocity)} ≥ 500 ft/min` : `⚠ ${fmtVel(slh.details.velocity)} below 500 ft/min`) + ' &nbsp; ' +
    statusBadge(slhOkDT, slhOkDT ? `✓ ${fmtDT(slh.details.dT_equiv)} ≤ 2°F` : `⚠ ${fmtDT(slh.details.dT_equiv)} exceeds 2°F`);
  if (!slhOkVel) warnings.push(`Horizontal suction velocity (${fmtVel(slh.details.velocity)}) is below 500 ft/min minimum for oil return. Reduce pipe size (IM 1402).`);
  if (!slhOkDT) warnings.push(`Horizontal suction temperature drop equivalent (${fmtDT(slh.details.dT_equiv)}) exceeds 2°F target — significant capacity reduction (~900 BTU/hr per PSI drop). Use larger pipe or reduce equivalent length.`);

  // Horizontal slope reminder
  notices.push(`Slope horizontal suction line minimum 4 inches per 100 ft downward in direction of refrigerant flow to assist oil return (IM 1402).`);

  // ── Suction Vertical Riser ───────────────────────────────────────────────
  if (d.slvResult && d.slvLength > 0) {
    const slv = d.slvResult;
    document.getElementById('res_slv_size').textContent = fmtPipe(slv.pipe) + (slv.details.isOverride ? ' (Manual)' : '');
    const slvOkVel = slv.details.okVelMin;
    const slvOkDT = slv.details.okDT;
    document.getElementById('res_slv_details').innerHTML =
      `Min-Cap Velocity: <strong>${fmtVel(slv.details.velocityMin)}</strong> @ ${d.minCapPct}% (${slv.details.tonsMin.toFixed(1)} T/ckt) &nbsp;|&nbsp; ` +
      `Rated Velocity: ${fmtVel(slv.details.velocityRated)} &nbsp;|&nbsp; ` +
      `Riser: ${d.slvLength} ft &nbsp;|&nbsp; ` +
      `ΔT @ Rated: <strong>${fmtDT(slv.details.dT_rated)}</strong>`;
    document.getElementById('res_slv_status').innerHTML =
      statusBadge(slvOkVel, slvOkVel ? `✓ ${fmtVel(slv.details.velocityMin)} ≥ 1,000 ft/min` : `⚠ ${fmtVel(slv.details.velocityMin)} below 1,000 ft/min`) + ' &nbsp; ' +
      statusBadge(slvOkDT, slvOkDT ? `✓ ${fmtDT(slv.details.dT_rated)} ≤ 2°F` : `⚠ ${fmtDT(slv.details.dT_rated)} exceeds 2°F`);
    if (!slvOkVel) {
      warnings.push(
        `Vertical riser velocity at minimum capacity (${fmtVel(slv.details.velocityMin)}) is below 1,000 ft/min minimum for oil return (IM 1402). ` +
        `NOTE: The DCSA MicroTech controller includes an automatic oil return mode that periodically runs compressors at high speed to return oil — ` +
        `oil traps and double risers are NOT required by Daikin for the DCSA (IM 1402). ` +
        `However, if oil return mode alone is insufficient, consider a double riser: size the small riser for 100% of minimum-capacity flow at ≥1,000 ft/min.`
      );
    }
    if (!slvOkDT) warnings.push(`Vertical riser temperature drop equivalent (${fmtDT(slv.details.dT_rated)}) exceeds 2°F target. Consider larger pipe.`);
  } else {
    document.getElementById('res_slv_size').textContent = 'No riser specified';
    document.getElementById('res_slv_details').innerHTML = 'Riser height = 0 ft — no vertical riser sizing required';
    document.getElementById('res_slv_status').innerHTML = '';
  }

  // ── Discharge Line (MHGRH) ───────────────────────────────────────────────
  const dlBlock = document.getElementById('res_dl_block');
  if (d.dlResult && d.dlLength > 0) {
    dlBlock.style.display = 'flex';
    const dl = d.dlResult;
    document.getElementById('res_dl_size').textContent = fmtPipe(dl.pipe) + (dl.details.isOverride ? ' (Manual)' : '');
    const dlOkVel = dl.details.okVelMin && dl.details.okVelMax;
    const dlOkDP = dl.details.okDP;
    document.getElementById('res_dl_details').innerHTML =
      `Velocity: <strong>${fmtVel(dl.details.velocity)}</strong> &nbsp;|&nbsp; ` +
      `Eq. Length: ${dl.details.EL.toFixed(1)} ft &nbsp;|&nbsp; ` +
      `Friction ΔP: <strong>${fmtDP(dl.details.dP_total)}</strong>`;

    const velText = (dl.details.velocity < 500) ? 'below 500 ft/min' : (dl.details.velocity > 3500) ? 'above 3,500 ft/min' : '500-3,500 ft/min';
    document.getElementById('res_dl_status').innerHTML =
      statusBadge(dlOkVel, dlOkVel ? `✓ ${velText}` : `⚠ ${velText}`) + ' &nbsp; ' +
      statusBadge(dlOkDP, dlOkDP ? `✓ ${fmtDP(dl.details.dP_total)} ≤ 5 PSI` : `⚠ ${fmtDP(dl.details.dP_total)} exceeds 5 PSI`);

    if (!dlOkVel) warnings.push(`Discharge line velocity (${fmtVel(dl.details.velocity)}) is outside the recommended 500–3,500 ft/min range for MHGRH oil return and noise control.`);
    if (!dlOkDP) warnings.push(`Discharge line friction drop (${fmtDP(dl.details.dP_total)}) exceeds the ~5 PSI target, which may penalize performance. Consider larger pipe.`);

    notices.push(`MHGRH Note: Modulating hot gas reheat valves will open 100% for 150 seconds during automatic oil return mode, then close for the remainder of the sequence to allow oil return.`);
  } else {
    dlBlock.style.display = 'none';
  }

  // ── Design Summary ───────────────────────────────────────────────────────
  const massFlowPerCircuit = massFlowRate(d.circuitTons, d.SST_F);
  const elevStr = d.elevDiff > 0
    ? `${d.elevDiff} ft (evap. ${d.elevDir} cond.)`
    : 'None (same level)';
  document.getElementById('designSummary').innerHTML = `
    <h3>Design Summary</h3>
    <div class="summary-grid">
      <div><span class="sum-label">DCSA Model</span><span class="sum-val">${d.model || '—'} ${d.effLevel ? '· ' + d.effLevel : ''}</span></div>
      <div><span class="sum-label">Total Capacity</span><span class="sum-val">${d.totalTons} Tons</span></div>
      <div><span class="sum-label">Per Circuit</span><span class="sum-val">${d.circuitTons} Tons</span></div>
      <div><span class="sum-label">Mass Flow / Circuit</span><span class="sum-val">${massFlowPerCircuit.toFixed(0)} lb/hr</span></div>
      <div><span class="sum-label">Condensing Temp</span><span class="sum-val">${d.CT_F} °F</span></div>
      <div><span class="sum-label">SST</span><span class="sum-val">${d.SST_F} °F</span></div>
      <div><span class="sum-label">Superheat</span><span class="sum-val">${d.superheat} °F</span></div>
      <div><span class="sum-label">Subcooling</span><span class="sum-val">${d.subcooling} °F</span></div>
      <div><span class="sum-label">Suction Pressure</span><span class="sum-val">${R32.satProps(d.SST_F).P.toFixed(1)} psia</span></div>
      <div><span class="sum-label">Elevation Diff</span><span class="sum-val">${elevStr}</span></div>
      <div><span class="sum-label">Altitude</span><span class="sum-val">${document.getElementById('altitude').value} ft</span></div>
    </div>
  `;

  // ── Refrigerant Charge Estimate ──────────────────────────────────────────
  const chargeBox = document.getElementById('chargeBox');
  if (d.modelNum && DCSA_CHARGE[d.modelNum] && ll.pipe && d.slhResult.pipe) {
    const factoryCharge = DCSA_CHARGE[d.modelNum];
    const llChargePer100 = getChargePer100ft(ll.pipe.OD, true);
    const suctChargePer100 = getChargePer100ft(d.slhResult.pipe.OD, false);
    const dlChargePer100 = (d.dlResult && d.dlResult.pipe) ? getChargePer100ft(d.dlResult.pipe.OD, false) : 0;

    // Calculate per-circuit values
    const llFieldC1 = llChargePer100 * (d.llLength / 100);
    const suctFieldC1 = suctChargePer100 * ((d.slhLength + d.slvLength) / 100);
    const dlFieldC1 = dlChargePer100 * (d.dlLength / 100);

    const dxCoilCharge = parseFloat(document.getElementById('dxCoilCharge').value) || 0;
    const circuitFactory = factoryCharge.c1;
    const circuitField = llFieldC1 + suctFieldC1 + dlFieldC1;
    const circuitCharge = circuitFactory + dxCoilCharge + circuitField;

    chargeBox.style.display = '';
    chargeBox.innerHTML = `
      <h3>Estimated Refrigerant Charge (R-32) — Per Circuit</h3>
      <div class="charge-grid">
        <div><span class="charge-label">Base Condenser Charge (Ckt 1)</span><span class="charge-val">${circuitFactory.toFixed(2)} lb</span></div>
        <div><span class="charge-label">DX Coil Charge</span><span class="charge-val">${dxCoilCharge.toFixed(2)} lb</span></div>
        <div><span class="charge-label">Field Piping Charge</span><span class="charge-val">${circuitField.toFixed(2)} lb</span></div>
        <div><span class="charge-label">Total Charge (Per Circuit)</span><span class="charge-val" style="font-size:1.15rem;">${circuitCharge.toFixed(2)} lb</span></div>
      </div>
      <div class="charge-grid" style="margin-top:10px;">
        <div><span class="charge-label">Liquid Line Rate</span><span class="charge-val">${llChargePer100.toFixed(2)} lb / 100 ft</span></div>
        <div><span class="charge-label">Suction Line Rate</span><span class="charge-val">${suctChargePer100.toFixed(2)} lb / 100 ft</span></div>
        ${dlChargePer100 > 0 ? `<div><span class="charge-label">Discharge Line Rate</span><span class="charge-val">${dlChargePer100.toFixed(2)} lb / 100 ft</span></div>` : ''}
      </div>
      <div class="charge-note">Factory line charges calculated per circuit based on Daikin IM 1402 Table 7. Add field charge limits and DX coil specifications. Verify final charge by subcooling measurement per IM 1402 Table 8.</div>
    `;
  } else {
    chargeBox.style.display = 'none';
  }

  // ── Warnings & Notices box ───────────────────────────────────────────────
  const wb = document.getElementById('warningsBox');
  wb.style.display = '';
  if (warnings.length > 0 || notices.length > 0) {
    wb.className = 'warnings-box';
    let html = '';
    if (warnings.length > 0) {
      html += '<strong>⚠ Design Warnings</strong><ul>' +
        warnings.map(w => `<li>${w}</li>`).join('') + '</ul>';
    }
    if (notices.length > 0) {
      html += '<div class="notice-block"><strong>ℹ Installation Notes (Daikin IM 1402)</strong><ul>' +
        notices.map(n => `<li>${n}</li>`).join('') + '</ul></div>';
    }
    wb.innerHTML = html;
  } else {
    wb.className = 'warnings-box ok-box';
    wb.innerHTML = '<strong>✓ All Daikin IM 1402 design criteria satisfied.</strong> Review results before finalising pipe specification.';
  }

  // ─ Annotate fitting labels with equivalent lengths for selected pipe sizes ─
  if (d.llResult.pipe) {
    updateFittingLabels('ll', d.llResult.pipe.OD, [
      ['ll_90std', '90std', '90° Standard Elbow'],
      ['ll_90lr', '90lr', '90° Long Radius Elbow'],
      ['ll_45', '45', '45° Elbow'],
      ['ll_sol', 'sol', 'Solenoid Valve'],
      ['ll_drier', 'drier', 'Filter Drier'],
      ['ll_sight', 'sight', 'Sight Glass'],
      ['ll_gate', 'gate', 'Gate Valve'],
      ['ll_check', 'swinchk', 'Swing Check Valve'],
    ]);
  }
  if (d.slhResult.pipe) {
    updateFittingLabels('slh', d.slhResult.pipe.OD, [
      ['slh_90std', '90std', '90° Standard Elbow'],
      ['slh_90lr', '90lr', '90° Long Radius Elbow'],
      ['slh_45', '45', '45° Elbow'],
      ['slh_gate', 'gate', 'Gate Valve'],
      ['slh_check', 'swinchk', 'Swing Check Valve'],
      ['slh_filter', 'suctfilt', 'Suction Filter'],
    ]);
  }
  if (d.slvResult && d.slvResult.pipe) {
    updateFittingLabels('slv', d.slvResult.pipe.OD, [
      ['slv_90std', '90std', '90° Standard Elbow'],
      ['slv_90lr', '90lr', '90° Long Radius Elbow'],
      ['slv_45', '45', '45° Elbow'],
      ['slv_check', 'swinchk', 'Swing Check Valve'],
    ]);
  }

  // Show the eq-len note banner in each tab panel
  ['panel-ll', 'panel-slh', 'panel-slv'].forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    let note = panel.querySelector('.eq-len-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'eq-len-note';
      const subTitle = panel.querySelector('.sub-title');
      if (subTitle) subTitle.insertAdjacentElement('afterend', note);
    }
    const pipeLabels = {
      'panel-ll': d.llResult.pipe ? d.llResult.pipe.label : null,
      'panel-slh': d.slhResult.pipe ? d.slhResult.pipe.label : null,
      'panel-slv': (d.slvResult && d.slvResult.pipe) ? d.slvResult.pipe.label : null,
    };
    const pipeLabel = pipeLabels[panelId];
    if (pipeLabel) {
      note.textContent = `Equivalent lengths shown for selected pipe size: ${pipeLabel}`;
    }
  });

  // ─ Populate print report ─
  buildPrintReport(d, warnings, notices);

  // Scroll to results
  section.scrollIntoView({ behavior: 'smooth' });
}

// ─── PRINT REPORT BUILDER ─────────────────────────────────────────────────────
function buildPrintReport(d, warnings, notices) {
  const prDate = document.getElementById('pr_date');
  if (prDate) prDate.textContent = new Date().toLocaleDateString();

  document.getElementById('pr_jobline').innerHTML =
    `<strong>Job Name:</strong> ${d.jobName} &nbsp;|&nbsp; <strong>Project:</strong> ${d.projectNum} &nbsp;|&nbsp; <strong>Prepared By:</strong> ${d.preparedBy}  &nbsp;|&nbsp;  <strong>Date:</strong> ${d.jobDate}`;

  // Helper: format a fitting row
  function fittingRow(label, qty, OD, key) {
    const eqEach = R32.getEqLen(OD, key);
    const eqTotal = qty * eqEach;
    return qty > 0 ? `<li>${qty} × ${label} (${eqEach.toFixed(1)} ft/ea) = ${eqTotal.toFixed(1)} ft eq.</li>` : '';
  }

  const ll = d.llResult;
  const slh = d.slhResult;
  const slv = d.slvResult;
  const dl = d.dlResult;

  const llOD = ll.pipe ? ll.pipe.OD : 1.125;
  const slhOD = slh.pipe ? slh.pipe.OD : 1.125;
  const slvOD = (slv && slv.pipe) ? slv.pipe.OD : 1.125;
  const dlOD = (dl && dl.pipe) ? dl.pipe.OD : 1.125;

  // ── SECTION 1: System Design & Connections ──
  let s1 = `
    <table class="pr-info-table">
      <tr><th>DCSA Model</th><td>${d.model || '—'} ${d.effLevel ? '· ' + d.effLevel : ''}</td></tr>
      <tr><th>Capacity</th><td>Total: ${d.totalTons} Tons &nbsp;|&nbsp; Per Circuit: ${d.circuitTons} Tons</td></tr>
    </table>
    <h3 style="margin-top:15px; margin-bottom:5px; font-size:1.05rem;">Calculated Ideal Pipe Sizes & Equivalent Lengths</h3>
    <table class="pr-results-table">
      <thead>
        <tr><th>Line</th><th>Size</th><th>Total Eq. Length (TEL)</th></tr>
      </thead>
      <tbody>
        <tr><td>Liquid Line</td><td><strong>${ll.pipe ? ll.pipe.label : '—'}</strong> ${ll.details.isOverride ? '(Manual)' : ''}</td><td>${ll.pipe ? ll.details.EL.toFixed(1) : '—'} ft</td></tr>
        <tr><td>Suction (Horizontal)</td><td><strong>${slh.pipe ? slh.pipe.label : '—'}</strong> ${slh.details.isOverride ? '(Manual)' : ''}</td><td>${slh.pipe ? slh.details.EL.toFixed(1) : '—'} ft</td></tr>
        <tr><td>Suction (Vertical)</td><td><strong>${(slv && slv.pipe) ? slv.pipe.label : '—'}</strong> ${(slv && slv.details.isOverride) ? '(Manual)' : ''}</td><td>${slv ? slv.details.EL.toFixed(1) : '—'} ft</td></tr>
        <tr><td>Discharge (MHGRH)</td><td><strong>${(dl && dl.pipe) ? dl.pipe.label : '—'}</strong> ${(dl && dl.details.isOverride) ? '(Manual)' : ''}</td><td>${dl ? dl.details.EL.toFixed(1) : '—'} ft</td></tr>
      </tbody>
    </table>
  `;
  if (d.minConnSizes) {
    s1 += `<div class="pr-notices" style="margin-top:10px;">
      <strong>Daikin Physical Connection Sizes (Unit):</strong><br>
      Ckt 1: Suction ${d.minConnSizes.c1s}" / Liquid ${d.minConnSizes.c1l}"<br>
      Ckt 2: Suction ${d.minConnSizes.c2s}" / Liquid ${d.minConnSizes.c2l}"<br>
      <em>Plan for appropriate reducers or expanders at the equipment connections.</em>
    </div>`;
  }
  document.getElementById('pr_section_1_body').innerHTML = s1;

  // ── SECTION 2: A2L Safety & Minimum Room Area ──
  let totalSystemCharge = 0;
  let s2 = '';
  const dxCoilCharge = parseFloat(document.getElementById('dxCoilCharge').value) || 0;
  const altitudeFt = parseFloat(document.getElementById('altitude').value) || 0;
  const altitudeM = altitudeFt * 0.3048;

  // Quick altitude multiplier interpolation
  const altTbl = [
    [0, 1.000], [305, 1.047], [500, 1.078], [1000, 1.156], [1250, 1.195],
    [1500, 1.234], [1750, 1.273], [2000, 1.312], [2250, 1.351], [2500, 1.390],
    [2750, 1.429], [3000, 1.468], [3250, 1.507], [3500, 1.546]
  ];
  let altMult = 1.0;
  if (altitudeM >= 3500) altMult = 1.546;
  else {
    for (let i = 0; i < altTbl.length - 1; i++) {
      if (altitudeM >= altTbl[i][0] && altitudeM <= altTbl[i + 1][0]) {
        const span = altTbl[i + 1][0] - altTbl[i][0];
        const frac = span === 0 ? 0 : (altitudeM - altTbl[i][0]) / span;
        altMult = altTbl[i][1] + frac * (altTbl[i + 1][1] - altTbl[i][1]);
        break;
      }
    }
  }

  if (d.modelNum && DCSA_CHARGE[d.modelNum] && ll.pipe && slh.pipe) {
    const factoryCharge = DCSA_CHARGE[d.modelNum];
    const llChargePer100 = getChargePer100ft(ll.pipe.OD, true);
    const suctChargePer100 = getChargePer100ft(slh.pipe.OD, false);
    const dlChargePer100 = (dl && dl.pipe) ? getChargePer100ft(dl.pipe.OD, false) : 0;

    // Calculate per-circuit values
    const llFieldC1 = llChargePer100 * (d.llLength / 100);
    const suctFieldC1 = suctChargePer100 * ((d.slhLength + d.slvLength) / 100);
    const dlFieldC1 = dlChargePer100 * (d.dlLength / 100);

    const circuitFactory = factoryCharge.c1;
    const circuitCharge = circuitFactory + dxCoilCharge + llFieldC1 + suctFieldC1 + dlFieldC1;

    // Minimum Room Area A2L Formula Approximation based on single largest independent circuit
    const baseArea = Math.pow(circuitCharge / 3.65, 2);
    const finalArea = baseArea * altMult;

    s2 += `
    <table class="pr-info-table">
      <tr><th>Base Condenser Charge (Per Circuit)</th><td>${circuitFactory.toFixed(2)} lbs</td></tr>
      <tr><th>DX Coil R32 Charge (Per Circuit)</th><td>${dxCoilCharge.toFixed(2)} lbs</td></tr>
      <tr><th>Field Piping Charge (Per Circuit)</th><td>${(llFieldC1 + suctFieldC1 + dlFieldC1).toFixed(2)} lbs</td></tr>
      <tr style="background:#f1f5f9;"><th><strong>Total Refrigerant Charge (Per Circuit)</strong></th><td><strong>${circuitCharge.toFixed(2)} lbs</strong></td></tr>
      <tr><th>Required Min. Area (Based on 1 Circuit)</th><td><strong>${finalArea.toFixed(1)} sq ft</strong> (Altitude Mult: ${altMult.toFixed(3)})</td></tr>
    </table>
    `;
  } else {
    s2 += `<p>Insufficient data to calculate Total Charge and Minimum Room Area.</p>`;
  }

  s2 += `
    <div class="pr-warnings" style="margin-top: 15px;">
      <strong>⚠ Connected Spaces Rules:</strong> Adjacent spaces only count if they share a permanent opening of at least 0.0123 m² (50% below 200 mm from the floor) and a second opening at least 1.5m above the floor. Drop ceilings alone do not qualify.
    </div>
  `;
  document.getElementById('pr_section_2_body').innerHTML = s2;

  // ── SECTION 3: Leak Testing & Evacuation Procedure ──
  const s3 = `
    <div class="pr-notes">
      <ul>
        <li><strong>Leak Testing:</strong> Instruct the technician to manually open isolation/electronic valves. Test the low side to <strong>240 PSIG</strong> and the high side to <strong>600 PSIG</strong>. Field joints must be tightness tested to a sensitivity of 5 grams per year.</li>
        <li style="margin-top: 8px;"><strong>Triple Evacuation:</strong> Use a ~3 CFM pump. Pull to 29 in. Hg (740 mm), break with refrigerant vapor to 0 psig (0 microns), hold for 1 hour, and repeat three times.</li>
      </ul>
    </div>
  `;
  document.getElementById('pr_section_3_body').innerHTML = s3;

  // ── SECTION 4: Charging Procedure & Performance Tuning ──
  let subcoolTarget = "10–15°F";
  if (d.CT_F < 100) subcoolTarget = "5–10°F (75–85°F ambient)";
  else if (d.CT_F > 115) subcoolTarget = "15–20°F (95–105°F ambient)";
  else subcoolTarget = "10–15°F (85–95°F ambient)";

  const s4 = `
    <div class="pr-notes">
      <ul>
        <li><strong>Charging:</strong> Elevate the inverted drum above the condenser to charge <strong>75% liquid into the high side</strong>. Then, switch to the suction side and carefully throttle vapor to the compressor.</li>
        <li style="margin-top: 8px;"><strong>Tuning Targets:</strong> Target Superheat is <strong>10°F to 15°F</strong>. Expected Subcooling is <strong>${subcoolTarget}</strong>.</li>
        <li style="margin-top: 8px;"><strong>Final Step:</strong> Label the system with the working fluid (R-32), the final charge amount, and the date.</li>
      </ul>
    </div>
    <div class="pr-warnings" style="margin-top:15px; font-size:1.1em; padding:15px; border-width: 2px;">
      <strong>CRITICAL:</strong> Subcooling must be calculated using the difference between the liquid refrigerant temperature leaving the condenser and the compressor saturated discharge temperature. Do not use the liquid pressure.
    </div>
  `;
  document.getElementById('pr_section_4_body').innerHTML = s4;
}

function prTable(rows) {
  return '<table class="pr-info-table">' +
    rows.map(([k, v]) => `<tr><td class="pr-key">${k}</td><td class="pr-val">${v}</td></tr>`).join('') +
    '</table>';
}

// ─── CLEAR / RESET ────────────────────────────────────────────────────────────
function clearForm() {
  document.getElementById('jobName').value = '';
  document.getElementById('preparedBy').value = '';
  document.getElementById('jobDate').valueAsDate = new Date();
  document.getElementById('projectNumber').value = '';
  document.getElementById('dcsamodel').value = '';
  document.getElementById('efficiencyLevel').value = 'Standard';
  document.getElementById('totalCapacity').value = '';
  document.getElementById('condensingTemp').value = '120';
  document.getElementById('sst').value = '40';
  document.getElementById('superheat').value = '10';
  document.getElementById('subcooling').value = '10';
  document.getElementById('elevDiff').value = '0';
  document.getElementById('elevDir').value = 'above';
  document.getElementById('llLength').value = '60';
  document.getElementById('slhLength').value = '50';
  document.getElementById('slvLength').value = '10';
  document.getElementById('minCapacityPct').value = '25';

  // Hide dynamic info panels that appear after model selection
  const connSizeBox = document.getElementById('connSizeBox');
  if (connSizeBox) connSizeBox.style.display = 'none';
  const chargeBox = document.getElementById('chargeBox');
  if (chargeBox) chargeBox.style.display = 'none';

  ['ll_90std', 'll_90lr', 'll_45', 'll_gate', 'll_check'].forEach(id => document.getElementById(id).value = 0);
  document.getElementById('ll_sol').value = 1;
  document.getElementById('ll_drier').value = 1;
  document.getElementById('ll_sight').value = 1;

  ['slh_90std', 'slh_90lr', 'slh_45', 'slh_gate', 'slh_check', 'slh_filter'].forEach(id => document.getElementById(id).value = 0);
  ['slv_90lr', 'slv_45', 'slv_check'].forEach(id => document.getElementById(id).value = 0);
  document.getElementById('slv_90std').value = 2;

  document.getElementById('resultsSection').style.display = 'none';

  // Reset fitting labels back to plain text (remove eq-len annotations)
  const labelResets = [
    ['ll_90std', '90° Standard Elbow'], ['ll_90lr', '90° Long Radius Elbow'],
    ['ll_45', '45° Elbow'], ['ll_sol', 'Solenoid Valve'],
    ['ll_drier', 'Filter Drier'], ['ll_sight', 'Sight Glass'],
    ['ll_gate', 'Gate Valve'], ['ll_check', 'Swing Check Valve'],
    ['slh_90std', '90° Standard Elbow'], ['slh_90lr', '90° Long Radius Elbow'],
    ['slh_45', '45° Elbow'], ['slh_gate', 'Gate Valve'],
    ['slh_check', 'Swing Check Valve'], ['slh_filter', 'Suction Filter'],
    ['slv_90std', '90° Standard Elbow'], ['slv_90lr', '90° Long Radius Elbow'],
    ['slv_45', '45° Elbow'], ['slv_check', 'Swing Check Valve'],
  ];
  labelResets.forEach(([inputId, baseText]) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const row = input.closest('.fitting-row');
    if (!row) return;
    const lbl = row.querySelector('label');
    if (lbl) lbl.textContent = baseText;
  });

  // Remove eq-len notes from tab panels
  document.querySelectorAll('.eq-len-note').forEach(el => el.remove());
}
