import {config} from 'dotenv';
import {launch} from 'puppeteer';
import fs from 'fs';

// dotenv configuration
config();

// message & sleep & date format functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const dateFormat = () => {
    return new Date().toLocaleString('en-US', {
        timeZone: 'Europe/Istanbul',
        hour12: true,
        long: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        milliseconds: '3-digit',
    });
}
const message = (msg) => console.log(`[${dateFormat()}] ${msg}`);

// get the environment variables
const session = process.env.SESSION || null;
const url = process.env.URL;

// main function
(async () => {
    let i = 0;
    let currentPage;

    message('Starting the browser...');
    const browser = await launch({
        headless: false,
        args: [
            '--start-maximized',
            '--window-size=1920,1080',
        ],
    });

    message('Opening the page...');
    const page = await browser.newPage();

    message('Setting the cookies...');
    if (session) {
        await page.setCookie({
            name: 'SESSION',
            value: session,
            domain: '.migros.com.tr'
        });
    }

    message('Navigating to the page...');
    await page.setViewport({width: 1920, height: 1080});
    await page.goto(url, {
        waitUntil: 'networkidle2',
    });
    message('Waiting for the page to load the discounts button...');
    await page.waitForSelector('#header-money-discounts');
    message('Clicking the discounts button...');
    await page.click('#header-money-discounts');

    message('Waiting for the page to load the discounts pages...');
    await page.waitForSelector('#pagination-button-last');

    message('Clicking the last page button...');
    await page.click('#pagination-button-last');
    await page.waitForNavigation({
        waitUntil: 'networkidle2',
    });

    const currentUrl = await page.evaluate(() => window.location.href)
    // const params = new URLSearchParams(currentUrl.search);
    currentPage = currentUrl.split('?')[1].split('&')[0].split('=')[1];

    let arr = [];

    for (; 0 < currentPage; currentPage--) {
        message(`Waiting for the ${currentPage} page to load the discounts list...`);
        await page.waitForSelector('.mdc-layout-grid__inner.product-cards.list.ng-star-inserted');

        await page.waitForSelector('img');
        await page.waitForSelector('img.product-image.ng-star-inserted.loaded');
        await sleep(3000);

        message(`Getting the discounts list from ${currentPage} page...`);
        const items = await page.$$eval('mat-card', (items, currentPage) => {
            return items.map((item, index) => {
                const children = Array.from(item.children).slice(2, 4);
                const title = children[0].innerText;
                const img = children[0].children[0].children[0].children[0].src.startsWith('data:image') ? children[0].children[0].children[0].children[0].dataset.src : children[0].children[0].children[0].children[0].src;
                const link = children[0].children[0].children[0].href;
                const basePrice = Number(parseFloat(children[1].querySelector('.single-price-amount').innerHTML.trim().split(' ')[0].replace(',', '.')).toFixed(2));
                const discountPrice = Number(parseFloat(children[1].querySelector('#sale-price').innerHTML.trim().replace('<span _ngcontent-ng-c627854318=""> TL</span>', '').replace(',', '.')).toFixed(2));
                const discountDiff = Number(parseFloat(basePrice - discountPrice).toFixed(2));

                return {
                    page: {
                        number: currentPage,
                        order: index + 1,
                    },
                    title,
                    img,
                    link,
                    basePrice,
                    discountPrice,
                    discountDiff,
                }
            });
        }, currentPage);

        if (currentPage > 1) {
            message('Routing to the previous page...');
            await page.click('#pagination-button-previous');
        }

        arr.push(...items);
    }

    const sortedArr = arr.sort((a, b) => b.discountDiff - a.discountDiff);
    const sortedArrByPageAndOrder = sortedArr.sort((a, b) => {
        if (a.page.number === b.page.number) {
            return a.page.order - b.page.order;
        }

        return a.page.number - b.page.number;
    });

    message('Writing the data to the file...');
    await fs.writeFileSync('data.json', JSON.stringify(sortedArrByPageAndOrder, null, 4));

    // create a md file and list the data
    message('Writing the data to the markdown file...');
    const markdown = sortedArr.map((item) => {
        return `### ${item.title}${item.img ? `\n\n![${item.title}](${item.img})` : ''}\n\n- [Link](${item.link})\n- Base Price: ${item.basePrice} TL\n- Discount Price: ${item.discountPrice} TL\n- Discount Diff: ${item.discountDiff} TL\n\n`;
    }).join('\n');

    await fs.writeFileSync('data.md', markdown);

    message('Closing the browser...');
    await browser.close();
})();
