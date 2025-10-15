console.log("3 content");
(function () {
  "use strict";

  let config = {
    enabled: true,
    resultIndex: 1,
    enabledEngines: {},
  };

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

  // Main redirect logic
  function attemptRedirect() {
    const searchEngine = detectSearchEngine();

    if (!searchEngine) {
      return;
    }

    const { key, engine } = searchEngine;

    // Check if this engine is enabled
    if (!config.enabledEngines[key]) {
      return;
    }

    // Check if search query exists
    if (!hasSearchQuery(engine)) {
      return;
    }

    // Check if we've already processed this page
    if (
      sessionStorage.getItem("luckySearchProcessed") === window.location.href
    ) {
      return;
    }

    // Mark as processed
    sessionStorage.setItem("luckySearchProcessed", window.location.href);

    // Wait a bit for results to load
    setTimeout(() => {
      const resultUrl = extractNthResult(engine, config.resultIndex);

      if (resultUrl) {
        console.log(
          `Lucky Search: Redirecting to result #${config.resultIndex}:`,
          resultUrl
        );
        window.location.href = resultUrl;
      } else {
        console.log(
          `Lucky Search: Could not find result #${config.resultIndex}`
        );
        // Clear the processed flag so user can try again
        sessionStorage.removeItem("luckySearchProcessed");
      }
    }, 500);
  }

  // Load settings and run
  chrome.storage.sync.get(
    ["enabled", "resultIndex", "enabledEngines"],
    (result) => {
      config.enabled = result.enabled !== false;
      config.resultIndex = result.resultIndex || 1;
      config.enabledEngines = result.enabledEngines || {};

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
    }
  });
})();
