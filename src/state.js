import { FY2025 } from "../rules/fy2025.js";
import { FY2026 } from "../rules/fy2026.js";

const STORAGE_KEY = "ce_tracker_model_v2";

// Scenario storage keys
const SCENARIOS_KEY = "ce_tracker_scenarios_v1";
const ACTIVE_SCENARIO_KEY = "ce_tracker_active_scenario_v1";

function blank12() {
  return Array.from({ length: 12 }, () => 0);
}

export function defaultModel() {
  return {
    employee_name: "Sample CE",
    employee_id: "000000",

    // Selectable plan version
    plan_version: FY2025.planVersion,

    annual_base_salary: 180000,
    total_target_incentive: 100000,

    // Plan-scoped data so switching FY25/FY26 doesn't overwrite inputs
    plans: {
      FY2025: {
        targets: {
          revenue_q1: 5556510,
          revenue_q2: 10627262,
          revenue_q3: 9643363,
          revenue_q4: 9137014,
          revenue_fy: 34964148,

          margin_q1: 2330854,
          margin_q2: 3773557,
          margin_q3: 3853966,
          margin_q4: 3540610,

          yoy_growth_fy: 32776369,
        },

        // FY24 reference actuals (guardrails) for FY25 logic
        prior: {
          actual_revenue: 36000000,
          actual_margin: 13800000,
        },

        guardrails: {
          revenue_discretion_multiplier: 1.0,
          margin_discretion_multiplier: 1.0,
          notes: "",
        },

        actuals: {
          monthly_revenue: [
            2800000, 2900000, 3100000,
            3200000, 3300000, 3400000,
            3050000, 3150000, 3300000,
            2900000, 3100000, 3250000,
          ],
          monthly_margin: [
            900000, 920000, 960000,
            1000000, 1050000, 1100000,
            980000, 1020000, 1050000,
            930000, 980000, 1020000,
          ],
          yoy_growth_actual: 34000000,

          // FY25 MBO as percent input (existing behavior)
          mbo_final_payout_pct: 90,

          strategic_pursuit_notes: "",
        },

        mbo: {}, // not used in FY25
      },

      FY2026: {
        // FY26 quotas/targets will be provided in a separate goal/quota letter later.
        // Set placeholders now; user can enter when the letter arrives.
        targets: {
          revenue_q1: 0,
          revenue_q2: 0,
          revenue_q3: 0,
          revenue_q4: 0,
          revenue_fy: 0,

          // Margin goals are needed for the modifier (even though margin is not a payout component)
          margin_q1: 0,
          margin_q2: 0,
          margin_q3: 0,
          margin_q4: 0,
          margin_fy: 0,

          yoy_growth_fy: 0,
        },

        // FY25 reference actuals (guardrails) for FY26 revenue guardrail
        prior: {
          actual_revenue: 0,
          actual_margin: 0,
        },

        guardrails: {
          revenue_discretion_multiplier: 1.0,
          notes: "",
        },

        actuals: {
          monthly_revenue: blank12(),
          monthly_margin: blank12(),
          yoy_growth_actual: 0,
          strategic_pursuit_notes: "",
        },

        // FY26 MBO option 2: choose 1 or 2 MBOs, met/not met only
        mbo: {
          mbo_count: 1,
          mbo1_desc: "",
          mbo1_met: false,
          mbo2_desc: "",
          mbo2_met: false,
          notes: "",
        },
      },
    },

    target_revision_flag: false,
    target_revision_notes: "",
  };
}

export function loadModel() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultModel();

    const parsed = JSON.parse(raw);
    const base = defaultModel();

    // Backward compatible migration:
    // If older model stored targets/actuals at root, map into FY2025 plan bucket.
    if (!parsed.plans) {
      const migrated = defaultModel();
      migrated.employee_name = parsed.employee_name ?? migrated.employee_name;
      migrated.employee_id = parsed.employee_id ?? migrated.employee_id;
      migrated.plan_version = parsed.plan_version ?? migrated.plan_version;
      migrated.annual_base_salary = parsed.annual_base_salary ?? migrated.annual_base_salary;
      migrated.total_target_incentive = parsed.total_target_incentive ?? migrated.total_target_incentive;

      migrated.plans.FY2025.targets = { ...migrated.plans.FY2025.targets, ...(parsed.targets || {}) };
      migrated.plans.FY2025.actuals = { ...migrated.plans.FY2025.actuals, ...(parsed.actuals || {}) };
      migrated.plans.FY2025.prior = { ...migrated.plans.FY2025.prior, ...(parsed.fy24 || {}) };
      migrated.plans.FY2025.guardrails = { ...migrated.plans.FY2025.guardrails, ...(parsed.guardrails || {}) };

      migrated.target_revision_flag = Boolean(parsed.target_revision_flag);
      migrated.target_revision_notes = parsed.target_revision_notes || "";

      return migrated;
    }

    // Merge for forward compatibility
    return {
      ...base,
      ...parsed,
      plans: {
        FY2025: {
          ...base.plans.FY2025,
          ...(parsed.plans.FY2025 || {}),
          targets: { ...base.plans.FY2025.targets, ...(parsed.plans.FY2025?.targets || {}) },
          actuals: { ...base.plans.FY2025.actuals, ...(parsed.plans.FY2025?.actuals || {}) },
          prior: { ...base.plans.FY2025.prior, ...(parsed.plans.FY2025?.prior || {}) },
          guardrails: { ...base.plans.FY2025.guardrails, ...(parsed.plans.FY2025?.guardrails || {}) },
          mbo: { ...base.plans.FY2025.mbo, ...(parsed.plans.FY2025?.mbo || {}) },
        },
        FY2026: {
          ...base.plans.FY2026,
          ...(parsed.plans.FY2026 || {}),
          targets: { ...base.plans.FY2026.targets, ...(parsed.plans.FY2026?.targets || {}) },
          actuals: { ...base.plans.FY2026.actuals, ...(parsed.plans.FY2026?.actuals || {}) },
          prior: { ...base.plans.FY2026.prior, ...(parsed.plans.FY2026?.prior || {}) },
          guardrails: { ...base.plans.FY2026.guardrails, ...(parsed.plans.FY2026?.guardrails || {}) },
          mbo: { ...base.plans.FY2026.mbo, ...(parsed.plans.FY2026?.mbo || {}) },
        },
      },
    };
  } catch (e) {
    console.warn("Failed to load model; using defaults", e);
    return defaultModel();
  }
}

export function saveModel(model) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
}

export function resetModel() {
  localStorage.removeItem(STORAGE_KEY);
}

/* -----------------------------
   Scenario Support (What-if)
   ----------------------------- */

export function listScenarios() {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    const scenarios = raw ? JSON.parse(raw) : {};
    return scenarios && typeof scenarios === "object" ? scenarios : {};
  } catch (e) {
    console.warn("Failed to read scenarios; returning empty", e);
    return {};
  }
}

export function saveScenario(name, model) {
  const scenarioName = String(name || "").trim();
  if (!scenarioName) return false;

  const scenarios = listScenarios();
  scenarios[scenarioName] = model;

  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  return true;
}

export function loadScenario(name) {
  const scenarioName = String(name || "").trim();
  if (!scenarioName) return null;

  const scenarios = listScenarios();
  return scenarios[scenarioName] || null;
}

export function deleteScenario(name) {
  const scenarioName = String(name || "").trim();
  if (!scenarioName) return false;

  const scenarios = listScenarios();
  if (!Object.prototype.hasOwnProperty.call(scenarios, scenarioName)) return false;

  delete scenarios[scenarioName];
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  return true;
}

export function duplicateScenario(fromName, toName) {
  const src = String(fromName || "").trim();
  const dst = String(toName || "").trim();
  if (!src || !dst) return false;

  const scenarios = listScenarios();
  if (!scenarios[src]) return false;

  scenarios[dst] = scenarios[src];
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  return true;
}

export function setActiveScenario(name) {
  const scenarioName = String(name || "").trim();
  localStorage.setItem(ACTIVE_SCENARIO_KEY, scenarioName);
}

export function getActiveScenario() {
  return localStorage.getItem(ACTIVE_SCENARIO_KEY) || "";
}
``
