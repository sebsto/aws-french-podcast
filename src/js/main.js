import '../sass/main.scss'

import './themeToggle';
import './audioPlayer';

// Fix SVG <use> references in local dev: Toucan's dev target sets baseUrl to
// http://localhost:3000 which breaks <use xlink:href> cross-origin in browsers.
// Strip the origin so they become path-only URLs that work correctly.
if (window.location.hostname === 'localhost') {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('use').forEach(el => {
      const href = el.getAttribute('xlink:href') || el.getAttribute('href');
      if (href && /^https?:\/\//.test(href)) {
        try {
          const url = new URL(href);
          const attr = el.hasAttribute('xlink:href') ? 'xlink:href' : 'href';
          el.setAttribute(attr, url.pathname + url.hash);
        } catch (e) { /* ignore */ }
      }
    });
  });
}

require('svgxuse');