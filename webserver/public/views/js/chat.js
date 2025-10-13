// webserver/public/views/js/chat.js

// --- Transport helpers (panel vs tab) ---
import { isFramed } from '../../utils/bridge.js';   // Detect if app is embedded in sidepanel iframe
import { apiFetch } from '../../utils/state.js' // 401-aware fetch for direct HTTP calls
import { mountView } from '../../utils/dom.js';
import { time, storage, keys, clamp, escapeHtml as utilEscapeHtml, mdToHtml as utilMdToHtml, svgIcon, safeErr } from '../../utils/misc.js';
import { createBanner } from './ui/banner.js';
import { createDrawer, registerGlobalAutoClose } from './ui/drawer.js';
import { createHeaderActions } from './components/headerActions.js';
import { createSessionsDrawer as cmpCreateSessionsDrawer } from './components/sessionsDrawer.js';
import { createContextDrawer as cmpCreateContextDrawer } from './components/contextDrawer.js';
import { createMessageBubbles } from './components/messageBubbles.js';
import { createTemplateActions } from './components/templateActions.js';
import { startInlineEditor } from './components/messageEditor.js';
import { createModal } from './ui/modal.js';
import { createBusy } from './ui/busy.js';
import { createChatTransport } from './transport/chatTransport.js';
import { attachSwEvents } from './transport/swEvents.js';

export async function renderChat(root) {
  // Build the chat view and wire it to transports and UI components.
  // The function is intentionally linear for clarity; component-specific
  // initialization is encapsulated in small helpers where appropriate.
  root.innerHTML = ''; // clear
  await mountView({ root, htmlPath: './views/html/chat.html' });

  // --- Banner overlay
  const bannerApi = createBanner(root.querySelector('#sf-chat-main') || document.getElementById('sf-chat-main'));
  const showBanner = bannerApi.show;
  const clearBanner = bannerApi.clear;


  // ---------- Elements ----------
  const $list    = root.querySelector('#sf-chat-list');
  const $main    = root.querySelector('#sf-chat-main');
  const $input   = root.querySelector('#sf-chat-input');
  const $send    = root.querySelector('#sf-chat-send');
  const $status  = root.querySelector('#sf-chat-status');
  const $templates = root.querySelector('#sf-chat-templates');
  const $pill    = root.querySelector('#sf-session-pill');

  // ---- Config ----
  const CFG = {
    CTX_COUNT_MIN: 1,
    CTX_COUNT_MAX: 7,
  };

  // ---- DOM utils ----
  const byId = (id) => document.getElementById(id);



  // === Transport switch ===
  // Panel (iframe) -> postMessage to sidepanel; Tab -> direct HTTP.
  // HANDLERS is populated below and passed to the transport to route events.

  const IN_PANEL = isFramed();
  // Shared handlers object: will be filled after handler functions are defined.
  // Pass by reference to transport and swEvents so we can mutate later.
  const HANDLERS = {};

  // Context modes available per environment:
  // - Panel: current | domain | recent | manual
  // - Tab:   recent  | manual (no 'current', no 'domain')
  const ALLOWED_CTX_MODES = IN_PANEL
    ? ['current', 'domain', 'recent', 'manual']
    : ['recent', 'manual'];

  /**
   * Coerce a requested context mode to a valid one for the current env.
   * Panel supports: 'current' | 'domain' | 'recent' | 'manual'
   * Tab supports:   'recent'  | 'manual'
   */
  function coerceCtxMode(mode) {
    return ALLOWED_CTX_MODES.includes(mode)
      ? mode
      : (IN_PANEL ? 'current' : 'recent');
  }

  // safeErr imported from utilities

  // New transport (panel: postMessage; tab: HTTP + local handlers)
  const ChatTransport = createChatTransport({
    mode: IN_PANEL ? 'panel' : 'tab',
    apiFetch,
    safeErr,
    postToSidepanel,
    handlers: HANDLERS,
  });



  // === Header actions: central state & registry ===
  const $actions = root.querySelector('#sf-header-actions');
  let headerApi = null; // headerActions component instance (set later)
  // Cross-section state holders for initialization functions
  let sessionsApi = null, sessionsDrawer = null, $sessionsList = null;
  let ctxApi = null, ctxDrawer = null, $ctxList = null;
  let openSessionsDrawer = null, openCtxDrawer = null;

  const uiState = {
    get sessionId() { return currentSessionId || null; },
    get busy() { return !!isBusy; }
  };
  // --- Centralized tooltip texts for hover help ---
  const TOOLTIPS = {
    new: 'Start a new chat session',
    sessions: 'Show all previous sessions',
    context: 'Select what context to include',
    preview: 'Preview the exact context text',
    rename: 'Rename this chat session',
    delete: 'Delete this chat session (and all messages)',
    editMsg: 'Edit & resend this message',
    copyUser: 'Copy your message',
    copyAssistant: 'Copy assistant reply'
  };

  let isBusy = false;

  // ----- Header action handlers ------

  function handleNew() {
    writeSessionId(null);
    bubbles.clear();
    $status.textContent = 'New session will be created on next message.';
    updateSessionPill('');
    if (headerApi) headerApi.update(); // refresh enable/disable
    scheduleHeaderRecompute();
    updateTemplatesVisibility();
  }
  function handleOpenSessions() { openSessionsDrawer();}
  function handleOpenContext() { openCtxDrawer();}
  /**
   * Request a context preview from the backend to show exact text/sources.
   */
  async function handleShowContext() {
    try {
      $status.textContent = 'Loading context';
      const outMode = IN_PANEL ? (ctxMode || 'current') : (ctxMode === 'manual' ? 'manual' : 'recent');
      const payload = {
        contextMode: outMode,
        selectedIds: (outMode === 'manual' && ctxSelectedIds.length) ? ctxSelectedIds : undefined,
        ctxCount: (outMode === 'recent' || outMode === 'domain') ? ctxCount : undefined,
        url: IN_PANEL ? undefined : location.href
      };
      ChatTransport.previewContext(payload);
    } catch (e) {
      $status.textContent = 'Failed to request context';
    }
  }
  /**
   * Open a modal to rename the current session and send rename request.
   */
  function handleRename() {
    if (!currentSessionId) { $status.textContent = 'No session to rename.'; return; }

    // Create input node
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentSessionTitle || '';
    input.style.width = '100%';
    input.style.padding = '6px';
    input.style.borderRadius = '4px';
    input.style.border = '1px solid #3750a3';

    createModal({
      title: 'Rename Session',
      content: input,
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        const title = String(input.value || '').trim();
        if (!title) { $status.textContent = 'Title must not be empty.'; return; }
        pendingRename = { prev: currentSessionTitle || '', next: title };
        updateSessionPill(title);
        $status.textContent = 'Renaming';
        ChatTransport.renameSession(currentSessionId, title);
      }
    });

    setTimeout(() => input.focus(), 50);
  }
  /**
   * Confirm and delete the current session; resets UI to a fresh state.
   */
  function handleDelete() {
    if (!currentSessionId) { $status.textContent = 'No session to delete.'; return; }

    createModal({
      title: 'Delete Session',
      content: `Really delete session #${currentSessionId}? This will remove all messages.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        const deletingId = currentSessionId;
        handleNew();                    
        $status.textContent = 'Deleting session';
        ChatTransport.deleteSession(deletingId);
      }
    });
  }


  // Header actions are rendered via createHeaderActions().

  // === Header compact switch with hard breakpoints (no measurements) ===
  const BREAKPOINTS = {
    3: 375,  // width available for actions when 3 buttons are visible
    5: 650   // width available for actions when 5 buttons are visible
  };
  let _layoutRAF = 0;

  function setHeaderCompact(compact) {
    if (!$actions) return;
    $actions.classList.toggle('is-compact', !!compact);
  }

  // visible count is provided by headerActions component

  /**
   * Compute whether actions need to collapse based on available width.
   */
  function recomputeHeaderLayout() {
    const headerEl = document.getElementById('sf-chat-header');
    const leftEl   = document.getElementById('sf-header-left');
    if (!headerEl || !leftEl || !$actions) return;

    const headerW = headerEl.clientWidth || 0;
    const leftW   = leftEl.clientWidth || 0;
    const available = Math.max(0, headerW - leftW - 8); // 8px gap between left & actions

    const count = headerApi ? headerApi.visibleCount() : 3;
    const threshold = BREAKPOINTS[count] || 640;

    setHeaderCompact(available < threshold);
  }

  /**
   * Throttle layout recompute into a single rAF.
   */
  function scheduleHeaderRecompute() {
    if (_layoutRAF) cancelAnimationFrame(_layoutRAF);
    _layoutRAF = requestAnimationFrame(() => {
      _layoutRAF = 0;
      recomputeHeaderLayout();
    });
  }

  window.addEventListener('resize', scheduleHeaderRecompute);

  // Autofocus & shortcut hint for the composer
  setTimeout(() => { try { $input.focus(); } catch(_) {} }, 0);
  $input.placeholder = 'Ask your question (Enter = send, Shift + Enter = newline)';

  // ---- Templates (quick actions for new chats only) ----
  // Wrapper that applies a template and optionally auto-sends
  function applyTemplateAuto(prefillText, opts = {}) {
    const auto = !!opts.autoSend;
    try { $input.focus(); } catch {}
    $input.value = prefillText;
    try { $input.setSelectionRange($input.value.length, $input.value.length); } catch {}
    if (auto) {
      $status.textContent = 'Auto-Send: sending…';
      setTimeout(() => sendNow(), 10);
    } else {
      $status.textContent = 'Template inserted. You can send now.';
    }
  }

  function updateTemplatesVisibility() {
    if (!$templates) return;
    const isNew = !currentSessionId && ($list.childElementCount === 0);
    $templates.style.display = isNew ? '' : 'none';
  }


  // -------------- Drawer -----------------
  // ---- Drawer factory ----
  // createDrawer imported from ui/drawer.js
  // ---- Global auto-close for many drawers ----
  // registerGlobalAutoClose imported from ui/drawer.js

  // ---------- Session state ----------
  // Active session id + title, persisted via storage; used by header & bubbles.
  let currentSessionId = readSessionId();
  let currentSessionTitle = '';
  updateSessionPill(); // will use currentSessionTitle if no explicit title is passed
  let pendingRename = null; // { prev: string, next: string } | null
  headerApi = createHeaderActions({
    container: $actions,
    svgIcon,
    uiState,
    tooltips: TOOLTIPS,
    handlers: {
      onNew: handleNew,
      onOpenSessions: handleOpenSessions,
      onOpenContext: handleOpenContext,
      onShowContext: handleShowContext,
      onRename: handleRename,
      onDelete: handleDelete,
    }
  });
  headerApi.render();
  // ---------- Sessions Drawer (factory) ----------

  // Create instance & helper expected by the UI
  function initSessionsDrawer() {
    const sessions = cmpCreateSessionsDrawer({ createDrawer });
    sessionsApi = sessions;
    sessionsDrawer = sessions.drawer;
    $sessionsList = sessions.listEl;
    openSessionsDrawer = function openSessionsDrawerImpl() {
      sessionsApi.open((listEl) => {
        listEl.innerHTML = '';
        listEl.appendChild(spinner('Loading sessions.'));
        ChatTransport.listSessions();
      });
    };
  }
  

  // ---- Context state ----
  // Which sources the assistant includes: mode + selection + count.
  let ctxMode = readCtxMode();                 // 'current' | 'domain' | 'recent' | 'manual'
  let ctxSelectedIds = readCtxSelectedIds();   // number[]
  let ctxCount = readCtxCount(); // 1..7
  updateContextBadge();

  /** Update context mode and persist; coerces to a valid mode per environment. */
  function writeCtxMode(mode) {
    // Sanitize mode based on environment
    ctxMode = coerceCtxMode(mode);
    storage.set(keys.ctxMode, ctxMode);
    updateContextBadge();
  }
  /** Read context mode from storage (defaults differ: panel?current, tab?recent). */
  function readCtxMode() {
    // Default differs: panel -> 'current', tab -> 'recent'
    const def = IN_PANEL ? 'current' : 'recent';
    const raw = storage.get(keys.ctxMode, def) || def;
    return coerceCtxMode(raw);
  }
  /** Update selected manual context ids and persist. */
  function writeCtxSelectedIds(ids) {
    ctxSelectedIds = Array.isArray(ids) ? ids : [];
    storage.setJSON(keys.ctxIds, ctxSelectedIds);
    updateContextBadge();
  }
  /** Read manual context selection (number[]) from storage, filter invalids. */
  function readCtxSelectedIds() {
    const arr = storage.getJSON(keys.ctxIds, []);
    return Array.isArray(arr) ? arr.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0) : [];
  }
  /**
   * Update the context pill to reflect current mode and parameters.
   */
  function updateContextBadge() {
    const badge = document.getElementById('sf-context-pill');
    if (!badge) return;
    ctxMode = coerceCtxMode(ctxMode);
    let txt = 'Context: current';
    if (ctxMode === 'recent') txt = `Context: ${ctxCount} recent`;
    else if (ctxMode === 'manual') txt = `Context: manual${ctxSelectedIds.length ? ` (${ctxSelectedIds.length})` : ''}`;
    else if (ctxMode === 'domain') txt = `Context: ${ctxCount} from this domain`;
    badge.textContent = txt;
    scheduleHeaderRecompute();
    // Re-render template actions to reflect current context availability
    try { templatesApi && templatesApi.update && templatesApi.update(); } catch {}
  }
  /** Read number of items considered for 'recent'/'domain' modes (1..7). */
  function readCtxCount() {
    return clamp(storage.get(keys.ctxCount, 3), CFG.CTX_COUNT_MIN, CFG.CTX_COUNT_MAX);
  }
  /** Update number of items considered for 'recent'/'domain' modes. */
  function writeCtxCount(n) {
    ctxCount = clamp(n, CFG.CTX_COUNT_MIN, CFG.CTX_COUNT_MAX); 
    storage.set(keys.ctxCount, String(ctxCount));
    updateContextBadge();
  }

  // ---------- Context Drawer (component) ----------
  function initContextDrawer() {
    const ctx = cmpCreateContextDrawer({
      createDrawer,
      IN_PANEL,
      CFG,
      getCtxMode: () => ctxMode,
      setCtxMode: writeCtxMode,
      getCtxCount: () => ctxCount,
      setCtxCount: writeCtxCount,
      getSelectedIds: () => ctxSelectedIds,
      setSelectedIds: writeCtxSelectedIds,
      onOpenManualLoad: (onlyDom, listEl) => {
        listEl.innerHTML = '';
        listEl.appendChild(spinner('Loading articles.'));
        const opts = { limit: 50 };
        if (IN_PANEL && onlyDom) opts.domain = true;
        ChatTransport.listContexts(opts);
      }
    });
    ctxApi = ctx;
    ctxDrawer = ctx.drawer;
    $ctxList = ctx.els.list;
    openCtxDrawer = () => ctxApi.open();

    $pill.title = 'Current chat session ID';
    byId('sf-context-pill').title = 'Which sources are included as context for the assistant';

    registerGlobalAutoClose([sessionsDrawer, ctxDrawer]);
  }

  // ---- Modal factory (centered dialog) ----
  // createModal imported from ui/modal.js

  // ---------- Helpers ----------

  function spinner(text='Loading') {
    const d = document.createElement('div');
    d.className = 'helper';
    d.innerHTML = `? ${utilEscapeHtml(text)}`;
    return d;
  }
  // --- Busy counter orchestrator ---
  // Busy orchestrator
  const busy = createBusy((is) => setBusy(is));
  function setBusy(b) {
    isBusy = !!b;
    $send.disabled = !!b;
    $send.textContent = b ? 'Sending...' : 'Send';
    if (headerApi) headerApi.update();
  }

  // -------------- Chat-Helpers -------------------

  // --- Copy & Toast helpers ---
  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text ?? ''));
      showBanner('info', 'Copied to clipboard');
      setTimeout(clearBanner, 1500);
    } catch {
      showBanner('info', 'Copied (fallback). Press Ctrl/Cmd+C to confirm.');
      setTimeout(clearBanner, 2000);
      const ta = document.createElement('textarea');
      ta.value = String(text ?? '');
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
  }
  // Message bubble component
  const bubbles = createMessageBubbles({
    listEl: $list,
    mainEl: $main,
    svgIcon,
    time,
    mdToHtml: utilMdToHtml,
    tooltips: TOOLTIPS,
    onEdit: ({ bubbleEl, text, messageId }) => {
      if (!messageId) { $status.textContent = 'Cannot edit: no message id.'; return; }
      startInlineEditor({
        bubbleEl,
        originalText: text,
        messageId,
        rebuildUserBubble: (t, id) => bubbles.buildUserBubbleNode(t, id),
        onSave: (newText) => {
          if (!newText) { $status.textContent = 'Content must not be empty.'; return; }
          // Cancel any in-flight generation and clean placeholders before regenerating
          try { ChatTransport.cancelInFlight && ChatTransport.cancelInFlight(); } catch {}
          try { busy.end('send'); } catch {}
          removeAssistantPlaceholders();

          // Immediately reflect the edited text and truncate later bubbles in the UI
          const newUserNode = bubbles.buildUserBubbleNode(newText, messageId);
          try { bubbleEl.replaceWith(newUserNode); } catch {}
          // Remove all messages after the edited one so it feels instant
          (function truncateAfterBubble(el){
            if (!el || !$list.contains(el)) return;
            let n = el.nextSibling;
            while (n) { const r = n; n = n.nextSibling; try { $list.removeChild(r); } catch {} }
          })(newUserNode);

          // Show regeneration status and a fresh assistant placeholder right away
          $status.textContent = 'Regenerating.';
          busy.start('resend');
          bubbles.addAssistantPlaceholder();

          const outMode = IN_PANEL ? (ctxMode || 'current') : (ctxMode === 'manual' ? 'manual' : 'recent');
          ChatTransport.editResend({
            messageId,
            content: newText,
            resend: true,
            scope: outMode,
            contextMode: outMode,
            selectedIds: (outMode === 'manual' ? ctxSelectedIds : []),
            ctxCount: ((outMode === 'recent' || outMode === 'domain') ? ctxCount : undefined)
          });
        },
        onCancel: () => {}
      });
    },
    onCopy: (text) => copyTextToClipboard(text)
  });

  function renderHistory(messages) {
    bubbles.clear();
    (messages || []).forEach(m => {
      const role = (m.role === 'assistant' ? 'assistant' : 'user');
      bubbles.add(role, m.content, { id: m.id, created: m.created });
    });
    updateTemplatesVisibility();
  }
  function extractAssistantText(resp) {
    const data = resp?.data || {};
    if (typeof data.answer === 'string' && data.answer.trim()) return data.answer;
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    if (typeof data.text === 'string' && data.text.trim()) return data.text;
    try { return JSON.stringify(data); } catch { return 'OK'; }
  }
  function removeAssistantPlaceholders() {
    [...$list.querySelectorAll('.bubble[data-placeholder="1"]')].forEach(n => n.remove());
  }
  function postToSidepanel(payload) {
    try { window.parent && window.parent.postMessage(['msg', payload], '*'); } catch (_) {}
  }
  /** Persist session id and update UI title (clears when null). */
  function writeSessionId(id) {
    currentSessionId = (typeof id === 'number' && Number.isFinite(id)) ? id : null;

    if (!currentSessionId) {
      currentSessionTitle = '';
      try { sessionStorage.removeItem(keys.sessionId); } catch {}
    } else {
      storage.set(keys.sessionId, String(currentSessionId));
    }
    updateSessionPill();
  }
  /** Read session id from storage (or null if none). */
  function readSessionId() {
    const v = storage.get(keys.sessionId, '');
    return v ? Number(v) : null;
  }
  /** Update the session pill (id + optional title) and trigger layout. */
  function updateSessionPill(titleParam) {
    // If a new title is passed, remember it in UI state.
    if (typeof titleParam === 'string') {
      currentSessionTitle = titleParam;
    }
    const t = (typeof titleParam === 'string') ? titleParam : (currentSessionTitle || '');
    $pill.textContent = currentSessionId
      ? `#${currentSessionId}${t ? ' • ' + t : ''}`
      : 'no session';
    scheduleHeaderRecompute();
  }


  // ---- SW event handlers (split by type) ----
  /** Handle an answer or error after sending a question. */
  function onChatResponse(payload) {
    busy.end('send');
    const sid = payload?.data?.sessionId;
    if (sid !== undefined && sid !== null) writeSessionId(sid);

    const ok = !!payload.ok;
    if (ok) {
      const sessionToLoad = (typeof sid === 'number' ? sid : currentSessionId);
      if (sessionToLoad) {
        ChatTransport.loadSession(sessionToLoad);
        $status.textContent = '';
      } else {
        const text = extractAssistantText(payload);
        bubbles.add('assistant', text);
        $status.textContent = '';
      }
      clearBanner();
    } else {
      $status.textContent = 'Error: ' + (payload.data?.error || payload.error || 'unknown');
      showBanner('error', payload.data?.error || payload.error || 'Unknown error');
    }
    removeAssistantPlaceholders();
    updateTemplatesVisibility();
  }
  /** Populate sessions drawer with the session list. */
  function onChatSessions(payload) {
    $sessionsList.innerHTML = '';
    if (payload.ok) {
      const arr = payload.data?.sessions || [];
      if (arr.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'helper';
        empty.textContent = 'No sessions yet.';
        $sessionsList.appendChild(empty);
      } else {
        arr.forEach((s) => {
          const btn = document.createElement('button');
          btn.className = 'btn btn--left';
          const when = time.ddmmyy(s.last_message_at || s.created);
          btn.innerHTML = `#${s.id} • <span style="opacity:.9">${utilEscapeHtml(s.title || 'Untitled')}</span> • <span style="opacity:.75">${when}</span>`;
          btn.addEventListener('click', async () => {
            await ChatTransport.loadSession(s.id);
            sessionsDrawer.close();
          });
          $sessionsList.appendChild(btn);
        });
      }
    } else {
      const err = document.createElement('div');
      err.className = 'helper';
      err.textContent = 'Failed to load sessions' + (payload.error ? (': ' + payload.error) : '');
      $sessionsList.appendChild(err);
    }
  }
  /** Render a full session history (session + messages). */
  function onChatHistory(payload) {
    if (payload.ok) {
      const s = payload.data?.session;
      const msgs = payload.data?.messages || [];
      writeSessionId(s?.id ?? null);
      updateSessionPill(s?.title || '');
      renderHistory(msgs);
      $status.textContent = currentSessionId ? `Loaded session #${currentSessionId}` : '';
      if (headerApi) headerApi.update();
      scheduleHeaderRecompute();
      clearBanner();
    } else {
      $status.textContent = 'Failed to load session';
      if (headerApi) headerApi.update();
      scheduleHeaderRecompute();
      showBanner('error', payload.error || 'Failed to load session');
    }
    removeAssistantPlaceholders();
  }
  /** Render list of selectable context items for manual mode. */
  function onChatContexts(payload) {
    $ctxList.innerHTML = '';
    if (!payload.ok) {
      const err = document.createElement('div');
      err.className = 'helper';
      err.textContent = 'Failed to load articles' + (payload.error ? (': ' + payload.error) : '');
      $ctxList.appendChild(err);
      return;
    }
    const items = payload.data?.items || [];
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'helper';
      empty.textContent = 'No recent items.';
      $ctxList.appendChild(empty);
      return;
    }
    items.forEach(it => {
      const row = document.createElement('label');
      row.className = 'ctx-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.id = it.id;
      cb.checked = ctxSelectedIds.includes(Number(it.id));

      const meta = document.createElement('div');
      meta.className = 'ctx-item__meta';
      meta.innerHTML = `
        <div class="url">${utilEscapeHtml(it.url)}</div>
        <div class="helper">${time.ddmmyy(it.created)}</div>
      `;

      row.appendChild(cb);
      row.appendChild(meta);
      $ctxList.appendChild(row);
    });
  }
  /** Show a modal-like overlay with the exact context text and sources. */
  function onChatContextPreview(payload) {
    if (!$status) return;
    if (!payload || !payload.ok) {
      $status.textContent = 'Failed to load context';
      showBanner && showBanner('error', payload?.error || 'Failed to load context');
      return;
    }
    $status.textContent = '';

    const data = payload.data || {};
    const ctxText = String(data.context || '');
    const sources = Array.isArray(data.sources) ? data.sources : [];

    const backdrop = document.createElement('div');
    Object.assign(backdrop.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#0c1330', border: '1px solid #23335f', borderRadius: '10px',
      padding: '12px', width: 'min(900px, 96vw)', height: '80vh', display: 'grid', gridTemplateRows: 'auto auto 1fr auto', gap: '8px',
      boxShadow: '0 6px 28px rgba(0,0,0,0.45)'
    });
    const title = document.createElement('div');
    title.innerHTML = '<h3 style="margin:0;">Context Preview</h3>';

    const meta = document.createElement('div');
    meta.className = 'helper';
    meta.style.whiteSpace = 'nowrap';
    meta.style.overflow = 'hidden';
    meta.style.textOverflow = 'ellipsis';
    meta.textContent = `Mode: ${data.mode || '-'} • Characters: ${data.totalChars || (ctxText ? ctxText.length : 0)}${sources.length ? ` • Sources: ${sources.length}` : ''}`;

    const srcList = document.createElement('div');
    srcList.className = 'helper';
    if (sources.length) {
      const ul = document.createElement('ul');
      ul.style.margin = '0';
      ul.style.paddingLeft = '18px';
      sources.forEach(s => {
        const li = document.createElement('li');
        li.textContent = `${s.url || ''}${s.created ? ` (${s.created})` : ''}`;
        ul.appendChild(li);
      });
      srcList.appendChild(ul);
    } else {
      srcList.textContent = 'Sources: (n/a)';
    }

    const preWrap = document.createElement('div');
    Object.assign(preWrap.style, { overflow: 'auto', border: '1px solid #23335f', borderRadius: '8px', padding: '8px' });
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = ctxText || '(empty)';
    preWrap.appendChild(pre);

    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.justifyContent = 'flex-end'; row.style.gap = '8px';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ctxText || ''); } catch {}
    });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => document.body.removeChild(backdrop));
    row.appendChild(copyBtn);
    row.appendChild(closeBtn);

    box.appendChild(title);
    box.appendChild(meta);
    box.appendChild(srcList);
    box.appendChild(preWrap);
    box.appendChild(row);
    backdrop.appendChild(box);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) document.body.removeChild(backdrop); });
    document.body.appendChild(backdrop);
  }
  /** Reflect successful/failed session rename and refresh UI if needed. */
  function onChatSessionRenamed(payload) {
    if (payload.ok) {
      const newTitle = payload?.data?.session?.title || '';
      updateSessionPill(newTitle);
      pendingRename = null;
      $status.textContent = `Renamed session #${currentSessionId}`;
      if (sessionsDrawer?.isOpen && sessionsDrawer.isOpen()) {
        ChatTransport.listSessions();
      }
    } else {
      if (pendingRename) {
        updateSessionPill(pendingRename.prev);
        pendingRename = null;
      }
      $status.textContent = 'Rename failed: ' + (payload.error || 'unknown');

    }
    if (headerApi) headerApi.update();
    scheduleHeaderRecompute();
  }
  /** Reflect successful/failed session deletion and reset UI. */
  function onChatSessionDeleted(payload) {
    if (payload.ok) {
      handleNew();
      clearBanner();
      $status.textContent = 'Session deleted. New session ready.';
    } else {
      $status.textContent = 'Delete failed: ' + (payload.error || 'unknown');
      showBanner('error', payload.error || 'Delete failed');
    }
    if (headerApi) headerApi.update();
    scheduleHeaderRecompute();
  }
  /** Handle result of edit/resend flow: replace history or show error. */
  function onChatMessageEdited(payload) {
    if (payload.ok) {
      const sid = payload?.data?.sessionId ?? null;
      const msgs = payload?.data?.messages || [];
      if (sid !== null) writeSessionId(sid);
      renderHistory(msgs);
      $status.textContent = 'Regenerated.';
      clearBanner();
    } else {
      $status.textContent = 'Edit/Resend failed: ' + (payload.error || 'unknown');
      showBanner('error', payload.error || 'Edit/Resend failed');
    }
    busy.end('resend')
    removeAssistantPlaceholders();
  }

  // ---------- Events from SW (via sidepanel) ----------
  function initEventWiring() {
    // Fill handlers and attach listener in panel mode
    Object.assign(HANDLERS, {
      'chat_response': onChatResponse,
      'chat_sessions': onChatSessions,
      'chat_history': onChatHistory,
      'chat_contexts': onChatContexts,
      'chat_context_preview': onChatContextPreview,
      'chat_session_renamed': onChatSessionRenamed,
      'chat_session_deleted': onChatSessionDeleted,
      'chat_message_edited': onChatMessageEdited,
    });
    if (IN_PANEL) attachSwEvents({ windowRef: window, handlers: HANDLERS });
  }

  // ---------- Composer ----------
  /**
   * Send a user question. Adds user bubble + assistant placeholder,
   * then dispatches the request with the current context mode.
   */
  function sendNow() {
    const q = ($input.value || '').trim();
    if (!q) { $status.textContent = 'Please enter a question.'; return; }
    busy.start('send');
    $status.textContent = 'Sending';
    bubbles.add('user', q);
    bubbles.addAssistantPlaceholder();
    updateTemplatesVisibility();
    $input.value = '';
    const outMode = IN_PANEL
      ? (ctxMode || 'current')
      : (ctxMode === 'manual' ? 'manual' : 'recent');

    ChatTransport.ask({
      question: q,
      // Server expects scope='current'; mode via 'contextMode'
      scope: 'current',
      sessionId: currentSessionId,
      contextMode: outMode,
      selectedIds: (outMode === 'manual' && ctxSelectedIds.length) ? ctxSelectedIds : undefined,
      ctxCount: ((outMode === 'recent') || (outMode === 'domain')) ? ctxCount : undefined,
      url: location.href
    });
  }

  // Composer initialization helper for event bindings
  function initComposer() {
    $send.addEventListener('click', sendNow);
    $input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendNow();
      }
    });
  }

  // ---------- Initialization sequence ----------
  initSessionsDrawer();
  initContextDrawer();
  initEventWiring();
  const templatesApi = createTemplateActions({
    container: $templates,
    getCtxMode: () => ctxMode,
    getCtxSelectedIds: () => ctxSelectedIds,
    getCtxCount: () => ctxCount,
    onPrompt: (prompt, meta) => applyTemplateAuto(prompt, { autoSend: !!meta?.autoSend })
  });
  templatesApi.render();
  initComposer();

  // ---------- Initial session restore ----------
  if (currentSessionId) {
    // Ask SW to load the history so UI is consistent after reload
    ChatTransport.loadSession(currentSessionId);
  }
  // --- schedule correct Side-Panel Layout for size ----
  scheduleHeaderRecompute();
  updateTemplatesVisibility();
}

