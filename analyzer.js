/**
 * Financial Statement Analysis Tool - Analyzer Engine
 * Computes metrics, detects red flags, generates forecasts, and scores financial health.
 */

window.FinAnalyzer = window.FinAnalyzer || {};

(function() {
  // Utility functions
  const isValid = (num) => typeof num === 'number' && !isNaN(num) && isFinite(num);
  const round = (num) => isValid(num) ? Math.round(num * 100) / 100 : null;
  
  const cagr = (startValue, endValue, years) => {
    if (!isValid(startValue) || !isValid(endValue) || !isValid(years) || years <= 0) return null;
    if (startValue <= 0) return null; // CAGR mathematically undefined for negative/zero start
    return round((Math.pow((endValue / startValue), (1 / years)) - 1) * 100);
  };

  const getYoYGrowth = (periods, values) => {
    const growth = [];
    for (let i = 1; i < values.length; i++) {
      if (isValid(values[i]) && isValid(values[i-1]) && values[i-1] !== 0) {
        growth.push({
          period: periods[i],
          value: values[i],
          growth: round(((values[i] - values[i-1]) / Math.abs(values[i-1])) * 100)
        });
      } else {
        growth.push({ period: periods[i], value: values[i], growth: null });
      }
    }
    return growth;
  };

  const average = (arr) => {
    const validVals = arr.filter(isValid);
    if (validVals.length === 0) return null;
    return round(validVals.reduce((sum, val) => sum + val, 0) / validVals.length);
  };

  const median = (arr) => {
    const validVals = arr.filter(isValid).sort((a, b) => a - b);
    if (validVals.length === 0) return null;
    const mid = Math.floor(validVals.length / 2);
    if (validVals.length % 2 === 0) {
      return round((validVals[mid - 1] + validVals[mid]) / 2);
    }
    return round(validVals[mid]);
  };

  const trend = (arr) => {
    const validPairs = [];
    for (let i = 0; i < arr.length; i++) {
      if (isValid(arr[i])) validPairs.push([i, arr[i]]);
    }
    if (validPairs.length < 2) return 'flat';
    
    try {
      const slope = ss.linearRegression(validPairs).m;
      if (slope > 0.05) return 'up';
      if (slope < -0.05) return 'down';
      return 'flat';
    } catch (e) {
      return 'volatile';
    }
  };

  const getLastNValues = (arr, n) => arr.slice(-n).filter(isValid);
  const getFirstValue = (arr, n) => {
    const slice = arr.slice(-n);
    for (let i=0; i<slice.length; i++) if(isValid(slice[i])) return slice[i];
    return null;
  };
  const getLastValue = (arr) => {
    for (let i=arr.length-1; i>=0; i--) if(isValid(arr[i])) return arr[i];
    return null;
  };


  function computeMetrics(parsedData) {
    if (!parsedData || !parsedData.annual) return null;
    const ann = parsedData.annual;
    const p = ann.periods;
    const is = ann.incomeStatement || {};
    const bs = ann.balanceSheet || {};
    const cf = ann.cashFlow || {};
    const len = p.length;

    const sales = is.sales || [];
    const netProfit = is.netProfit || [];
    const opmArr = is.opm || [];
    const npmArr = netProfit.map((np, i) => isValid(np) && isValid(sales[i]) && sales[i] !== 0 ? (np/sales[i])*100 : null);
    const eps = is.eps || [];
    const ops = is.operatingProfit || [];

    const getCagr = (arr, years) => {
      if (!arr || arr.length <= years) return { value: null, label: `Not enough data` };
      const end = getLastValue(arr);
      const start = arr[arr.length - 1 - years];
      const val = cagr(start, end, years);
      return { value: val, label: val !== null ? `${val}%` : 'N/A' };
    };

    const yoyRevenue = getYoYGrowth(p, sales);
    const yoyProfit = getYoYGrowth(p, netProfit);

    const opmLatest = getLastValue(opmArr);
    const npmLatest = getLastValue(npmArr);
    const opmAvg5Y = average(getLastNValues(opmArr, 5));
    const npmAvg5Y = average(getLastNValues(npmArr, 5));

    let marginExpanding = false;
    const recentOpm = getLastNValues(opmArr, 3);
    if (recentOpm.length >= 2 && recentOpm[recentOpm.length-1] > recentOpm[0]) {
      marginExpanding = true;
    }

    const debtToEquity = p.map((pd, i) => {
      const debt = bs.borrowings?.[i];
      const eq = (bs.equityCapital?.[i] || 0) + (bs.reserves?.[i] || 0);
      return { period: pd, value: isValid(debt) && isValid(eq) && eq !== 0 ? round(debt / eq) : null };
    });

    const currentRatio = p.map((pd, i) => {
      const currAssets = (bs.receivables?.[i]||0) + (bs.inventory?.[i]||0) + (bs.cashAndBank?.[i]||0) + ((bs.otherAssets?.[i]||0)*0.5); 
      const currLiab = ((bs.otherLiabilities?.[i]||0) * 0.8) + ((bs.borrowings?.[i]||0) * 0.2); 
      return { period: pd, value: currLiab > 0 ? round(currAssets / currLiab) : null };
    });

    const fixedAssetTurnover = p.map((pd, i) => {
      const rev = sales[i];
      const fa = bs.fixedAssets?.[i];
      return { period: pd, value: isValid(rev) && isValid(fa) && fa !== 0 ? round(rev / fa) : null };
    });

    const receivableDays = p.map((pd, i) => {
      const rev = sales[i];
      const rec = bs.receivables?.[i];
      return { period: pd, value: isValid(rev) && isValid(rec) && rev !== 0 ? round((rec / rev) * 365) : null };
    });

    const inventoryDays = p.map((pd, i) => {
      const rev = sales[i];
      const inv = bs.inventory?.[i];
      return { period: pd, value: isValid(rev) && isValid(inv) && rev !== 0 ? round((inv / rev) * 365) : null };
    });

    const cashAsPercentOfAssets = p.map((pd, i) => {
      const c = bs.cashAndBank?.[i];
      const a = bs.totalAssets?.[i];
      return { period: pd, value: isValid(c) && isValid(a) && a !== 0 ? round((c/a)*100) : null };
    });

    const cwipAsPercentOfFixedAssets = p.map((pd, i) => {
      const cwip = bs.cwip?.[i];
      const fa = bs.fixedAssets?.[i];
      return { period: pd, value: isValid(cwip) && isValid(fa) && fa !== 0 ? round((cwip/fa)*100) : null };
    });

    const reservesGrowth = getYoYGrowth(p, bs.reserves || []);

    const bookValuePerShare = p.map((pd, i) => {
      const eqCap = bs.equityCapital?.[i] || 0;
      const res = bs.reserves?.[i] || 0;
      return { period: pd, value: eqCap > 0 ? round((eqCap + res) / (eqCap / 10)) : null };
    });

    const ocfArr = cf.operatingCashFlow || [];
    const fcfArr = ocfArr.map((ocf, i) => {
      const icf = cf.investingCashFlow?.[i] || 0;
      return isValid(ocf) ? round(ocf - Math.abs(icf)) : null; // rough proxy for capex
    });
    
    const ocfToNetProfit = p.map((pd, i) => {
      const ocf = ocfArr[i];
      const np = netProfit[i];
      return { period: pd, value: isValid(ocf) && isValid(np) && np !== 0 ? round(ocf / np) : null };
    });

    const fcf = p.map((pd, i) => ({ period: pd, value: fcfArr[i] }));
    
    let fcfTrend = 'volatile';
    const recentFcf = getLastNValues(fcfArr, 5);
    if (recentFcf.length >= 3) {
      const allPos = recentFcf.every(v => v > 0);
      const allNeg = recentFcf.every(v => v < 0);
      if (allPos) fcfTrend = 'consistently positive';
      else if (allNeg) fcfTrend = 'consistently negative';
      else fcfTrend = trend(recentFcf);
    }

    const cashConversionRatio = p.map((pd, i) => {
      const ocf = ocfArr[i];
      const op = ops[i];
      return { period: pd, value: isValid(ocf) && isValid(op) && op !== 0 ? round(ocf / op) : null };
    });

    const cumulativeFCF = round(fcfArr.filter(isValid).reduce((a, b) => a + b, 0));
    
    const divPayout = is.dividendPayout || [];
    const cumulativeDividends = round(divPayout.reduce((sum, dp, i) => {
      if (isValid(dp) && isValid(netProfit[i])) return sum + (netProfit[i] * (dp/100));
      return sum;
    }, 0));

    const balanceSheetBalances = p.map((pd, i) => {
      const ta = bs.totalAssets?.[i];
      const tl = bs.totalLiabilities?.[i];
      const diff = (isValid(ta) && isValid(tl)) ? Math.abs(ta - tl) : null;
      return { period: pd, matches: diff !== null ? diff < 1 : null, diff: diff };
    });

    const intCov = p.map((pd, i) => {
      const op = ops[i];
      const interest = is.interest?.[i];
      return { period: pd, value: isValid(op) && isValid(interest) && interest > 0 ? round(op / interest) : null };
    });

    const effTax = p.map((pd, i) => {
      const tax = is.taxPercent?.[i];
      return { period: pd, value: isValid(tax) ? round(tax) : null };
    });

    return {
      growth: {
        revenueCAGR3Y: getCagr(sales, 3),
        revenueCAGR5Y: getCagr(sales, 5),
        revenueCAGR10Y: getCagr(sales, 10),
        profitCAGR3Y: getCagr(netProfit, 3),
        profitCAGR5Y: getCagr(netProfit, 5),
        opsCAGR3Y: getCagr(ops, 3),
        epsCAGR3Y: getCagr(eps, 3),
        epsCAGR5Y: getCagr(eps, 5),
        yoyRevenue,
        yoyProfit
      },
      margins: {
        opmTrend: p.map((pd, i) => ({ period: pd, value: opmArr[i] })),
        npmTrend: p.map((pd, i) => ({ period: pd, value: npmArr[i] })),
        opmLatest, npmLatest, opmAvg5Y, npmAvg5Y, marginExpanding
      },
      balanceSheet: {
        debtToEquity,
        debtToEquityLatest: debtToEquity.length ? getLastValue(debtToEquity.map(d=>d.value)) : null,
        currentRatio,
        fixedAssetTurnover,
        receivableDays,
        inventoryDays,
        cashAsPercentOfAssets,
        cwipAsPercentOfFixedAssets,
        reservesGrowth,
        bookValuePerShare
      },
      cashFlow: {
        ocfToNetProfit,
        fcf,
        fcfTrend,
        cashConversionRatio,
        cumulativeFCF,
        cumulativeDividends,
        selfFunding: cumulativeFCF > cumulativeDividends
      },
      consistency: {
        balanceSheetBalances,
        depreciationConsistency: 'Needs detailed analysis',
        interestCoverageRatio: intCov,
        effectiveTaxRate: effTax
      }
    };
  }

  function detectRedFlags(parsedData) {
    if (!parsedData || !parsedData.annual) return [];
    const flags = [];
    const p = parsedData.annual.periods;
    const is = parsedData.annual.incomeStatement || {};
    const bs = parsedData.annual.balanceSheet || {};
    const cf = parsedData.annual.cashFlow || {};
    const len = p.length;
    
    if (len < 4) return flags; // Need some history

    // 1. Revenue-Profit Divergence
    const rev = is.sales || [];
    const pat = is.netProfit || [];
    const revCAGR3 = cagr(rev[len-4], rev[len-1], 3);
    const patCAGR3 = cagr(pat[len-4], pat[len-1], 3);
    if ((revCAGR3 > 0 && patCAGR3 < 0) || (revCAGR3 > 10 && patCAGR3 <= 0)) {
      flags.push({
        id: 'revenue-profit-divergence',
        title: 'Revenue-Profit Divergence',
        severity: 'critical',
        description: `Revenue grew at ${revCAGR3}% over 3 years while Net Profit grew at ${patCAGR3}%. Indicates margin pressure or structural cost issues.`,
        metric: { current: patCAGR3, historical: revCAGR3 },
        yearsAffected: [p[len-4], p[len-1]],
        suggestion: 'Investigate cost drivers (raw materials, employee cost) and pricing power.'
      });
    }

    // 2. Margin Compression
    const opm = is.opm || [];
    const opmCur = opm[len-1];
    const opm3yr = opm[len-4];
    if (isValid(opmCur) && isValid(opm3yr) && (opm3yr - opmCur > 2)) {
      flags.push({
        id: 'margin-compression',
        title: 'Margin Compression',
        severity: 'warning',
        description: `OPM declined by ${round(opm3yr - opmCur)}% (${round((opm3yr - opmCur)*100)} bps) from 3 years ago (from ${opm3yr}% to ${opmCur}%).`,
        metric: { current: opmCur, historical: opm3yr },
        yearsAffected: [p[len-4], p[len-1]],
        suggestion: 'Check if margin drop is cyclical or structural. Analyze competitive intensity.'
      });
    }

    // 3. Earnings Quality
    const ocf = cf.operatingCashFlow || [];
    let ocfPatStreak = 0;
    for (let i = len-1; i >= len-3; i--) {
      if (isValid(ocf[i]) && isValid(pat[i]) && pat[i] > 0 && (ocf[i] / pat[i] < 0.7)) {
        ocfPatStreak++;
      } else {
        break;
      }
    }
    if (ocfPatStreak >= 2) {
      flags.push({
        id: 'earnings-quality',
        title: 'Poor Earnings Quality',
        severity: 'critical',
        description: `OCF/PAT is below 0.7 for the last ${ocfPatStreak} years. Profits are not translating to cash.`,
        metric: { current: round(ocf[len-1]/pat[len-1]), historical: null },
        yearsAffected: p.slice(-ocfPatStreak),
        suggestion: 'Investigate working capital build-up, especially receivables and inventory.'
      });
    }

    // 4. Rising Receivables
    const rec = bs.receivables || [];
    const recDays = (i) => isValid(rec[i]) && rev[i] ? (rec[i]/rev[i])*365 : null;
    const rDayCur = recDays(len-1);
    const rDay3 = recDays(len-4);
    if (rDayCur && rDay3 && rDayCur > rDay3 * 1.2 && revCAGR3 !== null && ((rDayCur-rDay3)/rDay3*100) > revCAGR3) {
      flags.push({
        id: 'rising-receivables',
        title: 'Rising Receivables',
        severity: 'warning',
        description: `Receivable days increased by ${round(((rDayCur-rDay3)/rDay3)*100)}% vs 3 years ago, outpacing revenue growth.`,
        metric: { current: round(rDayCur), historical: round(rDay3) },
        yearsAffected: [p[len-4], p[len-1]],
        suggestion: 'Check for channel stuffing or deterioration in customer credit quality.'
      });
    }

    // 5. Inventory Buildup
    const inv = bs.inventory || [];
    const invDays = (i) => isValid(inv[i]) && rev[i] ? (inv[i]/rev[i])*365 : null;
    const iDayCur = invDays(len-1);
    const iDay3 = invDays(len-4);
    if (iDayCur && iDay3 && iDayCur > iDay3 * 1.25) {
      flags.push({
        id: 'inventory-buildup',
        title: 'Inventory Buildup',
        severity: 'warning',
        description: `Inventory days increased by ${round(((iDayCur-iDay3)/iDay3)*100)}% (from ${round(iDay3)} to ${round(iDayCur)} days).`,
        metric: { current: round(iDayCur), historical: round(iDay3) },
        yearsAffected: [p[len-4], p[len-1]],
        suggestion: 'Check for slow-moving stock or raw material supply chain disruptions.'
      });
    }

    // 6. Debt Spiral
    const debt = bs.borrowings || [];
    const eq = (i) => (bs.equityCapital?.[i]||0) + (bs.reserves?.[i]||0);
    const de = (i) => isValid(debt[i]) && eq(i) ? debt[i]/eq(i) : null;
    const intCov = (i) => isValid(is.operatingProfit?.[i]) && is.interest?.[i] > 0 ? is.operatingProfit[i]/is.interest[i] : null;
    if (de(len-1) > de(len-4) && intCov(len-1) < intCov(len-4) && de(len-1) > 0.5) {
      flags.push({
        id: 'debt-spiral',
        title: 'Debt Spiral Risk',
        severity: 'critical',
        description: `D/E increased (to ${round(de(len-1))}) while Interest Coverage declined (to ${round(intCov(len-1))}) over 3 years.`,
        metric: { current: round(de(len-1)), historical: round(intCov(len-1)) },
        yearsAffected: [p[len-4], p[len-1]],
        suggestion: 'Evaluate debt maturity profile and refinancing risk.'
      });
    }

    // 7. CWIP Trap
    const cwip = bs.cwip || [];
    const fa = bs.fixedAssets || [];
    let cwipStreak = 0;
    for (let i = len-1; i >= len-3; i--) {
      if (isValid(cwip[i]) && isValid(fa[i]) && cwip[i] > (fa[i] * 0.5)) cwipStreak++;
      else break;
    }
    if (cwipStreak >= 3) {
      flags.push({
        id: 'cwip-trap',
        title: 'CWIP Trap',
        severity: 'warning',
        description: `CWIP > 50% of Fixed Assets for ${cwipStreak} consecutive years. Indicates delayed commissioning or stuck projects.`,
        metric: { current: round(cwip[len-1]/fa[len-1]*100), historical: null },
        yearsAffected: p.slice(-cwipStreak),
        suggestion: 'Check management commentary for project delays or cost overruns.'
      });
    }

    // 8. Tax Rate Anomaly
    const pbt = is.profitBeforeTax || [];
    const tax = is.taxPercent || [];
    if (pbt[len-1] > 0 && tax[len-1] < 15 && tax[len-1] >= 0) {
      flags.push({
        id: 'tax-rate-anomaly',
        title: 'Low Effective Tax Rate',
        severity: 'info',
        description: `Effective tax rate is ${tax[len-1]}% despite positive PBT.`,
        metric: { current: tax[len-1], historical: null },
        yearsAffected: [p[len-1]],
        suggestion: 'Investigate tax exemptions, deferred tax assets, or special zones (SEZ) reliance.'
      });
    }

    // 9. Other Income Dependency
    const oi = is.otherIncome || [];
    if (isValid(oi[len-1]) && isValid(pbt[len-1]) && pbt[len-1] > 0 && (oi[len-1] / pbt[len-1]) > 0.2) {
      flags.push({
        id: 'other-income-dependency',
        title: 'High Other Income',
        severity: 'warning',
        description: `Other income is ${round((oi[len-1]/pbt[len-1])*100)}% of PBT. Core operations might be struggling.`,
        metric: { current: round((oi[len-1]/pbt[len-1])*100), historical: null },
        yearsAffected: [p[len-1]],
        suggestion: 'Check if other income is recurring (dividends, rent) or one-off (asset sale).'
      });
    }

    // 10. Negative FCF Streak
    const fcf = ocf.map((o, i) => isValid(o) ? o - Math.abs(cf.investingCashFlow?.[i]||0) : null);
    let negFcfStreak = 0;
    for (let i = len-1; i >= 0; i--) {
      if (fcf[i] < 0) negFcfStreak++;
      else break;
    }
    if (negFcfStreak >= 3) {
      flags.push({
        id: 'negative-fcf',
        title: 'Negative FCF Streak',
        severity: 'warning',
        description: `Free Cash Flow has been negative for ${negFcfStreak} consecutive years.`,
        metric: { current: fcf[len-1], historical: null },
        yearsAffected: p.slice(-negFcfStreak),
        suggestion: 'Assess if the capex is yielding returns (growth) or if cash is just being burnt.'
      });
    }

    // 11. Dividend > FCF
    const divPct = is.dividendPayout || [];
    const div = divPct.map((dp, i) => isValid(dp) && isValid(pat[i]) ? pat[i]*(dp/100) : 0);
    if (div[len-1] > 0 && fcf[len-1] < 0) {
      flags.push({
        id: 'dividend-funded-by-debt',
        title: 'Dividends Exceed FCF',
        severity: 'warning',
        description: `Dividends paid despite negative Free Cash Flow. Likely funded by debt or cash reserves.`,
        metric: { current: div[len-1], historical: fcf[len-1] },
        yearsAffected: [p[len-1]],
        suggestion: 'Check if dividend policy is sustainable or just to reward promoters.'
      });
    }

    // 12. Balance Sheet Mismatch
    const ta = bs.totalAssets || [];
    const tl = bs.totalLiabilities || [];
    if (isValid(ta[len-1]) && isValid(tl[len-1])) {
      const diff = Math.abs(ta[len-1] - tl[len-1]);
      if (diff > (ta[len-1] * 0.01)) { // 1% tolerance for rounding
        flags.push({
          id: 'bs-mismatch',
          title: 'Balance Sheet Mismatch',
          severity: 'critical',
          description: `Total Assets (${ta[len-1]}) ≠ Total Liabilities (${tl[len-1]}). Data might be corrupted.`,
          metric: { current: diff, historical: null },
          yearsAffected: [p[len-1]],
          suggestion: 'Verify data source for completeness.'
        });
      }
    }

    // 13. Cash Burn
    const cash = bs.cashAndBank || [];
    let cashDrop = 0;
    for (let i = len-1; i >= len-3; i--) {
      if (isValid(cash[i]) && isValid(cash[i-1]) && cash[i] < cash[i-1] && pat[i] > 0) cashDrop++;
      else break;
    }
    if (cashDrop >= 3) {
      flags.push({
        id: 'cash-burn',
        title: 'Consistent Cash Depletion',
        severity: 'warning',
        description: `Cash balance declined for ${cashDrop} years despite reporting positive net profits.`,
        metric: { current: cash[len-1], historical: cash[len-4] },
        yearsAffected: p.slice(-cashDrop),
        suggestion: 'Check where cash is locked (working capital or unyielding capex).'
      });
    }

    // 14. Promoter Dilution Signal
    const eqCap = bs.equityCapital || [];
    const eps = is.eps || [];
    if (len >= 2) {
      const eqGr = eqCap[len-1] && eqCap[len-2] ? ((eqCap[len-1]-eqCap[len-2])/eqCap[len-2])*100 : 0;
      const epsGr = eps[len-1] && eps[len-2] ? ((eps[len-1]-eps[len-2])/Math.abs(eps[len-2]))*100 : 0;
      if (eqGr > 5 && epsGr <= 0) {
        flags.push({
          id: 'equity-dilution',
          title: 'Equity Dilution',
          severity: 'warning',
          description: `Equity capital increased by ${round(eqGr)}% but EPS declined/flat by ${round(epsGr)}%. Earnings not keeping pace with dilution.`,
          metric: { current: round(eqGr), historical: round(epsGr) },
          yearsAffected: [p[len-1]],
          suggestion: 'Check if fresh equity was raised and how capital is deployed.'
        });
      }
    }

    // 15. Depreciation Anomaly
    const dep = is.depreciation || [];
    if (isValid(dep[len-1]) && isValid(fa[len-1]) && fa[len-1] > 0) {
      const depRate = (dep[len-1]/fa[len-1])*100;
      if (depRate < 3 || depRate > 20) {
        flags.push({
          id: 'depreciation-anomaly',
          title: 'Unusual Depreciation Rate',
          severity: 'info',
          description: `Depreciation is ${round(depRate)}% of Net Fixed Assets, which is unusual depending on industry.`,
          metric: { current: round(depRate), historical: null },
          yearsAffected: [p[len-1]],
          suggestion: 'Ensure management is not under-depreciating to inflate profits.'
        });
      }
    }

    return flags;
  }

  function generateForecasts(parsedData) {
    if (!parsedData || !parsedData.annual || typeof ss === 'undefined') return null;
    const p = parsedData.annual.periods;
    const is = parsedData.annual.incomeStatement || {};
    const rev = is.sales || [];
    const pat = is.netProfit || [];
    const opm = is.opm || [];
    const eps = is.eps || [];
    const len = p.length;
    if (len < 5) return null;

    const lastPeriodStr = p[len-1];
    let lastYear = parseInt(lastPeriodStr.replace(/\D/g, ''));
    if (isNaN(lastYear)) lastYear = new Date().getFullYear();
    const forecastPeriods = [`Mar ${lastYear+1}`, `Mar ${lastYear+2}`, `Mar ${lastYear+3}`];

    const generateSeriesForecast = (arr, name) => {
      if (!arr || arr.length === 0) return null;
      const dataPoints = [];
      for (let i=0; i<arr.length; i++) {
        if (isValid(arr[i])) dataPoints.push([i, arr[i]]);
      }
      if (dataPoints.length < 3) return null;

      const reg = ss.linearRegression(dataPoints);
      const regLine = ss.linearRegressionLine(reg);
      const r2 = ss.rSquared(dataPoints, regLine);
      // Compute standard error from residuals (ss doesn't have standardError)
      const residuals = dataPoints.map(d => d[1] - regLine(d[0]));
      const stdErr = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, residuals.length - 2));

      const nextReg = [1, 2, 3].map(i => {
        const val = regLine(len - 1 + i);
        return {
          period: forecastPeriods[i-1],
          value: round(val),
          lower: round(val - 1.96 * stdErr),
          upper: round(val + 1.96 * stdErr)
        };
      });

      const yoy = getYoYGrowth(p, arr).map(g=>g.growth).filter(isValid);
      const bullG = yoy.length > 0 ? ss.quantile(yoy, 0.75) : 0;
      const baseG = yoy.length > 0 ? ss.median(yoy) : 0;
      const bearG = yoy.length > 0 ? ss.quantile(yoy, 0.25) : 0;
      
      const lastVal = arr[len-1];
      const getScen = (g) => {
        let current = lastVal;
        const vals = [];
        for(let i=0; i<3; i++) {
          current = current * (1 + (g/100));
          vals.push(round(current));
        }
        return vals;
      };

      const cagrVal = cagr(arr[len-5] || arr[0], arr[len-1], Math.min(4, len-1));
      const cagrProj = [];
      let cCurr = lastVal;
      for(let i=0; i<3; i++) {
        cCurr = cCurr * (1 + (cagrVal/100));
        cagrProj.push({ period: forecastPeriods[i], value: round(cCurr) });
      }

      return {
        regression: { nextYears: nextReg, r2: round(r2) },
        cagr: { nextYears: cagrProj, basedOn: `CAGR of ${cagrVal}%` },
        scenarios: {
          bull: { growth: round(bullG), values: getScen(bullG) },
          base: { growth: round(baseG), values: getScen(baseG) },
          bear: { growth: round(bearG), values: getScen(bearG) }
        }
      };
    };

    const opmAvg = average(getLastNValues(opm, 5));
    const opmForecast = [];
    let curOpm = opm[len-1];
    for (let i=0; i<3; i++) {
      curOpm = curOpm + 0.5 * (opmAvg - curOpm); // 50% mean reversion
      opmForecast.push({ period: forecastPeriods[i], value: round(curOpm) });
    }

    return {
      revenue: generateSeriesForecast(rev, 'revenue'),
      netProfit: generateSeriesForecast(pat, 'netProfit'),
      eps: generateSeriesForecast(eps, 'eps'),
      opm: { meanReversion: opmForecast, average5Y: opmAvg },
      forecastPeriods
    };
  }

  function suggestResearch(parsedData, redFlags) {
    const suggestions = [];
    
    redFlags.forEach(flag => {
      let cat = 'Governance';
      if (flag.id.includes('margin') || flag.id.includes('revenue') || flag.id.includes('growth')) cat = 'Growth Sustainability';
      else if (flag.id.includes('debt') || flag.id.includes('cash') || flag.id.includes('spiral')) cat = 'Debt & Liquidity';
      else if (flag.id.includes('earnings') || flag.id.includes('receivable') || flag.id.includes('inventory')) cat = 'Earnings Quality';
      else if (flag.id.includes('fcf') || flag.id.includes('dividend') || flag.id.includes('cwip')) cat = 'Capital Allocation';
      
      suggestions.push({
        category: cat,
        title: `Investigate: ${flag.title}`,
        description: flag.description + " " + flag.suggestion,
        priority: flag.severity === 'critical' ? 'high' : (flag.severity === 'warning' ? 'medium' : 'low'),
        sources: ['Annual Report', 'Management Discussion & Analysis', 'Concall Transcripts']
      });
    });

    if (suggestions.length === 0) {
      suggestions.push({
        category: 'Growth Sustainability',
        title: 'Analyze Future Growth Drivers',
        description: 'Financials look clean. Focus on evaluating industry tailwinds, capacity expansions, and new product pipelines to assess future growth.',
        priority: 'medium',
        sources: ['Investor Presentations', 'Industry Reports']
      });
    }

    return suggestions;
  }

  function computeHealthScore(metrics, redFlags) {
    if (!metrics) return { score: 0, grade: 'F', components: [] };
    
    let growthScore = 50;
    const revG = metrics.growth?.revenueCAGR3Y?.value;
    const patG = metrics.growth?.profitCAGR3Y?.value;
    if (revG !== undefined && revG !== null) {
      const avgG = (revG + (patG || revG)) / 2;
      if (avgG > 15) growthScore = 95;
      else if (avgG > 10) growthScore = 80;
      else if (avgG > 5) growthScore = 65;
      else if (avgG > 0) growthScore = 45;
      else growthScore = 20;
    }

    let profitScore = 50;
    const opm = metrics.margins?.opmLatest;
    if (opm !== undefined && opm !== null) {
      if (opm > 20) profitScore = 90;
      else if (opm > 15) profitScore = 75;
      else if (opm > 10) profitScore = 55;
      else profitScore = 30;
      if (metrics.margins?.marginExpanding) profitScore = Math.min(100, profitScore + 10);
    }

    let bsScore = 50;
    const de = metrics.balanceSheet?.debtToEquityLatest;
    if (de !== undefined && de !== null) {
      if (de < 0.5) bsScore = 90;
      else if (de < 1) bsScore = 75;
      else if (de < 2) bsScore = 50;
      else bsScore = 30;
    } else {
      bsScore = 80; // Assuming zero debt if missing and no red flags
    }

    let cfScore = 50;
    const ocfPat = metrics.cashFlow?.ocfToNetProfit || [];
    const avgOcfPat = average(getLastNValues(ocfPat.map(o=>o.value), 3));
    if (avgOcfPat !== undefined && avgOcfPat !== null) {
      if (avgOcfPat > 1) cfScore = 90;
      else if (avgOcfPat > 0.8) cfScore = 75;
      else if (avgOcfPat > 0.5) cfScore = 50;
      else cfScore = 30;
    }

    let consScore = 85;
    redFlags.forEach(f => {
      if (f.severity === 'critical') consScore -= 15;
      else if (f.severity === 'warning') consScore -= 8;
      else consScore -= 3;
    });
    consScore = Math.max(0, consScore);

    const totalScore = Math.round((growthScore * 0.2) + (profitScore * 0.2) + (bsScore * 0.2) + (cfScore * 0.2) + (consScore * 0.2));
    
    let grade = 'F';
    if (totalScore >= 90) grade = 'A+';
    else if (totalScore >= 85) grade = 'A';
    else if (totalScore >= 80) grade = 'A-';
    else if (totalScore >= 75) grade = 'B+';
    else if (totalScore >= 70) grade = 'B';
    else if (totalScore >= 65) grade = 'B-';
    else if (totalScore >= 60) grade = 'C+';
    else if (totalScore >= 55) grade = 'C';
    else if (totalScore >= 50) grade = 'C-';
    else if (totalScore >= 40) grade = 'D';

    return {
      score: totalScore,
      grade,
      components: [
        { name: 'Growth', score: growthScore, weight: 0.20 },
        { name: 'Profitability', score: profitScore, weight: 0.20 },
        { name: 'Balance Sheet Strength', score: bsScore, weight: 0.20 },
        { name: 'Cash Flow Quality', score: cfScore, weight: 0.20 },
        { name: 'Consistency & Governance', score: consScore, weight: 0.20 }
      ]
    };
  }

  function analyzeQuarterly(parsedData) {
    if (!parsedData || !parsedData.quarterly || !parsedData.quarterly.periods || parsedData.quarterly.periods.length === 0) {
      return { available: false };
    }

    const q = parsedData.quarterly;
    const p = q.periods;
    const is = q.incomeStatement || {};
    const rev = is.sales || [];
    const pat = is.netProfit || [];
    const opm = is.opm || [];

    const qoqGrowth = [];
    for (let i = 1; i < p.length; i++) {
      qoqGrowth.push({
        period: p[i],
        revenueGrowth: isValid(rev[i]) && isValid(rev[i-1]) && rev[i-1] !== 0 ? round(((rev[i]-rev[i-1])/Math.abs(rev[i-1]))*100) : null,
        profitGrowth: isValid(pat[i]) && isValid(pat[i-1]) && pat[i-1] !== 0 ? round(((pat[i]-pat[i-1])/Math.abs(pat[i-1]))*100) : null
      });
    }

    const yoyQuarterlyGrowth = [];
    for (let i = 4; i < p.length; i++) {
      yoyQuarterlyGrowth.push({
        period: p[i],
        revenueGrowth: isValid(rev[i]) && isValid(rev[i-4]) && rev[i-4] !== 0 ? round(((rev[i]-rev[i-4])/Math.abs(rev[i-4]))*100) : null,
        profitGrowth: isValid(pat[i]) && isValid(pat[i-4]) && pat[i-4] !== 0 ? round(((pat[i]-pat[i-4])/Math.abs(pat[i-4]))*100) : null
      });
    }

    const marginTrend = p.map((pd, i) => {
      const npm = isValid(pat[i]) && isValid(rev[i]) && rev[i] !== 0 ? round((pat[i]/rev[i])*100) : null;
      return { period: pd, opm: opm[i] || null, npm };
    });

    const insights = [];
    if (yoyQuarterlyGrowth.length > 0) {
      const lastYoy = yoyQuarterlyGrowth[yoyQuarterlyGrowth.length-1];
      if (lastYoy.revenueGrowth > 15) insights.push(`Strong recent YoY revenue growth of ${lastYoy.revenueGrowth}% in the latest quarter.`);
      if (lastYoy.profitGrowth < 0) insights.push(`Profits contracted by ${lastYoy.profitGrowth}% YoY in the latest quarter.`);
    }

    return {
      available: true,
      seasonality: {},
      qoqGrowth,
      yoyQuarterlyGrowth,
      marginTrend,
      insights
    };
  }

  // Public API
  window.FinAnalyzer.analyze = function(parsedData) {
    try {
      const metrics = computeMetrics(parsedData);
      const redFlags = detectRedFlags(parsedData);
      return {
        metrics: metrics,
        redFlags: redFlags,
        forecasts: generateForecasts(parsedData),
        researchDirections: suggestResearch(parsedData, redFlags),
        healthScore: computeHealthScore(metrics, redFlags),
        quarterlyAnalysis: analyzeQuarterly(parsedData)
      };
    } catch (err) {
      console.error("Analysis Error:", err);
      return null;
    }
  };

})();
