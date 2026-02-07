const DEFAULTS = {
  autoSubmit: false,
  fullAuto: false,
};

const elements = {
  autoSubmit: document.getElementById("autoSubmit"),
  fullAuto: document.getElementById("fullAuto"),
  currentVersion: document.getElementById("current-version"),
  saveStatus: document.getElementById("save-status"),
};

function setStatus(text) {
  if (!elements.saveStatus) return;
  elements.saveStatus.textContent = text;
}

function applySettingsToUI(settings) {
  if (elements.fullAuto) {
    elements.fullAuto.checked = Boolean(settings.fullAuto);
  }

  if (elements.autoSubmit) {
    elements.autoSubmit.checked = Boolean(settings.autoSubmit);
    elements.autoSubmit.disabled = false;
  }
}

function loadSettings() {
  const manifest = chrome.runtime.getManifest();
  if (elements.currentVersion && manifest?.version) {
    elements.currentVersion.textContent = manifest.version;
  }

  chrome.storage.sync.get(DEFAULTS, (settings) => {
    if (chrome.runtime.lastError) {
      setStatus("Settings unavailable");
      return;
    }

    applySettingsToUI(settings);
  });
}

function bindEvents() {
  if (elements.autoSubmit) {
    elements.autoSubmit.addEventListener("change", (event) => {
      const enabled = Boolean(event.target.checked);
      chrome.storage.sync.set({ autoSubmit: enabled }, () => {
        if (chrome.runtime.lastError) {
          setStatus("Save failed");
          return;
        }
        setStatus("Settings saved");
      });
    });
  }

  if (elements.fullAuto) {
    elements.fullAuto.addEventListener("change", (event) => {
      const fullAutoEnabled = Boolean(event.target.checked);
      const nextSettings = { fullAuto: fullAutoEnabled };

      chrome.storage.sync.set(nextSettings, () => {
        if (chrome.runtime.lastError) {
          setStatus("Save failed");
          return;
        }

        chrome.storage.sync.get(DEFAULTS, (settings) => {
          if (!chrome.runtime.lastError) {
            applySettingsToUI(settings);
          }
          setStatus("Settings saved");
        });
      });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  bindEvents();
});
