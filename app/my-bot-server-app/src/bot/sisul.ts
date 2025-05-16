import axios from 'axios';

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

import { getCurrentHours } from './date';

function lo(...args) {
  console.log(new Date().toLocaleString(), ...args);
}

export class SisulBot {

  totaltime:number;

  time:number;

  interval:NodeJS.Timer;

  checkCount:number = 0;

  list = [];

  list2 = [];

  constructor(minute:number) {
    this.time = minute * 60 * 1000;
    this.getData('');
    this.getData('2');
    console.log('list', this.list);
    console.log('list', this.list2);
  }

  start() {

    if (this.interval) {
      return;
    }

    lo('interval start');
    this.check();
    this.interval = setInterval(() => this.check(true), this.time);

  }

  stop() {
    clearInterval(this.interval);
    this.interval = undefined;
  }

  checkRunningTime() {
    const hh = getCurrentHours();
    return hh >= 6 && hh <= 23;
  }

  async check(checkTime?:boolean) {

    if (checkTime && !this.checkRunningTime()) {
      lo('실행시간 아님 return;');
      return;
    }

    try {
      
      this.checkCount += 1;
      
      const data = await this.get('');
      const data2 = await this.get('2');
      this.checkAndSend(data, '');
      this.checkAndSend(data2, '2');

    } catch (e) {
      lo('fetch error', e);
    }

  }

  async get(no:string = '') {
    const { data } = await axios.get(`https://www.ribs.kr/api/spc-sisul/ydp${no}`);
    return data;
  }

  getData(no:string) {
    const filename = no === '2' ? 'list2.txt' : 'list.txt';
    const file = readFileSync(path.resolve(__dirname, 'assets', filename)).toString('utf-8');
    const split = file.split('\n');
    if (no === '2') {
      this.list2 = split;
    } else {
      this.list = split;
    }
  }

  addData(no:string, date:string) {
    const filename = no === '2' ? 'list2.txt' : 'list.txt';
    const p = path.resolve(__dirname, 'assets', filename);
    const file = readFileSync(p).toString('utf-8');
    const split = file.split('\n');
    split.push(date);
    writeFileSync(p, split.join('\n'));
  }

  checkAndSend(data, no) {
    
    const map = no === '2' ? this.list2 : this.list;
    if (Array.isArray(data) && data?.length > 0) {
      
      const dataFiltered = data.filter((item) => {

        if (!map.includes(item)) {
          map.push(item);
          this.addData(no, item);
          return true;
        }

        return false;
      });

      if (dataFiltered.length <= 0) {
        return;
      }

      lo('find!!!', `get data => ${dataFiltered ? JSON.stringify(dataFiltered) : null}`);

      this.sendMessage({
        content: '예약 가능한 날짜가 발견되었습니다.!!!',
        embeds: [
          {
            title: `${no === '2' ? '제2영등포' : ''}예약 가능한 날짜가 발견되었습니다.!!!`,
            description: `가능한 날짜 => ${dataFiltered.join(', ')}\n`,
            url: `https://spc${no}.y-sisul.or.kr/page/rent/rent.od.list.asp`,
            color: 9498256,
          },
        ],
      });
    }
  }

  sendMessage(payload) {
    // 영등포시설관리공단 봇
    const webhook = process.env.SISUL_BOT_WEBHOOK_URL;
    if (webhook) {
      axios.post(webhook, payload);
    } else {
      lo('sendMessage', payload);
    }
  }
  
}