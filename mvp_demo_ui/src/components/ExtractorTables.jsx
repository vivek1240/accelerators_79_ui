import { useState } from 'react';
import { exportExtractToExcel } from '../utils/excel';

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

function normalizeExtractData(data) {
  if (data.rows && data.rows.length) {
    const periods = data.periods || [];
    let periodKeys = getPeriodKeys(periods, data.rows[0]);
    if (periodKeys.length === 0 && data.rows[0]?.values && typeof data.rows[0].values === 'object') {
      periodKeys = Object.keys(data.rows[0].values);
    }
    const firstRowKeys = data.rows[0]?.values && typeof data.rows[0].values === 'object' ? Object.keys(data.rows[0].values) : [];
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
    return { rows: data.rows, periodLabels: periodKeys };
  }
  const sections = data.sections || [];
  const periodLabels = [];
  const rows = [];
  sections.forEach((sec) => {
    const items = sec.items || [];
    const periodObjs = sec.periods || [];
    const keys = getPeriodKeys(periodObjs, items[0]);
    if (keys.length) {
      if (periodLabels.length === 0) periodLabels.push(...keys);
    } else if (items[0]?.values && typeof items[0].values === 'object') {
      const firstKeys = Object.keys(items[0].values || {});
      if (periodLabels.length === 0) periodLabels.push(...firstKeys);
    }
    items.forEach((item) => {
      const label = item.item_label || item.label || '';
      const vals = item.values || item.period_values || {};
      rows.push({ label, values: vals, is_section: false });
    });
  });
  return { rows, periodLabels };
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

const PDF_ZOOM_STEP = 0.25;
const PDF_ZOOM_MIN = 0.5;
const PDF_ZOOM_MAX = 2.5;

// --- Side-by-side table + PDF page preview ---
function OneTableWithPreview({ tbl, previewUrl }) {
  const [showPreview, setShowPreview] = useState(true);
  const [pdfZoom, setPdfZoom] = useState(1);
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
              <th className="extract-th">Line Item</th>
              {periodLabels.map((p) => (
                <th key={p} className="extract-th">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={row.is_section ? 'extract-section-row' : ''}>
                <td className="extract-td">{sanitizeDisplayText(row.label)}</td>
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
        <div className="extract-card-table-side">{tableContent}{metaBlock}</div>
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
        return <OneTableWithPreview key={idx} tbl={tbl} previewUrl={previewUrl} />;
      })}
    </div>
  );
}
