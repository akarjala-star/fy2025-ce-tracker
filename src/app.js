import { calculate, money, pct } from "./calc.js";
import {
  loadModel,
  saveModel,
  resetModel,
  defaultModel,
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

// ---------- Utility helpers ----------
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
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function getPlanBucket(m, planVersion) {
  const pv = planVersion || m.plan_version || "FY2025";
  m.plans = m.plans || {};
  m.plans[pv] = m.plans[pv] || { targets: {}, actuals: {}, prior: {}, guardrails: {}, mbo: {} };
  m.plans[pv].targets = m.plans[pv].targets || {};
  m.plans[pv].actuals = m.plans[pv].actuals || {};
  m.plans[pv].prior = m.plans[pv].prior || {};
  m.plans[pv].guardrails = m.plans[pv].guardrails || {};
  m.plans[pv].mbo = m.plans[pv].mbo || {};
  return m.plans[pv];
}

// ---------- Navigation ----------
function setView(viewKey) {
  $$("#nav .nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewKey);
  });
  $$("main .content").forEach((sec) => sec.classList.add("hidden"));
  const view = $(`#view-${viewKey}`);
  if (view) view.classList.remove("hidden");

  const titles = {
    overview: ["Overview", "Projected payout excluding Strategic/Large Deals"],
    revenue: ["Revenue", "Monthly tracking, rollups, attainment & payout"],
    margin: ["Margin", "FY25 payout curve OR FY26 revenue modifier"],
    yoy: ["YOY Growth", "Discrete outcomes based on YOY and Revenue attainment"],
    mbo: ["MBO", "FY25: % payout | FY26: 1–2 MBOs met/not met (no partial)"],
    settings: ["Settings / Assumptions", "Edit targets & actuals (manual entry). FY26 selectable even without quotas."],
  };

  $("#pageTitle").textContent = titles[viewKey][0];
  $("#pageSubtitle").textContent = titles[viewKey][1];
}

function render() {
  const result = calculate(model);
  renderOverview(result);
  renderRevenue(result);
  renderMargin(result);
  renderYOY(result);
  renderMBO(result);
  renderSettings(result);

  // update top pill
  const pv = model.plan_version || "FY2025";
  const planPill = $("#planPill");
  if (planPill) planPill.textContent = `Plan: ${pv}`;
}

function saveAndRender() {
  saveModel(model);
  const pill = $("#savePill");
  if (pill) pill.textContent = "Saved locally";
  render();
}

// ---------- UI bits ----------
function flagsChips(flags) {
  const chips = [];

  if (flags.revenueCappedByMargin) chips.push({ text: "Revenue capped (margin threshold rule)", kind: "warn" });
  if (flags.revenuePriorYearGuardrail) chips.push({ text: "Prior-year revenue guardrail active", kind: "warn" });
  if (flags.discretionaryReductionPossible) chips.push({ text: "Discretionary reduction possible", kind: "warn" });
  if (flags.payoutReviewRequired) chips.push({ text: "Review required (> $250k)", kind: "bad" });
  if (flags.targetRevision) chips.push({ text: "Target revision flagged", kind: "warn" });

  if (chips.length === 0) chips.push({ text: "No guardrails/exceptions detected", kind: "good" });

  return `<div class="kpi-row">${chips.map((c) => `<div class="chip ${c.kind}">${c.text}</div>`).join("")}</div>`;
}

function progressBar(attainPct) {
  const w = Math.max(0, Math.min(140, attainPct));
  return `<div class="progress" title="${pct(attainPct)}"><div style="width:${w / 1.4}%"></div></div>`;
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

// ---------- Overview ----------
function renderOverview(r) {
  const el = $("#view-overview");
  if (!el) return;

  const pv = r.planVersion || model.plan_version || "FY2025";

  const revAtt = r.attainment.revenueAttainPct;
  const marAtt = r.attainment.marginAttainPct;
  const yoyAtt = r.attainment.yoyAttainPct;

  const revMult = r.multipliers.revenuePayoutMult;
  const marginMod = r.multipliers.marginModifierMult;

  const isFY26 = pv === "FY2026";

  const revenueLine = isFY26
    ? `${pct(revAtt)} → ${(revMult * 100).toFixed(0)}% × margin mod ${(marginMod * 100).toFixed(0)}%`
    : `${pct(revAtt)} → ${(revMult * 100).toFixed(0)}%`;

  const marginLine = isFY26
    ? `Margin attainment ${pct(marAtt)} → modifier ${(marginMod * 100).toFixed(0)}%`
    : `${pct(marAtt)} → ${(r.multipliers.marginPayoutMult * 100).toFixed(0)}%`;

  const marginPayoutOrZero = isFY26 ? "— (modifier only)" : money(r.payoutDollars.margin);

  el.innerHTML = `
    <div class="grid cols-4">
      <div class="card">
        <div class="card-title">Plan version</div>
        <div class="card-value">${pv}</div>
        <div class="card-sub">FY26 selectable even before quotas arrive</div>
      </div>

      <div class="card">
        <div class="card-title">Total target incentive</div>
        <div class="card-value">${money(r.inputs.totalTargetIncentive)}</div>
        <div class="card-sub">Weighted by plan version</div>
      </div>

      <div class="card">
        <div class="card-title">Projected payout (core plan)</div>
        <div class="card-value">${money(r.totalPayout)}</div>
        <div class="card-sub">Strategic/Large Deals excluded</div>
      </div>

      <div class="card">
        <div class="card-title">Review threshold</div>
        <div class="card-value">${r.flags.payoutReviewRequired ? "Flagged" : "OK"}</div>
        <div class="card-sub">Flags if payout exceeds $250k</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-3">
      <div class="card">
        <div class="card-title">Revenue attainment → payout</div>
        <div class="card-value">${revenueLine}</div>
        <div class="card-sub">Revenue payout: ${money(r.payoutDollars.revenue)}</div>
      </div>

      <div class="card">
        <div class="card-title">${isFY26 ? "Margin modifier" : "Margin attainment → payout"}</div>
        <div class="card-value">${marginLine}</div>
        <div class="card-sub">${isFY26 ? "Applied to revenue payment" : `Margin payout: ${marginPayoutOrZero}`}</div>
      </div>

      <div class="card">
        <div class="card-title">YOY Growth attainment → payout</div>
        <div class="card-value">${pct(yoyAtt)} → ${(r.multipliers.yoyPayoutMult * 100).toFixed(0)}%</div>
        <div class="card-sub">YOY payout: ${money(r.payoutDollars.yoy)}</div>
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

// ---------- Revenue ----------
function renderRevenue(r) {
  const el = $("#view-revenue");
  if (!el) return;

  const pv = r.planVersion || model.plan_version || "FY2025";
  const isFY26 = pv === "FY2026";

  const payoutLabel = isFY26
    ? `Revenue payout: ${(r.multipliers.revenuePayoutMult * 100).toFixed(0)}% × margin mod ${(r.multipliers.marginModifierMult * 100).toFixed(0)}%`
    : `Revenue payout: ${(r.multipliers.revenuePayoutMult * 100).toFixed(0)}%`;

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
        <div class="card-title">Revenue component</div>
        <div class="card-value">${money(r.payoutDollars.revenue)}</div>
        <div class="card-sub">${payoutLabel}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Monthly rollup (targets derived from quarters)</div>
        <div class="section-sub">Edit monthly actuals in Settings. Month targets are evenly spread within each quarter for tracking convenience.</div>
        <table class="table">
          <thead><tr><th>Month</th><th>Target (derived)</th><th>Actual</th><th>Attainment</th></tr></thead>
          <tbody>${monthRows(r, "revenue")}</tbody>
        </table>
      </div>

      <div class="card">
        <div class="section-title">Quarterly rollup</div>
        <div class="section-sub">Quarter targets are editable in Settings (or left blank until FY26 quota letter arrives).</div>
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
      <div class="section-title">Revenue notes</div>
      <div class="section-sub">FY26 applies a margin modifier to the revenue payment and restricts accelerators if margin threshold is not met. FY25 uses separate revenue & margin payout curves.</div>
      ${flagsChips(r.flags)}
    </div>
  `;
}

// ---------- Margin ----------
function renderMargin(r) {
  const el = $("#view-margin");
  if (!el) return;

  const pv = r.planVersion || model.plan_version || "FY2025";
  const isFY26 = pv === "FY2026";

  const title = isFY26 ? "Margin Modifier (FY26)" : "Margin (FY25)";
  const rightLabel = isFY26 ? "Modifier applied to revenue payment" : "Margin payout";

  const value = isFY26 ? `${(r.multipliers.marginModifierMult * 100).toFixed(0)}%` : `${(r.multipliers.marginPayoutMult * 100).toFixed(0)}%`;

  const payoutDollars = isFY26 ? "—" : money(r.payoutDollars.margin);

  el.innerHTML = `
    <div class="grid cols-3">
      <div class="card">
        <div class="card-title">${title}</div>
        <div class="card-value">${value}</div>
        <div class="card-sub">${rightLabel}</div>
      </div>

      <div class="card">
        <div class="card-title">Annual margin target</div>
        <div class="card-value">${money(r.inputs.marginTargetFY)}</div>
        <div class="card-sub">Actual: ${money(r.actuals.marginActualFY)}</div>
      </div>

      <div class="card">
        <div class="card-title">Annual margin attainment</div>
        <div class="card-value">${pct(r.attainment.marginAttainPct)}</div>
        <div class="card-sub">${progressBar(r.attainment.marginAttainPct)}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Monthly rollup</div>
        <div class="section-sub">Month targets are derived from quarterly targets for tracking convenience.</div>
        <table class="table">
          <thead><tr><th>Month</th><th>Target (derived)</th><th>Actual</th><th>Attainment</th></tr></thead>
          <tbody>${monthRows(r, "margin")}</tbody>
        </table>
      </div>

      <div class="card">
        <div class="section-title">Quarterly rollup</div>
        <div class="section-sub">In FY26, margin targets drive the revenue modifier. In FY25, margin drives its own payout component.</div>
        <table class="table">
          <thead><tr>
            <th>Q</th><th>Rev Target</th><th>Rev Actual</th><th>Rev Attain</th>
            <th>Mar Target</th><th>Mar Actual</th><th>Mar Attain</th>
          </tr></thead>
          <tbody>${quarterRows(r)}</tbody>
        </table>
        <div style="height:10px"></div>
        <div class="muted">${isFY26 ? "FY26 margin payout is not separate; it modifies revenue payment." : `Margin payout dollars: ${payoutDollars}`}</div>
      </div>
    </div>
  `;
}

// ---------- YOY ----------
function renderYOY(r) {
  const el = $("#view-yoy");
  if (!el) return;

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
      <div class="section-title">YOY logic</div>
      <div class="section-sub">Discrete outcomes when YOY quota is achieved, with higher payouts if Revenue quota is also met.</div>
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

// ---------- MBO ----------
function renderMBO(r) {
  const el = $("#view-mbo");
  if (!el) return;

  const pv = r.planVersion || model.plan_version || "FY2025";
  const isFY26 = pv === "FY2026";

  const bucket = getPlanBucket(model, pv);

  if (!isFY26) {
    // FY25: percent input
    const mboPct = clamp(Number(bucket.actuals?.mbo_final_payout_pct || 0), 0, 100);

    el.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <div class="section-title">MBO final payout percent (FY25)</div>
          <div class="section-sub">Enter the manager-approved final MBO payout percent. It is capped at 100%.</div>

          <div class="kpi-row">
            <div class="chip">MBO target incentive: ${money(r.targetIncentive.mbo)}</div>
            <div class="chip">Final payout: ${mboPct.toFixed(0)}%</div>
            <div class="chip">Component payout: ${money(r.payoutDollars.mbo)}</div>
          </div>

          <div style="height:10px"></div>

          <div class="field">
            <label class="label" for="mboPct">MBO final payout % (0–100)</label>
            <input id="mboPct" type="number" min="0" max="100" step="1" value="${mboPct}" />
          </div>

          <div class="row-actions">
            <button class="primary" id="btnSaveMbo">Save MBO</button>
          </div>
        </div>

        <div class="card">
          <div class="section-title">Strategic / Large Deal notes</div>
          <div class="section-sub">Strategic/Large deal incentives are handled separately and excluded from core totals.</div>
          <div class="field">
            <label class="label" for="spNotes">Optional notes (informational only)</label>
            <textarea id="spNotes" placeholder="Track strategic/large deals separately.">${escapeHtml(bucket.actuals?.strategic_pursuit_notes || "")}</textarea>
          </div>
          <div class="row-actions">
            <button class="primary" id="btnSaveSp">Save notes</button>
          </div>
        </div>
      </div>
    `;

    $("#btnSaveMbo").onclick = () => {
      bucket.actuals.mbo_final_payout_pct = Number($("#mboPct").value || 0);
      saveAndRender();
    };
    $("#btnSaveSp").onclick = () => {
      bucket.actuals.strategic_pursuit_notes = $("#spNotes").value || "";
      saveAndRender();
    };

    return;
  }

  // FY26: option 2 (choose 1 or 2 MBOs), met/not met only
  bucket.mbo = bucket.mbo || {};
  const mboCount = clamp(Number(bucket.mbo.mbo_count || 1), 1, 2);
  const mbo1Met = Boolean(bucket.mbo.mbo1_met);
  const mbo2Met = Boolean(bucket.mbo.mbo2_met);
  const mbo1Desc = bucket.mbo.mbo1_desc || "";
  const mbo2Desc = bucket.mbo.mbo2_desc || "";

  el.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">MBOs (FY26) — Option 2</div>
        <div class="section-sub">Choose 1 or 2 MBOs. Each MBO is met/not met (no partial). If 2 MBOs, each contributes 50% of the MBO component.</div>

        <div class="kpi-row">
          <div class="chip">MBO component target: ${money(r.targetIncentive.mbo)}</div>
          <div class="chip">Payout multiplier: ${(r.multipliers.mboPayoutMult * 100).toFixed(0)}%</div>
          <div class="chip">Component payout: ${money(r.payoutDollars.mbo)}</div>
        </div>

        <div style="height:12px"></div>

        <div class="field">
          <div class="label">Number of MBOs (1 or 2)</div>
          <select id="mboCount" style="padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);color:#e8eefc;">
            <option value="1" ${mboCount === 1 ? "selected" : ""}>1 MBO (20%)</option>
            <option value="2" ${mboCount === 2 ? "selected" : ""}>2 MBOs (10% each)</option>
          </select>
        </div>

        <div style="height:10px"></div>

        <div class="field">
          <div class="label">MBO 1 description (optional)</div>
          <input id="mbo1Desc" type="text" value="${escapeHtml(mbo1Desc)}" />
        </div>

        <div class="field" style="margin-top:8px">
          <label class="label">
            <input id="mbo1Met" type="checkbox" ${mbo1Met ? "checked" : ""} />
            MBO 1 met
          </label>
        </div>

        <div id="mbo2Block" style="${mboCount === 2 ? "" : "display:none"}; margin-top:12px">
          <div class="field">
            <div class="label">MBO 2 description (optional)</div>
            <input id="mbo2Desc" type="text" value="${escapeHtml(mbo2Desc)}" />
          </div>

          <div class="field" style="margin-top:8px">
            <label class="label">
              <input id="mbo2Met" type="checkbox" ${mbo2Met ? "checked" : ""} />
              MBO 2 met
            </label>
          </div>
        </div>

        <div class="row-actions" style="margin-top:12px">
          <button class="primary" id="btnSaveMboFy26">Save MBOs</button>
        </div>
      </div>

      <div class="card">
        <div class="section-title">Strategic / Large Deal notes</div>
        <div class="section-sub">Strategic/Large deal incentives are handled separately and excluded from core totals.</div>
        <div class="field">
          <label class="label" for="spNotes">Optional notes (informational only)</label>
          <textarea id="spNotes" placeholder="Track strategic/large deals separately.">${escapeHtml(bucket.actuals?.strategic_pursuit_notes || "")}</textarea>
        </div>
        <div class="row-actions">
          <button class="primary" id="btnSaveSp">Save notes</button>
        </div>
      </div>
    </div>
  `;

  const mboCountEl = $("#mboCount");
  if (mboCountEl) {
    mboCountEl.onchange = () => {
      const val = Number(mboCountEl.value);
      const block = $("#mbo2Block");
      if (block) block.style.display = val === 2 ? "" : "none";
    };
  }

  $("#btnSaveMboFy26").onclick = () => {
    bucket.mbo.mbo_count = Number($("#mboCount").value || 1);
    bucket.mbo.mbo1_desc = $("#mbo1Desc").value || "";
    bucket.mbo.mbo1_met = Boolean($("#mbo1Met").checked);

    if (Number(bucket.mbo.mbo_count) === 2) {
      bucket.mbo.mbo2_desc = $("#mbo2Desc").value || "";
      bucket.mbo.mbo2_met = Boolean($("#mbo2Met").checked);
    } else {
      bucket.mbo.mbo2_desc = "";
      bucket.mbo.mbo2_met = false;
    }

    saveAndRender();
  };

  $("#btnSaveSp").onclick = () => {
    bucket.actuals.strategic_pursuit_notes = $("#spNotes").value || "";
    saveAndRender();
  };
}

// ---------- Settings ----------
function renderSettings(r) {
  const el = $("#view-settings");
  if (!el) return;

  const pv = model.plan_version || "FY2025";
  const bucket = getPlanBucket(model, pv);

  const months = r.rules.fiscalYear.months;

  const scenarios = listScenarios();
  const activeScenario = getActiveScenario();
  const scenarioNames = Object.keys(scenarios).sort();

  const monthInputsRevenue = months
    .map(
      (m, i) => `
      <div class="field">
        <div class="label">${m} revenue actual</div>
        <input type="number" step="1000" data-bind="plans.${pv}.actuals.monthly_revenue.${i}" value="${Number(bucket.actuals.monthly_revenue?.[i] || 0)}" />
      </div>
    `
    )
    .join("");

  const monthInputsMargin = months
    .map(
      (m, i) => `
      <div class="field">
        <div class="label">${m} margin actual</div>
        <input type="number" step="1000" data-bind="plans.${pv}.actuals.monthly_margin.${i}" value="${Number(bucket.actuals.monthly_margin?.[i] || 0)}" />
      </div>
    `
    )
    .join("");

  const priorLabelYear = pv === "FY2026" ? "FY25" : "FY24";

  el.innerHTML = `
    <div class="card">
      <div class="section-title">Plan Version</div>
      <div class="section-sub">FY2026 can be selected now even without quotas. Enter FY26 targets later when the goal/quota letter arrives.</div>
      <div class="form">
        <div class="field">
          <div class="label">Plan version</div>
          <select id="planVersionSelect" style="padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);color:#e8eefc;">
            <option value="FY2025" ${pv === "FY2025" ? "selected" : ""}>FY2025</option>
            <option value="FY2026" ${pv === "FY2026" ? "selected" : ""}>FY2026</option>
          </select>
        </div>
      </div>
      <div class="row-actions">
        <button class="primary" id="btnApplyPlanVersion">Apply plan version</button>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="section-title">Compensation inputs (global)</div>
      <div class="section-sub">These apply across plan versions. Targets & actuals below are plan-specific.</div>
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
          <input type="number" step="1000" data-bind="annual_base_salary" value="${Number(model.annual_base_salary || 0)}" />
        </div>
        <div class="field">
          <div class="label">Total target incentive (required)</div>
          <input type="number" step="1000" data-bind="total_target_incentive" value="${Number(model.total_target_incentive || 0)}" />
        </div>
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
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">${pv} targets (editable)</div>
        <div class="section-sub">FY26 targets may be blank until you receive your goal/quota letter. Margin targets are still required in FY26 because they drive the revenue modifier.</div>
        <div class="form">
          <div class="field"><div class="label">Revenue target (annual)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.revenue_fy" value="${Number(bucket.targets.revenue_fy || 0)}" /></div>
          <div class="field"><div class="label">YOY growth target (annual)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.yoy_growth_fy" value="${Number(bucket.targets.yoy_growth_fy || 0)}" /></div>

          <div class="field"><div class="label">Revenue Q1 (Apr–Jun)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.revenue_q1" value="${Number(bucket.targets.revenue_q1 || 0)}" /></div>
          <div class="field"><div class="label">Revenue Q2 (Jul–Sep)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.revenue_q2" value="${Number(bucket.targets.revenue_q2 || 0)}" /></div>
          <div class="field"><div class="label">Revenue Q3 (Oct–Dec)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.revenue_q3" value="${Number(bucket.targets.revenue_q3 || 0)}" /></div>
          <div class="field"><div class="label">Revenue Q4 (Jan–Mar)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.revenue_q4" value="${Number(bucket.targets.revenue_q4 || 0)}" /></div>

          <div class="field"><div class="label">Margin Q1 (Apr–Jun)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.margin_q1" value="${Number(bucket.targets.margin_q1 || 0)}" /></div>
          <div class="field"><div class="label">Margin Q2 (Jul–Sep)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.margin_q2" value="${Number(bucket.targets.margin_q2 || 0)}" /></div>
          <div class="field"><div class="label">Margin Q3 (Oct–Dec)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.margin_q3" value="${Number(bucket.targets.margin_q3 || 0)}" /></div>
          <div class="field"><div class="label">Margin Q4 (Jan–Mar)</div><input type="number" step="1000" data-bind="plans.${pv}.targets.margin_q4" value="${Number(bucket.targets.margin_q4 || 0)}" /></div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">${priorLabelYear} reference actuals (guardrails)</div>
        <div class="section-sub">Used for accelerator restrictions when current-year goals are below prior-year actuals.</div>
        <div class="form">
          <div class="field"><div class="label">${priorLabelYear} actual revenue</div><input type="number" step="1000" data-bind="plans.${pv}.prior.actual_revenue" value="${Number(bucket.prior.actual_revenue || 0)}" /></div>
          <div class="field"><div class="label">${priorLabelYear} actual margin</div><input type="number" step="1000" data-bind="plans.${pv}.prior.actual_margin" value="${Number(bucket.prior.actual_margin || 0)}" /></div>

          <div class="field"><div class="label">Revenue guardrail discretion multiplier (0–1)</div><input type="number" step="0.01" min="0" max="1" data-bind="plans.${pv}.guardrails.revenue_discretion_multiplier" value="${Number(bucket.guardrails.revenue_discretion_multiplier ?? 1.0)}" /></div>

          <div class="field"><div class="label">Margin guardrail discretion multiplier (0–1) (FY25 only)</div><input type="number" step="0.01" min="0" max="1" data-bind="plans.${pv}.guardrails.margin_discretion_multiplier" value="${Number(bucket.guardrails.margin_discretion_multiplier ?? 1.0)}" /></div>

          <div class="field full"><div class="label">Guardrail notes</div><textarea data-bind="plans.${pv}.guardrails.notes">${escapeHtml(bucket.guardrails.notes || "")}</textarea></div>
        </div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Monthly actual revenue (${pv})</div>
        <div class="section-sub">Manual entry. Quarterly rollups update automatically.</div>
        <div class="form">${monthInputsRevenue}</div>
      </div>

      <div class="card">
        <div class="section-title">Monthly actual margin (${pv})</div>
        <div class="section-sub">Manual entry. In FY26, margin drives the revenue modifier.</div>
        <div class="form">${monthInputsMargin}</div>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="section-title">YOY input (${pv})</div>
      <div class="section-sub">YOY payout depends on YOY achievement and revenue attainment thresholds.</div>
      <div class="form">
        <div class="field"><div class="label">Actual YOY revenue growth</div><input type="number" step="1000" data-bind="plans.${pv}.actuals.yoy_growth_actual" value="${Number(bucket.actuals.yoy_growth_actual || 0)}" /></div>
      </div>

      <div style="height:10px"></div>

      <div class="form">
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

  // Plan version switch
  $("#btnApplyPlanVersion").onclick = () => {
    model.plan_version = $("#planVersionSelect").value;
    saveAndRender();
  };

  // Scenario controls
  const scenarioSelectEl = () => document.getElementById("scenarioSelect");
  const scenarioNameEl = () => document.getElementById("scenarioName");

  $("#btnScenarioSave").onclick = () => {
    const name = (scenarioNameEl().value || "").trim();
    if (!name) return alert("Enter a scenario name first.");
    saveScenario(name, deepClone(model));
    setActiveScenario(name);
    saveAndRender();
  };

  $("#btnScenarioLoad").onclick = () => {
    const sel = scenarioSelectEl().value;
    if (!sel) return alert("Select a scenario to load.");
    const loaded = loadScenario(sel);
    if (!loaded) return alert("Scenario not found.");
    model = deepClone(loaded);
    saveModel(model);
    setActiveScenario(sel);
    saveAndRender();
  };

  $("#btnScenarioDup").onclick = () => {
    const sel = scenarioSelectEl().value;
    if (!sel) return alert("Select a scenario to duplicate.");
    const name = (scenarioNameEl().value || "").trim();
    if (!name) return alert("Enter a new scenario name to duplicate into.");
    const ok = duplicateScenario(sel, name);
    if (!ok) return alert("Could not duplicate scenario.");
    setActiveScenario(name);
    saveAndRender();
  };

  $("#btnScenarioDelete").onclick = () => {
    const sel = scenarioSelectEl().value;
    if (!sel) return alert("Select a scenario to delete.");
    if (!confirm(`Delete scenario "${sel}"? This cannot be undone.`)) return;
    deleteScenario(sel);
    if (getActiveScenario() === sel) setActiveScenario("");
    saveAndRender();
  };

  // Save settings handler (writes all data-bind fields)
  $("#btnSaveSettings").onclick = () => {
    const binds = $$("[data-bind]");
    binds.forEach((node) => {
      const path = node.getAttribute("data-bind");
      const value = node.tagName.toLowerCase() === "textarea" ? node.value : node.value;
      setByPath(model, path, value);
    });

    model.target_revision_flag = String(model.target_revision_flag).toLowerCase() === "true";
    saveAndRender();
  };
}

function setByPath(obj, path, raw) {
  const parts = path.split(".");
  let cur = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null) {
      // Create object/array container if needed
      // if next part is a number, create array
      const next = parts[i + 1];
      cur[p] = /^\d+$/.test(next) ? [] : {};
    }
    cur = cur[p];
  }

  const last = parts[parts.length - 1];

  // array index
  if (Array.isArray(cur) && /^\d+$/.test(last)) {
    cur[Number(last)] = coerce(raw);
    return;
  }

  cur[last] = coerce(raw);
}

function coerce(v) {
  if (v === "" || v == null) return v;

  const s = String(v);
  const n = Number(v);

  // If it contains letters or symbols other than . and -, keep as string
  if (/[^0-9.\-]/.test(s)) return s;

  if (Number.isFinite(n)) return n;
  return v;
}

// ---------- Wiring ----------
const nav = $("#nav");
if (nav) {
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    setView(btn.dataset.view);
  });
}

const btnLoad = $("#btnLoadSample");
if (btnLoad) {
  btnLoad.onclick = () => {
    model = defaultModel();
    saveAndRender();
  };
}

const btnReset = $("#btnReset");
if (btnReset) {
  btnReset.onclick = () => {
    resetModel();
    model = defaultModel();
    saveAndRender();
  };
}

// Initial render
render();
