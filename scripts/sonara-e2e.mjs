// =============================================================================
// Sonara end-to-end acceptance journeys (no dependencies).
// =============================================================================
// Drives headless Chrome over the DevTools protocol, one isolated browser
// context per person, through the real UI and server actions:
// registration → verification → free/premium access → checkout through the
// local Flutterwave simulator (success, duplicate webhook, mismatch) →
// cancellation → admin bootstrap → Medical Chronicles editorial workflow with
// two different people → privilege-escalation and access-denial checks.
//
// Prerequisites (see docs/SONARA_ACCEPTANCE_TESTS.md):
//   - a production build served with SONARA_ALLOW_DEV_BACKEND=1, a throwaway
//     SONARA_DATA_DIR and SONARA_APP_URL matching the base URL;
//   - the sample series seeded into that data dir (pnpm sonara:dev seed-sample).
//
//   node scripts/sonara-e2e.mjs http://127.0.0.1:3110 <data-dir>
//
// Exit code 1 if any check fails. Uses only fictitious @example.test accounts.
// =============================================================================
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://127.0.0.1:3110";
const DATA_DIR = process.argv[3];
if (!DATA_DIR) {
  console.error("usage: node scripts/sonara-e2e.mjs <base-url> <sonara-data-dir>");
  process.exit(2);
}
const OUT = join(DATA_DIR, "..", "e2e");
rmSync(join(OUT, "profile"), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const PORT = 9344;
const RUN = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(process.env.CHROME ?? "google-chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank",
], { stdio: "ignore" });

let browserWs;
for (let i = 0; i < 60 && !browserWs; i++) {
  await sleep(200);
  try { browserWs = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(browserWs);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 1;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else {
    for (const l of listeners) l(msg);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function newPerson(label) {
  const { browserContextId } = await send("Target.createBrowserContext", { disposeOnDetach: true });
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Log.enable", {}, sessionId);
  const errors = [];
  const cspViolations = [];
  listeners.push((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails?.exception?.description ?? "exception");
    // A CSP violation arrives as a Log entry ("Refused to …") or an error-level console line.
    const text = msg.method === "Log.entryAdded"
      ? (msg.params.entry.text ?? "")
      : msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error"
        ? (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ")
        : "";
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(text)) cspViolations.push(text);
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`${label}: evaluate failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const p = {
    label,
    errors,
    cspViolations,
    evaluate,
    async goto(path) {
      await send("Page.navigate", { url: path.startsWith("http") ? path : `${BASE}${path}` }, sessionId);
      await p.waitFor("document.readyState === 'complete'", 15000);
      await sleep(400); // hydration
    },
    url: () => evaluate("location.href"),
    text: () => evaluate("document.body.innerText"),
    async waitFor(expression, timeout = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try { if (await evaluate(`Boolean(${expression})`)) return true; } catch {}
        await sleep(150);
      }
      throw new Error(`${label}: timed out waiting for ${expression} (at ${await evaluate("location.href").catch(() => "?")})`);
    },
    async waitText(fragment, timeout) {
      return p.waitFor(`document.body.innerText.includes(${JSON.stringify(fragment)})`, timeout);
    },
    async fill(fields, scope = "document") {
      await evaluate(`(() => {
        const root = ${scope};
        for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
          const els = [...root.querySelectorAll('input[name="' + name + '"], textarea[name="' + name + '"], select[name="' + name + '"]')];
          if (!els.length) throw new Error('no field ' + name);
          for (const el of els) {
            if (el.type === 'checkbox') { el.checked = Boolean(value); continue; }
            if (el.type === 'radio') { el.checked = el.value === value; if (el.checked) el.dispatchEvent(new Event('click', { bubbles: true })); continue; }
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      })()`);
    },
    /** Clicks the first visible button or link whose text contains `text` (optionally inside a form containing `within`). */
    async click(text, within) {
      const ok = await evaluate(`(() => {
        const forms = ${within ? `[...document.querySelectorAll('form')].filter((f) => f.innerText.includes(${JSON.stringify(within)}) || f.getAttribute('aria-label') === ${JSON.stringify(within)})` : "[document]"};
        // Buttons win over links with the same words (e.g. the top bar's "Sign in" link vs the form's button).
        for (const selector of ['button', 'a, summary']) {
          for (const root of forms) {
            const el = [...root.querySelectorAll(selector)].find((b) => b.innerText.trim().includes(${JSON.stringify(text)}) && !b.disabled);
            if (el) { el.click(); return true; }
          }
        }
        return false;
      })()`);
      if (!ok) throw new Error(`${label}: no clickable "${text}"${within ? ` in form "${within}"` : ""} at ${await p.url()}`);
      await sleep(300);
    },
    /** fetch() from inside the page, with the person's cookies and origin. */
    api: (path, init = {}) => evaluate(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init)}).then(async (r) => ({ status: r.status, body: await r.text() }))`),
    async screenshot(name) {
      const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
    },
  };
  return p;
}

const results = [];
async function check(id, title, fn) {
  try {
    await fn();
    results.push({ id, title, ok: true });
    console.log(`  ✔ ${id} ${title}`);
  } catch (error) {
    results.push({ id, title, ok: false, error: String(error?.message ?? error) });
    console.log(`  ✖ ${id} ${title}\n      ${String(error?.message ?? error).split("\n")[0]}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const devCli = (...args) =>
  execFileSync("node", ["--experimental-strip-types", "--no-warnings", "scripts/sonara-dev.ts", ...args], {
    cwd: fileURLToPath(new URL("../apps/web/", import.meta.url)),
    env: { ...process.env, SONARA_DATA_DIR: DATA_DIR, NODE_ENV: "development" },
    encoding: "utf8",
  });

const PASSWORD = "correct horse battery 42";
const email = (who) => `${who}-${RUN}@example.test`;

async function register(p, who, name) {
  await p.goto("/auth/register");
  await p.fill({ displayName: name, email: email(who), password: PASSWORD, acceptTerms: true });
  await p.click("Create free account");
  await p.waitFor("location.pathname === '/auth/verify-email'");
}

async function verifyFromOutbox(p, who) {
  await p.goto("/dev/outbox");
  const link = await p.evaluate(`[...document.querySelectorAll('article')].find((a) => a.innerText.includes(${JSON.stringify(email(who))}) && a.innerText.includes('verify-email?token='))?.querySelector('a[href*="verify-email?token="]')?.href`);
  assert(link, `no verification email for ${who}`);
  await p.goto(link);
  await p.click("Confirm my email address");
  await p.waitText("Your email is verified");
}

async function episodeIdOn(p, slug) {
  await p.goto(`/medical-chronicles/${slug}`);
  return p.evaluate("document.querySelector('[data-episode-id]')?.dataset.episodeId");
}

async function playback(p, episodeId) {
  const r = await p.api(`/api/chronicles/episodes/${episodeId}/playback`, { method: "POST" });
  return { status: r.status, json: JSON.parse(r.body || "{}") };
}

async function checkout(p, outcome, opts = {}) {
  await p.goto("/subscribe/checkout?plan=plan_listener_monthly_dev");
  await p.fill({ acceptTerms: true });
  await p.click("Continue to secure payment");
  await p.waitFor("location.pathname === '/dev/flutterwave-sim/pay'", 20000);
  await p.fill({ outcome, method: opts.method ?? "mobilemoneyuganda", duplicate: Boolean(opts.duplicate) });
  await p.click("Complete simulated payment");
  await p.waitFor("location.pathname.startsWith('/subscribe/success') || location.pathname.startsWith('/subscribe/failed')", 30000);
  return p.url();
}

console.log(`Sonara e2e against ${BASE} (run ${RUN})`);
// A stand-in for Groq's chat completions API (the server is started with
// SONARA_GROQ_ENDPOINT pointing here). Canned, deterministic replies.
const NOTES = "# Intestinal obstruction\n\n## Causes\n- Adhesions are the commonest cause in adults.\n- Hernias and malignancy follow.\n\n## Red flags\nStrangulation is suggested by constant pain, fever, tachycardia and peritonism. It needs urgent surgery.\n\n## Management\nDrip and suck: IV fluids and nasogastric decompression, then treat the cause.";
let tutorEpisodePath = "";
const groqStub = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const prompt = JSON.parse(raw || "{}").messages?.at(-1)?.content ?? "";
    const n = Number(/Write (\d+) multiple-choice/.exec(prompt)?.[1] ?? 0);
    const content = n
      ? { questions: Array.from({ length: n }, (_, i) => ({ question: i === 0 ? "[Stub] Commonest cause of adult small-bowel obstruction?" : `[Stub] Question ${i + 1}?`, options: ["Hernia", "Adhesions", "Volvulus", "Malignancy"], answer: 1, explanation: "Adhesions, per the notes." })) }
      : prompt.includes("<answer>")
        ? { verdict: "partial", feedback: "[Stub] Good start; mention fever and peritonism.", modelAnswer: "Constant pain, fever, tachycardia and peritonism." }
        : { question: "[Stub] Which features suggest strangulation?" };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
  });
}).listen(9355, "127.0.0.1");
process.on("exit", () => groqStub.close());

const visitor = await newPerson("visitor");
const l1 = await newPerson("listener1");
const l2 = await newPerson("listener2");
const admin = await newPerson("admin");
const reviewer = await newPerson("reviewer");
let ep1, ep3, ep3Url;

console.log("Security headers");
await check("SEC-HDR", "security headers are present and the production CSP blocks nothing it needs", async () => {
  const response = await fetch(`${BASE}/medical-chronicles`);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert(response.headers.get("x-frame-options") === "DENY", "X-Frame-Options is not DENY");
  assert(response.headers.get("x-content-type-options") === "nosniff", "nosniff missing");
  assert(response.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "referrer policy missing");
  assert(/'nonce-[A-Za-z0-9+/=]+'/.test(csp), `CSP has no nonce: ${csp}`);
  assert(/'strict-dynamic'/.test(csp.split("script-src")[1]?.split(";")[0] ?? ""), "production script-src lacks strict-dynamic");
  assert(!/'unsafe-inline'/.test(csp.split("script-src")[1]?.split(";")[0] ?? ""), "production script-src allows unsafe-inline");
  assert(/'unsafe-eval'/.test(csp) === false, "production CSP allows eval");
  assert(csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'"), "CSP is missing object/frame guards");
  assert(!response.headers.get("strict-transport-security"), "HSTS was sent over plain HTTP");
  await visitor.goto("/medical-chronicles");
  await visitor.goto("/radio");
  await visitor.goto("/admin");
  assert(visitor.cspViolations.length === 0, `CSP violations: ${visitor.cspViolations.join(" | ")}`);
});

console.log("Listener");
await check("L-1", "a visitor can register", async () => {
  await register(l1, "l1", "Listener One");
  assert((await l1.text()).includes("Check your inbox"), "no confirmation screen");
});
await check("L-2", "a visitor can verify their account through the emailed link", async () => {
  await verifyFromOutbox(l1, "l1");
});
await check("L-3", "a listener can sign out and sign in", async () => {
  await l1.goto("/account");
  await l1.click("Sign out");
  await l1.waitFor("location.pathname === '/'");
  await l1.goto("/auth/login?next=/account");
  await l1.fill({ email: email("l1"), password: "wrong password!!" });
  await l1.click("Sign in");
  await l1.waitText("Email or password is incorrect");
  await l1.fill({ email: email("l1"), password: PASSWORD });
  await l1.click("Sign in");
  await l1.waitFor("location.pathname === '/auth/complete-profile' || location.pathname === '/account'");
  if ((await l1.url()).includes("complete-profile")) {
    await l1.click("Save and continue");
    await l1.waitFor("!location.pathname.startsWith('/auth/')");
  }
});
await check("L-4", "the first two episodes of a series are free, even to visitors", async () => {
  ep1 = await episodeIdOn(visitor, "sample-test-tone-1");
  const ep2 = await episodeIdOn(visitor, "sample-test-tone-2");
  assert(ep1 && ep2, "sample episodes not found — seed-sample first");
  const a = await playback(visitor, ep1);
  const b = await playback(visitor, ep2);
  assert(a.status === 200 && a.json.mode === "sonara", `ep1 ${a.status}`);
  assert(b.status === 200, `ep2 ${b.status}`);
  const audio = await visitor.api(a.json.url, { headers: { Range: "bytes=0-15" } });
  assert(audio.status === 206, `media range request returned ${audio.status}`);
});
await check("L-5", "the third episode is locked without entitlement (UI and API)", async () => {
  ep3 = await episodeIdOn(l1, "sample-test-tone-3");
  assert((await l1.text()).includes("Premium episode"), "no paywall shown");
  const r = await playback(l1, ep3);
  assert(r.status === 403 && r.json.reason === "subscription_required", `got ${r.status} ${r.json.reason}`);
  const v = await playback(visitor, ep3);
  assert(v.status === 401, `visitor got ${v.status}`);
  const a = await playback(l1, ep1);
  const swapped = a.json.url.replace(/e=[^&]+/, `e=${ep3}`);
  const m = await l1.api(swapped);
  assert(m.status === 403, `URL manipulation returned ${m.status}`);
});
await check("P-2", "a verified successful payment activates the correct entitlement", async () => {
  const url = await checkout(l1, "successful", { duplicate: true });
  assert(url.includes("/subscribe/success"), `landed on ${url}`);
  await l1.waitText("You are subscribed");
  const r = await playback(l1, ep3);
  assert(r.status === 200, `premium playback ${r.status}`);
  ep3Url = r.json.url;
});
await check("L-6", "an entitled listener can play premium audio in the Sonara player", async () => {
  await l1.goto("/medical-chronicles/sample-test-tone-3");
  await l1.click("Play episode");
  await l1.waitFor("document.querySelector('[data-testid=live-audio]') && !document.querySelector('[data-testid=live-audio]').paused && document.querySelector('[data-testid=live-audio]').currentTime > 0.3", 15000);
  const src = await l1.evaluate("document.querySelector('[data-testid=live-audio]').src");
  assert(src.includes("/api/media/"), `audio src ${src}`);
  await l1.screenshot("l1-premium-playing");
});
await check("P-4", "a duplicate webhook does not create a duplicate subscription", async () => {
  await l1.goto("/account/subscriptions");
  const text = await l1.text();
  const count = (text.match(/Listener — monthly/g) ?? []).length;
  assert(count === 1, `expected one subscription panel, saw ${count}`);
  await l1.goto("/account/payment-history");
  assert((await l1.text()).includes("successful"), "payment not listed");
});
await check("P-1/P-3/P-6", "pending, failed and mismatched payments grant nothing", async () => {
  await register(l2, "l2", "Listener Two");
  await verifyFromOutbox(l2, "l2");
  const failedUrl = await checkout(l2, "failed");
  assert(failedUrl.includes("/subscribe/failed"), `failed → ${failedUrl}`);
  assert((await playback(l2, ep3)).status === 403, "failed payment granted access");
  const mismatchUrl = await checkout(l2, "underpaid");
  assert(mismatchUrl.includes("/subscribe/failed"), `underpaid → ${mismatchUrl}`);
  await l2.waitText("did not match");
  const currency = await checkout(l2, "wrong_currency");
  assert(currency.includes("/subscribe/failed"), `wrong currency → ${currency}`);
  assert((await playback(l2, ep3)).status === 403, "mismatched payment granted access");
  const media = await l2.api(ep3Url);
  assert(media.status === 403, `shared premium media URL returned ${media.status}`);
});
await check("L-9", "a listener cannot access another user's private data", async () => {
  const exp = JSON.parse((await l2.api("/api/account/export")).body);
  assert(exp.profile.email === email("l2"), "export is not the caller's");
  assert(!JSON.stringify(exp).includes(email("l1")), "export leaks another user");
  await l2.goto("/admin/users");
  assert((await l2.text()).includes("The admin console is for Sonara staff"), "non-staff saw admin");
});
await check("L-8/P-7", "a listener can view and cancel their subscription; access continues to period end", async () => {
  await l1.goto("/account/subscriptions");
  await l1.evaluate("window.confirm = () => true");
  await l1.click("Cancel subscription");
  await l1.waitText("will not renew");
  assert((await playback(l1, ep3)).status === 200, "access ended immediately");
  await l1.goto("/account/subscriptions");
  assert((await l1.text()).includes("Ends at period end"), "state not shown");
});
await check("SEC", "password reset link works once and signs out other sessions", async () => {
  await visitor.goto("/auth/forgot-password");
  await visitor.fill({ email: email("l2") });
  await visitor.click("Send reset link");
  await visitor.waitText("If an account exists");
  await visitor.goto("/dev/outbox");
  const link = await visitor.evaluate(`[...document.querySelectorAll('article')].find((a) => a.innerText.includes(${JSON.stringify(email("l2"))}) && a.innerText.includes('reset-password?token='))?.querySelector('a[href*="reset-password?token="]')?.href`);
  assert(link, "no reset email");
  await visitor.goto(link);
  await visitor.fill({ password: `${PASSWORD} new`, confirm: `${PASSWORD} new` });
  await visitor.click("Set new password");
  await visitor.waitFor("location.pathname === '/auth/login'");
  await visitor.goto(link);
  await visitor.fill({ password: `${PASSWORD} again`, confirm: `${PASSWORD} again` });
  await visitor.click("Set new password");
  await visitor.waitText("invalid or has expired");
  await l2.goto("/account");
  assert((await l2.url()).includes("/auth/login"), "old session still valid after reset");
});

console.log("Admin and Medical Chronicles");
await check("A-boot", "an owner can bootstrap the first super administrator", async () => {
  await register(admin, "admin", "Ada Admin");
  await verifyFromOutbox(admin, "admin");
  devCli("grant", email("admin"), "super_admin");
  await admin.goto("/admin");
  await admin.waitText("Platform overview");
});
await check("A-5", "an administrator cannot change their own roles", async () => {
  await register(reviewer, "rev", "Rita Reviewer");
  await admin.goto("/admin/users?q=" + encodeURIComponent(email("admin")));
  await admin.click("Ada Admin");
  await admin.waitFor("location.pathname.startsWith('/admin/users/usr_')");
  assert((await admin.text()).includes("You cannot change your own roles"), "self role form shown");
});
await check("A-roles", "a super administrator grants the reviewer role to another person (audited)", async () => {
  await admin.goto("/admin/users?q=" + encodeURIComponent(email("rev")));
  await admin.click("Rita Reviewer");
  await admin.waitFor("location.pathname.startsWith('/admin/users/usr_')");
  await admin.fill({ role: "medical_reviewer", change: "grant", reason: "Clinical reviewer for Medical Chronicles" }, "document.querySelector('form[aria-label=\"Change role\"]')");
  await admin.click("Apply", "Change role");
  await admin.waitText("Role medical_reviewer granted");
});
let newEpisodePath;
await check("MC-1", "an admin can create a series", async () => {
  await admin.goto("/admin/medical-chronicles/series/new");
  await admin.fill({ title: `Renal physiology ${RUN}`, description: "How the kidney filters, reabsorbs and secretes.", hostDisplay: "NotebookLM Audio Overview (AI voices)", freeEpisodeAllowance: "1" });
  await admin.click("Create series");
  await admin.waitFor("location.pathname.startsWith('/admin/medical-chronicles/series/ser_')");
  await admin.waitText("Series created as a draft");
});
await check("MC-2/MC-3", "invalid links are rejected; a NotebookLM link is accepted", async () => {
  await admin.click("Add episode");
  await admin.waitFor("location.pathname === '/admin/medical-chronicles/episodes/new'");
  await admin.fill({ title: `Glomerular filtration ${RUN}`, description: "GFR, autoregulation and clinical estimation.", references: "Guyton and Hall Textbook of Medical Physiology, ch. 27 | | 14th ed." });
  await admin.click("Create draft episode");
  await admin.waitFor("location.pathname.startsWith('/admin/medical-chronicles/episodes/epi_')");
  newEpisodePath = new URL(await admin.url()).pathname;
  for (const bad of ["https://notebooklm.google.com.evil.example/notebook/abcdef123", "javascript:alert(1)", "http://notebooklm.google.com/notebook/abcdef123"]) {
    await admin.evaluate(`document.querySelector("form[aria-label='Audio source'] input[name=kind][value=notebooklm_link]").click()`);
    await admin.waitFor(`document.querySelector("form[aria-label='Audio source'] input[name=url]")`);
    await admin.fill({ url: bad }, "document.querySelector('form[aria-label=\"Audio source\"]')");
    await admin.click("Save audio source", "Audio source");
    await admin.waitFor("document.querySelector('form[aria-label=\"Audio source\"] [role=alert]')");
  }
  await admin.goto(newEpisodePath);
  await admin.evaluate(`document.querySelector("form[aria-label='Audio source'] input[name=kind][value=notebooklm_link]").click()`);
  await admin.waitFor(`document.querySelector("form[aria-label='Audio source'] input[name=url]")`);
  await admin.fill({ url: "https://notebooklm.google.com/notebook/0a1b2c3d-sample?authuser=2" }, "document.querySelector('form[aria-label=\"Audio source\"]')");
  await admin.click("Save audio source", "Audio source");
  await admin.waitText("Audio source saved");
  await admin.goto(newEpisodePath);
  const text = await admin.text();
  assert(text.includes("https://notebooklm.google.com/notebook/0a1b2c3d-sample") && !text.includes("authuser"), "link not normalised");
});
await check("MC-S1", "an editor imports NotebookLM flashcards and a quiz; malformed items are refused", async () => {
  await admin.goto(newEpisodePath);
  const form = "document.querySelector('form[aria-label=\"Study materials\"]')";
  await admin.fill({ flashcards: "Q: Commonest cause of adult SBO?\nA: Adhesions\n\nQ: Coffee-bean sign?\nA: Sigmoid volvulus", quiz: "1. Sign of strangulation?\nA) Colic\nB) Constant pain\n" }, form);
  await admin.waitText("need attention");
  assert(await admin.evaluate(`[...${form}.querySelectorAll('button')].find((b) => b.innerText.includes('Save study materials')).disabled`), "save allowed with a broken question");
  await admin.fill({ quiz: "1. Sign of strangulation?\nA) Colic\nB) Constant pain\nAnswer: B\nExplanation: Ischaemia causes continuous pain." }, form);
  await admin.click("Save study materials", "Study materials");
  await admin.waitText("Saved 2 flashcards and 1 quiz question");
});
await check("MC-S3", "an editor loads Markdown notes and drafts a quiz from them with the AI tutor", async () => {
  await admin.goto(newEpisodePath);
  const form = "document.querySelector('form[aria-label=\"Study materials\"]')";
  await admin.fill({ notes: NOTES }, form);
  await admin.click("Draft quiz from notes with Groq", "Study materials");
  await admin.waitText("drafted question");
  assert(String(await admin.evaluate("document.querySelector('textarea[name=quiz]').value")).includes("[Stub] Commonest cause"), "drafted question not added to the quiz box");
  // Discard the draft (an editor reviews before saving); keep only the notes.
  await admin.goto(newEpisodePath);
  await admin.fill({ notes: NOTES }, form);
  await admin.click("Save study materials", "Study materials");
  await admin.waitText("characters of notes");
});
await check("MC-9a", "an unapproved episode is not publicly available", async () => {
  const slug = await admin.evaluate("[...document.querySelectorAll('a')].find((a) => a.innerText.trim() === 'Preview page')?.getAttribute('href')");
  assert(/^\/medical-chronicles\/[a-z0-9-]+$/.test(slug ?? ""), `unexpected episode address ${slug}`);
  const r = await visitor.api(slug);
  assert(r.status === 404, `draft page returned ${r.status} to the public`);
});
await check("C-6", "the editor who submitted cannot approve; another reviewer approves and publishes", async () => {
  await admin.goto(newEpisodePath);
  await admin.click("Submit for review");
  await admin.waitText("Submitted for review");
  await admin.goto(newEpisodePath);
  const text = await admin.text();
  assert(text.includes("another reviewer must approve"), "self-approval guidance missing");
  assert(!(await admin.evaluate("[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Approve')")), "approve offered to submitter");
  // The reviewer has been signed in since registering; the role was granted afterwards and applies per request.
  await reviewer.goto(newEpisodePath);
  await reviewer.click("Approve");
  await reviewer.waitText("Approved.");
  await reviewer.goto(newEpisodePath);
  await reviewer.click("Publish", "Publish");
  await reviewer.waitText("Published. It is now live");
});
await check("MC-8", "the series is published and the episode links out to NotebookLM (provider-controlled)", async () => {
  await reviewer.goto(newEpisodePath);
  const seriesHref = await reviewer.evaluate("document.querySelector('a[href^=\"/admin/medical-chronicles/series/\"]').getAttribute('href')");
  await reviewer.goto(seriesHref);
  await reviewer.click("Publish series");
  await reviewer.waitText("Series published");
  const slug = await reviewer.evaluate("document.querySelector('a[href^=\"/medical-chronicles/series/\"]').getAttribute('href')");
  await visitor.goto(slug);
  await visitor.click(`Glomerular filtration ${RUN}`);
  await visitor.waitText("Listen on NotebookLM");
  const text = await visitor.text();
  assert(text.includes("Provider-controlled playback") && text.includes("AI-generated audio"), "honesty labels missing");
  assert(!(await visitor.evaluate("!!document.querySelector('iframe')")), "an iframe was rendered");
  await visitor.screenshot("visitor-notebooklm-episode");
});
await check("MC-S2", "a listener flips flashcards and answers the quiz inside Sonara", async () => {
  await visitor.waitText("Revise this episode");
  await visitor.click("Reveal answer");
  await visitor.waitText("Adhesions");
  await visitor.click("I knew it");
  await visitor.waitText("1 of 2 known");
  await visitor.click("Quiz · 1");
  await visitor.waitText("Sign of strangulation?");
  await visitor.evaluate(`[...document.querySelectorAll('.mc-option')].find((l) => l.innerText.includes('Constant pain')).querySelector('input').click()`);
  await visitor.click("Check answer");
  await visitor.waitText("Correct.");
  await visitor.waitText("Ischaemia causes continuous pain.");
  await visitor.click("See my score");
  await visitor.waitText("Perfect score.");
  await visitor.screenshot("visitor-study-studio");
});
await check("MC-S4", "notes and the AI tutor are locked to non-subscribers, even on a free episode (UI and API)", async () => {
  const path = new URL(await visitor.url()).pathname;
  tutorEpisodePath = path;
  await visitor.goto(path);
  await visitor.click("Notes 🔒");
  await visitor.waitText("are for Sonara subscribers");
  assert(!(await visitor.text()).includes("Strangulation is suggested"), "notes text reached a visitor");
  const episodeId = await visitor.evaluate("document.querySelector('[data-episode-id]')?.getAttribute('data-episode-id')");
  const anon = await visitor.api(`/api/chronicles/episodes/${episodeId}/tutor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "quiz" }) });
  assert(anon.status === 401, `visitor tutor call returned ${anon.status}`);
  // listener2 never subscribed; the SEC journey reset their password and signed them out.
  await l2.goto("/auth/login");
  await l2.fill({ email: email("l2"), password: `${PASSWORD} new` });
  await l2.click("Sign in");
  await l2.waitFor("location.pathname !== '/auth/login'");
  const free = await l2.api(`/api/chronicles/episodes/${episodeId}/tutor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "quiz" }) });
  assert(free.status === 403 && free.body.includes("subscription"), `non-subscriber tutor call returned ${free.status} ${free.body}`);
});
await check("MC-S5", "a subscriber reads the notes and is quizzed and examined by the AI tutor", async () => {
  await l1.goto(tutorEpisodePath);
  await l1.click("Notes");
  await l1.waitText("Strangulation is suggested");
  await l1.click("AI tutor");
  await l1.click("Quiz me · 5 questions");
  await l1.waitText("[Stub] Commonest cause of adult small-bowel obstruction?");
  await l1.evaluate(`[...document.querySelectorAll('.mc-option')].find((l) => l.innerText.includes('Adhesions')).querySelector('input').click()`);
  await l1.click("Check answer");
  await l1.waitText("Correct.");
  await l1.click("Viva (written answers)");
  await l1.click("Ask me a viva question");
  await l1.waitText("[Stub] Which features suggest strangulation?");
  await l1.fill({ answer: "Constant pain and tachycardia." });
  await l1.click("Mark my answer");
  await l1.waitText("Model answer:");
  await l1.screenshot("subscriber-ai-tutor");
});
await check("MC-7", "an unavailable external source shows an unavailable state", async () => {
  await reviewer.goto(newEpisodePath);
  await reviewer.fill({ status: "unavailable", note: "The NotebookLM share was turned off" }, "document.querySelector('form[aria-label=\"Source availability\"]')");
  await reviewer.click("Update availability", "Source availability");
  await reviewer.waitText("unavailable notice");
  const slug = await reviewer.evaluate("document.querySelector('a[href^=\"/medical-chronicles/\"]:not([href*=\"/series/\"])')?.getAttribute('href')");
  await visitor.goto(slug);
  await visitor.waitText("Audio unavailable");
  assert(!(await visitor.text()).includes("Listen on NotebookLM"), "link still offered");
});
await check("A-6", "administrative changes generate audit events and the chain verifies", async () => {
  await admin.goto("/admin/audit-logs");
  const text = await admin.text();
  for (const action of ["role.grant", "mc.series.created", "mc.episode.approved", "mc.episode.published", "payment.verified.successful", "payment.verified.mismatch"]) {
    assert(text.includes(action), `missing audit action ${action}`);
  }
  assert(text.includes("hash chain intact"), "audit chain not verified");
});
await check("P-5/P-8", "forged webhooks are rejected and reconciliation lists the mismatch", async () => {
  await admin.goto("/admin/payments");
  await admin.click("Send a forged webhook (test)");
  await admin.waitText("Forged webhook was rejected with HTTP 401");
  await admin.goto("/admin/payments");
  const text = await admin.text();
  assert(text.includes("amount or currency mismatch"), "reconciliation did not flag the mismatch");
  assert(text.includes("rejected"), "rejected delivery not logged");
  const redelivered = await admin.evaluate(`(() => {
    const table = [...document.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent === 'Webhook deliveries');
    return [...(table?.querySelectorAll('tbody tr') ?? [])].some((row) => row.cells[2]?.innerText.includes('valid') && row.cells[4]?.innerText.trim() === '2' && row.cells[3]?.innerText.includes('processed'));
  })()`);
  assert(redelivered, "no processed delivery recorded with 2 deliveries (duplicate)");
});
await check("A-1", "an authorised admin can manage plans", async () => {
  await admin.goto("/admin/subscriptions?edit=plan_listener_annual_dev");
  await admin.fill({ amount: "95000", features: "Everything in monthly\nOne payment a year\nTest edit" }, "document.querySelector('form[aria-label^=\"Edit \"]')");
  await admin.click("Save plan");
  await admin.waitText("saved");
});
await check("A-4", "an ordinary user cannot reach administrative routes or actions", async () => {
  for (const path of ["/admin", "/admin/payments", "/admin/medical-chronicles"]) {
    await l1.goto(path);
    assert((await l1.text()).includes("The admin console is for Sonara staff"), `${path} not denied`);
  }
  const upload = await l1.api("/api/admin/media/upload", { method: "POST", body: null });
  assert(upload.status === 403, `upload returned ${upload.status}`);
});

const errors = [visitor, l1, l2, admin, reviewer].flatMap((p) => p.errors.map((e) => `${p.label}: ${e.split("\n")[0]}`));
await check("JS", "no uncaught page exceptions", async () => assert(errors.length === 0, errors.join(" | ")));

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, run: RUN, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Report: ${join(OUT, "report.json")}`);
chrome.kill();
process.exit(failed.length ? 1 : 0);
