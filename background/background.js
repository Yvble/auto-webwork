let imageTabId = null;
let localTabId = null;

const AI_TARGETS = {
  chatgpt: { url: "https://chatgpt.com/", matchPattern: "https://chatgpt.com/*" },
  claude: { url: "https://claude.ai/new", matchPattern: "https://claude.ai/*" },
};

const aiTabIds = { chatgpt: null, claude: null };

function resolveTarget(name) {
  return AI_TARGETS[name] ? name : "chatgpt";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "openImageTab" && message.url) {
    if (imageTabId) {
      chrome.tabs.remove(imageTabId).catch(() => {});
      imageTabId = null;
    }
    chrome.tabs.create({ url: message.url, active: false }, (tab) => {
      if (tab && tab.id) {
        imageTabId = tab.id;
      }
    });
    sendResponse({ received: true });
    return true;
  }

  if (message.type === "closeImageTab") {
    if (imageTabId) {
      chrome.tabs.remove(imageTabId).catch(() => {});
      imageTabId = null;
    }
    sendResponse({ received: true });
    return true;
  }

  if (message.type === "openAITab") {
    const target = resolveTarget(message.target);
    const { url, matchPattern } = AI_TARGETS[target];

    chrome.tabs.query({ url: matchPattern }, (tabs) => {
      if (tabs && tabs.length > 0) {
        aiTabIds[target] = tabs[0].id;
        if (aiTabIds[target]) {
          chrome.tabs.update(aiTabIds[target], { active: true }).catch(() => {});
        }
        sendResponse({ received: true, tabId: aiTabIds[target] });
        return;
      }

      chrome.tabs.create({ url, active: true }, (tab) => {
        if (tab && tab.id) {
          aiTabIds[target] = tab.id;
        }
        sendResponse({ received: true, tabId: tab?.id || null });
      });
    });
    return true;
  }

  if (message.type === "sendQuestionToAI") {
    const target = resolveTarget(message.target);
    if (sender.tab && sender.tab.id) {
      localTabId = sender.tab.id;
    }

    const sendToTarget = (tabId) => {
      chrome.tabs.sendMessage(tabId, {
        type: "receiveQuestion",
        question: message.question,
      });
    };

    if (aiTabIds[target]) {
      sendToTarget(aiTabIds[target]);
      sendResponse({ received: true });
      return true;
    }

    chrome.tabs.query({ url: AI_TARGETS[target].matchPattern }, (tabs) => {
      if (tabs && tabs.length > 0) {
        aiTabIds[target] = tabs[0].id;
        sendToTarget(aiTabIds[target]);
        sendResponse({ received: true });
      } else {
        sendResponse({ received: false, error: `${target} tab not found` });
      }
    });
    return true;
  }

  if (message.type === "aiResponse") {
    if (!localTabId) {
      sendResponse({ received: false });
      return false;
    }
    chrome.tabs.sendMessage(localTabId, message, () => {
      chrome.tabs.update(localTabId, { active: true }).catch(() => {});
      sendResponse({ received: true });
    });
    return true;
  }

  sendResponse({ received: false });
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === imageTabId) imageTabId = null;
  if (tabId === localTabId) localTabId = null;
  for (const target of Object.keys(aiTabIds)) {
    if (aiTabIds[target] === tabId) aiTabIds[target] = null;
  }
});
