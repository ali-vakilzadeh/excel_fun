/* js/pane/detail-view.js — Right-pane router (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  var hostEl = null;
  var currentCleanup = null;
  var currentPathKey = null;

  function isContainer(v) { return v !== null && typeof v === "object"; }

  /**
   * Decide which view owns the right pane for a given value.
   * The table branch returns "table" only when the table module is present
   * and its heuristic accepts the value; otherwise arrays fall back to
   * object-view (a property list).
   */
  function routeView(value, path) {
    if (!isContainer(value)) return "scalar";

    if (Array.isArray(value) && JTE.TableDetect && JTE.TableView) {
      var verdict = JTE.TableDetect.detect(value);
      if (verdict && verdict.isTable) return "table";
    }
    return "object";
  }

  function renderEmpty() {
    clearCurrent();
    hostEl.innerHTML = "";
    hostEl.classList.add("jte-detail-empty");
    var msg = document.createElement("div");
    msg.className = "jte-empty";
    msg.textContent = JTE.State.loaded
      ? "Select a key in the tree to view or edit it."
      : "Load a JSON document to begin.";
    hostEl.appendChild(msg);
  }

  function clearCurrent() {
    if (currentCleanup) {
      try { currentCleanup(); } catch (e) { console.error("[JTE] cleanup error", e); }
      currentCleanup = null;
    }
    hostEl.classList.remove("jte-detail-empty", "jte-detail-scalar", "jte-detail-object", "jte-detail-table");
    hostEl.innerHTML = "";
  }

  // ---------- Mutation helpers passed to sub-views ----------

  function commitValue(path, newValue) {
    var res = JTE.Path.setByPath(JTE.State.root, path, newValue);
    if (!res.ok) return;
    if (res.replaced) JTE.State.loadDocument(res.root, JTE.State.fileName);
    else JTE.State.notifyChange(path, { replace: true });
  }

  function commitDelete(path) {
    var res = JTE.Path.deleteByPath(JTE.State.root, path);
    if (!res.ok) return;
    JTE.State.notifyChange(path.slice(0, -1), { replace: true });
  }

  function commitSelect(path) {
    JTE.State.setSelection(path);
  }

  // ---------- Main render ----------

  function renderSelection() {
    if (!hostEl) return;

    if (!JTE.State.loaded) { renderEmpty(); return; }

    var path = JTE.State.getSelection();
    var pathKey = JSON.stringify(path);

    // Nothing selected and no root? show empty.
    var res = JTE.Path.getByPath(JTE.State.root, path);
    if (!res.found) { renderEmpty(); return; }

    var value = res.value;
    var view = routeView(value, path);

    // Re-rendering the same path with the same view is wasteful; but a
    // data:changed event may have mutated the value in place, so we
    // re-render whenever the caller asks (see onDataChanged).
    clearCurrent();
    currentPathKey = pathKey;

    if (view === "scalar") {
      hostEl.classList.add("jte-detail-scalar");
      currentCleanup = JTE.ScalarEditor.render(hostEl, {
        path: path,
        value: value,
        onChange: commitValue
      });
      return;
    }

    if (view === "table") {
      hostEl.classList.add("jte-detail-table");
      currentCleanup = JTE.TableView.render(hostEl, {
        path: path,
        value: value,
        onChange: commitValue,
        onDelete: commitDelete,
        onSelect: commitSelect
      });
      return;
    }

    // object / non-table array
    hostEl.classList.add("jte-detail-object");
    currentCleanup = JTE.ObjectView.render(hostEl, {
      path: path,
      value: value,
      onChange: commitValue,
      onDelete: commitDelete,
      onSelect: commitSelect
    });
  }

  // ---------- Mount ----------

  function mount(container) {
    if (!container) throw new Error("DetailView.mount: container required");
    hostEl = container;
    hostEl.classList.add("jte-detail-pane");

    JTE.State.on("document:loaded", function () {
      // Auto-select root so the user sees something immediately.
      if (!JTE.State.getSelection().length) {
        JTE.State.setSelection([]);
      } else {
        renderSelection();
      }
    });

    JTE.State.on("document:cleared", function () { renderEmpty(); });

    JTE.State.on("selection:changed", function (p) {
      // Avoid re-rendering if the same path is already shown and only the
      // tree re-emitted selection (e.g. silent select).
      var key = JSON.stringify(p.path);
      if (key === currentPathKey) return;
      renderSelection();
    });

    JTE.State.on("data:changed", function (p) {
      // If the change touches the currently displayed node (or the node
      // itself is the changed path), re-render the pane.
      var sel = JTE.State.getSelection();
      if (JTE.Path.isPrefix(sel, p.path) || JTE.Path.isPrefix(p.path, sel)) {
        renderSelection();
      }
    });

    renderEmpty();
  }

  JTE.DetailView = {
    mount: mount,
    renderSelection: renderSelection,
    routeView: routeView
  };
})(window);