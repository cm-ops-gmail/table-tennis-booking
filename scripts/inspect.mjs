import 'dotenv/config';
import { google } from 'googleapis';

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  undefined,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

const meta = await sheets.spreadsheets.get({ spreadsheetId });
console.log('TITLE:', meta.data.properties.title);
for (const s of meta.data.sheets) {
  const p = s.properties;
  console.log(`\n=== TAB: "${p.title}" (id=${p.sheetId}) rows=${p.gridProperties.rowCount} cols=${p.gridProperties.columnCount} ===`);
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${p.title}!A1:Z15`,
    });
    const rows = r.data.values || [];
    rows.forEach((row, i) => console.log(String(i + 1).padStart(2), '|', row.join(' | ')));
  } catch (e) {
    console.log('  (could not read values:', e.message, ')');
  }
}
