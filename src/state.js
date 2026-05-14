import { FY2025 } from '../rules/fy2025.js';

const STORAGE_KEY = 'ce_tracker_fy2025_v1';
const SCENARIOS_KEY = 'ce_tracker_scenarios_v1';
const ACTIVE_SCENARIO_KEY = 'ce
  
export function defaultModel() {
  return {
    employee_name: 'Sample CE',
    employee_id: '000000',
    plan_version: FY2025.planVersion,

    annual_base_salary: 180000,
    total_target_incentive: 100000,

    targets: {
      // Employee-specific FY2025 targets from spec (can be edited)
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

    fy24: {
      actual_revenue: 36000000,
      actual_margin: 13800000,
    },

    guardrails: {
      revenue_discretion_multiplier: 1.0,
      margin_discretion_multiplier: 1.0,
      notes: '',
    },

    actuals: {
      // Monthly actuals Apr..Mar
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
      mbo_final_payout_pct: 90,

      // Strategic pursuits are excluded from totals in FY2025 baseline.
      strategic_pursuit_notes: '',
    },

    target_revision_flag: false,
    target_revision_notes: '',
  };
}

export function loadModel() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultModel();
    const parsed = JSON.parse(raw);
    // Shallow merge to ensure new fields appear
    return { ...defaultModel(), ...parsed,
      targets: { ...defaultModel().targets, ...(parsed.targets || {}) },
      actuals: { ...defaultModel().actuals, ...(parsed.actuals || {}) },
      fy24: { ...defaultModel().fy24, ...(parsed.fy24 || {}) },
      guardrails: { ...defaultModel().guardrails, ...(parsed.guardrails || {}) },
    };
  } catch (e) {
    console.warn('Failed to load model; using defaults', e);
    return defaultModel();
  }
}

export function saveModel(model) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
}

export function resetModel() {
  localStorage.removeItem(STORAGE_KEY);
}
export function listScenarios() {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    const scenarios = raw ? JSON.parse(raw) : {};
    return scenarios;
  } catch {
    return {};
  }
}

export function saveScenario(name, model) {
  const scenarios = listScenarios();
  scenarios[name] = model;
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
}

export function deleteScenario(name) {
  const scenarios = listScenarios();
  delete scenarios[name];
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
}

export function setActiveScenario(name) {
  localStorage.setItem(ACTIVE_SCENARIO_KEY, name);
}

export function getActiveScenario() {
  return localStorage.getItem(ACTIVE_SCENARIO_KEY) || '';
}

export function loadScenario(name) {
  const scenarios = listScenarios();
  return scenarios[name] || null;
}

export function duplicateScenario(fromName, toName) {
  const scenarios = listScenarios();
  if (!scenarios[fromName]) return false;
  scenarios[toName] = scenarios[fromName];
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  return true;
}
