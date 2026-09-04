const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8083';
const OUT_DIR = path.join(__dirname, '..', 'screenshots');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function screenshot(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  console.log('Screenshot:', name);
}

async function captureScreens(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await sleep(1500);
  await screenshot(page, '01-login-web.png', { width: 1280, height: 800 });
  await screenshot(page, '01-login-mobile.png', { width: 390, height: 844, deviceScaleFactor: 2 });

  await page.click('text=Sign in');
  await sleep(1000);
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
