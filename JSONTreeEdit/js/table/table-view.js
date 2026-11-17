/* js/table/table-view.js — Editable grid for array-of-objects */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  function isContainer(v) { return v !== null && typeof v === "object"; }

  function typeTag(v) {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return "array[" + v.length + "]";
    if (typeof v === "object") return "object{" + Object.keys(v).length + "}";
    return typeof v;
  }

  function cellText(v) {
    if (v === null || v === undefined) return "";
    if (isContainer(v)) return JSON.stringify(v);
    return String(v);
  }

  /**
   * Render a table view into `host`.
   * opts: { path, value (array), onChange(path, newValue), onDelete(path), onSelect(path) }
   * Returns a cleanup function.
   */
  function render(host, opts) {
    host.innerHTML = "";
    host.classList.add("jte-table-view");

    var basePath = opts.path.slice();
    var onChange = opts.onChange || function () {};
    var onDelete = opts.onDelete || function () {};
    var onSelect = opts.onSelect || function () {};

    // Re-derive the verdict each time we render; data may have changed shape.
    var verdict = JTE.TableDetect.detect(opts.value);
    if (!verdict.isTable) {
      // Defensive: caller shouldn't have routed here, but fall back cleanly.
      host.innerHTML = "";
      if (JTE.ObjectView) {
        return JTE.ObjectView.render(host, opts);
      }
      return function () {};
    }

    var columns = verdict.columns.slice();

    // --- Header -------------------------------------------------------------
    var header = document.createElement("div");
    header.className = "jte-object-header";

    var title = document.createElement("h2");
    title.className = "jte-pane-title";
    title.textContent = "Table";
    header.appendChild(title);

    var count = document.createElement("span");
    count.className = "jte-pane-subtitle";
    count.textContent = verdict.rowCount + " row(s) × " + columns.length + " column(s)";
    header.appendChild(count);

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "jte-btn jte-btn-small";
    addBtn.textContent = "+ Add row";
    addBtn.addEventListener("click", addRow);
    header.appendChild(addBtn);

    host.appendChild(header);

    // --- Table --------------------------------------------------------------
    var wrap = document.createElement("div");
    wrap.className = "jte-table-wrap";
    host.appendChild(wrap);

    var table = document.createElement("table");
    table.className = "jte-grid";
    wrap.appendChild(table);

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var thIndex = document.createElement("th");
    thIndex.className = "jte-grid-index";
    thIndex.textContent = "#";
    headRow.appendChild(thIndex);
    columns.forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col;
      th.title = col;
      headRow.appendChild(th);
    });
    var thAct = document.createElement("th");
    thAct.className = "jte-grid-actions";
    thAct.textContent = "";
    headRow.appendChild(thAct);
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    table.appendChild(tbody);

    // --- Row building -------------------------------------------------------

    function currentArray() {
      var res = JTE.Path.getByPath(JTE.State.root, basePath);
      return res.found && Array.isArray(res.value) ? res.value : [];
    }

    function renderBody() {
      tbody.innerHTML = "";
      var arr = currentArray();
      for (var r = 0; r < arr.length; r++) {
        tbody.appendChild(buildRow(r, arr[r]));
      }
    }

    function buildRow(rowIndex, rowValue) {
      var tr = document.createElement("tr");
      tr.dataset.row = String(rowIndex);

      var tdIdx = document.createElement("td");
      tdIdx.className = "jte-grid-index";
      tdIdx.textContent = String(rowIndex);
      tr.appendChild(tdIdx);

      columns.forEach(function (col) {
        var td = document.createElement("td");
        td.className = "jte-grid-cell";
        td.dataset.col = col;

        var has = Object.prototype.hasOwnProperty.call(rowValue, col);
        var v = has ? rowValue[col] : undefined;

        if (isContainer(v)) {
          var tag = document.createElement("span");
          tag.className = "jte-type-tag";
          tag.textContent = typeTag(v);
          td.appendChild(tag);

          var openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "jte-btn jte-btn-tiny";
          openBtn.textContent = "Open →";
          openBtn.addEventListener("click", function () {
            onSelect(basePath.concat([rowIndex, col]));
          });
          td.appendChild(openBtn);
          td.classList.add("jte-cell-nested");
        } else {
          var input = document.createElement("input");
          input.type = typeof v === "number" ? "number" : "text";
          input.step = "any";
          input.className = "jte-cell-input";
          input.value = v === null || v === undefined ? "" : String(v);
          if (v === null || v === undefined) {
            input.placeholder = has ? "null" : "(missing)";
            input.classList.add(has ? "jte-value-null" : "jte-value-missing");
          }
          input.addEventListener("blur", function () {
            commitCell(rowIndex, col, v, has, input);
          });
          input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); input.blur(); }
            else if (e.key === "Escape") {
              input.value = v === null || v === undefined ? "" : String(v);
              input.blur();
            }
          });
          td.appendChild(input);
        }
        tr.appendChild(td);
      });

      var tdAct = document.createElement("td");
      tdAct.className = "jte-grid-actions";
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "jte-btn jte-btn-tiny jte-btn-danger";
      delBtn.title = "Delete row";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", function () {
        onDelete(basePath.concat([rowIndex]));
      });
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      return tr;
    }

    // --- Cell commit --------------------------------------------------------

    function commitCell(rowIndex, col, oldValue, hadKey, input) {
      var raw = input.value;
      var next;

      if (typeof oldValue === "number") {
        if (raw.trim() === "") {
          input.value = String(oldValue);
          return;
        }
        var n = Number(raw);
        if (!isFinite(n)) { input.classList.add("jte-input-invalid"); return; }
        input.classList.remove("jte-input-invalid");
        next = n;
      } else if (typeof oldValue === "boolean") {
        next = raw === "true";
      } else if (oldValue === null || oldValue === undefined) {
        // Infer type from content: empty keeps null, numeric stays number.
        if (raw === "") next = null;
        else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw.trim())) next = Number(raw);
        else next = raw;
      } else {
        next = raw;
      }

      if (next === oldValue && hadKey) return;

      JTE.TableEdit.setCell(JTE.State.root, basePath, rowIndex, col, next);
      JTE.State.notifyChange(basePath.concat([rowIndex, col]), { replace: true });
    }

    // --- Row actions --------------------------------------------------------

    function addRow() {
      var arr = currentArray();
      // Blank row with every column present as "" so the grid stays uniform.
      var blank = {};
      columns.forEach(function (c) { blank[c] = ""; });
      JTE.Path.insertByPath(JTE.State.root, basePath, null, blank);
      JTE.State.notifyChange(basePath, { replace: true });
    }

    renderBody();

    // Re-render body if data changes within this array.
    var off = JTE.State.on("data:changed", function (p) {
      if (JTE.Path.isPrefix(basePath, p.path)) {
        renderBody();
      }
    });

    return function cleanup() {
      off();
      host.classList.remove("jte-table-view");
      host.innerHTML = "";
    };
  }

  JTE.TableView = { render: render };
})(window);