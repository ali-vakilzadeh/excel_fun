/* js/table/table-edit.js — Cell-level mutations for table view */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  /**
   * Set a cell value.
   * root      — the document root
   * basePath  — path to the array
   * rowIndex  — array index
   * col       — object key
   * value     — new value
   * Returns { ok, replaced }.
   */
  function setCell(root, basePath, rowIndex, col, value) {
    var res = JTE.Path.getByPath(root, basePath);
    if (!res.found || !Array.isArray(res.value)) {
      return { ok: false, reason: "array not found" };
    }
    var row = res.value[rowIndex];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "row is not an object" };
    }
    if (col === "__proto__" || col === "constructor" || col === "prototype") {
      return { ok: false, reason: "unsafe column key" };
    }
    row[col] = value;
    return { ok: true, replaced: false };
  }

  /**
   * Insert a row at `index` (default: end).
   * rowValue defaults to an empty object.
   */
  function insertRow(root, basePath, index, rowValue) {
    var res = JTE.Path.getByPath(root, basePath);
    if (!res.found || !Array.isArray(res.value)) {
      return { ok: false, reason: "array not found" };
    }
    var arr = res.value;
    var idx = (index === undefined || index === null) ? arr.length : index;
    if (!Number.isInteger(idx) || idx < 0 || idx > arr.length) {
      return { ok: false, reason: "invalid row index" };
    }
    arr.splice(idx, 0, rowValue && typeof rowValue === "object" ? rowValue : {});
    return { ok: true, path: basePath.concat([idx]) };
  }

  /** Delete the row at `index`. */
  function deleteRow(root, basePath, index) {
    var res = JTE.Path.getByPath(root, basePath);
    if (!res.found || !Array.isArray(res.value)) {
      return { ok: false, reason: "array not found" };
    }
    var arr = res.value;
    if (!Number.isInteger(index) || index < 0 || index >= arr.length) {
      return { ok: false, reason: "index out of range" };
    }
    arr.splice(index, 1);
    return { ok: true };
  }

  /**
   * Add a column to every row in the array.
   * Missing values default to `""`.
   */
  function addColumn(root, basePath, col, defaultValue) {
    if (col === "__proto__" || col === "constructor" || col === "prototype") {
      return { ok: false, reason: "unsafe column key" };
    }
    var res = JTE.Path.getByPath(root, basePath);
    if (!res.found || !Array.isArray(res.value)) {
      return { ok: false, reason: "array not found" };
    }
    var dflt = defaultValue === undefined ? "" : defaultValue;
    res.value.forEach(function (row) {
      if (row !== null && typeof row === "object" && !Array.isArray(row)) {
        if (!Object.prototype.hasOwnProperty.call(row, col)) row[col] = dflt;
      }
    });
    return { ok: true };
  }

  /**
   * Remove a column from every row in the array.
   */
  function deleteColumn(root, basePath, col) {
    var res = JTE.Path.getByPath(root, basePath);
    if (!res.found || !Array.isArray(res.value)) {
      return { ok: false, reason: "array not found" };
    }
    res.value.forEach(function (row) {
      if (row !== null && typeof row === "object" && !Array.isArray(row)) {
        delete row[col];
      }
    });
    return { ok: true };
  }

  JTE.TableEdit = {
    setCell: setCell,
    insertRow: insertRow,
    deleteRow: deleteRow,
    addColumn: addColumn,
    deleteColumn: deleteColumn
  };
})(window);