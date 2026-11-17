/* js/state.js — Central data model + event bus (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  /**
   * Event bus — minimal pub/sub.
   * Events used across the app:
   *   "document:loaded"  { root }
   *   "document:cleared" {}
   *   "selection:changed" { path }        // path is an array of keys/indices
   *   "data:changed"     { path }         // a node (or subtree) was mutated
   *   "dirty:changed"    { dirty }
   *   "search:changed"   { query, matches }
   */
  var listeners = Object.create(null);

  function on(event, fn) {
    (listeners[event] || (listeners[event] = [])).push(fn);
    return function off() {
      var arr = listeners[event];
      if (!arr) return;
      var i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    };
  }

  function emit(event, payload) {
    var arr = listeners[event];
    if (!arr || !arr.length) return;
    // Copy so handlers can unsubscribe during dispatch.
    arr.slice().forEach(function (fn) {
      try { fn(payload); }
      catch (err) { console.error("[JTE] listener error on '" + event + "'", err); }
    });
  }

  /**
   * The single source of truth.
   * `root` is the parsed JSON value (object, array, or scalar).
   * `root` may be null when no document is loaded.
   */
  var state = {
    root: null,
    loaded: false,
    dirty: false,
    selection: [],       // path to the selected node, e.g. ["users", 0, "name"]
    fileName: null,      // original file name, used for the default save name
    searchQuery: "",
    searchMatches: []    // array of paths matching the current search
  };

  // ---------- Document lifecycle ----------

  function loadDocument(root, fileName) {
    if (root === undefined) {
      throw new Error("loadDocument: root must be defined (use null for JSON null)");
    }
    state.root = root;
    state.loaded = true;
    state.dirty = false;
    state.selection = [];
    state.fileName = fileName || null;
    state.searchQuery = "";
    state.searchMatches = [];
    emit("document:loaded", { root: root, fileName: state.fileName });
    emit("dirty:changed", { dirty: false });
  }

  function clearDocument() {
    state.root = null;
    state.loaded = false;
    state.dirty = false;
    state.selection = [];
    state.fileName = null;
    state.searchQuery = "";
    state.searchMatches = [];
    emit("document:cleared", {});
    emit("dirty:changed", { dirty: false });
  }

  // ---------- Dirty tracking ----------

  function setDirty(value) {
    var next = !!value;
    if (state.dirty === next) return;
    state.dirty = next;
    emit("dirty:changed", { dirty: next });
  }

  // ---------- Selection ----------

  /**
   * Set the selected node by path.
   * Validates that the path actually resolves before committing.
   * Returns true on success.
   */
  function setSelection(path) {
    if (!Array.isArray(path)) path = [];
    if (!pathResolves(path)) return false;

    // Shallow-copy so external mutations of the passed array don't leak in.
    var next = path.slice();
    if (samePath(next, state.selection)) return true;

    state.selection = next;
    emit("selection:changed", { path: next });
    return true;
  }

  function getSelection() {
    return state.selection.slice();
  }

  function pathResolves(path) {
    if (!state.loaded) return false;
    if (path.length === 0) return true;
    var cur = state.root;
    for (var i = 0; i < path.length; i++) {
      var key = path[i];
      if (cur === null || typeof cur !== "object") return false;
      if (Array.isArray(cur)) {
        if (typeof key !== "number" || key < 0 || key >= cur.length) return false;
      } else {
        if (!Object.prototype.hasOwnProperty.call(cur, key)) return false;
      }
      cur = cur[key];
    }
    return true;
  }

  function samePath(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ---------- Mutation entry point ----------

  /**
   * Called by the editor layers *after* they have mutated the tree via JTE.Path.
   * `path` is the deepest path that changed; `replace` means the node identity
   * changed (e.g. a value was replaced), not just an in-place edit.
   */
  function notifyChange(path, opts) {
    opts = opts || {};
    setDirty(true);
    emit("data:changed", { path: (path || []).slice(), replace: !!opts.replace });

    // If the selected path no longer resolves (e.g. parent was deleted),
    // walk up to the nearest valid ancestor.
    if (state.loaded && !pathResolves(state.selection)) {
      var fallback = state.selection.slice();
      while (fallback.length > 0 && !pathResolves(fallback)) fallback.pop();
      state.selection = fallback;
      emit("selection:changed", { path: fallback.slice() });
    }
  }

  // ---------- Search state ----------

  function setSearch(query, matches) {
    state.searchQuery = query || "";
    state.searchMatches = Array.isArray(matches) ? matches.slice() : [];
    emit("search:changed", { query: state.searchQuery, matches: state.searchMatches });
  }

  // ---------- Public API ----------

  JTE.State = {
    // raw state (read-only by convention; mutate via methods)
    get state() { return state; },
    get root() { return state.root; },
    get loaded() { return state.loaded; },
    get dirty() { return state.dirty; },
    get selection() { return state.selection.slice(); },
    get fileName() { return state.fileName; },

    // events
    on: on,
    emit: emit,

    // lifecycle
    loadDocument: loadDocument,
    clearDocument: clearDocument,

    // selection & change
    setSelection: setSelection,
    getSelection: getSelection,
    pathResolves: pathResolves,
    notifyChange: notifyChange,
    setDirty: setDirty,

    // search
    setSearch: setSearch
  };
})(window);