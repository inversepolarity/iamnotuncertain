console.log("1 background");
const ICON_ENABLED = "➰";
const ICON_DISABLED = "➿";

let isEnabled = true;

// Load initial state
chrome.storage.sync.get(["enabled"], (result) => {
  isEnabled = result.enabled !== false;
  updateIcon();
});

// Update icon based on state
function updateIcon() {
  chrome.action.setTitle({
    title: isEnabled ? "Lucky Search: Enabled" : "Lucky Search: Disabled",
  });

  // Create canvas to draw emoji icon
  const canvas = new OffscreenCanvas(128, 128);
  const ctx = canvas.getContext("2d");

  // Clear canvas
  ctx.clearRect(0, 0, 128, 128);

  // Draw emoji
  ctx.font = "100px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isEnabled ? ICON_ENABLED : ICON_DISABLED, 64, 64);

  // Convert to ImageData
  canvas.convertToBlob().then((blob) => {
    createImageBitmap(blob).then((imageBitmap) => {
      const imageData = new OffscreenCanvas(128, 128);
      const imageCtx = imageData.getContext("2d");
      imageCtx.drawImage(imageBitmap, 0, 0);

      chrome.action.setIcon({
        imageData: imageCtx.getImageData(0, 0, 128, 128),
      });
    });
  });
}

// Toggle on icon click
chrome.action.onClicked.addListener(() => {
  isEnabled = !isEnabled;

  chrome.storage.sync.set({ enabled: isEnabled }, () => {
    updateIcon();
  });
});

// Listen for storage changes from options page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    isEnabled = changes.enabled.newValue;
    updateIcon();
  }
});
