import axios from 'axios';

import { getCurrentHours } from './date';
import { SisulBotDB } from './db/db';

function lo(...args) {
  console.log(new Date().toLocaleString(), ...args);
}

export class SisulBot {

  totaltime:number;

  time:number;

  interval:NodeJS.Timer;

  checkCount:number = 0;

  db:SisulBotDB = null;

  constructor(minute:number) {
    this.time = minute * 60 * 1000;
    
    this.db = new SisulBotDB();
  }

  async start() {
    
    if (this.interval) {
      return;
    }

    lo('wait db connect');
    await this.db.waitConnected().then(() => {
      lo('db connect ok');
      this.check();
    });
    
    lo('interval start');
    
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

  async checkAndSend(data, no) {
    
    const type = no === '2' ? 'ydp2' : 'ydp';
    if (Array.isArray(data) && data?.length > 0) {
      
      const dataFiltered = [];
      await Promise.all(data.map((item) => new Promise<boolean>((resolve) => {
        console.log('item', item, 'checking');
        (async () => {
          if (!(await this.db.isCheckedDate(type, item))) { 
            await this.db.addDate(type, item);
            dataFiltered.push(item);
          }
          resolve(true);
        })();
      })));
      
      if (dataFiltered.length <= 0) {
        console.log('No valid date');
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