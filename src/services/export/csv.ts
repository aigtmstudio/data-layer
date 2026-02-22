import ExcelJS from 'exceljs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { nanoid } from 'nanoid';

type ListRow = Record<string, unknown>;

export async function exportToCsv(
  data: ListRow[],
  format: 'csv' | 'excel',
): Promise<{ filePath: string; recordsExported: number }> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('List Export');

  if (data.length === 0) {
    const filePath = join(tmpdir(), `export-empty-${nanoid(8)}.${format === 'csv' ? 'csv' : 'xlsx'}`);
    if (format === 'csv') {
      await writeFile(filePath, '');
    } else {
      await workbook.xlsx.writeFile(filePath);
    }
    return { filePath, recordsExported: 0 };
  }

  // Headers from first row keys
  const headers = Object.keys(data[0]).map(key => ({
    header: formatHeader(key),
    key,
    width: 20,
  }));
  worksheet.columns = headers;

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8E8E8' },
  };

  // Add data rows
  for (const row of data) {
    worksheet.addRow(row);
  }

  const ext = format === 'csv' ? 'csv' : 'xlsx';
  const filePath = join(tmpdir(), `export-${nanoid(8)}.${ext}`);

  if (format === 'csv') {
    await workbook.csv.writeFile(filePath);
  } else {
    await workbook.xlsx.writeFile(filePath);
  }

  return { filePath, recordsExported: data.length };
}

function formatHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}
