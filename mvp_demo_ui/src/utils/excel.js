import ExcelJS from 'exceljs';

/**
 * Clean up raw extractor values for Excel export and coerce numeric-looking
 * strings into real numbers when possible.
 */
function sanitizeCellString(raw) {
  if (raw == null) return '';
  if (typeof raw !== 'string') return raw;

  // Common validator/LLM artifacts seen in extractor output
  return raw
    .replace(/<br\s*\/?>/gi, ' ') // remove <br> tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/\*/g, '') // remove stray asterisks
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumericValue(raw) {
  if (raw == null) return '';
  if (typeof raw === 'number') return raw;

  const s = sanitizeCellString(raw);
  if (typeof s !== 'string') return s;
  if (!s) return '';
  if (s === '—' || s === '–' || s === '-') return '';

  // 1) Detect "(123)" style negatives (optionally with $ and/or % around it)
  let negative = false;
  let numericCandidate = s.replace(/[$]/g, '').replace(/%/g, '').trim();
  const parenMatch = numericCandidate.match(/^\(\s*(.*?)\s*\)$/);
  if (parenMatch) {
    negative = true;
    numericCandidate = parenMatch[1];
  }

  // 2) Remove formatting noise
  numericCandidate = numericCandidate
    .replace(/,/g, '') // thousands separators
    .replace(/\s+/g, ''); // inner spaces

  // 3) Extract first numeric token (handles cases like "123.4 million")
  const numMatch = numericCandidate.match(/-?\d+(?:\.\d+)?/);
  if (numMatch) {
    const n = Number(numMatch[0]);
    if (Number.isFinite(n)) {
      return negative ? -Math.abs(n) : n;
    }
  }

  // Not a number: return sanitized text so Excel doesn't get <br> or '*'
  return s;
}

/**
 * EDGAR merged payload (payload_doc): merged.balance_sheet etc. are objects
 * where each value is { item_label, section_label, values: { [year]: { value } } }.
 * Excel export:
 * - One sheet per statement (Balance Sheet, Income Statement, Cash Flow)
 * - Header row: years
 * - Section subheadings (e.g. Current Assets) as separate rows, highlighted
 * - Numeric columns right-aligned with number formatting
 */
function getEdgarCellValue(item, year) {
  const v = item?.values?.[year];
  if (v == null) return '';
  const raw = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
  return normalizeNumericValue(raw);
}

export async function exportEdgarToExcel(merged, ticker = 'EDGAR') {
  const wb = new ExcelJS.Workbook();
  const years = merged?.years || [];

  const headerFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9D9D9' }, // light gray
  };
  const sectionFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFEFEF' }, // slightly lighter gray
  };

  for (const [stmtName, catalog] of Object.entries({
    'Balance Sheet': merged?.balance_sheet || {},
    'Income Statement': merged?.income_statement || {},
    'Cash Flow': merged?.cash_flow_statement || {},
  })) {
    if (!catalog || typeof catalog !== 'object' || Object.keys(catalog).length === 0) continue;

    const ws = wb.addWorksheet(stmtName.substring(0, 31), {
      // Keep default gridlines; we'll override borders only for the table region
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Header row
    const headerRow = ws.addRow(['Line Item', ...years]);
    headerRow.font = { bold: true };
    headerRow.fill = headerFill;
    headerRow.alignment = { vertical: 'middle', wrapText: true };

    let lastSection = null;
    for (const [, item] of Object.entries(catalog)) {
      const section = item?.section_label ?? null;
      const label = item?.item_label ?? '';

      // Section subheading row
      if (section && section !== lastSection) {
        lastSection = section;
        const sectionRow = ws.addRow([section, ...years.map(() => '')]);
        sectionRow.eachCell((cell) => {
          cell.fill = sectionFill;
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', wrapText: true };
        });
        // Merge across all columns so the section label is one band
        ws.mergeCells(sectionRow.number, 1, sectionRow.number, years.length + 1);
      }

      const values = years.map((y) => getEdgarCellValue(item, y));
      const dataRow = ws.addRow([label, ...values]);

      // Line item label: wrap text so long labels don't force wide columns
      dataRow.getCell(1).alignment = {
        vertical: 'top',
        horizontal: 'left',
        wrapText: true,
      };

      // Numeric columns: right-aligned, number format when numeric
      years.forEach((_, idx) => {
        const cell = dataRow.getCell(idx + 2);
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        const val = values[idx];
        if (typeof val === 'number') {
          cell.numFmt = '#,##0';
        }
      });
    }

    // Column widths: keep label column moderate, numeric columns compact
    ws.getColumn(1).width = 28;
    for (let i = 0; i < years.length; i += 1) {
      ws.getColumn(i + 2).width = 12;
    }

    // Table outline only visually, while keeping gridlines outside the table.
    // We first set a "blank" border inside the table to hide gridlines,
    // then overlay a visible outline border on the outer edge.
    const firstRow = 1; // header
    const lastRow = ws.rowCount;
    const firstCol = 1;
    const lastCol = years.length + 1;
    const outlineBorder = {
      style: 'thin',
      color: { argb: 'FF4B5563' }, // neutral gray
    };
    const innerBorder = {
      style: 'thin',
      color: { argb: 'FFFFFFFF' }, // white to mask gridlines inside table
    };

    // Apply white borders to all cells inside the table region (hides gridlines there)
    for (let row = firstRow; row <= lastRow; row += 1) {
      const excelRow = ws.getRow(row);
      for (let col = firstCol; col <= lastCol; col += 1) {
        const cell = excelRow.getCell(col);
        cell.border = {
          top: innerBorder,
          bottom: innerBorder,
          left: innerBorder,
          right: innerBorder,
        };
      }
    }

    // Then overlay a visible outline border around the full table range
    // Top and bottom borders
    for (let col = firstCol; col <= lastCol; col += 1) {
      const topCell = ws.getRow(firstRow).getCell(col);
      topCell.border = { ...(topCell.border || {}), top: outlineBorder };
      const bottomCell = ws.getRow(lastRow).getCell(col);
      bottomCell.border = { ...(bottomCell.border || {}), bottom: outlineBorder };
    }
    // Left and right borders
    for (let row = firstRow; row <= lastRow; row += 1) {
      const leftCell = ws.getRow(row).getCell(firstCol);
      leftCell.border = { ...(leftCell.border || {}), left: outlineBorder };
      const rightCell = ws.getRow(row).getCell(lastCol);
      rightCell.border = { ...(rightCell.border || {}), right: outlineBorder };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ticker}_financials.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Period keys that match row.values: prefer label if present in sample row, else year.
 * Backend keys row.values by period label (exact header text); fallback to year for compat.
 */
function getPeriodKeys(periods, sampleRow) {
  if (!periods || !periods.length) return [];
  const vals = (sampleRow && typeof sampleRow.values === 'object') ? sampleRow.values : {};
  return periods
    .map((p) => {
      if (typeof p === 'object' && p != null) {
        const label = typeof p.label === 'string' ? p.label.trim() : '';
        const yearStr = p.year != null ? String(p.year) : '';
        if (label && label in vals) return label;
        if (yearStr && yearStr in vals) return yearStr;
        return label || yearStr || '';
      }
      return String(p);
    })
    .filter(Boolean);
}

/**
 * Extractor payload (payload_doc): data.rows + data.periods, or fallback data.sections[].items[]
 * Excel export: mirrors EDGAR formatting — numeric cells, clean table outline, no inner grid.
 * @returns {Promise<boolean>} true if download was triggered, false if no exportable data.
 * One worksheet per page; all tables from the same page are written to that page's tab.
 */
function parseTableData(data) {
  if (!data) return null;
  let periodKeys = [];
  let rows = [];
  if (data.rows && data.rows.length) {
    const periods = data.periods || [];
    periodKeys = getPeriodKeys(periods, data.rows[0]);
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
    rows = data.rows;
  } else {
    const sections = data.sections || [];
    sections.forEach((sec) => {
      const items = sec.items || [];
      const keys = getPeriodKeys(sec.periods || [], items[0]);
      if (periodKeys.length === 0 && keys.length) periodKeys = keys;
      else if (periodKeys.length === 0 && items[0]?.values) periodKeys = Object.keys(items[0].values);
      items.forEach((item) => {
        const label = item.item_label || item.label || '';
        const vals = item.values || item.period_values || {};
        rows.push({ label, values: vals });
      });
    });
  }
  if (!periodKeys.length || !rows.length) return null;
  return { periodKeys, rows };
}

const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
const outlineBorder = { style: 'thin', color: { argb: 'FF4B5563' } };
const innerBorder = { style: 'thin', color: { argb: 'FFFFFFFF' } };

function applyTableBorders(ws, firstRow, lastRow, firstCol, lastCol) {
  for (let rowIdx = firstRow; rowIdx <= lastRow; rowIdx += 1) {
    const excelRow = ws.getRow(rowIdx);
    for (let colIdx = firstCol; colIdx <= lastCol; colIdx += 1) {
      const cell = excelRow.getCell(colIdx);
      cell.border = { top: innerBorder, bottom: innerBorder, left: innerBorder, right: innerBorder };
    }
  }
  for (let colIdx = firstCol; colIdx <= lastCol; colIdx += 1) {
    ws.getRow(firstRow).getCell(colIdx).border = { ...(ws.getRow(firstRow).getCell(colIdx).border || {}), top: outlineBorder };
    ws.getRow(lastRow).getCell(colIdx).border = { ...(ws.getRow(lastRow).getCell(colIdx).border || {}), bottom: outlineBorder };
  }
  for (let rowIdx = firstRow; rowIdx <= lastRow; rowIdx += 1) {
    ws.getRow(rowIdx).getCell(firstCol).border = { ...(ws.getRow(rowIdx).getCell(firstCol).border || {}), left: outlineBorder };
    ws.getRow(rowIdx).getCell(lastCol).border = { ...(ws.getRow(rowIdx).getCell(lastCol).border || {}), right: outlineBorder };
  }
}

export async function exportExtractToExcel(extractedTables, baseName = 'extract') {
  const wb = new ExcelJS.Workbook();
  const tables = (extractedTables || []).filter((t) => t && t.data);
  const byPage = new Map();

  for (const tbl of tables) {
    const parsed = parseTableData(tbl.data);
    if (!parsed) continue;
    const pageIndex = typeof tbl.page_index === 'number' ? tbl.page_index : (tbl.page_number != null ? tbl.page_number - 1 : 0);
    if (!byPage.has(pageIndex)) byPage.set(pageIndex, []);
    byPage.get(pageIndex).push(parsed);
  }

  const sortedPageIndices = [...byPage.keys()].sort((a, b) => a - b);

  for (const pageIndex of sortedPageIndices) {
    const pageTables = byPage.get(pageIndex);
    if (!pageTables.length) continue;

    const sheetName = `Page ${pageIndex + 1}`.substring(0, 31);
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    let currentRow = 1;
    let maxCols = 1;

    for (let t = 0; t < pageTables.length; t++) {
      const { periodKeys, rows } = pageTables[t];
      if (t > 0) currentRow += 2;
      const tableStartRow = currentRow;
      const headerRow = ws.addRow(['Line Item', ...periodKeys]);
      headerRow.font = { bold: true };
      headerRow.fill = headerFill;
      headerRow.alignment = { vertical: 'middle', wrapText: true };
      currentRow += 1;
      rows.forEach((row) => {
        const label = sanitizeCellString(row.label ?? '');
        const vals = row.values || {};
        const values = periodKeys.map((k) => normalizeNumericValue(vals[k]));
        const excelRow = ws.addRow([label, ...values]);
        excelRow.getCell(1).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        periodKeys.forEach((_, idxKey) => {
          const cell = excelRow.getCell(idxKey + 2);
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          const v = values[idxKey];
          if (typeof v === 'number') cell.numFmt = '#,##0';
        });
        currentRow += 1;
      });
      const tableEndRow = currentRow - 1;
      const numCols = periodKeys.length + 1;
      if (numCols > maxCols) maxCols = numCols;
      applyTableBorders(ws, tableStartRow, tableEndRow, 1, numCols);
    }

    ws.getColumn(1).width = 28;
    for (let i = 0; i < maxCols - 1; i += 1) {
      ws.getColumn(i + 2).width = 12;
    }
  }

  if (!wb.worksheets.length) return false;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
