// webserver/public/js/components/messageBubbles.js
// Renders chat bubbles (user / assistant), handles edit/copy clicks, and provides helpers.

export function createMessageBubbles({ listEl, mainEl, svgIcon, time, mdToHtml, tooltips, onEdit, onCopy }) {
  function scrollToBottom() {
    if (!mainEl) return;
    try { mainEl.scrollTo({ top: mainEl.scrollHeight, behavior: 'smooth' }); } catch (_) {}
  }

  function buildUserBubbleNode(text, messageId, created) {
    const item = document.createElement('div');
    item.className = 'bubble bubble--user';
    if (messageId) item.dataset.messageId = String(messageId);
    item.textContent = text;
    item.setAttribute('aria-label', 'You');

    const meta = document.createElement('div');
    meta.className = 'meta-row';

    const editBtn = document.createElement('button');
    editBtn.className = 'sf-icon-btn';
    editBtn.title = tooltips?.editMsg || 'Edit & resend';
    if (typeof svgIcon === 'function') editBtn.appendChild(svgIcon('edit'));
    editBtn.addEventListener('click', () => {
      if (typeof onEdit === 'function') onEdit({ bubbleEl: item, text, messageId });
    });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'sf-icon-btn';
    copyBtn.title = tooltips?.copyUser || 'Copy message';
    if (typeof svgIcon === 'function') copyBtn.appendChild(svgIcon('copy'));
    copyBtn.addEventListener('click', () => { if (typeof onCopy === 'function') onCopy(text); });

    const t = document.createElement('time');
    if (time && created) t.textContent = time.hhmm(created);

    meta.appendChild(editBtn);
    meta.appendChild(copyBtn);
    meta.appendChild(t);
    item.appendChild(meta);
    return item;
  }

  function buildAssistantBubbleNode(text, created) {
    const item = document.createElement('div');
    item.className = 'bubble bubble--assistant';
    item.innerHTML = typeof mdToHtml === 'function' ? mdToHtml(text) : String(text || '');
    item.setAttribute('aria-label', 'Assistant');

    const meta = document.createElement('div');
    meta.className = 'meta-row';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'sf-icon-btn';
    copyBtn.title = tooltips?.copyAssistant || 'Copy reply';
    if (typeof svgIcon === 'function') copyBtn.appendChild(svgIcon('copy'));
    copyBtn.addEventListener('click', () => { if (typeof onCopy === 'function') onCopy(text); });

    const t = document.createElement('time');
    if (time && created) t.textContent = time.hhmm(created);

    meta.appendChild(copyBtn);
    meta.appendChild(t);
    item.appendChild(meta);
    return item;
  }

  function add(role, text, opts = {}) {
    const messageId = Number(opts.id || 0);
    const created = opts.created || null;
    const node = (role === 'user')
      ? buildUserBubbleNode(text, messageId || null, created)
      : buildAssistantBubbleNode(text, created);
    listEl.appendChild(node);
    scrollToBottom();
  }

  function clear() {
    listEl.innerHTML = '';
  }

  function addAssistantPlaceholder() {
    const n = document.createElement('div');
    n.className = 'bubble bubble--assistant bubble--placeholder';
    n.dataset.placeholder = '1';
    n.innerHTML = '<em>Assistant is thinking.</em>';
    listEl.appendChild(n);
    scrollToBottom();
  }
  function removeAssistantPlaceholders() {
    [...listEl.querySelectorAll('.bubble[data-placeholder="1"]')].forEach(n => n.remove());
  }

  return { add, clear, buildUserBubbleNode, buildAssistantBubbleNode, addAssistantPlaceholder, removeAssistantPlaceholders };
}

