import { calculate, money, pct } from "./calc.js";
import {
  loadModel,
  saveModel,
  resetModel,
  defaultModel,
  // Scenarios (must exist in state.js)
  listScenarios,
  saveScenario,
  deleteScenario,
  loadScenario,
  setActiveScenario,
  getActiveScenario,
  duplicateScenario,
} from "./state.js";

let model = loadModel();

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setView(viewKey) {
  $$("#nav .nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewKey);
  });
  $$("main .content").forEach((sec) => sec.classList.add("hidden"));
  $(`#view-${viewKey}`).classList.remove("hidden");

  const titles = {
    overview: ["Overview", "Projected payout excluding Strategic Pursuits"],
    revenue: ["Revenue", "Monthly tracking, rollups, attainment & payout"],
    margin: ["Margin", "Monthly tracking, rollups, attainment & payout"],
    yoy: ["YOY Growth", "Discrete outcomes based on YOY and Revenue attainment"],
    mbo: ["MBO", "Manual entry of final approved MBO payout percent (capped at 100%)"],
    settings: ["Settings / Assumptions", "Edit FY2025 targets & actuals (manual entry)"],
  };
  $("#pageTitle").textContent = titles[viewKey][0];
  $("#pageSubtitle").textContent = titles[viewKey][1];
}

function render() {
  const result = calculate(model, model.plan_version);
  renderOverview(result);
  renderRevenue(result);
  renderMargin(result);
  renderYOY(result);
  renderMBO(result);
  renderSettings(result);
}

function saveAndRender() {
  saveModel(model);
  $("#savePill").textContent = "Saved locally";
  render();
}

// ---------- Utilities ----------
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function deepClone(obj) {
  // Prefer structuredClone if available, otherwise JSON clone
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// ---------- Rendering ----------
function flagsChips(flags) {
  const chips = [];
  if (flags.revenueCappedByMargin)
    chips.push({ text: "Revenue capped at 100% (Margin <80%)", kind: "warn" });
  if (flags.revenueFY24Guardrail) chips.push({ text: "FY24 Revenue guardrail active", kind: "warn" });
  if (flags.marginFY24Guardrail) chips.push({ text: "FY24 Margin guardrail active", kind: "warn" });
  if (flags.discretionaryReductionPossible) chips.push({ text: "Discretionary reduction possible", kind: "warn" });
  if (flags.payoutReviewRequired) chips.push({ text: "Review required (> $250k)", kind: "bad" });
  if (flags.targetRevision) chips.push({ text: "Target revision flagged", kind: "warn" });
  if (chips.length === 0) chips.push({ text: "No guardrails/exceptions detected", kind: "good" });
  return `<div class="kpi-row">${chips
    .map((c) => `<div class="chip ${c.kind}">${c.text}</div>`)
    .join("")}</div>`;
}

function progressBar(attainPct) {
  const w = Math.max(0, Math.min(140, attainPct));
  return `<div class="progress" title="${pct(attainPct)}"><div style="width:${w / 1.4}%"></div></div>`;
}

function renderOverview(r) {
  const el = $("#view-overview");
  const ti = r.inputs.totalTargetIncentive;
  el.innerHTML = `
    <div class="grid cols-4">
      <div class="card">
        <div class="card-title">Total target incentive</div>
        <div class="card-value">${money(ti)}</div>
        <div class="card-sub">Split 50/30/10/10 across Revenue/Margin/YOY/MBO</div>
      </div>
      <div class="card">
        <div class="card-title">Projected payout (core CE plan)</div>
        <div class="card-value">${money(r.totalPayout)}</div>
        <div class="card-sub">Strategic Pursuit deals excluded by design</div>
      </div>
      <div class="card">
        <div class="card-title">Revenue attainment → payout</div>
        <div class="card-value">${pct(r.attainment.revenueAttainPct)} → ${(r.multipliers.revenuePayoutMult * 100).toFixed(0)}%</div>
        <div class="card-sub">Payout: ${money(r.payoutDollars.revenue)}</div>
      </div>
      <div class="card">
        <div class="card-title">Margin attainment → payout</div>
        <div class="card-value">${pct(r.attainment.marginAttainPct)} → ${(r.multipliers.marginPayoutMult * 100).toFixed(0)}%</div>
        <div class="card-sub">Payout: ${money(r.payoutDollars.margin)}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-3">
      <div class="card">
        <div class="card-title">YOY Growth attainment → payout</div>
        <div class="card-value">${pct(r.attainment.yoyAttainPct)} → ${(r.multipliers.yoyPayoutMult * 100).toFixed(0)}%</div>
        <div class="card-sub">Payout: ${money(r.payoutDollars.yoy)}</div>
      </div>
      <div class="card">
        <div class="card-title">MBO final payout</div>
        <div class="card-value">${r.actuals.mboFinalPct.toFixed(0)}%</div>
        <div class="card-sub">Payout: ${money(r.payoutDollars.mbo)}</div>
      </div>
      <div class="card">
        <div class="card-title">Annual targets</div>
        <div class="card-value small">Revenue: ${money(r.inputs.revenueTargetFY)}<br/>Margin: ${money(r.inputs.marginTargetFY)}<br/>YOY: ${money(r.inputs.yoyTargetFY)}</div>
        <div class="card-sub">FY24 reference: Rev ${money(r.inputs.fy24Rev)} | Mar ${money(r.inputs.fy24Mar)}</div>
      </div>
    </div>

    <div style="height:12px"></div>
    <div class="card">
      <div class="section-title">Flags / guardrails</div>
      <div class="section-sub">These flags indicate plan rules that cap accelerators, require review, or signal exceptions.</div>
      ${flagsChips(r.flags)}
    </div>
  `;
}

function monthRows(r, kind) {
  const months = r.rules.fiscalYear.months;
  const actualArr = kind === "revenue" ? r.actuals.monthlyRevenue : r.actuals.monthlyMargin;
  const tgtArr = kind === "revenue" ? r.rollups.monthRevenueTargets : r.rollups.monthMarginTargets;

  return months
    .map((m, i) => {
      const act = actualArr[i] || 0;
      const tgt = tgtArr[i] || 0;
      const att = tgt > 0 ? (act / tgt) * 100 : 0;
      return `
        <tr>
          <td>${m}</td>
          <td>${money(tgt)}</td>
          <td>${money(act)}</td>
          <td>${pct(att)}</td>
        </tr>
      `;
    })
    .join("");
}

function quarterRows(r) {
  return r.rollups.quarters
    .map(
      (q) => `
    <tr>
      <td>${q.key}</td>
      <td>${money(q.revenueTarget)}</td>
      <td>${money(q.revenueActual)}</td>
      <td>${pct(q.revenueAttainPct)}</td>
      <td>${money(q.marginTarget)}</td>
      <td>${money(q.marginActual)}</td>
      <td>${pct(q.marginAttainPct)}</td>
    </tr>
  `
    )
    .join("");
}

function renderRevenue(r) {
  const el = $("#view-revenue");
  el.innerHTML = `
    <div class="grid cols-3">
      <div class="card">
        <div class="card-title">Annual revenue target</div>
        <div class="card-value">${money(r.inputs.revenueTargetFY)}</div>
        <div class="card-sub">Actual: ${money(r.actuals.revenueActualFY)}</div>
      </div>
      <div class="card">
        <div class="card-title">Annual revenue attainment</div>
        <div class="card-value">${pct(r.attainment.revenueAttainPct)}</div>
        <div class="card-sub">${progressBar(r.attainment.revenueAttainPct)}</div>
      </div>
      <div class="card">
        <div class="card-title">Revenue payout</div>
        <div class="card-value">${(r.multipliers.revenuePayoutMult * 100).toFixed(0)}%</div>
        <div class="card-sub">Component payout: ${money(r.payoutDollars.revenue)}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Monthly rollup (targets are evenly spread within each quarter)</div>
        <div class="section-sub">Edit monthly actuals in Settings. Month targets shown are derived from quarterly targets for tracking convenience.</div>
        <table class="table">
          <thead><tr><th>Month</th><th>Target (derived)</th><th>Actual</th><th>Attainment</th></tr></thead>
          <tbody>${monthRows(r, "revenue")}</tbody>
        </table>
      </div>
      <div class="card">
        <div class="section-title">Quarterly rollup</div>
        <div class="section-sub">Quarter targets are editable in Settings and are the official FY2025 input targets.</div>
        <table class="table">
          <thead><tr>
            <th>Q</th><th>Rev Target</th><th>Rev Actual</th><th>Rev Attain</th>
            <th>Mar Target</th><th>Mar Actual</th><th>Mar Attain</th>
          </tr></thead>
          <tbody>${quarterRows(r)}</tbody>
        </table>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="section-title">Revenue rule notes</div>
      <div class="section-sub">This section highlights the FY2025 rules that may cap accelerators or trigger exceptions.</div>
      ${flagsChips({
        revenueCappedByMargin: r.flags.revenueCappedByMargin,
        revenueFY24Guardrail: r.flags.revenueFY24Guardrail,
        marginFY24Guardrail: false,
        discretionaryReductionPossible: r.flags.discretionaryReductionPossible && r.flags.revenueFY24Guardrail,
        payoutReviewRequired: false,
        targetRevision: r.flags.targetRevision,
      })}
      <div style="height:10px"></div>
      <div class="muted">
        Revenue payout uses the FY2025 attainment curve, with a cross-component cap that limits Revenue payout to 100% when annual Margin attainment is below 80%. FY24 guardrails may further restrict accelerators when FY25 goals are below FY24 actuals.
      </div>
    </div>
  `;
}

function renderMargin(r) {
  const el = $("#view-margin");
  el.innerHTML = `
    <div class="grid cols-3">
      <div class="card">
        <div class="card-title">Annual margin target (sum of quarterly)</div>
        <div class="card-value">${money(r.inputs.marginTargetFY)}</div>
        <div class="card-sub">Actual: ${money(r.actuals.marginActualFY)}</div>
      </div>
      <div class="card">
        <div class="card-title">Annual margin attainment</div>
        <div class="card-value">${pct(r.attainment.marginAttainPct)}</div>
        <div class="card-sub">${progressBar(r.attainment.marginAttainPct)}</div>
      </div>
      <div class="card">
        <div class="card-title">Margin payout</div>
        <div class="card-value">${(r.multipliers.marginPayoutMult * 100).toFixed(0)}%</div>
        <div class="card-sub">Component payout: ${money(r.payoutDollars.margin)}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Monthly rollup (targets are evenly spread within each quarter)</div>
        <div class="section-sub">Edit monthly actuals in Settings. Month targets shown are derived from quarterly targets for tracking convenience.</div>
        <table class="table">
          <thead><tr><th>Month</th><th>Target (derived)</th><th>Actual</th><th>Attainment</th></tr></thead>
          <tbody>${monthRows(r, "margin")}</tbody>
        </table>
      </div>
      <div class="card">
        <div class="section-title">Quarterly rollup</div>
        <div class="section-sub">Quarter targets are editable in Settings and are the official FY2025 input targets.</div>
        <table class="table">
          <thead><tr>
            <th>Q</th><th>Rev Target</th><th>Rev Actual</th><th>Rev Attain</th>
            <th>Mar Target</th><th>Mar Actual</th><th>Mar Attain</th>
          </tr></thead>
          <tbody>${quarterRows(r)}</tbody>
        </table>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="section-title">Margin rule notes</div>
      <div class="section-sub">FY24 guardrails may restrict accelerators when FY25 margin goals are below FY24 actual margin.</div>
      ${flagsChips({
        revenueCappedByMargin: false,
        revenueFY24Guardrail: false,
        marginFY24Guardrail: r.flags.marginFY24Guardrail,
        discretionaryReductionPossible: r.flags.discretionaryReductionPossible && r.flags.marginFY24Guardrail,
        payoutReviewRequired: false,
        targetRevision: r.flags.targetRevision,
      })}
    </div>
  `;
}

function renderYOY(r) {
  const el = $("#view-yoy");
  const revAtt = r.attainment.revenueAttainPct;
  const yoyAtt = r.attainment.yoyAttainPct;
  const outcome =
    r.multipliers.yoyPayoutMult === 3
      ? "300% (YOY met + Revenue ≥120%)"
      : r.multipliers.yoyPayoutMult === 2
      ? "200% (YOY met + Revenue ≥100%)"
      : r.multipliers.yoyPayoutMult === 1
      ? "100% (YOY met)"
      : "0% (YOY not met)";

  el.innerHTML = `
    <div class="grid cols-3">
      <div class="card">
        <div class="card-title">YOY target</div>
        <div class="card-value">${money(r.inputs.yoyTargetFY)}</div>
        <div class="card-sub">Actual YOY growth: ${money(r.actuals.yoyActual)}</div>
      </div>
      <div class="card">
        <div class="card-title">YOY attainment</div>
        <div class="card-value">${pct(yoyAtt)}</div>
        <div class="card-sub">${progressBar(yoyAtt)}</div>
      </div>
      <div class="card">
        <div class="card-title">YOY payout outcome</div>
        <div class="card-value">${(r.multipliers.yoyPayoutMult * 100).toFixed(0)}%</div>
        <div class="card-sub">${outcome}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="section-title">How YOY is determined (FY2025)</div>
      <div class="section-sub">YOY pays discrete outcomes when YOY quota is achieved, with higher payouts if Revenue quota is also met.</div>
      <ul class="muted" style="margin-top:0">
        <li>If YOY quota achieved and Revenue attainment ≥ 120% → YOY payout = 300%</li>
        <li>Else if YOY quota achieved and Revenue attainment ≥ 100% → YOY payout = 200%</li>
        <li>Else if YOY quota achieved → YOY payout = 100%</li>
        <li>Else → YOY payout = 0%</li>
      </ul>
      <div class="kpi-row">
        <div class="chip">Revenue attainment used: ${pct(revAtt)}</div>
        <div class="chip">YOY attainment used: ${pct(yoyAtt)}</div>
        <div class="chip">YOY component payout: ${money(r.payoutDollars.yoy)}</div>
      </div>
    </div>
  `;
}

function renderMBO(r) {
  const el = $("#view-mbo");
  el.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">MBO final payout percent</div>
        <div class="section-sub">Enter the manager-approved final MBO payout percent for FY2025. It is capped at 100%.</div>
        <div class="kpi-row">
          <div class="chip">MBO target incentive: ${money(r.targetIncentive.mbo)}</div>
          <div class="chip">Final payout: ${r.actuals.mboFinalPct.toFixed(0)}%</div>
          <div class="chip">Component payout: ${money(r.payoutDollars.mbo)}</div>
        </div>
        <div style="height:10px"></div>
        <div class="field">
          <label class="label" for="mboPct">MBO final payout % (0–100)</label>
          <input id="mboPct" type="number" min="0" max="100" step="1" value="${r.actuals.mboFinalPct}" />
        </div>
        <div class="row-actions">
          <button class="primary" id="btnSaveMbo">Save MBO</button>
        </div>
      </div>

      <div class="card">
        <div class="section-title">Strategic Pursuit deals</div>
        <div class="section-sub">Strategic Pursuit / large GCV discretionary incentives are handled separately and excluded from total CE payout in this FY2025 baseline calculator.</div>
        <div class="field">
          <label class="label" for="spNotes">Optional notes (informational only)</label>
          <textarea id="spNotes" placeholder="E.g., Track Strategic Pursuit deals separately (excluded from totals).">${model.actuals?.strategic_pursuit_notes || ""}</textarea>
        </div>
        <div class="row-actions">
          <button class="primary" id="btnSaveSp">Save notes</button>
        </div>
        <div class="muted">No dollar calculations are performed here by design.</div>
      </div>
    </div>
  `;

  $("#btnSaveMbo").onclick = () => {
    model.actuals.mbo_final_payout_pct = Number($("#mboPct").value || 0);
    saveAndRender();
  };
  $("#btnSaveSp").onclick = () => {
    model.actuals.strategic_pursuit_notes = $("#spNotes").value || "";
    saveAndRender();
  };
}

function renderSettings(r) {
  const el = $("#view-settings");
  const months = r.rules.fiscalYear.months;

  // ---------------------------
  // Scenario state
  // ---------------------------
  const scenarios = listScenarios();
  const activeScenario = getActiveScenario();
  const scenarioNames = Object.keys(scenarios).sort();

  const monthInputsRevenue = months
    .map(
      (m, i) => `
    <div class="field">
      <div class="label">${m} revenue actual</div>
      <input type="number" step="1000" data-bind="actuals.monthly_revenue.${i}" value="${r.actuals.monthlyRevenue[i] || 0}" />
    </div>
  `
    )
    .join("");

  const monthInputsMargin = months
    .map(
      (m, i) => `
    <div class="field">
      <div class="label">${m} margin actual</div>
      <input type="number" step="1000" data-bind="actuals.monthly_margin.${i}" value="${r.actuals.monthlyMargin[i] || 0}" />
    </div>
  `
    )
    .join("");

  const marginFY = r.inputs.marginTargetFY;

  el.innerHTML = `
    <div class="card">
      <div class="section-title">Compensation inputs</div>
      <div class="section-sub">Enter either annual base salary (for reference) and/or total target incentive dollars. Target incentive drives payouts.</div>
      <div class="form">
        <div class="field">
          <div class="label">Employee name</div>
          <input type="text" data-bind="employee_name" value="${escapeHtml(model.employee_name || "")}" />
        </div>
        <div class="field">
          <div class="label">Employee ID</div>
          <input type="text" data-bind="employee_id" value="${escapeHtml(model.employee_id || "")}" />
        </div>
        <div class="field">
          <div class="label">Annual base salary (optional)</div>
          <input type="number" step="1000" data-bind="annual_base_salary" value="${model.annual_base_salary || 0}" />
        </div>
        <div class="field">
          <div class="label">Total target incentive (required for payout)</div>
          <input type="number" step="1000" data-bind="total_target_incentive" value="${model.total_target_incentive || 0}" />
        </div>
        <div class="full muted">Component target incentives are derived from total target incentive using weights: Revenue 50%, Margin 30%, YOY 10%, MBO 10%.</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="section-title">Scenarios (what-if snapshots)</div>
      <div class="section-sub">Save your current inputs as a named scenario, then switch between scenarios without losing work.</div>

      <div class="form">
        <div class="field">
          <div class="label">Active scenario</div>
          <select id="scenarioSelect" style="padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);color:#e8eefc;">
            <option value="">(none)</option>
            ${scenarioNames
              .map((n) => `<option value="${escapeHtml(n)}" ${n === activeScenario ? "selected" : ""}>${escapeHtml(n)}</option>`)
              .join("")}
          </select>
        </div>

        <div class="field">
          <div class="label">New scenario name</div>
          <input id="scenarioName" type="text" placeholder="e.g., Baseline, Stretch, Conservative" />
        </div>
      </div>

      <div class="row-actions">
        <button class="primary" id="btnScenarioSave">Save current as scenario</button>
        <button class="secondary" id="btnScenarioLoad">Load selected scenario</button>
        <button class="secondary" id="btnScenarioDup">Duplicate selected</button>
        <button class="secondary" id="btnScenarioDelete">Delete selected</button>
      </div>

      <div class="muted" style="margin-top:10px">
        Tip: “Save current as scenario” stores a snapshot. Loading replaces your current inputs. Your normal Save button still updates your current working model.
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">FY2025 targets (editable)</div>
        <div class="section-sub">Quarterly targets are the primary inputs. Annual totals are derived for reporting where needed.</div>
        <div class="form">
          <div class="field"><div class="label">FY2025 revenue target (annual)</div><input type="number" step="1000" data-bind="targets.revenue_fy" value="${model.targets.revenue_fy || 0}" /></div>
          <div class="field"><div class="label">FY2025 YOY growth target (annual)</div><input type="number" step="1000" data-bind="targets.yoy_growth_fy" value="${model.targets.yoy_growth_fy || 0}" /></div>
          <div class="field"><div class="label">Revenue Q1 (Apr–Jun)</div><input type="number" step="1000" data-bind="targets.revenue_q1" value="${model.targets.revenue_q1 || 0}" /></div>
          <div class="field"><div class="label">Revenue Q2 (Jul–Sep)</div><input type="number" step="1000" data-bind="targets.revenue_q2" value="${model.targets.revenue_q2 || 0}" /></div>
          <div class="field"><div class="label">Revenue Q3 (Oct–Dec)</div><input type="number" step="1000" data-bind="targets.revenue_q3" value="${model.targets.revenue_q3 || 0}" /></div>
          <div class="field"><div class="label">Revenue Q4 (Jan–Mar)</div><input type="number" step="1000" data-bind="targets.revenue_q4" value="${model.targets.revenue_q4 || 0}" /></div>

          <div class="field"><div class="label">Margin Q1 (Apr–Jun)</div><input type="number" step="1000" data-bind="targets.margin_q1" value="${model.targets.margin_q1 || 0}" /></div>
          <div class="field"><div class="label">Margin Q2 (Jul–Sep)</div><input type="number" step="1000" data-bind="targets.margin_q2" value="${model.targets.margin_q2 || 0}" /></div>
          <div class="field"><div class="label">Margin Q3 (Oct–Dec)</div><input type="number" step="1000" data-bind="targets.margin_q3" value="${model.targets.margin_q3 || 0}" /></div>
          <div class="field"><div class="label">Margin Q4 (Jan–Mar)</div><input type="number" step="1000" data-bind="targets.margin_q4" value="${model.targets.margin_q4 || 0}" /></div>

          <div class="full muted">Derived annual margin target (sum of quarters): ${money(marginFY)}</div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">FY24 reference actuals (guardrails)</div>
        <div class="section-sub">Used for accelerator restrictions when FY25 goals are below FY24 actuals. You can also record discretionary multipliers and notes.</div>
        <div class="form">
          <div class="field"><div class="label">FY24 actual revenue</div><input type="number" step="1000" data-bind="fy24.actual_revenue" value="${model.fy24.actual_revenue || 0}" /></div>
          <div class="field"><div class="label">FY24 actual margin</div><input type="number" step="1000" data-bind="fy24.actual_margin" value="${model.fy24.actual_margin || 0}" /></div>
          <div class="field"><div class="label">Revenue guardrail discretion multiplier (0–1)</div><input type="number" step="0.01" min="0" max="1" data-bind="guardrails.revenue_discretion_multiplier" value="${model.guardrails.revenue_discretion_multiplier ?? 1.0}" /></div>
          <div class="field"><div class="label">Margin guardrail discretion multiplier (0–1)</div><input type="number" step="0.01" min="0" max="1" data-bind="guardrails.margin_discretion_multiplier" value="${model.guardrails.margin_discretion_multiplier ?? 1.0}" /></div>
          <div class="field full"><div class="label">Guardrail notes (optional)</div><textarea data-bind="guardrails.notes">${escapeHtml(model.guardrails.notes || "")}</textarea></div>
        </div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Monthly actual revenue (Apr–Mar)</div>
        <div class="section-sub">Manual entry only in this prototype. Quarterly rollups update automatically.</div>
        <div class="form">${monthInputsRevenue}</div>
      </div>
      <div class="card">
        <div class="section-title">Monthly actual margin (Apr–Mar)</div>
        <div class="section-sub">Manual entry only in this prototype. Quarterly rollups update automatically.</div>
        <div class="form">${monthInputsMargin}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="section-title">YOY and MBO inputs</div>
      <div class="section-sub">YOY is based on actual YOY revenue growth. MBO uses a final payout percent capped at 100%.</div>
      <div class="form">
        <div class="field"><div class="label">Actual YOY revenue growth</div><input type="number" step="1000" data-bind="actuals.yoy_growth_actual" value="${model.actuals.yoy_growth_actual || 0}" /></div>
        <div class="field"><div class="label">MBO final payout percent</div><input type="number" step="1" min="0" max="100" data-bind="actuals.mbo_final_payout_pct" value="${model.actuals.mbo_final_payout_pct || 0}" /></div>
        <div class="field full"><div class="label">Target revision flag</div>
          <input type="text" data-bind="target_revision_flag" value="${model.target_revision_flag ? "true" : "false"}" placeholder="true/false" />
        </div>
        <div class="field full"><div class="label">Target revision notes</div><textarea data-bind="target_revision_notes">${escapeHtml(model.target_revision_notes || "")}</textarea></div>
      </div>

      <div class="row-actions">
        <button class="primary" id="btnSaveSettings">Save settings</button>
      </div>
    </div>
  `;

  // ---------------------------
  // Scenario button handlers
  // ---------------------------
  const scenarioSelectEl = () => document.getElementById("scenarioSelect");
  const scenarioNameEl = () => document.getElementById("scenarioName");

  const btnScenarioSave = document.getElementById("btnScenarioSave");
  const btnScenarioLoad = document.getElementById("btnScenarioLoad");
  const btnScenarioDup = document.getElementById("btnScenarioDup");
  const btnScenarioDelete = document.getElementById("btnScenarioDelete");

  if (btnScenarioSave) {
    btnScenarioSave.onclick = () => {
      const name = (scenarioNameEl().value || "").trim();
      if (!name) {
        alert("Enter a scenario name first.");
        return;
      }
      saveScenario(name, deepClone(model));
      setActiveScenario(name);
      saveAndRender();
    };
  }

  if (btnScenarioLoad) {
    btnScenarioLoad.onclick = () => {
      const sel = scenarioSelectEl().value;
      if (!sel) {
        alert("Select a scenario to load.");
        return;
      }
      const loaded = loadScenario(sel);
      if (!loaded) {
        alert("Scenario not found.");
        return;
      }
      model = deepClone(loaded);
      saveModel(model);
      setActiveScenario(sel);
      saveAndRender();
    };
  }

  if (btnScenarioDup) {
    btnScenarioDup.onclick = () => {
      const sel = scenarioSelectEl().value;
      if (!sel) {
        alert("Select a scenario to duplicate.");
        return;
      }
      const name = (scenarioNameEl().value || "").trim();
      if (!name) {
        alert("Enter a new scenario name to duplicate into.");
        return;
      }
      const ok = duplicateScenario(sel, name);
      if (!ok) {
        alert("Could not duplicate scenario.");
        return;
      }
      setActiveScenario(name);
      saveAndRender();
    };
  }

  if (btnScenarioDelete) {
    btnScenarioDelete.onclick = () => {
      const sel = scenarioSelectEl().value;
      if (!sel) {
        alert("Select a scenario to delete.");
        return;
      }
      if (!confirm(`Delete scenario "${sel}"? This cannot be undone.`)) return;
      deleteScenario(sel);
      if (getActiveScenario() === sel) setActiveScenario("");
      saveAndRender();
    };
  }

  // ---------------------------
  // Settings Save handler
  // ---------------------------
  const btnSaveSettings = document.getElementById("btnSaveSettings");
  if (btnSaveSettings) {
    btnSaveSettings.onclick = () => {
      const binds = $$("[data-bind]");
      binds.forEach((node) => {
        const path = node.getAttribute("data-bind");
        const value = node.tagName.toLowerCase() === "textarea" ? node.value : node.value;
        setByPath(model, path, value);
      });

      // type coercions
      model.target_revision_flag = String(model.target_revision_flag).toLowerCase() === "true";
      saveAndRender();
    };
  }
}

function setByPath(obj, path, raw) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null) cur[p] = {};
    cur = cur[p];
  }
  const last = parts[parts.length - 1];

  // Handle array paths like monthly_revenue.0
  if (Array.isArray(cur)) {
    cur[Number(last)] = coerce(raw);
    return;
  }

  // If path ends with numeric index and current is array holder like actuals.monthly_revenue
  if (parts.length >= 3) {
    const prev = parts[parts.length - 2];
    if (prev === "monthly_revenue" || prev === "monthly_margin") {
      if (Array.isArray(cur)) cur[Number(last)] = coerce(raw);
      else cur[last] = coerce(raw);
      return;
    }
  }

  cur[last] = coerce(raw);
}

function coerce(v) {
  if (v === "" || v == null) return v;
  const s = String(v);
  const n = Number(v);

  if (Number.isFinite(n) && s.trim() !== "") {
    // Preserve text values that contain non-numeric characters (except . and -)
    if (/[^0-9.\-]/.test(s)) return s;
    return n;
  }
  return v;
}

// ---------- Event wiring ----------
$("#nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  setView(btn.dataset.view);
});

$("#btnLoadSample").onclick = () => {
  model = defaultModel();
  saveAndRender();
};

$("#btnReset").onclick = () => {
  resetModel();
  model = defaultModel();
  saveAndRender();
};

render();
