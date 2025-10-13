const buttonParse = document.getElementById("button-parse");
const buttonSidebar = document.getElementById("button-sidebar");
const buttonReadability = document.getElementById("button-readability");
const checkboxHighlight = document.getElementById("checkbox-highlight");
const buttonSummarize = document.getElementById('button-summarize');
const checkboxForce = document.getElementById('sf-force-refresh'); // may be null if not present
const warningBox = document.getElementById('sf-warning');

// Reflect current highlight state in the checkbox
chrome.storage.sync.get({ highlightEntities: false }, function (items) {
  checkboxHighlight.checked = items.highlightEntities;
});

// --- helpers (UI + sidepanel state) ---
// Get active tab id in last-focused window
async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs[0] ? tabs[0].id : null;
}

// Ask the sidepanel page if it is open for this tab
async function isPanelOpenForTab(tabId) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'panel-ping', tabId });
    return !!resp?.ok && String(resp.tabId) === String(tabId);
  } catch (_) {
    // No receiving end -> panel is not open
    return false;
  }
}

// Update button label based on current state
async function refreshSidebarButtonLabel() {
  const tabId = await getActiveTabId();
  const open = tabId ? await isPanelOpenForTab(tabId) : false;
  const label = open ? '📂 Close Sidebar' : '📁 Open Sidebar';
  buttonSidebar.textContent = label;
  buttonSidebar.setAttribute('aria-label', label);
}

// Refresh once DOM is ready (popup lifetime is short)
document.addEventListener('DOMContentLoaded', refreshSidebarButtonLabel);
// Also try once immediately (in case DOMContentLoaded already fired)
try { refreshSidebarButtonLabel(); } catch (_) { /* noop */ }

// --- Options helper ---
function openOptions() {
  try { chrome.runtime.openOptionsPage(); } catch (_) {}
}

// --- Network helpers ---
function fetchJsonWithStatus(url, opts = {}, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (!settled) { settled = true; resolve({ ok: false, status: 0, json: null, networkError: true, error: 'timeout' }); }
    }, timeoutMs);
    fetch(url, opts)
      .then(async (r) => {
        if (settled) return; settled = true; clearTimeout(t);
        let data = null;
        try { data = await r.json(); } catch(_) {}
        resolve({ ok: r.ok, status: r.status, json: data, networkError: false });
      })
      .catch((e) => {
        if (settled) return; settled = true; clearTimeout(t);
        resolve({ ok: false, status: 0, json: null, networkError: true, error: String(e) });
      });
  });
}

async function checkServerStatus(baseUrl) {
  const base = (baseUrl || '').replace(/\/$/, '');
  // Fast ping first (short timeout)
  const ping = await fetchJsonWithStatus(base + '/api/ping', { credentials: 'include' }, 1200);
  if (ping.networkError || ping.status === 0) {
    return { reachable: false, loggedIn: false, status: 0 };
  }
  // If server responded at all (even 404/401), we consider it reachable
  // Now check login status (can take a bit longer)
  const me = await fetchJsonWithStatus(base + '/api/me', { credentials: 'include' }, 4000);
  if (me.status === 401) return { reachable: true, loggedIn: false, status: 401 };
  const logged = !!(me.json && me.json.auth);
  return { reachable: true, loggedIn: logged, status: me.status };
}

// --- Gate UI based on server + auth ---
async function gateUi() {
  // defaults
  const disableAll = () => {
    buttonParse.disabled = true;
    buttonSidebar.disabled = true;
    buttonSummarize.disabled = true;
  };
  const hideWarning = () => { if (warningBox) { warningBox.style.display = 'none'; warningBox.innerHTML = ''; } };
  const showWarning = (html) => {
    if (!warningBox) return;
    warningBox.innerHTML = html;
    warningBox.style.display = 'block';
  };

  // Read server only; cookie-session handles auth
  const cfg = await new Promise((resolve) => {
    chrome.storage.sync.get({ server: '', serverInitialized: false }, resolve);
  });

  // No server configured -> show CTA and disable everything except readability/highlight
  if (!cfg.serverInitialized || !cfg.server) {
    disableAll();
    showWarning(
      '<strong>Server URL is not set.</strong><br/>' +
      'Open Extensions → StoryFinder → Options and set the Server URL.' +
      '<div class="row"><button class="btn-mini" id="sf-open-options">Open Options</button></div>'
    );
    document.getElementById('sf-open-options')?.addEventListener('click', openOptions);
    return; // nothing else to do
  }

  hideWarning();

  // Check server reachability and login status
  const status = await checkServerStatus(cfg.server);
  const isLoggedIn = !!status.loggedIn;

  if (!status.reachable) {
    disableAll();
    const safeBase = String(cfg.server || '');
    showWarning(
      '<strong>Server not reachable.</strong><br/>' +
      'Cannot reach: ' + safeBase + '<br/>' +
      'Please verify the URL or that the server is running.' +
      '<div class="row"><button class="btn-mini" id="sf-open-options">Open Options</button></div>'
    );
    document.getElementById('sf-open-options')?.addEventListener('click', openOptions);
    return;
  }

  // Sidebar + Summarize require cookie session
  buttonSidebar.disabled = !isLoggedIn;
  buttonSummarize.disabled = !isLoggedIn;

  if (!isLoggedIn) {
    showWarning(
      '<strong>Not signed in.</strong><br/>' +
      'Sign in to use Chat, Parse, and Summarize.' +
      '<div class="row">' +
      '<button class="btn-mini" id="sf-open-login">Open Login</button>' +
      '</div>'
    );
    document.getElementById('sf-open-login')?.addEventListener('click', async () => {
      const loginUrl = cfg.server.replace(/\/$/, '') + '/#/login';
      try { await chrome.tabs.create({ url: loginUrl, active: true }); } catch (_) { window.open(loginUrl, '_blank'); }
      window.close();
    });
  }

  // Parse requires: cookie login
  const canParse = isLoggedIn;
  buttonParse.disabled = !canParse;
}

// Gate on load
document.addEventListener('DOMContentLoaded', () => { gateUi().then(() => refreshSidebarButtonLabel()); });

// ---- Actions ----

// Force-parse current site (backend-driven)
buttonParse.addEventListener("click", function () {
  chrome.storage.sync.get({ server: '', serverInitialized: false }, async function (items) {
    if (!items.serverInitialized || !items.server) {
      alert("Server URL is not set. Please configure it in Options.");
      return;
    }
    // Require cookie login as well
    let loggedIn = false;
    try {
      const url = items.server.replace(/\/$/, '') + '/api/me';
      const r = await fetch(url, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      loggedIn = !!j?.auth;
    } catch(_) { loggedIn = false; }
    if (!loggedIn) {
      alert("Please sign in first.");
      return;
    }
    await chrome.runtime.sendMessage({ type: "force-parse-site" });
    window.close();
  });
});

// Toggle Side Panel from user gesture; fall back to legacy popup.
buttonSidebar.addEventListener("click", async function () {
  try {
    const tabId = await getActiveTabId();
    if (!tabId) throw new Error("No active tab");

    const alreadyOpen = await isPanelOpenForTab(tabId);
    if (alreadyOpen) {
      // Ask SW to close/disable the sidepanel for this tab
      await chrome.runtime.sendMessage({ type: 'panel-close', tabId });
    } else {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
        // Open + pass tabId via query so the panel can identify its scope
        const path = `sidepanel.html?tabId=${tabId}`;
        await chrome.sidePanel.setOptions({ tabId, path, enabled: true });
        await chrome.sidePanel.open({ tabId });
      } else {
        // Older Chrome: delegate to SW (legacy popup)
        await chrome.runtime.sendMessage({ type: "toggle-sidebar" });
      }
    }
  } catch (e) {
    // Fallback to legacy popup if anything fails (permissions, API missing, etc.)
    try { await chrome.runtime.sendMessage({ type: "toggle-sidebar" }); } catch (_) {}
  } finally {
    // Close the menu after attempting to open/close
    window.close();
  }
});

// Open Readability preview
buttonReadability.addEventListener("click", async function () {
  await chrome.runtime.sendMessage({ type: "do-readability" });
  window.close();
});

// Summarize current page (optional force refresh flag)
buttonSummarize.addEventListener('click', async () => {
  const forceRefresh = !!checkboxForce?.checked; // compact switch (defaults to false)
  await chrome.runtime.sendMessage({
    type: 'trigger-summarize',
    forceRefresh
  });
  window.close();
});

// Toggle entity highlighting across pages
checkboxHighlight.addEventListener("change", function () {
  chrome.storage.sync.set({ highlightEntities: checkboxHighlight.checked }, async function () {
    await chrome.runtime.sendMessage({ type: "highlight-changed", checked: checkboxHighlight.checked });
  });
});
