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

/* --- NEW CHANGE START (side-by-side preview OneTable) ---
 * To re-enable: uncomment this block and comment out the ORIGINAL OneTable below.
 * Also uncomment `import { useState } from 'react';` at the top.
 *
 * import { useState } from 'react';
 *
 * function OneTable({ tbl, previewUrl }) {
 *   const [showPreview, setShowPreview] = useState(true);
 *   const data = tbl.data;
 *   const meta = tbl.table_metadata || data?.table_metadata;
 *   const tableType = meta?.table_type || 'tabular';
 *   const pageNum = tbl.page_number >= 1 ? tbl.page_number : '?';
 *
 *   if (!data) {
 *     return (<div className="extract-card"><div className="extract-card-header"><span className="extract-card-page">Page {pageNum}</span><span className="extract-card-status extract-card-status-failed">Extraction failed</span></div></div>);
 *   }
 *
 *   const { rows, periodLabels } = normalizeExtractData(data);
 *   const hasPreview = Boolean(previewUrl);
 *
 *   const tableContent = (tableType === 'text_only' || rows.length === 0) ? (
 *     <div className="extract-table-wrap"><div className="extract-text-only">{rows.map((r, i) => (<div key={i} className="extract-text-row">{r.label}{r.values && Object.keys(r.values).length > 0 && (<span className="extract-text-values">{Object.entries(r.values).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>)}</div>))}</div></div>
 *   ) : (
 *     <div className="extract-table-wrap"><div className="extract-table-scroll"><table className="extract-table"><thead><tr><th className="extract-th">Line Item</th>{periodLabels.map((p) => (<th key={p} className="extract-th">{p}</th>))}</tr></thead><tbody>{rows.map((row, i) => (<tr key={i} className={row.is_section ? 'extract-section-row' : ''}><td className="extract-td">{row.label}</td>{periodLabels.map((key) => { const val = row.values?.[key]; const display = val != null && val !== '' ? String(val) : '—'; return (<td key={key} className="extract-td extract-td-value">{display}</td>); })}</tr>))}</tbody></table></div></div>
 *   );
 *
 *   const metaBlock = (meta?.summary || (meta?.key_insights && meta.key_insights.length > 0)) ? (
 *     <div className="extract-table-meta-block">{meta.summary && <p className="extract-table-summary">{meta.summary}</p>}{meta.key_insights && meta.key_insights.length > 0 && (<ul className="extract-table-key-insights">{meta.key_insights.map((insight, i) => (<li key={i}>{insight}</li>))}</ul>)}</div>
 *   ) : null;
 *
 *   return (
 *     <div className="extract-card">
 *       <div className="extract-card-header">
 *         <span className="extract-card-page">Page {pageNum}</span>
 *         {meta?.table_title && <span className="extract-card-title">{meta.table_title}</span>}
 *         {hasPreview && (<button type="button" className="extract-card-toggle" onClick={() => setShowPreview((v) => !v)} title={showPreview ? 'Hide page preview' : 'Show page preview'}>{showPreview ? 'Hide preview' : 'Show preview'}</button>)}
 *       </div>
 *       <div className={`extract-card-body ${hasPreview && showPreview ? 'extract-card-body-split' : ''}`}>
 *         <div className="extract-card-table-side">{tableContent}{metaBlock}</div>
 *         {hasPreview && showPreview && (<div className="extract-card-preview-side"><img src={previewUrl} alt={`Page ${pageNum}`} className="extract-card-preview-img" /></div>)}
 *       </div>
 *     </div>
 *   );
 * }
 *
 * export default function ExtractorTables({ extractedTables, fileId, onExport, pagePreviewUrls = {} }) {
 *   const handleExport = () => { if (onExport) onExport(); else exportExtractToExcel(extractedTables, fileId || 'extract'); };
 *   return (
 *     <div className="extract-tables-container">
 *       <div className="extract-tables-toolbar">
 *         <span className="extract-tables-title">Extracted Tables ({extractedTables.length})</span>
 *         <button type="button" className="btn-primary" onClick={handleExport}>Export to Excel</button>
 *       </div>
 *       {extractedTables.map((tbl, idx) => { const previewUrl = pagePreviewUrls[tbl.page_index] || null; return <OneTable key={idx} tbl={tbl} previewUrl={previewUrl} />; })}
 *     </div>
 *   );
 * }
 * --- NEW CHANGE END (side-by-side preview OneTable) --- */

// --- ORIGINAL OneTable + ExtractorTables ---
function OneTable({ tbl }) {
  const data = tbl.data;
  const meta = tbl.table_metadata || data?.table_metadata;
  const tableType = meta?.table_type || 'tabular';

  if (!data) {
    return (
      <div className="extract-table-wrap">
        <div className="extract-table-header">Page {tbl.page_number >= 1 ? tbl.page_number : '?'} — Extraction failed</div>
        {tbl.error && (
          <div style={{ padding: '12px 18px', fontSize: 13, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
            <strong>Reason:</strong> {tbl.error}
          </div>
        )}
      </div>
    );
  }

  const { rows, periodLabels } = normalizeExtractData(data);

  if (tableType === 'text_only' || rows.length === 0) {
    return (
      <div className="extract-table-wrap">
        <div className="extract-table-header">
          <span>Page {tbl.page_number >= 1 ? tbl.page_number : '?'}</span>
          {meta?.table_title && <span className="extract-table-meta">{meta.table_title}</span>}
        </div>
        <div className="extract-text-only">
          {rows.map((r, i) => (
            <div key={i} className="extract-text-row">
              {r.label}
              {r.values && Object.keys(r.values).length > 0 && (
                <span className="extract-text-values">
                  {Object.entries(r.values).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </span>
              )}
            </div>
          ))}
        </div>
        {(meta?.summary || (meta?.key_insights && meta.key_insights.length > 0)) && (
          <div className="extract-table-meta-block">
            {meta.summary && (
              <p className="extract-table-summary">{meta.summary}</p>
            )}
            {meta.key_insights && meta.key_insights.length > 0 && (
              <ul className="extract-table-key-insights">
                {meta.key_insights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="extract-table-wrap">
      <div className="extract-table-header">
        <span>Page {tbl.page_number >= 1 ? tbl.page_number : '?'}</span>
        {meta?.table_title && <span className="extract-table-meta">{meta.table_title}</span>}
      </div>
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
                <td className="extract-td">{row.label}</td>
                {periodLabels.map((key) => {
                  const val = row.values?.[key];
                  const display = val != null && val !== '' ? String(val) : '—';
                  return (
                    <td key={key} className="extract-td extract-td-value">
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(meta?.summary || (meta?.key_insights && meta.key_insights.length > 0)) && (
        <div className="extract-table-meta-block">
          {meta.summary && (
            <p className="extract-table-summary">{meta.summary}</p>
          )}
          {meta.key_insights && meta.key_insights.length > 0 && (
            <ul className="extract-table-key-insights">
              {meta.key_insights.map((insight, i) => (
                <li key={i}>{insight}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExtractorTables({ extractedTables, fileId, onExport }) {
  const handleExport = () => {
    if (onExport) onExport();
    else exportExtractToExcel(extractedTables, fileId || 'extract');
  };

  return (
    <div className="extract-tables-container">
      <div className="extract-tables-toolbar">
        <span className="extract-tables-title">Extracted Tables</span>
        <button type="button" className="btn-primary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>
      {extractedTables.map((tbl, idx) => (
        <OneTable key={idx} tbl={tbl} />
      ))}
    </div>
  );
}
// --- END ORIGINAL ---
