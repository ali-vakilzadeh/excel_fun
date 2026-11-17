/* js/ui/search-bar.js — Expanded search panel with next/prev navigation */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /**
   * Mount the search panel into `host`. It stays collapsed until the user
   * presses Ctrl+Shift+F or calls `open()`.
   */
  function mount(host) {
    if (!host) throw new Error("SearchBar.mount: host required");
    host.innerHTML = "";
    host.classList.add("jte-search-bar");
    host.hidden = true;

    var label = el("label", "jte-search-bar-label", "Find keys/values:");
    host.appendChild(label);

    var input = document.createElement("input");
    input.type = "search";
    input.className = "jte-search-bar-input";
    input.placeholder = "substring, case-insensitive";
    input.id = "jte-search-bar-input";
    label.htmlFor = input.id;
    host.appendChild(input);

    var count = el("span", "jte-search-bar-count", "");
    host.appendChild(count);

    var prevBtn = el("button", "jte-btn jte-btn-tiny", "▲");
    prevBtn.type = "button";
    prevBtn.title = "Previous hit";
    host.appendChild(prevBtn);

    var nextBtn = el("button", "jte-btn jte-btn-tiny", "▼");
    nextBtn.type = "button";
    nextBtn.title = "Next hit";
    host.appendChild(nextBtn);

    var closeBtn = el("button", "jte-btn jte-btn-tiny", "✕");
    closeBtn.type = "button";
    closeBtn.title = "Close search";
    host.appendChild(closeBtn);

    var hits = [];
    var cursor = -1;

    function setHits(matches) {
      hits = Array.isArray(matches) ? matches.slice() : [];
      cursor = hits.length ? 0 : -1;
      count.textContent = hits.length ? (cursor + 1) + " / " + hits.length : "0 / 0";
      if (cursor >= 0) focusHit();
    }

    function focusHit() {
      if (cursor < 0 || cursor >= hits.length) return;
      JTE.State.setSelection(hits[cursor]);
    }

    function step(dir) {
      if (!hits.length) return;
      cursor = (cursor + dir + hits.length) % hits.length;
      count.textContent = (cursor + 1) + " / " + hits.length;
      focusHit();
    }

    input.addEventListener("input", function () {
      var q = input.value.trim();
      if (!q) {
        JTE.TreeView.clearFilter();
        setHits([]);
        return;
      }
      // The tree computes the filter and emits search:changed with matches.
      // We recompute here to have the hit list for navigation.
      JTE.TreeView.applyFilter(q);
      var matches = collectMatches(JTE.State.root, q);
      JTE.State.setSearch(q, matches);
      setHits(matches);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { close(); }
    });

    prevBtn.addEventListener("click", function () { step(-1); });
    nextBtn.addEventListener("click", function () { step(1); });
    closeBtn.addEventListener("click", close);

    function open() {
      host.hidden = false;
      input.focus();
      input.select();
    }
    function close() {
      host.hidden = true;
      input.value = "";
      setHits([]);
      JTE.TreeView.clearFilter();
      JTE.State.setSearch("", []);
    }

    document.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        open();
      }
    });

    // Keep navigation list in sync if the tree re-filters.
    JTE.State.on("search:changed", function (p) {
      if (!input.value.trim()) return;
      if (!p.matches) return;
      // Only adopt the matches if they differ from ours.
      if (p.matches.length !== hits.length) setHits(p.matches);
    });

    return { open: open, close: close, focus: open };
  }

  /**
   * Collect paths of nodes whose key or scalar value contains `query`.
   * Mirrors the tree's matching rule so navigation reaches the same hits.
   */
  function collectMatches(root, query) {
    var q = String(query || "").toLowerCase();
    if (!q) return [];
    var out = [];

    (function walk(node, path) {
      if (node === null || typeof node !== "object") return;
      var entries = Array.isArray(node)
        ? node.map(function (v, i) { return { key: i, value: v, label: "[" + i + "]" }; })
        : Object.keys(node).map(function (k) { return { key: k, value: node[k], label: k }; });
      entries.forEach(function (e) {
        var childPath = path.concat([e.key]);
        var labelHit = String(e.label).toLowerCase().indexOf(q) !== -1;
        var isLeaf = e.value === null || typeof e.value !== "object";
        var valueHit = isLeaf && String(e.value).toLowerCase().indexOf(q) !== -1;
        if (labelHit || valueHit) out.push(childPath);
        if (!isLeaf) walk(e.value, childPath);
      });
    })(root, []);

    return out;
  }

  JTE.SearchBar = { mount: mount, collectMatches: collectMatches };
})(window);