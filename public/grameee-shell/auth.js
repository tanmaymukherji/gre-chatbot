const grameeeSupabaseConfig = window.grameeeSupabase || {};
const grameeeSupabaseClient = grameeeSupabaseConfig.createClient ? grameeeSupabaseConfig.createClient() : null;

const AUTH_API_URL = grameeeSupabaseConfig.url
  ? `${grameeeSupabaseConfig.url}/functions/v1/grameee-auth`
  : "";
const AUTH_ANON_KEY = grameeeSupabaseConfig.anonKey || "";
const USER_SESSION_KEY = "grameee-user-session";
const ACCESS_TOKEN_COOKIE = "grameee_access_token";
const REFRESH_TOKEN_COOKIE = "grameee_refresh_token";
const SESSION_SUMMARY_COOKIE = "grameee_user_summary";
const SESSION_RETURN_TO_KEY = "grameee-return-to";
const SESSION_TRANSFER_PARAM = "grameeeAuthState";
const SESSION_HANDOFF_PARAM = "grameeeSession";
const SESSION_LOGOUT_PARAM = "grameeeLogout";
const SESSION_TRANSFER_CACHE_KEY = "grameee-last-transfer";
const RECENT_LOGIN_WINDOW_MS = 15000;
const AUTH_BROADCAST_KEY = "grameee-auth-broadcast";
const SESSION_COOKIE_DOMAIN = window.location.hostname.endsWith(".grameee.org")
  ? ".grameee.org"
  : window.location.hostname === "grameee.org"
    ? ".grameee.org"
    : "";
const GRAMEEE_APP_BASE = "https://grameee.org";

function appUrl(path) {
  const cleanPath = String(path || "").replace(/^\//, "");
  return `${GRAMEEE_APP_BASE}/${cleanPath}`;
}

function authTrim(value) {
  return (value || "").trim();
}

function authEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeStoredSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  return {
    id: authTrim(summary.id),
    email: authTrim(summary.email),
    fullName: authTrim(summary.fullName),
    organization: authTrim(summary.organization),
    organizationLink: authTrim(summary.organizationLink),
    phone: authTrim(summary.phone),
    username: authTrim(summary.username),
    role: authTrim(summary.role),
    privileges: summary.privileges && typeof summary.privileges === "object"
      ? {
          ecosystem: summary.privileges.ecosystem !== false,
          askGre: summary.privileges.askGre !== false,
          offerSolutions: summary.privileges.offerSolutions !== false,
          askHelp: summary.privileges.askHelp !== false,
          needsMap: summary.privileges.needsMap !== false,
          gre: summary.privileges.gre === true || ["admin", "moderator", "curator"].includes(authTrim(summary.role).toLowerCase())
        }
      : {
          ecosystem: true,
          askGre: true,
          offerSolutions: true,
          askHelp: true,
          needsMap: true,
          gre: ["admin", "moderator", "curator"].includes(authTrim(summary.role).toLowerCase())
        }
  };
}

function encodeSessionHandoff(summary) {
  const normalized = normalizeStoredSummary(summary);

  if (!normalized) {
    return "";
  }

  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(normalized))));
  } catch {
    return "";
  }
}

function decodeSessionHandoff(value) {
  if (!value) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(escape(atob(value)));
    return normalizeStoredSummary(JSON.parse(decoded));
  } catch {
    return null;
  }
}

function encodeSessionTransfer(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch {
    return "";
  }
}

function decodeSessionTransfer(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch {
    return null;
  }
}

function stripLegacyLoginQueryParams() {
  let currentUrl;

  try {
    currentUrl = new URL(window.location.href);
  } catch {
    return false;
  }

  let changed = false;
  ["loginId", "loginPassword"].forEach((param) => {
    if (currentUrl.searchParams.has(param)) {
      currentUrl.searchParams.delete(param);
      changed = true;
    }
  });

  if (changed) {
    window.history.replaceState({}, "", currentUrl.toString());
  }

  return changed;
}

function applySessionHandoffFromUrl() {
  const currentUrl = new URL(window.location.href);
  const handoffValue = currentUrl.searchParams.get(SESSION_HANDOFF_PARAM);

  if (!handoffValue) {
    return null;
  }

  const summary = decodeSessionHandoff(handoffValue);
  currentUrl.searchParams.delete(SESSION_HANDOFF_PARAM);
  window.history.replaceState({}, "", currentUrl.toString());

  if (summary) {
    saveStoredSummary(summary);
  }

  return summary;
}

function applyLogoutRequestFromUrl() {
  let currentUrl;

  try {
    currentUrl = new URL(window.location.href);
  } catch {
    return false;
  }

  if (!currentUrl.searchParams.has(SESSION_LOGOUT_PARAM)) {
    return false;
  }

  currentUrl.searchParams.delete(SESSION_LOGOUT_PARAM);
  window.history.replaceState({}, "", currentUrl.toString());

  clearStoredSession();
  window.__grameeeRecentLogin = null;
  window.__grameeeLastLoginTransferPayload = null;
  broadcastAuthState("logout", null);

  if (grameeeSupabaseClient) {
    grameeeSupabaseClient.auth.signOut().catch(() => null);
  }

  return true;
}

async function applySessionTransferFromUrl() {
  const currentUrl = new URL(window.location.href);
  const rawTransfer = currentUrl.searchParams.get(SESSION_TRANSFER_PARAM);

  if (!rawTransfer) {
    return null;
  }

  currentUrl.searchParams.delete(SESSION_TRANSFER_PARAM);
  window.history.replaceState({}, "", currentUrl.toString());

  const parsed = decodeSessionTransfer(rawTransfer);
  const summary = normalizeStoredSummary(parsed?.summary);
  const accessToken = authTrim(parsed?.accessToken);
  const refreshToken = authTrim(parsed?.refreshToken);
  const transferPayload = summary && accessToken && refreshToken
    ? { summary, accessToken, refreshToken }
    : null;

  if (transferPayload) {
    window.__grameeeInboundTransferPayload = transferPayload;
    try {
      window.sessionStorage.setItem(SESSION_TRANSFER_CACHE_KEY, JSON.stringify(transferPayload));
    } catch {}
  }

  if (summary) {
    saveStoredSummary(summary);
  }

  if (accessToken) {
    setCookie(ACCESS_TOKEN_COOKIE, accessToken, 60 * 60 * 24 * 14);
  }

  if (refreshToken) {
    setCookie(REFRESH_TOKEN_COOKIE, refreshToken, 60 * 60 * 24 * 14);
  }

  if (grameeeSupabaseClient && accessToken && refreshToken) {
    const restored = await grameeeSupabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    }).catch(() => null);

    if (restored?.data?.session) {
      storeSupabaseTokens(restored.data.session);
    }
  }

  return summary;
}

function buildSessionAwareUrl(href, userSummary) {
  const summary = normalizeStoredSummary(userSummary);

  if (!summary || !href) {
    return href;
  }

  let url;

  try {
    url = new URL(href, window.location.origin);
  } catch {
    return href;
  }

  if (url.hostname === "gre.grameee.org") {
    const accessToken = getCookie(ACCESS_TOKEN_COOKIE);
    const refreshToken = getCookie(REFRESH_TOKEN_COOKIE);
    const transferPayload = accessToken && refreshToken
      ? { summary, accessToken, refreshToken }
      : null;
    const encodedTransfer = transferPayload ? encodeSessionTransfer(transferPayload) : "";
    if (encodedTransfer) {
      url.searchParams.set(SESSION_TRANSFER_PARAM, encodedTransfer);
      return url.toString();
    }
    return href;
  }

  if (url.hostname === "grameee.org" || url.hostname.endsWith(".grameee.org")) {
    return href;
  }

  const handoff = encodeSessionHandoff(summary);

  if (!handoff) {
    return href;
  }

  url.searchParams.set(SESSION_HANDOFF_PARAM, handoff);
  return url.toString();
}

function buildCookieOptions(maxAgeSeconds) {
  const options = [
    "path=/",
    "SameSite=Lax"
  ];

  if (window.location.protocol === "https:") {
    options.push("Secure");
  }

  if (SESSION_COOKIE_DOMAIN) {
    options.push(`domain=${SESSION_COOKIE_DOMAIN}`);
  }

  if (typeof maxAgeSeconds === "number") {
    options.push(`max-age=${maxAgeSeconds}`);
  }

  return options.join("; ");
}

function setCookie(name, value, maxAgeSeconds) {
  document.cookie = `${name}=${encodeURIComponent(value)}; ${buildCookieOptions(maxAgeSeconds)}`;
}

function getCookie(name) {
  const parts = document.cookie ? document.cookie.split("; ") : [];
  const prefix = `${name}=`;

  for (const part of parts) {
    if (part.indexOf(prefix) === 0) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }

  return "";
}

function deleteCookie(name) {
  document.cookie = `${name}=; ${buildCookieOptions(0)}`;
}

function saveStoredSummary(summary) {
  const normalized = normalizeStoredSummary(summary);

  if (!normalized) {
    window.localStorage.removeItem(USER_SESSION_KEY);
    deleteCookie(SESSION_SUMMARY_COOKIE);
    return;
  }

  const serialized = JSON.stringify(normalized);
  window.localStorage.setItem(USER_SESSION_KEY, serialized);
  setCookie(SESSION_SUMMARY_COOKIE, serialized, 60 * 60 * 24 * 14);
}

function markRecentLogin(summary) {
  const normalized = normalizeStoredSummary(summary);
  if (!normalized) {
    window.__grameeeRecentLogin = null;
    return;
  }

  window.__grameeeRecentLogin = {
    summary: normalized,
    at: Date.now()
  };
}

function getRecentLoginSummary() {
  const recent = window.__grameeeRecentLogin;
  if (!recent || typeof recent !== "object") {
    return null;
  }

  if (Date.now() - Number(recent.at || 0) > RECENT_LOGIN_WINDOW_MS) {
    window.__grameeeRecentLogin = null;
    return null;
  }

  return normalizeStoredSummary(recent.summary);
}

function readStoredSummary() {
  const fromStorage = window.localStorage.getItem(USER_SESSION_KEY);

  if (fromStorage) {
    try {
      return JSON.parse(fromStorage);
    } catch {
      window.localStorage.removeItem(USER_SESSION_KEY);
    }
  }

  const fromCookie = getCookie(SESSION_SUMMARY_COOKIE);

  if (!fromCookie) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromCookie);
    window.localStorage.setItem(USER_SESSION_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    deleteCookie(SESSION_SUMMARY_COOKIE);
    return null;
  }
}

function storeSupabaseTokens(session) {
  if (!session?.access_token || !session?.refresh_token) {
    return;
  }

  setCookie(ACCESS_TOKEN_COOKIE, session.access_token, 60 * 60 * 24 * 14);
  setCookie(REFRESH_TOKEN_COOKIE, session.refresh_token, 60 * 60 * 24 * 14);
}

function clearStoredSession() {
  saveStoredSummary(null);
  deleteCookie(ACCESS_TOKEN_COOKIE);
  deleteCookie(REFRESH_TOKEN_COOKIE);
}

function broadcastAuthState(type, summary) {
  try {
    window.localStorage.setItem(
      AUTH_BROADCAST_KEY,
      JSON.stringify({
        type,
        summary: normalizeStoredSummary(summary),
        at: Date.now()
      })
    );
  } catch {}
}

function hasSharedSessionCookies() {
  return Boolean(getCookie(ACCESS_TOKEN_COOKIE) && getCookie(REFRESH_TOKEN_COOKIE));
}

async function getAccessToken() {
  if (!grameeeSupabaseClient) {
    return getCookie(ACCESS_TOKEN_COOKIE);
  }

  const sessionData = await grameeeSupabaseClient.auth.getSession().catch(() => null);
  const session = sessionData?.data?.session || null;

  if (session?.access_token) {
    storeSupabaseTokens(session);
    return session.access_token;
  }

  const accessToken = getCookie(ACCESS_TOKEN_COOKIE);
  const refreshToken = getCookie(REFRESH_TOKEN_COOKIE);

  if (!accessToken || !refreshToken) {
    clearStoredSession();
    await grameeeSupabaseClient.auth.signOut().catch(() => null);
    return "";
  }

  const restored = await grameeeSupabaseClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  }).catch(() => null);

  const restoredToken = restored?.data?.session?.access_token || "";

  if (restored?.data?.session?.access_token) {
    storeSupabaseTokens(restored.data.session);
  }

  return restoredToken || accessToken;
}

async function getSessionTransferPayload() {
  const storedSummary = getStoredSummary() || await hydrateAuthSession().catch(() => null);

  if (!storedSummary) {
    return null;
  }

  let accessToken = "";
  let refreshToken = "";

  if (grameeeSupabaseClient) {
    const sessionData = await grameeeSupabaseClient.auth.getSession().catch(() => null);
    const session = sessionData?.data?.session || null;
    if (session?.access_token && session?.refresh_token) {
      accessToken = session.access_token;
      refreshToken = session.refresh_token;
    }
  }

  if (!accessToken || !refreshToken) {
    accessToken = getCookie(ACCESS_TOKEN_COOKIE);
    refreshToken = getCookie(REFRESH_TOKEN_COOKIE);
  }

  return {
    summary: normalizeStoredSummary(storedSummary),
    accessToken,
    refreshToken
  };
}

async function buildReturnUrlWithTransfer(targetUrl) {
  const cleanTarget = authTrim(targetUrl);

  if (!cleanTarget) {
    return cleanTarget;
  }

  const directPayload = window.__grameeeLastLoginTransferPayload && typeof window.__grameeeLastLoginTransferPayload === "object"
    ? window.__grameeeLastLoginTransferPayload
    : null;
  const transferPayload = directPayload || await getSessionTransferPayload().catch(() => null);

  if (!transferPayload?.summary || !transferPayload?.accessToken || !transferPayload?.refreshToken) {
    return cleanTarget;
  }

  try {
    const url = new URL(cleanTarget, window.location.origin);
    url.searchParams.set(SESSION_TRANSFER_PARAM, encodeSessionTransfer(transferPayload));
    return url.toString();
  } catch {
    return cleanTarget;
  }
}

function passwordIsStrong(password) {
  return password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

async function authApiRequest(action, payload, accessToken) {
  let response;

  try {
    response = await fetch(AUTH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: AUTH_ANON_KEY,
        Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${AUTH_ANON_KEY}`
      },
      body: JSON.stringify({
        action,
        ...(payload || {})
      })
    });
  } catch {
    throw new Error("GramEEE login service could not be reached right now.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "GramEEE login request failed.");
  }

  return data;
}

async function listOrganizations() {
  const data = await authApiRequest("listOrganizations");
  return Array.isArray(data?.items) ? data.items : [];
}

async function checkUsernameAvailability(username, excludeUserId) {
  const data = await authApiRequest("checkUsername", {
    username,
    excludeUserId: excludeUserId || ""
  });
  return Boolean(data?.available);
}

async function sendEmailCode(email, purpose) {
  const data = await authApiRequest("sendEmailCode", {
    email,
    purpose
  });
  return String(data?.token || "");
}

async function resolveLoginId(loginId) {
  return authApiRequest("resolveUsername", {
    loginId
  });
}

async function syncAdminBridge(password) {
  return authApiRequest("adminBridgeSync", {
    password
  });
}

async function loginUser(loginId, password) {
  if (!grameeeSupabaseClient) {
    throw new Error("Supabase is not configured for login.");
  }

  const normalizedLoginId = authTrim(loginId).toLowerCase();
  const resolved = normalizedLoginId === "admin"
    ? await syncAdminBridge(password)
    : await resolveLoginId(loginId);
  const resolvedEmail = authTrim(resolved?.email);
  const bridgedAccessToken = authTrim(resolved?.session?.access_token);
  const bridgedRefreshToken = authTrim(resolved?.session?.refresh_token);

  if (!resolvedEmail) {
    throw new Error("No account was found for that login ID.");
  }

  if (normalizedLoginId === "admin" && bridgedAccessToken && bridgedRefreshToken) {
    storeSupabaseTokens({
      access_token: bridgedAccessToken,
      refresh_token: bridgedRefreshToken
    });

    const profile = normalizeStoredSummary(resolved?.user) || await fetchProfile(bridgedAccessToken);
    saveStoredSummary(profile);
    markRecentLogin(profile);
    broadcastAuthState("login", profile);
    window.__grameeeLastLoginTransferPayload = {
      summary: normalizeStoredSummary(profile),
      accessToken: bridgedAccessToken,
      refreshToken: bridgedRefreshToken
    };
    return profile;
  }

  const { data, error } = await grameeeSupabaseClient.auth.signInWithPassword({
    email: resolvedEmail,
    password
  });

  if (error || !data?.session) {
    throw new Error(error?.message || "Login failed.");
  }

  storeSupabaseTokens(data.session);
  const profile = await fetchProfile(data.session.access_token);
  saveStoredSummary(profile);
  markRecentLogin(profile);
  broadcastAuthState("login", profile);
  window.__grameeeLastLoginTransferPayload = {
    summary: normalizeStoredSummary(profile),
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token
  };
  return profile;
}

async function logoutUser() {
  clearStoredSession();
  window.__grameeeRecentLogin = null;
  window.__grameeeLastLoginTransferPayload = null;
  broadcastAuthState("logout", null);

  if (grameeeSupabaseClient) {
    grameeeSupabaseClient.auth.signOut().catch(() => null);
  }

  clearStoredSession();
  return null;
}

async function fetchProfile(accessToken) {
  if (!accessToken) {
    throw new Error("User session is missing.");
  }

  const data = await authApiRequest("getProfile", {}, accessToken);
  return data?.user || null;
}

async function hydrateAuthSession() {
  if (!grameeeSupabaseClient) {
    return readStoredSummary();
  }

  let sessionData = await grameeeSupabaseClient.auth.getSession();
  let session = sessionData?.data?.session || null;
  const accessToken = getCookie(ACCESS_TOKEN_COOKIE);
  const refreshToken = getCookie(REFRESH_TOKEN_COOKIE);

  if (!session) {
    if (accessToken && refreshToken) {
      const restored = await grameeeSupabaseClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }).catch(() => null);
      session = restored?.data?.session || null;
    }
  }

  if (session?.access_token) {
    storeSupabaseTokens(session);

    try {
      const profile = await fetchProfile(session.access_token);
      saveStoredSummary(profile);
      return profile;
    } catch {
      clearStoredSession();
      await grameeeSupabaseClient.auth.signOut().catch(() => null);
      return null;
    }
  }

  if (accessToken) {
    try {
      const profile = await fetchProfile(accessToken);
      saveStoredSummary(profile);
      return profile;
    } catch {
      clearStoredSession();
      await grameeeSupabaseClient.auth.signOut().catch(() => null);
      return null;
    }
  }

  clearStoredSession();
  await grameeeSupabaseClient.auth.signOut().catch(() => null);
  return null;
}

function getStoredSummary() {
  return readStoredSummary();
}

function hasAdminSession() {
  return Boolean(window.sessionStorage.getItem("grameee-admin-session"));
}

function getUserDisplayName(userSummary) {
  return authTrim(userSummary?.username) || authTrim(userSummary?.fullName) || "Account";
}

function notifyAuthStateChanged(userSummary) {
  document.dispatchEvent(new CustomEvent("grameee:auth-updated", {
    detail: {
      user: userSummary || null
    }
  }));
}

function getPageMenuConfig() {
  const config = window.grameeePageMenuConfig;
  return config && typeof config === "object" ? config : {};
}

function shouldShowPageMenuItem(item, userSummary, isAdmin) {
  if (!item || typeof item !== "object") {
    return false;
  }

  if (item.requiresAdmin && !isAdmin) {
    return false;
  }

  if (item.requiresLogin && !userSummary) {
    return false;
  }

  const requiredRole = authTrim(item.requiredRole || "");
  if (requiredRole && authTrim(userSummary?.role).toLowerCase() !== requiredRole.toLowerCase()) {
    return false;
  }

  return true;
}

function renderPageMenuItems(menu, userSummary) {
  const container = menu.querySelector(".auth-user-page-actions");
  if (!container) {
    return;
  }

  container.innerHTML = "";
  const pageConfig = getPageMenuConfig();
  const pageItems = Array.isArray(pageConfig.menuItems) ? pageConfig.menuItems : [];
  const isAdmin = authTrim(userSummary?.role).toLowerCase() === "admin";

  pageItems.forEach((item) => {
    if (!shouldShowPageMenuItem(item, userSummary, isAdmin)) {
      return;
    }

    if (item.href) {
      const link = document.createElement("a");
      link.className = "auth-user-action auth-user-page-action";
      link.href = item.href;
      link.textContent = authTrim(item.label) || "Open";
      if (item.sameWindow === true) {
        link.target = "_self";
      }
      container.appendChild(link);
      return;
    }

    if (typeof item.onClick === "function") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "auth-user-action auth-user-page-action";
      button.textContent = authTrim(item.label) || "Open";
      button.addEventListener("click", () => item.onClick(userSummary));
      container.appendChild(button);
    }
  });
}

function buildAuthMenu(link) {
  const menu = document.createElement("details");
  menu.className = "auth-user-menu";
  menu.hidden = true;
  const logoutUrl = (() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(SESSION_LOGOUT_PARAM, "1");
      return url.toString();
    } catch {
      return `${window.location.href}${window.location.search ? "&" : "?"}${SESSION_LOGOUT_PARAM}=1`;
    }
  })();
  menu.innerHTML = `
    <summary class="auth-user-trigger" role="button" aria-label="User menu">
      <span class="auth-user-name">Account</span>
      <span class="auth-user-caret" aria-hidden="true">▾</span>
    </summary>
    <div class="auth-user-dropdown">
      <a class="auth-user-action auth-user-admin-workspace-link" href="${appUrl("admin-tools.html")}" hidden>GramEEE Admin</a>
      <a class="auth-user-action auth-user-admin-link" href="${appUrl("registered-users.html")}" hidden>View Registered Users</a>
      <div class="auth-user-page-actions"></div>
      <a class="auth-user-action" href="${appUrl("change-password.html")}">Change Password</a>
      <a class="auth-user-action" href="${appUrl("account.html")}">Update User Details</a>
      <a class="auth-user-action auth-user-logout" href="${logoutUrl}">Logout</a>
    </div>
  `;

  const logoutButton = menu.querySelector(".auth-user-logout");
  logoutButton?.addEventListener("click", async () => {
    performLogoutUiReset();
    await logoutUser();
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && menu.open && !menu.contains(event.target)) {
      menu.open = false;
    }
  });

  link.insertAdjacentElement("afterend", menu);
  return menu;
}

function ensureAuthMenu(link) {
  const existingMenu = link.parentElement?.querySelector(".auth-user-menu");
  return existingMenu || buildAuthMenu(link);
}

function updateNavForUser(userSummary) {
  const authOnlyLinks = document.querySelectorAll(".auth-only-link");
  const adminOnlyLinks = document.querySelectorAll(".admin-only-link");
  const authLinks = document.querySelectorAll("[data-auth-link]");
  const isLoggedIn = Boolean(userSummary);
  const privileges = userSummary?.privileges || {};
  const isAdmin = userSummary?.role === "admin";

  authOnlyLinks.forEach((link) => {
    link.dataset.baseHref = link.dataset.baseHref || link.getAttribute("href") || "";
    const privilegeName = link.dataset.privilege || "";
    const allowed = !privilegeName || privileges[privilegeName] !== false;
    link.hidden = !(isLoggedIn && allowed);
    const baseHref = link.dataset.baseHref || link.getAttribute("href") || "";
    link.setAttribute("href", isLoggedIn ? buildSessionAwareUrl(baseHref, userSummary) : baseHref);
  });

  adminOnlyLinks.forEach((link) => {
    link.dataset.baseHref = link.dataset.baseHref || link.getAttribute("href") || "";
    link.hidden = !isAdmin;
    const baseHref = link.dataset.baseHref || link.getAttribute("href") || "";
    link.setAttribute("href", isAdmin ? buildSessionAwareUrl(baseHref, userSummary) : baseHref);
  });

  authLinks.forEach((link) => {
    const authMenu = ensureAuthMenu(link);
    const adminLink = authMenu.querySelector(".auth-user-admin-link");
    const adminWorkspaceLink = authMenu.querySelector(".auth-user-admin-workspace-link");
    renderPageMenuItems(authMenu, userSummary);
    if (isLoggedIn) {
      const nameNode = authMenu.querySelector(".auth-user-name");
      if (nameNode) {
        nameNode.textContent = getUserDisplayName(userSummary);
      }
      if (adminLink) {
        adminLink.hidden = !isAdmin;
      }
      if (adminWorkspaceLink) {
        adminWorkspaceLink.hidden = !isAdmin;
      }
      authMenu.hidden = false;
      link.hidden = true;
      link.textContent = "Login";
      link.setAttribute("href", appUrl("login.html"));
    } else {
      if (adminLink) {
        adminLink.hidden = true;
      }
      if (adminWorkspaceLink) {
        adminWorkspaceLink.hidden = true;
      }
      authMenu.hidden = true;
      authMenu.open = false;
      link.hidden = false;
      link.textContent = "Login";
      link.setAttribute("href", appUrl("login.html"));
    }
  });
}

function openLoginModal(mode) {
  const modal = document.getElementById("loginModal");

  if (!modal) {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${appUrl("login.html")}?returnTo=${returnTo}`;
    return;
  }

  const loginIdInput = document.getElementById("loginId");
  const passwordInput = document.getElementById("loginPassword");
  const status = document.getElementById("loginModalStatus");
  const primaryModeInput = document.getElementById("loginSubmitMode");

  modal.hidden = false;
  document.body.style.overflow = "hidden";

  if (status) {
    status.textContent = "";
    status.classList.remove("error");
  }

  if (primaryModeInput) {
    primaryModeInput.value = mode || "login";
  }

  if (loginIdInput && !loginIdInput.value) {
    loginIdInput.focus();
  } else if (passwordInput) {
    passwordInput.focus();
  }
}

function closeLoginModal() {
  const modal = document.getElementById("loginModal");

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.style.overflow = "";
}

function setLoginStatus(message, isError) {
  const status = document.getElementById("loginModalStatus");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

async function processLoginForm(submitMode) {
  const loginIdInput = document.getElementById("loginId");
  const passwordInput = document.getElementById("loginPassword");
  const loginId = authTrim(loginIdInput?.value);
  const password = authTrim(passwordInput?.value);

  if (!loginId || !password) {
    setLoginStatus("Please enter both username and password.", true);
    return;
  }

  setLoginStatus("Validating your GramEEE login...");

  const user = await loginUser(loginId, password);
  updateNavForUser(user);
  closeLoginModal();
  markRecentLogin(user);

  const returnTo = window.sessionStorage.getItem(SESSION_RETURN_TO_KEY);
  window.sessionStorage.removeItem(SESSION_RETURN_TO_KEY);

  const queryReturnTo = (() => {
    try {
      const currentUrl = new URL(window.location.href);
      return authTrim(currentUrl.searchParams.get("returnTo") || "");
    } catch {
      return "";
    }
  })();

  if (returnTo) {
    window.location.href = await buildReturnUrlWithTransfer(returnTo);
    return;
  }

  if (queryReturnTo) {
    window.location.href = await buildReturnUrlWithTransfer(queryReturnTo);
    return;
  }

  if (window.location.pathname.toLowerCase().endsWith("/login.html") || window.location.pathname.toLowerCase().endsWith("\\login.html")) {
    window.location.href = appUrl("index.html");
    return;
  }

  notifyAuthStateChanged(user);
}

function attachLoginModalBehavior() {
  const modal = document.getElementById("loginModal");
  const form = document.getElementById("loginModalForm");

  if (!modal || !form) {
    return false;
  }

  if (form.dataset.authSubmitBound === "true") {
    return true;
  }

  form.dataset.authSubmitBound = "true";

  modal.querySelectorAll("[data-close-login-modal]").forEach((element) => {
    if (element.dataset.authCloseBound === "true") {
      return;
    }
    element.dataset.authCloseBound = "true";
    element.addEventListener("click", closeLoginModal);
  });

  if (document.body.dataset.authEscapeBound !== "true") {
    document.body.dataset.authEscapeBound = "true";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeLoginModal();
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const modeInput = document.getElementById("loginSubmitMode");

    try {
      await processLoginForm(modeInput?.value || "login");
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : "Login failed.", true);
    }
  });

  return true;
}

function attachDelegatedLoginSubmitBehavior() {
  if (document.body.dataset.authDelegatedSubmitBound === "true") {
    return;
  }

  document.body.dataset.authDelegatedSubmitBound = "true";

  document.addEventListener("submit", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLFormElement) || target.id !== "loginModalForm") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const modeInput = document.getElementById("loginSubmitMode");

    try {
      await processLoginForm(modeInput?.value || "login");
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : "Login failed.", true);
    }
  }, true);
}

function performLogoutUiReset() {
  updateNavForUser(null);
  notifyAuthStateChanged(null);
  document.querySelectorAll(".auth-user-menu").forEach((menu) => {
    menu.open = false;
  });
}

function attachDelegatedLogoutBehavior() {
  if (document.body.dataset.authDelegatedLogoutBound === "true") {
    return;
  }

  document.body.dataset.authDelegatedLogoutBound = "true";

  document.addEventListener("click", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest(".auth-user-logout");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    performLogoutUiReset();
    await logoutUser();
  }, true);
}

async function handleLogoutClick(event) {
  if (event?.preventDefault) {
    event.preventDefault();
  }
  if (event?.stopPropagation) {
    event.stopPropagation();
  }

  performLogoutUiReset();
  await logoutUser();
}

function attachAuthLinkBehavior() {
  document.querySelectorAll("[data-auth-link]").forEach((link) => {
    if (link.dataset.authBound === "true") {
      return;
    }
    link.dataset.authBound = "true";
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      window.sessionStorage.setItem(SESSION_RETURN_TO_KEY, window.location.href);
      openLoginModal("login");
    });
  });
}

function attachSessionAwareNavigation() {
  document.querySelectorAll(".auth-only-link, .admin-only-link").forEach((link) => {
    if (link.dataset.sessionAwareBound === "true") {
      return;
    }

    link.dataset.sessionAwareBound = "true";
    link.addEventListener("click", async (event) => {
      const href = link.dataset.baseHref || link.getAttribute("href") || "";

      if (!href) {
        return;
      }

      const transferPayload = await getSessionTransferPayload().catch(() => null);
      const currentSummary = transferPayload?.summary || null;

      if (!currentSummary) {
        return;
      }

      let targetUrl = buildSessionAwareUrl(href, currentSummary);

      if (transferPayload?.accessToken && transferPayload?.refreshToken) {
        try {
          const url = new URL(targetUrl || href, window.location.origin);
          url.searchParams.set(SESSION_TRANSFER_PARAM, encodeSessionTransfer(transferPayload));
          targetUrl = url.toString();
        } catch {
          targetUrl = href;
        }
      }

      if (!targetUrl || targetUrl === href) {
        return;
      }

      event.preventDefault();
      window.location.href = targetUrl;
    });
  });
}

let authUiInitialized = false;

async function refreshAuthUi() {
  const user = await hydrateAuthSession();
  updateNavForUser(user);
  notifyAuthStateChanged(user);
  return user;
}

async function initializeAuthUi() {
  stripLegacyLoginQueryParams();
  const logoutRequested = applyLogoutRequestFromUrl();
  const transferredSummary = await applySessionTransferFromUrl().catch(() => null);
  const handoffSummary = applySessionHandoffFromUrl();
  const immediateSummary = logoutRequested ? null : (transferredSummary || handoffSummary || getStoredSummary());

  if (!authUiInitialized) {
    authUiInitialized = attachLoginModalBehavior();
  }

  attachDelegatedLoginSubmitBehavior();
  attachDelegatedLogoutBehavior();
  attachAuthLinkBehavior();
  attachSessionAwareNavigation();
  if (immediateSummary) {
    updateNavForUser(immediateSummary);
    notifyAuthStateChanged(immediateSummary);
  }
  const hydratedUser = await refreshAuthUi();
  const fallbackSummary = transferredSummary || handoffSummary;
  const user = logoutRequested ? null : (hydratedUser || fallbackSummary);
  if (!logoutRequested && !hydratedUser && fallbackSummary) {
    saveStoredSummary(fallbackSummary);
    updateNavForUser(fallbackSummary);
    notifyAuthStateChanged(fallbackSummary);
  }

  if (document.body.dataset.authPage === "login" && !user) {
    openLoginModal("login");
  }
}

function registerAuthUiRefreshEvents() {
  let refreshInFlight = null;

  const guardedRefresh = () => {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    refreshInFlight = refreshAuthUi().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  };

  window.addEventListener("focus", guardedRefresh);
  window.addEventListener("pageshow", guardedRefresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      guardedRefresh();
    }
  });
  document.addEventListener("grameee:shell-mounted", () => {
    initializeAuthUi().catch(() => null);
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== AUTH_BROADCAST_KEY || !event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue);
      if (payload?.type === "logout") {
        clearStoredSession();
        updateNavForUser(null);
        notifyAuthStateChanged(null);
        return;
      }

      if (payload?.type === "login" && payload?.summary) {
        saveStoredSummary(payload.summary);
        updateNavForUser(payload.summary);
        notifyAuthStateChanged(payload.summary);
      }
    } catch {}
  });
}

function scheduleAuthUiRetries() {
  [100, 500, 1500, 3000].forEach((delay) => {
    window.setTimeout(() => {
      initializeAuthUi().catch(() => null);
    }, delay);
  });
}

async function requireLoggedInUser() {
  let user = getStoredSummary();

  if (!user) {
    user = await hydrateAuthSession();
  }

  if (!user) {
    window.sessionStorage.setItem(SESSION_RETURN_TO_KEY, window.location.href);
    window.location.href = appUrl("login.html");
    throw new Error("Login required.");
  }

  return user;
}

window.grameeeAuth = {
  apiRequest: authApiRequest,
  listOrganizations,
  checkUsernameAvailability,
  sendEmailCode,
  fetchProfile,
  loginUser,
  logoutUser,
  passwordIsStrong,
  getStoredSummary,
  requireLoggedInUser,
  getAccessToken,
  updateNavForUser,
  hydrateAuthSession,
  saveStoredSummary,
  authEscape,
  handleLogoutClick
};

if (grameeeSupabaseClient?.auth?.onAuthStateChange) {
  grameeeSupabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session?.access_token) {
      const user = await fetchProfile(session.access_token).catch(() => null);
      if (user) {
        storeSupabaseTokens(session);
        saveStoredSummary(user);
        updateNavForUser(user);
        notifyAuthStateChanged(user);
        return;
      }
    }

    const recentLoginSummary = getRecentLoginSummary();
    if (recentLoginSummary) {
      saveStoredSummary(recentLoginSummary);
      updateNavForUser(recentLoginSummary);
      notifyAuthStateChanged(recentLoginSummary);
      return;
    }

    if (hasSharedSessionCookies() || getStoredSummary()) {
      const hydratedUser = await hydrateAuthSession().catch(() => null);
      if (hydratedUser) {
        updateNavForUser(hydratedUser);
        notifyAuthStateChanged(hydratedUser);
        return;
      }
    }

    clearStoredSession();
    updateNavForUser(null);
    notifyAuthStateChanged(null);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    registerAuthUiRefreshEvents();
    initializeAuthUi().catch(() => null);
    scheduleAuthUiRetries();
  }, { once: true });
} else {
  registerAuthUiRefreshEvents();
  initializeAuthUi().catch(() => null);
  scheduleAuthUiRetries();
}
