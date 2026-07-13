import axios from 'axios';
import cron from 'node-cron';

interface SeatItem {
  className: string;
  bookableCount: number;
}
interface SeatListResult {
  result: 'Y'|'N';
  seatList: SeatItem[];
}

const PERF_ID = '267122';
const TIME_ID = '81911';

export class NtokBot {

  constructor() {
    // 5분 주기 좌석 체크
    cron.schedule(
      '*/5 * * * *',
      () => this.check(),
      { timezone: 'Asia/Seoul' },
    );

    // 매일 아침 8시50분 생존 확인 메시지 (kyobo-bot과 동일한 시각 관행)
    cron.schedule(
      '50 08 * * *',
      () => this.sendAliveMessage(),
      { timezone: 'Asia/Seoul' },
    );
  }

  async check() {

    let result:SeatListResult;
    try {
      result = await this.fetch();
    } catch (e) {
      console.error('ntok-bot fetch error', e);
      return;
    }

    if (!result || result.result !== 'Y' || !Array.isArray(result.seatList)) {
      console.info('ntok-bot check: no data or api error', result);
      return;
    }

    const bookableCount = result.seatList.reduce((sum, item) => sum + (item.bookableCount || 0), 0);
    console.info('ntok-bot check', 'bookableCount', bookableCount);

    if (bookableCount <= 0) {
      return;
    }

    const title = '예매가능 발견!!!';
    this.sendMessage({
      content: title,
      embeds: [
        {
          title,
          description: '안예은 예매가능 자리 빨리 확인!!',
          url: 'https://www.ntok.go.kr/ntok/pm/prfmng/performanceDetail.do?perfId=267122&mi=21008',
          color: 9498256,
        },
      ],
    });

  }

  sendAliveMessage() {
    const title = '안예은 봇 정상 동작 중';
    this.sendMessage({
      content: title,
      embeds: [
        {
          title,
          description: '봇이 잘 살아있습니다. 5분마다 예매 가능 여부를 확인하고 있어요.',
          url: 'https://www.ntok.go.kr/ntok/pm/prfmng/performanceDetail.do?perfId=267122&mi=21008',
          color: 9498256,
        },
      ],
    });
  }

  async fetch():Promise<SeatListResult> {
    const params = new URLSearchParams();
    params.append('id', PERF_ID);
    params.append('timeId', TIME_ID);
    const { data } = await axios.post<SeatListResult>(
      'https://www.ntok.go.kr/ntok/pm/prfmng/selectSeatListInfo.do',
      params,
    );
    return data;
  }

  sendMessage(payload) {
    // 안예은(국립극장) 예매 알림 봇
    const webhook = process.env.NTOK_BOT_WEBHOOK_URL;
    if (webhook) {
      axios.post(webhook, payload);
    } else {
      console.log('sendMessage', payload);
    }
  }

}