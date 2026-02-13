import { exportEdgarToExcel } from '../utils/excel';

/**
 * EDGAR merged payload (payload_doc): each statement is object of line items.
 * Each item: { section_label, item_label, item_gaap, values: { [year]: { value, meta } } }
 */
function getCellValue(item, year) {
  const v = item?.values?.[year];
  if (v == null) return '—';
  return typeof v === 'object' && v !== null && 'value' in v ? v.value : String(v);
}

function StatementTable({ name, catalog, years }) {
  if (!catalog || typeof catalog !== 'object' || Object.keys(catalog).length === 0) return null;
  const entries = Object.entries(catalog);
  let lastSection = null;

  return (
    <div className="edgar-statement-wrap">
      <div className="edgar-statement-header">
        <span className="edgar-statement-title">{name}</span>
      </div>
      <div className="edgar-table-scroll">
        <table className="edgar-table">
          <thead>
            <tr>
              <th className="edgar-th">Line Item</th>
              {years.map((y) => (
                <th key={y} className="edgar-th">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, item]) => {
              const label = item?.item_label ?? key;
              const section = item?.section_label;
              const showSection = section && section !== lastSection;
              if (showSection) lastSection = section;
              return (
                <tr key={key}>
                  <td className="edgar-td">
                    {showSection && (
                      <span className="edgar-section-label">{section}</span>
                    )}
                    <span className={showSection ? 'edgar-item-with-section' : ''}>{label}</span>
                  </td>
                  {years.map((y) => (
                    <td key={y} className="edgar-td edgar-td-value">
                      {getCellValue(item, y)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EdgarTables({ data, ticker }) {
  const merged = data?.merged || {};
  const years = merged.years || [];
  const bs = merged.balance_sheet || {};
  const is = merged.income_statement || {};
  const cf = merged.cash_flow_statement || {};

  const handleExport = () => exportEdgarToExcel(merged, ticker || 'EDGAR');

  return (
    <div className="edgar-tables-container">
      <div className="edgar-tables-toolbar">
        <span className="edgar-tables-title">{ticker || 'EDGAR'} — Financial Statements</span>
        <button type="button" className="btn-primary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>
      <StatementTable name="Balance Sheet" catalog={bs} years={years} />
      <StatementTable name="Income Statement" catalog={is} years={years} />
      <StatementTable name="Cash Flow" catalog={cf} years={years} />
    </div>
  );
}
