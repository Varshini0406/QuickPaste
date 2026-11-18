const form = document.querySelector("#paste-form");
const contentInput = document.querySelector("#paste-content");
const charCount = document.querySelector("#char-count");
const formError = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-button");
const createView = document.querySelector("#create-view");
const pasteView = document.querySelector("#paste-view");
const unavailableView = document.querySelector("#unavailable-view");
const shareResult = document.querySelector("#share-result");

function setCharacterCount() {
  const bytes = new TextEncoder().encode(contentInput.value).length;
  charCount.textContent = `${bytes.toLocaleString()} / 1 MB`;
  charCount.classList.toggle("over-limit", bytes > 1024 * 1024);
}

contentInput.addEventListener("input", setCharacterCount);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;
  const data = new FormData(form);
  const content = data.get("content");
  if (!content.trim()) {
    formError.textContent = "Add some text before creating your link.";
    formError.hidden = false;
    contentInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span:first-child").textContent = "Creating your link…";
  try {
    const response = await fetch("/api/pastes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.get("title"),
        content,
        expiration: data.get("expiration"),
        maxViews: data.get("maxViews")
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not create your paste.");
    const shareUrl = new URL(result.url, window.location.origin).href;
    document.querySelector("#share-url").value = shareUrl;
    document.querySelector("#open-paste").href = result.url;
    shareResult.hidden = false;
    shareResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    formError.textContent = error.message || "Could not reach the server. Please try again.";
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span:first-child").textContent = "Create your link";
  }
});

async function copyText(text, button, defaultLabel) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied!";
  } catch {
    button.textContent = "Copy failed";
  }
  window.setTimeout(() => { button.textContent = defaultLabel; }, 1600);
}

document.querySelector("#copy-link").addEventListener("click", (event) => {
  copyText(document.querySelector("#share-url").value, event.currentTarget, "Copy link");
});

async function showPaste(id) {
  createView.hidden = true;
  pasteView.hidden = true;
  unavailableView.hidden = true;
  try {
    const response = await fetch(`/api/pastes/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("Paste unavailable");
    const paste = await response.json();
    document.title = `${paste.title || "Shared paste"} — QuickPaste`;
    document.querySelector("#paste-heading").textContent = paste.title || "Untitled paste";
    document.querySelector("#paste-body").textContent = paste.content;
    const date = new Date(paste.createdAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    const viewInfo = paste.maxViews
      ? ` · View ${paste.views} of ${paste.maxViews}`
      : ` · ${paste.views} ${paste.views === 1 ? "view" : "views"}`;
    const expiryInfo = paste.expiresAt
      ? ` · Expires ${new Date(paste.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
      : "";
    document.querySelector("#paste-meta").textContent = `Created ${date}${viewInfo}${expiryInfo}`;
    pasteView.hidden = false;
    document.querySelector("#copy-content").addEventListener("click", (event) => {
      copyText(paste.content, event.currentTarget, "Copy text");
    });
  } catch {
    unavailableView.hidden = false;
  }
}

const routeId = window.location.pathname.slice(1);
if (routeId && !routeId.includes("/")) showPaste(routeId);
