/* js/pane/scalar-editor.js — Edit one scalar value (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  /**
   * Render a scalar editor into `host`.
   * opts: { path: [], value: any, onChange: fn(path, newValue) }
   * Returns a cleanup function.
   */
  function render(host, opts) {
    host.innerHTML = "";
    host.classList.add("jte-scalar-editor");

    var path = opts.path.slice();
    var value = opts.value;
    var onChange = opts.onChange || function () {};

    var type = valueType(value);

    // --- Type selector -----------------------------------------------------
    var typeRow = document.createElement("div");
    typeRow.className = "jte-field-row";

    var typeLabelEl = document.createElement("label");
    typeLabelEl.className = "jte-field-label";
    typeLabelEl.textContent = "Type";
    typeLabelEl.htmlFor = "jte-scalar-type";

    var typeSel = document.createElement("select");
    typeSel.id = "jte-scalar-type";
    typeSel.className = "jte-type-select";
    [
      { v: "string", label: "string" },
      { v: "number", label: "number" },
      { v: "boolean", label: "boolean" },
      { v: "null", label: "null" }
    ].forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.v;
      o.textContent = opt.label;
      if (opt.v === type) o.selected = true;
      typeSel.appendChild(o);
    });

    typeRow.appendChild(typeLabelEl);
    typeRow.appendChild(typeSel);
    host.appendChild(typeRow);

    // --- Value editor (rebuilt on type change) ------------------------------
    var valueRow = document.createElement("div");
    valueRow.className = "jte-field-row jte-field-row-grow";
    host.appendChild(valueRow);

    var current = value;
    var inputEl = null;

    function rebuildValueEditor(nextType) {
      valueRow.innerHTML = "";

      var labelEl = document.createElement("label");
      labelEl.className = "jte-field-label";
      labelEl.textContent = "Value";
      labelEl.htmlFor = "jte-scalar-value";

      if (nextType === "null") {
        var note = document.createElement("span");
        note.className = "jte-null-note";
        note.textContent = "null (no editable value)";
        labelEl.appendChild(note);
        valueRow.appendChild(labelEl);
        inputEl = null;
        return;
      }

      if (nextType === "boolean") {
        var boolSel = document.createElement("select");
        boolSel.id = "jte-scalar-value";
        boolSel.className = "jte-bool-select";
        ["true", "false"].forEach(function (b) {
          var o = document.createElement("option");
          o.value = b;
          o.textContent = b;
          if (String(current) === b) o.selected = true;
          boolSel.appendChild(o);
        });
        boolSel.addEventListener("change", function () {
          current = boolSel.value === "true";
          onChange(path, current);
        });
        labelEl.appendChild(boolSel);
        valueRow.appendChild(labelEl);
        inputEl = boolSel;
        return;
      }

      var input = document.createElement("input");
      input.id = "jte-scalar-value";
      input.className = "jte-value-input";
      input.type = nextType === "number" ? "number" : "text";
      input.step = "any";
      input.value = current === null || current === undefined ? "" : String(current);

      // Commit on blur or Enter; number validity is checked at commit time.
      function commit() {
        if (nextType === "number") {
          var raw = input.value.trim();
          if (raw === "") return; // don't clear the model on empty input
          var num = Number(raw);
          if (!isFinite(num)) {
            input.classList.add("jte-input-invalid");
            return;
          }
          input.classList.remove("jte-input-invalid");
          if (num !== current) { current = num; onChange(path, current); }
        } else {
          var s = input.value;
          if (s !== current) { current = s; onChange(path, current); }
        }
      }

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        else if (e.key === "Escape") {
          input.value = current === null || current === undefined ? "" : String(current);
          input.blur();
        }
      });

      labelEl.appendChild(input);
      valueRow.appendChild(labelEl);
      inputEl = input;
    }

    function valueType(v) {
      if (v === null) return "null";
      if (Array.isArray(v)) return "array";      // shouldn't happen; detail-view routes these
      if (typeof v === "object") return "object";
      if (typeof v === "number") return "number";
      if (typeof v === "boolean") return "boolean";
      return "string";
    }

    rebuildValueEditor(type);

    // --- Type change handler ------------------------------------------------
    typeSel.addEventListener("change", function () {
      var next = typeSel.value;

      // Coerce the current value to the new type.
      var coerced;
      if (next === "null") coerced = null;
      else if (next === "boolean") coerced = current === true || current === "true";
      else if (next === "number") {
        var n = Number(current);
        coerced = isFinite(n) ? n : 0;
      } else {
        coerced = current === null || current === undefined ? "" : String(current);
      }

      current = coerced;
      rebuildValueEditor(next);
      onChange(path, coerced);
    });

    return function cleanup() {
      host.classList.remove("jte-scalar-editor");
      host.innerHTML = "";
    };
  }

  JTE.ScalarEditor = { render: render };
})(window);