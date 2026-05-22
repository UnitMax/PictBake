const {
  DEFAULT_OPTIONS,
  loadOptions,
  saveOptions,
  validateOptions,
  normalizeQuality
} = PictBakeShared;

const form = document.getElementById("options-form");
const defaultFormat = document.getElementById("default-format");
const jpegQuality = document.getElementById("jpeg-quality");
const qualityValue = document.getElementById("quality-value");
const jpegBackgroundColor = document.getElementById("jpeg-background-color");
const saveAs = document.getElementById("save-as");
const outputFolderPrefix = document.getElementById("output-folder-prefix");
const resetButton = document.getElementById("reset-button");
const status = document.getElementById("status");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();

  try {
    applyOptions(await loadOptions());
    setStatus("");
  } catch (error) {
    applyOptions(DEFAULT_OPTIONS);
    setStatus("Could not load saved options.", true);
  }
}

function bindEvents() {
  jpegQuality.addEventListener("input", () => {
    qualityValue.value = Number(jpegQuality.value).toFixed(2);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSave();
  });

  resetButton.addEventListener("click", async () => {
    applyOptions(DEFAULT_OPTIONS);
    await handleSave("Defaults restored.");
  });
}

async function handleSave(successMessage) {
  setStatus("");

  const options = validateOptions({
    defaultFormat: defaultFormat.value,
    jpegQuality: jpegQuality.value,
    jpegBackgroundColor: jpegBackgroundColor.value,
    saveAs: saveAs.checked,
    outputFolderPrefix: outputFolderPrefix.value
  });

  try {
    const saved = await saveOptions(options);
    applyOptions(saved);
    setStatus(successMessage || "Saved.");
  } catch (error) {
    setStatus(error.message || "Could not save options.", true);
  }
}

function applyOptions(options) {
  const normalized = validateOptions(options);
  defaultFormat.value = normalized.defaultFormat;
  jpegQuality.value = normalizeQuality(normalized.jpegQuality).toFixed(2);
  qualityValue.value = Number(jpegQuality.value).toFixed(2);
  jpegBackgroundColor.value = normalized.jpegBackgroundColor;
  saveAs.checked = normalized.saveAs;
  outputFolderPrefix.value = normalized.outputFolderPrefix;
}

function setStatus(message, isError) {
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}
