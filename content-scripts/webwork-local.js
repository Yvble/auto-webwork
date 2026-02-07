let lastImageOpenedSrc = null;
const FULL_AUTO_STATE_KEY = "awwFullAutoState";
const FULL_AUTO_LAST_RUN_KEY = "awwFullAutoLastRun";
const FULL_AUTO_STATE_IDLE = "idle";
const FULL_AUTO_STATE_RUNNING = "running";
const FULL_AUTO_STATE_AWAITING_NEXT = "awaiting_next";
const FULL_AUTO_BAR_ID = "auto-webwork-full-auto-bar";

function addHelperButton() {
  const btn = document.createElement("button");
  btn.id = "auto-webwork-send-btn";
  btn.textContent = "Send to ChatGPT";
  btn.style.position = "fixed";
  btn.style.bottom = "20px";
  btn.style.right = "20px";
  btn.style.zIndex = "999999";
  btn.style.background = "#1f2937";
  btn.style.color = "#fff";
  btn.style.border = "none";
  btn.style.borderRadius = "8px";
  btn.style.padding = "10px 12px";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  btn.addEventListener("click", () => {
    startQuestionFlow({ isAuto: false });
  });

  document.body.appendChild(btn);
}

function ensureFullAutoBar() {
  let bar = document.getElementById(FULL_AUTO_BAR_ID);
  if (bar) return bar;

  bar = document.createElement("div");
  bar.id = FULL_AUTO_BAR_ID;
  bar.style.position = "fixed";
  bar.style.top = "16px";
  bar.style.right = "16px";
  bar.style.zIndex = "999999";
  bar.style.display = "none";
  bar.style.alignItems = "center";
  bar.style.gap = "8px";
  bar.style.padding = "8px 10px";
  bar.style.borderRadius = "10px";
  bar.style.background = "#0f172a";
  bar.style.color = "#e2e8f0";
  bar.style.border = "1px solid #334155";
  bar.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
  bar.style.fontSize = "12px";

  const label = document.createElement("span");
  label.textContent = "FULL-AUTO ON";
  label.style.fontWeight = "600";

  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.textContent = "Stop";
  stopBtn.style.background = "#dc2626";
  stopBtn.style.color = "#fff";
  stopBtn.style.border = "none";
  stopBtn.style.padding = "4px 8px";
  stopBtn.style.borderRadius = "6px";
  stopBtn.style.cursor = "pointer";
  stopBtn.addEventListener("click", () => {
    setFullAutoState(FULL_AUTO_STATE_IDLE);
    if (!chrome?.storage?.sync) return;
    chrome.storage.sync.set({ fullAuto: false }, () => {
      if (chrome.runtime.lastError) return;
      alert("FULL-AUTO turned off.");
    });
  });

  bar.appendChild(label);
  bar.appendChild(stopBtn);
  document.body.appendChild(bar);
  return bar;
}

function updateFullAutoBar(isEnabled) {
  const bar = ensureFullAutoBar();
  bar.style.display = isEnabled ? "flex" : "none";
}

function bindFullAutoBar() {
  ensureFullAutoBar();
  getAutomationSettings().then((settings) => {
    updateFullAutoBar(settings.fullAuto);
    if (!settings.fullAuto) {
      setFullAutoState(FULL_AUTO_STATE_IDLE);
      return;
    }

    const state = getFullAutoState();
    if (state === FULL_AUTO_STATE_IDLE) {
      setFullAutoState(FULL_AUTO_STATE_RUNNING);
    }
  });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes.fullAuto) return;
      const isEnabled = Boolean(changes.fullAuto.newValue);
      updateFullAutoBar(isEnabled);
      if (isEnabled) {
        const state = getFullAutoState();
        if (state === FULL_AUTO_STATE_IDLE) {
          setFullAutoState(FULL_AUTO_STATE_RUNNING);
        }
      } else {
        setFullAutoState(FULL_AUTO_STATE_IDLE);
      }
    });
  }
}

function getFullAutoState() {
  try {
    return localStorage.getItem(FULL_AUTO_STATE_KEY) || FULL_AUTO_STATE_IDLE;
  } catch (e) {
    return FULL_AUTO_STATE_IDLE;
  }
}

function setFullAutoState(state) {
  try {
    localStorage.setItem(FULL_AUTO_STATE_KEY, state);
  } catch (e) {}
}

function getLastAutoRunFingerprint() {
  try {
    return localStorage.getItem(FULL_AUTO_LAST_RUN_KEY) || "";
  } catch (e) {
    return "";
  }
}

function setLastAutoRunFingerprint(fingerprint) {
  try {
    localStorage.setItem(FULL_AUTO_LAST_RUN_KEY, fingerprint || "");
  } catch (e) {}
}

function alertLastQuestionReached() {
  alert("FULL-AUTO done: last question reached. No next problem was found.");
}

function getQuestionFingerprint(qData) {
  return [
    window.location.pathname,
    qData.type || "",
    String(qData.question || "").slice(0, 2000),
  ].join("|");
}

function getAutomationSettings() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve({ autoSubmit: false, fullAuto: false });
      return;
    }

    chrome.storage.sync.get(
      { autoSubmit: false, fullAuto: false },
      (settings) => {
        if (chrome.runtime.lastError) {
          resolve({ autoSubmit: false, fullAuto: false });
          return;
        }

        resolve({
          autoSubmit: Boolean(settings.autoSubmit),
          fullAuto: Boolean(settings.fullAuto),
        });
      }
    );
  });
}

async function startQuestionFlow({ isAuto }) {
  const qData = await parseQuestion();
  if (!qData) return false;

  const settings = await getAutomationSettings();
  const state = getFullAutoState();
  const fullAutoActive =
    settings.fullAuto ||
    isAuto ||
    state === FULL_AUTO_STATE_RUNNING ||
    state === FULL_AUTO_STATE_AWAITING_NEXT;

  if (fullAutoActive && qData.hasImage) {
    scheduleNextQuestionAdvance();
    return false;
  }

  if (fullAutoActive) {
    const fingerprint = getQuestionFingerprint(qData);
    const lastRun = getLastAutoRunFingerprint();
    if (lastRun && lastRun === fingerprint) {
      return false;
    }
    setLastAutoRunFingerprint(fingerprint);
  }

  if (qData.hasImage && qData.imageSrc) {
    openImageTabOnce(qData.imageSrc);
  }

  chrome.runtime.sendMessage({ type: "openChatGPTTab" }, () => {
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: "sendQuestionToChatGPT",
        question: qData,
      });
    }, 500);
  });

  return true;
}

async function parseQuestion() {
  const container = findProblemContainer();
  if (!container) {
    alert("No problem found on this page.");
    return null;
  }

  const questionText = extractProblemText(container);
  if (!questionText) {
    alert("Could not extract problem text.");
    return null;
  }

  const options = extractOptions(container);
  const imageData = await extractQuestionImageData(container);

  return {
    type: detectQuestionType(container, options),
    question: questionText,
    options,
    imageData: imageData ? imageData.dataUrl : null,
    imageAlt: imageData ? imageData.alt : null,
    imageSrc: imageData ? imageData.src : null,
    hasImage: !!(imageData && imageData.src),
  };
}

function findProblemContainer() {
  const selectors = [
    "#output_problem_body",
    "#problem_body",
    ".problem .problem-content",
    ".problem-content",
    ".problem",
    "#problem",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function detectQuestionType(container, options) {
  if (container.querySelector("input[type=radio]")) return "multiple_choice";
  if (container.querySelector("input[type=checkbox]")) return "multiple_select";
  if (options && options.prompts) return "matching";
  if (container.querySelector("select")) return "matching";
  if (container.querySelector("input[type=text], input[type=number], textarea")) {
    return "fill_in_the_blank";
  }
  return "free_response";
}

function extractProblemText(container) {
  const body =
    container.querySelector("#output_problem_body") ||
    container.querySelector(".problem-content") ||
    container;

  const mathTex = Array.from(
    body.querySelectorAll('script[type^="math/tex"]')
  )
    .map((s) => s.textContent.trim())
    .filter(Boolean);

  const clone = body.cloneNode(true);
  const removeSelectors = [
    "input",
    "textarea",
    "select",
    "button",
    "script",
    "style",
    ".answer",
    ".ans",
    ".submission-box",
    ".submitAnswers",
    ".solutionLink",
    ".problem-controls",
    ".MathJax",
    ".MathJax_Preview",
    ".MJX_Assistive_MathML",
    ".MathJax_Display",
    ".MathJax_SVG",
    ".MathJax_CHTML",
  ];
  clone.querySelectorAll(removeSelectors.join(",")).forEach((el) => el.remove());

  let text = clone.textContent.replace(/\s+/g, " ").trim();
  if (mathTex.length) {
    text += `\nMath: ${mathTex.join(" ; ")}`;
  }
  return text;
}

function extractOptions(container) {
  const radios = Array.from(container.querySelectorAll("input[type=radio]"));
  const checkboxes = Array.from(container.querySelectorAll("input[type=checkbox]"));

  if (radios.length || checkboxes.length) {
    const labels = Array.from(container.querySelectorAll("label"));
    return labels
      .map((label) => label.textContent.trim())
      .filter(Boolean);
  }

  const selectEls = Array.from(container.querySelectorAll("select"));
  if (selectEls.length) {
    const prompts = selectEls.map((sel, i) => `Field ${i + 1}`);
    const choices = Array.from(selectEls[0].options)
      .map((opt) => opt.textContent.trim())
      .filter(Boolean);
    return { prompts, choices };
  }

  return [];
}

async function extractQuestionImageData(container) {
  const MAX_IMAGE_BYTES = 500 * 1024;
  const scope =
    container.querySelector("#output_problem_body") ||
    container.querySelector(".problem-content") ||
    container;

  const candidates = Array.from(scope.querySelectorAll("img"))
    .filter((img) => {
      const src = img.getAttribute("src") || "";
      if (!src) return false;
      if (src.includes("question_mark")) return false;
      if (src.includes("favicon")) return false;
      if (src.includes("icon")) return false;

      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w && h && (w < 24 || h < 24)) return false;

      return true;
    });

  const img = candidates[0];
  if (!img) return null;

  const src = img.getAttribute("src");
  if (!src) return null;

  if (src.startsWith("data:")) {
    return {
      dataUrl: src,
      alt: img.getAttribute("alt") || "",
      src,
    };
  }

  try {
    const resolvedUrl = new URL(src, window.location.href).toString();
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
      return {
        dataUrl: null,
        alt: img.getAttribute("alt") || "",
        src: resolvedUrl,
      };
    }

    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_BYTES) {
      return {
        dataUrl: null,
        alt: img.getAttribute("alt") || "",
        src: resolvedUrl,
      };
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read image data"));
      reader.readAsDataURL(blob);
    });

    return {
      dataUrl: typeof dataUrl === "string" ? dataUrl : null,
      alt: img.getAttribute("alt") || "",
      src: resolvedUrl,
    };
  } catch (e) {
    return {
      dataUrl: null,
      alt: img.getAttribute("alt") || "",
      src: src,
    };
  }
}

function openImageTabOnce(src) {
  if (!src || lastImageOpenedSrc === src) return;
  lastImageOpenedSrc = src;
  const url = src.startsWith("data:")
    ? src
    : new URL(src, window.location.href).toString();
  chrome.runtime.sendMessage({ type: "openImageTab", url });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "chatGPTResponse") {
    try {
      const response = JSON.parse(message.response);
      const filled = fillAnswer(response.answer);
      if (!filled) {
        alert(
          `Answer: ${JSON.stringify(response.answer)}\n\nExplanation: ${response.explanation}\n\nAuto-fill failed. Please fill manually.`
        );
        sendResponse({ received: true });
        return true;
      }

      maybeAutoSubmit().then((automation) => {
        if (automation.fullAuto) {
          scheduleNextQuestionAdvance();
        }
        sendResponse({ received: true });
      });
      return true;
    } catch (e) {
      sendResponse({ received: false });
      return false;
    }
  }
});

if (isWebWorkPage()) {
  addHelperButton();
  bindFullAutoBar();
  bindManualProblemSelectionGuard();
  initFullAutoMode();
}

function isWebWorkPage() {
  const host = window.location.hostname.toLowerCase();
  if (host.includes("webwork")) return true;
  return Boolean(document.querySelector("#problemMainForm"));
}

function getElementText(el) {
  if (!el) return "";
  if (typeof el.value === "string" && el.value.trim()) return el.value.trim();
  return (el.textContent || "").trim();
}

function disableFullAutoForManualProblemSelection() {
  if (!chrome?.storage?.sync) return;

  chrome.storage.sync.get({ fullAuto: false }, (settings) => {
    if (chrome.runtime.lastError || !settings.fullAuto) return;

    setFullAutoState(FULL_AUTO_STATE_IDLE);
    chrome.storage.sync.set({ fullAuto: false }, () => {
      if (chrome.runtime.lastError) return;
      alert("FULL-AUTO turned off: manual problem selection detected.");
    });
  });
}

function bindManualProblemSelectionGuard() {
  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (!target || typeof target.closest !== "function") return;

      const problemLink = target.closest(".problem-list a[href]");
      if (!problemLink) return;

      disableFullAutoForManualProblemSelection();
    },
    true
  );
}

function findNextProblemFromProblemList() {
  const directNext =
    document.querySelector(".problem-list li.currentProblem + li a[href]") ||
    document.querySelector(".problem-list li.active + li a[href]");
  if (directNext) return directNext;

  const current = document.querySelector(
    ".problem-list li.currentProblem, .problem-list li.active"
  );
  if (!current) return null;

  let nextLi = current.nextElementSibling;
  while (nextLi) {
    const link = nextLi.querySelector("a[href]");
    if (link) return link;
    nextLi = nextLi.nextElementSibling;
  }

  return null;
}

function isAtEndOfProblemList() {
  const hasCurrent = Boolean(
    document.querySelector(".problem-list li.currentProblem, .problem-list li.active")
  );
  if (!hasCurrent) return false;
  return !findNextProblemFromProblemList();
}

function findNextQuestionControl() {
  const nextFromList = findNextProblemFromProblemList();
  if (nextFromList) return nextFromList;

  const form = document.querySelector("#problemMainForm");
  const scoped = form || document;

  const directCandidates = [
    "#nextProblem_id",
    'input[name="nextProblem"]',
    'button[name="nextProblem"]',
    'a[rel="next"]',
    'button[rel="next"]',
  ];

  for (const selector of directCandidates) {
    const el = scoped.querySelector(selector);
    if (el) return el;
  }

  const fuzzyCandidates = Array.from(
    scoped.querySelectorAll('a, button, input[type="submit"], input[type="button"]')
  );

  for (const el of fuzzyCandidates) {
    const text = normalizeText(getElementText(el));
    if (
      text.includes("next problem") ||
      text === "next" ||
      text.includes("next pg")
    ) {
      return el;
    }
  }

  return null;
}

function clickNextQuestionIfAvailable() {
  const nextControl = findNextQuestionControl();
  if (!nextControl) return false;
  nextControl.click();
  return true;
}

function scheduleNextQuestionAdvance() {
  if (isAtEndOfProblemList()) {
    setFullAutoState(FULL_AUTO_STATE_IDLE);
    alertLastQuestionReached();
    return;
  }

  let attempts = 0;
  const maxAttempts = 12;

  const tryAdvance = () => {
    if (clickNextQuestionIfAvailable()) {
      setFullAutoState(FULL_AUTO_STATE_IDLE);
      return;
    }

    attempts += 1;
    if (attempts < maxAttempts) {
      setTimeout(tryAdvance, 700);
    } else {
      setFullAutoState(FULL_AUTO_STATE_IDLE);
      alertLastQuestionReached();
    }
  };

  setTimeout(tryAdvance, 1200);
}

async function initFullAutoMode() {
  const settings = await getAutomationSettings();
  if (!settings.fullAuto) return;

  const state = getFullAutoState();

  if (state === FULL_AUTO_STATE_AWAITING_NEXT) {
    if (clickNextQuestionIfAvailable()) {
      setFullAutoState(FULL_AUTO_STATE_IDLE);
      return;
    }
    setTimeout(() => {
      if (clickNextQuestionIfAvailable()) {
        setFullAutoState(FULL_AUTO_STATE_IDLE);
      } else {
        startQuestionFlow({ isAuto: true });
      }
    }, 800);
    return;
  }

  if (state === FULL_AUTO_STATE_IDLE) {
    setFullAutoState(FULL_AUTO_STATE_RUNNING);
  }
  startQuestionFlow({ isAuto: true });
}

function fillAnswer(answer) {
  const container = findProblemContainer();
  if (!container) return false;

  if (container.querySelector("input[type=radio]")) {
    return fillMultipleChoice(container, answer);
  }
  if (container.querySelector("input[type=checkbox]")) {
    return fillMultipleSelect(container, answer);
  }
  if (container.querySelector("select")) {
    return fillMatching(container, answer);
  }
  if (container.querySelector("input[type=text], input[type=number], textarea")) {
    return fillFillInBlank(container, answer);
  }
  return false;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getInputLabelText(input) {
  if (!input) return "";
  const id = input.getAttribute("id");
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent.trim();
  }
  const parentLabel = input.closest("label");
  if (parentLabel) return parentLabel.textContent.trim();
  const sibling = input.parentElement;
  if (sibling) return sibling.textContent.trim();
  return "";
}

function setInputValue(input, value) {
  if (!input) return;
  if ("value" in input) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function fillMultipleChoice(container, answer) {
  const radios = Array.from(container.querySelectorAll("input[type=radio]"));
  const normalizedAnswer = normalizeText(answer);
  if (!radios.length || !normalizedAnswer) return false;

  const choices = radios.map((radio) => ({
    input: radio,
    text: normalizeText(getInputLabelText(radio)),
  }));

  let match = choices.find((c) => c.text === normalizedAnswer);
  if (!match) {
    match = choices.find((c) => c.text && normalizedAnswer.includes(c.text));
  }
  if (!match) return false;

  match.input.checked = true;
  match.input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fillMultipleSelect(container, answer) {
  const checkboxes = Array.from(container.querySelectorAll("input[type=checkbox]"));
  if (!checkboxes.length) return false;

  let answers = [];
  if (Array.isArray(answer)) {
    answers = answer;
  } else if (typeof answer === "string") {
    answers = answer.split(/[,;\n]+/);
  } else {
    return false;
  }

  const normalizedAnswers = answers.map(normalizeText).filter(Boolean);
  if (!normalizedAnswers.length) return false;

  let anyChecked = false;
  for (const box of checkboxes) {
    const text = normalizeText(getInputLabelText(box));
    if (!text) continue;
    const shouldCheck = normalizedAnswers.some(
      (ans) => ans === text || ans.includes(text)
    );
    if (shouldCheck) {
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      anyChecked = true;
    }
  }

  return anyChecked;
}

function fillMatching(container, answer) {
  const selects = Array.from(container.querySelectorAll("select"));
  if (!selects.length) return false;

  let answers = [];
  if (Array.isArray(answer)) {
    answers = answer;
  } else if (typeof answer === "string") {
    answers = answer.split(/\n+/).filter(Boolean);
  } else if (answer && typeof answer === "object") {
    answers = Object.values(answer);
  } else {
    return false;
  }

  const normalizedAnswers = answers.map((a) => {
    const parts = String(a).split("->");
    return normalizeText(parts[parts.length - 1]);
  });

  let anySet = false;
  selects.forEach((select, i) => {
    const target = normalizedAnswers[i] || "";
    if (!target) return;
    const option = Array.from(select.options).find(
      (opt) => normalizeText(opt.textContent) === target
    );
    if (option) {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      anySet = true;
    }
  });

  return anySet;
}

function fillFillInBlank(container, answer) {
  const inputs = Array.from(
    container.querySelectorAll("input[type=text], input[type=number], textarea")
  );
  if (!inputs.length) return false;

  let answers = [];
  if (Array.isArray(answer)) {
    answers = answer;
  } else if (answer !== null && answer !== undefined) {
    answers = [answer];
  } else {
    return false;
  }

  inputs.forEach((input, i) => {
    const value = answers[i] !== undefined ? answers[i] : "";
    setInputValue(input, value);
  });

  return true;
}

function clickSubmitIfAvailable() {
  const form = document.querySelector("#problemMainForm");
  if (!form) return false;

  const submitBtn =
    form.querySelector("#submitAnswers_id") ||
    form.querySelector('input[name="submitAnswers"]') ||
    form.querySelector('button[name="submitAnswers"]') ||
    form.querySelector('[value="Submit Answers"]');

  if (submitBtn) {
    submitBtn.click();
    return true;
  }

  return false;
}

function maybeAutoSubmit() {
  return new Promise((resolve) => {
    getAutomationSettings().then((settings) => {
      const shouldSubmit = settings.autoSubmit;
      let submitted = false;

      if (shouldSubmit) {
        if (settings.fullAuto) {
          setFullAutoState(FULL_AUTO_STATE_AWAITING_NEXT);
        }
        submitted = clickSubmitIfAvailable();
        if (settings.fullAuto && !submitted) {
          setFullAutoState(FULL_AUTO_STATE_IDLE);
        }
      }

      resolve({
        autoSubmit: settings.autoSubmit,
        fullAuto: settings.fullAuto,
        submitted,
      });
    });
  });
}
