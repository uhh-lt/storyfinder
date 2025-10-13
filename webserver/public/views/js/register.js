// public/views/js/register.js
// Register UX: load external HTML/CSS, validate, register, auto-login.
import { setAuth, fetchMe } from '../../utils/state.js';
import { mountView } from '../../utils/dom.js';
import { notify } from '../../utils/bridge.js';

export async function renderRegister(root) {
  await mountView({
    root,
    htmlPath: './views/html/register.html',
    onMount(node) {
      const form = node.querySelector('#reg-form');
      if (!form) return;

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        const email = String(fd.get('email') || '').trim();
        const pass1 = String(fd.get('password') || '');
        const pass2 = String(fd.get('password2') || '');

        if (!email) { alert('Please enter an email.'); return; }
        if (pass1.length < 6) { alert('Password must be at least 6 characters.'); return; }
        if (pass1 !== pass2) { alert('Passwords do not match.'); return; }

        try {
          // Create user
          const res = await fetch('/Users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username: email, email, password: pass1 })
          });
          if (!res.ok) { alert('Registration failed.'); return; }

          // Try to fetch auth; if not logged in, attempt login once
          let me = await fetchMe();
          if (!me?.auth) {
            await fetch('/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              credentials: 'include',
              body: new URLSearchParams({ username: email, password: pass1 })
            });
            me = await fetchMe();
          }

          if (me?.auth) {
            setAuth(true, me.user);

            // Notify extension/host (new + legacy formats)
            try { notify('sf:userRegistered', { username: email, password: pass1 }); } catch {}
            try { window.parent?.postMessage(['msg', { action: 'userRegistered', username: email, password: pass1 }], '*'); } catch {}

            location.hash = '#/graph';
          } else {
            alert('Registered but sign-in failed. Please log in manually.');
            location.hash = '#/login';
          }
        } catch (e) {
          console.error('[register] error', e);
          alert('Network error during registration.');
        }
      });
    }
  });
}
