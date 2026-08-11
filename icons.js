// Hand-drawn SVG icon set used across the app. currentColor so icons
// inherit color from their container — no external assets needed.

const wrap = (paths, vb = 24) =>
  `<svg viewBox="0 0 ${vb} ${vb}" fill="none" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;

export const icons = {
  menu: wrap(`<path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  search: wrap(`<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  plus: wrap(`<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  person: wrap(`<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c1.6-4 5-6 8-6s6.4 2 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  home: wrap(`<path d="M4 11l8-7 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9h12v-9" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`),
  layers: wrap(`<path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  sun: wrap(`<circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.4M12 19v2.5M4.6 12H2.2M21.8 12h-2.4M5.4 5.4l1.7 1.7M17 17l1.7 1.7M18.6 5.4L17 7.1M7 17l-1.7 1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  moon: wrap(`<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`),
  chevronRight: wrap(`<path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  chevronDown: wrap(`<path d="M5 9l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  x: wrap(`<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  check: wrap(`<path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  clock: wrap(`<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  download: wrap(`<path d="M12 4v11m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  upload: wrap(`<path d="M12 20V9m0 0l-4 4m4-4l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  trash: wrap(`<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  edit: wrap(`<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`),
  flame: wrap(`<path d="M12 2c1 4-4 5-4 9a4 4 0 0 0 8 0c0-1.6-1-2.4-1-2.4S17 10 17 14a5 5 0 0 1-10 0c0-5 3-6 3-9 0 0 1 1 2 3 0 0 0-3.5 0-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`),
  target: wrap(`<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="currentColor"/>`),
  shuffle: wrap(`<path d="M4 7h3.5L16 17h4M4 17h3.5L11 13M16 7h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  bookPlus: wrap(`<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v18H7.5A2.5 2.5 0 0 0 5 22.5V4.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 9h4M12 7v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  image: wrap(`<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.6" stroke="currentColor" stroke-width="2"/><path d="M21 16l-5.5-5.5L4 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
};

export function icon(name, extraClass = "") {
  return `<span class="ico ${extraClass}">${icons[name] || ""}</span>`;
}
