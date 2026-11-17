/* js/table/detect.js — Table heuristic (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  var DEFAULTS = {
    minRows: 1,              // an array of 1 object is a single-row table
    minColumns: 1,           // at least one column
    sharedKeyRatio: 0.5,     // >= 50% of keys must be shared across rows
    maxSampleRows: 200,      // sample size for large arrays
    rejectNestedDepth: 2     // cells deeper than this render as JSON strings
  };

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function isContainer(v) {
    return v !== null && typeof v === "object";
  }

  /**
   * Analyze an array and return a verdict object:
   *   {
   *     isTable: boolean,
   *     reason: string,
   *     columns: string[],       // ordered union of keys (first-seen order)
   *     rowCount: number,
   *     sampleSize: number,
   *     sharedRatio: number,     // 0..1
   *     hasNestedCells: boolean
   *   }
   */
  function detect(arr, opts) {
    var cfg = Object.assign({}, DEFAULTS, opts || {});
    var out = {
      isTable: false,
      reason: "",
      columns: [],
      rowCount: 0,
      sampleSize: 0,
      sharedRatio: 0,
      hasNestedCells: false
    };

    if (!Array.isArray(arr)) { out.reason = "not an array"; return out; }
    out.rowCount = arr.length;

    if (arr.length < cfg.minRows) {
      out.reason = "fewer than " + cfg.minRows + " row(s)";
      return out;
    }

    // Every element must be a plain object.
    var sample = arr.slice(0, cfg.maxSampleRows);
    for (var i = 0; i < sample.length; i++) {
      if (!isPlainObject(sample[i])) {
        out.reason = "element " + i + " is not a plain object";
        return out;
      }
    }
    out.sampleSize = sample.length;

    // Union of keys, preserving first-seen order.
    var columns = [];
    var seen = Object.create(null);
    for (var r = 0; r < sample.length; r++) {
      var keys = Object.keys(sample[r]);
      for (var k = 0; k < keys.length; k++) {
        if (!seen[keys[k]]) { seen[keys[k]] = true; columns.push(keys[k]); }
      }
    }

    if (columns.length < cfg.minColumns) {
      out.reason = "fewer than " + cfg.minColumns + " column(s)";
      return out;
    }
    out.columns = columns;

    // Shared-key ratio: for each row, fraction of union keys it actually has.
    // We average across sampled rows.
    var totalRatio = 0;
    var nested = false;
    for (var s = 0; s < sample.length; s++) {
      var row = sample[s];
      var present = 0;
      for (var c = 0; c < columns.length; c++) {
        if (Object.prototype.hasOwnProperty.call(row, columns[c])) {
          present++;
          if (isContainer(row[columns[c]])) {
            nested = true;
            // Check depth for the "nested cells" flag; we don't reject here.
            if (containerDepth(row[columns[c]]) > cfg.rejectNestedDepth) nested = true;
          }
        }
      }
      totalRatio += present / columns.length;
    }
    out.sharedRatio = totalRatio / sample.length;
    out.hasNestedCells = nested;

    if (out.sharedRatio < cfg.sharedKeyRatio) {
      out.reason = "shared-key ratio " + out.sharedRatio.toFixed(2) +
                   " below threshold " + cfg.sharedKeyRatio;
      return out;
    }

    out.isTable = true;
    out.reason = "ok";
    return out;
  }

  /** Depth of nesting inside a container (0 for a leaf value). */
  function containerDepth(v) {
    if (!isContainer(v)) return 0;
    var max = 0;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) {
        var d = 1 + containerDepth(v[i]);
        if (d > max) max = d;
      }
    } else {
      var ks = Object.keys(v);
      for (var j = 0; j < ks.length; j++) {
        var d2 = 1 + containerDepth(v[ks[j]]);
        if (d2 > max) max = d2;
      }
    }
    return max;
  }

  /** Convenience: detect + return a minimal safe summary (no raw values). */
  function summarize(arr, opts) {
    var v = detect(arr, opts);
    return {
      isTable: v.isTable,
      reason: v.reason,
      columns: v.columns.slice(),
      rowCount: v.rowCount,
      sharedRatio: v.sharedRatio,
      hasNestedCells: v.hasNestedCells
    };
  }

  JTE.TableDetect = {
    detect: detect,
    summarize: summarize,
    DEFAULTS: DEFAULTS
  };
})(window);