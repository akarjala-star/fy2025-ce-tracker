import { FY2025 } from '../rules/fy2025.js';

export function getRules(planVersion) {
  // Future: map FY2026, etc.
  return FY2025;
}

export function money(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function pct(n, digits = 1) {
  if (!isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function sum(arr) {
  return (arr || []).reduce((a,b)=>a+(Number(b)||0), 0);
}

export function lookupCurveMultiplier(curve, attainmentPct) {
  const x = Number(attainmentPct);
  const band = curve.find(b => x >= b.min && x < b.max) || curve[curve.length - 1];
  return band?.payout ?? 0;
}

export function calculate(model, planVersion = 'FY2025') {
  const rules = getRules(planVersion);

  // Inputs
  const totalTargetIncentive = Number(model.total_target_incentive || 0);
  const weights = rules.weights;

  const targets = model.targets || {};
  const actuals = model.actuals || {};

  // Targets
  const revenueTargetFY = Number(targets.revenue_fy || sum([targets.revenue_q1, targets.revenue_q2, targets.revenue_q3, targets.revenue_q4]));
  const marginTargetFY  = Number(targets.margin_fy  || sum([targets.margin_q1, targets.margin_q2, targets.margin_q3, targets.margin_q4]));
  const yoyTargetFY     = Number(targets.yoy_growth_fy || 0);

  // Actuals
  const monthlyRevenue = (actuals.monthly_revenue || []).map(x => Number(x || 0));
  const monthlyMargin  = (actuals.monthly_margin || []).map(x => Number(x || 0));
  const revenueActualFY = sum(monthlyRevenue);
  const marginActualFY  = sum(monthlyMargin);

  const yoyActual = Number(actuals.yoy_growth_actual || 0);

  // Attainment
  const revenueAttainPct = revenueTargetFY > 0 ? (revenueActualFY / revenueTargetFY) * 100 : 0;
  const marginAttainPct  = marginTargetFY  > 0 ? (marginActualFY  / marginTargetFY ) * 100 : 0;
  const yoyAttainPct     = yoyTargetFY     > 0 ? (yoyActual       / yoyTargetFY    ) * 100 : 0;

  // Component target incentives
  const targetIncentive = {
    revenue: totalTargetIncentive * weights.revenue,
    margin: totalTargetIncentive * weights.margin,
    yoy: totalTargetIncentive * weights.yoy,
    mbo: totalTargetIncentive * weights.mbo,
  };

  // Base curve multipliers
  let revenuePayoutMult = lookupCurveMultiplier(rules.revenueCurve, revenueAttainPct);
  let marginPayoutMult  = lookupCurveMultiplier(rules.marginCurve,  marginAttainPct);

  // Cross-component cap: if annual margin attainment <80%, revenue payout is capped at 100%.
  const flags = {
    revenueCappedByMargin: false,
    revenueFY24Guardrail: false,
    marginFY24Guardrail: false,
    discretionaryReductionPossible: false,
    payoutReviewRequired: false,
    targetRevision: Boolean(model.target_revision_flag),
  };

  if (marginAttainPct < rules.revenueCapWhenMarginBelowPct && revenuePayoutMult > 1.0) {
    revenuePayoutMult = 1.0;
    flags.revenueCappedByMargin = true;
  }

  // FY24 guardrails (accelerator restriction when FY25 goal is below FY24 actuals)
  const fy24 = model.fy24 || {};
  const fy24Rev = Number(fy24.actual_revenue || 0);
  const fy24Mar = Number(fy24.actual_margin || 0);

  const revDisc = clamp(Number(model.guardrails?.revenue_discretion_multiplier ?? 1.0), 0, 1);
  const marDisc = clamp(Number(model.guardrails?.margin_discretion_multiplier  ?? 1.0), 0, 1);

  // Revenue guardrail
  if (revenueTargetFY > 0 && fy24Rev > 0 && revenueTargetFY < fy24Rev) {
    flags.revenueFY24Guardrail = true;

    if (revenueActualFY > revenueTargetFY && revenueActualFY < fy24Rev) {
      // No accelerators; payment cannot exceed 100%; may be reduced below 100% at discretion.
      revenuePayoutMult = Math.min(revenuePayoutMult, 1.0) * revDisc;
      flags.discretionaryReductionPossible = true;
    } else if (revenueActualFY >= fy24Rev && revenuePayoutMult > 1.0) {
      // Accelerators apply only to the portion above FY24 actual.
      const aboveGoal = revenueActualFY - revenueTargetFY;
      const aboveFY24 = revenueActualFY - fy24Rev;
      const eligibleFraction = aboveGoal > 0 ? clamp(aboveFY24 / aboveGoal, 0, 1) : 0;
      revenuePayoutMult = 1.0 + (revenuePayoutMult - 1.0) * eligibleFraction;
    }
  }

  // Margin guardrail
  if (marginTargetFY > 0 && fy24Mar > 0 && marginTargetFY < fy24Mar) {
    flags.marginFY24Guardrail = true;

    if (marginActualFY > marginTargetFY && marginActualFY < fy24Mar) {
      marginPayoutMult = Math.min(marginPayoutMult, 1.0) * marDisc;
      flags.discretionaryReductionPossible = true;
    } else if (marginActualFY >= fy24Mar && marginPayoutMult > 1.0) {
      const aboveGoal = marginActualFY - marginTargetFY;
      const aboveFY24 = marginActualFY - fy24Mar;
      const eligibleFraction = aboveGoal > 0 ? clamp(aboveFY24 / aboveGoal, 0, 1) : 0;
      marginPayoutMult = 1.0 + (marginPayoutMult - 1.0) * eligibleFraction;
    }
  }

  // YOY payout: discrete outcomes (0 / 100 / 200 / 300) based on YOY achievement and Revenue attainment.
  let yoyPayoutMult = 0.0;
  if (yoyAttainPct >= 100) {
    if (revenueAttainPct >= 120) yoyPayoutMult = 3.0;
    else if (revenueAttainPct >= 100) yoyPayoutMult = 2.0;
    else yoyPayoutMult = 1.0;
  }

  // MBO payout: capped at 100%.
  const mboFinalPct = clamp(Number(actuals.mbo_final_payout_pct || 0), 0, 100);
  const mboPayoutMult = mboFinalPct / 100;

  // Payout dollars
  const payoutDollars = {
    revenue: targetIncentive.revenue * revenuePayoutMult,
    margin: targetIncentive.margin * marginPayoutMult,
    yoy: targetIncentive.yoy * yoyPayoutMult,
    mbo: targetIncentive.mbo * mboPayoutMult,
  };

  const totalPayout = payoutDollars.revenue + payoutDollars.margin + payoutDollars.yoy + payoutDollars.mbo;
  if (totalPayout > rules.reviewThresholdDollars) flags.payoutReviewRequired = true;

  // Rollups
  const quarters = rules.fiscalYear.quarters.map(q => {
    const revAct = sum(q.months.map(i => monthlyRevenue[i] || 0));
    const marAct = sum(q.months.map(i => monthlyMargin[i] || 0));
    const revTgt = Number(targets[`revenue_${q.key.toLowerCase()}`] ?? targets[`revenue_${q.key.toLowerCase()}`]);
    const marTgt = Number(targets[`margin_${q.key.toLowerCase()}`]  ?? targets[`margin_${q.key.toLowerCase()}`]);
    return {
      key: q.key,
      revenueActual: revAct,
      marginActual: marAct,
      revenueTarget: Number(targets[`revenue_${q.key.toLowerCase()}`] || targets[`revenue_${q.key.toLowerCase()}`] || targets[`revenue_${q.key.toLowerCase()}`]) || Number(targets[`revenue_${q.key.toLowerCase()}`]),
      marginTarget: Number(targets[`margin_${q.key.toLowerCase()}`]) || 0,
    };
  });

  // Fix targets mapping explicitly (more robust)
  const quarterTargets = {
    Q1: { revenue: Number(targets.revenue_q1 || 0), margin: Number(targets.margin_q1 || 0) },
    Q2: { revenue: Number(targets.revenue_q2 || 0), margin: Number(targets.margin_q2 || 0) },
    Q3: { revenue: Number(targets.revenue_q3 || 0), margin: Number(targets.margin_q3 || 0) },
    Q4: { revenue: Number(targets.revenue_q4 || 0), margin: Number(targets.margin_q4 || 0) },
  };
  for (const q of quarters) {
    q.revenueTarget = quarterTargets[q.key].revenue;
    q.marginTarget = quarterTargets[q.key].margin;
    q.revenueAttainPct = q.revenueTarget > 0 ? (q.revenueActual / q.revenueTarget) * 100 : 0;
    q.marginAttainPct  = q.marginTarget  > 0 ? (q.marginActual  / q.marginTarget ) * 100 : 0;
  }

  // Derived month targets for display (equal allocation within quarter)
  const monthRevenueTargets = [];
  const monthMarginTargets = [];
  rules.fiscalYear.quarters.forEach(q => {
    const rt = quarterTargets[q.key].revenue / 3;
    const mt = quarterTargets[q.key].margin / 3;
    q.months.forEach(i => {
      monthRevenueTargets[i] = rt;
      monthMarginTargets[i] = mt;
    });
  });

  return {
    rules,
    inputs: {
      totalTargetIncentive,
      revenueTargetFY,
      marginTargetFY,
      yoyTargetFY,
      fy24Rev,
      fy24Mar,
    },
    actuals: {
      monthlyRevenue,
      monthlyMargin,
      revenueActualFY,
      marginActualFY,
      yoyActual,
      mboFinalPct,
    },
    attainment: {
      revenueAttainPct,
      marginAttainPct,
      yoyAttainPct,
    },
    multipliers: {
      revenuePayoutMult,
      marginPayoutMult,
      yoyPayoutMult,
      mboPayoutMult,
    },
    targetIncentive,
    payoutDollars,
    totalPayout,
    flags,
    rollups: {
      quarters,
      monthRevenueTargets,
      monthMarginTargets,
    }
  };
}
