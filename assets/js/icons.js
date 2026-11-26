/* Inline SVG icon sprite injected into every page */
(function () {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = [
    '<symbol id="i-logo" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 3h2v2h-2V7Zm0 4h2v6h-2v-6Z"/></symbol>',
    '<symbol id="i-filofa" viewBox="0 0 64 64"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563FF"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#fg)"/><path d="M22 47V19" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M22 19H44" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M22 32H37" stroke="#fff" stroke-width="8" stroke-linecap="round"/><circle cx="47" cy="32" r="5" fill="#22D3EE"/></symbol>',
    '<symbol id="i-upload" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/></symbol>',
    '<symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="9" r="1.6" fill="currentColor"/><path d="m4 17 5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>',
    '<symbol id="i-spark" viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Zm7 12 .9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14Z"/></symbol>',
    '<symbol id="i-bolt" viewBox="0 0 24 24"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></symbol>',
    '<symbol id="i-shield" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/><path d="m8.5 12 2.3 2.3 4.7-4.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>',
    '<symbol id="i-download" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 18v1.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V18"/></symbol>',
    '<symbol id="i-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7"/></symbol>',
    '<symbol id="i-arrow" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6"/></symbol>',
    '<symbol id="i-palette" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-1.9 0-1.3-1-1.7-1-2.8 0-.9.7-1.6 1.6-1.6H17c2.2 0 4-1.8 4-4A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></symbol>',
    '<symbol id="i-brush" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m14 4 6 6-8 8-6-6 8-8Z"/><path d="M6 12c-2 .5-3 2-3 4 0 2 1 3 3 3 2 0 3.5-1 4-3" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>',
    '<symbol id="i-crop" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/></symbol>',
    '<symbol id="i-api" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/></symbol>',
    '<symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M17 14.9c2.5.5 4 2.4 4 5.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>',
    '<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>',
    '<symbol id="i-star" viewBox="0 0 24 24"><path fill="currentColor" d="m12 2.5 2.9 6 6.6 1-4.8 4.6 1.1 6.6L12 17.6 6.2 20.7l1.1-6.6L2.5 9.5l6.6-1L12 2.5Z"/></symbol>',
    '<symbol id="i-layers" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5"/></symbol>',
    '<symbol id="i-link" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M9.5 14.5 14.5 9.5M7 12l-2 2a3.5 3.5 0 0 0 5 5l2-2m5-5 2-2a3.5 3.5 0 0 0-5-5l-2 2"/></symbol>',
    '<symbol id="i-camera" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3 7h4l2-2h6l2 2h4v12H3V7Z"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>',
    '<symbol id="i-bag" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M4 8h16l-1 13H5L4 8Zm4 0V6a4 4 0 0 1 8 0v2"/></symbol>',
    '<symbol id="i-refresh" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18 7l2 2M18.5 15A7 7 0 0 1 6 17l-2-2"/></symbol>',
    '<symbol id="i-menu" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/></symbol>',
    '<symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>'
  ].join('');
  document.body.insertBefore(svg, document.body.firstChild);
})();
