// nav.js — thin indirection layer. main.js registers the real router
// here at startup; views import {goTo, openDrawer} from this module
// instead of importing main.js directly, which would create a cycle
// (main.js -> views/*.js -> main.js).

let _goTo = (route, params) => console.warn("router not ready", route, params);
let _setDrawer = () => {};

export function registerRouter(fn) { _goTo = fn; }
export function registerDrawer(fn) { _setDrawer = fn; }

export function goTo(route, params = {}) { _goTo(route, params); }
export function setDrawer(open) { _setDrawer(open); }
