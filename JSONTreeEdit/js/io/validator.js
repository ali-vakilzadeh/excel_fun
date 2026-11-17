/* js/io/validator.js — Parse + validate JSON (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  var UNSAFE_KEYS = { __proto__: true, constructor: true, prototype: true };

  /**
   * Parse a JSON string.
   * Returns one of:
   *   { ok: true,  value }
   *   { ok: false, error: { message, line, column, position } }
   *
   * Line/column are derived from the native SyntaxError position when the
   * engine provides one (V8 does via `err.message`; some engines expose
   * position via `err.lineNumber`/`err.columnNumber`). We fall back to
   * scanning the message text for "(line X column Y)".
   */
  function parse(text) {
    if (typeof text !== "string") {
      return fail("Input must be a string", null);
    }
    // Strip a UTF-8 BOM if present (common in files saved by Windows editors).
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    if (text.trim() === "") {
      return fail("Document is empty", null);
    }

    try {
      var value = JSON.parse(text);
      return { ok: true, value: value };
    } catch (err) {
      return fail(err.message || "Invalid JSON", err);
    }
  }

  function fail(message, err) {
    var line = null, column = null, position = null;

    if (err) {
      if (typeof err.lineNumber === "number") line = err.lineNumber;
      if (typeof err.columnNumber === "number") column = err.columnNumber;
      if (typeof err.position === "number") position = err.position;
    }

    // Fallback: V8 embeds "(line N column M)" in the message.
    var m = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
    if (m) {
      line = parseInt(m[1], 10);
      column = parseInt(m[2], 10);
    }

    return {
      ok: false,
      error: { message: message, line: line, column: column, position: position }
    };
  }

  /**
   * Structural sanity check of a parsed value.
   * Returns { ok: true } or { ok: false, problems: [string] }.
   *
   * We *do not* reject documents for having unsafe keys — we only report
   * them, because some users legitimately edit such data. Path utilities
   * already refuse to traverse into them, so the editor stays safe.
   */
  function inspect(value) {
    var problems = [];
    var unsafe = [];
    var depth = 0;
    var MAX_DEPTH = 1000;

    // Iterative walk to avoid stack overflow on pathological input.
    // Each frame: { node, path, depth }
    var stack = [{ node: value, path: [], depth: 0 }];

    while (stack.length) {
      var frame = stack.pop();
      var node = frame.node;
      if (frame.depth > MAX_DEPTH) {
        problems.push("Maximum nesting depth (" + MAX_DEPTH + ") exceeded at " +
          JTE.Path ? JTE.Path.toString(frame.path) : "<path>");
        break;
      }
      if (node === null || typeof node !== "object") continue;

      if (Array.isArray(node)) {
        for (var i = node.length - 1; i >= 0; i--) {
          stack.push({ node: node[i], path: frame.path.concat([i]), depth: frame.depth + 1 });
        }
      } else {
        var keys = Object.keys(node);
        for (var k = keys.length - 1; k >= 0; k--) {
          var key = keys[k];
          if (UNSAFE_KEYS[key]) {
            unsafe.push(frame.path.concat([key]));
            continue; // do not traverse into unsafe keys
          }
          stack.push({ node: node[key], path: frame.path.concat([key]), depth: frame.depth + 1 });
        }
      }
    }

    if (unsafe.length) {
      var sample = unsafe.slice(0, 5).map(function (p) {
        return JTE.Path ? JTE.Path.toString(p) : JSON.stringify(p);
      }).join(", ");
      problems.push(
        "Document contains " + unsafe.length + " unsafe key(s) (__proto__/constructor/prototype): " +
        sample + (unsafe.length > 5 ? ", …" : "") +
        ". These are preserved on save but cannot be edited in the tree."
      );
    }

    if (problems.length) return { ok: false, problems: problems };
    return { ok: true, problems: [] };
  }

  /** Convenience: parse + inspect in one call. */
  function parseAndInspect(text) {
    var parsed = parse(text);
    if (!parsed.ok) return parsed;
    var check = inspect(parsed.value);
    return { ok: true, value: parsed.value, problems: check.problems || [] };
  }

  JTE.Validator = {
    parse: parse,
    inspect: inspect,
    parseAndInspect: parseAndInspect
  };
})(window);