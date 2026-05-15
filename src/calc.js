import { FY2025 } from "../rules/fy2025.js";
import { FY2026 } from "../rules/fy2026.js";

export function getRules(planVersion) {
  if (planVersion === "FY2026") return FY2026;
  return FY2025;
}

export function money(n) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function pct(n, digits = 1) {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function sum(arr) {
  return (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function lookupCurveMultiplier(curve, attainmentPct) {
  const x = Number(attainmentPct);
  const band = curve.find((b) => x >= b.min && x < b.max) || curve[curve.length - 1];
  return band?.payout ?? 0;
}

function normalizeMonthly(arr) {
  const a = (arr || []).map((x) => Number(x || 0));
  while (a.length < 12) a.push(0);
  return a.slice(0, 12);
}

export function calculate(model) {
  const planVersion = model.plan_version || "FY2025";
  const rules = getRules(planVersion);

  // -------- Plan-scoped data (supports FY25 + FY26 without overwriting) --------
  // Backward compatible: if model.plans doesn't exist, treat the root fields as FY2025.
  const plans = model.plans || {
    FY2025: {
      targets: model.targets || {},
      actuals: model.actuals || {},
      prior: model.fy24 || {},
      guardrails: model.guardrails || {},
      mbo: {},
    },
    FY2026: {
      targets: {},
      actuals: {},
      prior: {},
      guardrails: {},
      mbo: {},
    },
  };

  const p = plans[planVersion] || plans.FY2025;
  const targets = p.targets || {};
  const actuals = p.actuals || {};
  const prior = p.prior || {};
  const guardrails = p.guardrails || {};
  const mbo = p.mbo || {};

  // Inputs
  const totalTargetIncentive = Number(model.total_target_incentive || 0);

  // Targets (annual defaults)
  const revenueTargetFY = Number(
    targets.revenue_fy || sum([targets.revenue_q1, targets.revenue_q2, targets.revenue_q3, targets.revenue_q4])
  );
  const marginTargetFY = Number(
    targets.margin_fy || sum([targets.margin_q1, targets.margin_q2, targets.margin_q3, targets.margin_q4])
  );
  const yoyTargetFY = Number(targets.yoy_growth_fy || 0);

  // Actuals
  const monthlyRevenue = normalizeMonthly(actuals.monthly_revenue);
  const monthlyMargin = normalizeMonthly(actuals.monthly_margin);
  const revenueActualFY = sum(monthlyRevenue);
  const marginActualFY = sum(monthlyMargin);
  const yoyActual = Number(actuals.yoy_growth_actual || 0);

  // Attainment
  const revenueAttainPct = revenueTargetFY > 0 ? (revenueActualFY / revenueTargetFY) * 100 : 0;
  const marginAttainPct = marginTargetFY > 0 ? (marginActualFY / marginTargetFY) * 100 : 0;
  const yoyAttainPct = yoyTargetFY > 0 ? (yoyActual / yoyTargetFY) * 100 : 0;

  // Component target incentives (FY26 has no separate margin payout component)
  const targetIncentive = {
    revenue: totalTargetIncentive * (rules.weights.revenue || 0),
    margin: totalTargetIncentive * (rules.weights.margin || 0),
    yoy: totalTargetIncentive * (rules.weights.yoy || 0),
    mbo: totalTargetIncentive * (rules.weights.mbo || 0),
  };

  // Flags
  const flags = {
    revenueCappedByMargin: false,
    revenuePriorYearGuardrail: false,
    discretionaryReductionPossible: false,
    payoutReviewRequired: false,
    targetRevision: Boolean(model.target_revision_flag),
  };

  // ----------------------------
  // Revenue payout (both years)
  // ----------------------------
  let revenuePayoutMult = lookupCurveMultiplier(rules.revenueCurve, revenueAttainPct);

  // FY2026: margin modifier + accelerator restriction
  let marginModifierMult = 1.0;

  if (planVersion === "FY2026") {
    // Margin modifier always applies
    marginModifierMult = lookupCurveMultiplier(rules.marginModifierCurve, marginAttainPct);

    // If margin attainment is below threshold, cap revenue payout at 100% (disregard accelerators)
    const threshold = rules.revenueAcceleratorsRequireMarginAbovePct;
    if (marginAttainPct < threshold && revenuePayoutMult > 1.0) {
      revenuePayoutMult = 1.0;
      flags.revenueCappedByMargin = true;
    }

    // Prior-year (FY25) revenue guardrail if FY26 goal < FY25 actual revenue
    const priorRev = Number(prior.actual_revenue || 0);
    const revDisc = clamp(Number(guardrails.revenue_discretion_multiplier ?? 1.0), 0, 1);

    if (revenueTargetFY > 0 && priorRev > 0 && revenueTargetFY < priorRev) {
      flags.revenuePriorYearGuardrail = true;

      if (revenueActualFY > revenueTargetFY && revenueActualFY < priorRev) {
        // No accelerators; cannot exceed 100%; may be reduced below 100% at discretion
        revenuePayoutMult = Math.min(revenuePayoutMult, 1.0) * revDisc;
        flags.discretionaryReductionPossible = true;
      } else if (revenueActualFY >= priorRev && revenuePayoutMult > 1.0) {
        // Accelerators only on portion above prior-year actual
        const aboveGoal = revenueActualFY - revenueTargetFY;
        const abovePrior = revenueActualFY - priorRev;
        const eligibleFraction = aboveGoal > 0 ? clamp(abovePrior / aboveGoal, 0, 1) : 0;
        revenuePayoutMult = 1.0 + (revenuePayoutMult - 1.0) * eligibleFraction;
      }
    }
  }

  // FY2025: keep existing logic (margin is a separate payout curve there; handled below)
  let marginPayoutMult = 0.0;
  if (planVersion === "FY2025") {
    marginPayoutMult = lookupCurveMultiplier(rules.marginCurve, marginAttainPct);

    // Cross-component cap: if annual margin attainment <80%, revenue payout capped at 100%
    if (marginAttainPct < rules.revenueCapWhenMarginBelowPct && revenuePayoutMult > 1.0) {
      revenuePayoutMult = 1.0;
      flags.revenueCappedByMargin = true;
    }

    // FY24 guardrails for FY25 (existing behavior from your FY25 spec)
    const priorRev = Number((prior.actual_revenue ?? 0));
    const priorMar = Number((prior.actual_margin ?? 0));
    const revDisc = clamp(Number(guardrails.revenue_discretion_multiplier ?? 1.0), 0, 1);
    const marDisc = clamp(Number(guardrails.margin_discretion_multiplier ?? 1.0), 0, 1);

    if (revenueTargetFY > 0 && priorRev > 0 && revenueTargetFY < priorRev) {
      flags.revenuePriorYearGuardrail = true;

      if (revenueActualFY > revenueTargetFY && revenueActualFY < priorRev) {
        revenuePayoutMult = Math.min(revenuePayoutMult, 1.0) * revDisc;
        flags.discretionaryReductionPossible = true;
      } else if (revenueActualFY >= priorRev && revenuePayoutMult > 1.0) {
        const aboveGoal = revenueActualFY - revenueTargetFY;
        const abovePrior = revenueActualFY - priorRev;
        const eligibleFraction = aboveGoal > 0 ? clamp(abovePrior / aboveGoal, 0, 1) : 0;
        revenuePayoutMult = 1.0 + (revenuePayoutMult - 1.0) * eligibleFraction;
      }
    }

    if (marginTargetFY > 0 && priorMar > 0 && marginTargetFY < priorMar) {
      // FY25 margin guardrail exists in FY25 spec; keep it for FY25 only
      if (marginActualFY > marginTargetFY && marginActualFY < priorMar) {
        marginPayoutMult = Math.min(marginPayoutMult, 1.0) * marDisc;
        flags.discretionaryReductionPossible = true;
      } else if (marginActualFY >= priorMar && marginPayoutMult > 1.0) {
        const aboveGoal = marginActualFY - marginTargetFY;
        const abovePrior = marginActualFY - priorMar;
        const eligibleFraction = aboveGoal > 0 ? clamp(abovePrior / aboveGoal, 0, 1) : 0;
        marginPayoutMult = 1.0 + (marginPayoutMult - 1.0) * eligibleFraction;
      }
    }
  }

  // ----------------------------
  // YOY payout (both years)
  // ----------------------------
  let yoyPayoutMult = 0.0;
  if (yoyAttainPct >= 100) {
    if (revenueAttainPct >= 120) yoyPayoutMult = 3.0;
    else if (revenueAttainPct >= 100) yoyPayoutMult = 2.0;
    else yoyPayoutMult = 1.0;
  }

  // ----------------------------
  // MBO payout
  // FY25: percent input (existing)
  // FY26: option 2 (choose 1 or 2 MBOs), met/not met only (no partial per MBO)
  // ----------------------------
  let mboPayoutMult = 0.0;

  if (planVersion === "FY2026") {
    const mboCount = clamp(Number(mbo.mbo_count || 1), 1, 2);
    const mbo1Met = Boolean(mbo.mbo1_met);
    const mbo2Met = Boolean(mbo.mbo2_met);

    const metCount = (mbo1Met ? 1 : 0) + (mboCount === 2 && mbo2Met ? 1 : 0);
    mboPayoutMult = metCount / mboCount; // 1 MBO: 0 or 1; 2 MBOs: 0, 0.5, 1
    mboPayoutMult = clamp(mboPayoutMult, 0, 1);
  } else {
    const mboFinalPct = clamp(Number(actuals.mbo_final_payout_pct || 0), 0, 100);
    mboPayoutMult = mboFinalPct / 100;
  }

  // ----------------------------
  // Payout dollars
  // FY26: Revenue payout dollars = targetIncentive.revenue * revenueMult * marginModifierMult
  // FY25: Revenue payout dollars = targetIncentive.revenue * revenueMult; Margin separate
  // ----------------------------
  const payoutDollars = {
    revenue: planVersion === "FY2026"
      ? targetIncentive.revenue * revenuePayoutMult * marginModifierMult
      : targetIncentive.revenue * revenuePayoutMult,

    margin: planVersion === "FY2026"
      ? 0
      : targetIncentive.margin * marginPayoutMult,

    yoy: targetIncentive.yoy * yoyPayoutMult,
    mbo: targetIncentive.mbo * mboPayoutMult,
  };

  const totalPayout = payoutDollars.revenue + payoutDollars.margin + payoutDollars.yoy + payoutDollars.mbo;
  if (totalPayout > rules.reviewThresholdDollars) flags.payoutReviewRequired = true;

  // Rollups (quarterly)
  const quarterTargets = {
    Q1: { revenue: Number(targets.revenue_q1 || 0), margin: Number(targets.margin_q1 || 0) },
    Q2: { revenue: Number(targets.revenue_q2 || 0), margin: Number(targets.margin_q2 || 0) },
    Q3: { revenue: Number(targets.revenue_q3 || 0), margin: Number(targets.margin_q3 || 0) },
    Q4: { revenue: Number(targets.revenue_q4 || 0), margin: Number(targets.margin_q4 || 0) },
  };

  const quarters = rules.fiscalYear.quarters.map((q) => {
    const revAct = sum(q.months.map((i) => monthlyRevenue[i] || 0));
    const marAct = sum(q.months.map((i) => monthlyMargin[i] || 0));
    const revTgt = quarterTargets[q.key].revenue;
    const marTgt = quarterTargets[q.key].margin;
    return {
      key: q.key,
      revenueActual: revAct,
      marginActual: marAct,
      revenueTarget: revTgt,
      marginTarget: marTgt,
      revenueAttainPct: revTgt > 0 ? (revAct / revTgt) * 100 : 0,
      marginAttainPct: marTgt > 0 ? (marAct / marTgt) * 100 : 0,
    };
  });

  // Derived month targets for display (equal allocation within quarter)
  const monthRevenueTargets = [];
  const monthMarginTargets = [];
  rules.fiscalYear.quarters.forEach((q) => {
    const rt = quarterTargets[q.key].revenue / 3;
    const mt = quarterTargets[q.key].margin / 3;
    q.months.forEach((i) => {
      monthRevenueTargets[i] = rt;
      monthMarginTargets[i] = mt;
    });
  });

  return {
    rules,
    planVersion,

    inputs: {
      totalTargetIncentive,
      revenueTargetFY,
      marginTargetFY,
      yoyTargetFY,
      priorRevenue: Number(prior.actual_revenue || 0),
      priorMargin: Number(prior.actual_margin || 0),
    },

    actuals: {
      monthlyRevenue,
      monthlyMargin,
      revenueActualFY,
      marginActualFY,
      yoyActual,
      mbo: mbo,
      mboPayoutMult,
    },

    attainment: {
      revenueAttainPct,
      marginAttainPct,
      yoyAttainPct,
    },

    multipliers: {
      revenuePayoutMult,
      marginPayoutMult,
      marginModifierMult,
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
    },
  };
}
