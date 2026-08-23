// KeyShift Background Service Worker

// Initialize Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'keyshift-convert-menu',
    title: '🔄 Convert Keyboard Layout (FA ↔ EN)',
    contexts: ['editable', 'selection']
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'keyshift-convert-menu' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'CONVERT_LAYOUT' });
  }
});

// Handle Global Keyboard Shortcuts (chrome.commands)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'convert-layout') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'CONVERT_LAYOUT' });
      }
    });
  }
});
