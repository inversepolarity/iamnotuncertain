// Use browser API with fallback
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

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
    icon.src = "icons/icon_active.png";
    text.textContent = "Enabled";
  } else {
    icon.src = "icons/icon_deactivated.png";
    text.textContent = "Disabled";
  }
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
  });
}

document.addEventListener("DOMContentLoaded", () => {
  browserAPI.storage.sync
    .get(["enabled", "resultIndex", "enabledEngines", "showNotification"])
    .then((result) => {
      const enabled = result.enabled !== false;
      const resultIndex = result.resultIndex || 1;
      const showNotification = result.showNotification !== false;

      document.getElementById("enabled").checked = enabled;
      document.getElementById("resultIndex").value = resultIndex;
      document.getElementById("showNotification").checked = showNotification;

      updateStatusIndicator(enabled);
      updateOrdinal(resultIndex);
      populateEngines(result.enabledEngines || {});
    })
    .catch(() => {
      // Fallback
      browserAPI.storage.sync.get(
        ["enabled", "resultIndex", "enabledEngines", "showNotification"],
        (result) => {
          const enabled = result.enabled !== false;
          const resultIndex = result.resultIndex || 1;
          const showNotification = result.showNotification !== false;

          document.getElementById("enabled").checked = enabled;
          document.getElementById("resultIndex").value = resultIndex;
          document.getElementById("showNotification").checked =
            showNotification;

          updateStatusIndicator(enabled);
          updateOrdinal(resultIndex);
          populateEngines(result.enabledEngines || {});
        }
      );
    });
});

document.getElementById("enabled").addEventListener("change", (e) => {
  updateStatusIndicator(e.target.checked);
});

document.getElementById("resultIndex").addEventListener("input", (e) => {
  updateOrdinal(parseInt(e.target.value) || 1);
});

document.getElementById("save").addEventListener("click", () => {
  const enabled = document.getElementById("enabled").checked;
  const resultIndex = parseInt(document.getElementById("resultIndex").value);
  const showNotification = document.getElementById("showNotification").checked;

  const enabledEngines = {};
  Object.keys(SEARCH_ENGINES).forEach((key) => {
    const checkbox = document.getElementById(`engine-${key}`);
    enabledEngines[key] = checkbox.checked;
  });

  browserAPI.storage.sync
    .set({
      enabled,
      resultIndex,
      enabledEngines,
      showNotification,
    })
    .then(() => {
      const status = document.getElementById("status");
      status.style.display = "block";
      setTimeout(() => {
        status.style.display = "none";
      }, 3000);
    })
    .catch(() => {
      // Fallback
      browserAPI.storage.sync.set(
        {
          enabled,
          resultIndex,
          enabledEngines,
          showNotification,
        },
        () => {
          const status = document.getElementById("status");
          status.style.display = "block";
          setTimeout(() => {
            status.style.display = "none";
          }, 3000);
        }
      );
    });
});

document.getElementById("reset").addEventListener("click", () => {
  if (confirm("Reset all settings to defaults?")) {
    document.getElementById("enabled").checked = true;
    document.getElementById("resultIndex").value = 1;
    document.getElementById("showNotification").checked = true;

    updateStatusIndicator(true);
    updateOrdinal(1);

    Object.keys(SEARCH_ENGINES).forEach((key) => {
      const checkbox = document.getElementById(`engine-${key}`);
      checkbox.checked = true;
    });
  }
});
