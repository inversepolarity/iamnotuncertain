// Use browser API (Firefox) with fallback to chrome API
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

let isEnabled = true;
let redirectState = new Map();

// Load initial state
browserAPI.storage.sync
  .get(["enabled"])
  .then((result) => {
    isEnabled = result.enabled !== false;
    updateIcon(isEnabled);
  })
  .catch(() => {
    // Fallback for Chrome callback style
    browserAPI.storage.sync.get(["enabled"], (result) => {
      isEnabled = result.enabled !== false;
      updateIcon(isEnabled);
    });
  });

// Update toolbar icon
function updateIcon(enabled) {
  const iconPaths = enabled ? ICON_ACTIVE : ICON_INACTIVE;

  browserAPI.action.setIcon({ path: iconPaths }).catch((err) => {
    console.log("Icon update error:", err);
  });
}

// Show page action when redirecting
async function showPageAction(tabId, index, url) {
  try {
    await browserAPI.pageAction.show(tabId);

    await browserAPI.pageAction.setTitle({
      tabId,
      title: `⚡ Redirecting to result #${index} - Click to cancel`,
    });

    // Set redirecting icon
    await browserAPI.pageAction.setIcon({
      tabId,
      path: {
        16: "icons/redirecting_16.png",
        32: "icons/redirecting_32.png",
      },
    });

    redirectState.set(tabId, {
      status: "redirecting",
      index,
      url,
    });
  } catch (error) {
    console.error("Error showing page action:", error);
  }
}

// Hide page action
async function hidePageAction(tabId) {
  try {
    await browserAPI.pageAction.hide(tabId);
    redirectState.delete(tabId);
  } catch (error) {
    console.error("Error hiding page action:", error);
  }
}

// Show cancelled state
async function showCancelledState(tabId) {
  try {
    await browserAPI.pageAction.setTitle({
      tabId,
      title: "Redirect cancelled",
    });

    await browserAPI.pageAction.setIcon({
      tabId,
      path: {
        16: "icons/cancelled_16.png",
        32: "icons/cancelled_32.png",
      },
    });

    redirectState.set(tabId, { status: "cancelled" });

    setTimeout(() => {
      hidePageAction(tabId);
    }, 2000);
  } catch (error) {
    console.error("Error showing cancelled state:", error);
  }
}

// Handle page action click
browserAPI.pageAction.onClicked.addListener((tab) => {
  const state = redirectState.get(tab.id);

  if (state && state.status === "redirecting") {
    browserAPI.tabs.sendMessage(tab.id, { action: "cancelRedirect" });
    showCancelledState(tab.id);
  }
});

// Handle toolbar icon click
browserAPI.action.onClicked.addListener((tab) => {
  isEnabled = !isEnabled;

  browserAPI.storage.sync
    .set({ enabled: isEnabled })
    .then(() => {
      updateIcon(isEnabled);
    })
    .catch(() => {
      // Fallback
      browserAPI.storage.sync.set({ enabled: isEnabled }, () => {
        updateIcon(isEnabled);
      });
    });
});

// Listen for messages from content script
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (!tabId) return;

  switch (message.action) {
    case "redirecting":
      showPageAction(tabId, message.index, message.url);
      break;

    case "redirectComplete":
      hidePageAction(tabId);
      break;

    case "redirectFailed":
      hidePageAction(tabId);
      break;

    case "redirectCancelled":
      showCancelledState(tabId);
      break;
  }
});

// Listen for storage changes
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    isEnabled = changes.enabled.newValue;
    updateIcon(isEnabled);
  }
});

// Clean up on tab close
browserAPI.tabs.onRemoved.addListener((tabId) => {
  redirectState.delete(tabId);
});

// Clean up on navigation
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    const state = redirectState.get(tabId);
    if (state && state.status === "redirecting") {
      setTimeout(() => {
        if (redirectState.get(tabId)?.status === "redirecting") {
          hidePageAction(tabId);
        }
      }, 1000);
    } else if (state && state.status !== "cancelled") {
      hidePageAction(tabId);
    }
  }
});

// Initialize on install/startup
browserAPI.runtime.onInstalled.addListener(() => {
  browserAPI.storage.sync.get(["enabled"], (result) => {
    isEnabled = result.enabled !== false;
    updateIcon(isEnabled);
  });
});

// Listen for storage changes from options page
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    isEnabled = changes.enabled.newValue;
    updateIcon(isEnabled);
    console.log(
      "Background: Icon updated to",
      isEnabled ? "active" : "inactive"
    );
  }
});
