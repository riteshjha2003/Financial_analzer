// parser.js
// Handles reading and parsing Excel exports from Screener.in
// Attaches to window.FinAnalyzer

window.FinAnalyzer = window.FinAnalyzer || {};

window.FinAnalyzer.parseExcel = function(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();

      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          // XLSX should be available globally via SheetJS
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          
          // Find the data sheet
          let sheetName = workbook.SheetNames.find(n => 
            n.toLowerCase().includes('data sheet') || n.toLowerCase() === 'data'
          );
          if (!sheetName) {
            sheetName = workbook.SheetNames[0]; // fallback to first sheet
          }
          
          const sheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          
          if (!rawData || rawData.length === 0) {
            throw new Error("Could not identify financial data in this file (empty sheet).");
          }

          const parsedData = processRawData(rawData, file.name, sheetName);
          resolve(parsedData);
        } catch (error) {
          console.error("Parsing error:", error);
          reject(error instanceof Error ? error.message : "Error parsing Excel file. Please ensure it's a valid Screener.in export.");
        }
      };

      reader.onerror = function(error) {
        console.error("FileReader error:", error);
        reject("Failed to read the file.");
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      reject("Initialization error: " + error.message);
    }
  });
};

// --- Helper Functions ---

function processRawData(rows, fileName, sheetName) {
  // Label mappings
  const LABEL_MAP = {
    incomeStatement: {
      sales: ['sales', 'revenue', 'total revenue', 'income from operations', 'net sales', 'sales +'],
      expenses: ['expenses', 'total expenses', 'expenditure', 'expenses +'],
      operatingProfit: ['operating profit', 'ebit', 'operating income', 'operating profit +'],
      opm: ['opm %', 'opm', 'operating profit margin', 'operating margin'],
      otherIncome: ['other income', 'non-operating income', 'other income +'],
      depreciation: ['depreciation', 'depreciation & amortization', 'depreciation and amortisation'],
      interest: ['interest', 'finance cost', 'finance costs', 'interest cost'],
      profitBeforeTax: ['profit before tax', 'pbt', 'profit before exceptional items and tax'],
      taxPercent: ['tax %', 'tax', 'tax rate', 'income tax'],
      netProfit: ['net profit', 'profit after tax', 'pat', 'net income', 'net profit +'],
      eps: ['eps in rs', 'eps', 'eps (rs)', 'basic eps', 'earnings per share'],
      dividendPayout: ['dividend payout %', 'dividend payout', 'payout %'],
      // Itemised annual cost lines — Screener's annual P&L section usually breaks
      // expenses into these instead of giving one aggregate "Expenses" row.
      // Not used directly by the analyzer; only used to derive operatingProfit below.
      rawMaterialCost: ['raw material cost', 'cost of materials consumed'],
      changeInInventory: ['change in inventory', 'changes in inventories'],
      powerAndFuel: ['power and fuel', 'power & fuel'],
      otherMfrExp: ['other mfr. exp', 'other mfr exp', 'other manufacturing expenses'],
      employeeCost: ['employee cost', 'employee benefit expenses', 'employee benefit expense'],
      sellingAndAdmin: ['selling and admin', 'selling and distribution expenses', 'administrative expenses'],
      otherExpensesLine: ['other expenses']
    },
    balanceSheet: {
      equityCapital: ['equity capital', 'share capital', 'equity share capital'],
      reserves: ['reserves', 'reserves & surplus', 'reserves and surplus'],
      borrowings: ['borrowings', 'total borrowings', 'long term borrowings', 'short term borrowings'],
      otherLiabilities: ['other liabilities', 'other liabilities +', 'other current liabilities', 'current liabilities'],
      totalLiabilities: ['total liabilities', 'total'],
      fixedAssets: ['fixed assets', 'net block', 'net fixed assets', 'fixed assets +'],
      cwip: ['cwip', 'capital work in progress'],
      investments: ['investments', 'non-current investments'],
      otherAssets: ['other assets', 'other assets +', 'other current assets'],
      totalAssets: ['total assets', 'total'],
      receivables: ['receivables', 'trade receivables', 'debtors', 'sundry debtors'],
      inventory: ['inventory', 'inventories'],
      cashAndBank: ['cash & bank', 'cash & bank balances', 'cash equivalents', 'cash and cash equivalents']
    },
    cashFlow: {
      operatingCashFlow: ['cash from operating activity', 'cash from operations', 'cfo', 'cash from operating activities +', 'cash from operating activities'],
      investingCashFlow: ['cash from investing activity', 'cash from investing', 'cfi', 'cash from investing activities +', 'cash from investing activities'],
      financingCashFlow: ['cash from financing activity', 'cash from financing', 'cff', 'cash from financing activities +', 'cash from financing activities'],
      netCashFlow: ['net cash flow', 'net cash']
    }
  };

  const result = {
    companyName: "Unknown Company",
    annual: {
      periods: [],
      incomeStatement: {},
      balanceSheet: {},
      cashFlow: {}
    },
    quarterly: {
      periods: [],
      incomeStatement: {}
    },
    ttm: {
      incomeStatement: {}
    },
    warnings: [],
    metadata: {
      fileName: fileName,
      sheetName: sheetName,
      totalYears: 0,
      totalQuarters: 0,
      parsedAt: new Date().toISOString()
    }
  };

  // Initialize keys
  for (const key in LABEL_MAP.incomeStatement) result.annual.incomeStatement[key] = [];
  for (const key in LABEL_MAP.balanceSheet) result.annual.balanceSheet[key] = [];
  for (const key in LABEL_MAP.cashFlow) result.annual.cashFlow[key] = [];
  
  for (const key in LABEL_MAP.incomeStatement) result.quarterly.incomeStatement[key] = [];

  // Find Company Name (row 0 is like: ["COMPANY NAME", "ZAGGLE PREPAID OCEAN SERVICES LTD", ...])
  result.companyName = (rows[0] && typeof rows[0][1] === 'string' && rows[0][1].trim().length > 0) ? rows[0][1].trim() : "Unknown Company";

  // Find header row (the one with periods). Screener.in labels this row "Report Date"
  // and stores the periods as real Excel dates, not text like "Mar 2023".
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    if (isReportDateRow(rows[i])) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not identify period headers (expected a 'Report Date' row). Please ensure this is a Screener.in export.");
  }

  const headerRow = rows[headerRowIndex];
  
  // Extract periods and indices
  const periodIndices = {
    annual: [],
    quarterly: [],
    ttm: -1
  };

  for (let j = 1; j < headerRow.length; j++) {
    const col = headerRow[j];
    if (typeof col === 'string' && col.trim().toUpperCase() === 'TTM') {
      periodIndices.ttm = j;
    } else if (isDateLikeCell(col)) {
      const name = formatPeriodLabel(col);
      periodIndices.annual.push({ index: j, name });
      result.annual.periods.push(name);
    }
  }
  
  result.metadata.totalYears = result.annual.periods.length;

  // The Quarters section has its own "Report Date" row directly below the annual one
  // (Screener always orders PROFIT & LOSS -> Quarters -> BALANCE SHEET -> CASH FLOW).
  let quarterlyHeaderRowIndex = -1;
  let quarterlyIndices = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    if (isReportDateRow(rows[i])) {
      quarterlyHeaderRowIndex = i;
      const row = rows[i];
      for (let j = 1; j < row.length; j++) {
        if (isDateLikeCell(row[j])) {
          const name = formatPeriodLabel(row[j]);
          quarterlyIndices.push({ index: j, name });
          result.quarterly.periods.push(name);
        }
      }
      result.metadata.totalQuarters = quarterlyIndices.length;
      break;
    }
  }

  let currentSection = 'incomeStatement'; // Default starting section
  let inQuarterlySection = false;
  
  // Parse rows
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];

    // Detect if we've entered the quarterly section
    if (quarterlyHeaderRowIndex !== -1 && i === quarterlyHeaderRowIndex) {
      inQuarterlySection = true;
      currentSection = 'incomeStatement'; // Quarterly usually only has P&L
      continue; // Skip the header row itself
    }

    // Any other "Report Date" row after that means we've moved back into an
    // annual section (Balance Sheet / Cash Flow), which uses the annual
    // column layout — without this, everything after Quarters was being
    // silently dropped because inQuarterlySection never turned back off.
    if (inQuarterlySection && isReportDateRow(row)) {
      inQuarterlySection = false;
      currentSection = 'incomeStatement';
      continue; // Skip the header row itself
    }

    if (!row || !row[0] || typeof row[0] !== 'string') continue;

    const rawLabel = row[0].trim();
    const label = normalizeLabel(rawLabel);
    if (label.length === 0) continue;

    // If we're still in the annual section, detect section changes
    if (!inQuarterlySection) {
      if (LABEL_MAP.balanceSheet.equityCapital.includes(label)) {
        currentSection = 'balanceSheet';
      } else if (LABEL_MAP.cashFlow.operatingCashFlow.includes(label)) {
        currentSection = 'cashFlow';
      }
    }

    // Match label to standard key
    let matchedKey = null;
    let sectionToUse = currentSection;
    
    // Disambiguate "total"
    if (label === 'total') {
      if (currentSection === 'balanceSheet' && !inQuarterlySection) {
        if (result.annual.balanceSheet.totalLiabilities && result.annual.balanceSheet.totalLiabilities.length > 0) {
           matchedKey = 'totalAssets';
        } else {
           matchedKey = 'totalLiabilities';
        }
      }
    } else {
      matchedKey = findMatchedKey(label, LABEL_MAP[sectionToUse]);
    }

    if (matchedKey) {
      if (inQuarterlySection) {
        // Extract quarterly values
        const values = [];
        for (const qi of quarterlyIndices) {
          values.push(parseNumericValue(row[qi.index]));
        }
        result.quarterly.incomeStatement[matchedKey] = values;
      } else {
        // Extract annual values
        const values = [];
        for (const p of periodIndices.annual) {
          values.push(parseNumericValue(row[p.index]));
        }
        result.annual[sectionToUse][matchedKey] = values;

        // Extract TTM if applicable
        if (periodIndices.ttm !== -1 && sectionToUse === 'incomeStatement') {
           result.ttm.incomeStatement[matchedKey] = parseNumericValue(row[periodIndices.ttm]);
        }
      }
    }
  }

  // Gracefully derive Operating Profit (and OPM) when Screener didn't give us
  // a direct row for it — common in the annual section, which itemises costs
  // instead. Never overwrites real reported figures; only fills genuine gaps,
  // and only for periods where the inputs are actually available.
  deriveOperatingProfit(result.annual.incomeStatement, result.annual.periods, result.warnings, 'Annual');
  deriveOPM(result.annual.incomeStatement, result.warnings, 'Annual');
  deriveOperatingProfit(result.quarterly.incomeStatement, result.quarterly.periods, result.warnings, 'Quarterly');
  deriveOPM(result.quarterly.incomeStatement, result.warnings, 'Quarterly');

  // Validation
  const hasSales = result.annual.incomeStatement.sales && result.annual.incomeStatement.sales.length > 0;
  const hasNetProfit = result.annual.incomeStatement.netProfit && result.annual.incomeStatement.netProfit.length > 0;

  if (!hasSales && !hasNetProfit) {
    throw new Error("Could not identify Sales or Net Profit rows. The data might not be in the expected format.");
  }

  if (result.annual.periods.length < 3) {
    result.warnings.push(`Only found ${result.annual.periods.length} periods of data. Analysis is more effective with at least 3 years.`);
  }

  // Check for missing important fields
  if (!hasSales) result.warnings.push("Sales data is missing.");
  if (!hasNetProfit) result.warnings.push("Net Profit data is missing.");
  if (result.annual.balanceSheet.totalAssets && result.annual.balanceSheet.totalAssets.length === 0) {
    result.warnings.push("Balance Sheet data appears to be missing or incomplete.");
  }
  if (result.quarterly.periods.length === 0) {
    result.warnings.push("No quarterly data found. Quarterly analysis tab will be unavailable.");
  }

  return result;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Screener.in period columns come through as real dates (with cellDates:true) or,
// on some setups, as raw Excel serial-date numbers. Handle both.
function isDateLikeCell(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return true;
  if (typeof val === 'number' && val > 20000 && val < 60000) return true; // ~1954-2064 as Excel serials
  return false;
}

function excelSerialToDate(serial) {
  // Excel's day-0 is 1899-12-30 in the (buggy) 1900 date system SheetJS/Excel use.
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

function formatPeriodLabel(val) {
  const d = (val instanceof Date) ? val : excelSerialToDate(val);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function isReportDateRow(row) {
  return !!row && typeof row[0] === 'string' && row[0].trim().toLowerCase() === 'report date' && row.some(isDateLikeCell);
}

const EXPENSE_COMPONENT_KEYS = [
  'rawMaterialCost', 'changeInInventory', 'powerAndFuel',
  'otherMfrExp', 'employeeCost', 'sellingAndAdmin', 'otherExpensesLine'
];

function isAllEmpty(arr) {
  return !arr || arr.length === 0 || arr.every(v => v === null || v === undefined);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Derives Operating Profit = Sales - Total Expenses when the sheet doesn't
// give a direct Operating Profit or aggregate Expenses row for this section
// (typical of Screener's annual P&L, which itemises costs instead). Only
// fills genuine gaps — never overwrites a directly-reported figure — and
// only computes a period's value when the inputs needed for it are present,
// leaving the rest as null rather than guessing.
function deriveOperatingProfit(incomeStatement, periods, warnings, label) {
  if (!isAllEmpty(incomeStatement.operatingProfit)) return; // already have real data

  const sales = incomeStatement.sales || [];
  if (isAllEmpty(sales)) return; // nothing to derive from

  const n = periods.length;

  // Prefer an aggregate "Expenses" row if the sheet had one
  if (!isAllEmpty(incomeStatement.expenses)) {
    const expenses = incomeStatement.expenses;
    const derived = [];
    for (let i = 0; i < n; i++) {
      const s = sales[i], e = expenses[i];
      derived.push((s != null && e != null) ? round2(s - e) : null);
    }
    if (!isAllEmpty(derived)) {
      incomeStatement.operatingProfit = derived;
      warnings.push(`${label} Operating Profit was derived as Sales minus Expenses (Screener did not report it directly for this section).`);
    }
    return;
  }

  // Otherwise sum whichever itemised cost lines were actually found in the sheet
  const foundComponents = EXPENSE_COMPONENT_KEYS.filter(k => !isAllEmpty(incomeStatement[k]));
  if (foundComponents.length === 0) return; // nothing to derive from — leave as-is

  const derived = [];
  for (let i = 0; i < n; i++) {
    const s = sales[i];
    if (s == null) { derived.push(null); continue; }
    let total = 0;
    let sawComponent = false;
    for (const k of foundComponents) {
      const v = incomeStatement[k][i];
      if (v != null) { total += v; sawComponent = true; }
    }
    derived.push(sawComponent ? round2(s - total) : null);
  }

  if (!isAllEmpty(derived)) {
    incomeStatement.operatingProfit = derived;
    warnings.push(`${label} Operating Profit was derived as Sales minus itemised cost lines (Raw Material, Employee Cost, etc.), since Screener's export doesn't include a direct Operating Profit row for this section.`);
  }
}

// Derives OPM % = Operating Profit / Sales * 100 only when it's missing and
// we have both inputs; never overwrites a directly-reported figure.
function deriveOPM(incomeStatement, warnings, label) {
  if (!isAllEmpty(incomeStatement.opm)) return;
  const sales = incomeStatement.sales || [];
  const op = incomeStatement.operatingProfit || [];
  if (isAllEmpty(sales) || isAllEmpty(op)) return;

  const derived = sales.map((s, i) => {
    const o = op[i];
    if (s == null || s === 0 || o == null) return null;
    return round2((o / s) * 100);
  });

  if (!isAllEmpty(derived)) {
    incomeStatement.opm = derived;
  }
}

function normalizeLabel(label) {
  return label.toLowerCase().replace(/\+/g, '').replace(/\s+/g, ' ').trim();
}

function findMatchedKey(normalizedLabel, sectionMap) {
  for (const key in sectionMap) {
    if (sectionMap[key].includes(normalizedLabel)) {
      return key;
    }
  }
  return null;
}

function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    let cleanStr = val.replace(/,/g, '').trim();
    if (cleanStr === '' || cleanStr === '-') return null;
    
    // Handle negatives in parentheses e.g. (123.45)
    if (cleanStr.startsWith('(') && cleanStr.endsWith(')')) {
      cleanStr = '-' + cleanStr.substring(1, cleanStr.length - 1);
    }
    
    // Handle percentages
    if (cleanStr.endsWith('%')) {
      cleanStr = cleanStr.substring(0, cleanStr.length - 1);
    }
    
    const num = parseFloat(cleanStr);
    return isNaN(num) ? null : num;
  }
  return null;
}
