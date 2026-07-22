import axios, { AxiosResponse } from 'axios';
import cron from 'node-cron';

import { KyoboBotDB } from './kyobo-bot-db';

interface Item {
  bookKey: string;
  gb: '1'|'2';
  strName: string;
  realInvnQntt: number;
}
interface Result {
  list:Item[];
}

interface BookTarget {
  key:string; // ribs.kyobo_bot_stock.book_key로 저장되는 내부 식별자
  kyoboCode:string; // 교보문고 saleCmdtId
  youngpungCode:string; // 영풍문고 iBookCd
  youngpungPrice:number; // 영풍문고 iNorPrc
  url:string; // 메시지에 표시할 상품 URL
}

// 대상 책이 늘어나면 이 배열에 항목만 추가하면 된다(테이블/조회 로직은 book_key로 이미 구분됨).
const BOOK_TARGETS:BookTarget[] = [
  {
    key: 'S000218735457',
    kyoboCode: 'S000218735457',
    youngpungCode: '101394998',
    youngpungPrice: 15000,
    url: 'https://product.kyobobook.co.kr/detail/S000218735457',
  },
];

export class KyoboBot {

  prev:Item[] = [];

  db:KyoboBotDB;

  constructor() {
    this.db = new KyoboBotDB();

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
    await this.db.waitConnected();
    // 프로세스가 재시작되면(재배포 등) 메모리의 prev가 초기화되어 재고 변동 비교가 끊긴다 —
    // DB에 쌓아둔 book_key/gb/지점별 가장 최근 값을 읽어 prev를 복원한다.
    const latestByBook = await Promise.all(BOOK_TARGETS.map((book) => this.db.getLatestByBookKey(book.key)));
    this.prev = latestByBook.flat().map((row) => ({
      bookKey: row.bookKey,
      gb: row.gb,
      strName: row.strName,
      realInvnQntt: row.quantity,
    }));
  }

  async check() {

    const result = await this.fetch();

    const textList:string[] = [];

    // 결과 비교 (책이 여러 권이 될 수 있으므로 bookKey까지 포함해 키를 구성)
    const prevMap = new Map(this.prev.map((item) => [ item.bookKey + item.gb + item.strName, item.realInvnQntt ]));

    result.forEach((item) => {
      const prevCnt = prevMap.get(item.bookKey + item.gb + item.strName) || 0;
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

    await this.db.insertStock(result.map((item) => ({
      bookKey: item.bookKey,
      gb: item.gb,
      strName: item.strName,
      quantity: item.realInvnQntt,
    })));

    this.sendMessage({
      content: title,
      embeds: [
        {
          title,
          description: textList.join('\n'),
          url: BOOK_TARGETS[0].url,
          color: 9498256,
        },
      ],
    });

  }

  async fetch():Promise<Item[]> {
    const results = await Promise.all(BOOK_TARGETS.map((book) => this.fetchBook(book)));
    return results.flat();
  }

  async fetchBook(book:BookTarget):Promise<Item[]> {
    const { data } = await axios.get<unknown, AxiosResponse<Result[]>>(`https://www.ribs.kr/api/kyobo/quantity/1?code=${book.kyoboCode}`);
    const { data: data2 } = await axios.get<unknown, AxiosResponse<Result[]>>(`https://www.ribs.kr/api/kyobo/quantity/2?code=${book.youngpungCode}&price=${book.youngpungPrice}`);
    // const { data } = await axios.get<unknown, AxiosResponse<Result[]>>(`http://localhost:3000/api/kyobo/quantity/1?code=${book.kyoboCode}`);
    // const { data: data2 } = await axios.get<unknown, AxiosResponse<Result[]>>(`http://localhost:3000/api/kyobo/quantity/2?code=${book.youngpungCode}&price=${book.youngpungPrice}`);
    return [ ...data, ...data2 ].reduce<Item[]>((prev, item) => {
      item.list.forEach((li) => prev.push({ ...li, bookKey: book.key }));
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