const XLSX = require('xlsx');

const filePath = "C:\\Users\\minja\\Downloads\\SKOY NC, ST 10,12Line E1144,E1540 JC Master Schedule v12.xlsx";
console.log("Reading file:", filePath);

try {
  const wb = XLSX.readFile(filePath);
  console.log("Sheet names:", wb.SheetNames);
  
  wb.SheetNames.forEach(sheetName => {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    
    let rowCount = Math.min(rows.length, 50); // Inspect first 50 rows
    for (let i = 0; i < rowCount; i++) {
      const row = rows[i] || [];
      const nonNullRow = row.filter(cell => cell !== undefined && cell !== null && cell !== "");
      if (nonNullRow.length > 0) {
        console.log(`Row ${i+1}:`, JSON.stringify(nonNullRow).substring(0, 150));
      }
    }
  });
} catch (error) {
  console.error("Error reading file:", error.message);
}
