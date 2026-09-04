const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';
const OUT_DIR = path.join(__dirname, '..', 'screenshots');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function screenshot(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  console.log('Screenshot:', name);
}

async function signUp(page) {
  const email = `devin-screenshot-${Date.now()}@reelforge.studio`;
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  await page.getByText('Sign up').first().click();
  await sleep(500);
  const inputs = page.locator('input');
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill('ReelforgeScreenshot123!');
  await page.getByText('Create account').first().click();
  await sleep(5000);
  await page.waitForSelector('text=/Clockmaker/', { timeout: 15000 });
}

async function captureScreens(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  await screenshot(page, '01-login-web.png', { width: 1280, height: 800 });
  await screenshot(page, '01-login-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  await signUp(page);
  await screenshot(page, '02-dashboard-web.png', { width: 1280, height: 900 });
  await screenshot(page, '02-dashboard-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  await page.getByText(/Clockmaker/).first().click();
  await sleep(1000);
  await screenshot(page, '05-project-detail-web.png', { width: 1280, height: 2400 });
  await screenshot(page, '05-project-detail-mobile.png', { width: 390, height: 2400, deviceScaleFactor: 2 });

  await page.goBack();
  await sleep(1000);

  await page.getByText('Neon Rain').first().click();
  await sleep(1000);
  await page.getByText('Edit breakdown').first().click();
  await sleep(1000);
  await screenshot(page, '04-scene-breakdown-web.png', { width: 1280, height: 2400 });
  await screenshot(page, '04-scene-breakdown-mobile.png', { width: 390, height: 2400, deviceScaleFactor: 2 });

  await page.goBack();
  await sleep(500);
  await page.goBack();
  await sleep(1000);

  await page.getByText('New project').first().click();
  await sleep(1000);
  await screenshot(page, '03-new-project-web.png', { width: 1280, height: 1200 });
  await screenshot(page, '03-new-project-mobile.png', { width: 390, height: 1200, deviceScaleFactor: 2 });

  await page.getByText('Settings').first().click();
  await sleep(1000);
  await screenshot(page, '06-settings-web.png', { width: 1280, height: 1500 });
  await screenshot(page, '06-settings-mobile.png', { width: 390, height: 1500, deviceScaleFactor: 2 });

  await page.getByText('Profile').first().click();
  await sleep(1000);
  await screenshot(page, '07-profile-web.png', { width: 1280, height: 800 });
  await screenshot(page, '07-profile-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  await context.close();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  await captureScreens(browser);
  await browser.close();
})();
