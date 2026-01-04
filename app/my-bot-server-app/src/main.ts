/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import bodyParser from 'body-parser';
import express from 'express';

import * as path from 'path';

import { getCurrentHours } from './bot/date';
import { SisulBot } from './bot/sisul';
import { KyoboBot } from './kyobo-bot/kyobo';
import router from './nlp/route';

const app = express();
app.use(bodyParser.json());

app.use('/assets', express.static(path.join(__dirname, 'assets')));

// 시설 봇
const sisul = new SisulBot(7);
sisul.start();

// 교보 봇
const kyobo = new KyoboBot();
kyobo.init();

app.get('/', (req, res) => {
  res.send({ 
    message: `sisulbot server is ok ${!sisul.interval ? 'but bot stopped ㅠ' : `/ bot ${sisul.checkRunningTime() ? 'running!!' : 'sleeping time (06시 ~ 23시에만 동작)'}`}`,
    checkCount: sisul.checkCount,
    currentHours: getCurrentHours(),
  });
});

app.get('/start', (req, res) => {
  sisul.start();
  res.send({ message: 'sisulbot started.' });
});

app.get('/stop', (req, res) => {
  sisul.stop();
  res.send({ message: 'sisulbot stopped.' });
});

app.get('/get', async (req, res) => {
  const data = await sisul.get();
  res.send({ message: `get data => ${data ? JSON.stringify(data) : null}` });
});

app.get('/test', (req, res) => {
  const data = [ '9999-12-31' ];
  sisul.sendMessage({
    content: '[테스트] 예약 가능한 날짜가 발견되었습니다.!!!',
    embeds: [
      {
        title: '[테스트] 예약 가능한 날짜가 발견되었습니다.!!!',
        description: `[테스트] 가능한 날짜 => ${data.join(', ')}\n`,
        url: 'https://spc.y-sisul.or.kr/page/rent/rent.od.list.asp',
        color: 9498256,
      },
    ],
  });
  res.send({ message: 'test message sent.' });
});

// NLP route
app.use('/nlp', router);

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
server.on('error', console.error);