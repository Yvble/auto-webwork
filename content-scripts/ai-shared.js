window.AutoWebWork = window.AutoWebWork || {};

window.AutoWebWork.buildPromptText = function buildPromptText(questionData) {
  const { type, question, options } = questionData;
  let text = `Type: ${type}\nQuestion: ${question}`;

  if (type === "dropdown") {
    text +=
      "\nDropdowns (choose exactly one option for each, in order):\n" +
      options.fields
        .map((field, i) => `${i + 1}. Options: ${field.choices.join(", ")}`)
        .join("\n");
    text +=
      "\n\nFormat your answer as an array with one chosen option per dropdown, in the same order as listed above. Use the exact option text, no numbers.";
  } else if (type === "fill_in_the_blank") {
    text +=
      "\n\nThis is a fill in the blank question. If there are multiple blanks, provide answers as an array in order of appearance. For a single blank, you can provide a string.";
  } else if (options && options.length > 0) {
    text +=
      "\nOptions:\n" + options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
    text +=
      "\n\nIMPORTANT: Your answer must EXACTLY match one of the above options. Do not include numbers in your answer. If there are periods, include them.";
  }

  text +=
    '\n\nPlease provide your answer in JSON format with keys "answer" and "explanation". Explanations should be no more than one sentence.';
  text += "\nReturn ONLY the JSON object code block. No extra text.";

  text +=
    "\n\nIMPORTANT: Format the answer exactly as a WeBWorK input. Use: pi, INF, e or exp(1), sqrt(x), ln(x), abs(x); trig functions sin, cos, tan, csc, sec, cot, arcsin, arccos, arctan (radians). Use parentheses/brackets for intervals like (1,3], unions like (-INF,3)U[5,INF), sets like {3} or {}. Vectors use <1,2,3> and matrices use [[1,2],[3,4]]. Use * for multiplication when needed.";

  return text;
};

// Quick attempt while the reply may still be streaming: looks for any {...}
// blob that parses as JSON with an "answer" key.
window.AutoWebWork.tryParseAnswerJson = function tryParseAnswerJson(rawText) {
  const cleaned = String(rawText || "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\n\s*/g, " ")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : cleaned;

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && parsed.answer !== undefined) return candidate;
  } catch (e) {}

  return null;
};

// Stricter fallback once generation has settled: requires both "answer" and
// "explanation" keys to be present in the matched text.
window.AutoWebWork.extractStrictAnswerJson = function extractStrictAnswerJson(
  rawText
) {
  const text = String(rawText || "").trim();
  const pattern = /\{[\s\S]*?"answer"[\s\S]*?"explanation"[\s\S]*?\}/;
  const match = text.match(pattern);
  return match ? match[0] : null;
};
