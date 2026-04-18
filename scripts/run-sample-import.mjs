import path from "node:path";
import XLSX from "xlsx";

const cwd = process.cwd();

function readRows(fileName) {
  const workbook = XLSX.readFile(path.join(cwd, fileName), { cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    defval: "",
    raw: false
  });
}

const solutionRows = readRows("solution_data_1776533608338.xlsx");
const traderRows = readRows("trader_data_1776533597806.xlsx");

console.log(
  JSON.stringify(
    {
      solutionRows: solutionRows.length,
      traderRows: traderRows.length,
      solutionColumns: Object.keys(solutionRows[0] || {}),
      traderColumns: Object.keys(traderRows[0] || {}),
      firstSolutionRow: solutionRows[0] || null,
      firstTraderRow: traderRows[0] || null
    },
    null,
    2
  )
);
