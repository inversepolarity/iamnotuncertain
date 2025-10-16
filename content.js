(function () {
  "use strict";

  let config = {
    enabled: true,
    resultIndex: 1,
    enabledEngines: {},
    showNotification: true,
  };

  let redirectCancelled = false;
  let redirectTimeout = null;
  let countdownInterval = null;

  // Detect current search engine
  function detectSearchEngine() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    for (const [key, engine] of Object.entries(SEARCH_ENGINES)) {
      if (engine.domains.some((domain) => hostname.includes(domain))) {
        if (pathname.includes(engine.searchPath)) {
          return { key, engine };
        }
      }
    }
    return null;
  }

  // Check if current URL has a search query
  function hasSearchQuery(engine) {
    const params = new URLSearchParams(window.location.search);
    return (
      params.has(engine.queryParam) &&
      params.get(engine.queryParam).trim() !== ""
    );
  }

  // Extract Nth search result
  function extractNthResult(engine, n) {
    for (const selector of engine.selectors) {
      try {
        const links = Array.from(document.querySelectorAll(selector));

        // Filter out excluded patterns
        const validLinks = links.filter((link) => {
          const href = link.href;
          if (!href || href === window.location.href) return false;

          return !engine.excludePatterns.some((pattern) =>
            href.toLowerCase().includes(pattern.toLowerCase())
          );
        });

        // Remove duplicates
        const uniqueLinks = [];
        const seenUrls = new Set();

        for (const link of validLinks) {
          const url = link.href;
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            uniqueLinks.push(link);
          }
        }

        if (uniqueLinks.length >= n) {
          return uniqueLinks[n - 1].href;
        }
      } catch (e) {
        console.error("Error with selector:", selector, e);
      }
    }

    return null;
  }

  // Create and show notification overlay
  function showRedirectNotification(resultUrl, index, delay) {
    if (!config.showNotification) return;

    // Remove any existing notification
    const existing = document.getElementById("search-notification");
    if (existing) {
      existing.remove();
    }

    // Detect browser theme with multiple fallbacks
    function detectTheme() {
      // Method 1: Check prefers-color-scheme
      const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if (darkModeQuery.media !== "not all") {
        if (darkModeQuery.matches) return "dark";
      }

      // Method 2: Check page background color as fallback
      const bgColor = window.getComputedStyle(document.body).backgroundColor;
      if (bgColor) {
        const rgb = bgColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const brightness =
            (parseInt(rgb[0]) * 299 +
              parseInt(rgb[1]) * 587 +
              parseInt(rgb[2]) * 114) /
            1000;
          if (brightness < 128) return "dark";
        }
      }

      // Default to light theme
      return "light";
    }

    const theme = detectTheme();
    const prefersDark = theme === "dark";

    // Define color schemes
    const colors = prefersDark
      ? {
          bg: "#1a1a1a",
          text: "white",
          border: "rgba(255, 255, 255, 0.1)",
          shadow: "rgba(0, 0, 0, 0.2)",
          spinnerBorder: "rgba(255, 255, 255, 0.2)",
          spinnerTop: "white",
          urlBg: "rgba(255, 255, 255, 0.05)",
          cancelBg: "rgba(255, 255, 255, 0.08)",
          cancelBorder: "rgba(255, 255, 255, 0.1)",
        }
      : {
          bg: "#ffffff",
          text: "#1a1a1a",
          border: "rgba(0, 0, 0, 0.1)",
          shadow: "rgba(0, 0, 0, 0.15)",
          spinnerBorder: "rgba(0, 0, 0, 0.2)",
          spinnerTop: "#1a1a1a",
          urlBg: "rgba(0, 0, 0, 0.05)",
          cancelBg: "rgba(0, 0, 0, 0.08)",
          cancelBorder: "rgba(0, 0, 0, 0.15)",
        };

    const notification = document.createElement("div");
    notification.id = "search-notification";

    // Get the icon URL
    const iconUrl =
      typeof chrome !== "undefined" && chrome.runtime
        ? chrome.runtime.getURL("icons/redirecting32.png")
        : "icons/redirecting32.png";

    // Create style element
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(400px); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .search-fade-out {
          animation: slideOut 0.3s ease !important;
        }
      `;

    // Create main container
    const container = document.createElement("div");
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors.bg};
      color: ${colors.text};
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 2px 16px ${colors.shadow};
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      min-width: 340px;
      max-width: 400px;
      animation: slideIn 0.3s ease;
      border: 1px solid ${colors.border};
    `;

    // Create header section
    const header = document.createElement("div");
    header.style.cssText =
      "display: flex; align-items: center; gap: 12px; margin-bottom: 12px;";

    // Create spinner
    const spinner = document.createElement("div");
    spinner.style.cssText = `
      width: 20px;
      height: 20px;
      border: 2px solid ${colors.spinnerBorder};
      border-top-color: ${colors.spinnerTop};
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;

    // Create text container
    const textContainer = document.createElement("div");
    textContainer.style.cssText = "flex: 1;";

    // Create title
    const title = document.createElement("div");
    title.style.cssText =
      "font-weight: 600; margin-bottom: 4px; font-size: 14px; letter-spacing: -0.2px;";
    title.textContent = `Redirecting to result #${index}`;

    // Create countdown container
    const countdownContainer = document.createElement("div");
    countdownContainer.style.cssText =
      "font-size: 12px; opacity: 0.7; font-weight: 500;";

    const countdownSpan = document.createElement("span");
    countdownSpan.id = "countdown";
    countdownSpan.textContent = String(delay / 1000);

    countdownContainer.appendChild(countdownSpan);
    countdownContainer.appendChild(document.createTextNode("s remaining"));

    // Create URL display
    const urlDisplay = document.createElement("div");
    urlDisplay.style.cssText = `
        font-size: 12px;
        opacity: 0.6;
        margin-bottom: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 8px 10px;
        background: ${colors.urlBg};
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      `;
    urlDisplay.title = resultUrl;
    urlDisplay.textContent = resultUrl;

    // Create cancel message
    const cancelMessage = document.createElement("div");
    cancelMessage.style.cssText = `
        font-size: 12px;
        opacity: 0.8;
        padding: 8px 10px;
        background: ${colors.cancelBg};
        border-radius: 4px;
        text-align: center;
        border: 1px solid ${colors.cancelBorder};
      `;
    cancelMessage.appendChild(
      document.createTextNode("Click the icon in address bar or press ")
    );
    const strong = document.createElement("strong");
    strong.style.fontWeight = "600";
    strong.textContent = "ESC";
    cancelMessage.appendChild(strong);
    cancelMessage.appendChild(document.createTextNode(" to cancel"));

    // Create icon
    const icon = document.createElement("img");
    icon.src = iconUrl;
    icon.alt = "";
    icon.style.cssText = `
        position: absolute;
        top: 6px;
        right: 6px;
        width: 20px;
        height: 20px;
        pointer-events: none;`;

    // Assemble the structure
    textContainer.appendChild(title);
    textContainer.appendChild(countdownContainer);
    header.appendChild(spinner);
    header.appendChild(textContainer);
    container.appendChild(style);
    container.appendChild(header);
    container.appendChild(urlDisplay);
    container.appendChild(cancelMessage);
    container.appendChild(icon);
    notification.appendChild(container);

    document.body.appendChild(notification);

    // Countdown
    let remaining = delay / 1000;
    const countdownEl = document.getElementById("countdown");
    countdownInterval = setInterval(() => {
      remaining -= 0.1;
      if (remaining > 0 && countdownEl) {
        countdownEl.textContent = remaining.toFixed(1);
      }
    }, 10);

    return notification;
  }

  function hideRedirectNotification() {
    const notification = document.getElementById("search-notification");
    if (notification) {
      notification.querySelector("div").classList.add("search-fade-out");
      setTimeout(() => notification.remove(), 300);
    }
  }

  function showCancelledMessage() {
    const cancelled = document.createElement("div");

    // Get the icon URL
    const iconUrl =
      typeof chrome !== "undefined" && chrome.runtime
        ? chrome.runtime.getURL("icons/redirecting32.png")
        : "icons/redirecting32.png";

    // Create main container
    const container = document.createElement("div");
    container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #F44336;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
      `;

    // Create flex container
    const flexContainer = document.createElement("div");
    flexContainer.style.cssText =
      "display: flex; flex-direction: row; gap: 8px;";

    // Create icon
    const icon = document.createElement("img");
    icon.src = iconUrl;
    icon.alt = "";
    icon.style.cssText = `
          width: 20px;
          height: 20px;
          pointer-events: none;`;

    // Create text div
    const textDiv = document.createElement("div");
    textDiv.textContent = " Redirect cancelled ";

    // Assemble structure
    flexContainer.appendChild(icon);
    flexContainer.appendChild(textDiv);
    container.appendChild(flexContainer);
    cancelled.appendChild(container);

    document.body.appendChild(cancelled);
    setTimeout(() => {
      const div = cancelled.querySelector("div");
      if (div) {
        div.style.animation = "slideOut 0.3s ease";
        setTimeout(() => cancelled.remove(), 300);
      }
    }, 2000);
  }

  function cancelRedirect() {
    redirectCancelled = true;

    if (redirectTimeout) {
      clearTimeout(redirectTimeout);
      redirectTimeout = null;
    }

    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    hideRedirectNotification();
    showCancelledMessage();

    chrome.runtime.sendMessage({ action: "redirectCancelled" });
    sessionStorage.removeItem("SearchProcessed");
  }

  // Add this waitForResults function before attemptRedirect
  function waitForResults(engine, maxAttempts = 20) {
    return new Promise((resolve) => {
      let attempts = 0;

      const checkForResults = () => {
        attempts++;

        // Try to find any results
        for (const selector of engine.selectors) {
          const links = document.querySelectorAll(selector);
          if (links.length > 0) {
            console.log(
              `✓ ${engine.name}: Found ${links.length} results after ${
                attempts * 250
              }ms`
            );
            resolve(true);
            return;
          }
        }

        // Keep trying
        if (attempts < maxAttempts) {
          setTimeout(checkForResults, 250); // Check every 250ms
        } else {
          console.warn(`⚠ ${engine.name}: Timeout waiting for results`);
          resolve(false); // Timeout after 5 seconds (20 * 250ms)
        }
      };

      checkForResults();
    });
  }

  // Make attemptRedirect async
  async function attemptRedirect() {
    const searchEngine = detectSearchEngine();

    if (!searchEngine) {
      return;
    }

    const { key, engine } = searchEngine;

    if (!config.enabledEngines[key]) {
      return;
    }

    if (!hasSearchQuery(engine)) {
      return;
    }

    if (sessionStorage.getItem("SearchProcessed") === window.location.href) {
      return;
    }

    sessionStorage.setItem("SearchProcessed", window.location.href);

    // Wait for results to actually load (polls until found)
    console.log(`Waiting for ${engine.name} results...`);
    const resultsFound = await waitForResults(engine);

    if (redirectCancelled) return;

    if (!resultsFound) {
      console.log(`⚠ No results found for ${engine.name}`);
      sessionStorage.removeItem("SearchProcessed");
      chrome.runtime.sendMessage({ action: "redirectFailed" });
      return;
    }

    const resultUrl = extractNthResult(engine, config.resultIndex);

    if (resultUrl) {
      console.log(`✓ Found result #${config.resultIndex}:`, resultUrl);

      chrome.runtime.sendMessage({
        action: "redirecting",
        index: config.resultIndex,
        url: resultUrl,
      });

      showRedirectNotification(resultUrl, config.resultIndex, 1000);

      redirectTimeout = setTimeout(() => {
        if (!redirectCancelled) {
          console.log("→ Redirecting now...");
          window.location.href = resultUrl;
          chrome.runtime.sendMessage({ action: "redirectComplete" });
        }
      }, 1000);
    } else {
      console.log(`✗ Could not find result #${config.resultIndex}`);
      sessionStorage.removeItem("SearchProcessed");
      chrome.runtime.sendMessage({ action: "redirectFailed" });
    }
  }
  // Listen for cancel message from background (page action click)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "cancelRedirect") {
      cancelRedirect();
    }
  });

  // Listen for ESC key to cancel
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && redirectTimeout) {
      cancelRedirect();
    }
  });

  // Load settings and run
  chrome.storage.sync.get(
    ["enabled", "resultIndex", "enabledEngines", "showNotification"],
    (result) => {
      config.enabled = result.enabled !== false;
      config.resultIndex = result.resultIndex || 1;
      config.enabledEngines = result.enabledEngines || {};
      config.showNotification = result.showNotification !== false;

      // Enable all engines by default on first run
      if (Object.keys(config.enabledEngines).length === 0) {
        for (const key of Object.keys(SEARCH_ENGINES)) {
          config.enabledEngines[key] = true;
        }
      }

      if (config.enabled) {
        attemptRedirect();
      }
    }
  );

  // Load settings and run - WAIT FOR PAGE LOAD
  function init() {
    chrome.storage.sync.get(
      ["enabled", "resultIndex", "enabledEngines", "showNotification"],
      (result) => {
        config.enabled = result.enabled !== false;
        config.resultIndex = result.resultIndex || 1;
        config.enabledEngines = result.enabledEngines || {};
        config.showNotification = result.showNotification !== false;

        // Enable all engines by default on first run
        if (Object.keys(config.enabledEngines).length === 0) {
          for (const key of Object.keys(SEARCH_ENGINES)) {
            config.enabledEngines[key] = true;
          }
        }

        if (config.enabled) {
          attemptRedirect();
        }
      }
    );
  }

  // Wait for page to be ready before running
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM already loaded
    init();
  }

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.enabled) {
        config.enabled = changes.enabled.newValue;
      }
      if (changes.resultIndex) {
        config.resultIndex = changes.resultIndex.newValue;
      }
      if (changes.enabledEngines) {
        config.enabledEngines = changes.enabledEngines.newValue;
      }
      if (changes.showNotification) {
        config.showNotification = changes.showNotification.newValue;
      }
    }
  });
})();
