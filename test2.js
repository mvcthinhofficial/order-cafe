const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log('Launching browser...');
        // launch headful to avoid bidi issues, or with explicit args
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        page.on('console', msg => {
            console.log('BROWSER_LOG:', msg.type(), msg.text());
        });
        page.on('pageerror', err => {
            console.log('BROWSER_PAGE_ERROR:', err.message);
        });

        console.log('Navigating to app...');
        await page.goto('http://localhost:5173/#/admin', { waitUntil: 'networkidle0' });

        console.log('Waiting for tabs...');
        await page.waitForSelector('.admin-tab-btn');

        console.log('Finding Kho Hàng tab...');
        const tabs = await page.$$('.admin-tab-btn');
        for (const tab of tabs) {
            const text = await page.evaluate(el => el.innerText, tab);
            if (text.includes('Kho hàng')) {
                console.log('Clicking Kho hàng...');
                await tab.click();
                break;
            }
        }

        console.log('Waiting for Import modal button...');
        // Instead of waiting by time, let's wait for the text "LẬP PHIẾU NHẬP"
        await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('LẬP PHIẾU NHẬP'));
        }, { timeout: 5000 });

        console.log('Clicking LẬP PHIẾU NHẬP...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.innerText.includes('LẬP PHIẾU NHẬP'));
            if (btn) btn.click();
        });

        console.log('Waiting to see what happens...');
        await new Promise(r => setTimeout(r, 2000));

        console.log('Test success. Closing browser.');
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error('SCRIPT_ERROR:', e);
        process.exit(1);
    }
})();
