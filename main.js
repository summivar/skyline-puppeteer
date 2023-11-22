import readline from 'readline';
import puppeteer from 'puppeteer';

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
  selectedDay: 0,
  sessionTime: '',
  sessionData: null
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
        floodingData.sessionTime = sessionData[checkedNumber - 1].time;
        floodingData.sessionData = sessionData[checkedNumber - 1];
        await browser.close();
        console.clear();
        await takingTickets();
      });
    });
  });
})();

const takingTickets = async () => {
  const millisecond = 1000;
  const seconds = 60;
  const minute = 15;
  let isFreePlaces = true;

  while (isFreePlaces) {
    const browser = await puppeteer.launch({
      headless: false,
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials'
      ]
    });

    const page = await browser.newPage();
    await page.goto(floodingData.href);
    await page.setViewport({width: 1920, height: 1080});

    await page.waitForSelector(yourTownListCloseButtonSelector);
    await page.click(yourTownListCloseButtonSelector);

    await page.waitForSelector(filterDaySelector);
    await page.click(filterDaySelector);

    const daySelector = `.afisha_filter-dropdown.afisha_filter_date > label:nth-child(${floodingData.selectedDay})`;
    await page.waitForSelector(daySelector);
    await page.click(daySelector);
    await page.click(filterDaySelector);

    await page.waitForSelector(filmSessionsSelector);
    const filmSessions = await page.$$(filmSessionsSelector);

    for (const session of filmSessions) {
      const timeElement = await session.$('.filter_time-time');
      const timeText = await timeElement.evaluate(element => element.textContent.trim());

      if (timeText === floodingData.sessionTime) {
        const buyButton = await session.$('button.filter_time-buy');
        if (buyButton) {
          await buyButton.click();
          break;
        }
      }
    }
    const iframe = await waitForFrame(page, 'widget-new.premierzal.ru');

    try {
      await iframe.waitForSelector('.place-wrapper', {timeout: 10000});
    } catch (e) {
      console.error('Not found .place-wrapper');
      process.exit(1);
    }

    let places = [];

    try {
      places = await iframe.$$('div.place-wrapper:not(.reserved)');
    } catch (e) {
      console.log('Not found no reserved places');
      isFreePlaces = false;
      break;
    }

    let index = 0;
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
    }
  }
  setTimeout(takingTickets, minute * seconds * millisecond); // 15min * 60sec * 1000ms -> convert 15 min to ms
};
