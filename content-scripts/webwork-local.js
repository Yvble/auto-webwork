let lastImageOpenedSrc = null;

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
  btn.addEventListener("click", async () => {
    const qData = await parseQuestion();
    if (!qData) return;

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
  });

  document.body.appendChild(btn);
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

      maybeAutoSubmit().then(() => {
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
}

function isWebWorkPage() {
  const host = window.location.hostname.toLowerCase();
  if (host.includes("webwork")) return true;
  return Boolean(document.querySelector("#problemMainForm"));
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
  if (!form) return;

  const submitBtn =
    form.querySelector("#submitAnswers_id") ||
    form.querySelector('input[name="submitAnswers"]') ||
    form.querySelector('button[name="submitAnswers"]') ||
    form.querySelector('[value="Submit Answers"]');

  if (submitBtn) {
    submitBtn.click();
  }
}

function maybeAutoSubmit() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve();
      return;
    }

    chrome.storage.sync.get({ autoSubmit: false }, (settings) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }

      if (settings.autoSubmit) {
        clickSubmitIfAvailable();
      }
      resolve();
    });
  });
}
