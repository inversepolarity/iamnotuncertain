console.log("2 search engines");
const SEARCH_ENGINES = {
  google: {
    name: "Google",
    domains: ["google.com", "google.co.uk", "google.ca", "google.com.au"],
    searchPath: "/search",
    queryParam: "q",
    selectors: [
      'div.g a[href^="http"]:not([href*="google.com/search"]):not([href*="webcache"]):not([href*="translate.google"])',
      '.yuRUbf > a[href^="http"]',
      'div#search a[href^="http"]:not([href*="google.com/search"])',
    ],
    excludePatterns: [
      "google.com",
      "youtube.com",
      "maps.google",
      "accounts.google",
      "support.google",
      "policies.google",
    ],
  },
  bing: {
    name: "Bing",
    domains: ["bing.com", "www.bing.com"],
    searchPath: "/search",
    queryParam: "q",
    selectors: [
      "#b_results .b_algo h2 a",
      "#b_results li.b_algo a",
      "main ol#b_results li h2 a",
    ],
    excludePatterns: [
      // Remove "bing.com" entirely, or be more specific:
      "bing.com/search", // Keep this
      "bing.com/maps",
      "bing.com/videos",
      "microsoft.com/en-us/bing",
      "microsofttranslator.com",
      // Don't exclude all bing.com URLs!
    ],
  },

  duckduckgo: {
    name: "DuckDuckGo",
    domains: ["duckduckgo.com"],
    searchPath: "/",
    queryParam: "q",
    selectors: [
      'article[data-testid="result"] h2 a[href^="http"]',
      '.results--main .result__a[href^="http"]',
      'a.result__a[href^="http"]',
    ],
    excludePatterns: ["duckduckgo.com"],
  },

  kagi: {
    name: "Kagi",
    domains: ["kagi.com"],
    searchPath: "/search",
    queryParam: "q",
    selectors: [
      '.__sri-url a[href^="http"]',
      '.sri-url a[href^="http"]',
      'div.search-result a[href^="http"]',
    ],
    excludePatterns: ["kagi.com"],
  },

  brave: {
    name: "Brave Search",
    domains: ["search.brave.com"],
    searchPath: "/search",
    queryParam: "q",
    selectors: [
      '.snippet[data-type="web"] a[href^="http"]',
      'div.snippet .h[href^="http"]',
    ],
    excludePatterns: ["brave.com"],
  },

  yahoo: {
    name: "Yahoo",
    domains: ["yahoo.com", "search.yahoo.com"],
    searchPath: "/search",
    queryParam: "p",
    selectors: [
      '#web li .compTitle a[href^="http"]',
      '.searchCenterMiddle .compTitle a[href^="http"]',
    ],
    excludePatterns: ["yahoo.com/search", "r.search.yahoo.com"],
  },

  ecosia: {
    name: "Ecosia",
    domains: ["ecosia.org", "www.ecosia.org"],
    searchPath: "/search",
    queryParam: "q",
    selectors: ['.result__link[href^="http"]', 'a.result-url[href^="http"]'],
    excludePatterns: ["ecosia.org"],
  },

  startpage: {
    name: "Startpage",
    domains: ["startpage.com", "www.startpage.com"],
    searchPath: "/sp/search",
    queryParam: "query",
    usesUrlParams: false, // 👈
    selectors: [
      'a[data-testid="gl-title-link"][href^="http"]',
      'a.result-link[href^="http"]',
      '.result a.result-title[href^="http"]',
    ],
    excludePatterns: [
      "startpage.com",
      "eu2-browse.startpage.com",
      "eu-browse.startpage.com",
      "us-browse.startpage.com",
    ],
  },
  qwant: {
    name: "Qwant",
    domains: ["qwant.com", "www.qwant.com"],
    searchPath: "/",
    queryParam: "q",
    selectors: [
      'a[data-testid="serp-link"][href^="http"]',
      '.external[href^="http"]',
    ],
    excludePatterns: [
      "qwant.com/search", // Specific paths only
      "qwant.com/maps",
      "qwant.com/settings",
      "help.qwant.com",
      "about.qwant.com",
      // Don't exclude all qwant.com URLs!
    ],
  },

  yandex: {
    name: "Yandex",
    domains: ["yandex.com", "yandex.ru"],
    searchPath: "/search",
    queryParam: "text",
    selectors: [
      '.OrganicTitle-Link[href^="http"]',
      'li.serp-item a[href^="http"]',
    ],
    excludePatterns: ["yandex.com", "yandex.ru"],
  },

  mojeek: {
    name: "Mojeek",
    domains: ["mojeek.com", "www.mojeek.com"],
    searchPath: "/search",
    queryParam: "q",
    selectors: ['a.ob[href^="http"]', '.results-standard a[href^="http"]'],
    excludePatterns: ["mojeek.com"],
  },
};

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = SEARCH_ENGINES;
}
