// Sprite SVG KORA — injecté dans le body (corrige le bug <object> qui ne rendait pas les <use>)
const SPRITE = `
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <defs>
    <symbol id="i-dashboard" viewBox="0 0 24 24"><path fill="currentColor" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></symbol>
    <symbol id="i-facts" viewBox="0 0 24 24"><path fill="currentColor" d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4zm0 10.9h7c-.5 4.1-3.3 7.8-7 8.9V12H5V6.3l7-3.1V11.9z"/></symbol>
    <symbol id="i-sources" viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h18v3H3V4zm0 6h12v3H3v-3zm0 6h18v3H3v-3z"/></symbol>
    <symbol id="i-audit" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></symbol>
    <symbol id="i-status" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4L10.6 10.6l6.3-6.3z"/></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path fill="currentColor" d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z"/></symbol>
    <symbol id="i-edit" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></symbol>
    <symbol id="i-reject" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.6 12.2L15.2 16 12 12.8 8.8 16 7.4 14.2 10.6 11 7.4 7.8 8.8 6.4 12 9.6 15.2 6.4 16.6 7.8 13.4 11l3.2 3.2z"/></symbol>
    <symbol id="i-retract" viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path fill="currentColor" d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z"/></symbol>
    <symbol id="i-refresh" viewBox="0 0 24 24"><path fill="currentColor" d="M17.65 6.35A8 8 0 1 0 19 12h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35z"/></symbol>
    <symbol id="i-spark" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 9.2 9.2 2 12l7.2 2.8L12 22l2.8-7.2L22 12l-7.2-2.8L12 2z"/></symbol>
    <symbol id="i-image" viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 11l2.5 3 3-4 4 5H5l3.5-4z"/></symbol>
    <symbol id="i-level1" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 2 7l10 5 10-5-10-5zm0 7.2L5 6.5 12 4l7 2.5-7 2.7zM2 12l10 5 10-5v2l-10 5-10-5v-2zm0 5 10 5 10-5v2l-10 5-10-5v-2z"/></symbol>
    <symbol id="i-level2" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z"/></symbol>
    <symbol id="i-date" viewBox="0 0 24 24"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></symbol>
    <symbol id="i-fusion" viewBox="0 0 24 24"><path fill="currentColor" d="M3 11h7V4H3v7zm0 9h7v-7H3v7zm11 0h7v-7h-7v7zm0-16v7h7V4h-7z"/></symbol>
    <symbol id="i-menu" viewBox="0 0 24 24"><path fill="currentColor" d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/></symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24"><path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z"/></symbol>
    <symbol id="i-sun" viewBox="0 0 24 24"><path fill="currentColor" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5h0v3h0V2zm0 17v3M2 12h3m14 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1"/></symbol>
    <symbol id="i-moon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-5.4-5.4c0-1.81.89-3.41 2.26-4.4C12.92 3.04 12.46 3 12 3z"/></symbol>
    <symbol id="i-palette" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.53-.21-1.02-.56-1.39-.34-.36-.55-.85-.55-1.36 0-1.1.9-2 2-2h1.6c2.65 0 4.8-2.15 4.8-4.8C22 5.2 17.5 2 12 2zm-4.5 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></symbol>
    <symbol id="i-settings" viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6H10.1l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4L3.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 1.7 1l.4 2.6h3.8l.4-2.6a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></symbol>
    <symbol id="i-undo" viewBox="0 0 24 24"><path fill="currentColor" d="M12.5 8c-2.6 0-5 1-6.8 2.8L3 8v8h8l-3-3c1.3-1.4 3.2-2.3 5.3-2.3 3.8 0 6.9 2.7 7.7 6.2l2 .5C19.3 11.9 16.2 8 12.5 8z"/></symbol>
  </defs>
</svg>`;

export function mountSprite() {
  const el = document.createElement("div");
  el.innerHTML = SPRITE.trim();
  document.body.appendChild(el.firstChild);
}
