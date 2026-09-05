const XLSX = require('xlsx');
const files = ['upload-vehicles.xlsx','upload-tyres.xlsx','upload-activity.xlsx','upload-fuel.xlsx'];
files.forEach(f => {
  try {
    const wb = XLSX.readFile(f);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const d = XLSX.utils.sheet_to_json(ws, {header:1});
    console.log(f + ': ' + wb.SheetNames[0] + ', ' + (d.length-1) + ' rows, cols: ' + JSON.stringify(d[0]));
  } catch(e) { console.log(f + ': MISSING - ' + e.message); }
});
