import { useState } from 'react';
import { exportExtractToExcel } from '../utils/excel';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from 'recharts';

/**
 * Extractor payload (payload_doc): data.rows = [{ label, values: { "2023": 100000 }, is_section, section_id }],
 * data.periods = [{ label, date, year }].
 * Enhanced prompt keys row.values by periods[i].label (exact header text).
 * Use label first; fall back to year string for backward compat.
 */
function getPeriodKeys(periods, sampleRow) {
  if (!periods || !periods.length) return [];
  const vals = (sampleRow && typeof sampleRow.values === 'object') ? sampleRow.values : {};
  return periods.map((p) => {
    if (typeof p === 'object' && p != null) {
      const label = typeof p.label === 'string' ? p.label.trim() : '';
      const yearStr = p.year != null ? String(p.year) : '';
      if (label && label in vals) return label;
      if (yearStr && yearStr in vals) return yearStr;
      return label || yearStr || '';
    }
    return String(p);
  }).filter(Boolean);
}

function getBackendColumnOrder(data, sampleRow) {
  const cols = Array.isArray(data?.columns) ? data.columns : [];
  const fromColumns = cols
    .map((c) => (c == null ? '' : String(c).trim()))
    .filter(Boolean);
  if (fromColumns.length) return fromColumns;

  const periods = data?.periods || [];
  const fromPeriods = getPeriodKeys(periods, sampleRow);
  if (fromPeriods.length) return fromPeriods;

  const allKeys = [];
  (data?.rows || []).forEach((r) => {
    Object.keys(r?.values || {}).forEach((k) => {
      if (!allKeys.includes(k)) allKeys.push(k);
    });
  });
  return allKeys;
}

function isEmptyUiValue(value) {
  if (value == null) return true;
  const s = String(value).replace(/<br\s*\/?>/gi, ' ').replace(/&nbsp;/gi, ' ').trim();
  if (!s) return true;
  const t = s.toLowerCase();
  return t === '-' || t === '—' || t === '–' || t === 'na' || t === 'n/a' || t === 'null' || t === 'none';
}

function filterAllEmptyColumns(periodLabels, rows) {
  return (periodLabels || []).filter((key) =>
    (rows || []).some((row) => !isEmptyUiValue(row?.values?.[key]))
  );
}

function normalizeExtractData(data) {
  if (data.rows && data.rows.length) {
    let periodKeys = getBackendColumnOrder(data, data.rows[0]);
    const firstRowKeys = data.rows[0]?.values && typeof data.rows[0].values === 'object'
      ? Object.keys(data.rows[0].values)
      : [];
    if (firstRowKeys.length > 0 && periodKeys.length > 0) {
      const hasOverlap = periodKeys.some((pk) => data.rows.some((r) => r.values && pk in (r.values || {})));
      if (!hasOverlap) {
        const allKeys = [];
        data.rows.forEach((r) => {
          Object.keys(r.values || {}).forEach((k) => { if (!allKeys.includes(k)) allKeys.push(k); });
        });
        periodKeys = allKeys;
      }
    }
    return { rows: data.rows, periodLabels: filterAllEmptyColumns(periodKeys, data.rows) };
  }
  const sections = data.sections || [];
  const periodLabels = [];
  const rows = [];
  sections.forEach((sec) => {
    const items = sec.items || [];
    const periodObjs = sec.periods || [];
    const keys = Array.isArray(sec.columns) && sec.columns.length
      ? sec.columns.map((c) => String(c).trim()).filter(Boolean)
      : getPeriodKeys(periodObjs, items[0]);
    if (keys.length) {
      if (periodLabels.length === 0) periodLabels.push(...keys);
    } else if (items[0]?.values && typeof items[0].values === 'object') {
      const firstKeys = [];
      items.forEach((item) => {
        Object.keys(item?.values || {}).forEach((k) => {
          if (!firstKeys.includes(k)) firstKeys.push(k);
        });
      });
      if (periodLabels.length === 0) periodLabels.push(...firstKeys);
    }
    items.forEach((item) => {
      const label = item.item_label || item.label || '';
      const vals = item.values || item.period_values || {};
      rows.push({ label, values: vals, is_section: false });
    });
  });
  return { rows, periodLabels: filterAllEmptyColumns(periodLabels, rows) };
}

function sanitizeDisplayText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumericValue(value) {
  const s = sanitizeDisplayText(value);
  if (!s) return null;
  if (s === '-' || s === '—' || s === '–') return null;
  const compact = s
    .replace(/[,$€£]/g, '')
    .replace(/%/g, '')
    .replace(/\(([^)]+)\)/g, '-$1')
    .replace(/\s+/g, '');
  const n = Number(compact);
  return Number.isFinite(n) ? n : null;
}

function buildChartModel(periodLabels, rows) {
  if (!Array.isArray(periodLabels) || periodLabels.length < 2 || !Array.isArray(rows) || rows.length < 2) {
    return null;
  }

  const numericStats = periodLabels.map((k) => {
    let numericCount = 0;
    let nonEmptyCount = 0;
    rows.forEach((row) => {
      const raw = row?.values?.[k];
      if (!isEmptyUiValue(raw)) nonEmptyCount += 1;
      if (toNumericValue(raw) != null) numericCount += 1;
    });
    return { key: k, numericCount, nonEmptyCount };
  });

  const numericColumns = numericStats
    .filter((s) => s.nonEmptyCount > 0 && s.numericCount / s.nonEmptyCount >= 0.6)
    .map((s) => s.key);
  if (!numericColumns.length) return null;

  const xKey = periodLabels.find((k) => !numericColumns.includes(k)) || periodLabels[0];
  const seriesKeys = numericColumns.filter((k) => k !== xKey).slice(0, 3);
  if (!seriesKeys.length) return null;

  const points = rows.map((row, idx) => {
    const point = {
      x: sanitizeDisplayText(row?.values?.[xKey]) || `Row ${idx + 1}`,
    };
    seriesKeys.forEach((k) => {
      point[k] = toNumericValue(row?.values?.[k]);
    });
    return point;
  }).filter((p) => seriesKeys.some((k) => p[k] != null));

  if (points.length < 2) return null;

  return { points, seriesKeys };
}

function formatMetricValue(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function getPalette(seed = 0) {
  const palettes = [
    ['#2563eb', '#10b981', '#a855f7'],
    ['#0ea5e9', '#14b8a6', '#6366f1'],
    ['#4f46e5', '#22c55e', '#f59e0b'],
  ];
  return palettes[Math.abs(seed) % palettes.length];
}

function isLikelyTemporalLabel(label) {
  const s = String(label || '').trim();
  return /^\d{4}$/.test(s) || /^q[1-4]\s*\d{2,4}$/i.test(s) || /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(s);
}

function getAutoChartType(points) {
  if (!Array.isArray(points) || points.length < 2) return 'line';
  const temporalHits = points.reduce((acc, p) => acc + (isLikelyTemporalLabel(p?.x) ? 1 : 0), 0);
  return temporalHits >= Math.ceil(points.length * 0.6) ? 'line' : 'bar';
}

function getMetricExtrema(points, metric) {
  let minPoint = null;
  let maxPoint = null;
  points.forEach((p) => {
    const v = p?.[metric];
    if (v == null || !Number.isFinite(v)) return;
    if (!minPoint || v < minPoint[metric]) minPoint = p;
    if (!maxPoint || v > maxPoint[metric]) maxPoint = p;
  });
  return { minPoint, maxPoint };
}

const PDF_ZOOM_STEP = 0.25;
const PDF_ZOOM_MIN = 0.5;
const PDF_ZOOM_MAX = 2.5;

// --- Side-by-side table + PDF page preview ---
function OneTableWithPreview({ tbl, previewUrl, chartSeed = 0 }) {
  const [showPreview, setShowPreview] = useState(true);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [chartType, setChartType] = useState('auto');
  const [selectedMetric, setSelectedMetric] = useState('');
  const data = tbl.data;
  const meta = tbl.table_metadata || data?.table_metadata;
  const tableType = meta?.table_type || 'tabular';
  const pageNum = tbl.page_number >= 1 ? tbl.page_number : (tbl.page_index != null ? tbl.page_index + 1 : '?');

  if (!data) {
    return (
      <div className="extract-card">
        <div className="extract-card-header">
          <span className="extract-card-page">Page {pageNum}</span>
          <span className="extract-card-status extract-card-status-failed">Extraction failed</span>
        </div>
      </div>
    );
  }

  const { rows, periodLabels } = normalizeExtractData(data);
  const hasPreview = Boolean(previewUrl);
  const chartModel = buildChartModel(periodLabels, rows);
  const autoType = chartModel ? getAutoChartType(chartModel.points) : 'line';
  const effectiveChartType = chartType === 'auto' ? autoType : chartType;
  const effectiveMetric = chartModel
    ? (chartModel.seriesKeys.includes(selectedMetric) ? selectedMetric : chartModel.seriesKeys[0])
    : '';
  const { minPoint, maxPoint } = chartModel ? getMetricExtrema(chartModel.points, effectiveMetric) : { minPoint: null, maxPoint: null };
  const palette = getPalette(chartSeed);

  const tableContent = (tableType === 'text_only' || rows.length === 0) ? (
    <div className="extract-table-wrap">
      <div className="extract-text-only">
        {rows.map((r, i) => (
          <div key={i} className="extract-text-row">
            {sanitizeDisplayText(r.label)}
            {r.values && Object.keys(r.values).length > 0 && (
              <span className="extract-text-values">
                {Object.entries(r.values).map(([k, v]) => `${sanitizeDisplayText(k)}: ${sanitizeDisplayText(v)}`).join(' · ')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="extract-table-wrap">
      <div className="extract-table-scroll">
        <table className="extract-table">
          <thead>
            <tr>
              {periodLabels.map((p) => (
                <th key={p} className="extract-th">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={row.is_section ? 'extract-section-row' : ''}>
                {periodLabels.map((key) => {
                  const val = row.values?.[key];
                  const cleaned = sanitizeDisplayText(val);
                  const display = cleaned !== '' ? cleaned : '—';
                  return (
                    <td key={key} className="extract-td extract-td-value">{display}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const metaBlock = (meta?.summary || (meta?.key_insights && meta.key_insights.length > 0)) ? (
    <div className="extract-table-meta-block">
      {meta.summary && <p className="extract-table-summary">{meta.summary}</p>}
      {meta.key_insights && meta.key_insights.length > 0 && (
        <ul className="extract-table-key-insights">
          {meta.key_insights.map((insight, i) => (
            <li key={i}>{insight}</li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

  const chartBlock = chartModel ? (
    <div className="extract-chart-wrap">
      <div className="extract-chart-head">
        <span className="extract-chart-title">Quick visualization</span>
        <span className="extract-chart-meta">{chartModel.seriesKeys.length} metric(s), {chartModel.points.length} points</span>
      </div>
      <div className="extract-chart-controls">
        <label className="extract-chart-control">
          <span>Type</span>
          <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
            <option value="auto">Auto ({autoType})</option>
            <option value="line">Line</option>
            <option value="bar">Bar</option>
          </select>
        </label>
        <label className="extract-chart-control">
          <span>Metric</span>
          <select value={effectiveMetric} onChange={(e) => setSelectedMetric(e.target.value)}>
            {chartModel.seriesKeys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="extract-chart-kpis">
        {chartModel.seriesKeys.map((k) => {
          const vals = chartModel.points.map((p) => p[k]).filter((v) => v != null);
          const last = vals.length ? vals[vals.length - 1] : null;
          return (
            <div key={k} className="extract-chart-kpi">
              <span className="extract-chart-kpi-label">{k}</span>
              <span className="extract-chart-kpi-value">{formatMetricValue(last)}</span>
            </div>
          );
        })}
      </div>
      <div className="extract-chart-canvas">
        <ResponsiveContainer width="100%" height={260}>
          {effectiveChartType === 'bar' ? (
            <BarChart data={chartModel.points} margin={{ top: 8, right: 20, left: 6, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="x" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey={effectiveMetric} fill={palette[0]} radius={[6, 6, 0, 0]}>
                {chartModel.points.map((p, idx) => {
                  const isMin = minPoint && p.x === minPoint.x && p[effectiveMetric] === minPoint[effectiveMetric];
                  const isMax = maxPoint && p.x === maxPoint.x && p[effectiveMetric] === maxPoint[effectiveMetric];
                  return (
                    <Cell key={`cell-${idx}`} fill={isMax ? '#16a34a' : (isMin ? '#dc2626' : palette[0])} />
                  );
                })}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={chartModel.points} margin={{ top: 8, right: 20, left: 6, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="x" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {chartModel.seriesKeys.map((k, idx) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={palette[idx % palette.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
              {maxPoint && (
                <ReferenceDot x={maxPoint.x} y={maxPoint[effectiveMetric]} r={5} fill="#16a34a" stroke="none" />
              )}
              {minPoint && (
                <ReferenceDot x={minPoint.x} y={minPoint[effectiveMetric]} r={5} fill="#dc2626" stroke="none" />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  ) : null;

  return (
    <div className="extract-card">
      <div className="extract-card-header">
        <span className="extract-card-page">Page {pageNum}</span>
        {meta?.table_title && <span className="extract-card-title">{meta.table_title}</span>}
        {hasPreview && (
          <button
            type="button"
            className="extract-card-toggle"
            onClick={() => setShowPreview((v) => !v)}
            title={showPreview ? 'Hide page preview' : 'Show page preview'}
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        )}
      </div>
      <div className={`extract-card-body ${hasPreview && showPreview ? 'extract-card-body-split' : ''}`}>
        <div className="extract-card-table-side">{tableContent}{chartBlock}{metaBlock}</div>
        {hasPreview && showPreview && (
          <div className="extract-card-preview-side">
            <div className="extract-card-preview-zoom-toolbar">
              <span className="extract-card-preview-zoom-label">PDF zoom</span>
              <button
                type="button"
                className="extract-card-preview-zoom-btn"
                onClick={() => setPdfZoom((z) => Math.max(PDF_ZOOM_MIN, z - PDF_ZOOM_STEP))}
                title="Zoom out"
                aria-label="Zoom out PDF"
              >
                −
              </button>
              <span className="extract-card-preview-zoom-value">{Math.round(pdfZoom * 100)}%</span>
              <button
                type="button"
                className="extract-card-preview-zoom-btn"
                onClick={() => setPdfZoom((z) => Math.min(PDF_ZOOM_MAX, z + PDF_ZOOM_STEP))}
                title="Zoom in"
                aria-label="Zoom in PDF"
              >
                +
              </button>
              <button
                type="button"
                className="extract-card-preview-zoom-btn extract-card-preview-zoom-reset"
                onClick={() => setPdfZoom(1)}
                title="Reset to 100%"
                aria-label="Reset PDF zoom"
              >
                Reset
              </button>
            </div>
            <div className="extract-card-preview-scroll">
              <img
                src={previewUrl}
                alt={`Page ${pageNum}`}
                className="extract-card-preview-img"
                style={{ width: `${pdfZoom * 100}%`, height: 'auto' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExtractorTables({ extractedTables, fileId, onExport, onExportError, pagePreviewUrls = {} }) {
  const handleExport = async () => {
    if (onExport) onExport();
    try {
      const didExport = await exportExtractToExcel(extractedTables, fileId || 'extract');
      if (!didExport) {
        const msg = 'No exportable table data (rows/periods missing).';
        if (onExportError) onExportError(msg);
        else alert(msg);
      }
    } catch (err) {
      const msg = err?.message || 'Export to Excel failed.';
      if (onExportError) onExportError(msg);
      else alert(msg);
    }
  };

  return (
    <div className="extract-tables-container">
      <div className="extract-tables-toolbar">
        <span className="extract-tables-title">Extracted Tables ({extractedTables.length})</span>
        <button type="button" className="btn-primary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>
      {extractedTables.map((tbl, idx) => {
        const previewUrl = pagePreviewUrls[tbl.page_index] ?? pagePreviewUrls[tbl.pageIndex] ?? null;
        return <OneTableWithPreview key={idx} tbl={tbl} previewUrl={previewUrl} chartSeed={idx} />;
      })}
    </div>
  );
}
