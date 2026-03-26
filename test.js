const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Catch console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.goto('http://localhost:5173/#/admin');

    // Wait for the UI
    await page.waitForSelector('.admin-tab-btn');

    // Click 'Kho hàng' (which is the 4th tab usually)
    const tabs = await page.$$('.admin-tab-btn');
    for (const tab of tabs) {
        const text = await page.evaluate(el => el.innerText, tab);
        if (text.includes('Kho hàng')) {
            await tab.click();
            break;
        }
    }

    console.log('Clicked Kho Hàng');

    // Wait for "LẬP PHIẾU NHẬP"
    await new Promise(r => setTimeout(r, 1000));

    console.log('Looking for LẬP PHIẾU NHẬP...');
    const buttons = await page.$$('button');
    let clicked = false;
    for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText, btn);
        if (text.includes('LẬP PHIẾU NHẬP')) {
            await btn.click();
            clicked = true;
            break;
        }
    }

    if (!clicked) console.log('Could not find LẬP PHIẾU NHẬP');
    else console.log('Clicked LẬP PHIẾU NHẬP');

    await new Promise(r => setTimeout(r, 2000));
    console.log('Test finished');
    await browser.close();
    process.exit(0);
})();
