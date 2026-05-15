<div class="card">
  <div class="section-title">Plan Version</div>
  <div class="section-sub">Select FY2025 or FY2026 rules. FY2026 quotas can be entered later when your goal letter arrives.</div>
  <div class="form">
    <div class="field">
      <div class="label">Plan version</div>
      <select id="planVersionSelect" style="padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);color:#e8eefc;">
        <option value="FY2025" ${model.plan_version==="FY2025"?"selected":""}>FY2025</option>
        <option value="FY2026" ${model.plan_version==="FY2026"?"selected":""}>FY2026</option>
      </select>
    </div>
  </div>
  <div class="row-actions">
    <button class="primary" id="btnApplyPlanVersion">Apply plan version</button>
  </div>
</div>
