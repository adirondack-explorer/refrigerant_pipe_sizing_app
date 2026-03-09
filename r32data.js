/**
 * R-32 (Difluoromethane) Refrigerant Data for HVAC Pipe Sizing
 *
 * Sources:
 *   - NIST Reference Fluid Thermodynamic and Transport Properties (REFPROP)
 *   - ASHRAE Handbook of Refrigeration
 *   - Daikin R-32 Technical Data
 *
 * All properties are in IP (Imperial) units unless noted.
 * Saturation properties indexed by temperature (°F).
 */

const R32 = (() => {

  // ─────────────────────────────────────────────────────────────────────────
  // SATURATED PROPERTIES TABLE
  // Columns: [Temp °F, Pressure psia, Liq Density lb/ft³, Vap Density lb/ft³,
  //           Latent Heat BTU/lb, Liq Viscosity μPa·s, Vap Viscosity μPa·s,
  //           Liq Cp BTU/(lb·°F), Vap Cp BTU/(lb·°F)]
  // Data derived from NIST REFPROP equations of state for R-32.
  // ─────────────────────────────────────────────────────────────────────────
  const SAT_TABLE = [
    //  T(F)    P(psia)   ρL(lb/ft³)  ρV(lb/ft³)  hfg(BTU/lb) μL(μPa·s)  μV(μPa·s)  CpL     CpV
    [-20, 88.7, 73.10, 1.545, 171.5, 215.0, 11.8, 0.440, 0.218],
    [-15, 96.4, 72.55, 1.670, 169.8, 208.0, 11.9, 0.442, 0.220],
    [-10, 104.6, 72.00, 1.803, 168.1, 201.0, 12.0, 0.444, 0.222],
    [-5, 113.3, 71.43, 1.944, 166.3, 194.0, 12.1, 0.446, 0.224],
    [0, 122.6, 70.85, 2.094, 164.5, 187.5, 12.2, 0.448, 0.226],
    [5, 132.5, 70.26, 2.254, 162.7, 181.0, 12.3, 0.450, 0.228],
    [10, 143.0, 69.65, 2.424, 160.8, 175.0, 12.4, 0.453, 0.231],
    [15, 154.1, 69.03, 2.604, 158.9, 169.0, 12.5, 0.456, 0.234],
    [20, 165.9, 68.39, 2.796, 157.0, 163.0, 12.6, 0.459, 0.237],
    [25, 178.5, 67.74, 2.999, 155.0, 157.5, 12.7, 0.462, 0.240],
    [30, 191.8, 67.07, 3.215, 153.0, 152.0, 12.8, 0.465, 0.243],
    [35, 205.9, 66.38, 3.444, 150.9, 146.5, 12.9, 0.469, 0.247],
    [40, 220.8, 65.67, 3.687, 148.8, 141.5, 13.0, 0.473, 0.251],
    [45, 236.6, 64.94, 3.944, 146.6, 136.5, 13.1, 0.477, 0.255],
    [50, 253.2, 64.20, 4.217, 144.4, 131.5, 13.3, 0.482, 0.260],
    [55, 270.8, 63.43, 4.505, 142.1, 127.0, 13.4, 0.487, 0.265],
    [60, 289.4, 62.64, 4.810, 139.8, 122.5, 13.5, 0.492, 0.270],
    [65, 309.1, 61.83, 5.132, 137.4, 118.0, 13.7, 0.498, 0.276],
    [70, 329.8, 60.99, 5.473, 135.0, 113.5, 13.9, 0.504, 0.283],
    [75, 351.7, 60.13, 5.833, 132.5, 109.5, 14.1, 0.511, 0.290],
    [80, 374.8, 59.24, 6.213, 129.9, 105.5, 14.3, 0.518, 0.297],
    [85, 399.2, 58.32, 6.615, 127.2, 101.5, 14.6, 0.526, 0.305],
    [90, 424.9, 57.37, 7.039, 124.5, 97.5, 14.9, 0.534, 0.314],
    [95, 452.0, 56.38, 7.487, 121.7, 94.0, 15.2, 0.543, 0.323],
    [100, 480.6, 55.36, 7.962, 118.8, 90.5, 15.5, 0.553, 0.333],
    [105, 510.7, 54.30, 8.464, 115.8, 87.0, 15.8, 0.563, 0.344],
    [110, 542.5, 53.20, 8.995, 112.7, 83.5, 16.2, 0.574, 0.356],
    [115, 575.9, 52.06, 9.558, 109.5, 80.0, 16.7, 0.587, 0.369],
    [120, 611.2, 50.86, 10.155, 106.2, 76.5, 17.1, 0.601, 0.383],
    [125, 648.3, 49.62, 10.787, 102.7, 73.0, 17.6, 0.616, 0.399],
    [130, 687.3, 48.31, 11.459, 99.1, 69.5, 17.9, 0.633, 0.416],
  ];

  // Build lookup by temperature
  const satByTemp = {};
  SAT_TABLE.forEach(row => {
    satByTemp[row[0]] = {
      T: row[0],
      P: row[1],
      rhoL: row[2],
      rhoV: row[3],
      hfg: row[4],
      muL: row[5],
      muV: row[6],
      CpL: row[7],
      CpV: row[8],
    };
  });

  /**
   * Interpolate saturated properties at any temperature within range.
   */
  function satProps(T_F) {
    const temps = SAT_TABLE.map(r => r[0]);
    const Tmin = temps[0], Tmax = temps[temps.length - 1];
    T_F = Math.max(Tmin, Math.min(Tmax, T_F));

    // Find bracketing rows
    let lo = SAT_TABLE[0], hi = SAT_TABLE[SAT_TABLE.length - 1];
    for (let i = 0; i < SAT_TABLE.length - 1; i++) {
      if (SAT_TABLE[i][0] <= T_F && SAT_TABLE[i + 1][0] >= T_F) {
        lo = SAT_TABLE[i];
        hi = SAT_TABLE[i + 1];
        break;
      }
    }
    const f = (T_F - lo[0]) / (hi[0] - lo[0]);
    const interp = (a, b) => a + f * (b - a);

    return {
      T: T_F,
      P: interp(lo[1], hi[1]),
      rhoL: interp(lo[2], hi[2]),
      rhoV: interp(lo[3], hi[3]),
      hfg: interp(lo[4], hi[4]),
      muL: interp(lo[5], hi[5]),
      muV: interp(lo[6], hi[6]),
      CpL: interp(lo[7], hi[7]),
      CpV: interp(lo[8], hi[8]),
    };
  }

  /**
   * Superheated vapor density at (SST, superheat).
   * Uses ideal gas correction on saturated vapor density.
   * ρ_sup = ρV_sat × (T_sat_abs / T_sup_abs)
   */
  function superheatedVaporDensity(SST_F, superheat_F) {
    const props = satProps(SST_F);
    const T_sat_abs = SST_F + 459.67;
    const T_sup_abs = (SST_F + superheat_F) + 459.67;
    return props.rhoV * (T_sat_abs / T_sup_abs);
  }

  /**
   * Superheated vapor viscosity — approximately equal to saturation vapor viscosity
   * (small correction; viscosity increases slightly with temperature for vapors).
   * μ_sup ≈ μV_sat × (T_sup_abs / T_sat_abs)^0.7  (Sutherland approximation)
   */
  function superheatedVaporViscosity(SST_F, superheat_F) {
    const props = satProps(SST_F);
    const T_sat_abs = SST_F + 459.67;
    const T_sup_abs = (SST_F + superheat_F) + 459.67;
    return props.muV * Math.pow(T_sup_abs / T_sat_abs, 0.7);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STANDARD COPPER TUBE SIZES (Type L / ACR)
  // OD in inches, ID in inches, cross-section area in ft²
  // ─────────────────────────────────────────────────────────────────────────
  const PIPE_SIZES = [
    { label: '3/8"  (0.375" OD)', OD: 0.375, ID: 0.311, A: Math.PI / 4 * (0.311 / 12) ** 2 },
    { label: '1/2"  (0.500" OD)', OD: 0.500, ID: 0.430, A: Math.PI / 4 * (0.430 / 12) ** 2 },
    { label: '5/8"  (0.625" OD)', OD: 0.625, ID: 0.545, A: Math.PI / 4 * (0.545 / 12) ** 2 },
    { label: '3/4"  (0.750" OD)', OD: 0.750, ID: 0.666, A: Math.PI / 4 * (0.666 / 12) ** 2 },
    { label: '7/8"  (0.875" OD)', OD: 0.875, ID: 0.785, A: Math.PI / 4 * (0.785 / 12) ** 2 },
    { label: '1-1/8" (1.125" OD)', OD: 1.125, ID: 1.025, A: Math.PI / 4 * (1.025 / 12) ** 2 },
    { label: '1-3/8" (1.375" OD)', OD: 1.375, ID: 1.265, A: Math.PI / 4 * (1.265 / 12) ** 2 },
    { label: '1-5/8" (1.625" OD)', OD: 1.625, ID: 1.505, A: Math.PI / 4 * (1.505 / 12) ** 2 },
    { label: '2-1/8" (2.125" OD)', OD: 2.125, ID: 1.985, A: Math.PI / 4 * (1.985 / 12) ** 2 },
    { label: '2-5/8" (2.625" OD)', OD: 2.625, ID: 2.465, A: Math.PI / 4 * (2.465 / 12) ** 2 },
    { label: '3-1/8" (3.125" OD)', OD: 3.125, ID: 2.945, A: Math.PI / 4 * (2.945 / 12) ** 2 },
    { label: '3-5/8" (3.625" OD)', OD: 3.625, ID: 3.425, A: Math.PI / 4 * (3.425 / 12) ** 2 },
    { label: '4-1/8" (4.125" OD)', OD: 4.125, ID: 3.905, A: Math.PI / 4 * (3.905 / 12) ** 2 },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // FITTING EQUIVALENT LENGTH TABLES
  // Based on ASHRAE 2014 Refrigeration Handbook Table 16 (scaled from R-410A,
  // adjusted for R-32 similar density — equivalent length method is fluid-
  // independent for turbulent flow at similar Reynolds numbers).
  // Values in feet of equivalent straight pipe per fitting.
  // Keys: pipe OD in inches.
  // ─────────────────────────────────────────────────────────────────────────
  const EQ_LEN = {
    // OD    90std  90lr   45std  solenoid  drier  sight  gate   swinchk  suctfilt
    0.375: { '90std': 0.8, '90lr': 0.6, '45': 0.4, sol: 7.0, drier: 4.0, sight: 2.0, gate: 0.3, swinchk: 2.0, suctfilt: 6.0 },
    0.500: { '90std': 1.0, '90lr': 0.7, '45': 0.5, sol: 9.0, drier: 5.0, sight: 2.5, gate: 0.4, swinchk: 2.5, suctfilt: 7.0 },
    0.625: { '90std': 1.3, '90lr': 0.9, '45': 0.6, sol: 11.0, drier: 6.0, sight: 3.0, gate: 0.5, swinchk: 3.0, suctfilt: 8.5 },
    0.750: { '90std': 1.6, '90lr': 1.1, '45': 0.8, sol: 13.5, drier: 7.0, sight: 3.5, gate: 0.6, swinchk: 3.5, suctfilt: 10.0 },
    0.875: { '90std': 2.0, '90lr': 1.3, '45': 1.0, sol: 16.0, drier: 8.5, sight: 4.0, gate: 0.7, swinchk: 4.5, suctfilt: 12.0 },
    1.125: { '90std': 2.5, '90lr': 1.7, '45': 1.3, sol: 21.0, drier: 11.0, sight: 5.5, gate: 0.9, swinchk: 5.5, suctfilt: 15.5 },
    1.375: { '90std': 3.2, '90lr': 2.1, '45': 1.6, sol: 26.0, drier: 13.5, sight: 6.5, gate: 1.1, swinchk: 7.0, suctfilt: 19.0 },
    1.625: { '90std': 3.8, '90lr': 2.5, '45': 1.9, sol: 31.0, drier: 16.0, sight: 8.0, gate: 1.3, swinchk: 8.0, suctfilt: 22.5 },
    2.125: { '90std': 5.0, '90lr': 3.3, '45': 2.5, sol: 41.0, drier: 21.0, sight: 10.5, gate: 1.7, swinchk: 11.0, suctfilt: 29.5 },
    2.625: { '90std': 6.3, '90lr': 4.2, '45': 3.1, sol: 51.0, drier: 26.0, sight: 13.0, gate: 2.1, swinchk: 13.5, suctfilt: 37.0 },
    3.125: { '90std': 7.5, '90lr': 5.0, '45': 3.7, sol: 61.0, drier: 31.0, sight: 15.5, gate: 2.5, swinchk: 16.0, suctfilt: 44.0 },
    3.625: { '90std': 8.7, '90lr': 5.8, '45': 4.3, sol: 71.0, drier: 36.0, sight: 18.0, gate: 2.9, swinchk: 18.5, suctfilt: 51.0 },
    4.125: { '90std': 10.0, '90lr': 6.7, '45': 5.0, sol: 81.0, drier: 41.0, sight: 20.5, gate: 3.4, swinchk: 21.0, suctfilt: 58.0 },
  };

  /**
   * Interpolate equivalent length for a given OD and fitting type.
   */
  function getEqLen(OD_in, fittingKey) {
    const ODs = Object.keys(EQ_LEN).map(Number).sort((a, b) => a - b);
    let loOD = ODs[0], hiOD = ODs[ODs.length - 1];
    for (let i = 0; i < ODs.length - 1; i++) {
      if (ODs[i] <= OD_in && ODs[i + 1] >= OD_in) {
        loOD = ODs[i]; hiOD = ODs[i + 1]; break;
      }
    }
    if (loOD === hiOD) return EQ_LEN[loOD][fittingKey] || 0;
    const f = (OD_in - loOD) / (hiOD - loOD);
    const lo = EQ_LEN[loOD][fittingKey] || 0;
    const hi = EQ_LEN[hiOD][fittingKey] || 0;
    return lo + f * (hi - lo);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRESSURE DROP vs TEMPERATURE EQUIVALENT
  // For R-32 at SST=40°F:
  //   dP/dT (saturation slope) ≈ (P@42°F - P@38°F) / 4
  //   Used to convert pressure drop (psi) → temperature equivalent (°F)
  // ─────────────────────────────────────────────────────────────────────────
  function dPdT(SST_F) {
    // Numerical derivative of saturation pressure curve
    const dT = 2;
    const p1 = satProps(SST_F - dT).P;
    const p2 = satProps(SST_F + dT).P;
    return (p2 - p1) / (2 * dT);   // psi/°F
  }

  /**
   * Darcy-Weisbach pressure drop for refrigerant pipe flow.
   * Returns pressure drop in psi per 100 ft of equivalent length.
   *
   * @param {number} massFlow_lbhr   - Mass flow rate (lb/hr)
   * @param {number} rho_lbft3       - Fluid density (lb/ft³)
   * @param {number} mu_uPas         - Dynamic viscosity (μPa·s)
   * @param {number} OD_in           - Pipe OD (inches)
   * @param {number} ID_in           - Pipe ID (inches)
   * @returns {number}               - Pressure drop (psi / 100 ft)
   */
  function pressureDropPer100ft(massFlow_lbhr, rho_lbft3, mu_uPas, OD_in, ID_in) {
    const A_ft2 = Math.PI / 4 * (ID_in / 12) ** 2;
    const velocity_fps = (massFlow_lbhr / 3600) / (rho_lbft3 * A_ft2);  // ft/s
    const velocity_fpm = velocity_fps * 60;

    // Reynolds number  Re = ρ·v·D / μ
    // μ: convert μPa·s → lb/(ft·s):  1 μPa·s = 6.7197e-7 lb/(ft·s)
    const mu_lbfts = mu_uPas * 6.7197e-7;
    const Re = (rho_lbft3 * velocity_fps * (ID_in / 12)) / mu_lbfts;

    // Friction factor (Churchill equation, valid all Re)
    const f = frictionFactor(Re, ID_in);

    // Darcy-Weisbach: ΔP = f × (L/D) × (ρ·v²/2)
    // Per 100 ft:
    const L = 100; // ft
    const D = ID_in / 12;  // ft
    const dP_lbft2 = f * (L / D) * (rho_lbft3 * velocity_fps ** 2 / 2);
    const dP_psi = dP_lbft2 / 144;

    return { dP_psi, velocity_fpm, Re };
  }

  /**
   * Churchill (1977) friction factor correlation — smooth pipe.
   */
  function frictionFactor(Re, ID_in) {
    if (Re < 1) return 64;  // safety
    if (Re < 2300) return 64 / Re;  // laminar
    // Colebrook-White approximation (smooth pipe, roughness ε ≈ 0 for copper)
    // Use Swamee-Jain for copper (ε/D ≈ 0.0001 for drawn copper)
    const eD = 0.0001 / ID_in;
    // Swamee-Jain:
    if (Re >= 4000) {
      return 0.25 / (Math.log10(eD / 3.7 + 5.74 / Re ** 0.9)) ** 2;
    }
    // Transition zone — interpolate
    const f_lam = 64 / 2300;
    const f_turb = 0.25 / (Math.log10(eD / 3.7 + 5.74 / 4000 ** 0.9)) ** 2;
    const t = (Re - 2300) / (4000 - 2300);
    return f_lam + t * (f_turb - f_lam);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    satProps,
    superheatedVaporDensity,
    superheatedVaporViscosity,
    dPdT,
    pressureDropPer100ft,
    PIPE_SIZES,
    EQ_LEN,
    getEqLen,
  };

})();
