let hasResponded = false;
let messageCountAtQuestion = 0;
let observationStartTime = 0;
let observationTimeout = null;
let observer = null;
let manualSendCleanup = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "receiveQuestion") {
    resetObservation();

    const messages = document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    );
    messageCountAtQuestion = messages.length;
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

async function insertQuestion(questionData) {
  const { hasImage } = questionData;
  const text = window.AutoWebWork.buildPromptText(questionData);

  return new Promise((resolve, reject) => {
    const inputArea = document.getElementById("prompt-textarea");
    if (inputArea) {
      setTimeout(() => {
        inputArea.focus();
        inputArea.innerHTML = `<p>${text}</p>`;
        inputArea.dispatchEvent(new Event("input", { bubbles: true }));

        setTimeout(() => {
          const sendButton = document.querySelector(
            '[data-testid="send-button"]'
          );
          if (sendButton) {
            if (hasImage) {
              alert(
                "ChatGPT: Image detected. Drag the image from the opened tab, then press Enter or click Send."
              );
              armManualSendObserver(inputArea, sendButton);
              resolve();
            } else {
              sendButton.click();
              startObserving();
              resolve();
            }
          } else {
            reject(new Error("Send button not found"));
          }
        }, 300);
      }, 300);
    } else {
      reject(new Error("Input area not found"));
    }
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
    const btn = target.closest('[data-testid="send-button"]');
    if (btn) startOnce();
  };

  inputArea.addEventListener("keydown", onKeydown, true);
  if (sendButton) {
    sendButton.addEventListener("click", onClick, true);
  }
  document.addEventListener("click", onDocClick, true);

  manualSendCleanup = cleanup;
}

function startObserving() {
  observationStartTime = Date.now();
  observationTimeout = setTimeout(() => {
    if (!hasResponded) {
      resetObservation();
    }
  }, 180000);

  observer = new MutationObserver((mutations) => {
    if (hasResponded) return;

    const messages = document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    );
    if (!messages.length) return;

    if (messages.length <= messageCountAtQuestion) return;

    const latestMessage = messages[messages.length - 1];
    const codeBlocks = latestMessage.querySelectorAll("pre code");
    let responseText = "";

    for (const block of codeBlocks) {
      if (block.className.includes("language-json")) {
        responseText = block.textContent.trim();
        break;
      }
    }

    if (!responseText) {
      responseText = latestMessage.textContent.trim();
    }

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

    const isGenerating = latestMessage.querySelector(".result-streaming");
    if (!isGenerating && Date.now() - observationStartTime > 30000) {
      const strictMatch = window.AutoWebWork.extractStrictAnswerJson(
        latestMessage.textContent.trim()
      );
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
