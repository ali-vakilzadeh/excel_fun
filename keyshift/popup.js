document.addEventListener('DOMContentLoaded', () => {
  const pairSelect = document.getElementById('pairSelect');
  const floatingToggle = document.getElementById('floatingToggle');
  const convertBtn = document.getElementById('convertBtn');

  // Load saved preferences
  chrome.storage.sync.get(['selectedPair', 'floatingButton'], (res) => {
    if (res.selectedPair) pairSelect.value = res.selectedPair;
    if (res.floatingButton !== undefined) floatingToggle.checked = res.floatingButton;
  });

  // Save on change
  pairSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ selectedPair: pairSelect.value });
  });

  floatingToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ floatingButton: floatingToggle.checked });
  });

  // Convert button click
  convertBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'CONVERT_LAYOUT',
          pair: pairSelect.value
        });
        window.close();
      }
    });
  });
});
