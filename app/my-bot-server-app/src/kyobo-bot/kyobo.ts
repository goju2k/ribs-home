import axios, { AxiosResponse } from 'axios';
import cron from 'node-cron';

interface Item {
  gb: '1'|'2';
  strName: string;
  realInvnQntt: number;
}
interface Result {
  list:Item[];
}

export class KyoboBot {

  prev:Item[] = [];

  constructor() {
    // daily 분/시
    cron.schedule(
      '50 08 * * *', 
      () => this.check(),
      {
        timezone: 'Asia/Tokyo', // GMT+9
        // or 'Asia/Seoul'
      },
    );
  }

  async init() {
    // const result = await this.fetch();
    // this.prev = result;
    this.prev = [];
  }

  async check() {
    
    const result = await this.fetch();
    
    const textList:string[] = [];

    // 결과 비교
    const prevMap = new Map(this.prev.map((item) => [ item.gb + item.strName, item.realInvnQntt ]));

    result.forEach((item) => {
      const prevCnt = prevMap.get(item.gb + item.strName) || 0;
      if (prevCnt !== item.realInvnQntt) {
        const delta = item.realInvnQntt - prevCnt;
        textList.push(`[${item.gb === '2' ? '영풍' : '교보'}] ${item.strName} 지점에서 ${Math.abs(delta)} 권 ${delta > 0 ? '재고증가' : '판매'}`);
      }
    });

    if (textList.length === 0) {
      textList.push('재고 변동이 없습니다.');
    }

    const title = '로캣 재고 체크 결과';
    console.info(title);
    console.info(textList);

    this.prev = result;

    this.sendMessage({
      content: title,
      embeds: [
        {
          title,
          description: textList.join('\n'),
          url: 'https://product.kyobobook.co.kr/detail/S000218735457',
          color: 9498256,
        },
      ],
    });

  }

  async fetch() {
    const { data } = await axios.get<unknown, AxiosResponse<Result[]>>('https://www.ribs.kr/api/kyobo/quantity/1');
    const { data: data2 } = await axios.get<unknown, AxiosResponse<Result[]>>('https://www.ribs.kr/api/kyobo/quantity/2');
    // const { data } = await axios.get<unknown, AxiosResponse<Result[]>>('http://localhost:3000/api/kyobo/quantity/1');
    // const { data: data2 } = await axios.get<unknown, AxiosResponse<Result[]>>('http://localhost:3000/api/kyobo/quantity/2');
    // console.log('fetch data', data);
    return [ ...data, ...data2 ].reduce<Item[]>((prev, item) => {
      prev.push(...item.list);
      return prev;
    }, []);
  }

  sendMessage(payload) {
    // 교보 봇
    const webhook = process.env.KYOBO_BOT_WEBHOOK_URL;
    if (webhook) {
      axios.post(webhook, payload);
    } else {
      console.log('sendMessage', payload);
    }
  }

}