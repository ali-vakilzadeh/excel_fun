/* js/pane/object-view.js — Property list for objects / non-table arrays */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  function isContainer(v) { return v !== null && typeof v === "object"; }

  function typeTag(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array[" + v.length + "]";
    if (typeof v === "object") return "object{" + Object.keys(v).length + "}";
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    return typeof v;
  }

  /**
   * Render an object/array property list into `host`.
   * opts: { path, value, onChange(path, newValue), onSelect(path), onDelete(path) }
   * Returns a cleanup function.
   */
  function render(host, opts) {
    host.innerHTML = "";
    host.classList.add("jte-object-view");

    var path = opts.path.slice();
    var value = opts.value;
    var onChange = opts.onChange || function () {};
    var onSelect = opts.onSelect || function () {};
    var onDelete = opts.onDelete || function () {};

    var isArr = Array.isArray(value);
    var entries = isArr
      ? value.map(function (v, i) { return { key: i, value: v, label: "[" + i + "]" }; })
      : Object.keys(value).map(function (k) { return { key: k, value: value[k], label: k }; });

    // --- Header -------------------------------------------------------------
    var header = document.createElement("div");
    header.className = "jte-object-header";

    var title = document.createElement("h2");
    title.className = "jte-pane-title";
    title.textContent = isArr ? "Array" : "Object";
    header.appendChild(title);

    var count = document.createElement("span");
    count.className = "jte-pane-subtitle";
    count.textContent = entries.length + (isArr ? " item(s)" : " key(s)");
    header.appendChild(count);

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "jte-btn jte-btn-small";
    addBtn.textContent = isArr ? "+ Add item" : "+ Add key";
    addBtn.addEventListener("click", function () { addEntry(); });
    header.appendChild(addBtn);

    host.appendChild(header);

    // --- Table of properties ------------------------------------------------
    var table = document.createElement("table");
    table.className = "jte-prop-table";

    var tbody = document.createElement("tbody");
    table.appendChild(tbody);
    host.appendChild(table);

    function renderRows() {
      tbody.innerHTML = "";
      var v = JTE.Path.getByPath(JTE.State.root, path);
      if (!v.found) return;
      var node = v.value;
      var list = Array.isArray(node)
        ? node.map(function (x, i) { return { key: i, value: x, label: "[" + i + "]" }; })
        : Object.keys(node).map(function (k) { return { key: k, value: node[k], label: k }; });

      list.forEach(function (entry) {
        tbody.appendChild(buildRow(entry));
      });
    }

    function buildRow(entry) {
      var tr = document.createElement("tr");
      tr.className = "jte-prop-row";

      // Key cell
      var tdKey = document.createElement("td");
      tdKey.className = "jte-prop-key";
      if (isArr) {
        tdKey.textContent = entry.label;
        tdKey.classList.add("jte-prop-index");
      } else {
        var keyInput = document.createElement("input");
        keyInput.type = "text";
        keyInput.className = "jte-key-input";
        keyInput.value = String(entry.key);
        keyInput.addEventListener("blur", function () {
          var newKey = keyInput.value.trim();
          if (!newKey || newKey === String(entry.key)) {
            keyInput.value = String(entry.key);
            return;
          }
          renameKey(entry.key, newKey, keyInput);
        });
        keyInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); keyInput.blur(); }
          else if (e.key === "Escape") { keyInput.value = String(entry.key); keyInput.blur(); }
        });
        tdKey.appendChild(keyInput);
      }
      tr.appendChild(tdKey);

      // Value cell
      var tdVal = document.createElement("td");
      tdVal.className = "jte-prop-value";

      if (isContainer(entry.value)) {
        var tag = document.createElement("span");
        tag.className = "jte-type-tag";
        tag.textContent = typeTag(entry.value);
        tdVal.appendChild(tag);

        var openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "jte-btn jte-btn-tiny";
        openBtn.textContent = "Open →";
        openBtn.addEventListener("click", function () {
          onSelect(path.concat([entry.key]));
        });
        tdVal.appendChild(openBtn);
      } else {
        var input = document.createElement("input");
        input.type = typeof entry.value === "number" ? "number" : "text";
        input.step = "any";
        input.className = "jte-value-input jte-value-inline";
        input.value = entry.value === null ? "" : String(entry.value);
        if (entry.value === null) {
          input.placeholder = "null";
          input.classList.add("jte-value-null");
        }
        input.addEventListener("blur", function () {
          commitValue(entry.key, entry.value, input);
        });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); input.blur(); }
          else if (e.key === "Escape") {
            input.value = entry.value === null ? "" : String(entry.value);
            input.blur();
          }
        });
        tdVal.appendChild(input);
      }
      tr.appendChild(tdVal);

      // Actions cell
      var tdAct = document.createElement("td");
      tdAct.className = "jte-prop-actions";
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "jte-btn jte-btn-tiny jte-btn-danger";
      delBtn.title = "Delete";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", function () {
        onDelete(path.concat([entry.key]));
      });
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      return tr;
    }

    function commitValue(key, oldValue, input) {
      var next;
      if (typeof oldValue === "number") {
        var raw = input.value.trim();
        if (raw === "") { input.value = String(oldValue); return; }
        var n = Number(raw);
        if (!isFinite(n)) { input.classList.add("jte-input-invalid"); return; }
        input.classList.remove("jte-input-invalid");
        next = n;
      } else if (typeof oldValue === "boolean") {
        next = input.value === "true";
      } else if (oldValue === null) {
        next = input.value === "" ? null : input.value;
      } else {
        next = input.value;
      }
      if (next !== oldValue) onChange(path.concat([key]), next);
    }

    function renameKey(oldKey, newKey, inputEl) {
      var res = JTE.Path.getByPath(JTE.State.root, path);
      if (!res.found || Array.isArray(res.value)) return;
      var obj = res.value;
      if (Object.prototype.hasOwnProperty.call(obj, newKey)) {
        inputEl.classList.add("jte-input-invalid");
        inputEl.title = "Key already exists";
        return;
      }
      // Rebuild object preserving insertion order.
      var rebuilt = {};
      Object.keys(obj).forEach(function (k) {
        if (k === oldKey) rebuilt[newKey] = obj[k];
        else rebuilt[k] = obj[k];
      });
      JTE.Path.setByPath(JTE.State.root, path, rebuilt);
      JTE.State.notifyChange(path, { replace: true });
    }

    function addEntry() {
      var res = JTE.Path.getByPath(JTE.State.root, path);
      if (!res.found) return;
      var node = res.value;

      if (Array.isArray(node)) {
        JTE.Path.insertByPath(JTE.State.root, path, null, null);
        JTE.State.notifyChange(path, { replace: true });
      } else {
        // Generate a non-colliding default key.
        var base = "newKey", name = base, i = 1;
        while (Object.prototype.hasOwnProperty.call(node, name)) {
          name = base + i++;
        }
        JTE.Path.insertByPath(JTE.State.root, path, name, "");
        JTE.State.notifyChange(path, { replace: true });
      }
    }

    renderRows();

    // React to edits elsewhere (e.g. table view editing the same object).
    var off = JTE.State.on("data:changed", function (p) {
      if (JTE.Path.isPrefix(path, p.path) || JTE.Path.isPrefix(p.path, path)) {
        renderRows();
      }
    });

    return function cleanup() {
      off();
      host.classList.remove("jte-object-view");
      host.innerHTML = "";
    };
  }

  JTE.ObjectView = { render: render };
})(window);