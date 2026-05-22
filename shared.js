(function initPictBakeShared(global) {
  "use strict";

  const DEFAULT_OPTIONS = Object.freeze({
    defaultFormat: "png",
    jpegQuality: 0.92,
    jpegBackgroundColor: "#ffffff",
    saveAs: false,
    outputFolderPrefix: "PictBake"
  });

  const FORMAT_TO_MIME = Object.freeze({
    png: "image/png",
    jpeg: "image/jpeg"
  });

  function getStorageArea() {
    if (!global.chrome || !chrome.storage) {
      return null;
    }
    return chrome.storage.sync || chrome.storage.local || null;
  }

  function normalizeFormat(format) {
    if (format === "jpeg" || format === "jpg") {
      return "jpeg";
    }
    return "png";
  }

  function normalizeQuality(value) {
    const parsed = Number(value);
    const quality = Number.isFinite(parsed) ? parsed : DEFAULT_OPTIONS.jpegQuality;
    return Math.round(Math.min(1, Math.max(0.6, quality)) * 100) / 100;
  }

  function normalizeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_OPTIONS.jpegBackgroundColor;
  }

  function sanitizeFilename(value, fallback) {
    const fallbackName = fallback || "pictbake-converted";
    const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
    let name = String(value || "")
      .replace(/[\u0000-\u001f\u007f<>:"\\|?*/]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "");

    if (!name || name === "." || name === ".." || reservedWindowsNames.test(name)) {
      name = fallbackName;
    }

    if (name.length > 140) {
      const dot = name.lastIndexOf(".");
      if (dot > 0 && dot > name.length - 12) {
        const extension = name.slice(dot);
        name = name.slice(0, 140 - extension.length) + extension;
      } else {
        name = name.slice(0, 140);
      }
    }

    return name;
  }

  function normalizeFolderPrefix(prefix) {
    const rawPrefix = String(prefix || "").replace(/\\/g, "/").trim();
    if (!rawPrefix) {
      return "";
    }

    return rawPrefix
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => sanitizeFilename(part, "folder"))
      .filter(Boolean)
      .join("/");
  }

  function validateOptions(options) {
    const source = options || {};
    const hasOutputFolderPrefix = Object.prototype.hasOwnProperty.call(source, "outputFolderPrefix");
    return {
      defaultFormat: normalizeFormat(source.defaultFormat || DEFAULT_OPTIONS.defaultFormat),
      jpegQuality: normalizeQuality(source.jpegQuality),
      jpegBackgroundColor: normalizeColor(source.jpegBackgroundColor),
      saveAs: Boolean(source.saveAs),
      outputFolderPrefix: normalizeFolderPrefix(
        hasOutputFolderPrefix ? source.outputFolderPrefix : DEFAULT_OPTIONS.outputFolderPrefix
      )
    };
  }

  function loadOptions() {
    const storage = getStorageArea();
    if (!storage) {
      return Promise.resolve(validateOptions(DEFAULT_OPTIONS));
    }

    return new Promise((resolve, reject) => {
      storage.get(DEFAULT_OPTIONS, (items) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(validateOptions(items));
      });
    });
  }

  function saveOptions(options) {
    const storage = getStorageArea();
    const normalized = validateOptions(options);
    if (!storage) {
      return Promise.resolve(normalized);
    }

    return new Promise((resolve, reject) => {
      storage.set(normalized, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(normalized);
      });
    });
  }

  function inferFilenameFromUrl(sourceUrl, fallback) {
    const fallbackName = fallback || "pictbake-converted";
    try {
      if (!sourceUrl || sourceUrl.startsWith("data:")) {
        return sanitizeFilename(fallbackName, fallbackName);
      }

      const url = new URL(sourceUrl);
      const pathParts = url.pathname.split("/").filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1];
      if (!lastPart) {
        return sanitizeFilename(fallbackName, fallbackName);
      }

      return sanitizeFilename(decodeURIComponent(lastPart), fallbackName);
    } catch (error) {
      return sanitizeFilename(fallbackName, fallbackName);
    }
  }

  function replaceExtension(filename, extension) {
    const cleanExtension = String(extension || "png").replace(/^\./, "").toLowerCase();
    let base = sanitizeFilename(filename, "pictbake-converted");
    const dot = base.lastIndexOf(".");

    if (dot > 0) {
      base = base.slice(0, dot);
    }

    base = sanitizeFilename(base, "pictbake-converted");
    return `${base}.${cleanExtension}`;
  }

  function buildDownloadPath(filename, folderPrefix) {
    const cleanFilename = sanitizeFilename(filename, "pictbake-converted.png");
    const cleanPrefix = normalizeFolderPrefix(folderPrefix);
    return cleanPrefix ? `${cleanPrefix}/${cleanFilename}` : cleanFilename;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      if (typeof FileReader === "undefined") {
        reject(new Error("FileReader is not available in this extension context."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read converted image data."));
      reader.readAsDataURL(blob);
    });
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const amount = value / Math.pow(1024, exponent);
    return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
  }

  global.PictBakeShared = {
    DEFAULT_OPTIONS,
    FORMAT_TO_MIME,
    normalizeFormat,
    normalizeQuality,
    normalizeColor,
    normalizeFolderPrefix,
    validateOptions,
    loadOptions,
    saveOptions,
    sanitizeFilename,
    inferFilenameFromUrl,
    replaceExtension,
    buildDownloadPath,
    blobToDataUrl,
    arrayBufferToBase64,
    base64ToArrayBuffer,
    formatBytes
  };
})(globalThis);
