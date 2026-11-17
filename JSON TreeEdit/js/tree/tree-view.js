/* js/tree/tree-view.js — RegEdit-style key tree (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  // ---------- Module state ----------

  var rootEl = null;            // container element (#tree-pane)
  var listEl = null;            // <ul> that holds the root node
  var expanded = new Set();     // set of path-strings that are expanded
  var selectedKey = null;       // path-string of the selected node
  var nodeEls = new Map();      // path-string -> <li> element (for fast updates)
  var filterSet = null;         // null = no filter; Set of path-strings to show
  var filterQuery = "";
  var idSeq = 0;

  // ---------- Path helpers ----------

  function keyOf(path) { return JSON.stringify(path); }
  function pathOf(key) { return JSON.parse(key); }

  function isContainer(v) {
    return v !== null && typeof v === "object";
  }

  function childEntries(node) {
    if (Array.isArray(node)) {
      return node.map(function (v, i) { return { key: i, value: v, label: "[" + i + "]" }; });
    }
    return Object.keys(node).map(function (k) {
      return { key: k, value: node[k], label: k };
    });
  }

  function typeLabel(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array[" + v.length + "]";
    if (typeof v === "object") return "object{" + Object.keys(v).length + "}";
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    return typeof v;
  }

  // ---------- Filtering ----------

  /**
   * Recursively walk the tree and collect path-keys that match `query`
   * (matched on key/label or scalar value, case-insensitive) plus all of
   * their ancestors so the tree can show a connected path to each match.
   */
  function buildFilterSet(root, query) {
    var q = String(query || "").toLowerCase();
    if (!q) return null;

    var keep = new Set();

    function walk(node, path) {
      var entries = isContainer(node) ? childEntries(node) : [];
      var matchedHere = false;

      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var childPath = path.concat([e.key]);
        var childKey = keyOf(childPath);

        var labelHit = String(e.label).toLowerCase().indexOf(q) !== -1;
        var valueHit = !isContainer(e.value) &&
          String(e.value).toLowerCase().indexOf(q) !== -1;

        var childMatched = walk(e.value, childPath);

        if (labelHit || valueHit || childMatched) {
          matchedHere = true;
          keep.add(childKey);
        }
      }
      return matchedHere;
    }

    walk(root, []);
    return keep;
  }

  function isVisible(path) {
    if (!filterSet) return true;
    var k = keyOf(path);
    if (filterSet.has(k)) return true;
    // Ancestors of a kept node are kept too, but root is always visible.
    for (var i = 0; i < path.length; i++) {
      if (filterSet.has(keyOf(path.slice(0, i)))) return true;
    }
    return path.length === 0;
  }

  // ---------- DOM construction ----------

  function createChevron() {
    var span = document.createElement("span");
    span.className = "jte-chevron";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "\u25B8"; // ▸
    return span;
  }

  function createLabel(path, label, type) {
    var span = document.createElement("span");
    span.className = "jte-label";
    span.textContent = label;

    var meta = document.createElement("span");
    meta.className = "jte-meta";
    meta.textContent = " " + type;

    var wrap = document.createElement("span");
    wrap.className = "jte-label-wrap";
    wrap.appendChild(span);
    wrap.appendChild(meta);
    return wrap;
  }

  function buildNode(path, label, value, depth) {
    var li = document.createElement("li");
    li.className = "jte-node";
    li.dataset.path = keyOf(path);
    li.dataset.depth = String(depth);
    li.setAttribute("role", "treeitem");

    var row = document.createElement("div");
    row.className = "jte-row";
    row.style.paddingLeft = (depth * 16) + "px";
    row.tabIndex = -1;

    var container = isContainer(value);
    var chevron;
    if (container) {
      var hasChildren = Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
      chevron = createChevron();
      if (!hasChildren) chevron.classList.add("jte-chevron-empty");
      row.appendChild(chevron);
    } else {
      var spacer = document.createElement("span");
      spacer.className = "jte-chevron jte-chevron-empty";
      row.appendChild(spacer);
    }

    row.appendChild(createLabel(path, label, typeLabel(value)));

    li.appendChild(row);

    if (container) {
      var childUl = document.createElement("ul");
      childUl.className = "jte-children";
      childUl.setAttribute("role", "group");
      li.appendChild(childUl);
    }

    li.__jte = { path: path, value: value, container: container, built: false };
    nodeEls.set(keyOf(path), li);

    return li;
  }

  /** Build child nodes for a container <li> if not already built. */
  function ensureChildren(li) {
    var meta = li.__jte;
    if (!meta || !meta.container || meta.built) return;
    meta.built = true;

    var childUl = li.querySelector(".jte-children");
    if (!childUl) return;

    var entries = childEntries(meta.value);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var childPath = meta.path.concat([e.key]);
      if (!isVisible(childPath)) continue;
      frag.appendChild(buildNode(childPath, e.label, e.value, meta.path.length + 1));
    }
    childUl.appendChild(frag);
  }

  /** Expand a node; lazily builds children on first expand. */
  function expand(pathKey) {
    var li = nodeEls.get(pathKey);
    if (!li || !li.__jte.container) return;
    ensureChildren(li);
    expanded.add(pathKey);
    li.classList.add("jte-expanded");
    li.setAttribute("aria-expanded", "true");
    applyFilterVisibility(li);
  }

  function collapse(pathKey) {
    var li = nodeEls.get(pathKey);
    if (!li) return;
    expanded.delete(pathKey);
    li.classList.remove("jte-expanded");
    li.setAttribute("aria-expanded", "false");
  }

  function toggle(pathKey) {
    if (expanded.has(pathKey)) collapse(pathKey);
    else expand(pathKey);
  }

  function expandAncestors(path) {
    for (var i = 0; i < path.length; i++) {
      expand(keyOf(path.slice(0, i)));
    }
  }

  // ---------- Filter visibility ----------

  function applyFilterVisibility(scopeLi) {
    var scope = scopeLi || listEl;
    if (!scope) return;

    // Walk every built node and show/hide based on filter + expansion.
    var nodes = scope.querySelectorAll(".jte-node");
    nodes.forEach(function (li) {
      var path = pathOf(li.dataset.path);
      var visible = isVisible(path);

      // A node is visible if it matches the filter itself or has a visible
      // ancestor chain. With no filter, everything is visible.
      if (!visible) {
        li.classList.add("jte-filtered-out");
        return;
      }
      li.classList.remove("jte-filtered-out");

      // Hide children unless parent is expanded.
      var parentLi = li.parentElement && li.parentElement.closest(".jte-node");
      if (parentLi) {
        var parentOpen = expanded.has(parentLi.dataset.path);
        li.classList.toggle("jte-hidden", !parentOpen);
      }
    });
  }

  function clearFilter() {
    filterSet = null;
    filterQuery = "";
    if (listEl) {
      listEl.querySelectorAll(".jte-node").forEach(function (li) {
        li.classList.remove("jte-filtered-out", "jte-hidden", "jte-search-hit");
      });
    }
  }

  function applyFilter(query) {
    filterQuery = String(query || "");
    if (!filterQuery) { clearFilter(); return; }
    if (!JTE.State.loaded) return;

    filterSet = buildFilterSet(JTE.State.root, filterQuery);

    // Auto-expand ancestors of every match so hits are reachable.
    if (filterSet) {
      filterSet.forEach(function (k) { expandAncestors(pathOf(k)); });
    }

    applyFilterVisibility();

    // Highlight matching nodes.
    if (listEl) {
      listEl.querySelectorAll(".jte-node").forEach(function (li) {
        var k = li.dataset.path;
        var hit = filterSet && filterSet.has(k);
        // Only mark the node itself if the *label* or scalar value matches,
        // not merely because it is an ancestor of a match.
        li.classList.toggle("jte-search-hit", !!hit && nodeMatches(li, filterQuery));
      });
    }
  }

  function nodeMatches(li, query) {
    var q = query.toLowerCase();
    var labelEl = li.querySelector(".jte-label");
    if (labelEl && labelEl.textContent.toLowerCase().indexOf(q) !== -1) return true;
    var meta = li.__jte;
    if (meta && !meta.container) {
      var v = meta.value;
      if (v !== null && String(v).toLowerCase().indexOf(q) !== -1) return true;
    }
    return false;
  }

  // ---------- Selection ----------

  function select(pathKey, opts) {
    opts = opts || {};
    if (selectedKey === pathKey) return;

    var prev = selectedKey && nodeEls.get(selectedKey);
    if (prev) prev.classList.remove("jte-selected");

    selectedKey = pathKey;
    var li = nodeEls.get(pathKey);
    if (li) {
      li.classList.add("jte-selected");
      if (opts.scroll !== false) {
        li.scrollIntoView({ block: "nearest" });
      }
    }

    if (!opts.silent) {
      JTE.State.setSelection(pathOf(pathKey));
    }
  }

  // ---------- Event handling ----------

  function onClick(e) {
    var row = e.target.closest(".jte-row");
    if (!row || !listEl.contains(row)) return;
    var li = row.parentElement;
    var pathKey = li.dataset.path;
    var meta = li.__jte;

    // Chevron click toggles; row click selects (and toggles on double-click).
    if (e.target.classList.contains("jte-chevron") && meta.container) {
      toggle(pathKey);
      return;
    }
    select(pathKey);
  }

  function onDblClick(e) {
    var row = e.target.closest(".jte-row");
    if (!row || !listEl.contains(row)) return;
    var li = row.parentElement;
    if (li.__jte.container) toggle(li.dataset.path);
  }

  function onKeyDown(e) {
    if (!selectedKey) return;
    var li = nodeEls.get(selectedKey);
    if (!li) return;

    var handled = true;
    switch (e.key) {
      case "ArrowDown":   focusRelative(li, 1); break;
      case "ArrowUp":     focusRelative(li, -1); break;
      case "ArrowRight":
        if (li.__jte.container) {
          if (!expanded.has(selectedKey)) expand(selectedKey);
          else focusRelative(li, 1);
        }
        break;
      case "ArrowLeft":
        if (li.__jte.container && expanded.has(selectedKey)) collapse(selectedKey);
        else {
          var parentLi = li.parentElement && li.parentElement.closest(".jte-node");
          if (parentLi) select(parentLi.dataset.path);
        }
        break;
      case "Enter":
      case " ":
        if (li.__jte.container) toggle(selectedKey);
        break;
      case "Home": focusEdge("first"); break;
      case "End":  focusEdge("last"); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  function visibleRows() {
    if (!listEl) return [];
    return Array.prototype.filter.call(
      listEl.querySelectorAll(".jte-row"),
      function (row) {
        var li = row.parentElement;
        if (li.classList.contains("jte-hidden") || li.classList.contains("jte-filtered-out")) return false;
        return row.offsetParent !== null;
      }
    );
  }

  function focusRelative(li, dir) {
    var rows = visibleRows();
    var row = li.querySelector(".jte-row");
    var idx = rows.indexOf(row);
    if (idx === -1) return;
    var next = rows[idx + dir];
    if (next) select(next.parentElement.dataset.path);
  }

  function focusEdge(which) {
    var rows = visibleRows();
    if (!rows.length) return;
    var row = which === "first" ? rows[0] : rows[rows.length - 1];
    select(row.parentElement.dataset.path);
  }

  // ---------- Render / re-render ----------

  /** Full rebuild — used when a new document is loaded. */
  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";
    nodeEls.clear();
    expanded.clear();
    selectedKey = null;

    if (!JTE.State.loaded) {
      var empty = document.createElement("div");
      empty.className = "jte-empty";
      empty.textContent = "No document loaded.";
      listEl.appendChild(empty);
      return;
    }

    var rootValue = JTE.State.root;
    var rootLi = buildNode([], "$", rootValue, 0);
    listEl.appendChild(rootLi);

    // Root starts expanded so the user sees something immediately.
    if (isContainer(rootValue)) {
      expand("[]");
      // Restore prior selection if the state still points somewhere valid.
      var sel = JTE.State.getSelection();
      if (sel.length) {
        expandAncestors(sel);
        select(keyOf(sel), { silent: true, scroll: false });
      }
    } else {
      select("[]", { silent: true });
    }

    if (filterQuery) applyFilter(filterQuery);
  }

  /**
   * Re-render just the subtree under `path` (after a data change).
   * Falls back to a full render if the path can't be located.
   */
  function refreshPath(path) {
    if (!JTE.State.loaded) { render(); return; }
    var k = keyOf(path);
    var li = nodeEls.get(k);

    // If the node doesn't exist in the DOM, walk up to a parent that does.
    var probe = path.slice();
    while (!li && probe.length > 0) {
      probe.pop();
      li = nodeEls.get(keyOf(probe));
    }
    if (!li) { render(); return; }

    // Find the new value for this path from the state.
    var res = JTE.Path.getByPath(JTE.State.root, probe);
    if (!res.found) { render(); return; }

    // Rebuild this <li> in place.
    var parentUl = li.parentElement;
    var nextSibling = li.nextSibling;
    var wasSelected = li.classList.contains("jte-selected");
    var wasExpanded = li.classList.contains("jte-expanded");

    // Remove all descendant entries from nodeEls.
    li.querySelectorAll(".jte-node").forEach(function (d) {
      nodeEls.delete(d.dataset.path);
    });
    nodeEls.delete(keyOf(probe));

    var label = probe.length ? String(probe[probe.length - 1]) : "$";
    var fresh = buildNode(probe, label, res.value, probe.length);
    if (parentUl) parentUl.insertBefore(fresh, nextSibling);
    else { listEl.innerHTML = ""; listEl.appendChild(fresh); }
    li.remove();

    if (wasExpanded && fresh.__jte.container) expand(keyOf(probe));
    if (wasSelected) select(keyOf(probe), { silent: true, scroll: false });

    if (filterQuery) applyFilter(filterQuery);
  }

  // ---------- Public API ----------

  function mount(container) {
    if (!container) throw new Error("TreeView.mount: container required");
    rootEl = container;
    rootEl.classList.add("jte-tree-pane");
    rootEl.setAttribute("role", "tree");
    rootEl.setAttribute("aria-label", "JSON key tree");

    listEl = document.createElement("ul");
    listEl.className = "jte-tree-root";
    rootEl.appendChild(listEl);

    listEl.addEventListener("click", onClick);
    listEl.addEventListener("dblclick", onDblClick);
    listEl.addEventListener("keydown", function (e) {
      var row = e.target.closest(".jte-row");
      if (row && row.tabIndex === -1) row.tabIndex = 0;
      onKeyDown(e);
    });

    // React to state changes.
    JTE.State.on("document:loaded", function () { render(); });
    JTE.State.on("document:cleared", function () { render(); });
    JTE.State.on("selection:changed", function (p) {
      select(keyOf(p.path), { silent: true, scroll: true });
    });
    JTE.State.on("data:changed", function (p) { refreshPath(p.path || []); });
    JTE.State.on("search:changed", function (p) { applyFilter(p.query); });

    render();
  }

  JTE.TreeView = {
    mount: mount,
    render: render,
    refreshPath: refreshPath,
    expand: function (path) { expand(keyOf(path)); },
    collapse: function (path) { collapse(keyOf(path)); },
    select: function (path) { select(keyOf(path)); },
    applyFilter: applyFilter,
    clearFilter: clearFilter
  };
})(window);