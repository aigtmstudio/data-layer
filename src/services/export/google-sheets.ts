import { google } from 'googleapis';
import { logger } from '../../lib/logger.js';

type ListRow = Record<string, unknown>;

export async function exportToGoogleSheets(
  data: ListRow[],
  destination: { spreadsheetId: string; sheetName?: string },
): Promise<{ url: string; recordsExported: number }> {
  const email = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error('Google Sheets credentials not configured');
  }

  const auth = new google.auth.JWT(
    email,
    undefined,
    privateKey.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets'],
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName = destination.sheetName ?? 'Export';

  if (data.length === 0) {
    return {
      url: `https://docs.google.com/spreadsheets/d/${destination.spreadsheetId}`,
      recordsExported: 0,
    };
  }

  const headers = Object.keys(data[0]).map(formatHeader);
  const rows = data.map(row => Object.values(row).map(v => v ?? ''));
  const values = [headers, ...rows];

  // Clear existing data
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: destination.spreadsheetId,
      range: `${sheetName}!A:Z`,
    });
  } catch {
    // Sheet might not exist yet, that's fine
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: destination.spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  logger.info(
    { spreadsheetId: destination.spreadsheetId, rows: data.length },
    'Exported to Google Sheets',
  );

  return {
    url: `https://docs.google.com/spreadsheets/d/${destination.spreadsheetId}`,
    recordsExported: data.length,
  };
}

function formatHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}
