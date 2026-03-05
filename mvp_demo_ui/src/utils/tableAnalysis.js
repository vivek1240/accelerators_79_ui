/**
 * Deterministic analysis of extracted tables.
 * Works with any table shape — financial, textual, generic.
 * Returns computed insights + chart-ready data so the UI can render
 * without waiting for an LLM call.
 */

function parseNumeric(v) {
  if (v == null || v === '' || v === '—') return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[$,%()]/g, '').replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '—' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pctChange(prev, curr) {
  if (prev == null || curr == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function mean(arr) {
  const nums = arr.filter((n) => n != null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(arr) {
  const nums = arr.filter((n) => n != null);
  if (nums.length < 2) return null;
  const m = mean(nums);
  const variance = nums.reduce((sum, n) => sum + (n - m) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function detectNumericColumns(rows, periodKeys) {
  if (!rows?.length || !periodKeys?.length) return [];
  let numericCounts = {};
  periodKeys.forEach((k) => { numericCounts[k] = 0; });
  rows.forEach((r) => {
    periodKeys.forEach((k) => {
      if (parseNumeric(r.values?.[k]) != null) numericCounts[k]++;
    });
  });
  return periodKeys.filter((k) => numericCounts[k] >= Math.max(1, rows.length * 0.3));
}

/**
 * Analyze a single extracted table.
 * Returns { tableType, insights[], chartData[], biggestMovers[], outliers[], distribution[] }
 */
export function analyzeTable(tbl) {
  const data = tbl.data;
  const meta = tbl.table_metadata || data?.table_metadata || {};
  const tableTitle = meta.table_title || `Page ${tbl.page_number || '?'}`;
  const tableType = meta.table_type || 'tabular';

  const result = {
    tableTitle,
    tableType,
    pageNumber: tbl.page_number,
    insights: [],
    biggestMovers: [],
    outliers: [],
    trendData: [],
    distributionData: [],
    hasNumericData: false,
  };

  if (!data) return result;

  // Normalize rows & period keys (same logic as ExtractorTables)
  let rows = [];
  let periodKeys = [];

  if (data.rows && data.rows.length) {
    rows = data.rows;
    const periods = data.periods || [];
    periodKeys = periods.map((p) =>
      typeof p === 'object' ? String(p.year ?? p.label ?? '') : String(p)
    ).filter(Boolean);
    if (!periodKeys.length && rows[0]?.values && typeof rows[0].values === 'object') {
      periodKeys = Object.keys(rows[0].values);
    }
  } else if (data.sections?.length) {
    data.sections.forEach((sec) => {
      const items = sec.items || [];
      const keys = (sec.periods || []).map((p) =>
        typeof p === 'object' ? String(p.year ?? p.label ?? '') : String(p)
      ).filter(Boolean);
      if (keys.length && !periodKeys.length) periodKeys = keys;
      items.forEach((item) => {
        rows.push({
          label: item.item_label || item.label || '',
          values: item.values || item.period_values || {},
          is_section: false,
        });
      });
    });
  }

  if (!rows.length) return result;

  const numericCols = detectNumericColumns(rows, periodKeys);
  result.hasNumericData = numericCols.length > 0;

  if (!result.hasNumericData) {
    // Text-only: count rows, list unique categories
    result.insights.push({
      type: 'info',
      text: `${rows.length} items across ${periodKeys.length || 1} column(s). This table is primarily textual.`,
    });
    return result;
  }

  // === Numeric analysis ===

  // 1. Period-over-period changes for each row
  const dataRows = rows.filter((r) => !r.is_section);
  const changes = [];

  dataRows.forEach((row) => {
    const vals = numericCols.map((k) => parseNumeric(row.values?.[k]));
    for (let i = 1; i < vals.length; i++) {
      const pct = pctChange(vals[i - 1], vals[i]);
      if (pct != null) {
        changes.push({
          label: row.label,
          from: numericCols[i - 1],
          to: numericCols[i],
          prevValue: vals[i - 1],
          currValue: vals[i],
          pctChange: pct,
          absChange: vals[i] - vals[i - 1],
        });
      }
    }
  });

  // 2. Biggest movers (top 5 by absolute % change)
  const sorted = [...changes].sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
  result.biggestMovers = sorted.slice(0, 5);

  if (result.biggestMovers.length) {
    const top = result.biggestMovers[0];
    const dir = top.pctChange > 0 ? 'increased' : 'decreased';
    result.insights.push({
      type: top.pctChange > 0 ? 'positive' : 'negative',
      text: `"${top.label}" ${dir} by ${Math.abs(top.pctChange).toFixed(1)}% from ${top.from} to ${top.to}.`,
    });
  }

  // 3. Outlier detection per column (> 2 std devs from mean)
  numericCols.forEach((col) => {
    const colVals = dataRows.map((r) => parseNumeric(r.values?.[col]));
    const m = mean(colVals);
    const sd = stdDev(colVals);
    if (m == null || sd == null || sd === 0) return;
    dataRows.forEach((r, i) => {
      const v = colVals[i];
      if (v == null) return;
      const zScore = Math.abs(v - m) / sd;
      if (zScore > 2) {
        result.outliers.push({
          label: r.label,
          column: col,
          value: v,
          mean: m,
          zScore: Math.round(zScore * 10) / 10,
        });
      }
    });
  });

  if (result.outliers.length) {
    const o = result.outliers[0];
    result.insights.push({
      type: 'warning',
      text: `"${o.label}" in ${o.column} is an outlier (${o.zScore}x standard deviations from the mean).`,
    });
  }

  // 4. Trend data for charting: each data row's values across periods
  const trendRows = dataRows.filter((r) => {
    const numNonNull = numericCols.filter((k) => parseNumeric(r.values?.[k]) != null).length;
    return numNonNull >= 2;
  });

  // Pick top 8 rows by average absolute value to avoid noisy charts
  const rowsByMagnitude = trendRows
    .map((r) => {
      const vals = numericCols.map((k) => parseNumeric(r.values?.[k])).filter((v) => v != null);
      const avg = vals.reduce((a, b) => a + Math.abs(b), 0) / (vals.length || 1);
      return { row: r, avgMag: avg };
    })
    .sort((a, b) => b.avgMag - a.avgMag)
    .slice(0, 8);

  result.trendData = numericCols.map((col) => {
    const point = { period: col };
    rowsByMagnitude.forEach(({ row }) => {
      point[row.label] = parseNumeric(row.values?.[col]);
    });
    return point;
  });
  result.trendLabels = rowsByMagnitude.map(({ row }) => row.label);

  // 5. Distribution: for the latest period, share of total across rows
  const latestCol = numericCols[numericCols.length - 1];
  if (latestCol) {
    const positiveRows = dataRows
      .map((r) => ({ label: r.label, value: parseNumeric(r.values?.[latestCol]) }))
      .filter((d) => d.value != null && d.value > 0);
    const total = positiveRows.reduce((s, d) => s + d.value, 0);
    if (total > 0) {
      result.distributionData = positiveRows
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
        .map((d) => ({
          name: d.label,
          value: d.value,
          pct: Math.round((d.value / total) * 1000) / 10,
        }));
    }
  }

  // 6. Summary insight
  const totalRows = dataRows.length;
  const growingCount = changes.filter((c) => c.pctChange > 0).length;
  const decliningCount = changes.filter((c) => c.pctChange < 0).length;
  if (growingCount + decliningCount > 0) {
    result.insights.push({
      type: 'info',
      text: `Across ${totalRows} line items and ${numericCols.length} period(s): ${growingCount} period-over-period increases, ${decliningCount} decreases.`,
    });
  }

  return result;
}

/**
 * Analyze all extracted tables and return an array of analysis results.
 */
export function analyzeAllTables(extractedTables) {
  if (!extractedTables?.length) return [];
  return extractedTables.map(analyzeTable);
}

/**
 * Build a compact summary string that can be sent to an LLM for narration.
 * Keeps token count low by only including the computed signals.
 */
export function buildAnalysisSummaryForLLM(analysis, tableData) {
  const parts = [];
  parts.push(`Table: "${analysis.tableTitle}" (type: ${analysis.tableType})`);

  if (analysis.biggestMovers.length) {
    parts.push('Biggest changes:');
    analysis.biggestMovers.slice(0, 3).forEach((m) => {
      parts.push(`  - "${m.label}": ${m.pctChange > 0 ? '+' : ''}${m.pctChange.toFixed(1)}% (${m.from} → ${m.to})`);
    });
  }
  if (analysis.outliers.length) {
    parts.push('Outliers:');
    analysis.outliers.slice(0, 3).forEach((o) => {
      parts.push(`  - "${o.label}" in ${o.column}: ${o.value} (${o.zScore}x std dev)`);
    });
  }
  if (analysis.distributionData.length) {
    parts.push(`Top items (latest period): ${analysis.distributionData.slice(0, 3).map((d) => `${d.name}: ${d.pct}%`).join(', ')}`);
  }
  return parts.join('\n');
}
