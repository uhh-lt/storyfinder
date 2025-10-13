// [PANEL] Boot Side Panel: load server UI in an iframe and bridge messages.
// Code comments: English.

(function () {
  let baseUrl = "";       // server URL (from storage)
  let serverOrigin = "";  // origin extracted from baseUrl
  let iframeEl = null;
  // Tab id of the tab that opened this sidepanel (passed via ?tabId=...)
  const selfTabId = new URLSearchParams(location.search).get('tabId') || null;

  // Create UI or show message
  async function boot() {
    try {
      const { server = "", serverInitialized = false } =
        await chrome.storage.sync.get({ server: "", serverInitialized: false });

      const $msg = document.getElementById('msg');

      if (!serverInitialized || !server) {
        // Show configuration hint
        $msg.hidden = false;
        $msg.textContent = "Der StoryFinder-Server ist nicht konfiguriert. Öffne Erweiterungen → StoryFinder → Optionen und setze die Server-URL.";
        return;
      }

      baseUrl = server;
      serverOrigin = new URL(baseUrl).origin;

      // Show toolbar now that we have a valid server URL
      const $toolbar = document.getElementById('sp-toolbar');
      const $btnOpenTab = document.getElementById('sp-open-tab');
      if ($toolbar && $btnOpenTab) {
        $toolbar.hidden = false;
        $btnOpenTab.addEventListener('click', async () => {
          try {
            // Delegate to SW: open tab + disable/close panel for the originating tab
            await chrome.runtime.sendMessage({
              type: 'panel-open-tab-and-close',
              url: baseUrl,
              tabId: selfTabId ? Number(selfTabId) : null
            });
          } catch (e) {
            console.warn('[PANEL] open-tab: SW action failed:', e);
          } finally {
            // Local fallback just in case
            try { window.close(); } catch (_) {}
          }
        });
      }

      // Create iframe dynamically (same behavior as popup.html/js)
      iframeEl = document.createElement('iframe');
      iframeEl.src = baseUrl + "/?embed=1"; // load existing server UI (login/graph/relations)
      iframeEl.classList.add('active'); // keep parity with popup.js selector
      iframeEl.setAttribute('allow', 'clipboard-read; clipboard-write');
      document.body.appendChild(iframeEl);

      iframeEl.onload = function () {
        // Mirror popup.js behavior: notify SW we attached
        chrome.runtime.sendMessage({ type: 'onAttach' });
      };

      // Bridge: Server/App (iframe) -> Service Worker
      window.addEventListener('message', (event) => {
        try {
          const origin = event.origin || event.originalEvent?.origin;
          if (!origin || origin !== serverOrigin) {
            // Ignore messages from other origins
            return;
          }

          const data = event.data;

          // Legacy: server sends ['msg', payload]
          if (Array.isArray(data) && data[0] === 'msg') {
            chrome.runtime.sendMessage({ type: 'msg', data: data[1] });
            return;
          }

          // NEW: handle sf:* protocol from the new app
          if (data && typeof data === 'object' && typeof data.type === 'string') {
            switch (data.type) {
              case 'sf:openInTab': {
                const targetUrl = data.url || (baseUrl + '/');
                chrome.runtime.sendMessage({
                  type: 'panel-open-tab-and-close',
                  url: targetUrl,
                  tabId: selfTabId ? Number(selfTabId) : null
                });
                return;
              }
              case 'sf:navigate': {
                // (optional) forward to server/app iframe again if needed
                if (iframeEl && iframeEl.contentWindow) {
                  iframeEl.contentWindow.postMessage({ type: 'sf:navigate', tab: data.tab }, serverOrigin);
                }
                return;
              }
              default:
                // ignore other sf:* for now
                return;
            }
          }
        } catch (e) {
          console.error('[PANEL] message bridge in error:', e);
        }
      }, false);

      // Bridge: Service Worker -> Server (iframe) + panel control
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        try {
          // Keep parity with popup.js:
          // - case "msg": forward msg.data to iframe via postMessage
          // - case "settings-changed": reload sidepanel page
          // Additional:
          // - case "panel-ping": reply so menu can detect open/closed per tab
          // - case "panel-close": close panel (optionally scoped to tab)
          // - case "panel-close-self": immediate local close
          switch (msg?.type) {
            case 'msg':
              if (iframeEl && iframeEl.contentWindow) {
                iframeEl.contentWindow.postMessage(msg.data, serverOrigin);
              }
              break;
            case 'chat_response':
              // forward raw to iframe so chat view can consume it
              if (iframeEl && iframeEl.contentWindow) {
                iframeEl.contentWindow.postMessage(msg, serverOrigin);
              }
              break;
            case 'chat_sessions':
              // forward list of sessions to iframe
              if (iframeEl && iframeEl.contentWindow) {
                iframeEl.contentWindow.postMessage(msg, serverOrigin);
              }
              break;
            case 'chat_history':
              // forward loaded session history to iframe
              if (iframeEl && iframeEl.contentWindow) {
                iframeEl.contentWindow.postMessage(msg, serverOrigin);
              }
              break;
            case 'chat_message_edited':
              if (iframeEl && iframeEl.contentWindow) {
                iframeEl.contentWindow.postMessage(msg, serverOrigin);
              }
              break;
            case 'chat_contexts':
              if (iframeEl && iframeEl.contentWindow) {
                iframeEl.contentWindow.postMessage(msg, serverOrigin);
              }
              break;
            case 'chat_context_preview':
              if (iframeEl && iframeEl.contentWindow) {
                iframeEl.contentWindow.postMessage(msg, serverOrigin);
              }
              break;
            case 'settings-changed':
              window.location.reload();
              break;

            case 'panel-ping':
              // Respond with our tab id so the caller can verify scope
              sendResponse({ ok: true, tabId: selfTabId });
              return true; // (not required here, but harmless)

            case 'panel-close':
              // If no tab filter, or matches our tab, or our tab id is unknown -> close
              if (!msg.tabId || !selfTabId || String(msg.tabId) === String(selfTabId)) {
                window.close();
              }
              break;

            case 'panel-close-self':
              // Close immediately (used after SW disabled the panel)
              if (!msg.tabId || !selfTabId || String(msg.tabId) === String(selfTabId)) {
                window.close();
              }
              break;
          }
        } catch (e) {
          console.error('[PANEL] message bridge out error:', e);
        }
      });
    } catch (e) {
      const $msg = document.getElementById('msg');
      $msg.hidden = false;
      $msg.textContent = "Fehler beim Laden des Panels: " + (e?.message || String(e));
      console.error('[PANEL] boot error', e);
    }
  }

  boot();
})();
