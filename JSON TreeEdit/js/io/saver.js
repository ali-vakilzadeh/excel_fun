/* js/io/saver.js — Serialize + download the current document (classic script) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  var DEFAULTS = {
    indent: 2,               // spaces; 0 = compact
    ensureNewline: true,     // end file with \n
    validateBeforeSave: true // run Validator.inspect before writing
  };

  /** Derive a safe download filename from the current state. */
  function suggestFileName(originalName) {
    var base = originalName || "document.json";
    // Strip any directory components the browser may have included.
    base = base.replace(/^.*[\\\/]/, "");
    if (!/\.json$/i.test(base)) {
      // Replace a trailing non-json extension, or append .json.
      base = base.replace(/\.[^.]+$/, "") + ".json";
    }
    // Sanitize characters that are unsafe on Windows/macOS.
    base = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
    if (!base || base === ".json") base = "document.json";
    return base;
  }

  /**
   * Serialize the current root to a JSON string.
   * Returns { ok, text } or { ok: false, error }.
   */
  function serialize(opts) {
    var cfg = Object.assign({}, DEFAULTS, opts || {});

    if (!JTE.State.loaded) {
      return { ok: false, error: "No document is loaded." };
    }

    // Optional pre-save validation: refuse to write if unsafe keys exist?
    // No — we warn but still save, preserving the user's data exactly.
    if (cfg.validateBeforeSave && JTE.Validator) {
      var check = JTE.Validator.inspect(JTE.State.root);
      if (!check.ok && check.problems && check.problems.length) {
        // Surface as a warning, but continue.
        JTE.State.emit("save:warnings", { problems: check.problems.slice() });
      }
    }

    var text;
    try {
      text = JSON.stringify(JTE.State.root, null, cfg.indent);
    } catch (err) {
      return { ok: false, error: "Could not serialize document: " + (err.message || "unknown error") };
    }

    if (text === undefined) {
      // JSON.stringify(undefined) returns undefined; happens only if the
      // root itself is undefined, which loadDocument forbids, but guard anyway.
      return { ok: false, error: "Document serialized to undefined." };
    }

    if (cfg.ensureNewline && text.charAt(text.length - 1) !== "\n") {
      text += "\n";
    }

    return { ok: true, text: text };
  }

  /**
   * Trigger a browser download of `text` as `fileName`.
   * Works on both http(s) and file:// (Blob URLs are allowed on file://
   * in all current browsers).
   */
  function download(text, fileName) {
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    // Revoke on next tick so the click has been processed.
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    return { ok: true, fileName: fileName, bytes: blob.size };
  }

  /**
   * High-level: serialize + download. Clears the dirty flag on success.
   * opts: { indent, fileName, silent }
   */
  function save(opts) {
    opts = opts || {};
    var res = serialize(opts);
    if (!res.ok) {
      if (JTE.Toast) JTE.Toast.error(res.error);
      return res;
    }

    var name = opts.fileName || suggestFileName(JTE.State.fileName);
    var dl = download(res.text, name);

    // Mark clean only after the download has been triggered.
    JTE.State.setDirty(false);

    if (!opts.silent && JTE.Toast) {
      JTE.Toast.success("Saved " + name + " (" + formatBytes(dl.bytes) + ").");
    }

    JTE.State.emit("document:saved", { fileName: name, bytes: dl.bytes });
    return { ok: true, fileName: name, bytes: dl.bytes };
  }

  /** Save with a different filename via prompt (fallback when needed). */
  function saveAs(opts) {
    opts = opts || {};
    var suggested = opts.fileName || suggestFileName(JTE.State.fileName);
    var name = global.prompt("Save as:", suggested);
    if (name === null) return { ok: false, cancelled: true };
    name = name.trim();
    if (!name) return { ok: false, error: "Filename cannot be empty." };
    return save(Object.assign({}, opts, { fileName: suggestFileName(name) }));
  }

  /**
   * Copy the serialized JSON to the clipboard.
   * Returns a Promise because clipboard access is async.
   */
  function copyToClipboard(opts) {
    var res = serialize(opts);
    if (!res.ok) return Promise.resolve(res);

    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(res.text)
        .then(function () {
          if (JTE.Toast) JTE.Toast.success("JSON copied to clipboard.");
          return { ok: true };
        })
        .catch(function (err) {
          return { ok: false, error: "Clipboard write failed: " + (err.message || "unknown") };
        });
    }

    // Fallback: hidden textarea + execCommand.
    try {
      var ta = document.createElement("textarea");
      ta.value = res.text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok && JTE.Toast) JTE.Toast.success("JSON copied to clipboard.");
      return Promise.resolve({ ok: ok, error: ok ? null : "Copy command failed." });
    } catch (err) {
      return Promise.resolve({ ok: false, error: "Clipboard unavailable." });
    }
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  JTE.Saver = {
    serialize: serialize,
    save: save,
    saveAs: saveAs,
    download: download,
    copyToClipboard: copyToClipboard,
    suggestFileName: suggestFileName,
    DEFAULTS: DEFAULTS
  };
})(window);