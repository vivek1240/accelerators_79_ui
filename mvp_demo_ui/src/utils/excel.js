import ExcelJS from 'exceljs';

/**
 * Try to coerce a raw backend value into a real Excel number when possible,
 * otherwise return the original string/value.
 */
function normalizeNumericValue(raw) {
  if (raw == null) return '';
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return '';
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
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
 * Backend keys row.values by str(period.year). Use same key for export.
 */
function getPeriodKeys(periods) {
  if (!periods || !periods.length) return [];
  return periods
    .map((p) => {
      if (typeof p === 'object' && p != null) return String(p.year ?? p.label ?? '');
      return String(p);
    })
    .filter(Boolean);
}

/**
 * Extractor payload (payload_doc): data.rows + data.periods, or fallback data.sections[].items[]
 * Excel export: mirrors EDGAR formatting — numeric cells, clean table outline, no inner grid.
 */
export async function exportExtractToExcel(extractedTables, fileId = 'extract') {
  const wb = new ExcelJS.Workbook();

  extractedTables.forEach((tbl, idx) => {
    const data = tbl.data;
    if (!data) return;

    let periodKeys = [];
    let rows = [];

    if (data.rows && data.rows.length) {
      const periods = data.periods || [];
      periodKeys = getPeriodKeys(periods);
      if (periodKeys.length === 0 && data.rows[0]?.values && typeof data.rows[0].values === 'object') {
        periodKeys = Object.keys(data.rows[0].values);
      }
      rows = data.rows;
    } else {
      const sections = data.sections || [];
      sections.forEach((sec) => {
        const items = sec.items || [];
        const keys = getPeriodKeys(sec.periods);
        if (periodKeys.length === 0 && keys.length) periodKeys = keys;
        else if (periodKeys.length === 0 && items[0]?.values) periodKeys = Object.keys(items[0].values);
        items.forEach((item) => {
          const label = item.item_label || item.label || '';
          const vals = item.values || item.period_values || {};
          rows.push({ label, values: vals });
        });
      });
    }

    if (!periodKeys.length || !rows.length) return;

    const ws = wb.addWorksheet(`Page ${tbl.page_number || idx + 1}`.substring(0, 31), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const headerFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' },
    };

    const headerRow = ws.addRow(['Line Item', ...periodKeys]);
    headerRow.font = { bold: true };
    headerRow.fill = headerFill;
    headerRow.alignment = { vertical: 'middle', wrapText: true };

    rows.forEach((row) => {
      const label = row.label ?? '';
      const vals = row.values || {};
      const values = periodKeys.map((k) => normalizeNumericValue(vals[k]));

      const excelRow = ws.addRow([label, ...values]);

      // Line item label: wrap text to keep numeric columns compact
      excelRow.getCell(1).alignment = {
        vertical: 'top',
        horizontal: 'left',
        wrapText: true,
      };

      // Numeric columns: right-aligned and formatted when numeric
      periodKeys.forEach((_, idxKey) => {
        const cell = excelRow.getCell(idxKey + 2);
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        const v = values[idxKey];
        if (typeof v === 'number') {
          cell.numFmt = '#,##0';
        }
      });
    });

    // Column widths similar to EDGAR: moderate label, compact numeric columns
    ws.getColumn(1).width = 28;
    for (let i = 0; i < periodKeys.length; i += 1) {
      ws.getColumn(i + 2).width = 12;
    }

    // Table outline only inside the extractor table, preserving gridlines elsewhere
    const firstRow = 1;
    const lastRow = ws.rowCount;
    const firstCol = 1;
    const lastCol = periodKeys.length + 1;

    const outlineBorder = {
      style: 'thin',
      color: { argb: 'FF4B5563' },
    };
    const innerBorder = {
      style: 'thin',
      color: { argb: 'FFFFFFFF' }, // white to mask gridlines inside table
    };

    // White borders inside table area
    for (let rowIdx = firstRow; rowIdx <= lastRow; rowIdx += 1) {
      const excelRow = ws.getRow(rowIdx);
      for (let colIdx = firstCol; colIdx <= lastCol; colIdx += 1) {
        const cell = excelRow.getCell(colIdx);
        cell.border = {
          top: innerBorder,
          bottom: innerBorder,
          left: innerBorder,
          right: innerBorder,
        };
      }
    }

    // Outline border around full table
    for (let colIdx = firstCol; colIdx <= lastCol; colIdx += 1) {
      const topCell = ws.getRow(firstRow).getCell(colIdx);
      topCell.border = { ...(topCell.border || {}), top: outlineBorder };
      const bottomCell = ws.getRow(lastRow).getCell(colIdx);
      bottomCell.border = { ...(bottomCell.border || {}), bottom: outlineBorder };
    }
    for (let rowIdx = firstRow; rowIdx <= lastRow; rowIdx += 1) {
      const leftCell = ws.getRow(rowIdx).getCell(firstCol);
      leftCell.border = { ...(leftCell.border || {}), left: outlineBorder };
      const rightCell = ws.getRow(rowIdx).getCell(lastCol);
      rightCell.border = { ...(rightCell.border || {}), right: outlineBorder };
    }
  });

  if (!wb.worksheets.length) return;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileId}_tables.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
