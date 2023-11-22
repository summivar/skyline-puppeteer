import readline from 'readline';
import puppeteer from 'puppeteer';
import * as fs from 'fs';

// const

const filmSessionsSelector = '.filter_time-box.list-group-item:not(.hide_filter_time-box)';
const yourTownListCloseButtonSelector = '#geotargetingRegionModal > div > div > div.modal-header > button';
const filmLinksSelector = '.catalog_film-box > a';
const filterDaySelector = '.afisha_filter-content > a';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const floodingData = {
  href: '',
  selectedDay: '',
  sessionData: {},
};

function checkNumberAnswer(answer, min = 0, max = 1) {
  const regexTest = /^[0-9]+$/.test(answer);
  const numberFromAnswer = Number(answer);
  if (numberFromAnswer < min || numberFromAnswer > max || !regexTest) {
    console.error(`Incorrect input. Answer must be number, in range from ${min} to ${max}. Your answer: ${answer}`);
    process.exit(1);
  }
  return numberFromAnswer;
}

function writeFloodingData() {
  const data = JSON.stringify(floodingData, null, 2);
  fs.writeFileSync('data.json', data, 'utf8');
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    // headless: false,
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials'
    ]
  });
  const page = await browser.newPage();
  await page.goto('https://skyline.by/afisha/');
  await page.setViewport({width: 1920, height: 1080});

  await page.waitForSelector(yourTownListCloseButtonSelector);
  await page.click(yourTownListCloseButtonSelector);

  let linksIndex = 0;
  const filmLinks = await page.$$eval(filmLinksSelector, links => links.map(link => ({
    href: link['href'],
    text: link['textContent']
  })));
  for (const link of filmLinks) {
    linksIndex++;
    console.log(`${linksIndex}. ${link.text}`);
  }

  rl.question(`Choose film to keep tickets(1-${linksIndex}): `, async function (answer) {
    const checkedNumber = checkNumberAnswer(answer, 1, linksIndex);
    await page.goto(filmLinks[checkedNumber - 1].href);
    floodingData.href = filmLinks[checkedNumber - 1].href;

    await page.waitForSelector(filterDaySelector);
    await page.click(filterDaySelector);

    await page.waitForSelector('div.afisha_filter-dropdown.afisha_filter_date.active', {timeout: 5000});
    const divElement = await page.$('div.afisha_filter-dropdown.afisha_filter_date.active');

    await page.waitForSelector('label', {timeout: 5000});
    const labels = await divElement.$$('label');

    for (let i = 0; i < labels.length; i++) {
      const spanElement = await labels[i].$('span');
      const spanText = await (await spanElement.getProperty('textContent')).jsonValue();
      console.log(`${i + 1}. ${spanText}`);
    }

    let filmSessions = null;
    let sessionData = [];
    let sessionIndex = 0;
    rl.question(`Select day you want keep tickets(1-${labels.length}): `, async function (answer) {
      const checkedNumber = checkNumberAnswer(answer, 1, labels.length);
      floodingData.selectedDay = checkedNumber;

      const daySelector = `.afisha_filter-dropdown.afisha_filter_date > label:nth-child(${checkedNumber})`;
      await page.waitForSelector(daySelector);
      const selectedDay = await page.$(`.afisha_filter-dropdown.afisha_filter_date > label:nth-child(${checkedNumber})`);
      floodingData.selectedDay = (await page.evaluate(el => el.textContent, selectedDay)).trim();
      await page.click(daySelector);
      await page.click(filterDaySelector);

      filmSessions = await page.$$(filmSessionsSelector);
      sessionData = [];
      for (const session of filmSessions) {
        const time = await session.$eval('.filter_time-time', element => element.textContent.trim());
        const numberRoom = await session.$eval('.filter_time-zal', element => element.textContent.trim());
        sessionData.push({time, numberRoom});
      }

      console.log('Available sessions:');
      sessionIndex = 0;
      for (const session of sessionData) {
        sessionIndex++;
        console.log(`${sessionIndex}. Time: ${session.time}, Room: ${session.numberRoom}`);
      }

      rl.question(`Choose session you want to keep tickets(1-${sessionIndex}): `, async function (answer) {
        const checkedNumber = checkNumberAnswer(answer, 1, sessionIndex);
        floodingData.sessionData = sessionData[checkedNumber - 1];
        await browser.close();
        console.clear();
        writeFloodingData();

        console.log('Data saved in data.json');
        process.exit(0);
      });
    });
  });
})();
