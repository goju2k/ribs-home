/**
 * WebRTC 데이터채널 (UDP처럼 순서 보장·재전송 없이): 입력과 스냅숏을 이쪽으로, 놓치면 안 되는 이벤트는 웹소켓으로.
 * 신호(offer/answer/ice)는 웹소켓으로 주고받는다. 네이티브 모듈(node-datachannel)이 없으면 웹소켓만 쓴다.
 *
 * 외부 접속에는 UDP 포트가 열려 있어야 한다:
 *   RTC_PORT       서버가 쓰는 UDP 포트 하나 (기본 3104, 모든 연결이 같은 포트를 나눠 씀)
 *   RTC_PUBLIC_IP  공유기 바깥 주소 (설정하면 그 주소로 된 후보를 클라이언트에 알려 준다)
 */
import type { DataChannel, PeerConnection } from 'node-datachannel';

type ND = typeof import('node-datachannel');

let nd:ND | null = null;
try {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires -- 선택 의존성이라 없을 수 있음
  nd = require('node-datachannel');
  nd!.initLogger('Warning');
} catch {
  nd = null;
}

export const rtcAvailable = () => !!nd;

const PORT = Number(process.env.RTC_PORT) || 3104;
const PUBLIC_IP = process.env.RTC_PUBLIC_IP || '';

export interface RtcLink {
  /** 데이터채널이 열려 있으면 true */
  open: () => boolean;
  send: (s:string) => void;
  sendBinary: (b:ArrayBuffer) => void;
  /** 클라이언트가 보낸 신호 처리 */
  signal: (m:{ sdp?: string; type?: string; c?: string; mid?: string; }) => void;
  close: () => void;
}

let seq = 0;

/**
 * 연결 하나. emit: 클라이언트에게 보낼 신호(웹소켓으로), onMessage: 데이터채널로 받은 글 또는 바이너리
 */
export function createRtcLink(emit:(m:object) => void, onMessage:(m:string | Buffer) => void, onState:(open:boolean) => void):RtcLink | null {
  if (!nd) return null;
  seq++;
  const pc:PeerConnection = new nd.PeerConnection(`p${seq}`, {
    iceServers: [],
    portRangeBegin: PORT,
    portRangeEnd: PORT,
    enableIceUdpMux: true,
  });
  let dc:DataChannel | null = null;
  pc.onLocalDescription((sdp, type) => emit({ t: 'rtc', sdp, type }));
  pc.onLocalCandidate((c, mid) => {
    emit({ t: 'rtc', c, mid });
    // 공유기 뒤라 내부 주소만 나오므로, 바깥 주소로 바꾼 후보를 하나 더 알려 준다
    if (PUBLIC_IP) {
      const m = /^(a=)?candidate:(\S+) (\d) (udp|UDP) (\d+) (\S+) (\d+) typ host/.exec(c);
      if (m) emit({ t: 'rtc', c: c.replace(` ${m[6]} ${m[7]} typ host`, ` ${PUBLIC_IP} ${PORT} typ host`), mid });
    }
  });
  pc.onDataChannel((ch) => {
    dc = ch;
    ch.onOpen(() => onState(true));
    ch.onClosed(() => onState(false));
    ch.onMessage((msg) => onMessage(typeof msg === 'string' ? msg : Buffer.from(msg as ArrayBuffer)));
    if (ch.isOpen()) onState(true);
  });
  return {
    open: () => !!dc && dc.isOpen(),
    send: (s) => {
      try {
        if (dc?.isOpen()) dc.sendMessage(s);
      } catch {
        // 닫히는 중
      }
    },
    sendBinary: (b) => {
      try {
        if (dc?.isOpen()) dc.sendMessageBinary(Buffer.from(b));
      } catch {
        // 닫히는 중
      }
    },
    signal: (m) => {
      try {
        if (m.sdp && m.type) pc.setRemoteDescription(m.sdp, m.type as 'offer');
        if (m.c) pc.addRemoteCandidate(m.c, m.mid ?? '0');
      } catch (e) {
        console.warn('rtc signal', (e as Error).message);
      }
    },
    close: () => {
      try {
        dc?.close();
        pc.close();
      } catch {
        // 이미 닫힘
      }
    },
  };
}