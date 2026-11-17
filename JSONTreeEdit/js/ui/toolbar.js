/* js/ui/toolbar.js — Top toolbar (load/save/validate/sample/search) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function btn(label, cls) {
    var b = el("button", "jte-btn " + (cls || ""));
    b.type = "button";
    b.textContent = label;
    return b;
  }

  /**
   * Mount the toolbar into `host`.
   * opts: { onSave: fn(), onValidate: fn(), onSearch: fn(query), onClearSearch: fn() }
   */
  function mount(host, opts) {
    if (!host) throw new Error("Toolbar.mount: host required");
    opts = opts || {};
    host.innerHTML = "";
    host.classList.add("jte-toolbar");

    // --- Brand / file label ------------------------------------------------
    var brand = el("div", "jte-toolbar-brand");
    var title = el("span", "jte-toolbar-title", "JSON Tree Editor");
    brand.appendChild(title);
    var fileLabel = el("span", "jte-toolbar-file", "no file");
    brand.appendChild(fileLabel);
    var dirtyDot = el("span", "jte-toolbar-dirty", "");
    dirtyDot.title = "Unsaved changes";
    dirtyDot.hidden = true;
    brand.appendChild(dirtyDot);
    host.appendChild(brand);

    // --- Action buttons -----------------------------------------------------
    var actions = el("div", "jte-toolbar-actions");

    var loadBtn = btn("Load", "jte-btn-primary");
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.className = "jte-hidden-input";
    fileInput.id = "jte-file-input";
    loadBtn.addEventListener("click", function () { fileInput.click(); });
    actions.appendChild(loadBtn);
    actions.appendChild(fileInput);

    var saveBtn = btn("Save");
    saveBtn.addEventListener("click", function () {
      if (!JTE.State.loaded) { JTE.Toast.info("Nothing to save yet."); return; }
      if (opts.onSave) opts.onSave();
      else if (JTE.Saver) JTE.Saver.save();
    });
    actions.appendChild(saveBtn);

    var validateBtn = btn("Validate");
    validateBtn.addEventListener("click", function () {
      if (!JTE.State.loaded) { JTE.Toast.info("Load a document first."); return; }
      if (opts.onValidate) opts.onValidate();
      else {
        var res = JTE.Validator.inspect(JTE.State.root);
        if (res.ok) JTE.Toast.success("Document is valid.");
        else JTE.Toast.warn(res.problems.join(" "), 6000);
      }
    });
    actions.appendChild(validateBtn);

    // Sample dropdown — only enabled when fetch is available.
    var sampleWrap = el("span", "jte-sample-wrap");
    var sampleBtn = btn("Samples ▾");
    var sampleMenu = el("div", "jte-menu");
    sampleMenu.hidden = true;
    [
      { file: "sample-tree.json", label: "Nested tree" },
      { file: "sample-table.json", label: "Table (array of objects)" }
    ].forEach(function (s) {
      var item = el("button", "jte-menu-item", s.label);
      item.type = "button";
      item.addEventListener("click", function () {
        sampleMenu.hidden = true;
        JTE.Loader.loadSample(s.file);
      });
      sampleMenu.appendChild(item);
    });
    sampleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      sampleMenu.hidden = !sampleMenu.hidden;
    });
    document.addEventListener("click", function () { sampleMenu.hidden = true; });
    sampleWrap.appendChild(sampleBtn);
    sampleWrap.appendChild(sampleMenu);
    if (JTE.Loader && !JTE.Loader.canFetch()) {
      sampleBtn.disabled = true;
      sampleBtn.title = "Samples require GitHub Pages (http/https). Paste JSON instead.";
    }
    actions.appendChild(sampleWrap);

    var clearBtn = btn("Close");
    clearBtn.addEventListener("click", function () {
      if (!JTE.State.loaded) return;
      if (JTE.State.dirty && !global.confirm("Discard unsaved changes?")) return;
      JTE.State.clearDocument();
    });
    actions.appendChild(clearBtn);

    host.appendChild(actions);

    // --- Search -------------------------------------------------------------
    var search = el("div", "jte-toolbar-search");
    var searchIcon = el("span", "jte-search-icon", "\u2315"); // ⌕
    searchIcon.setAttribute("aria-hidden", "true");
    search.appendChild(searchIcon);

    var searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "jte-search-input";
    searchInput.placeholder = "Search keys…";
    searchInput.setAttribute("aria-label", "Search keys");
    search.appendChild(searchInput);

    var searchCount = el("span", "jte-search-count", "");
    search.appendChild(searchCount);

    var searchClear = btn("✕", "jte-btn-tiny jte-search-clear");
    searchClear.hidden = true;
    search.appendChild(searchClear);

    host.appendChild(search);

    // --- Wiring -------------------------------------------------------------

    JTE.Loader.fromFileInput(fileInput);

    // App shell is the drop zone. app.js mounts the toolbar into the shell,
    // so its parentElement is the natural target.
    if (host.parentElement) {
      JTE.Loader.enableDropZone(host.parentElement);
    }

    function runSearch() {
      var q = searchInput.value.trim();
      if (opts.onSearch) opts.onSearch(q);
      else JTE.TreeView.applyFilter(q);
      searchClear.hidden = !q;
    }

    var debounceTimer = null;
    searchInput.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSearch, 120);
    });
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        searchInput.value = "";
        runSearch();
        searchInput.blur();
      } else if (e.key === "Enter") {
        e.preventDefault();
        runSearch();
      }
    });
    searchClear.addEventListener("click", function () {
      searchInput.value = "";
      runSearch();
      searchInput.focus();
    });

    // --- State reactions ----------------------------------------------------

    function refreshFileLabel() {
      var name = JTE.State.fileName || (JTE.State.loaded ? "untitled.json" : "no file");
      fileLabel.textContent = name;
      fileLabel.title = name;
    }
    function refreshDirty() {
      dirtyDot.hidden = !JTE.State.dirty;
      var base = JTE.State.fileName || (JTE.State.loaded ? "untitled.json" : "no file");
      document.title = (JTE.State.dirty ? "• " : "") + base + " — JSON Tree Editor";
    }
    function refreshEnabled() {
      var loaded = JTE.State.loaded;
      saveBtn.disabled = !loaded;
      validateBtn.disabled = !loaded;
      clearBtn.disabled = !loaded;
      searchInput.disabled = !loaded;
    }

    JTE.State.on("document:loaded", function () {
      refreshFileLabel(); refreshDirty(); refreshEnabled();
      searchInput.value = "";
      searchCount.textContent = "";
      searchClear.hidden = true;
    });
    JTE.State.on("document:cleared", function () {
      refreshFileLabel(); refreshDirty(); refreshEnabled();
      searchCount.textContent = "";
      searchClear.hidden = true;
    });
    JTE.State.on("dirty:changed", function () { refreshDirty(); });
    JTE.State.on("search:changed", function (p) {
      if (p.query) searchCount.textContent = p.matches.length + " hit(s)";
      else searchCount.textContent = "";
    });

    // --- Keyboard shortcuts -------------------------------------------------

    document.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var key = e.key.toLowerCase();
      if (key === "o") { e.preventDefault(); fileInput.click(); }
      else if (key === "s") {
        e.preventDefault();
        if (JTE.State.loaded) (opts.onSave || (JTE.Saver && JTE.Saver.save))();
      } else if (key === "f") {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });

    // Warn on unload if dirty.
    global.addEventListener("beforeunload", function (e) {
      if (!JTE.State.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    });

    refreshFileLabel();
    refreshDirty();
    refreshEnabled();

    return {
      searchInput: searchInput,
      focusSearch: function () { searchInput.focus(); searchInput.select(); }
    };
  }

  JTE.Toolbar = { mount: mount };
})(window);