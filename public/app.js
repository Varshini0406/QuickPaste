import { createAuthClient } from "@neon/neon-js/auth";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const authClient = authUrl ? createAuthClient(authUrl) : null;
const form = document.querySelector("#paste-form");
const contentInput = document.querySelector("#paste-content");
const formError = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-button");
const createView = document.querySelector("#create-view");
const pasteView = document.querySelector("#paste-view");
const unavailableView = document.querySelector("#unavailable-view");
const shareResult = document.querySelector("#share-result");
const accountModal = document.querySelector("#account-modal");
const accountButton = document.querySelector("#account-button");
const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authMessage = document.querySelector("#auth-message");
const verificationForm = document.querySelector("#verification-form");
const verificationMessage = document.querySelector("#verification-message");
const profilePanel = document.querySelector("#profile-panel");
const profileMessage = document.querySelector("#profile-message");
const nameField = document.querySelector("#name-field");
const accountName = document.querySelector("#account-name");
const accountEmail = document.querySelector("#account-email");
const accountPassword = document.querySelector("#account-password");
const accountTitle = document.querySelector("#account-title");
const authConfigWarning = document.querySelector("#auth-config-warning");
let accountMode = "sign-in";
let currentUser = null;
let pendingVerificationEmail = "";
let authLoadError = "";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;
  if (!currentUser) {
    openAccount();
    if (authClient) {
      showAccountMessage(authMessage, "Sign in or create an account before creating a paste.");
    }
    return;
  }

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

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  const toggle = document.querySelector("#theme-toggle");
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  toggle.setAttribute("aria-label", label);
  toggle.setAttribute("title", label);
  toggle.setAttribute("aria-pressed", String(isDark));
  localStorage.setItem("quickpaste-theme", isDark ? "dark" : "light");
}

document.querySelector("#theme-toggle").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
setTheme(localStorage.getItem("quickpaste-theme") === "dark" ? "dark" : "light");

function setAccountButton() {
  const label = document.querySelector("#account-button-label");
  label.textContent = currentUser ? "Profile" : "Sign in";
  accountButton.setAttribute("aria-label", currentUser ? "Open your profile" : "Sign in or create an account");
}

function showAuthMode(mode) {
  accountMode = mode;
  document.querySelector("#sign-in-tab").classList.toggle("active", mode === "sign-in");
  document.querySelector("#sign-up-tab").classList.toggle("active", mode === "sign-up");
  document.querySelector("#sign-in-tab").setAttribute("aria-selected", String(mode === "sign-in"));
  document.querySelector("#sign-up-tab").setAttribute("aria-selected", String(mode === "sign-up"));
  accountTitle.textContent = mode === "sign-in" ? "Welcome back" : "Create your account";
  nameField.hidden = mode !== "sign-up";
  accountName.hidden = mode !== "sign-up";
  accountName.disabled = mode !== "sign-up";
  accountName.required = mode === "sign-up";
  accountPassword.autocomplete = mode === "sign-up" ? "new-password" : "current-password";
  if (mode === "sign-up") {
    accountPassword.minLength = 8;
  } else {
    accountPassword.removeAttribute("minlength");
  }
  authMessage.textContent = "";
  authMessage.className = "account-message";
}

function openAccount() {
  accountModal.hidden = false;
  authConfigWarning.hidden = Boolean(authClient);
  authPanel.hidden = !authClient || Boolean(currentUser);
  verificationForm.hidden = true;
  profilePanel.hidden = !currentUser;
  if (currentUser) {
    accountTitle.textContent = "Your profile";
    document.querySelector("#profile-email").value = currentUser.email || "";
    document.querySelector("#profile-name").value = currentUser.name || "";
    profileMessage.textContent = "";
  } else {
    showAuthMode("sign-in");
    if (authLoadError) {
      authMessage.textContent = authLoadError;
      authMessage.classList.add("error");
    }
  }
  document.querySelector("#close-account").focus();
}

function closeAccount() {
  accountModal.hidden = true;
  accountButton.focus();
}

function showAccountMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `account-message${type ? ` ${type}` : ""}`;
}

function setCurrentUser(user) {
  currentUser = user;
  setAccountButton();
  document.querySelector("#submit-button span:first-child").textContent =
    currentUser ? "Create your link" : "Sign in to create a link";
}

accountButton.addEventListener("click", openAccount);
document.querySelector("#close-account").addEventListener("click", closeAccount);
document.querySelector("#sign-in-tab").addEventListener("click", () => showAuthMode("sign-in"));
document.querySelector("#sign-up-tab").addEventListener("click", () => showAuthMode("sign-up"));
accountModal.addEventListener("click", (event) => {
  if (event.target === accountModal) closeAccount();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !accountModal.hidden) closeAccount();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authClient) return;

  const submitButton = document.querySelector("#auth-submit");
  const submitLabel = accountMode === "sign-up" ? "Create account" : "Sign in";
  submitButton.disabled = true;
  submitButton.textContent = accountMode === "sign-up" ? "Creating account…" : "Signing in…";
  showAccountMessage(authMessage, "");

  try {
    const email = accountEmail.value.trim();
    const result = accountMode === "sign-up"
      ? await authClient.signUp.email({
        name: accountName.value.trim(),
        email,
        password: accountPassword.value
      })
      : await authClient.signIn.email({ email, password: accountPassword.value });
    if (result.error) throw new Error(result.error.message || "Authentication failed.");

    if (accountMode === "sign-up" && result.data?.user && !result.data.user.emailVerified) {
      pendingVerificationEmail = email;
      authPanel.hidden = true;
      verificationForm.hidden = false;
      accountTitle.textContent = "Verify your email";
      showAccountMessage(verificationMessage, `Enter the verification code sent to ${email}.`);
      document.querySelector("#verification-code").focus();
      return;
    }

    const user = result.data?.user || result.data?.session?.user;
    if (!user) throw new Error("The account service did not return a user. Please try again.");
    setCurrentUser(user);
    openAccount();
  } catch (error) {
    showAccountMessage(authMessage, error.message || "Could not complete the request. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitLabel;
  }
});

verificationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authClient) return;

  const verifyButton = verificationForm.querySelector(".primary-button");
  verifyButton.disabled = true;
  showAccountMessage(verificationMessage, "");
  try {
    const result = await authClient.emailOtp.verifyEmail({
      email: pendingVerificationEmail,
      otp: document.querySelector("#verification-code").value.trim()
    });
    if (result.error) throw new Error(result.error.message || "That verification code could not be accepted.");

    const session = await authClient.getSession();
    if (session.error) throw new Error(session.error.message || "Email verified, but your session could not be loaded.");
    const user = session.data?.user || session.data?.session?.user;
    if (user) {
      setCurrentUser(user);
      openAccount();
    } else {
      verificationForm.hidden = true;
      authPanel.hidden = false;
      showAuthMode("sign-in");
      accountEmail.value = pendingVerificationEmail;
      showAccountMessage(authMessage, "Email verified. You can now sign in.", "success");
    }
  } catch (error) {
    showAccountMessage(verificationMessage, error.message || "Could not verify the email. Try again.", "error");
  } finally {
    verifyButton.disabled = false;
  }
});

document.querySelector("#resend-verification").addEventListener("click", async () => {
  if (!authClient || !pendingVerificationEmail) return;
  showAccountMessage(verificationMessage, "");
  try {
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: pendingVerificationEmail,
      type: "email-verification"
    });
    if (result.error) throw new Error(result.error.message || "Could not resend the verification code.");
    showAccountMessage(verificationMessage, "A new verification code was sent.", "success");
  } catch (error) {
    showAccountMessage(verificationMessage, error.message || "Could not resend the code. Try again.", "error");
  }
});

document.querySelector("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authClient || !currentUser) return;

  const name = document.querySelector("#profile-name").value.trim();
  if (!name) {
    showAccountMessage(profileMessage, "Enter a display name.", "error");
    return;
  }

  const saveButton = event.currentTarget.querySelector(".primary-button");
  saveButton.disabled = true;
  showAccountMessage(profileMessage, "");
  try {
    const result = await authClient.updateUser({ name });
    if (result.error) throw new Error(result.error.message || "Could not update your name.");
    setCurrentUser(result.data?.user || { ...currentUser, name });
    showAccountMessage(profileMessage, "Your name has been updated.", "success");
  } catch (error) {
    showAccountMessage(profileMessage, error.message || "Could not update your name. Try again.", "error");
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  if (!authClient) return;
  const button = document.querySelector("#sign-out");
  button.disabled = true;
  try {
    const result = await authClient.signOut();
    if (result.error) throw new Error(result.error.message || "Could not sign out.");
    setCurrentUser(null);
    closeAccount();
  } catch (error) {
    showAccountMessage(profileMessage, error.message || "Could not sign out. Try again.", "error");
  } finally {
    button.disabled = false;
  }
});

if (authClient) {
  authClient.getSession().then((result) => {
    if (result.error) throw new Error(result.error.message || "Could not load your account session.");
    setCurrentUser(result.data?.user || result.data?.session?.user || null);
  }).catch((error) => {
    console.error("Could not load the account session:", error);
    authLoadError = error.message || "Could not load the account session. Please try again.";
  });
} else {
  setAccountButton();
}
