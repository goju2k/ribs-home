import axios from 'axios';

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

  checkAndSend(data, no) {
    
    const map = no === '2' ? this.list2 : this.list;
    if (Array.isArray(data) && data?.length > 0) {
      
      const dataFiltered = data.filter((item) => {

        if (!map.includes(item)) {
          map.push(item);
          return true;
        }

        return false;
      });

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
    axios.post('https://discord.com/api/webhooks/1360265276570075146/W5GLRhI9q2LIM5OTyLGmeREDRAf7xIqekV3zI9RCaA87bBFPf2iwzsjj6JkXN5deCcWU', payload);
  }
  
}