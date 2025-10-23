// Use browser API with fallback
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const ICON_ACTIVE = {
  16: "icons/icon16_active.png",
  32: "icons/icon32_active.png",
  48: "icons/icon48_active.png",
};

const ICON_INACTIVE = {
  16: "icons/icon16_inactive.png",
  32: "icons/icon32_inactive.png",
  48: "icons/icon48_inactive.png",
};

function updateOrdinal(n) {
  const ordinals = ["th", "st", "nd", "rd"];
  const v = n % 100;
  const suffix = ordinals[(v - 20) % 10] || ordinals[v] || ordinals[0];
  document.getElementById("ordinal").textContent = n + suffix;
}

function updateStatusIndicator(enabled) {
  const icon = document.getElementById("statusIcon");
  const text = document.getElementById("statusText");

  if (enabled) {
    icon.src = "icons/icon48_active.png";
    text.textContent = "Enabled";
  } else {
    icon.src = "icons/icon48_inactive.png";
    text.textContent = "Disabled";
  }
}

function updateToolbarIcon(enabled) {
  const iconPaths = enabled ? ICON_ACTIVE : ICON_INACTIVE;

  browserAPI.action.setIcon({ path: iconPaths }).catch((err) => {
    console.log("Icon update:", err);
  });
}

function populateEngines(enabledEngines = {}) {
  const grid = document.getElementById("enginesGrid");
  grid.innerHTML = "";

  const allEnabled = Object.keys(enabledEngines).length === 0;

  Object.entries(SEARCH_ENGINES).forEach(([key, engine]) => {
    const item = document.createElement("div");
    item.className = "engine-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `engine-${key}`;
    checkbox.checked = allEnabled ? true : enabledEngines[key] || false;

    const label = document.createElement("label");
    label.htmlFor = `engine-${key}`;
    label.textContent = engine.name;

    item.appendChild(checkbox);
    item.appendChild(label);
    grid.appendChild(item);

    // Auto-save on change
    checkbox.addEventListener("change", saveSettings);
  });
}

function showSavedMessage() {
  const status = document.getElementById("status");
  status.style.display = "block";
  status.textContent = "✓ Saved";
  setTimeout(() => {
    status.style.display = "none";
  }, 1000);
}

function saveSettings() {
  const enabled = document.getElementById("enabled").checked;
  const resultIndex = parseInt(document.getElementById("resultIndex").value);
  const showNotification = document.getElementById("showNotification").checked;

  const enabledEngines = {};
  Object.keys(SEARCH_ENGINES).forEach((key) => {
    const checkbox = document.getElementById(`engine-${key}`);
    if (checkbox) {
      enabledEngines[key] = checkbox.checked;
    }
  });

  browserAPI.storage.sync.set(
    {
      enabled,
      resultIndex,
      enabledEngines,
      showNotification,
    },
    () => {
      showSavedMessage();
      updateToolbarIcon(enabled);
    }
  );
}

function loadSettings() {
  browserAPI.storage.sync.get(
    ["enabled", "resultIndex", "enabledEngines", "showNotification"],
    (result) => {
      const enabled = result.enabled !== false;
      const resultIndex = result.resultIndex || 1;
      const showNotification = result.showNotification !== false;

      document.getElementById("enabled").checked = enabled;
      document.getElementById("resultIndex").value = resultIndex;
      document.getElementById("showNotification").checked = showNotification;

      updateStatusIndicator(enabled);
      updateOrdinal(resultIndex);
      populateEngines(result.enabledEngines || {});
    }
  );
  let ver = document.getElementById("version");
  ver.innerText = "evenzero.in / " + browserAPI.runtime.getManifest().version;
}

// Listen for changes from other sources (popup/background)
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.enabled) {
      const enabledToggle = document.getElementById("enabled");
      if (enabledToggle.checked !== changes.enabled.newValue) {
        enabledToggle.checked = changes.enabled.newValue;
        updateStatusIndicator(changes.enabled.newValue);
        console.log("Options: Synced enabled state from external source");
      }
    }

    if (changes.resultIndex) {
      const indexInput = document.getElementById("resultIndex");
      if (parseInt(indexInput.value) !== changes.resultIndex.newValue) {
        indexInput.value = changes.resultIndex.newValue;
        updateOrdinal(changes.resultIndex.newValue);
      }
    }

    if (changes.showNotification) {
      const notifToggle = document.getElementById("showNotification");
      if (notifToggle.checked !== changes.showNotification.newValue) {
        notifToggle.checked = changes.showNotification.newValue;
      }
    }

    if (changes.enabledEngines) {
      populateEngines(changes.enabledEngines.newValue);
    }
  }
});

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  // Auto-save listeners
  document.getElementById("enabled").addEventListener("change", (e) => {
    updateStatusIndicator(e.target.checked);
    saveSettings();
  });

  document.getElementById("resultIndex").addEventListener("input", (e) => {
    updateOrdinal(parseInt(e.target.value) || 1);
  });

  document
    .getElementById("resultIndex")
    .addEventListener("change", saveSettings);

  document
    .getElementById("showNotification")
    .addEventListener("change", saveSettings);

  // Reset button
  document.getElementById("reset").addEventListener("click", () => {
    if (confirm("Reset all settings to defaults?")) {
      document.getElementById("enabled").checked = true;
      document.getElementById("resultIndex").value = 1;
      document.getElementById("showNotification").checked = true;

      updateStatusIndicator(true);
      updateOrdinal(1);

      Object.keys(SEARCH_ENGINES).forEach((key) => {
        const checkbox = document.getElementById(`engine-${key}`);
        if (checkbox) {
          checkbox.checked = true;
        }
      });

      saveSettings();
    }
  });
});

const resultIndexInput = document.getElementById("resultIndex");

// Validate on input change
resultIndexInput.addEventListener("input", function () {
  let value = parseInt(this.value);

  // Remove non-numeric characters
  this.value = this.value.replace(/[^0-9]/g, "");

  // If empty, don't validate yet
  if (this.value === "") return;

  // Clamp value between 1 and 5
  if (value < 1) {
    this.value = "1";
  } else if (value > 5) {
    this.value = "5";
  }
});

// Validate on blur (when user leaves the field)
resultIndexInput.addEventListener("blur", function () {
  // If empty or invalid, set to 1
  if (this.value === "" || parseInt(this.value) < 1) {
    this.value = "1";
  } else if (parseInt(this.value) > 5) {
    this.value = "5";
  }
});

// Prevent invalid input on paste
resultIndexInput.addEventListener("paste", function (e) {
  setTimeout(() => {
    let value = parseInt(this.value);
    if (isNaN(value) || value < 1) {
      this.value = "1";
    } else if (value > 5) {
      this.value = "5";
    }
  }, 0);
});
