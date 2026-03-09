# Daikin DCSA R-32 Refrigerant Pipe Sizing Tool

A web-based refrigerant pipe sizing calculator for Daikin DCSA commercial split systems (20–75 tons) using R-32 refrigerant. Built for TriState HVAC reps and engineers to determine correct pipe sizes in the field.

## Features

- **Pipe sizing calculations** based on ASHRAE Handbook of Refrigeration (2014) methodology using Darcy-Weisbach pressure drop with Churchill friction factor
- **Suction and liquid line analysis** with velocity checks, temperature drop limits, and minimum/maximum pipe size validation
- **Daikin IM 1402 compliance** — enforces connection sizes from Table 6, maximum pipe lengths, subcooling and superheat limits
- **Configurable design conditions** — condensing temperature, SST, superheat, and subcooling
- **Per-circuit calculations** for DCSA dual-circuit units
- **TriState branded** with Montserrat typography and Daikin group logo

## Engineering References

- ASHRAE Handbook of Refrigeration (2014), Chapter 1
- Daikin Installation Manual IM 1402 (pub 6/19/25)
- Suction line target: ≤ 2°F equivalent temperature drop
- Liquid line: velocity < 300 ft/min
- Suction horizontal minimum velocity: ≥ 500 ft/min (rated capacity)
- Suction vertical riser minimum velocity: ≥ 1,000 ft/min (minimum capacity)

## File Structure

| File | Description |
|------|-------------|
| `index.html` | App shell and UI |
| `calc.js` | Calculation engine — pipe sizing, pressure drop, velocity checks |
| `r32data.js` | R-32 thermodynamic property tables |
| `styles.css` | TriState-branded styling |

## Usage

Open `index.html` in any browser. No build step, no server, no dependencies — fully offline.

1. Select the Daikin DCSA model and efficiency level
2. Configure design conditions (condensing temp, SST, superheat, subcooling)
3. Enter pipe run details (length, vertical rise)
4. View recommended pipe sizes with velocity and pressure drop validation

## Reference Documents

- `IM 1402_pub 6 19 25.pdf` — Daikin DCSA installation manual
- `Inspira IMC Mannington Pharmacy pipe estimates fixed speed - 12mar2025.xlsx` — Sample pipe sizing estimate
