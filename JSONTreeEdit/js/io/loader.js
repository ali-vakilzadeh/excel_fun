/* js/io/loader.js — Load JSON from file / drop / paste / fetch (classic script) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  /** True when we're served over http(s) (GitHub Pages, local dev server). */
  function canFetch() {
    var p = global.location.protocol;
    return p === "http:" || p === "https:";
  }

  /** True when the page was opened directly from disk. */
  function isFileProtocol() {
    return global.location.protocol === "file:";
  }

  /**
   * Read a File/Blob as text. Wraps FileReader in a Promise so the rest of
   * the loader can use promise chaining uniformly.
   */
  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error("No file provided")); return; }
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () {
        reject(new Error("Could not read file: " + (reader.error && reader.error.message || "unknown error")));
      };
      reader.onabort = function () { reject(new Error("File read was aborted")); };
      reader.readAsText(file, "utf-8");
    });
  }

  /**
   * Central ingest point. Every transport funnels through here.
   * Emits:
   *   "load:error"   { source, error, problems? }
   * and on success delegates to JTE.State.loadDocument, which emits
   *   "document:loaded" { root, fileName }
   *
   * Returns a Promise resolving to { ok: true } or { ok: false, error }.
   */
  function ingest(text, fileName, source) {
    var result = JTE.Validator.parseAndInspect(text);

    if (!result.ok) {
      var err = result.error;
      JTE.State.emit("load:error", {
        source: source || "unknown",
        error: err,
        fileName: fileName || null
      });
      return Promise.resolve({ ok: false, error: err });
    }

    // Structural problems are warnings, not blockers — load anyway.
    if (result.problems && result.problems.length) {
      JTE.State.emit("load:warnings", {
        source: source || "unknown",
        fileName: fileName || null,
        problems: result.problems.slice()
      });
    }

    try {
      JTE.State.loadDocument(result.value, fileName || null);
    } catch (e) {
      JTE.State.emit("load:error", {
        source: source || "unknown",
        error: { message: e.message || "Failed to initialize document", line: null, column: null },
        fileName: fileName || null
      });
      return Promise.resolve({ ok: false, error: { message: e.message } });
    }

    return Promise.resolve({ ok: true });
  }

  // ---------- Transport 1: File input ----------

  /**
   * Wire an <input type="file" accept=".json,application/json"> to the loader.
   * The input is cleared after each use so the same file can be picked again.
   */
  function fromFileInput(inputEl) {
    if (!inputEl || inputEl.tagName !== "INPUT" || inputEl.type !== "file") {
      throw new Error("fromFileInput: expected <input type=file>");
    }
    inputEl.addEventListener("change", function () {
      var file = inputEl.files && inputEl.files[0];
      if (!file) return;
      loadFileObject(file, "file-input").then(function () {
        inputEl.value = ""; // allow re-selecting the same file
      });
    });
  }

  /** Load a File/Blob directly (used by drag-drop and the file input). */
  function loadFileObject(file, source) {
    return readFileAsText(file)
      .then(function (text) { return ingest(text, file.name, source); })
      .catch(function (e) {
        var err = { message: e.message || "Read failed", line: null, column: null };
        JTE.State.emit("load:error", { source: source || "file", error: err, fileName: file && file.name });
        return { ok: false, error: err };
      });
  }

  // ---------- Transport 2: Drag & drop ----------

  /**
   * Make a drop target accept .json files. Prevents the browser from
   * navigating away when the user misses the target.
   */
  function enableDropZone(el) {
    if (!el) throw new Error("enableDropZone: element required");

    function stop(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ["dragenter", "dragover", "dragleave", "drop"].forEach(function (name) {
      el.addEventListener(name, stop, false);
    });

    // Visual affordance hooks (CSS can style .jte-drop-active).
    el.addEventListener("dragenter", function () { el.classList.add("jte-drop-active"); });
    el.addEventListener("dragleave", function (e) {
      // Only remove when leaving the zone itself, not a child.
      if (!el.contains(e.relatedTarget)) el.classList.remove("jte-drop-active");
    });
    el.addEventListener("drop", function (e) {
      el.classList.remove("jte-drop-active");
      var dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) {
        JTE.State.emit("load:error", {
          source: "drop",
          error: { message: "No file dropped", line: null, column: null }
        });
        return;
      }
      // Handle only the first file; JSON is one document.
      var file = dt.files[0];
      if (!/\.json$/i.test(file.name) && file.type && file.type !== "application/json") {
        var msg = "Dropped file does not look like JSON: " + file.name;
        JTE.State.emit("load:error", { source: "drop", error: { message: msg, line: null, column: null } });
        return;
      }
      loadFileObject(file, "drop");
    });
  }

  // ---------- Transport 3: Paste ----------

  /**
   * Ingest raw text (e.g. from a textarea). `fileName` is optional and is
   * used only to suggest a default save name.
   */
  function fromText(text, fileName) {
    return ingest(text, fileName || null, "paste");
  }

  // ---------- Transport 4: fetch (GitHub Pages / dev server only) ----------

  /**
   * Load JSON from a URL. Only works over http(s); on file:// it fails fast
   * with a clear message so the caller can fall back to paste/file-input.
   */
  function fromUrl(url, fileNameHint) {
    if (!canFetch()) {
      var msg = isFileProtocol()
        ? "Cannot fetch " + url + " from a file:// page. Use the file picker or paste JSON instead."
        : "Cannot fetch " + url + " from this origin.";
      var err = { message: msg, line: null, column: null };
      JTE.State.emit("load:error", { source: "fetch", error: err });
      return Promise.resolve({ ok: false, error: err });
    }

    return fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
        return res.text();
      })
      .then(function (text) {
        var name = fileNameHint || url.split("/").pop() || "document.json";
        return ingest(text, name, "fetch");
      })
      .catch(function (e) {
        var err = { message: e.message || "Fetch failed", line: null, column: null };
        JTE.State.emit("load:error", { source: "fetch", error: err, url: url });
        return { ok: false, error: err };
      });
  }

  // ---------- Transport 5: Sample documents ----------

  /**
   * Load a bundled sample. On http(s) this fetches from assets/samples/;
   * on file:// it resolves against the same relative path via fetch() —
   * which browsers block — so we fall back to instructing the UI to prompt
   * the user. Callers should check `canFetch()` before offering samples.
   */
  function loadSample(name) {
    var safe = String(name || "").replace(/[^a-z0-9._-]/gi, "");
    if (!safe) {
      var err = { message: "Invalid sample name", line: null, column: null };
      JTE.State.emit("load:error", { source: "sample", error: err });
      return Promise.resolve({ ok: false, error: err });
    }
    return fromUrl("assets/samples/" + safe, safe);
  }

  JTE.Loader = {
    // capability checks
    canFetch: canFetch,
    isFileProtocol: isFileProtocol,

    // transports
    fromFileInput: fromFileInput,
    loadFileObject: loadFileObject,
    enableDropZone: enableDropZone,
    fromText: fromText,
    fromUrl: fromUrl,
    loadSample: loadSample,

    // low-level (exposed for tests / custom transports)
    readFileAsText: readFileAsText,
    ingest: ingest
  };
})(window);