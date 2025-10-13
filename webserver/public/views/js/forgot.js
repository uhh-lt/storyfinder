// public/views/js/forgot.js
// Simple "Forgot password" placeholder; HTML & CSS externalized.
import { mountView } from '../../utils/dom.js';

/**
 * Render the Forgot view: loads static HTML and ensures view CSS.
 * @param {Element} root
 */
export async function renderForgot(root) {
  await mountView({
    root,
    htmlPath: './views/html/forgot.html'
  });
}
