/* js/app.js — Bootstrap and global wiring (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};
  var document = global.document;

  // ---------- Diagnostics ----------

  var REQUIRED = [
    "State", "Path",
    "Validator", "Loader", "Saver",
    "TreeView", "DetailView",
    "ScalarEditor", "ObjectView",
    "TableDetect", "TableView", "TableEdit",
    "Toolbar", "Splitter", "Toast"
  ];
  var OPTIONAL = ["SearchBar"];

  function reportMissingModules() {
    var missing = REQUIRED.filter(function (name) { return !JTE[name]; });
    if (missing.length) {
      var msg = "[JTE] Missing modules: " + missing.join(", ") +
        ". Check script tag order in index.html.";
      console.error(msg);
      // Still try to show a toast if Toast itself loaded.
      if (JTE.Toast) JTE.Toast.error("Startup error: missing modules (" + missing.join(", ") + ").");
      return false;
    }
    var optionalMissing = OPTIONAL.filter(function (name) { return !JTE[name]; });
    if (optionalMissing.length) {
      console.warn("[JTE] Optional modules not loaded:", optionalMissing.join(", "));
    }
    return true;
  }

  // ---------- URL parameter helpers ----------

  function getParam(name) {
    try {
      var params = new URLSearchParams(global.location.search);
      return params.get(name);
    } catch (e) {
      // Very old browsers without URLSearchParams; parse manually.
      var m = new RegExp("[?&]" + name + "=([^&]*)").exec(global.location.search || "");
      return m ? decodeURIComponent(m[1]) : null;
    }
  }

  function loadFromUrlParam() {
    var sample = getParam("sample");
    if (sample) {
      if (!JTE.Loader.canFetch()) {
        JTE.Toast.warn(
          "Sample '" + sample + "' requires the app to be served over http(s) " +
          "(GitHub Pages). Paste JSON or use the file picker instead.",
          7000
        );
        return false;
      }
      // Sanitize to prevent path traversal.
      var safe = String(sample).replace(/[^a-z0-9._-]/gi, "");
      if (!safe) {
        JTE.Toast.error("Invalid sample name in URL.");
        return false;
      }
      JTE.Loader.fromUrl("assets/samples/" + safe + ".json");
      return true;
    }

    var url = getParam("url");
    if (url) {
      if (!JTE.Loader.canFetch()) {
        JTE.Toast.warn("Cannot load remote JSON from a file:// page.", 6000);
        return false;
      }
      // Only allow http(s) to avoid javascript: / data: abuse.
      if (!/^https?:\/\//i.test(url)) {
        JTE.Toast.error("Refusing non-http(s) URL in ?url= parameter.");
        return false;
      }
      JTE.Loader.fromUrl(url);
      return true;
    }

    return false;
  }

  // ---------- Default document ----------

  /**
   * On first visit with no document, load a small starter so the user sees
   * a populated tree and can immediately explore the UI.
   */
  function loadStarterDocument() {
    if (JTE.State.loaded) return;
    var starter = {
      meta: {
        title: "JSON Tree Editor",
        version: "0.1.0",
        editable: true
      },
      users: [
        { id: 1, name: "Ada Lovelace", role: "admin", active: true },
        { id: 2, name: "Alan Turing", role: "editor", active: true },
        { id: 3, name: "Grace Hopper", role: "viewer", active: false }
      ],
      config: {
        theme: "light",
        maxDepth: 12,
        features: ["tree", "table", "search"]
      },
      emptyArray: [],
      emptyObject: {},
      nullable: null
    };
    JTE.State.loadDocument(starter, "starter.json");
    JTE.State.setDirty(false); // starter is not the user's data; start clean
  }

  // ---------- Error handling ----------

  function wireGlobalErrorHandlers() {
    // Uncaught errors → toast (but don't swallow; still log to console).
    global.addEventListener("error", function (e) {
      console.error("[JTE] Uncaught error:", e.error || e.message);
      if (JTE.Toast) JTE.Toast.error("Unexpected error: " + (e.message || "see console"), 7000);
    });

    global.addEventListener("unhandledrejection", function (e) {
      console.error("[JTE] Unhandled rejection:", e.reason);
      var msg = e.reason && e.reason.message ? e.reason.message : String(e.reason || "unknown");
      if (JTE.Toast) JTE.Toast.error("Async error: " + msg, 7000);
    });

    // Surface save warnings (unsafe keys preserved, etc.).
    JTE.State.on("save:warnings", function (p) {
      var n = (p.problems && p.problems.length) || 0;
      if (n) JTE.Toast.warn(n + " warning(s) saved: " + p.problems[0] + (n > 1 ? " …" : ""), 7000);
    });
  }

  // ---------- Keyboard shortcuts (beyond toolbar's) ----------

  function wireExtraShortcuts(toolbarHandle) {
    document.addEventListener("keydown", function (e) {
      // Ctrl+Shift+F → open expanded search panel (if present).
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        if (JTE.SearchBar && JTE.SearchBar._instance) {
          e.preventDefault();
          JTE.SearchBar._instance.open();
        } else if (toolbarHandle) {
          // Fallback: focus the toolbar's quick search.
          e.preventDefault();
          toolbarHandle.focusSearch();
        }
      }
    });
  }

  // ---------- Main bootstrap ----------

  function boot() {
    // 1. Report missing scripts before doing anything else.
    if (!reportMissingModules()) return;

    // 2. Toast should be wired first so all subsequent errors are visible.
    if (typeof JTE.Toast.wireStateEvents === "function") {
      JTE.Toast.wireStateEvents();
    }

    // 3. Locate required DOM nodes.
    var toolbarHost = document.getElementById("toolbar");
    var treeHost = document.getElementById("tree-pane");
    var detailHost = document.getElementById("detail-pane");
    var splitterHandle = document.getElementById("splitter");
    var appGrid = document.getElementById("app");
    var searchBarHost = document.getElementById("search-bar-host");

    if (!toolbarHost || !treeHost || !detailHost || !splitterHandle || !appGrid) {
      console.error("[JTE] Missing required DOM nodes. Expected #toolbar, #tree-pane, #detail-pane, #splitter, #app.");
      JTE.Toast.error("Page layout is incomplete. Check index.html.");
      return;
    }

    // 4. Mount the toolbar (owns file input, drop zone, quick search).
    var toolbarHandle = JTE.Toolbar.mount(toolbarHost, {
      onSave: function () { JTE.Saver.save(); },
      onValidate: function () {
        var res = JTE.Validator.inspect(JTE.State.root);
        if (res.ok) JTE.Toast.success("Document is valid.");
        else JTE.Toast.warn(res.problems.join(" "), 6000);
      },
      onSearch: function (q) {
        // The toolbar's own input already calls TreeView.applyFilter;
        // we only mirror the query into State so search:changed fires.
        if (!q) {
          JTE.TreeView.clearFilter();
          JTE.State.setSearch("", []);
        } else {
          var matches = (JTE.SearchBar && JTE.SearchBar.collectMatches)
            ? JTE.SearchBar.collectMatches(JTE.State.root, q)
            : [];
          JTE.State.setSearch(q, matches);
        }
      }
    });

    // 5. Mount the panes.
    JTE.TreeView.mount(treeHost);
    JTE.DetailView.mount(detailHost);

    // 6. Optional expanded search panel.
    if (JTE.SearchBar && searchBarHost) {
      JTE.SearchBar._instance = JTE.SearchBar.mount(searchBarHost);
    }

    // 7. Resizable split.
    JTE.Splitter.mount(appGrid, splitterHandle);

    // 8. Global error + save-warning handling.
    wireGlobalErrorHandlers();

    // 9. Extra keyboard shortcuts.
    wireExtraShortcuts(toolbarHandle);

    // 10. URL params first, then starter document if nothing loaded.
    var urlLoaded = loadFromUrlParam();
    if (!urlLoaded) {
      // Defer one tick so panes finish mounting their listeners.
      setTimeout(loadStarterDocument, 0);
    }

    // 11. Announce readiness (useful for tests and for anyone hooking in).
    JTE.State.emit("app:ready", { version: "0.1.0" });
    console.info("[JTE] Ready. Use ?sample=tree or ?sample=table on GitHub Pages to load demos.");
  }

  // ---------- Kick off ----------

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    // Script loaded after DOMContentLoaded (e.g. defer ordering surprises).
    boot();
  }

  // Expose for debugging in the console.
  JTE.App = {
    boot: boot,
    version: "0.1.0",
    loadFromUrlParam: loadFromUrlParam,
    loadStarterDocument: loadStarterDocument
  };
})(window);