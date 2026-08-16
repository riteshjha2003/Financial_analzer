/**
 * app.js — Main Application Controller
 * Ties together parser, analyzer, charts into a cohesive UI.
 * Handles file upload, tab switching, lazy rendering, error display.
 */
window.FinAnalyzer = window.FinAnalyzer || {};

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────
  let isInitialized = false;
  const renderedTabs = new Set();

  // Cached DOM refs (populated on init)
  const el = {};

  // ─── Bootstrap ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (isInitialized) return;
    el.uploadZone = document.getElementById('upload-zone');
    el.fileInput = document.getElementById('file-input');
    el.loading = document.getElementById('loading-overlay');
    el.header = document.getElementById('company-header');
    el.companyName = document.getElementById('company-name');
    el.period = document.getElementById('analysis-period');
    el.sections = document.getElementById('analysis-sections');
    el.upload = document.getElementById('upload-section');
    el.newBtn = document.getElementById('new-file-btn');
    el.errorToast = document.getElementById('error-toast');
    el.errorMsg = document.getElementById('error-message');
    el.tabs = Array.from(document.querySelectorAll('.tab-btn'));
    el.panes = Array.from(document.querySelectorAll('.tab-content'));
    setupListeners();
    isInitialized = true;
  }

  // ─── Event Wiring ────────────────────────────────────────────────
  function setupListeners() {
    // Drag & Drop
    if (el.uploadZone) {
      el.uploadZone.addEventListener('dragover', e => { e.preventDefault(); el.uploadZone.classList.add('drag-over'); });
      el.uploadZone.addEventListener('dragleave', e => { e.preventDefault(); el.uploadZone.classList.remove('drag-over'); });
      el.uploadZone.addEventListener('drop', e => {
        e.preventDefault(); el.uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
      });
      el.uploadZone.addEventListener('click', () => el.fileInput && el.fileInput.click());
    }
    if (el.fileInput) el.fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });
    el.tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    if (el.newBtn) el.newBtn.addEventListener('click', resetApp);
  }

  // ─── File Handling ───────────────────────────────────────────────
  async function handleFile(file) {
    showLoading();
    try {
      const parsed = await window.FinAnalyzer.parseExcel(file);
      window.FinAnalyzer.parsedData = parsed;
      window.FinAnalyzer.analysis = window.FinAnalyzer.analyze(parsed);

      // Populate header
      el.companyName.textContent = parsed.companyName || 'Unknown Company';
      const periods = parsed.annual.periods;
      el.period.textContent = periods.length
        ? `${periods[0]} — ${periods[periods.length - 1]}  (${periods.length} years)`
        : '';

      // Show warnings
      if (parsed.warnings && parsed.warnings.length) {
        console.warn('Parser warnings:', parsed.warnings);
      }

      // Toggle views
      el.upload.style.display = 'none';
      el.header.style.display = 'block';
      el.sections.style.display = 'block';

      switchTab('overview');
    } catch (err) {
      console.error('File handling error:', err);
      showError(typeof err === 'string' ? err : err.message || 'Failed to parse file.');
    } finally {
      hideLoading();
    }
  }

  // ─── Tab Switching ───────────────────────────────────────────────
  function switchTab(id) {
    el.tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    el.panes.forEach(p => {
      const match = p.id === `tab-${id}`;
      p.classList.toggle('active', match);
    });
    if (!renderedTabs.has(id)) { renderTab(id); renderedTabs.add(id); }
  }

  function renderTab(id) {
    const d = window.FinAnalyzer.parsedData;
    const a = window.FinAnalyzer.analysis;
    if (!d) return;
    try {
      switch (id) {
        case 'overview': renderOverview(d, a); break;
        case 'income': renderIncomeStatement(d, a); break;
        case 'balance': renderBalanceSheet(d, a); break;
        case 'cashflow': renderCashFlow(d, a); break;
        case 'redflags': renderRedFlags(d, a); break;
        case 'forecast': renderForecast(d, a); break;
        case 'quarterly': renderQuarterly(d, a); break;
      }
    } catch (e) { console.error(`Tab "${id}" render error:`, e); }
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDERERS
  // ═══════════════════════════════════════════════════════════════

  // ─── Overview ────────────────────────────────────────────────────
  function renderOverview(d, a) {
    const pane = document.getElementById('tab-overview');
    if (!pane || !a) return;
    const m = a.metrics;
    const hs = a.healthScore || { score: 0, grade: 'N/A', components: [] };
    const is = d.annual.incomeStatement;
    const periods = d.annual.periods;
    const lastIdx = periods.length - 1;

    // --- Health score + Key Metrics ---
    pane.innerHTML = '';

    // Top row: Score + metrics
    const topRow = ce('div', 'overview-grid');

    // Health Score Card
    const scoreCard = ce('div', 'card');
    scoreCard.id = 'health-gauge-host';
    scoreCard.innerHTML = `
      <div style="text-align:center;">
        <div id="gauge-canvas-host" style="width:220px;height:130px;margin:0 auto;"></div>
        <div style="font-size:2.5rem;font-weight:700;margin-top:-20px;">${hs.score}<span style="font-size:1rem;color:var(--text-secondary);">/100</span></div>
        <div class="badge ${hs.score >= 70 ? 'badge-info' : hs.score >= 50 ? 'badge-warning' : 'badge-critical'}" style="font-size:1rem;padding:4px 14px;margin-top:6px;">${hs.grade}</div>
        <div style="margin-top:16px;text-align:left;">
          ${hs.components.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="text-small">${c.name}</span>
              <div style="width:120px;height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;">
                <div style="width:${c.score}%;height:100%;background:${c.score >= 70 ? 'var(--positive-green)' : c.score >= 50 ? 'var(--warning-amber)' : 'var(--negative-red)'};border-radius:3px;"></div>
              </div>
              <span class="text-small" style="width:30px;text-align:right;">${c.score}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    topRow.appendChild(scoreCard);

    // Key Metrics Card
    const metricsCard = ce('div', 'card');
    metricsCard.innerHTML = '<h3 style="margin-bottom:16px;">Key Metrics</h3>';
    const metricsGrid = ce('div');
    metricsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;';

    const metricItems = [
      { label: 'Revenue (Latest)', value: fINR(safe(is.sales, lastIdx)), trend: m?.growth?.revenueCAGR3Y?.label, up: (m?.growth?.revenueCAGR3Y?.value || 0) > 0 },
      { label: 'Net Profit (Latest)', value: fINR(safe(is.netProfit, lastIdx)), trend: m?.growth?.profitCAGR3Y?.label, up: (m?.growth?.profitCAGR3Y?.value || 0) > 0 },
      { label: 'Revenue CAGR (3Y)', value: m?.growth?.revenueCAGR3Y?.label || 'N/A', trend: null },
      { label: 'Profit CAGR (3Y)', value: m?.growth?.profitCAGR3Y?.label || 'N/A', trend: null },
      { label: 'OPM', value: fPct(m?.margins?.opmLatest), trend: m?.margins?.marginExpanding ? '▲ Expanding' : '▼ Compressing', up: m?.margins?.marginExpanding },
      { label: 'D/E Ratio', value: m?.balanceSheet?.debtToEquityLatest != null ? m.balanceSheet.debtToEquityLatest.toFixed(2) : 'N/A', trend: null },
      { label: 'FCF Trend', value: m?.cashFlow?.fcfTrend || 'N/A', trend: null },
      { label: 'Interest Coverage', value: (() => { const arr = m?.consistency?.interestCoverageRatio; if (!arr || !arr.length) return 'N/A'; const v = arr[arr.length - 1].value; return v != null ? v.toFixed(1) + 'x' : 'N/A'; })(), trend: null },
    ];

    metricItems.forEach(mi => {
      const mc = ce('div', 'metric-card');
      mc.innerHTML = `
        <div class="metric-label">${mi.label}</div>
        <div class="metric-value" style="font-size:1.15rem;">${mi.value}</div>
        ${mi.trend ? `<div class="metric-trend ${mi.up ? 'trend-up' : 'trend-down'}">${mi.trend}</div>` : ''}`;
      metricsGrid.appendChild(mc);
    });
    metricsCard.appendChild(metricsGrid);
    topRow.appendChild(metricsCard);
    pane.appendChild(topRow);

    // --- Charts Row ---
    const chartsRow = ce('div', 'charts-grid');
    const ch1 = ce('div'); const ch2 = ce('div');
    chartsRow.appendChild(ch1); chartsRow.appendChild(ch2);
    pane.appendChild(chartsRow);

    const C = window.FinAnalyzer.Charts;
    if (C) {
      C.renderHealthScoreGauge(document.getElementById('gauge-canvas-host'), hs.score);
      C.renderRevenueAndProfitChart(ch1, { periods, sales: is.sales || [], netProfit: is.netProfit || [] });
      C.renderMarginTrendChart(ch2, { periods, opm: is.opm || [], sales: is.sales || [], netProfit: is.netProfit || [] });
    }

    // --- Top Red Flags Preview ---
    if (a.redFlags && a.redFlags.length) {
      const flagsPreview = ce('div', 'card');
      flagsPreview.style.marginTop = '24px';
      flagsPreview.innerHTML = `<h3 style="margin-bottom:12px;">⚠ Top Alerts (${a.redFlags.length} found)</h3>`;
      a.redFlags.slice(0, 3).forEach(f => {
        const fd = ce('div', `redflag-card severity-${f.severity}`);
        fd.style.marginBottom = '10px';
        fd.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
          <span class="badge badge-${f.severity}">${f.severity.toUpperCase()}</span>
          <strong>${f.title}</strong>
        </div>
        <p class="text-small text-secondary" style="margin:4px 0 0;">${f.description}</p>`;
        flagsPreview.appendChild(fd);
      });
      pane.appendChild(flagsPreview);
    }

    // --- Research Directions Preview ---
    if (a.researchDirections && a.researchDirections.length) {
      const rdCard = ce('div', 'card');
      rdCard.style.marginTop = '16px';
      rdCard.innerHTML = `<h3 style="margin-bottom:12px;">🔍 Research Directions</h3>`;
      a.researchDirections.slice(0, 3).forEach(rd => {
        const block = ce('div', 'insight-block');
        block.innerHTML = `<strong>${rd.title}</strong><p class="text-small text-secondary" style="margin:4px 0 0;">${rd.description}</p>
          <p class="text-small" style="margin-top:6px;"><em>Sources: ${rd.sources.join(', ')}</em></p>`;
        rdCard.appendChild(block);
      });
      pane.appendChild(rdCard);
    }
  }

  // ─── Income Statement ────────────────────────────────────────────
  function renderIncomeStatement(d, a) {
    const pane = document.getElementById('tab-income');
    if (!pane) return;
    pane.innerHTML = '';
    const is = d.annual.incomeStatement;
    const periods = d.annual.periods;
    const m = a?.metrics;

    // Insights
    const insightsDiv = ce('div');
    const insights = buildIncomeInsights(d, m);
    insights.forEach(text => {
      const b = ce('div', 'insight-block');
      b.innerHTML = text;
      insightsDiv.appendChild(b);
    });
    pane.appendChild(insightsDiv);

    // Charts
    const chartsRow = ce('div', 'charts-grid');
    const c1 = ce('div'), c2 = ce('div'), c3 = ce('div');
    chartsRow.appendChild(c1); chartsRow.appendChild(c2); chartsRow.appendChild(c3);
    pane.appendChild(chartsRow);
    const C = window.FinAnalyzer.Charts;
    if (C) {
      C.renderRevenueAndProfitChart(c1, { periods, sales: is.sales || [], netProfit: is.netProfit || [] });
      C.renderMarginTrendChart(c2, { periods, opm: is.opm || [], sales: is.sales || [], netProfit: is.netProfit || [] });
      C.renderExpenseBreakdownChart(c3, { periods, expenses: is.expenses || [], depreciation: is.depreciation || [], interest: is.interest || [] });
    }

    // Data Table
    const tblHost = ce('div', 'card');
    tblHost.style.marginTop = '24px';
    tblHost.innerHTML = '<h3 style="margin-bottom:12px;">Detailed Data</h3>';
    const lineItems = [
      { label: 'Sales', key: 'sales', hl: true },
      { label: 'Expenses', key: 'expenses' },
      { label: 'Operating Profit', key: 'operatingProfit', hl: true },
      { label: 'OPM %', key: 'opm', fmt: 'pct' },
      { label: 'Other Income', key: 'otherIncome' },
      { label: 'Depreciation', key: 'depreciation' },
      { label: 'Interest', key: 'interest' },
      { label: 'Profit Before Tax', key: 'profitBeforeTax', hl: true },
      { label: 'Tax %', key: 'taxPercent', fmt: 'pct' },
      { label: 'Net Profit', key: 'netProfit', hl: true },
      { label: 'EPS (₹)', key: 'eps', fmt: 'num' },
      { label: 'Dividend Payout %', key: 'dividendPayout', fmt: 'pct' },
    ];
    buildFinancialTable(tblHost, periods, lineItems, is);
    pane.appendChild(tblHost);

    // Add YoY growth rows
    const growthHost = ce('div', 'card');
    growthHost.style.marginTop = '16px';
    growthHost.innerHTML = '<h3 style="margin-bottom:12px;">Year-over-Year Growth</h3>';
    const growthItems = [
      { label: 'Revenue Growth %', data: m?.growth?.yoyRevenue?.map(g => g.growth) || [], fmt: 'pct' },
      { label: 'Profit Growth %', data: m?.growth?.yoyProfit?.map(g => g.growth) || [], fmt: 'pct' },
    ];
    buildGrowthTable(growthHost, periods, growthItems);
    pane.appendChild(growthHost);
  }

  // ─── Balance Sheet ───────────────────────────────────────────────
  function renderBalanceSheet(d, a) {
    const pane = document.getElementById('tab-balance');
    if (!pane) return;
    pane.innerHTML = '';
    const bs = d.annual.balanceSheet;
    const periods = d.annual.periods;
    const m = a?.metrics;

    // Insights
    const insightsDiv = ce('div');
    const insights = buildBalanceInsights(d, m);
    insights.forEach(text => { const b = ce('div', 'insight-block'); b.innerHTML = text; insightsDiv.appendChild(b); });
    pane.appendChild(insightsDiv);

    // Charts
    const chartsRow = ce('div', 'charts-grid');
    const c1 = ce('div'), c2 = ce('div'), c3 = ce('div');
    chartsRow.appendChild(c1); chartsRow.appendChild(c2); chartsRow.appendChild(c3);
    pane.appendChild(chartsRow);
    const C = window.FinAnalyzer.Charts;
    if (C) {
      C.renderBalanceSheetComposition(c1, { periods, ...bs });
      C.renderDebtEquityChart(c2, { periods, ...bs });
      C.renderWorkingCapitalChart(c3, { periods, receivables: bs.receivables || [], inventory: bs.inventory || [], sales: d.annual.incomeStatement.sales || [] });
    }

    // Data Table
    const tblHost = ce('div', 'card');
    tblHost.style.marginTop = '24px';
    tblHost.innerHTML = '<h3 style="margin-bottom:12px;">Detailed Data</h3>';
    const lineItems = [
      { label: 'Equity Capital', key: 'equityCapital' },
      { label: 'Reserves', key: 'reserves' },
      { label: 'Borrowings', key: 'borrowings' },
      { label: 'Other Liabilities', key: 'otherLiabilities' },
      { label: 'Total Liabilities', key: 'totalLiabilities', hl: true },
      { label: 'Fixed Assets', key: 'fixedAssets' },
      { label: 'CWIP', key: 'cwip' },
      { label: 'Investments', key: 'investments' },
      { label: 'Other Assets', key: 'otherAssets' },
      { label: 'Total Assets', key: 'totalAssets', hl: true },
      { label: 'Receivables', key: 'receivables' },
      { label: 'Inventory', key: 'inventory' },
      { label: 'Cash & Bank', key: 'cashAndBank' },
    ];
    buildFinancialTable(tblHost, periods, lineItems, bs);
    pane.appendChild(tblHost);
  }

  // ─── Cash Flow ───────────────────────────────────────────────────
  function renderCashFlow(d, a) {
    const pane = document.getElementById('tab-cashflow');
    if (!pane) return;
    pane.innerHTML = '';
    const cf = d.annual.cashFlow;
    const is = d.annual.incomeStatement;
    const periods = d.annual.periods;
    const m = a?.metrics;

    // Insights
    const insightsDiv = ce('div');
    const insights = buildCashFlowInsights(d, m);
    insights.forEach(text => { const b = ce('div', 'insight-block'); b.innerHTML = text; insightsDiv.appendChild(b); });
    pane.appendChild(insightsDiv);

    // Charts
    const chartsRow = ce('div', 'charts-grid');
    const c1 = ce('div'), c2 = ce('div');
    chartsRow.appendChild(c1); chartsRow.appendChild(c2);
    pane.appendChild(chartsRow);
    const C = window.FinAnalyzer.Charts;
    if (C) {
      C.renderCashFlowChart(c1, { periods, ...cf });
      C.renderOCFvsProfitChart(c2, { periods, operatingCashFlow: cf.operatingCashFlow || [], netProfit: is.netProfit || [] });
    }

    // Data Table
    const tblHost = ce('div', 'card');
    tblHost.style.marginTop = '24px';
    tblHost.innerHTML = '<h3 style="margin-bottom:12px;">Detailed Data</h3>';
    const lineItems = [
      { label: 'Cash from Operations', key: 'operatingCashFlow', hl: true },
      { label: 'Cash from Investing', key: 'investingCashFlow' },
      { label: 'Cash from Financing', key: 'financingCashFlow' },
      { label: 'Net Cash Flow', key: 'netCashFlow', hl: true },
    ];
    buildFinancialTable(tblHost, periods, lineItems, cf);
    pane.appendChild(tblHost);
  }

  // ─── Red Flags ───────────────────────────────────────────────────
  function renderRedFlags(d, a) {
    const pane = document.getElementById('tab-redflags');
    if (!pane || !a) return;
    pane.innerHTML = '';

    const flags = a.redFlags || [];

    // Summary bar
    const crit = flags.filter(f => f.severity === 'critical').length;
    const warn = flags.filter(f => f.severity === 'warning').length;
    const info = flags.filter(f => f.severity === 'info').length;

    const summary = ce('div', 'card');
    summary.style.marginBottom = '24px';
    summary.innerHTML = `
      <h3 style="margin-bottom:16px;">Risk Assessment Summary</h3>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;"><span class="badge badge-critical" style="font-size:1.1rem;padding:6px 16px;">🔴 ${crit} Critical</span></div>
        <div style="display:flex;align-items:center;gap:8px;"><span class="badge badge-warning" style="font-size:1.1rem;padding:6px 16px;">🟡 ${warn} Warning</span></div>
        <div style="display:flex;align-items:center;gap:8px;"><span class="badge badge-info" style="font-size:1.1rem;padding:6px 16px;">🔵 ${info} Info</span></div>
      </div>`;
    pane.appendChild(summary);

    if (flags.length === 0) {
      const noFlags = ce('div', 'card');
      noFlags.innerHTML = '<div style="text-align:center;padding:40px;"><h3 style="color:var(--positive-green);">✅ No Red Flags Detected</h3><p class="text-secondary" style="margin-top:8px;">The financial statements appear clean on all 15 automated checks. This doesn\'t guarantee there are no issues — always cross-reference with qualitative factors.</p></div>';
      pane.appendChild(noFlags);
      return;
    }

    // Flag cards — sorted critical > warning > info
    const order = { critical: 0, warning: 1, info: 2 };
    const sorted = [...flags].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

    const grid = ce('div', 'redflag-grid');
    sorted.forEach(f => {
      const card = ce('div', `redflag-card severity-${f.severity}`);
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge badge-${f.severity}">${f.severity.toUpperCase()}</span>
          <strong>${f.title}</strong>
        </div>
        <p style="margin:8px 0 0;line-height:1.6;">${f.description}</p>
        ${f.yearsAffected ? `<p class="text-small text-secondary" style="margin-top:6px;">📅 Affected: ${f.yearsAffected.join(' → ')}</p>` : ''}
        <div class="insight-block" style="margin-top:10px;margin-bottom:0;padding:10px 14px;">
          <strong class="text-small">💡 Suggestion:</strong>
          <p class="text-small" style="margin:2px 0 0;">${f.suggestion}</p>
        </div>`;
      grid.appendChild(card);
    });
    pane.appendChild(grid);

    // Research Directions
    if (a.researchDirections && a.researchDirections.length) {
      const rdSection = ce('div', 'card');
      rdSection.style.marginTop = '24px';
      rdSection.innerHTML = '<h3 style="margin-bottom:16px;">🔍 Recommended Research Directions</h3>';
      a.researchDirections.forEach(rd => {
        const block = ce('div', 'insight-block');
        const priorityBadge = rd.priority === 'high' ? 'badge-critical' : rd.priority === 'medium' ? 'badge-warning' : 'badge-info';
        block.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span class="badge ${priorityBadge}">${rd.priority.toUpperCase()}</span>
            <strong>${rd.title}</strong>
          </div>
          <p class="text-small">${rd.description}</p>
          <p class="text-small text-secondary" style="margin-top:6px;"><em>📚 ${rd.sources.join(' · ')}</em></p>`;
        rdSection.appendChild(block);
      });
      pane.appendChild(rdSection);
    }
  }

  // ─── Forecast ────────────────────────────────────────────────────
  function renderForecast(d, a) {
    const pane = document.getElementById('tab-forecast');
    if (!pane) return;
    pane.innerHTML = '';

    const fc = a?.forecasts;
    if (!fc) {
      pane.innerHTML = '<div class="card" style="text-align:center;padding:40px;"><h3>Insufficient Data for Forecasting</h3><p class="text-secondary">At least 5 years of historical data is needed.</p></div>';
      return;
    }

    // Disclaimer
    const disc = ce('div', 'insight-block');
    disc.style.borderLeftColor = 'var(--warning-amber)';
    disc.innerHTML = '<strong>⚠ Disclaimer:</strong> Forecasts are mechanical projections based on historical data. They do not account for future events, management changes, or market conditions. Use as directional guidance only.';
    pane.appendChild(disc);

    // Scenario Cards
    if (fc.revenue && fc.revenue.scenarios) {
      const scenGrid = ce('div', 'scenario-grid');
      const scenarios = [
        { key: 'bull', label: '🟢 Bull Case', cls: 'scenario-bull', data: fc.revenue.scenarios.bull },
        { key: 'base', label: '🔵 Base Case', cls: 'scenario-base', data: fc.revenue.scenarios.base },
        { key: 'bear', label: '🔴 Bear Case', cls: 'scenario-bear', data: fc.revenue.scenarios.bear },
      ];
      scenarios.forEach(s => {
        const card = ce('div', `scenario-card ${s.cls}`);
        card.innerHTML = `
          <h4>${s.label}</h4>
          <p style="font-size:1.5rem;font-weight:700;margin:8px 0;">${s.data.growth != null ? s.data.growth + '% YoY' : 'N/A'}</p>
          <p class="text-small text-secondary">Revenue growth rate</p>
          <div style="margin-top:12px;">
            ${(fc.forecastPeriods || []).map((p, i) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-color);"><span class="text-small">${p}</span><span class="text-small" style="font-weight:600;">${fINR(s.data.values[i])}</span></div>`).join('')}
          </div>`;
        scenGrid.appendChild(card);
      });
      pane.appendChild(scenGrid);
    }

    // Forecast Charts
    const chartsRow = ce('div', 'charts-grid');
    const C = window.FinAnalyzer.Charts;
    if (C && fc.revenue) {
      const c1 = ce('div');
      chartsRow.appendChild(c1);
      C.renderForecastChart(c1, {
        title: 'Revenue Forecast',
        historicalPeriods: d.annual.periods,
        historicalValues: d.annual.incomeStatement.sales || [],
        forecastPeriods: fc.forecastPeriods,
        regression: fc.revenue.regression,
        scenarios: fc.revenue.scenarios,
      });
    }
    if (C && fc.netProfit) {
      const c2 = ce('div');
      chartsRow.appendChild(c2);
      C.renderForecastChart(c2, {
        title: 'Net Profit Forecast',
        historicalPeriods: d.annual.periods,
        historicalValues: d.annual.incomeStatement.netProfit || [],
        forecastPeriods: fc.forecastPeriods,
        regression: fc.netProfit.regression,
        scenarios: fc.netProfit.scenarios,
      });
    }
    pane.appendChild(chartsRow);

    // Regression Details Table
    if (fc.revenue && fc.revenue.regression) {
      const tblCard = ce('div', 'card');
      tblCard.style.marginTop = '24px';
      tblCard.innerHTML = `<h3 style="margin-bottom:12px;">Regression Forecast Details</h3>
        <p class="text-small text-secondary" style="margin-bottom:12px;">R² = ${fc.revenue.regression.r2 ?? 'N/A'} (${fc.revenue.regression.r2 > 0.8 ? 'Strong fit' : fc.revenue.regression.r2 > 0.5 ? 'Moderate fit' : 'Weak fit'})</p>`;
      let tbl = '<table class="data-table"><thead><tr><th style="text-align:left;">Period</th><th>Revenue</th><th>Lower (95%)</th><th>Upper (95%)</th></tr></thead><tbody>';
      fc.revenue.regression.nextYears.forEach(y => {
        tbl += `<tr><td style="text-align:left;">${y.period}</td><td>${fINR(y.value)}</td><td>${fINR(y.lower)}</td><td>${fINR(y.upper)}</td></tr>`;
      });
      tbl += '</tbody></table>';
      tblCard.innerHTML += tbl;
      pane.appendChild(tblCard);
    }

    // OPM Mean Reversion
    if (fc.opm && fc.opm.meanReversion) {
      const opmCard = ce('div', 'card');
      opmCard.style.marginTop = '16px';
      opmCard.innerHTML = `<h3 style="margin-bottom:12px;">OPM Mean Reversion Forecast</h3>
        <p class="text-small text-secondary">Projecting 50% annual reversion toward 5Y average of ${fPct(fc.opm.average5Y)}</p>`;
      let tbl = '<table class="data-table"><thead><tr><th style="text-align:left;">Period</th><th>Projected OPM</th></tr></thead><tbody>';
      fc.opm.meanReversion.forEach(y => {
        tbl += `<tr><td style="text-align:left;">${y.period}</td><td>${fPct(y.value)}</td></tr>`;
      });
      tbl += '</tbody></table>';
      opmCard.innerHTML += tbl;
      pane.appendChild(opmCard);
    }
  }

  // ─── Quarterly ───────────────────────────────────────────────────
  function renderQuarterly(d, a) {
    const pane = document.getElementById('tab-quarterly');
    if (!pane) return;
    pane.innerHTML = '';

    const qa = a?.quarterlyAnalysis;
    if (!qa || !qa.available) {
      pane.innerHTML = '<div class="card" style="text-align:center;padding:40px;"><h3>No Quarterly Data Available</h3><p class="text-secondary" style="margin-top:8px;">The uploaded file does not contain quarterly financial data. This is common with some Screener.in exports — try downloading a file that includes quarterly numbers.</p></div>';
      return;
    }

    // Insights
    if (qa.insights && qa.insights.length) {
      const iDiv = ce('div');
      qa.insights.forEach(text => { const b = ce('div', 'insight-block'); b.innerHTML = text; iDiv.appendChild(b); });
      pane.appendChild(iDiv);
    }

    // QoQ Growth Table
    if (qa.qoqGrowth && qa.qoqGrowth.length) {
      const card = ce('div', 'card');
      card.innerHTML = '<h3 style="margin-bottom:12px;">Quarter-over-Quarter Growth</h3>';
      let tbl = '<table class="data-table"><thead><tr><th style="text-align:left;">Quarter</th><th>Revenue Growth</th><th>Profit Growth</th></tr></thead><tbody>';
      qa.qoqGrowth.forEach(q => {
        tbl += `<tr><td style="text-align:left;">${q.period}</td><td class="${(q.revenueGrowth || 0) >= 0 ? 'positive' : 'negative'}">${fPct(q.revenueGrowth)}</td><td class="${(q.profitGrowth || 0) >= 0 ? 'positive' : 'negative'}">${fPct(q.profitGrowth)}</td></tr>`;
      });
      tbl += '</tbody></table>';
      card.innerHTML += tbl;
      pane.appendChild(card);
    }

    // YoY Quarterly Growth
    if (qa.yoyQuarterlyGrowth && qa.yoyQuarterlyGrowth.length) {
      const card = ce('div', 'card');
      card.style.marginTop = '16px';
      card.innerHTML = '<h3 style="margin-bottom:12px;">Year-over-Year Quarterly Growth</h3>';
      let tbl = '<table class="data-table"><thead><tr><th style="text-align:left;">Quarter</th><th>Revenue YoY</th><th>Profit YoY</th></tr></thead><tbody>';
      qa.yoyQuarterlyGrowth.forEach(q => {
        tbl += `<tr><td style="text-align:left;">${q.period}</td><td class="${(q.revenueGrowth || 0) >= 0 ? 'positive' : 'negative'}">${fPct(q.revenueGrowth)}</td><td class="${(q.profitGrowth || 0) >= 0 ? 'positive' : 'negative'}">${fPct(q.profitGrowth)}</td></tr>`;
      });
      tbl += '</tbody></table>';
      card.innerHTML += tbl;
      pane.appendChild(card);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  function ce(tag, cls) { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; return e; }
  function safe(arr, idx) { return arr && arr[idx] != null ? arr[idx] : null; }
  function fINR(v) { if (v == null || isNaN(v)) return '—'; return '₹ ' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr.'; }
  function fPct(v) { if (v == null || isNaN(v)) return '—'; return Number(v).toFixed(2) + '%'; }
  function fNum(v) { if (v == null || isNaN(v)) return '—'; return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

  // ─── Financial Table Builder ──────────────────────────────────
  function buildFinancialTable(host, periods, lineItems, dataObj) {
    let html = '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Line Item</th>';
    periods.forEach(p => { html += `<th>${p}</th>`; });
    html += '</tr></thead><tbody>';

    lineItems.forEach(item => {
      const vals = dataObj[item.key] || [];
      const hl = item.hl ? ' highlight-row' : '';
      html += `<tr class="${hl}"><td>${item.label}</td>`;
      vals.forEach(v => {
        const formatted = item.fmt === 'pct' ? fPct(v) : item.fmt === 'num' ? fNum(v) : fINR(v);
        const cls = (typeof v === 'number' && v < 0) ? ' class="negative"' : '';
        html += `<td${cls}>${formatted}</td>`;
      });
      // Pad missing columns
      for (let i = vals.length; i < periods.length; i++) html += '<td>—</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    host.innerHTML += html;
  }

  function buildGrowthTable(host, periods, items) {
    // Growth has one fewer entry than periods (no growth for first period)
    let html = '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Metric</th>';
    periods.forEach((p, i) => { if (i > 0) html += `<th>${p}</th>`; });
    html += '</tr></thead><tbody>';
    items.forEach(item => {
      html += `<tr><td>${item.label}</td>`;
      item.data.forEach(v => {
        const cls = v != null ? (v >= 0 ? 'positive' : 'negative') : '';
        html += `<td class="${cls}">${fPct(v)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    host.innerHTML += html;
  }

  // ─── Insight Generators ──────────────────────────────────────────
  function buildIncomeInsights(d, m) {
    const out = [];
    if (m?.growth?.revenueCAGR5Y?.value != null) out.push(`📈 <strong>Revenue</strong> has grown at a <strong>${m.growth.revenueCAGR5Y.value}% CAGR</strong> over the last 5 years.`);
    else if (m?.growth?.revenueCAGR3Y?.value != null) out.push(`📈 <strong>Revenue</strong> has grown at a <strong>${m.growth.revenueCAGR3Y.value}% CAGR</strong> over the last 3 years.`);
    if (m?.margins?.opmLatest != null && m?.margins?.opmAvg5Y != null) {
      const dir = m.margins.opmLatest > m.margins.opmAvg5Y ? 'above' : 'below';
      out.push(`📊 Operating margin is currently <strong>${fPct(m.margins.opmLatest)}</strong>, ${dir} the 5-year average of ${fPct(m.margins.opmAvg5Y)}.`);
    }
    if (m?.margins?.marginExpanding) out.push(`✅ Margins are <strong>expanding</strong> — a positive sign of pricing power or operating leverage.`);
    else if (m?.margins?.marginExpanding === false) out.push(`⚠️ Margins are <strong>compressing</strong> — investigate rising input costs or competitive pressure.`);

    const is = d.annual.incomeStatement;
    const pbt = is.profitBeforeTax;
    const oi = is.otherIncome;
    if (pbt && oi && pbt.length && oi.length) {
      const lastPbt = pbt[pbt.length - 1];
      const lastOi = oi[oi.length - 1];
      if (lastPbt > 0 && lastOi > 0) {
        const pct = ((lastOi / lastPbt) * 100).toFixed(1);
        out.push(`💡 Other income constitutes <strong>${pct}%</strong> of PBT — ${pct > 20 ? 'high dependency, check sustainability' : 'within normal range'}.`);
      }
    }
    if (out.length === 0) out.push('ℹ️ Insufficient data to generate detailed income statement insights.');
    return out;
  }

  function buildBalanceInsights(d, m) {
    const out = [];
    if (m?.balanceSheet?.debtToEquityLatest != null) {
      const de = m.balanceSheet.debtToEquityLatest;
      out.push(`🏦 Debt-to-Equity ratio is <strong>${de.toFixed(2)}</strong> — ${de < 0.5 ? 'conservatively leveraged' : de < 1 ? 'moderate leverage' : de < 2 ? 'high leverage' : 'very highly leveraged'}.`);
    }
    const rcv = m?.balanceSheet?.receivableDays;
    if (rcv && rcv.length >= 2) {
      const latest = rcv[rcv.length - 1].value;
      if (latest != null) out.push(`📦 Receivable days: <strong>${latest.toFixed(0)} days</strong>. ${latest > 90 ? '⚠️ High — potential collection risk.' : 'Within acceptable range.'}`);
    }
    const inv = m?.balanceSheet?.inventoryDays;
    if (inv && inv.length >= 2) {
      const latest = inv[inv.length - 1].value;
      if (latest != null) out.push(`🏭 Inventory days: <strong>${latest.toFixed(0)} days</strong>.`);
    }
    if (out.length === 0) out.push('ℹ️ Balance sheet data is limited for this company.');
    return out;
  }

  function buildCashFlowInsights(d, m) {
    const out = [];
    if (m?.cashFlow?.fcfTrend) out.push(`💰 Free Cash Flow trend: <strong>${m.cashFlow.fcfTrend}</strong>.`);
    if (m?.cashFlow?.cumulativeFCF != null) out.push(`📊 Cumulative FCF over available period: <strong>${fINR(m.cashFlow.cumulativeFCF)}</strong>.`);
    if (m?.cashFlow?.selfFunding != null) out.push(m.cashFlow.selfFunding ? '✅ The company is <strong>self-funding</strong> — cumulative FCF exceeds cumulative dividends.' : '⚠️ Cumulative dividends exceed cumulative FCF — company may be funding payouts with debt.');
    const ocfPat = m?.cashFlow?.ocfToNetProfit;
    if (ocfPat && ocfPat.length) {
      const latest = ocfPat[ocfPat.length - 1].value;
      if (latest != null) out.push(`🔍 OCF/Net Profit ratio: <strong>${latest.toFixed(2)}</strong>. ${latest >= 0.8 ? 'Healthy cash conversion.' : latest >= 0.5 ? 'Moderate — some accruals not converting to cash.' : '⚠️ Poor — earnings quality concern.'}`);
    }
    if (out.length === 0) out.push('ℹ️ Cash flow data is limited.');
    return out;
  }

  // ─── Toast & Loading ──────────────────────────────────────────
  function showError(msg) {
    if (el.errorToast && el.errorMsg) {
      el.errorMsg.textContent = msg;
      el.errorToast.style.display = 'block';
      setTimeout(() => { el.errorToast.style.display = 'none'; }, 6000);
    } else {
      alert(msg);
    }
  }
  function showLoading() { if (el.loading) el.loading.style.display = 'flex'; }
  function hideLoading() { if (el.loading) el.loading.style.display = 'none'; }

  function resetApp() {
    if (window.FinAnalyzer.Charts) window.FinAnalyzer.Charts.destroyAllCharts();
    window.FinAnalyzer.parsedData = null;
    window.FinAnalyzer.analysis = null;
    renderedTabs.clear();
    el.panes.forEach(p => p.innerHTML = '');
    if (el.sections) el.sections.style.display = 'none';
    if (el.header) el.header.style.display = 'none';
    if (el.upload) el.upload.style.display = 'flex';
    if (el.fileInput) el.fileInput.value = '';
  }

})();
