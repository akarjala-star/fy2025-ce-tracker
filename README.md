# FY2025 Client Executive Attainment Tracker (Prototype)

A **simple interactive web app prototype** for tracking FY2025 Client Executive attainment and projected payout **using FY2025 rules only**.

> **Strategic Pursuit / large GCV discretionary incentives are intentionally excluded** from the total CE attainment and payout in this prototype.

## What this prototype does

- Manual data entry (no SIMS integration yet)
- FY runs **Apr 1, 2025 – Mar 31, 2026**
- Dashboard sections:
  - Overview
  - Revenue
  - Margin
  - YOY Growth
  - MBO
  - Settings / Assumptions
- Shows:
  - Annual attainment %
  - Component payout % (multiplier)
  - Component payout dollars
  - Total projected payout (core CE plan only)
  - Flags for guardrails/exceptions
- Includes monthly + quarterly rollups for revenue & margin.

## How to run

Because the app uses JavaScript modules, run it via a simple local web server.

### Option A (Python)

```bash
cd fy2025-ce-attainment-tracker
python -m http.server 8000
```

Open: http://localhost:8000

### Option B (Node)

```bash
npx serve .
```

## Key inputs (Settings / Assumptions)

### Compensation inputs
- **Annual base salary** (optional reference)
- **Total target incentive** (required for payout math)

Component target incentives are derived using FY2025 weights:
- Revenue = 50%
- Margin = 30%
- YOY = 10%
- MBO = 10%

### FY2025 targets
- FY2025 revenue target (annual)
- FY2025 quarterly revenue targets (Q1–Q4)
- FY2025 quarterly margin targets (Q1–Q4)
- FY2025 YOY target

> The app derives annual margin target as the **sum of quarterly margin targets** (used for annual attainment and payout).

### FY24 reference actuals (guardrails)
- FY24 actual revenue
- FY24 actual margin
- Optional **discretion multipliers** (0–1) for cases where the plan notes payout may be reduced below 100% at company discretion when guardrails are triggered.

### Actuals
- Monthly actual revenue (Apr–Mar)
- Monthly actual margin (Apr–Mar)
- Actual YOY revenue growth
- MBO final payout percent

## Calculation logic (FY2025)

### Annual rollups
- Annual Revenue Actual = sum of monthly revenue (Apr–Mar)
- Annual Margin Actual = sum of monthly margin (Apr–Mar)

### Attainment
- Revenue attainment % = (Annual Revenue Actual / Annual Revenue Target) × 100
- Margin attainment % = (Annual Margin Actual / Annual Margin Target) × 100
- YOY attainment % = (Actual YOY Growth / YOY Target) × 100

### Revenue payout
1. Look up payout multiplier using the **FY2025 Revenue payout curve** (stored in `rules/fy2025.js`).
2. **Revenue cap:** if annual Margin attainment is **below 80%**, Revenue payout is **capped at 100%**.
3. **FY24 revenue guardrail:** if FY25 revenue goal is **below FY24 actual revenue**, accelerators are restricted:
   - If FY25 actual revenue is **above FY25 goal but below FY24 actual**, payout cannot exceed 100% (and may be reduced at discretion).
   - If FY25 actual revenue is **above FY24 actual**, accelerators apply only to the portion above FY24 actual (implemented as a proportional adjustment of the accelerator portion).

### Margin payout
1. Look up payout multiplier using the **FY2025 Margin payout curve** (stored in `rules/fy2025.js`).
2. **FY24 margin guardrail** mirrors the revenue guardrail.

### YOY payout
YOY has discrete outcomes (0 / 100 / 200 / 300) if YOY quota is achieved:
- If YOY achieved and Revenue attainment ≥ 120% → 300%
- Else if YOY achieved and Revenue attainment ≥ 100% → 200%
- Else if YOY achieved → 100%
- Else → 0%

### MBO payout
- Manual entry of final approved payout percent.
- Capped at 100%.

### Strategic Pursuit
- Excluded from totals by design. (There is only an informational notes field.)

## Where FY2026 rule changes would go

This prototype isolates plan mechanics in a **versioned rules layer**:

- `rules/fy2025.js` contains:
  - Fiscal calendar definitions
  - Component weights
  - Revenue & margin payout curves
  - Cross-component cap thresholds
  - Review thresholds

To add FY2026 later:
1. Create `rules/fy2026.js`.
2. Add it to the rule selector in `src/calc.js` (`getRules(planVersion)`).
3. Update the UI to allow selecting plan version (optional).

No UI rewrite should be required—only rules/config.

## Notes

- This is a **prototype** intended for quick iteration.
- It stores data in your browser using **localStorage**.
- Month-level targets shown on the Revenue/Margin pages are **derived** by evenly distributing quarterly targets across the three months of each quarter (for tracking convenience).
