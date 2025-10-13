// public/views/js/login.js
// Login UX: email + password, proper errors, forgot/register links,
// and "open in tab" flow for the side panel (iframes).
import { setAuth, fetchMe } from '../../utils/state.js';
import { notify, isFramed } from '../../utils/bridge.js';
import { mountView } from '../../utils/dom.js';

export async function renderLogin(root) {
  // Clear defensively
  root.innerHTML = '';

  // If already authenticated → go to graph
  try {
    const me = await fetchMe();
    if (me?.auth) {
      setAuth(true, me.user);
      location.hash = '#/graph';
      return;
    }
  } catch {
    // ignore fetchMe errors; continue to login
  }

  await mountView({
    root,
    htmlPath: './views/html/login.html',
    onMount() {
      const framed = isFramed();
      const $framed = root.querySelector('#login-framed');
      const $top = root.querySelector('#login-top');

      // Show exactly one section
      if (framed) {
        $framed?.removeAttribute('hidden');
        $top?.setAttribute('hidden', '');
        const $btnOpen = root.querySelector('#btn-open-tab');
        $btnOpen?.addEventListener('click', () => {
          // open the app in top-level tab
          notify('sf:openInTab', { url: location.origin + '/' });
        });
        return;
      }

      // Top-level: show real login form
      $framed?.setAttribute('hidden', '');
      $top?.removeAttribute('hidden');

      const $form = root.querySelector('#login-form');
      const $error = root.querySelector('#login-error');

      $form?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if ($error) {
          $error.textContent = '';
          $error.style.display = 'none';
        }

        const fd = new FormData($form);
        const email = String(fd.get('username') || '').trim();
        const pass = String(fd.get('password') || '');

        if (!email) {
          if ($error) {
            $error.textContent = 'Please enter your email.';
            $error.style.display = '';
          }
          return;
        }
        if (!pass) {
          if ($error) {
            $error.textContent = 'Please enter your password.';
            $error.style.display = '';
          }
          return;
        }

        try {
          // Legacy-compatible: username=email in x-www-form-urlencoded
          const body = new URLSearchParams({ username: email, password: pass });

          // POST /login; some setups redirect on success
          await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            credentials: 'include',
            redirect: 'follow'
          });

          // Always verify with /api/me
          const me = await fetchMe();
          if (me?.auth) {
            setAuth(true, me.user);

            // Notify extension SW (legacy bridge) so Basic creds are stored for sidepanel
            try {
              window.parent?.postMessage(
                ['msg', { action: 'userRegistered', username: email, password: pass }],
                '*'
              );
            } catch { /* no-op */ }

            location.hash = '#/graph';
            return;
          }

          // If we got here, sign-in failed
          if ($error) {
            $error.textContent = 'Sign-in failed. Please check your email and password.';
            $error.style.display = '';
          }
        } catch (e) {
          console.error('[login] failed', e);
          if ($error) {
            $error.textContent = 'Network error. Please try again.';
            $error.style.display = '';
          }
        }
      });
    }
  });
}
