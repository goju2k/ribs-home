/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import express from 'express';

import * as path from 'path';

import { SisulBot } from './bot/sisul';

const app = express();

app.use('/assets', express.static(path.join(__dirname, 'assets')));

const sisul = new SisulBot(7);
sisul.start();

app.get('/', (req, res) => {
  res.send({ message: 'sisulbot is ok.' });
});

app.get('/start', (req, res) => {
  sisul.start();
  res.send({ message: 'sisulbot started.' });
});

app.get('/stop', (req, res) => {
  sisul.start();
  res.send({ message: 'sisulbot stopped.' });
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

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
server.on('error', console.error);