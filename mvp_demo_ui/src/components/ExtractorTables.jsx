import { exportExtractToExcel } from '../utils/excel';

/**
 * Extractor payload (payload_doc): data.rows = [{ label, values: { "2023": 100000 }, is_section, section_id }],
 * data.periods = [{ label, date, year }].
 * Backend (validator _normalize) keys row.values by str(period.year), so we must use the same key for lookup.
 * Fallback: data.sections[].items[] with item_label, values for backward compat.
 */
function getPeriodKeys(periods) {
  if (!periods || !periods.length) return [];
  return periods.map((p) => {
    if (typeof p === 'object' && p != null) {
      // Backend uses str(p["year"]) as key in row.values — use year first, then label
      return String(p.year ?? p.label ?? '');
    }
    return String(p);
  }).filter(Boolean);
}

function normalizeExtractData(data) {
  if (data.rows && data.rows.length) {
    const periods = data.periods || [];
    // Use same keys as backend (string year) for value lookup so numbers show correctly
    let periodKeys = getPeriodKeys(periods);
    if (periodKeys.length === 0 && data.rows[0]?.values && typeof data.rows[0].values === 'object') {
      periodKeys = Object.keys(data.rows[0].values);
    }
    return { rows: data.rows, periodLabels: periodKeys };
  }
  const sections = data.sections || [];
  const periodLabels = [];
  const rows = [];
  sections.forEach((sec) => {
    const items = sec.items || [];
    const periodObjs = sec.periods || [];
    const keys = getPeriodKeys(periodObjs);
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

function OneTable({ tbl }) {
  const data = tbl.data;
  const meta = tbl.table_metadata || data?.table_metadata;
  const tableType = meta?.table_type || 'tabular';

  if (!data) {
    return (
      <div className="extract-table-wrap">
        <div className="extract-table-header">Page {tbl.page_number} — Extraction failed</div>
      </div>
    );
  }

  const { rows, periodLabels } = normalizeExtractData(data);

  if (tableType === 'text_only' || rows.length === 0) {
    return (
      <div className="extract-table-wrap">
        <div className="extract-table-header">
          <span>Page {tbl.page_number}</span>
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
      </div>
    );
  }

  return (
    <div className="extract-table-wrap">
      <div className="extract-table-header">
        <span>Page {tbl.page_number}</span>
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
                  const display = val != null && val !== '' ? (typeof val === 'number' ? (Number.isInteger(val) ? String(val) : String(val)) : String(val)) : '—';
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
