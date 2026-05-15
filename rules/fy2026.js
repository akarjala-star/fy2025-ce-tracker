// FY2026 rules/config layer (versioned)
// Source of truth: FY2026 Client Executive Incentive Plan (FY Apr 1, 2026 – Mar 31, 2027)

export const FY2026 = {
  planVersion: "FY2026",
  fiscalYear: {
    start: "2026-04-01",
    end: "2027-03-31",
    months: ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"],
    quarters: [
      { key: "Q1", months: [0,1,2] },
      { key: "Q2", months: [3,4,5] },
      { key: "Q3", months: [6,7,8] },
      { key: "Q4", months: [9,10,11] },
    ],
  },

  // FY26 weights: Revenue w/ Margin modifier 70%, YOY 10%, MBO 20%
  weights: {
    revenue: 0.70,
    yoy: 0.10,
    mbo: 0.20,
    // no separate margin payout component in FY26 (margin is a modifier)
    margin: 0.00,
  },

  // Revenue payout curve (appendix-style discrete curve)
  // Each entry is a payout multiplier (e.g., 1.10 = 110% of target component).
  // Bands treated inclusive of min, exclusive of max (last is Infinity).
  revenueCurve: [
    { min: -Infinity, max: 91.0, payout: 0.00 },   // <91%
    { min: 91.0, max: 92.0, payout: 0.30 },
    { min: 92.0, max: 93.0, payout: 0.35 },
    { min: 93.0, max: 94.0, payout: 0.40 },
    { min: 94.0, max: 95.0, payout: 0.45 },
    { min: 95.0, max: 96.0, payout: 0.50 },
    { min: 96.0, max: 97.0, payout: 0.60 },
    { min: 97.0, max: 98.0, payout: 0.70 },
    { min: 98.0, max: 99.0, payout: 0.80 },
    { min: 99.0, max: 100.0, payout: 0.90 },
    { min: 100.0, max: 101.0, payout: 1.00 },
    { min: 101.0, max: 102.0, payout: 1.10 },
    { min: 102.0, max: 103.0, payout: 1.20 },
    { min: 103.0, max: 104.0, payout: 1.30 },
    { min: 104.0, max: 105.0, payout: 1.40 },
    { min: 105.0, max: 106.0, payout: 1.50 },
    { min: 106.0, max: 107.0, payout: 1.60 },
    { min: 107.0, max: 108.0, payout: 1.70 },
    { min: 108.0, max: 109.0, payout: 1.80 },
    { min: 109.0, max: 110.0, payout: 1.90 },
    { min: 110.0, max: 111.0, payout: 2.00 },
    { min: 111.0, max: 112.0, payout: 2.10 },
    { min: 112.0, max: 113.0, payout: 2.20 },
    { min: 113.0, max: 114.0, payout: 2.30 },
    { min: 114.0, max: 115.0, payout: 2.40 },
    { min: 115.0, max: 116.0, payout: 2.50 },
    { min: 116.0, max: 117.0, payout: 2.60 },
    { min: 117.0, max: 118.0, payout: 2.70 },
    { min: 118.0, max: 119.0, payout: 2.80 },
    { min: 119.0, max: 120.0, payout: 2.90 },
    { min: 120.0, max: Infinity, payout: 3.00 },  // >120% => 300%
  ],

  // Margin modifier applied to the Account Revenue payment
  marginModifierCurve: [
    { min: -Infinity, max: 80.0, payout: 0.70 },    // <80%
    { min: 80.0, max: 90.0, payout: 0.80 },         // 80-89.99
    { min: 90.0, max: 100.0, payout: 0.90 },        // 90-99.99
    { min: 100.0, max: 110.0, payout: 1.00 },       // 100-109.99
    { min: 110.0, max: 120.0, payout: 1.10 },       // 110-119.99
    { min: 120.0, max: Infinity, payout: 1.15 },    // 120%+
  ],

  // Revenue accelerators apply only when margin attainment exceeds 80%
  revenueAcceleratorsRequireMarginAbovePct: 80.0,

  // Approval/review flag threshold
  reviewThresholdDollars: 250000,
};
``
