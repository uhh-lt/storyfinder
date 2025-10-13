// webserver/public/js/components/messageEditor.js
// Inline editor for user message bubbles. Replaces bubble content with a textarea and Save/Cancel.

export function startInlineEditor({ bubbleEl, originalText, messageId, rebuildUserBubble, onSave, onCancel }) {
  if (!bubbleEl || !messageId) return;

  bubbleEl.innerHTML = '';

  const ta = document.createElement('textarea');
  ta.value = originalText || '';
  ta.rows = Math.min(10, Math.max(3, Math.ceil((ta.value.length || 50) / 60)));
  ta.className = 'bubble-editor__textarea';

  const bar = document.createElement('div');
  bar.className = 'bubble-editor__actions';

  const save = document.createElement('button');
  save.className = 'btn';
  save.textContent = 'Save & Resend';

  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';

  bar.appendChild(save);
  bar.appendChild(cancel);
  bubbleEl.appendChild(ta);
  bubbleEl.appendChild(bar);
  try { ta.focus(); } catch (_) {}

  const restore = () => {
    const fresh = typeof rebuildUserBubble === 'function' ? rebuildUserBubble(originalText, messageId) : null;
    if (fresh) bubbleEl.replaceWith(fresh);
  };

  cancel.addEventListener('click', () => {
    restore();
    if (typeof onCancel === 'function') onCancel();
  });

  save.addEventListener('click', () => {
    const newText = String(ta.value || '').trim();
    if (!newText) return; // caller should show status/toast
    save.disabled = true; cancel.disabled = true; ta.disabled = true;
    if (typeof onSave === 'function') onSave(newText);
  });
}

