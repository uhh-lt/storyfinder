// summary.js
// Renders the summary tab, supports regenerate (force refresh) and inline editing.
// Assumes the Service Worker proxies requests to the backend.
// IDs expected in summary.html:
//   #content, #meta, #badge, #edited-badge, #status
//   #open, #copy, #regen
//   #edit, #save, #cancel
//
// Notes:
// - We read the last payload from chrome.storage.local["sf:lastSummary"].
// - For regenerate we reuse the existing "trigger-summarize" message with {serverOnly:true, url, forceRefresh:true}.
// - For saving edits we send "save-edited-summary" to the Service Worker.

// summary.js — redesigned toolbar logic (primary/success/ghost) + edit flow UX
(function () {
  function uid() { return "req-" + Math.random().toString(36).slice(2); }

  function flashStatus(el, msg, timeout = 1600) {
    if (!el) return;
    el.textContent = msg || "";
    if (!msg) return;
    setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, timeout);
  }

  function toggle(el, show) { if (el) el.classList.toggle("hidden", !show); }
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // Inline edit helpers
  function isEditing() { return !!document.getElementById("editor"); }
  function getContentNode() { return document.getElementById("editor") || document.getElementById("content"); }
  function switchToEditor() {
    const current = document.getElementById("content");
    if (!current) return null;
    const ta = document.createElement("textarea");
    ta.id = "editor";
    ta.className = "summary";
    ta.style.width = "100%";
    ta.style.height = Math.max(current.clientHeight, 220) + "px";
    ta.value = current.textContent || "";
    current.parentNode.replaceChild(ta, current);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    return ta;
  }
  function switchToView(newText) {
    const ta = document.getElementById("editor");
    if (!ta) return null;
    const div = document.createElement("div");
    div.id = "content";
    div.className = "summary";
    div.textContent = typeof newText === "string" ? newText : ta.value;
    ta.parentNode.replaceChild(div, ta);
    return div;
  }

  function setEditingState(editing, refs) {
    const { btnOpen, btnCopy, btnRegen, btnEdit, btnSave, btnCancel } = refs;
    // Sichtbarkeit
    toggle(btnEdit, !editing);
    toggle(btnSave, editing);
    toggle(btnCancel, editing);
    // Deaktivieren von Navigation/Aktionen während Edit
    [btnOpen, btnCopy, btnRegen].forEach(b => { if (b) b.disabled = !!editing; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get("sf:lastSummary", (data) => {
      const payload = data["sf:lastSummary"] || {};
      const {
        summary = "",
        url = "",
        fromCache = false,
        edited = false,
        text_hash = null,
      } = payload;

      // DOM refs
      const contentEl = document.getElementById("content");
      const metaEl = document.getElementById("meta");
      const cacheBadgeEl = document.getElementById("badge");
      const editedBadgeEl = document.getElementById("edited-badge");
      const statusEl = document.getElementById("status");
      const btnOpen = document.getElementById("open");
      const btnCopy = document.getElementById("copy");
      const btnRegen = document.getElementById("regen");
      const btnEdit = document.getElementById("edit");
      const btnSave = document.getElementById("save");
      const btnCancel = document.getElementById("cancel");

      const refs = { btnOpen, btnCopy, btnRegen, btnEdit, btnSave, btnCancel };

      // Initial render
      if (contentEl) contentEl.textContent = summary;
      if (metaEl) {
        metaEl.innerHTML = url
          ? `URL: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
          : "";
      }
      toggle(cacheBadgeEl, !!fromCache);
      toggle(editedBadgeEl, !!edited);

      // Open original article
      if (btnOpen) {
        btnOpen.addEventListener("click", () => { if (url) window.open(url, "_blank", "noopener,noreferrer"); });
      }

      // Copy current text (view or editor)
      if (btnCopy) {
        btnCopy.addEventListener("click", async () => {
          try {
            const node = getContentNode();
            const textToCopy = node && node.tagName === "TEXTAREA" ? node.value : node?.textContent;
            await navigator.clipboard.writeText(textToCopy || "");
            flashStatus(statusEl, "Copied to clipboard.");
          } catch {
            flashStatus(statusEl, "Copy failed.");
          }
        });
      }

      // Regenerate
      if (btnRegen) {
        btnRegen.addEventListener("click", () => {
          if (!url) { flashStatus(statusEl, "No URL available for regeneration."); return; }
          const requestId = uid();
          chrome.runtime.sendMessage({
            type: "trigger-summarize",
            requestId,
            forceRefresh: true,
            serverOnly: true,
            url: url,
          });
          flashStatus(statusEl, "Regeneration requested…");
        });
      }

      // Inline edit flow
      if (btnEdit && btnSave && btnCancel) {
        btnEdit.addEventListener("click", () => {
          if (isEditing()) return;
          switchToEditor();
          setEditingState(true, refs);
          flashStatus(statusEl, `Editing… (${isMac ? "⌘S" : "Ctrl+S"} to save, Esc to cancel)`, 2200);
        });

        btnCancel.addEventListener("click", () => {
          if (!isEditing()) return;
          switchToView(payload.summary || "");
          setEditingState(false, refs);
          flashStatus(statusEl, "Changes discarded.");
        });

        btnSave.addEventListener("click", () => {
          if (!isEditing()) return;
          const ta = getContentNode();
          const newSummary = ta && ta.tagName === "TEXTAREA" ? ta.value : payload.summary || "";
          if (!newSummary.trim()) { flashStatus(statusEl, "Summary cannot be empty."); return; }

          const requestId = uid();
          const msgBody = { type: "save-edited-summary", requestId, summary: newSummary };
          if (text_hash) msgBody.text_hash = text_hash;
          else if (url) msgBody.url = url;

          // UI: kurz disabled während Save
          btnSave.disabled = true;

          chrome.runtime.sendMessage(msgBody);

          const onEditResponse = (msg) => {
            if (!msg || msg.type !== "summary_edit_response" || msg.requestId !== requestId) return;
            chrome.runtime.onMessage.removeListener(onEditResponse);
            btnSave.disabled = false;

            if (!msg.ok) { flashStatus(statusEl, `Save failed: ${msg.error || "Unknown"}`); return; }

            switchToView(newSummary);
            toggle(editedBadgeEl, true);
            setEditingState(false, refs);
            const updated = { ...payload, summary: newSummary, edited: true, ts: Date.now() };
            chrome.storage.local.set({ "sf:lastSummary": updated });
            flashStatus(statusEl, "Saved.");
          };
          chrome.runtime.onMessage.addListener(onEditResponse);
        });

        // Shortcuts: Cmd/Ctrl+S save, Esc cancel
        document.addEventListener("keydown", (e) => {
          if (!isEditing()) return;
          if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            btnSave.click();
          } else if (e.key === "Escape") {
            e.preventDefault();
            btnCancel.click();
          }
        });
      }

      // Listen for regenerate result
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg || msg.type !== "summarize_response" || !msg.data) return;
        const { summary: newSummary, fromCache: isCache } = msg.data;

        if (typeof newSummary === "string") {
          if (isEditing()) {
            switchToView(newSummary);
            setEditingState(false, refs);
          } else {
            const node = getContentNode();
            if (node) (node.tagName === "TEXTAREA") ? (node.value = newSummary) : (node.textContent = newSummary);
          }
          toggle(cacheBadgeEl, !!isCache);
          toggle(editedBadgeEl, false);
          flashStatus(statusEl, "Regenerated.");
          const updated = { ...payload, summary: newSummary, fromCache: !!isCache, edited: false, ts: Date.now() };
          chrome.storage.local.set({ "sf:lastSummary": updated });
        } else if (msg.data.error || msg.error) {
          flashStatus(statusEl, msg.data.message || msg.error || "Failed.");
        }
      });
    });
  });
})();

