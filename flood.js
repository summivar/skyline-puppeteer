import puppeteer from 'puppeteer';
import * as fs from 'fs';

let floodingData = {
  href: '',
  selectedDay: 0,
  sessionData: null,
  getBy: 0
};

const filmSessionsSelector = '.filter_time-box.list-group-item:not(.hide_filter_time-box)';
const yourTownListCloseButtonSelector = '#geotargetingRegionModal > div > div > div.modal-header > button';
const filterDaySelector = '.afisha_filter-content > a';

function waitForFrame(page, containUrl) {
  let fulfill;
  const promise = new Promise(x => fulfill = x);
  checkFrame();
  return promise;

  function checkFrame() {
    const frame = page.frames().find(f => f.url().includes(containUrl));
    if (frame)
      fulfill(frame);
    else
      page.once('frameattached', checkFrame);
  }
}

function getFloodingData() {
  let data = '';
  try {
    data = fs.readFileSync('data.json', 'utf8');
    floodingData = JSON.parse(data);
  } catch (e) {
    console.error('Must exist data.json and data.json must have flood data, run main.js');
  }
}

const takingTickets = async () => {
  const millisecond = 1000;
  const seconds = 60;
  const minute = 15;
  let isFreePlaces = true;
  getFloodingData();

  while (isFreePlaces) {
    console.time('Running browser');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials',
        '--disable-features=site-per-process'
      ]
    });
    console.timeEnd('Running browser');

    const page = await browser.newPage();
    await page.goto(floodingData.href);
    await page.setViewport({width: 1920, height: 1080});
    console.log('Go to page');

    await page.waitForSelector(yourTownListCloseButtonSelector);
    await page.click(yourTownListCloseButtonSelector);

    await page.waitForSelector(filterDaySelector);
    await page.click(filterDaySelector);

    const divElement = await page.$('div.afisha_filter-dropdown.afisha_filter_date.active');

    await page.waitForSelector('label', {timeout: 5000});
    const labels = await divElement.$$('label');

    for (let i = 0; i < labels.length; i++) {
      const spanElement = await labels[i].$('span');
      const spanText = await (await spanElement.getProperty('textContent')).jsonValue();
      if (spanText.trim() === floodingData.selectedDay) {
        await spanElement.click();
        break;
      }
    }
    await page.click(filterDaySelector);

    console.log('Chosen day');

    await page.waitForSelector(filmSessionsSelector);
    const filmSessions = await page.$$(filmSessionsSelector);

    for (const session of filmSessions) {
      const timeElement = await session.$('.filter_time-time');
      const timeText = await timeElement.evaluate(element => element.textContent.trim());

      if (timeText === floodingData.sessionData.time) {
        const buyButton = await session.$('button.filter_time-buy');
        if (buyButton) {
          await buyButton.click();
          break;
        }
      }
    }
    console.log('Find session');
    console.time('Waiting iframe')
    const iframe = await waitForFrame(page, 'widget-new.premierzal.ru');
    console.timeEnd('Waiting iframe');

    try {
      await iframe.waitForSelector('.place-wrapper', {timeout: 10000});
    } catch (e) {
      console.error('Not found .place-wrapper');
      process.exit(1);
    }

    console.log('Waited place-wrapper');

    let places = [];

    try {
      places = await iframe.$$('div.place-wrapper:not(.reserved)');
    } catch (e) {
      console.log('Not found no reserved places');
      isFreePlaces = false;
      break;
    }

    console.log('Waited place-wrapper not reserved');

    let index = 0;
    console.log('Start clicking');
    while ((await iframe.$$('div.place-wrapper.added')).length < 6 && index < places.length - 1) {
      if (index > 0) {
        const place = places[index];
        await iframe.waitForSelector('label.basket-info-label');
        let selectedCount = await iframe.$('label.basket-info-label');
        const countTickets = parseInt((await iframe.evaluate(el => el.textContent, selectedCount)).match(/(\d+)\s+билет(а|ов)?/)[1]);
        await place.click();

        try {
          await iframe.waitForSelector('label.basket-info-label', {timeout: 1000});
          selectedCount = await iframe.$('label.basket-info-label');
          const newCountTickets = parseInt((await iframe.evaluate(el => el.textContent, selectedCount)).match(/(\d+)\s+билет(а|ов)?/)[1]);
          if (countTickets > newCountTickets) {
            await place.click();
          }
        } catch (e) {
          await place.click();
        } finally {
          index++;
        }
      } else {
        const place = places[index];
        await place.click();
        index++;
      }
    }
    console.log('Ended clicking');
    console.log('Buy tickets');
    try {
      await iframe.waitForSelector('div.basket-btn', {timeout: 1000});
      const btn = await iframe.$('div.basket-btn');
      await btn.click();
      await btn.click();
      console.log('Tickets selected');
    } catch (e) {
      if (places.length === 1) {
        console.log(places.length);
        await places[0].click();
        await iframe.waitForSelector('div.basket-btn', {timeout: 1000});
        const btn = await iframe.$('div.basket-btn');
        await btn.click();
        await btn.click();
      }
    } finally {
      if (!places.length) {
        console.log('Not found no reserved places');
        isFreePlaces = false;
      }
      await browser.close();
      console.log('Ended buying');
    }
  }
  setTimeout(takingTickets, minute * seconds * millisecond); // 15min * 60sec * 1000ms -> convert 15 min to ms
};


(async () => {
  await takingTickets();
})();
