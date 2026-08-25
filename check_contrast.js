const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 200 } });
  await page.goto('http://localhost:3000/issue/2a805e32-1571-4f2d-906d-c7b9598bfcb1', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  const badge = page.locator('text=화제 집중').first();
  const parentBg = await badge.evaluate(el => {
    let p = el.parentElement;
    while (p) {
      const bg = getComputedStyle(p).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)') return bg;
      p = p.parentElement;
    }
    return 'none';
  });
  const badgeBg = await badge.evaluate(el => getComputedStyle(el.closest('span')).backgroundColor);
  console.log('badge bg:', badgeBg, '/ surrounding bg:', parentBg);
  await browser.close();
})();
