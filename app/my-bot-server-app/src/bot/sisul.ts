import axios from 'axios';

function lo(...args) {
  console.log(new Date().toLocaleString(), ...args);
}

export class SisulBot {

  totaltime:number;

  time:number;

  interval:NodeJS.Timer;

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
    const hh = new Date().getHours();
    return hh >= 6 && hh <= 23;
  }

  async check(checkTime?:boolean) {

    if (checkTime && !this.checkRunningTime()) {
      lo('실행시간 아님 return;');
      return;
    }

    try {
      
      const data = await this.get();
      
      if (Array.isArray(data) && data?.length > 0) {
        lo('find!!!', `get data => ${data ? JSON.stringify(data) : null}`);
        this.sendMessage({
          content: '예약 가능한 날짜가 발견되었습니다.!!!',
          embeds: [
            {
              title: '예약 가능한 날짜가 발견되었습니다.!!!',
              description: `가능한 날짜 => ${data.join(', ')}\n`,
              url: 'https://spc.y-sisul.or.kr/page/rent/rent.od.list.asp',
              color: 9498256,
            },
          ],
        });
      }

    } catch (e) {
      lo('fetch error', e);
    }

  }

  async get() {
    const { data } = await axios.get('https://www.ribs.kr/api/spc-sisul/ydp');
    return data;
  }

  sendMessage(payload) {
    // 영등포시설관리공단 봇
    axios.post('https://discord.com/api/webhooks/1360265276570075146/W5GLRhI9q2LIM5OTyLGmeREDRAf7xIqekV3zI9RCaA87bBFPf2iwzsjj6JkXN5deCcWU', payload);
  }
  
}