const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 200 } });
  await page.goto('http://localhost:3000/issue/2a805e32-1571-4f2d-906d-c7b9598bfcb1', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const labelSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent.trim() === '화제 집중');
    const badgePill = labelSpan.parentElement; // the rounded-full pill span
    const badgeBg = getComputedStyle(badgePill).backgroundColor;
    let p = badgePill.parentElement;
    let cardBg = null;
    while (p) {
      const bg = getComputedStyle(p).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)') { cardBg = bg; break; }
      p = p.parentElement;
    }
    return { badgeBg, cardBg };
  });
  console.log(info);
  await browser.close();
})();
