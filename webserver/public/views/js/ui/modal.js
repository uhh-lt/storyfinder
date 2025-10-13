// webserver/public/js/ui/modal.js
// Centered modal dialog factory used by chat.js for simple confirmations.

export function createModal({ title, content, onConfirm, confirmLabel = 'OK', cancelLabel = 'Cancel' }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const box = document.createElement('div');
  box.className = 'modal';

  const h = document.createElement('h3');
  h.textContent = title;
  box.appendChild(h);

  if (typeof content === 'string') {
    const p = document.createElement('p');
    p.textContent = content;
    box.appendChild(p);
  } else if (content instanceof Node) {
    box.appendChild(content);
  }

  const row = document.createElement('div');
  row.className = 'modal__actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.textContent = cancelLabel;
  cancel.addEventListener('click', () => document.body.removeChild(backdrop));

  const ok = document.createElement('button');
  ok.className = 'btn';
  ok.textContent = confirmLabel;
  ok.addEventListener('click', () => {
    try { onConfirm && onConfirm(); } catch {}
    document.body.removeChild(backdrop);
  });

  row.appendChild(cancel);
  row.appendChild(ok);
  box.appendChild(row);

  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
}

