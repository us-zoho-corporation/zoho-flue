// Full browser E2E of the chat, driven from an authenticated *empty state*.
//
// The seam: GET /api/auth/dev-login (enabled only when ENV=local|CI) mints a real
// session for a fake user with no chats — so we can exercise the whole signed-in
// flow without Zoho OAuth. This driver walks: empty-state login → send/response →
// switch conversations mid-run and back → stop a run → sign out (chats cleared).
//
// Self-contained: launches its own headless Chromium, prints PASS/FAIL per check,
// and hard-exits with a non-zero code on any failure (a live SSE connection can
// otherwise keep the process from exiting, so we force it).

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const HARD_TIMEOUT_MS = Number(process.env.E2E_HARD_TIMEOUT_MS || 180_000);
// A short, cheap, roughly-deterministic turn for the real model.
const PROMPT = 'Reply with exactly the single word: pong';

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// Force-exit guard: never hang on a live SSE stream.
const guard = setTimeout(() => {
  console.error(`\n[e2e] hard timeout after ${HARD_TIMEOUT_MS}ms — forcing exit`);
  process.exit(1);
}, HARD_TIMEOUT_MS);
guard.unref?.();

const finish = (code) => {
  console.log(`\n[e2e] ${failures} failure(s) of ${results.length} checks`);
  process.exit(code);
};

const browser = await chromium.launch({ headless: true });
try {
  // Fresh context = empty localStorage, so we truly start from a clean slate.
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  // 1) Dev-login: the proxied redirect sets the session cookie, then lands on /.
  await page.goto(`${BASE}/api/auth/dev-login?returnTo=/`, { waitUntil: 'networkidle' });

  // 2) Authenticated empty state: welcome prompt + the fake user, no real chats yet.
  await page.waitForSelector('.welcome h1', { timeout: 20_000 }).catch(() => {});
  const welcomeText = await page.locator('.welcome h1').innerText().catch(() => '');
  check('authenticated empty state (welcome shown)', /what can i help/i.test(welcomeText), welcomeText);
  const email = await page.locator('.sb-user-sub').first().innerText().catch(() => '');
  check('signed in as the fake dev user', email.includes('dev@example.com'), email);
  const loginVisible = await page.locator('text=Welcome to Zoho AI').count();
  check('login screen is NOT shown', loginVisible === 0);

  // 3) Send a prompt and assert an assistant response renders.
  const composer = page.locator('textarea[placeholder="Ask anything about your Zoho workspace"]');
  await composer.click();
  await composer.fill(PROMPT);
  await page.locator('button[aria-label="Send"]').click();
  await page.waitForSelector('.msg-user-bubble', { timeout: 10_000 }).catch(() => {});
  // Assistant text lands in .msg-assistant-content .answer once the turn produces output.
  const answered = await page
    .waitForSelector('.msg-assistant-content .answer', { timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  check('assistant response renders', answered);
  const noError = (await page.locator('.msg-assistant-content .kumo-banner, [class*="banner"]').count()) === 0;
  check('no error banner after response', noError);

  // 4) Switch to a new chat mid-flow, then back — the response must persist.
  const firstTitle = PROMPT.slice(0, 20);
  await page.locator('.sb-newchat').click();
  await page.waitForSelector('.welcome h1', { timeout: 10_000 }).catch(() => {});
  const onNewEmpty = (await page.locator('.msg-user-bubble').count()) === 0;
  check('new chat opens its own empty thread', onNewEmpty);
  // Click the first conversation in the recents list to return to it.
  await page.locator('.sidebar-recents .sb-item').last().click();
  const persisted = await page
    .waitForSelector('.msg-assistant-content .answer', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check('response persisted after switching away and back', persisted);

  // 5) Stop button aborts a running turn (composer returns from Stop → Send).
  await page.locator('.sb-newchat').click();
  await page.waitForSelector('.welcome h1', { timeout: 10_000 }).catch(() => {});
  await composer.click();
  await composer.fill('Write a long detailed multi-paragraph essay about databases.');
  await page.locator('button[aria-label="Send"]').click();
  const stopAppeared = await page
    .waitForSelector('button[aria-label="Stop"]', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check('stop button appears while running', stopAppeared);
  if (stopAppeared) {
    await page.locator('button[aria-label="Stop"]').click();
    const backToSend = await page
      .waitForSelector('button[aria-label="Send"]', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    check('stop aborts the run (composer returns to Send)', backToSend);
  }

  // 6) Sign out → login screen returns and the local chat list is cleared.
  await page.locator('button[aria-label="Sign out"]').click();
  const loggedOut = await page
    .waitForSelector('text=Welcome to Zoho AI', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check('sign out returns to the login screen', loggedOut);
  // A reload must stay on the login screen (server-side session was cleared).
  await page.reload({ waitUntil: 'networkidle' });
  const stillLoggedOut = (await page.locator('text=Welcome to Zoho AI').count()) > 0;
  check('session cleared server-side (reload stays logged out)', stillLoggedOut);
  // Logout drops prior chats and seeds one fresh empty placeholder — so no earlier
  // conversation (e.g. our prompt) may survive; only "New conversation" placeholders.
  const storedSessions = await page.evaluate(() => localStorage.getItem('flue:sessions:v3'));
  let clearedPriorChats = false;
  try {
    const parsed = JSON.parse(storedSessions || '[]');
    clearedPriorChats = Array.isArray(parsed) && parsed.every((s) => s.title === 'New conversation');
  } catch { /* leave false */ }
  check('prior chats cleared on logout (only fresh placeholders remain)', clearedPriorChats, String(storedSessions));

  await context.close();
} catch (err) {
  check('driver ran without throwing', false, err?.message || String(err));
} finally {
  await browser.close().catch(() => {});
  clearTimeout(guard);
}

finish(failures === 0 ? 0 : 1);
