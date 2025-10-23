(function () {
  "use strict";
  console.log("Content script loaded on:", window.location.href);
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

        if (Array.isArray(engine.searchPath)) {
          for (const path of engine.searchPath) {
            if (pathname.includes(path)) {
              return { key, engine };
            }
          }
        }
      }
    }
    return null;
  }

  // Sanitize search query - remove control characters, normalize UTF-8
  function sanitizeSearchQuery(query) {
    if (!query || typeof query !== "string") return "";

    return (
      query
        // Normalize Unicode to NFC (canonical form)
        .normalize("NFC")
        // Remove null bytes
        .replace(/\0/g, "")
        // Remove other control characters (except newline, tab, carriage return)
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, "")
        // Remove zero-width characters and other invisible Unicode
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        // Trim whitespace
        .trim()
    );
  }

  // Check if current URL has a search query
  function hasSearchQuery(engine) {
    // Engines that don't use URL params - check search input instead
    if (engine.usesUrlParams === false) {
      const searchInput =
        document.querySelector('input[name="query"]') ||
        document.querySelector('input[name="q"]') ||
        document.querySelector('input[type="search"]');

      if (!searchInput) return false;

      const sanitized = sanitizeSearchQuery(searchInput.value);
      return sanitized !== "";
    }

    // Standard URL param check for most engines
    const params = new URLSearchParams(window.location.search);

    if (!params.has(engine.queryParam)) return false;

    const rawQuery = params.get(engine.queryParam);
    const sanitized = sanitizeSearchQuery(rawQuery);

    return sanitized !== "";
  }

  // Extract Nth search result
  function extractNthResult(engine, n) {
    for (const selector of engine.selectors) {
      try {
        const links = Array.from(document.querySelectorAll(selector)).filter(
          (link) => {
            // Skip if link is inside any skipContainer selector
            for (const skipSel of engine.skipContainers || []) {
              if (link.closest(skipSel)) return false;
            }
            return true;
          }
        );

        console.log(
          `Found ${links.length} links with selector: ${selector}`,
          links
        );

        // Collect results with their visual position
        const results = [];

        for (const link of links) {
          const href = link.href;
          if (!href || href === window.location.href) continue;

          // Find container
          let container = null;

          switch (engine.name) {
            case "Google":
              container = link.closest(".MjjYud, div.g, div[data-hveid]");
              break;
            case "DuckDuckGo":
              container = link.closest(
                'li[data-layout="organic"], article[data-testid="result"]'
              );
              break;
            case "Brave Search":
              container = link.closest(
                '.snippet, .fdb, article, div[class*="result"]'
              );
              break;
            case "Kagi":
              container = link.closest("._0_SRI, .search-result");
              break;
            case "Qwant": {
              let node = link;
              while (node && node !== document) {
                if (
                  node.dataset?.testid === "webResult" ||
                  node.dataset?.testid === "videoCardResult"
                ) {
                  container = node;
                  break;
                }
                node = node.parentNode || node.host;
              }
              break;
            }
            default:
              container = link.closest("article, li, div.result, div.g");
              break;
          }

          if (!container) continue;

          // Get visual position (distance from top of page)
          const rect = container.getBoundingClientRect();
          const visualY = rect.top + window.scrollY;

          results.push({
            href: href,
            container: container,
            visualY: visualY,
          });
        }

        // Sort by visual position (top to bottom)
        results.sort((a, b) => a.visualY - b.visualY);

        console.log(`Total results before filtering: ${results.length}`);

        // Filter and deduplicate
        const validResults = [];
        const seenUrls = new Set();
        const seenContainers = new Set();

        for (const result of results) {
          const href = result.href;

          // Deduplicate by container
          if (seenContainers.has(result.container)) continue;

          // Deduplicate by URL
          if (seenUrls.has(href)) continue;

          // Skip DDG modules
          if (engine.name === "DuckDuckGo") {
            const parentLi = result.container.closest("li");
            if (parentLi) {
              const layout = parentLi.getAttribute("data-layout");
              if (layout && layout !== "organic") {
                console.log(`⊘ Skipped DDG module (${layout})`);
                continue;
              }
            }
          }

          // Check exclude patterns
          let shouldExclude = false;
          for (const pattern of engine.excludePatterns) {
            if (href.toLowerCase().includes(pattern.toLowerCase())) {
              shouldExclude = true;
              break;
            }
          }

          if (shouldExclude) {
            console.log(`⊘ Excluded:`, href.substring(0, 60));
            continue;
          }

          // Google: Skip right sidebar
          if (engine.name === "Google") {
            if (result.container.closest("#rhs, .rhs, #rhs_block")) {
              console.log(`⊘ Skipped (sidebar)`);
              continue;
            }
          }

          // Valid result!
          seenUrls.add(href);
          seenContainers.add(result.container);
          validResults.push(result);

          console.log(
            `✓ Result #${validResults.length}:`,
            href.substring(0, 60)
          );

          if (validResults.length >= n) break;
        }

        if (validResults.length >= n) {
          console.log(
            `Returning visually #${n} result:`,
            validResults[n - 1].href
          );
          return validResults[n - 1].href;
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
      let darkScore = 0;
      let lightScore = 0;

      const htmlEl = document.documentElement;
      const bodyEl = document.body;

      // === METHOD 1: Check classList ===
      const darkIndicators = [
        "dark",
        "dark-mode",
        "dark-theme",
        "theme-dark",
        "night",
        "night-mode",
        "black-theme",
        "dim",
      ];

      const lightIndicators = [
        "light",
        "light-mode",
        "light-theme",
        "theme-light",
        "day",
        "day-mode",
        "white-theme",
        "bright",
      ];

      const classList = [
        ...Array.from(htmlEl.classList),
        ...Array.from(bodyEl.classList),
      ].map((c) => c.toLowerCase());

      if (classList.some((c) => darkIndicators.some((d) => c.includes(d)))) {
        darkScore += 3;
      }
      if (classList.some((c) => lightIndicators.some((l) => c.includes(l)))) {
        lightScore += 3;
      }

      // === METHOD 2: Check data attributes ===
      const dataAttrs = [
        htmlEl.getAttribute("data-theme"),
        bodyEl.getAttribute("data-theme"),
        htmlEl.getAttribute("data-color-scheme"),
        bodyEl.getAttribute("data-color-scheme"),
        htmlEl.getAttribute("data-color-mode"),
        bodyEl.getAttribute("data-color-mode"),
        htmlEl.getAttribute("theme"),
        bodyEl.getAttribute("theme"),
      ]
        .filter(Boolean)
        .map((v) => v.toLowerCase());

      if (
        dataAttrs.some((attr) => darkIndicators.some((d) => attr.includes(d)))
      ) {
        darkScore += 3;
      }
      if (
        dataAttrs.some((attr) => lightIndicators.some((l) => attr.includes(l)))
      ) {
        lightScore += 3;
      }

      // === METHOD 3: Check meta tags ===
      const metaTheme = document.querySelector('meta[name="color-scheme"]');
      if (metaTheme) {
        const content = metaTheme.getAttribute("content")?.toLowerCase();
        if (content?.includes("dark")) darkScore += 2;
        if (content?.includes("light")) lightScore += 2;
      }

      // === METHOD 4: Check prefers-color-scheme (SAVE FOR LATER USE) ===
      const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const lightModeQuery = window.matchMedia("(prefers-color-scheme: light)");

      if (darkModeQuery.media !== "not all" && darkModeQuery.matches) {
        darkScore += 2;
      }
      if (lightModeQuery.media !== "not all" && lightModeQuery.matches) {
        lightScore += 2;
      }

      // === METHOD 5: Check CSS custom properties ===
      const rootStyles = getComputedStyle(htmlEl);
      const bodyStyles = getComputedStyle(bodyEl);

      const colorScheme =
        rootStyles.colorScheme ||
        rootStyles.getPropertyValue("color-scheme") ||
        bodyStyles.colorScheme ||
        bodyStyles.getPropertyValue("color-scheme");

      if (colorScheme?.includes("dark")) darkScore += 2;
      if (colorScheme?.includes("light")) lightScore += 2;

      const cssVarsToCheck = [
        "--theme",
        "--color-scheme",
        "--mode",
        "--bg-color",
        "--background",
        "--background-color",
        "--page-bg",
        "--body-bg",
        "--main-bg",
        "--theme-mode",
      ];

      for (const varName of cssVarsToCheck) {
        const value =
          rootStyles.getPropertyValue(varName)?.toLowerCase() ||
          bodyStyles.getPropertyValue(varName)?.toLowerCase();
        if (value) {
          if (darkIndicators.some((d) => value.includes(d))) darkScore += 1;
          if (lightIndicators.some((l) => value.includes(l))) lightScore += 1;
        }
      }

      // === METHOD 6: Sample multiple background colors ===
      const elementsToCheck = [
        bodyEl,
        htmlEl,
        document.querySelector("main"),
        document.querySelector('[role="main"]'),
        document.querySelector("#root"),
        document.querySelector("#app"),
        document.querySelector(".page"),
        document.querySelector(".container"),
        document.querySelector("header"),
        document.querySelector("nav"),
        document.querySelector(".search-result"),
        document.querySelector(".result"),
        document.querySelector("article"),
        // Kagi-specific
        document.querySelector(".__srgi"),
        document.querySelector(".search-result-page"),
        document.querySelector(".search-container"),
      ].filter(Boolean);

      let darkBgCount = 0;
      let lightBgCount = 0;

      for (const el of elementsToCheck) {
        const bgColor = window.getComputedStyle(el).backgroundColor;

        if (
          bgColor &&
          bgColor !== "rgba(0, 0, 0, 0)" &&
          bgColor !== "transparent"
        ) {
          const rgb = bgColor.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const r = parseInt(rgb[0]);
            const g = parseInt(rgb[1]);
            const b = parseInt(rgb[2]);
            const a = rgb.length === 4 ? parseFloat(rgb[3]) : 1;

            if (a < 0.5) continue;

            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

            if (luminance < 100) {
              darkBgCount++;
            } else if (luminance > 180) {
              lightBgCount++;
            }
          }
        }
      }

      if (darkBgCount > lightBgCount) darkScore += darkBgCount;
      if (lightBgCount > darkBgCount) lightScore += lightBgCount;

      // === METHOD 7: Check text color ===
      const textColor = window.getComputedStyle(bodyEl).color;
      if (textColor) {
        const rgb = textColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const luminance =
            parseInt(rgb[0]) * 0.299 +
            parseInt(rgb[1]) * 0.587 +
            parseInt(rgb[2]) * 0.114;

          if (luminance > 180) {
            darkScore += 2;
          } else if (luminance < 100) {
            lightScore += 2;
          }
        }
      }

      // === METHOD 8: Check link colors ===
      const link = document.querySelector("a");
      if (link) {
        const linkColor = window.getComputedStyle(link).color;
        if (linkColor) {
          const rgb = linkColor.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const luminance =
              parseInt(rgb[0]) * 0.299 +
              parseInt(rgb[1]) * 0.587 +
              parseInt(rgb[2]) * 0.114;

            if (luminance > 150) darkScore += 1;
            if (luminance < 120) lightScore += 1;
          }
        }
      }

      // === METHOD 9: Site-specific overrides ===
      const hostname = window.location.hostname;

      if (hostname.includes("kagi.com")) {
        const kagiContainer = document.querySelector(".__srgi");

        if (kagiContainer) {
          const containerBg = getComputedStyle(kagiContainer).backgroundColor;
          const rgb = containerBg.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const luminance =
              0.299 * parseInt(rgb[0]) +
              0.587 * parseInt(rgb[1]) +
              0.114 * parseInt(rgb[2]);
            if (luminance < 128) darkScore += 3;
            else lightScore += 3;
          }
        }
      }

      // === DECISION ===
      console.log("Theme detection scores:", {
        dark: darkScore,
        light: lightScore,
        site: hostname,
      });

      const result = darkScore > lightScore ? "dark" : "light";
      console.log("Final theme based on scores:", result);
      return result;
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

  // Get unique identifier for this search
  function getSearchIdentifier(engine) {
    // Engines without URL params - use search input value
    if (engine.usesUrlParams === false) {
      const searchInput =
        document.querySelector('input[name="query"]') ||
        document.querySelector('input[name="q"]') ||
        document.querySelector('input[type="search"]');

      if (searchInput && searchInput.value) {
        const sanitized = sanitizeSearchQuery(searchInput.value);
        if (sanitized) {
          return `${window.location.pathname}::${sanitized}`;
        }
      }
    }

    // Standard engines - use full URL (includes query params)
    return window.location.href;
  }

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

    const searchIdentifier = getSearchIdentifier(engine);
    if (sessionStorage.getItem("SearchProcessed") === searchIdentifier) {
      return;
    }

    sessionStorage.setItem("SearchProcessed", searchIdentifier);

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
          sessionStorage.removeItem("SearchProcessed"); // Clear so new searches work
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
