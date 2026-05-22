importScripts("shared.js");

const {
  DEFAULT_OPTIONS,
  loadOptions,
  inferFilenameFromUrl,
  replaceExtension,
  buildDownloadPath,
  arrayBufferToBase64
} = PictBakeShared;

const OFFSCREEN_DOCUMENT = "offscreen.html";
const CONVERSION_TIMEOUT_MS = 60000;
const MENU_IDS = Object.freeze({
  root: "pictbake-root",
  png: "pictbake-save-png",
  jpeg: "pictbake-save-jpeg"
});

const TARGETS = Object.freeze({
  [MENU_IDS.png]: {
    mimeType: "image/png",
    extension: "png"
  },
  [MENU_IDS.jpeg]: {
    mimeType: "image/jpeg",
    extension: "jpg"
  }
});

let offscreenCreatePromise = null;

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus().catch((error) => console.error("PictBake menu setup failed:", error));
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus().catch((error) => console.error("PictBake menu setup failed:", error));
});

chrome.contextMenus.onClicked.addListener((info) => {
  handleContextMenuClick(info).catch((error) => {
    showErrorPage(error.message || "PictBake could not convert that image.", info && info.srcUrl).catch((showError) => {
      console.error("PictBake could not show the error page:", showError);
    });
  });
});

async function setupContextMenus() {
  await removeAllContextMenus();

  await createContextMenu({
    id: MENU_IDS.root,
    title: "PictBake",
    contexts: ["image"]
  });

  await createContextMenu({
    id: MENU_IDS.png,
    parentId: MENU_IDS.root,
    title: "Save image as PNG",
    contexts: ["image"]
  });

  await createContextMenu({
    id: MENU_IDS.jpeg,
    parentId: MENU_IDS.root,
    title: "Save image as JPEG",
    contexts: ["image"]
  });
}

async function handleContextMenuClick(info) {
  const target = TARGETS[info.menuItemId];
  if (!target) {
    return;
  }

  const sourceUrl = info.srcUrl;
  if (!sourceUrl) {
    throw new Error("PictBake could not find an image URL for the selected item.");
  }

  await requestHostPermissionIfNeeded(sourceUrl);

  const options = await loadOptions().catch((error) => {
    console.warn("PictBake could not load saved options, using defaults:", error);
    return { ...DEFAULT_OPTIONS };
  });

  const source = await fetchSourceImage(sourceUrl);
  const sourceArrayBuffer = await source.blob.arrayBuffer();
  const conversion = await convertImage({
    sourceArrayBuffer,
    sourceMimeType: source.mimeType,
    targetMimeType: target.mimeType,
    jpegQuality: options.jpegQuality,
    jpegBackgroundColor: options.jpegBackgroundColor
  });

  const fallbackName = `pictbake-converted.${target.extension}`;
  const sourceName = inferFilenameFromUrl(sourceUrl, fallbackName);
  const outputName = replaceExtension(sourceName, target.extension);
  const downloadPath = buildDownloadPath(outputName, options.outputFolderPrefix);

  await downloadDataUrl(conversion.outputDataUrl, downloadPath, options.saveAs);
}

async function requestHostPermissionIfNeeded(sourceUrl) {
  const pattern = getHostPermissionPattern(sourceUrl);
  if (!pattern) {
    return;
  }

  // permissions.request must be invoked directly from the context-menu user
  // gesture. A permissions.contains preflight can consume that gesture before
  // the prompt is shown, so request the narrow origin immediately. Chrome
  // returns true without prompting when the origin is already granted.
  const granted = await requestPermission({ origins: [pattern] });
  if (!granted) {
    const host = new URL(sourceUrl).hostname;
    throw new Error(`PictBake needs permission to fetch images from ${host} before it can convert this image.`);
  }
}

function getHostPermissionPattern(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch (error) {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  // Chrome match patterns do not include ports, so this is the narrowest valid
  // optional permission for the clicked image origin.
  return `${url.protocol}//${url.hostname}/*`;
}

async function fetchSourceImage(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch (error) {
    throw new Error("The selected image URL is not valid.");
  }

  if (!["http:", "https:", "data:", "blob:"].includes(url.protocol)) {
    throw new Error(`PictBake cannot fetch ${url.protocol} image URLs from the extension context.`);
  }

  let response;
  try {
    response = await fetch(sourceUrl, {
      credentials: url.protocol === "data:" ? "omit" : "include",
      cache: "no-store"
    });
  } catch (error) {
    if (url.protocol === "blob:") {
      throw new Error("This image uses a blob URL that belongs to the webpage. Chrome extensions usually cannot fetch page-owned blob URLs from a service worker. Try the manual converter if you can save the original file first.");
    }

    throw new Error("Chrome could not fetch the selected image. The site may block extension requests, require page-only state, or no longer expose that image URL.");
  }

  if (!response.ok) {
    throw new Error(`The image request failed with HTTP ${response.status}.`);
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error("The selected image downloaded as an empty file.");
  }

  return {
    blob,
    mimeType: blob.type || inferMimeTypeFromUrl(sourceUrl) || "application/octet-stream"
  };
}

function inferMimeTypeFromUrl(sourceUrl) {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
    if (pathname.endsWith(".avif")) return "image/avif";
    if (pathname.endsWith(".gif")) return "image/gif";
  } catch (error) {
    return "";
  }
  return "";
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (!offscreenCreatePromise) {
    offscreenCreatePromise = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT,
      reasons: ["BLOBS"],
      justification: "Convert user-selected image blobs to PNG or JPEG with browser-native canvas APIs."
    }).finally(() => {
      offscreenCreatePromise = null;
    });
  }

  await offscreenCreatePromise;
}

async function hasOffscreenDocument() {
  if (chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT);
  const clients = await self.clients.matchAll();
  return clients.some((client) => client.url === offscreenUrl);
}

async function convertImage(payload) {
  await ensureOffscreenDocument();

  const requestId = createRequestId();
  const conversionPromise = sendRuntimeMessage({
    type: "CONVERT_IMAGE",
    requestId,
    sourceArrayBuffer: {
      encoding: "base64",
      data: arrayBufferToBase64(payload.sourceArrayBuffer)
    },
    sourceMimeType: payload.sourceMimeType,
    targetMimeType: payload.targetMimeType,
    jpegQuality: payload.jpegQuality,
    jpegBackgroundColor: payload.jpegBackgroundColor
  });

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        error: "Image conversion timed out. The image may be too large for Chrome to process comfortably."
      });
    }, CONVERSION_TIMEOUT_MS);
  });

  let response;
  try {
    response = await Promise.race([conversionPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
    conversionPromise.catch(() => {});
  }

  if (!response || !response.ok) {
    throw new Error((response && response.error) || "Image conversion failed.");
  }

  return response;
}

async function downloadDataUrl(dataUrl, filename, saveAs) {
  await downloadFile({
    url: dataUrl,
    filename,
    saveAs: Boolean(saveAs),
    conflictAction: "uniquify"
  });
}

function createRequestId() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pictbake-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function removeAllContextMenus() {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function createContextMenu(properties) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function requestPermission(permission) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request(permission, (granted) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(Boolean(granted));
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function downloadFile(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(`Download failed: ${error.message}`));
      else resolve(downloadId);
    });
  });
}

function showErrorPage(message, sourceUrl) {
  const params = new URLSearchParams({
    message: message || "PictBake could not convert that image.",
    source: describeSource(sourceUrl)
  });

  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`error.html?${params.toString()}`) }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(tab);
    });
  });
}

function describeSource(sourceUrl) {
  if (!sourceUrl) {
    return "No image URL was available.";
  }

  try {
    const url = new URL(sourceUrl);
    if (url.protocol === "data:") return "data: image URL";
    if (url.protocol === "blob:") return "blob: image URL";
    return `${url.origin}${url.pathname}`;
  } catch (error) {
    return "Unrecognized image URL";
  }
}
