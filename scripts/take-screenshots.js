const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';
const OUT_DIR = path.join(__dirname, '..', 'screenshots');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}
const env = loadEnv();

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsRequest(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getIdToken(email, password) {
  const res = await httpsRequest(
    'POST',
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
    { email, password, returnSecureToken: true }
  );
  return res.idToken;
}

async function saveApiKey(idToken) {
  return httpsRequest(
    'POST',
    `https://us-central1-reelforge-4b07d.cloudfunctions.net/saveApiKey`,
    { data: { serviceId: 'falai', key: 'dummy-fal-ai-key-for-screenshot' } },
    { Authorization: `Bearer ${idToken}` }
  );
}

async function screenshot(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  console.log('Screenshot:', name);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const email = `devin-screenshot-${Date.now()}@reelforge.studio`;
  const password = 'ReelforgeScreenshot123!';

  // Login / sign-up screenshots
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);

  await screenshot(page, '01-login-signin-web.png', { width: 1280, height: 800 });
  await screenshot(page, '01-login-signin-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  await page.getByText('Sign up').first().click();
  await sleep(500);

  await screenshot(page, '01-login-signup-web.png', { width: 1280, height: 800 });
  await screenshot(page, '01-login-signup-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  const inputs = page.locator('input');
  await inputs.nth(0).fill('error-test@reelforge.studio');
  await inputs.nth(1).fill('short');
  await page.getByText('Create account').first().click();
  await sleep(1200);

  await screenshot(page, '01-login-error-web.png', { width: 1280, height: 800 });
  await screenshot(page, '01-login-error-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  // Sign up for real
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill(password);
  await page.getByText('Create account').first().click();
  await page.waitForSelector('text=/Clockmaker/', { timeout: 15000 });

  // Dashboard
  await screenshot(page, '02-dashboard-web.png', { width: 1280, height: 900 });
  await screenshot(page, '02-dashboard-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  // Project detail
  await page.getByText(/Clockmaker/).first().click();
  await sleep(1000);
  await screenshot(page, '05-project-detail-web.png', { width: 1280, height: 2400 });
  await screenshot(page, '05-project-detail-mobile.png', { width: 390, height: 2400, deviceScaleFactor: 2 });

  // Scene breakdown
  await page.goBack();
  await sleep(1000);
  await page.getByText('Neon Rain').first().click();
  await sleep(1000);
  await page.getByText('Edit breakdown').first().click();
  await sleep(1000);
  await screenshot(page, '04-scene-breakdown-web.png', { width: 1280, height: 2400 });
  await screenshot(page, '04-scene-breakdown-mobile.png', { width: 390, height: 2400, deviceScaleFactor: 2 });

  // New project
  await page.goBack();
  await sleep(500);
  await page.goBack();
  await sleep(1000);
  await page.getByText('New project').first().click();
  await sleep(1000);
  await screenshot(page, '03-new-project-web.png', { width: 1280, height: 1200 });
  await screenshot(page, '03-new-project-mobile.png', { width: 390, height: 1200, deviceScaleFactor: 2 });

  // Settings not connected
  await page.getByText('Settings').first().click();
  await sleep(1000);
  await screenshot(page, '06-settings-not-connected-web.png', { width: 1280, height: 1500 });
  await screenshot(page, '06-settings-not-connected-mobile.png', { width: 390, height: 1500, deviceScaleFactor: 2 });

  // Save a key via the live callable so the connected state (Rotate/Disconnect) is visible
  const idToken = await getIdToken(email, password);
  await saveApiKey(idToken);

  // Force the settings store to pick up the new Firestate
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await page.getByText('Settings').first().click();
  await sleep(2000);
  await screenshot(page, '06-settings-connected-web.png', { width: 1280, height: 1500 });
  await screenshot(page, '06-settings-connected-mobile.png', { width: 390, height: 1500, deviceScaleFactor: 2 });

  // Profile
  await page.getByText('Profile').first().click();
  await sleep(1000);
  await screenshot(page, '07-profile-web.png', { width: 1280, height: 800 });
  await screenshot(page, '07-profile-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
