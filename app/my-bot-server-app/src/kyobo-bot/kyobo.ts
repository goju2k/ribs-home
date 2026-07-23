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
    // DB에 쌓아둔 book_key/gb/지점별 가장 최근 값을 읽어 prev를 복원한다. DB 조회가 실패해도
    // (테이블 미생성 등) 봇 자체는 기존처럼 prev=[]로 계속 동작해야 하므로 예외를 삼킨다 —
    // 여기서 던지면 main.ts가 await 없이 호출하는 init()이 unhandled rejection이 된다.
    try {
      const latestByBook = await Promise.all(BOOK_TARGETS.map((book) => this.db.getLatestByBookKey(book.key)));
      this.prev = latestByBook.flat().map((row) => ({
        bookKey: row.bookKey,
        gb: row.gb,
        strName: row.strName,
        realInvnQntt: row.quantity,
      }));
    } catch (e) {
      console.error('KyoboBot init: DB에서 prev 복원 실패, prev=[]로 계속 진행', e);
    }

    // DB에 값이 하나도 없으면(최초 배포이거나 그동안 DB 적재가 계속 실패해온 경우) prev=[]인
    // 채로 다음 08:50 체크를 맞이하게 되는데, 그러면 모든 지점을 "0에서 증가"로 오탐해 의미
    // 없는 알림이 나간다. 그걸 막기 위해 지금 즉시 실제 재고를 조회해 기준값으로 삼고 DB에도
    // 적재해둔다 — 다음 틱부터는 이 기준값과 정확히 비교할 수 있다. 알림은 보내지 않는다
    // (변동을 감지한 게 아니라 그냥 기준점을 세우는 것뿐이므로).
    if (this.prev.length === 0) {
      try {
        const result = await this.fetch();
        this.prev = result;
        await this.persistSnapshot(result);
        console.info('KyoboBot init: DB가 비어있어 현재 재고를 기준값으로 즉시 적재했습니다.');
      } catch (e) {
        console.error('KyoboBot init: 기준값 즉시 적재 실패 — 다음 08:50 체크에서 재시도됨', e);
      }
    }
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

    // 알림 발송이 이 봇의 핵심 가치이므로, DB 적재는 항상 알림을 먼저 보낸 뒤 시도하고 실패해도
    // (테이블 미생성 등) 알림 발송에 영향이 없도록 예외를 삼긴다 — DB는 재시작 시 연속성을 위한
    // 보조 수단일 뿐, DB 문제로 알림이 안 가는 것이 훨씬 심각한 문제다.
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

    await this.persistSnapshot(result);

  }

  // DB 적재는 항상 핵심 동작(알림 발송, prev 갱신) 이후에 호출하고, 실패해도 예외를 삼켜
  // 그 핵심 동작에 영향을 주지 않는다 — DB는 재시작 시 연속성을 위한 보조 수단일 뿐이다.
  async persistSnapshot(result:Item[]) {
    try {
      await this.db.insertStock(result.map((item) => ({
        bookKey: item.bookKey,
        gb: item.gb,
        strName: item.strName,
        quantity: item.realInvnQntt,
      })));
    } catch (e) {
      console.error('KyoboBot: DB 적재 실패(다음 재시작 시 prev 복원이 안 될 수 있음)', e);
    }
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