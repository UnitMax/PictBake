const { DEFAULT_OPTIONS, loadOptions, validateOptions } = PictBakeShared;

const summaryFormat = document.getElementById("summary-format");
const summaryJpeg = document.getElementById("summary-jpeg");
const summaryFolder = document.getElementById("summary-folder");
const summarySaveAs = document.getElementById("summary-save-as");
const openConverter = document.getElementById("open-converter");
const openOptions = document.getElementById("open-options");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  openConverter.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("converter.html") });
  });

  openOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  try {
    renderSummary(await loadOptions());
  } catch (error) {
    renderSummary(DEFAULT_OPTIONS);
  }
}

function renderSummary(options) {
  const normalized = validateOptions(options);
  summaryFormat.textContent = normalized.defaultFormat.toUpperCase();
  summaryJpeg.textContent = `${normalized.jpegQuality.toFixed(2)}, ${normalized.jpegBackgroundColor}`;
  summaryFolder.textContent = normalized.outputFolderPrefix || "Downloads";
  summarySaveAs.textContent = normalized.saveAs ? "Yes" : "No";
}
