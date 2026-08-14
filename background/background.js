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
        sendResponse({ received: true, tabId: aiTabIds[target] });
        return;
      }

      chrome.tabs.create({ url, active: false }, (tab) => {
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
    const originTabId = localTabId;

    // The AI tab needs real focus for the paste-and-send step (Claude's
    // editor in particular won't register input via the Selection API
    // on an unfocused tab), so activate it just long enough for that,
    // then hand focus straight back to the WebWork tab.
    const sendToTarget = async (tabId) => {
      try {
        await chrome.tabs.update(tabId, { active: true });
      } catch (e) {}

      let restored = false;
      const restoreFocus = () => {
        if (restored) return;
        restored = true;
        if (originTabId) {
          chrome.tabs.update(originTabId, { active: true }).catch(() => {});
        }
      };

      chrome.tabs.sendMessage(
        tabId,
        { type: "receiveQuestion", question: message.question },
        () => restoreFocus()
      );
      setTimeout(restoreFocus, 15000);
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
