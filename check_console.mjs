import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log('Navigating to local dev server...');
  await page.goto('https://google.com', { waitUntil: 'networkidle2' });
  
  const content = await page.content();
  console.log('HTML ROOT:', content.substring(content.indexOf('<div id="root">'), content.indexOf('<div id="root">') + 500));
  
  await browser.close();
})();
