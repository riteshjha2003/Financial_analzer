/**
 * charts.js — Chart Rendering Module
 * All Chart.js visualizations for the Financial Statement Analyzer.
 * Attaches to window.FinAnalyzer.Charts.
 */
window.FinAnalyzer = window.FinAnalyzer || {};

window.FinAnalyzer.Charts = (function () {
  'use strict';

  const COLORS = {
    primary: '#2563EB',
    secondary: '#7C3AED',
    positive: '#16A34A',
    negative: '#DC2626',
    warning: '#D97706',
    neutral: '#6B7280',
    light: ['#DBEAFE', '#EDE9FE', '#DCFCE7', '#FEE2E2', '#FEF3C7', '#F3F4F6'],
    series: ['#2563EB', '#7C3AED', '#059669', '#DC2626', '#D97706', '#6366F1', '#0891B2', '#BE185D']
  };

  let instances = [];

  // ─── Global Defaults ────────────────────────────────────────────
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation = { duration: 500, easing: 'easeOutQuart' };
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 14;
  }

  // ─── Utilities ──────────────────────────────────────────────────
  function destroyAllCharts() {
    instances.forEach(c => { try { c.destroy(); } catch (e) { /* ignore */ } });
    instances = [];
  }

  function makeWrapper(container, title, id) {
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrapper';
    wrap.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px;margin-bottom:20px;';

    if (title) {
      const h = document.createElement('h4');
      h.textContent = title;
      h.style.cssText = 'margin:0 0 14px 0;font-size:0.95rem;color:#374151;';
      wrap.appendChild(h);
    }

    const box = document.createElement('div');
    box.style.cssText = 'position:relative;height:320px;width:100%;';
    const canvas = document.createElement('canvas');
    canvas.id = id || `chart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    box.appendChild(canvas);
    wrap.appendChild(box);
    container.appendChild(wrap);
    return canvas;
  }

  function fmt$(v) {
    if (v == null || isNaN(v)) return '—';
    return '₹ ' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr.';
  }
  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(2) + '%';
  }
  function currencyTooltip(ctx) { return `${ctx.dataset.label}: ${fmt$(ctx.raw)}`; }

  // ═══════════════════════════════════════════════════════════════
  //  CHART RENDERERS
  // ═══════════════════════════════════════════════════════════════

  /** 1. Revenue & Net Profit — Dual-axis bar + line */
  function renderRevenueAndProfitChart(container, data) {
    const canvas = makeWrapper(container, 'Revenue & Net Profit Trend', 'ch-rev-profit');
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.periods || [],
        datasets: [
          {
            label: 'Revenue',
            data: data.sales || [],
            backgroundColor: COLORS.primary + 'CC',
            borderRadius: 4,
            yAxisID: 'y',
            order: 2
          },
          {
            label: 'Net Profit',
            data: data.netProfit || [],
            type: 'line',
            borderColor: COLORS.positive,
            backgroundColor: COLORS.positive,
            pointBackgroundColor: COLORS.positive,
            borderWidth: 2.5,
            tension: 0.3,
            yAxisID: 'y1',
            order: 1
          }
        ]
      },
      options: {
        plugins: { tooltip: { callbacks: { label: currencyTooltip } } },
        scales: {
          y: { position: 'left', title: { display: true, text: 'Revenue (₹ Cr.)' }, grid: { color: '#f1f1f1' } },
          y1: { position: 'right', title: { display: true, text: 'Profit (₹ Cr.)' }, grid: { drawOnChartArea: false } }
        }
      }
    });
    instances.push(chart);
    return chart;
  }

  /** 2. Margin Trends — OPM & NPM lines */
  function renderMarginTrendChart(container, data) {
    const npm = (data.netProfit || []).map((np, i) => {
      const s = (data.sales || [])[i];
      return (s && np != null) ? (np / s) * 100 : null;
    });
    const canvas = makeWrapper(container, 'Margin Trends (%)', 'ch-margins');
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.periods || [],
        datasets: [
          { label: 'OPM %', data: data.opm || [], borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22', fill: true, tension: 0.35 },
          { label: 'NPM %', data: npm, borderColor: COLORS.secondary, backgroundColor: COLORS.secondary + '22', fill: true, tension: 0.35 }
        ]
      },
      options: { plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtPct(ctx.raw)}` } } } }
    });
    instances.push(chart);
    return chart;
  }

  /** 3. Expense Breakdown — Stacked bars */
  function renderExpenseBreakdownChart(container, data) {
    const canvas = makeWrapper(container, 'Cost Structure Breakdown', 'ch-expenses');
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.periods || [],
        datasets: [
          { label: 'Operating Expenses', data: data.expenses || [], backgroundColor: COLORS.series[0] + 'CC', borderRadius: 2 },
          { label: 'Depreciation', data: data.depreciation || [], backgroundColor: COLORS.series[1] + 'CC', borderRadius: 2 },
          { label: 'Interest', data: data.interest || [], backgroundColor: COLORS.series[3] + 'CC', borderRadius: 2 }
        ]
      },
      options: {
        scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '₹ Cr.' } } },
        plugins: { tooltip: { callbacks: { label: currencyTooltip } } }
      }
    });
    instances.push(chart);
    return chart;
  }

  /** 4. Balance Sheet Composition — Liabilities vs Assets stacked */
  function renderBalanceSheetComposition(container, data) {
    const canvas = makeWrapper(container, 'Balance Sheet Composition', 'ch-bs');
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.periods || [],
        datasets: [
          { label: 'Equity + Reserves', data: (data.equityCapital || []).map((eq, i) => (eq || 0) + ((data.reserves || [])[i] || 0)), stack: 'Liabilities', backgroundColor: COLORS.series[0] + 'BB' },
          { label: 'Borrowings', data: data.borrowings || [], stack: 'Liabilities', backgroundColor: COLORS.series[3] + 'BB' },
          { label: 'Other Liabilities', data: data.otherLiabilities || [], stack: 'Liabilities', backgroundColor: COLORS.series[4] + 'BB' },
          { label: 'Fixed Assets + CWIP', data: (data.fixedAssets || []).map((fa, i) => (fa || 0) + ((data.cwip || [])[i] || 0)), stack: 'Assets', backgroundColor: COLORS.series[1] + 'BB' },
          { label: 'Investments', data: data.investments || [], stack: 'Assets', backgroundColor: COLORS.series[5] + 'BB' },
          { label: 'Cash & Bank', data: data.cashAndBank || [], stack: 'Assets', backgroundColor: COLORS.positive + 'BB' },
          { label: 'Other Assets', data: data.otherAssets || [], stack: 'Assets', backgroundColor: COLORS.neutral + '88' },
        ]
      },
      options: {
        scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '₹ Cr.' } } },
        plugins: { tooltip: { callbacks: { label: currencyTooltip } } }
      }
    });
    instances.push(chart);
    return chart;
  }

  /** 5. Debt / Equity Ratio — line with 1.0 reference */
  function renderDebtEquityChart(container, data) {
    const deRatio = (data.borrowings || []).map((b, i) => {
      const eq = ((data.equityCapital || [])[i] || 0) + ((data.reserves || [])[i] || 0);
      return eq > 0 ? +(b / eq).toFixed(3) : null;
    });
    const canvas = makeWrapper(container, 'Debt-to-Equity Ratio', 'ch-de');
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.periods || [],
        datasets: [{
          label: 'D/E Ratio',
          data: deRatio,
          borderColor: COLORS.warning,
          backgroundColor: COLORS.warning + '33',
          fill: true,
          tension: 0.2,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        plugins: {
          annotation: {
            annotations: {
              threshold: {
                type: 'line', yMin: 1.0, yMax: 1.0,
                borderColor: COLORS.negative + '99', borderWidth: 1.5, borderDash: [6, 4],
                label: { content: 'Threshold 1.0', display: true, position: 'start', font: { size: 11 }, color: COLORS.negative }
              }
            }
          },
          tooltip: { callbacks: { label: ctx => `D/E: ${ctx.raw != null ? ctx.raw.toFixed(2) : '—'}` } }
        }
      }
    });
    instances.push(chart);
    return chart;
  }

  /** 6. Working Capital Days */
  function renderWorkingCapitalChart(container, data) {
    const recDays = (data.receivables || []).map((r, i) => {
      const s = (data.sales || [])[i];
      return s > 0 ? +((r / s) * 365).toFixed(1) : null;
    });
    const invDays = (data.inventory || []).map((inv, i) => {
      const s = (data.sales || [])[i];
      return s > 0 ? +((inv / s) * 365).toFixed(1) : null;
    });
    const canvas = makeWrapper(container, 'Working Capital Cycle (Days)', 'ch-wc');
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.periods || [],
        datasets: [
          { label: 'Receivable Days', data: recDays, borderColor: COLORS.series[0], tension: 0.25, borderWidth: 2 },
          { label: 'Inventory Days', data: invDays, borderColor: COLORS.series[1], tension: 0.25, borderWidth: 2 }
        ]
      },
      options: { plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw != null ? ctx.raw + ' days' : '—'}` } } } }
    });
    instances.push(chart);
    return chart;
  }

  /** 7. Cash Flow Components */
  function renderCashFlowChart(container, data) {
    // Color bars based on positive/negative
    const ocfColors = (data.operatingCashFlow || []).map(v => v >= 0 ? COLORS.positive + 'CC' : COLORS.negative + 'CC');
    const icfColors = (data.investingCashFlow || []).map(v => v >= 0 ? COLORS.positive + '77' : COLORS.negative + '77');
    const fcfColors = (data.financingCashFlow || []).map(v => v >= 0 ? COLORS.primary + '77' : COLORS.warning + '77');

    const canvas = makeWrapper(container, 'Cash Flow Components', 'ch-cf');
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.periods || [],
        datasets: [
          { label: 'Operating CF', data: data.operatingCashFlow || [], backgroundColor: ocfColors, borderRadius: 3 },
          { label: 'Investing CF', data: data.investingCashFlow || [], backgroundColor: icfColors, borderRadius: 3 },
          { label: 'Financing CF', data: data.financingCashFlow || [], backgroundColor: fcfColors, borderRadius: 3 }
        ]
      },
      options: { plugins: { tooltip: { callbacks: { label: currencyTooltip } } } }
    });
    instances.push(chart);
    return chart;
  }

  /** 8. OCF vs Net Profit — dual line with gap fill */
  function renderOCFvsProfitChart(container, data) {
    const canvas = makeWrapper(container, 'Operating Cash Flow vs Net Profit', 'ch-ocf-np');
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.periods || [],
        datasets: [
          { label: 'Operating Cash Flow', data: data.operatingCashFlow || [], borderColor: COLORS.positive, backgroundColor: COLORS.positive + '25', fill: true, tension: 0.3, borderWidth: 2.5 },
          { label: 'Net Profit', data: data.netProfit || [], borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15', fill: true, tension: 0.3, borderWidth: 2.5 }
        ]
      },
      options: { plugins: { tooltip: { callbacks: { label: currencyTooltip } } } }
    });
    instances.push(chart);
    return chart;
  }

  /** 9. Forecast Chart — historical + projected with confidence bands */
  function renderForecastChart(container, data) {
    const title = data.title || 'Forecast';
    const allLabels = [...(data.historicalPeriods || []), ...(data.forecastPeriods || [])];
    const histLen = (data.historicalPeriods || []).length;
    const fcLen = (data.forecastPeriods || []).length;

    // Historical line — solid
    const histData = [...(data.historicalValues || []), ...Array(fcLen).fill(null)];

    // Regression line (forecast portion only)
    const regData = Array(histLen).fill(null);
    const upperData = Array(histLen).fill(null);
    const lowerData = Array(histLen).fill(null);
    if (data.regression && data.regression.nextYears) {
      data.regression.nextYears.forEach(y => {
        regData.push(y.value);
        upperData.push(y.upper);
        lowerData.push(y.lower);
      });
    }

    // Base scenario line
    const baseData = Array(histLen).fill(null);
    if (data.scenarios && data.scenarios.base) {
      data.scenarios.base.values.forEach(v => baseData.push(v));
    }

    const datasets = [
      {
        label: 'Historical',
        data: histData,
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primary,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3
      },
      {
        label: 'Regression Forecast',
        data: regData,
        borderColor: COLORS.secondary,
        borderWidth: 2,
        borderDash: [6, 4],
        tension: 0.2,
        pointRadius: 4,
        pointStyle: 'triangle'
      },
      {
        label: 'Upper Band (95%)',
        data: upperData,
        borderColor: COLORS.secondary + '44',
        backgroundColor: COLORS.secondary + '15',
        fill: '+1',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0
      },
      {
        label: 'Lower Band (95%)',
        data: lowerData,
        borderColor: COLORS.secondary + '44',
        backgroundColor: COLORS.secondary + '15',
        fill: '-1',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0
      }
    ];

    if (data.scenarios && data.scenarios.base) {
      datasets.push({
        label: 'Base Scenario',
        data: baseData,
        borderColor: COLORS.positive,
        borderWidth: 2,
        borderDash: [8, 4],
        tension: 0.2,
        pointRadius: 4,
        pointStyle: 'rect'
      });
    }

    const canvas = makeWrapper(container, title, `ch-forecast-${Date.now()}`);
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: allLabels, datasets },
      options: {
        plugins: {
          tooltip: { callbacks: { label: currencyTooltip } },
          annotation: {
            annotations: {
              divider: {
                type: 'line',
                xMin: histLen - 0.5, xMax: histLen - 0.5,
                borderColor: COLORS.neutral + '55',
                borderWidth: 1.5,
                borderDash: [4, 4],
                label: { content: 'Forecast →', display: true, position: 'start', font: { size: 11 }, color: COLORS.neutral }
              }
            }
          }
        },
        scales: {
          y: { title: { display: true, text: '₹ Cr.' }, grid: { color: '#f5f5f5' } }
        }
      }
    });
    instances.push(chart);
    return chart;
  }

  /** 10. Health Score Gauge — semicircular donut */
  function renderHealthScoreGauge(container, score) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;';
    container.appendChild(canvas);

    const color = score >= 70 ? COLORS.positive : score >= 50 ? COLORS.warning : COLORS.negative;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Score', 'Remaining'],
        datasets: [{
          data: [score, 100 - score],
          backgroundColor: [color, COLORS.neutral + '22'],
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        rotation: -90,
        circumference: 180,
        cutout: '78%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
    instances.push(chart);
    return chart;
  }

  /** 11. Mini Sparkline — tiny inline chart for metric cards */
  function renderMiniSparkline(container, data, color) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'height:36px;width:90px;';
    container.appendChild(canvas);
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor: color || COLORS.primary,
          borderWidth: 1.5,
          tension: 0.4,
          pointRadius: 0,
          fill: false
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        scales: { x: { display: false }, y: { display: false } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
    instances.push(chart);
    return chart;
  }

  // ─── Public API ──────────────────────────────────────────────────
  return {
    destroyAllCharts,
    renderRevenueAndProfitChart,
    renderMarginTrendChart,
    renderExpenseBreakdownChart,
    renderBalanceSheetComposition,
    renderDebtEquityChart,
    renderWorkingCapitalChart,
    renderCashFlowChart,
    renderOCFvsProfitChart,
    renderForecastChart,
    renderHealthScoreGauge,
    renderMiniSparkline
  };

})();
