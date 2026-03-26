import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  await page.goto('http://192.168.1.13:3001/item/den-da', { waitUntil: 'networkidle2' });
  console.log('Title:', await page.title());
  console.log('URL after goto:', page.url());
  const html = await page.content();
  console.log('HTML Length:', html.length);
  const root = await page.$eval('#root', el => el.innerHTML);
  console.log('Root HTML:', root);

  await browser.close();
})();
