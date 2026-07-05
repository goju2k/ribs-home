// 브라우저 자동화로 페이지를 열어 HTTP 상태/콘솔 에러/스크린샷을 확인하는 범용 검증 스크립트.
// 사용법: node scripts/verify-page.mjs <url> [outputScreenshotPath] [--wait-selector=CSS] [--click=CSS] [--scroll-zoom-in=N]
import { chromium } from 'playwright';

const [ , , url, screenshotPathArg, ...rest ] = process.argv;

if (!url) {
  console.error('Usage: node scripts/verify-page.mjs <url> [screenshotPath] [--wait-selector=CSS] [--click=CSS] [--wait-ms=N] [--scroll-zoom-in=N]');
  process.exit(1);
}

const screenshotPath = screenshotPathArg && !screenshotPathArg.startsWith('--')
  ? screenshotPathArg
  : 'scripts/.output/verify-page.png';

function getArg(name) {
  const found = rest.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : undefined;
}

const waitSelector = getArg('wait-selector');
const clickSelector = getArg('click');
const waitMs = Number(getArg('wait-ms') || 2000);
const scrollZoomIn = Number(getArg('scroll-zoom-in') || 0);

const consoleMessages = [];
const pageErrors = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on('console', (msg) => {
  consoleMessages.push({ type: msg.type(), text: msg.text() });
});
page.on('pageerror', (err) => {
  pageErrors.push(String(err));
});

let status = null;
try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  status = response ? response.status() : null;
} catch (e) {
  console.error('NAVIGATION ERROR:', e.message);
}

if (waitSelector) {
  try {
    await page.waitForSelector(waitSelector, { timeout: 10000 });
  } catch (e) {
    console.error(`WAIT SELECTOR "${waitSelector}" NOT FOUND:`, e.message);
  }
}

if (clickSelector) {
  try {
    await page.click(clickSelector, { timeout: 10000 });
  } catch (e) {
    console.error(`CLICK "${clickSelector}" FAILED:`, e.message);
  }
}

if (scrollZoomIn > 0) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let i = 0; i < scrollZoomIn; i += 1) {
    await page.mouse.wheel(0, -200); // deltaY 음수 = 스크롤 업(대부분 지도 라이브러리에서 줌인)
    await page.waitForTimeout(300);
  }
}

await page.waitForTimeout(waitMs);

const title = await page.title();

await page.screenshot({ path: screenshotPath, fullPage: false }).catch((e) => {
  console.error('SCREENSHOT ERROR:', e.message);
});

console.log('URL:', url);
console.log('HTTP STATUS:', status);
console.log('TITLE:', title);
console.log('SCREENSHOT:', screenshotPath);

const errorConsoleMsgs = consoleMessages.filter((m) => m.type === 'error');
console.log('CONSOLE ERROR COUNT:', errorConsoleMsgs.length);
errorConsoleMsgs.slice(0, 20).forEach((m) => console.log('  [console.error]', m.text));

console.log('PAGE ERROR COUNT:', pageErrors.length);
pageErrors.slice(0, 20).forEach((e) => console.log('  [pageerror]', e));

await browser.close();
