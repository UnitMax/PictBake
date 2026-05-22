const params = new URLSearchParams(location.search);
const message = document.getElementById("message");
const source = document.getElementById("source");
const openConverter = document.getElementById("open-converter");
const openOptions = document.getElementById("open-options");
const closePage = document.getElementById("close-page");

message.textContent = params.get("message") || "PictBake could not convert that image.";
source.textContent = params.get("source") ? `Source: ${params.get("source")}` : "";

openConverter.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("converter.html") });
});

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

closePage.addEventListener("click", () => {
  window.close();
});
