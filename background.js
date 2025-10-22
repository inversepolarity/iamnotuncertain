// Use browser API (Firefox) with fallback to chrome API
const browserAPI = typeof browser !== "undefined" ? browser : chrome;
const isFirefox = typeof browser !== "undefined";

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

const ICON_REDIRECTING = {
  16: "icons/redirecting16.png",
  32: "icons/redirecting32.png",
};

const ICON_CANCELLED = {
  16: "icons/icons16_cancelled.png",
  32: "icons/icons32_cancelled.png",
  48: "icons/icons48_cancelled.png",
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

// Update toolbar icon (global state)
function updateIcon(enabled) {
  const iconPaths = enabled ? ICON_ACTIVE : ICON_INACTIVE;

  browserAPI.action.setIcon({ path: iconPaths }).catch((err) => {
    console.log("Icon update error:", err);
  });
}

// Show redirecting state - CROSS-BROWSER
async function showRedirectingState(tabId, index, url) {
  try {
    redirectState.set(tabId, {
      status: "redirecting",
      index,
      url,
    });

    if (isFirefox) {
      // Firefox: Use pageAction (shows in address bar)
      await browserAPI.pageAction.show(tabId);
      await browserAPI.pageAction.setTitle({
        tabId,
        title: `⚡ Redirecting to result #${index} - Click to cancel`,
      });
      await browserAPI.pageAction.setIcon({
        tabId,
        path: ICON_REDIRECTING,
      });
    } else {
      // Chrome/Brave: Use action with tabId (changes toolbar icon for specific tab)
      await browserAPI.action.setIcon({
        tabId,
        path: ICON_REDIRECTING,
      });
      await browserAPI.action.setTitle({
        tabId,
        title: `Redirecting to result #${index} - Click to cancel`,
      });
    }
  } catch (error) {
    console.error("Error showing redirecting state:", error);
  }
}

// Hide redirecting state - CROSS-BROWSER
async function hideRedirectingState(tabId) {
  try {
    redirectState.delete(tabId);

    if (isFirefox) {
      await browserAPI.pageAction.hide(tabId);
    } else {
      // Chrome/Brave: Reset to default icon for this tab
      await browserAPI.action.setIcon({
        tabId,
        path: isEnabled ? ICON_ACTIVE : ICON_INACTIVE,
      });
      await browserAPI.action.setTitle({
        tabId,
        title: "i am not uncertain",
      });
    }
  } catch (error) {
    console.error("Error hiding redirecting state:", error);
  }
}

// Show cancelled state - CROSS-BROWSER
async function showCancelledState(tabId) {
  try {
    redirectState.set(tabId, { status: "cancelled" });

    if (isFirefox) {
      await browserAPI.pageAction.setTitle({
        tabId,
        title: "Redirect cancelled",
      });
      await browserAPI.pageAction.setIcon({
        tabId,
        path: ICON_CANCELLED,
      });
    } else {
      // Chrome/Brave
      await browserAPI.action.setIcon({
        tabId,
        path: ICON_CANCELLED,
      });
      await browserAPI.action.setTitle({
        tabId,
        title: "Redirect cancelled",
      });
    }

    setTimeout(() => {
      hideRedirectingState(tabId);
    }, 2000);
  } catch (error) {
    console.error("Error showing cancelled state:", error);
  }
}

// Handle page action click (Firefox only)
if (isFirefox && browserAPI.pageAction?.onClicked) {
  browserAPI.pageAction.onClicked.addListener((tab) => {
    const state = redirectState.get(tab.id);

    if (state && state.status === "redirecting") {
      browserAPI.tabs.sendMessage(tab.id, { action: "cancelRedirect" });
      showCancelledState(tab.id);
    }
  });
}

// Handle toolbar icon click (action) - WORKS FOR BOTH BROWSERS
browserAPI.action.onClicked.addListener((tab) => {
  const state = redirectState.get(tab.id);

  // If currently redirecting on this tab, cancel it (Chrome/Brave behavior)
  if (!isFirefox && state && state.status === "redirecting") {
    browserAPI.tabs.sendMessage(tab.id, { action: "cancelRedirect" });
    showCancelledState(tab.id);
    return;
  }

  // Otherwise toggle enabled state
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
      showRedirectingState(tabId, message.index, message.url);
      break;

    case "redirectComplete":
      hideRedirectingState(tabId);
      break;

    case "redirectFailed":
      hideRedirectingState(tabId);
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
    console.log(
      "Background: Icon updated to",
      isEnabled ? "active" : "inactive"
    );
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
          hideRedirectingState(tabId);
        }
      }, 1000);
    } else if (state && state.status !== "cancelled") {
      hideRedirectingState(tabId);
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

// context menu
// Create context menu on install/startup
function createContextMenu() {
  browserAPI.contextMenus.removeAll(() => {
    browserAPI.contextMenus.create({
      id: "open-options",
      title: "Options...",
      contexts: ["action"], // Chrome/Brave
    });

    // Firefox uses "browser_action" instead of "action" in MV3
    if (isFirefox) {
      browserAPI.contextMenus.create({
        id: "open-options-firefox",
        title: "Options...",
        contexts: ["browser_action"],
      });
    }
  });
}

// Handle context menu clicks
browserAPI.contextMenus.onClicked.addListener((info, tab) => {
  if (
    info.menuItemId === "open-options" ||
    info.menuItemId === "open-options-firefox"
  ) {
    browserAPI.runtime.openOptionsPage();
  }
});

// Create menu on install
browserAPI.runtime.onInstalled.addListener(() => {
  createContextMenu();

  // ... your existing onInstalled code ...
  browserAPI.storage.sync.get(["enabled"], (result) => {
    isEnabled = result.enabled !== false;
    updateIcon(isEnabled);
  });
});

// Recreate menu on startup (in case it was cleared)
createContextMenu();
