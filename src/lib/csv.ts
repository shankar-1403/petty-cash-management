/**
 * Indian grouping (e.g. 10,00,000) for CSV amount columns;
 * returns empty string if the value is empty.
 */
export function formatAmountForCsv(value: string | number | null | undefined): string {
  if (value === '' || value == null) return '';

  const n = Number.parseFloat(String(value).replace(/,/g, ''));

  if (Number.isNaN(n)) return String(value);

  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Escapes CSV cells and prevents Excel formula injection.
 */
function escapeCsvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '');

  // Excel treats leading = + - @ tab CR as formula/syntax
  // when opening CSV, so quote these values as text.
  const excelNeedsQuotes =
    /^[=+\-@\t\r]/.test(text) ||
    text.includes('"') ||
    text.includes(',') ||
    text.includes('\n') ||
    text.includes('\r');

  if (excelNeedsQuotes) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const headerLine = headers.map(escapeCsvCell).join(',');

  const bodyLines = rows.map((row) =>
    row.map(escapeCsvCell).join(',')
  );

  const csv = [headerLine, ...bodyLines].join('\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export function inDateRange(
  leadDate: string | null | undefined,
  fromDate: string | null | undefined,
  toDate: string | null | undefined
): boolean {
  if (!fromDate && !toDate) return true;

  if (!leadDate) return false;

  if (fromDate && leadDate < fromDate) return false;

  if (toDate && leadDate > toDate) return false;

  return true;
}