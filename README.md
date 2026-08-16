# Financial Statement Analyzer

A client-side tool that turns a [Screener.in](https://www.screener.in) Excel export into a full research read — growth trends, margins, balance sheet health, cash flow quality, automated red flags, and 3-year forecasts. No server, no sign-up, no data leaves your browser.

**Live demo:** [yourusername.github.io/financial-analyzer](#) <!-- replace with your actual GitHub Pages link -->

## What it does

Upload a company's Screener.in data sheet (`.xlsx`) and instantly get:

- **Overview** — a single 0–100 Health Score and letter grade (A+ to F), built from five equally-weighted pillars: Growth, Profitability, Balance Sheet Strength, Cash Flow Quality, and Consistency & Governance
- **Income Statement** — Revenue/Profit/EPS CAGR (3Y, 5Y, 10Y), Year-on-Year growth, Operating & Net Profit Margins
- **Balance Sheet** — Debt-to-Equity, Current Ratio, Fixed Asset Turnover, Receivable/Inventory Days, Cash % of Assets, CWIP % of Fixed Assets, Book Value per Share
- **Cash Flow** — OCF ÷ Net Profit (earnings quality), Free Cash Flow, Cash Conversion Ratio, a Self-Funding check on dividends
- **Red Flags** — 11 automated checks across earnings quality, margins, receivables/inventory, leverage, and capital allocation, each flagged Critical / Warning / Info
- **Forecast** — 3-year projections via linear regression, CAGR extrapolation, and Bull/Base/Bear scenarios
- **Quarterly** — QoQ and YoY quarterly growth, margin trends, and auto-generated insights

## How to use it

1. Open the [live demo](#) <!-- replace with your link -->
2. Go to [Screener.in](https://www.screener.in), open any company page, and export its data sheet as Excel
3. Drop the `.xlsx` file into the tool
4. Explore the tabs — Overview, Income Statement, Balance Sheet, Cash Flow, Red Flags, Forecast, Quarterly

## Tech stack

Plain HTML, CSS, and JavaScript — no framework, no build step, no backend.

- [SheetJS](https://sheetjs.com) — parses the Excel file directly in the browser
- [Chart.js](https://www.chartjs.org) — visualizations
- [simple-statistics](https://simplestatistics.org) — regression for forecasting

Because everything runs client-side, your financial data is never uploaded or stored anywhere — it's processed entirely on your own machine and discarded when you close the tab.

## Roadmap

- **AI-powered concall transcript analysis** — surfacing evasive answers, broken guidance promises, and tone shifts in management commentary, cross-checked against the red flags already detected from the numbers
- Watchlist feature

## Disclaimer

This tool is for educational and research purposes only. It is not investment advice. All figures are derived mechanically from the uploaded data and should be independently verified before making any financial decisions.
