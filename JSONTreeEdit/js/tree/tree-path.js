/* js/tree/tree-path.js — Path get/set/delete utilities (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  /** True for a plain object or array container. */
  function isContainer(v) {
    return v !== null && typeof v === "object";
  }

  /** True for a numeric-looking array index string or a number. */
  function isIndex(key) {
    return typeof key === "number" ||
           (typeof key === "string" && /^(0|[1-9]\d*)$/.test(key));
  }

  function toIndex(key) { return typeof key === "number" ? key : parseInt(key, 10); }

  /** Compare two paths for equality. */
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** True if `prefix` is an ancestor-or-equal of `path`. */
  function isPrefix(prefix, path) {
    if (prefix.length > path.length) return false;
    for (var i = 0; i < prefix.length; i++) if (prefix[i] !== path[i]) return false;
    return true;
  }

  /**
   * Resolve a path against `root`.
   * Returns { found: true, value } or { found: false }.
   * An empty path resolves to `root` itself.
   */
  function getByPath(root, path) {
    if (!Array.isArray(path)) return { found: false };
    var cur = root;
    for (var i = 0; i < path.length; i++) {
      var key = path[i];
      if (!isContainer(cur)) return { found: false };
      if (Array.isArray(cur)) {
        var idx = toIndex(key);
        if (!isIndex(key) || idx < 0 || idx >= cur.length) return { found: false };
        cur = cur[idx];
      } else {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          return { found: false }; // guard against prototype pollution
        }
        if (!Object.prototype.hasOwnProperty.call(cur, key)) return { found: false };
        cur = cur[key];
      }
    }
    return { found: true, value: cur };
  }

  /**
   * Set a value by path. Mutates `root` in place when possible.
   * - If the parent of the final segment does not exist, it is created
   *   (object or array, inferred from the key type).
   * - If the final segment is an array index beyond bounds, the array is
   *   padded with `null`s so the index is valid.
   * Returns { ok: true, root, replaced } where `replaced` is true when the
   * root itself was replaced (empty path).
   */
  function setByPath(root, path, value) {
    if (!Array.isArray(path)) throw new Error("setByPath: path must be an array");

    if (path.length === 0) {
      return { ok: true, root: value, replaced: true };
    }

    // Ensure a mutable root.
    var newRoot = root;
    if (!isContainer(newRoot)) {
      newRoot = isIndex(path[0]) ? [] : {};
    }

    var cur = newRoot;
    for (var i = 0; i < path.length - 1; i++) {
      var key = path[i];
      var nextKey = path[i + 1];

      if (Array.isArray(cur)) {
        var idx = toIndex(key);
        if (!Number.isInteger(idx) || idx < 0) {
          throw new Error("setByPath: invalid array index at " + JSON.stringify(path.slice(0, i + 1)));
        }
        while (cur.length <= idx) cur.push(null);
        if (!isContainer(cur[idx])) {
          cur[idx] = isIndex(nextKey) ? [] : {};
        }
        cur = cur[idx];
      } else {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          throw new Error("setByPath: refusing unsafe key " + JSON.stringify(key));
        }
        if (!isContainer(cur[key])) {
          cur[key] = isIndex(nextKey) ? [] : {};
        }
        cur = cur[key];
      }
    }

    var last = path[path.length - 1];
    if (Array.isArray(cur)) {
      var li = toIndex(last);
      if (!Number.isInteger(li) || li < 0) {
        throw new Error("setByPath: invalid final array index " + JSON.stringify(last));
      }
      while (cur.length < li) cur.push(null);
      cur[li] = value;
    } else {
      if (last === "__proto__" || last === "constructor" || last === "prototype") {
        throw new Error("setByPath: refusing unsafe key " + JSON.stringify(last));
      }
      cur[last] = value;
    }

    return { ok: true, root: newRoot, replaced: newRoot !== root };
  }

  /**
   * Delete the node at `path`. For arrays, the element is spliced out.
   * Deleting the root (empty path) is refused; call State.clearDocument instead.
   * Returns { ok, root, replaced }.
   */
  function deleteByPath(root, path) {
    if (!Array.isArray(path) || path.length === 0) {
      return { ok: false, root: root, replaced: false, reason: "cannot delete root" };
    }

    var parentPath = path.slice(0, -1);
    var lastKey = path[path.length - 1];
    var parentRes = getByPath(root, parentPath);
    if (!parentRes.found || !isContainer(parentRes.value)) {
      return { ok: false, root: root, replaced: false, reason: "parent not found" };
    }

    var parent = parentRes.value;

    if (Array.isArray(parent)) {
      var idx = toIndex(lastKey);
      if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
        return { ok: false, root: root, replaced: false, reason: "index out of range" };
      }
      parent.splice(idx, 1);
    } else {
      if (!Object.prototype.hasOwnProperty.call(parent, lastKey)) {
        return { ok: false, root: root, replaced: false, reason: "key not found" };
      }
      delete parent[lastKey];
    }

    return { ok: true, root: root, replaced: false };
  }

  /**
   * Insert a new key/element.
   * - Object: adds `key` if absent (or overwrites if `overwrite` is true).
   * - Array:  inserts at `index` (default = end), shifting later elements.
   * Returns { ok, root, replaced, path } where `path` is the path of the new node.
   */
  function insertByPath(root, parentPath, key, value, opts) {
    opts = opts || {};
    if (!Array.isArray(parentPath)) throw new Error("insertByPath: parentPath must be an array");

    var parentRes = getByPath(root, parentPath);
    if (!parentRes.found || !isContainer(parentRes.value)) {
      return { ok: false, reason: "parent not found" };
    }
    var parent = parentRes.value;

    if (Array.isArray(parent)) {
      var idx = (key === undefined || key === null) ? parent.length : toIndex(key);
      if (!Number.isInteger(idx) || idx < 0 || idx > parent.length) {
        return { ok: false, reason: "invalid insert index" };
      }
      parent.splice(idx, 0, value);
      return { ok: true, root: root, replaced: false, path: parentPath.concat([idx]) };
    }

    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return { ok: false, reason: "unsafe key" };
    }
    if (Object.prototype.hasOwnProperty.call(parent, key) && !opts.overwrite) {
      return { ok: false, reason: "key already exists" };
    }
    parent[key] = value;
    return { ok: true, root: root, replaced: false, path: parentPath.concat([key]) };
  }

  /** JSON-pointer-ish string form, mostly for display and debugging. */
  function toString(path) {
    if (!path || !path.length) return "$";
    var s = "$";
    for (var i = 0; i < path.length; i++) {
      var k = path[i];
      if (typeof k === "number" || isIndex(k)) s += "[" + k + "]";
      else s += "[" + JSON.stringify(k) + "]";
    }
    return s;
  }

  JTE.Path = {
    getByPath: getByPath,
    setByPath: setByPath,
    deleteByPath: deleteByPath,
    insertByPath: insertByPath,
    isContainer: isContainer,
    isIndex: isIndex,
    equal: equal,
    isPrefix: isPrefix,
    toString: toString
  };
})(window);