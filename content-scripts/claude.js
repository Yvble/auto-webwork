let hasResponded = false;
let jsonBlockCountAtQuestion = 0;
let observationStartTime = 0;
let observationTimeout = null;
let observer = null;
let manualSendCleanup = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "receiveQuestion") {
    resetObservation();

    jsonBlockCountAtQuestion = getJsonCodeBlocks().length;
    hasResponded = false;

    insertQuestion(message.question)
      .then(() => {
        sendResponse({ received: true, status: "processing" });
      })
      .catch((error) => {
        sendResponse({ received: false, error: error.message });
      });

    return true;
  }
});

function resetObservation() {
  hasResponded = false;
  if (observationTimeout) {
    clearTimeout(observationTimeout);
    observationTimeout = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (manualSendCleanup) {
    manualSendCleanup();
    manualSendCleanup = null;
  }
}

function getInputArea() {
  return (
    document.querySelector('div[contenteditable="true"].ProseMirror') ||
    document.querySelector('div[aria-label="Write your prompt to Claude"]') ||
    document.querySelector('fieldset div[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"]')
  );
}

function getSendButton() {
  return (
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[aria-label="Send Message"]') ||
    Array.from(document.querySelectorAll("button")).find((btn) =>
      /send message/i.test(btn.getAttribute("aria-label") || "")
    ) ||
    null
  );
}

function insertTextIntoInput(inputArea, text) {
  inputArea.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(inputArea);
  selection.removeAllRanges();
  selection.addRange(range);

  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch (e) {
    inserted = false;
  }

  if (!inserted || !inputArea.textContent.trim()) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    inputArea.innerHTML = escaped
      .split("\n")
      .map((line) => `<p>${line || "<br>"}</p>`)
      .join("");
    inputArea.dispatchEvent(
      new InputEvent("input", { bubbles: true, cancelable: true })
    );
  }
}

function isSendButtonReady(button) {
  if (!button) return false;
  if (button.disabled) return false;
  if (button.getAttribute("aria-disabled") === "true") return false;
  return true;
}

function waitForSendButtonReady(inputArea, hasImage, resolve, reject, attempt) {
  const sendButton = getSendButton();

  if (isSendButtonReady(sendButton)) {
    if (hasImage) {
      alert(
        "Claude: Image detected. Drag the image from the opened tab, then press Enter or click Send."
      );
      armManualSendObserver(inputArea, sendButton);
      resolve();
    } else {
      sendButton.click();
      startObserving();
      resolve();
    }
    return;
  }

  if (attempt >= 10) {
    reject(
      new Error(
        sendButton ? "Send button stayed disabled" : "Send button not found"
      )
    );
    return;
  }

  setTimeout(
    () => waitForSendButtonReady(inputArea, hasImage, resolve, reject, attempt + 1),
    300
  );
}

async function insertQuestion(questionData) {
  const { hasImage } = questionData;
  const text = window.AutoWebWork.buildPromptText(questionData);

  return new Promise((resolve, reject) => {
    const inputArea = getInputArea();
    if (!inputArea) {
      reject(new Error("Input area not found"));
      return;
    }

    setTimeout(() => {
      insertTextIntoInput(inputArea, text);
      setTimeout(() => waitForSendButtonReady(inputArea, hasImage, resolve, reject, 0), 300);
    }, 300);
  });
}

function armManualSendObserver(inputArea, sendButton) {
  if (manualSendCleanup) {
    manualSendCleanup();
    manualSendCleanup = null;
  }

  let started = false;

  const cleanup = () => {
    inputArea.removeEventListener("keydown", onKeydown, true);
    if (sendButton) {
      sendButton.removeEventListener("click", onClick, true);
    }
    document.removeEventListener("click", onDocClick, true);
    if (manualSendCleanup === cleanup) {
      manualSendCleanup = null;
    }
  };

  const startOnce = () => {
    if (started) return;
    started = true;
    cleanup();
    chrome.runtime.sendMessage({ type: "closeImageTab" });
    startObserving();
  };

  const onKeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      startOnce();
    }
  };
  const onClick = () => startOnce();
  const onDocClick = (e) => {
    const target = e.target;
    if (!target) return;
    const btn = target.closest('button[aria-label="Send message"]');
    if (btn) startOnce();
  };

  inputArea.addEventListener("keydown", onKeydown, true);
  if (sendButton) {
    sendButton.addEventListener("click", onClick, true);
  }
  document.addEventListener("click", onDocClick, true);

  manualSendCleanup = cleanup;
}

function getJsonCodeBlocks() {
  return Array.from(document.querySelectorAll('code[class*="json" i]'));
}

function isResponseGenerating() {
  return Boolean(
    document.querySelector('button[aria-label="Stop response"]') ||
      document.querySelector('[data-is-streaming="true"]')
  );
}

function startObserving() {
  observationStartTime = Date.now();
  observationTimeout = setTimeout(() => {
    if (!hasResponded) {
      resetObservation();
    }
  }, 180000);

  observer = new MutationObserver(() => {
    if (hasResponded) return;

    const blocks = getJsonCodeBlocks();
    if (blocks.length <= jsonBlockCountAtQuestion) return;

    const latestBlock = blocks[blocks.length - 1];
    const responseText = latestBlock.textContent.trim();

    const quickMatch = window.AutoWebWork.tryParseAnswerJson(responseText);
    if (quickMatch && !hasResponded) {
      hasResponded = true;
      chrome.runtime
        .sendMessage({ type: "aiResponse", response: quickMatch })
        .then(() => {
          resetObservation();
        })
        .catch(() => {});
      return;
    }

    if (!isResponseGenerating() && Date.now() - observationStartTime > 30000) {
      const strictMatch = window.AutoWebWork.extractStrictAnswerJson(responseText);
      if (strictMatch && !hasResponded) {
        hasResponded = true;
        chrome.runtime.sendMessage({ type: "aiResponse", response: strictMatch });
        resetObservation();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
