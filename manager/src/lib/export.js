export function exportRowsAsCsv({ filename, columns, rows }) {
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const normalizedRows = Array.isArray(rows) ? rows : [];

  const header = normalizedColumns.map((column) => escapeCsv(column.label)).join(',');
  const body = normalizedRows
    .map((row) => (
      normalizedColumns
        .map((column) => escapeCsv(resolveColumnValue(row, column)))
        .join(',')
    ))
    .join('\n');

  const csv = `\uFEFF${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportRowsAsExcel({ filename, sheetName = 'Report', title = '', subtitle = '', columns, rows }) {
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const excelFilename = normalizeExcelFilename(filename);
  const safeSheetName = normalizeSheetName(sheetName || title || 'Report');

  const XLSX = globalThis?.XLSX;
  if (XLSX?.utils && typeof XLSX.writeFile === 'function') {
    const headerRow = normalizedColumns.map((column) => String(column.label || ''));
    const dataRows = normalizedRows.map((row) => (
      normalizedColumns.map((column) => toExcelCellValue(resolveColumnValue(row, column)))
    ));

    const rowsForSheet = dataRows.length > 0
      ? dataRows
      : [headerRow.length > 0 ? headerRow.map((_, index) => (index === 0 ? 'No rows' : '')) : ['No rows']];

    const metadataRows = [];
    if (title) metadataRows.push([title]);
    if (subtitle) metadataRows.push([subtitle]);
    metadataRows.push([`Generated: ${new Date().toLocaleString()}`]);
    metadataRows.push([]);

    const aoa = [...metadataRows];
    if (headerRow.length > 0) {
      aoa.push(headerRow);
      aoa.push(...rowsForSheet);
    } else {
      aoa.push(['No columns configured']);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);

    if (headerRow.length > 0) {
      const headerRowIndex = metadataRows.length;
      const lastDataRowIndex = headerRowIndex + rowsForSheet.length;

      worksheet['!cols'] = buildExcelColumnWidths(headerRow, rowsForSheet);
      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: headerRowIndex, c: 0 },
          e: { r: lastDataRowIndex, c: headerRow.length - 1 }
        })
      };

      if (headerRow.length > 1) {
        const merges = [];
        for (let rowIndex = 0; rowIndex < metadataRows.length; rowIndex += 1) {
          const source = metadataRows[rowIndex] || [];
          if ((source[0] || '').toString().trim() !== '') {
            merges.push({
              s: { r: rowIndex, c: 0 },
              e: { r: rowIndex, c: headerRow.length - 1 }
            });
          }
        }
        if (merges.length > 0) {
          worksheet['!merges'] = merges;
        }
      }

      worksheet['!freeze'] = {
        xSplit: 0,
        ySplit: headerRowIndex + 1
      };

      const rowHeights = [];
      if (title) rowHeights.push({ hpt: 24 });
      if (subtitle) rowHeights.push({ hpt: 18 });
      rowHeights.push({ hpt: 16 });
      rowHeights.push({ hpt: 8 });
      rowHeights.push({ hpt: 20 });
      if (rowHeights.length > 0) {
        worksheet['!rows'] = rowHeights;
      }

      applyHeaderStyle(worksheet, headerRowIndex, headerRow.length);
      applyMetaStyle(worksheet, metadataRows.length, headerRow.length, Boolean(title), Boolean(subtitle));
    }

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: title || safeSheetName,
      Subject: subtitle || 'Operational report',
      Author: 'DynaHaul X',
      CreatedDate: new Date()
    };

    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    XLSX.writeFile(workbook, excelFilename, { compression: true });
    return;
  }

  exportRowsAsCsv({
    filename: excelFilename.replace(/\.xlsx$/i, '.csv'),
    columns: normalizedColumns,
    rows: normalizedRows
  });
}

function resolveColumnValue(row, column) {
  if (column && typeof column.value === 'function') {
    try {
      return column.value(row);
    } catch {
      return '';
    }
  }

  return valueByPath(row, column?.key);
}

function valueByPath(object, path) {
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc === undefined || acc === null ? '' : acc[key]), object);
}

function toExcelCellValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

function normalizeExcelFilename(filename) {
  const fallback = `report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const safeName = String(filename || fallback).trim();
  const withoutExt = safeName.replace(/\.[^./\\]+$/, '');
  return `${withoutExt}.xlsx`;
}

function normalizeSheetName(name) {
  const sanitized = String(name || 'Report')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .trim();
  return (sanitized || 'Report').slice(0, 31);
}

function buildExcelColumnWidths(headers, rows) {
  return headers.map((header, index) => {
    const headerLength = String(header || '').length;
    const maxValueLength = rows.reduce((maxLength, row) => {
      const value = row?.[index];
      return Math.max(maxLength, String(value ?? '').length);
    }, 0);

    return {
      wch: Math.min(52, Math.max(12, headerLength + 3, maxValueLength + 2))
    };
  });
}

function applyHeaderStyle(worksheet, headerRowIndex, columnCount) {
  for (let col = 0; col < columnCount; col += 1) {
    const cellAddress = encodeCell(headerRowIndex, col);
    const cell = worksheet[cellAddress];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, color: { rgb: 'FFFFFFFF' } },
      fill: { fgColor: { rgb: 'FF1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };
  }
}

function applyMetaStyle(worksheet, metadataRowCount, columnCount, hasTitle, hasSubtitle) {
  const maxCol = Math.max(0, columnCount - 1);

  if (hasTitle) {
    styleMetaRow(worksheet, 0, maxCol, {
      font: { bold: true, sz: 14, color: { rgb: 'FF0F172A' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
  }

  if (hasSubtitle) {
    const subtitleRow = hasTitle ? 1 : 0;
    styleMetaRow(worksheet, subtitleRow, maxCol, {
      font: { italic: true, sz: 11, color: { rgb: 'FF334155' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
  }

  const generatedRow = Math.max(0, metadataRowCount - 2);
  styleMetaRow(worksheet, generatedRow, maxCol, {
    font: { sz: 10, color: { rgb: 'FF475569' } },
    alignment: { horizontal: 'left', vertical: 'center' }
  });
}

function styleMetaRow(worksheet, rowIndex, maxCol, style) {
  for (let col = 0; col <= maxCol; col += 1) {
    const address = encodeCell(rowIndex, col);
    const cell = worksheet[address];
    if (!cell) continue;
    cell.s = style;
  }
}

function encodeCell(row, col) {
  const XLSX = globalThis?.XLSX;
  if (!XLSX?.utils?.encode_cell) {
    return 'A1';
  }
  return XLSX.utils.encode_cell({ r: row, c: col });
}

function escapeCsv(value) {
  const normalized = value === undefined || value === null ? '' : String(value);
  if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
