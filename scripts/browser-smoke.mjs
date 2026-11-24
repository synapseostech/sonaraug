// =============================================================================
// Browser smoke + responsive + basic accessibility check (no dependencies).
// =============================================================================
// Drives headless Chrome over the DevTools protocol using Node's built-in
// WebSocket. For every route x viewport (375, 768, 1440) it records horizontal
// overflow, unnamed controls, unlabelled form fields, sub-24px targets,
// duplicate ids, images without alt and console errors; then runs listener and
// studio journeys (radio/podcast/video play, favourite, search, recording).
//
//   pnpm --filter @kito/web build   # with NEXT_DIST_DIR=.next-build if `next dev` is running
//   NEXT_DIST_DIR=.next-build npx next start --port 3101   (in apps/web)
//   node scripts/browser-smoke.mjs http://127.0.0.1:3101 .tmp/browser-smoke
//
// Env: ROUTES='["/","/radio"]' to limit routes; SKIP_JOURNEYS=1; CHROME=path.
// Output: <outDir>/report.json and screenshots. Exit code is always 0: this is
// an evidence collector, not yet a pass/fail gate (see SONARA_TESTING_AND_ACCEPTANCE.md).
// =============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const OUT = process.argv[3] ?? ".tmp/browser-smoke";
mkdirSync(OUT, { recursive: true });
const PORT = 9333;
const chrome = spawn(process.env.CHROME ?? "google-chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--mute-audio",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0; const pending = new Map(); const events = [];
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
  else if (msg.method) events.push(msg);
});
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");

async function viewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
}
async function go(path) {
  events.length = 0;
  await send("Page.navigate", { url: BASE + path });
  for (let i = 0; i < 100; i++) { await sleep(100); if (events.some((e) => e.method === "Page.loadEventFired")) break; }
  await sleep(900); // hydration
}
function consoleErrors() {
  return events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") || (e.method === "Log.entryAdded" && e.params.entry.level === "error"))
    .map((e) => (e.params.exceptionDetails?.exception?.description ?? e.params.args?.map((a) => a.value ?? a.description).join(" ") ?? e.params.entry?.text ?? "").slice(0, 200));
}
async function shot(name) { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64")); }

const AUDIT = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.textContent || el.getAttribute('title') || el.querySelector('img[alt]')?.alt || '').trim();
  const overflowers = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return vis(el) && r.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('[class*=scroller],[class*=rail],[class*=carousel],[role=list],[style*=overflow]'); }).slice(0, 4).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
  const controls = [...document.querySelectorAll('button, a[href], [role=button]')].filter(vis);
  const unnamed = controls.filter((el) => !name(el)).map((el) => el.outerHTML.slice(0, 90));
  const inputs = [...document.querySelectorAll('input, select, textarea')].filter((el) => el.type !== 'hidden' && vis(el));
  const unlabelled = inputs.filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.title).map((el) => el.outerHTML.slice(0, 90));
  const small = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length;
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); const dupIds = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const imgsNoAlt = [...document.querySelectorAll('img:not([alt])')].length;
  const deadButtons = [...document.querySelectorAll('button')].filter((b) => vis(b) && !b.disabled && !b.type?.match(/submit|reset/) && !b.form && !Object.keys(b).some((k) => k.startsWith('__reactProps') && (b[k].onClick || b[k].onPointerDown || b[k].onMouseDown))).map((b) => name(b).slice(0, 40));
  const deadLinks = [...document.querySelectorAll('a')].filter((a) => vis(a) && (!a.getAttribute('href') || a.getAttribute('href') === '#')).map((a) => name(a).slice(0, 40));
  return { h1: document.querySelectorAll('h1').length, title: document.title, lang: document.documentElement.lang, scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, overflowers, unnamed: unnamed.slice(0, 5), unnamedCount: unnamed.length,
    unlabelled: unlabelled.slice(0, 5), smallTargets: small, smallList: controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).slice(0,6).map((el) => (name(el).slice(0,30) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height))), dupIds, imgsNoAlt, deadButtons: [...new Set(deadButtons)].slice(0, 12), deadLinks: deadLinks.slice(0, 6), audio: document.querySelectorAll('audio').length, video: document.querySelectorAll('video').length };
})()`;

const ROUTES = process.env.ROUTES ? JSON.parse(process.env.ROUTES) : ["/", "/radio", "/radio/beat-fm-96-3", "/podcasts", "/podcasts/the-kampala-business-show", "/watch/kampala-street-food-tour", "/watch", "/search?q=fm", "/library",
  "/studio", "/studio/episodes", "/studio/record", "/studio/video", "/studio/publishing", "/studio/broadcast", "/studio/live", "/studio/analytics", "/studio/settings",
  "/admin", "/admin/stations", "/admin/rights", "/admin/content", "/admin/reports"];
const VIEWPORTS = [["mobile", 375, 812, true], ["tablet", 768, 1024, true], ["desktop", 1440, 900, false]];
const report = { routes: {}, journeys: {} };
const SKIP_J = process.env.SKIP_JOURNEYS === "1";

for (const [vp, w, h, m] of VIEWPORTS) {
  await viewport(w, h, m);
  for (const r of ROUTES) {
    await go(r);
    const t0 = Date.now();
    const audit = await evaluate(AUDIT).catch((e) => ({ error: String(e) }));
    report.routes[`${vp} ${r}`] = { ...audit, consoleErrors: consoleErrors(), ms: Date.now() - t0 };
    if (["/", "/radio", "/studio", "/admin", "/studio/broadcast", "/radio/beat-fm-96-3"].includes(r)) await shot(`${vp}${r.replaceAll("/", "_") || "_home"}`);
  }
}

// ---- Journeys (desktop) ---------------------------------------------------
if (SKIP_J) { writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2)); chrome.kill(); process.exit(0); }
await viewport(1440, 900, false);
const J = report.journeys;
const clickByText = (sel, re) => `(() => { const el = [...document.querySelectorAll('${sel}')].find((e) => ${re}.test((e.getAttribute('aria-label')||'') + ' ' + e.textContent)); if (!el) return 'NOT FOUND'; el.click(); return (el.getAttribute('aria-label') || el.textContent).trim().slice(0,60); })()`;
const playerText = `(document.querySelector('.playerbar')?.innerText || '').replace(/\\s+/g,' ').slice(0,300)`;

await go("/radio/beat-fm-96-3");
J.radioPlay = { clicked: await evaluate(clickByText("button", "/^\\s*(play|listen)/i")) };
await sleep(2500);
J.radioPlay.player = await evaluate(playerText); J.radioPlay.audioEls = await evaluate(`document.querySelectorAll('audio').length`);
J.radioPlay.audioSrc = await evaluate(`[...document.querySelectorAll('audio')].map(a => a.currentSrc || a.src).join(',')`);
J.radioPlay.pageText = await evaluate(`document.querySelector('main').innerText.match(/(Not licensed[^\\n]*|licen[cs]e[^\\n]{0,120}|authoris[^\\n]{0,120})/i)?.[0] ?? ''`);

await go("/podcasts");
J.podcastPlay = { clicked: await evaluate(clickByText("button", "/play/i")) };
await sleep(3000);
J.podcastPlay.player = await evaluate(playerText); J.podcastPlay.audioEls = await evaluate(`document.querySelectorAll('audio').length`);
J.podcastPlay.audioSrc = await evaluate(`[...document.querySelectorAll('audio')].map(a => a.currentSrc || a.src || '(none)').join(',')`);
J.podcastPlay.progressKeys = await evaluate(`Object.keys(localStorage)`);

await go("/watch");
J.videoPlay = { clicked: await evaluate(clickByText("button", "/^\\s*play video/i")) };
await sleep(1500);
J.videoPlay.url = await evaluate(`location.pathname`);
J.videoPlay.videoEls = await evaluate(`document.querySelectorAll('video').length`);
J.videoPlay.player = await evaluate(playerText);
J.videoPlay.mediaSrc = await evaluate(`[...document.querySelectorAll('audio,video')].map(a => a.currentSrc || '(none)').join(',')`);

await go("/radio");
J.favourite = { clicked: await evaluate(clickByText("button", "/(favou?rite|save|follow|heart|add to library)/i")) };
await sleep(500);
J.favourite.storage = await evaluate(`Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k).length]))`);
await go("/library");
J.favourite.libraryText = await evaluate(`document.querySelector('main').innerText.slice(0,400).replace(/\\s+/g,' ')`);

await go("/search?q=capital");
J.search = { text: await evaluate(`document.querySelector('main').innerText.slice(0,300).replace(/\\s+/g,' ')`) };
await go("/search?q=zzzzqqq");
J.searchEmpty = { text: await evaluate(`document.querySelector('main').innerText.slice(0,300).replace(/\\s+/g,' ')`) };

await go("/studio/record");
J.record = { start: await evaluate(clickByText("button", "/(start|record)/i")) };
await sleep(3500);
J.record.mid = await evaluate(`document.querySelector('main').innerText.match(/\\d+:\\d{2}/g)?.slice(0,3)`);
J.record.stop = await evaluate(clickByText("button", "/stop/i"));
await sleep(1500);
J.record.after = await evaluate(`({ audio: [...document.querySelectorAll('audio')].map(a => (a.src||'').slice(0,30)), text: document.querySelector('main').innerText.match(/(Take ready[^\\n]*|Preview the take[^\\n]*|error[^\\n]*|denied[^\\n]*)/gi) })`);
J.record.consoleErrors = consoleErrors();

await go("/studio");
J.roleSwitch = await evaluate(`(() => { const s = document.querySelector('select[aria-label="Simulated role"]'); if (!s) return 'no role select'; return [...s.options].map(o => o.value).join(','); })()`);

// keyboard: first tab stop
await go("/");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
J.firstTabStop = await evaluate(`document.activeElement?.outerHTML.slice(0,100)`);

// unknown slug
await go("/radio/not-a-station");
J.unknownSlug = await evaluate(`document.querySelector('main').innerText.slice(0,120).replace(/\\s+/g,' ')`);

// perf: navigation timing for home
await go("/");
J.homeTiming = await evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint'); return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(p.find(x => x.name==='first-contentful-paint')?.startTime ?? -1), transferKB: Math.round(performance.getEntriesByType('resource').reduce((t, r) => t + (r.transferSize||0), 0)/1024) }; })()`);

writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.journeys, null, 2));
ws.close(); chrome.kill();
process.exit(0);
