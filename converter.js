const {
  DEFAULT_OPTIONS,
  loadOptions,
  validateOptions,
  normalizeQuality,
  normalizeColor,
  replaceExtension,
  formatBytes
} = PictBakeShared;

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const form = document.getElementById("converter-form");
const outputFormat = document.getElementById("output-format");
const jpegQuality = document.getElementById("jpeg-quality");
const qualityValue = document.getElementById("quality-value");
const jpegBackgroundColor = document.getElementById("jpeg-background-color");
const selectedFileName = document.getElementById("selected-file-name");
const convertButton = document.getElementById("convert-button");
const downloadButton = document.getElementById("download-button");
const resultSection = document.getElementById("result-section");
const resultPreview = document.getElementById("result-preview");
const resultMeta = document.getElementById("result-meta");
const status = document.getElementById("status");

const state = {
  file: null,
  outputBlob: null,
  outputUrl: "",
  outputFilename: ""
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();

  try {
    applyOptions(await loadOptions());
  } catch (error) {
    applyOptions(DEFAULT_OPTIONS);
  }
}

function bindEvents() {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      setSelectedFile(file);
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
    }
  });

  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  jpegQuality.addEventListener("input", updateQualityLabel);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleConvert();
  });

  downloadButton.addEventListener("click", () => {
    if (!state.outputUrl || !state.outputFilename) {
      return;
    }

    const link = document.createElement("a");
    link.href = state.outputUrl;
    link.download = state.outputFilename;
    link.click();
  });
}

function applyOptions(options) {
  const normalized = validateOptions(options);
  outputFormat.value = normalized.defaultFormat;
  jpegQuality.value = normalized.jpegQuality.toFixed(2);
  jpegBackgroundColor.value = normalized.jpegBackgroundColor;
  updateQualityLabel();
}

function setSelectedFile(file) {
  state.file = file;
  selectedFileName.textContent = `${file.name} (${formatBytes(file.size)})`;
  convertButton.disabled = false;
  clearOutput();
  setStatus("");
}

async function handleConvert() {
  if (!state.file) {
    setStatus("Choose an image file first.", true);
    return;
  }

  convertButton.disabled = true;
  setStatus("Converting locally in Chrome...");
  clearOutput();

  const targetFormat = outputFormat.value === "jpeg" ? "jpeg" : "png";
  const targetMimeType = targetFormat === "jpeg" ? "image/jpeg" : "image/png";
  const targetExtension = targetFormat === "jpeg" ? "jpg" : "png";

  try {
    const result = await convertFile(state.file, {
      targetMimeType,
      jpegQuality: normalizeQuality(jpegQuality.value),
      jpegBackgroundColor: normalizeColor(jpegBackgroundColor.value)
    });

    state.outputBlob = result.blob;
    state.outputUrl = URL.createObjectURL(result.blob);
    state.outputFilename = replaceExtension(state.file.name || "pictbake-converted", targetExtension);

    resultPreview.src = state.outputUrl;
    resultSection.hidden = false;
    downloadButton.disabled = false;
    resultMeta.textContent = `${result.width} x ${result.height} pixels, ${result.blob.type || targetMimeType}, ${formatBytes(result.blob.size)}.`;
    setStatus("Conversion complete.");
  } catch (error) {
    setStatus(error.message || "Conversion failed.", true);
  } finally {
    convertButton.disabled = false;
  }
}

async function convertFile(file, options) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error("Chrome could not decode this image. It may be unsupported or corrupt.");
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", {
      alpha: options.targetMimeType !== "image/jpeg"
    });

    if (!context) {
      throw new Error("Chrome could not create a canvas context for this image.");
    }

    if (options.targetMimeType === "image/jpeg") {
      context.fillStyle = options.jpegBackgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(bitmap, 0, 0);

    const blob = await canvasToBlob(
      canvas,
      options.targetMimeType,
      options.targetMimeType === "image/jpeg" ? options.jpegQuality : undefined
    );

    return {
      blob,
      width: bitmap.width,
      height: bitmap.height
    };
  } catch (error) {
    if (/canvas|allocation|memory/i.test(error.message || "")) {
      throw new Error("Chrome could not allocate enough canvas memory for this image. Try a smaller image.");
    }
    throw error;
  } finally {
    if (bitmap && bitmap.close) {
      bitmap.close();
    }
  }
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Chrome could not encode the converted image."));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    } catch (error) {
      reject(new Error("Chrome could not encode the converted image."));
    }
  });
}

function clearOutput() {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
  }

  state.outputBlob = null;
  state.outputUrl = "";
  state.outputFilename = "";
  resultPreview.removeAttribute("src");
  resultSection.hidden = true;
  downloadButton.disabled = true;
  resultMeta.textContent = "";
}

function updateQualityLabel() {
  qualityValue.value = Number(jpegQuality.value).toFixed(2);
}

function setStatus(message, isError) {
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}
