// KeyShift Content Script
(function () {
  let activeField = null;
  let currentPair = 'fa-en';
  let showFloatingButton = true;

  // Load saved preferences
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['selectedPair', 'floatingButton'], (res) => {
      if (res.selectedPair) currentPair = res.selectedPair;
      if (res.floatingButton !== undefined) showFloatingButton = res.floatingButton;
    });
  }

  // Find deep active element across shadow DOM
  function getDeepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  // Check if an element is an editable text container
  function isEditable(el) {
    if (!el) return false;
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'input') {
      const validTypes = ['text', 'search', 'email', 'url', 'password', 'tel', ''];
      return validTypes.includes(el.type.toLowerCase());
    }
    if (tagName === 'textarea') return true;
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  // Convert text inside the active element
  function convertActiveInput() {
    const el = getDeepActiveElement();
    if (!isEditable(el)) {
      showToast('⚠️ No active text field selected');
      return;
    }

    const tagName = el.tagName ? el.tagName.toLowerCase() : '';

    // Case 1: Standard Input or Textarea
    if (tagName === 'input' || tagName === 'textarea') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const fullVal = el.value || '';

      if (start !== null && end !== null && start !== end) {
        // Selection convert
        const selected = fullVal.substring(start, end);
        const { result, direction } = convertBilingualString(selected, currentPair);
        
        // Use setRangeText to preserve undo stack where supported
        if (el.setRangeText) {
          el.setRangeText(result, start, end, 'select');
        } else {
          el.value = fullVal.substring(0, start) + result + fullVal.substring(end);
          el.selectionStart = start;
          el.selectionEnd = start + result.length;
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        showToast(`🔄 Converted selection to ${direction === 'toEn' ? 'English' : 'Persian'}`);
      } else {
        // Whole field convert
        const { result, direction } = convertBilingualString(fullVal, currentPair);
        el.value = result;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        showToast(`🔄 Converted entire field to ${direction === 'toEn' ? 'English' : 'Persian'}`);
      }
      return;
    }

    // Case 2: ContentEditable (Gmail, Notion, Slack, Rich Text)
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const selectedText = selection.toString();
        const { result, direction } = convertBilingualString(selectedText, currentPair);
        document.execCommand('insertText', false, result);
        showToast(`🔄 Converted selection to ${direction === 'toEn' ? 'English' : 'Persian'}`);
      } else {
        const fullText = el.innerText || el.textContent || '';
        const { result, direction } = convertBilingualString(fullText, currentPair);
        // Select all within editable and replace
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, result);
        showToast(`🔄 Converted editable to ${direction === 'toEn' ? 'English' : 'Persian'}`);
      }
    }
  }

  // Toast notification feedback
  function showToast(message) {
    let toast = document.getElementById('keyshift-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'keyshift-toast';
      toast.className = 'keyshift-toast-container';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('keyshift-toast-visible');
    setTimeout(() => {
      toast.classList.remove('keyshift-toast-visible');
    }, 2400);
  }

  // Message listener from Background script / Action Popup
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'CONVERT_LAYOUT') {
      if (req.pair) currentPair = req.pair;
      convertActiveInput();
      sendResponse({ status: 'ok' });
    }
  });

  // Floating Quick Action Badge
  const floatingBtn = document.createElement('button');
  floatingBtn.id = 'keyshift-floating-btn';
  floatingBtn.title = 'Convert Keyboard Layout (Alt+Shift+X)';
  floatingBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`;
  floatingBtn.style.display = 'none';
  document.body.appendChild(floatingBtn);

  floatingBtn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent blurring target input
    convertActiveInput();
  });

  document.addEventListener('focusin', (e) => {
    if (showFloatingButton && isEditable(e.target)) {
      activeField = e.target;
      positionFloatingBtn(e.target);
    }
  });

  document.addEventListener('focusout', (e) => {
    setTimeout(() => {
      const active = getDeepActiveElement();
      if (!isEditable(active)) {
        floatingBtn.style.display = 'none';
      }
    }, 200);
  });

  function positionFloatingBtn(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    floatingBtn.style.top = `${window.scrollY + rect.top + 6}px`;
    floatingBtn.style.left = `${window.scrollX + rect.right - 28}px`;
    floatingBtn.style.display = 'flex';
  }
})();
