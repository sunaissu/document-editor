export type TableAction = "row-above" | "row-below" | "delete-row" | "column-before" | "column-after" | "delete-column" | "align-left" | "align-center" | "align-right" | "delete-table";

/** Mutate only the selected table; return the cell that should receive focus. */
export function editTable(cell: HTMLTableCellElement, action: TableAction): HTMLElement | null {
  const table = cell.closest("table");
  if (!table) return null;
  const rows = Array.from(table.rows), row = cell.parentElement as HTMLTableRowElement;
  const rowIndex = rows.indexOf(row), column = cell.cellIndex;
  if (action === "delete-table") { const next = table.ownerDocument.createElement("p"); next.appendChild(table.ownerDocument.createElement("br")); table.replaceWith(next); return next; }
  if (action.startsWith("align-")) {
    rows.forEach(row => { if (row.cells[column]) row.cells[column].style.textAlign = action.slice(6); });
    return cell;
  }
  if (action === "delete-row") {
    if (rowIndex === 0) return cell;
    row.remove(); return rows[rowIndex - 1].cells[column] || rows[0].cells[0];
  }
  if (action === "row-above" || action === "row-below") {
    if (rows.length >= 201) return cell;
    const at = Math.max(1, rowIndex + (action === "row-below" ? 1 : 0));
    const body = table.tBodies[0] || table.createTBody();
    const next = table.ownerDocument.createElement("tr");
    Array.from(rows[0].cells).forEach(header => { const td = next.insertCell(); td.style.textAlign = header.style.textAlign; td.appendChild(table.ownerDocument.createElement("br")); });
    if (rows[at]) rows[at].before(next); else body.appendChild(next);
    return next.cells[column] || next.cells[0];
  }
  const deleting = action === "delete-column";
  if ((deleting && rows[0].cells.length <= 1) || (!deleting && rows[0].cells.length >= 50)) return cell;
  const at = column + (action === "column-after" ? 1 : 0);
  rows.forEach((row, index) => {
    if (deleting) { row.deleteCell(column); return; }
    const next = table.ownerDocument.createElement(index === 0 ? "th" : "td");
    next.appendChild(table.ownerDocument.createElement("br"));
    row.insertBefore(next, row.cells[at] || null);
  });
  return row.cells[Math.min(at, row.cells.length - 1)];
}
