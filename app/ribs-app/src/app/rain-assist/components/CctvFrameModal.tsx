'use client';

import type Hls from 'hls.js';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import styled from 'styled-components';

import { Flex } from 'ui-base-pack';

import { RequestButton } from '../../components/base/Button';
import { Modal, ModalControl } from '../../components/layout/Modal';
import { useBackToCloseHook } from '../hook/use-back-to-close-hook';

export interface CctvFrameModalControl {
  show:(name:string, streamUrl:string) => void;
}

type LoadState = 'loading' | 'playing' | 'error';

// 시작이 이보다 늦으면 "불러올 수 없음"으로 본다(영상 서버가 응답 없이 멈추는 경우).
const START_TIMEOUT_MS = 15000;

// ITS 도로 CCTV 실시간 영상(HLS). 안드로이드 웹뷰·사파리는 <video>가 HLS를 바로 재생하고, 그렇지
// 않은 브라우저(데스크톱 크롬 등)는 hls.js로 재생한다 — hls.js는 그때만 불러온다. 영상 서버가 CORS *를
// 주므로 우리 서버를 거치지 않는다. 소리는 없고 자동 재생을 위해 음소거한다. 기존 GlobalToast.tsx와
// 같은 imperative ref(show/hide) 패턴으로 Modal을 감싼다.
export const CctvFrameModal = forwardRef<CctvFrameModalControl>((_props, ref) => {

  const modalRef = useRef<ModalControl>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const watchRef = useRef<ReturnType<typeof setInterval>>();
  const [ name, setName ] = useState('');
  const [ streamUrl, setStreamUrl ] = useState('');
  const [ attempt, setAttempt ] = useState(0);
  const [ loadState, setLoadState ] = useState<LoadState>('loading');
  const [ open, setOpen ] = useState(false);

  const stop = () => {
    clearTimeout(timeoutRef.current);
    clearInterval(watchRef.current);
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };

  useEffect(() => stop, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!streamUrl || !video) {
      return undefined;
    }
    let cancelled = false;
    stop();
    setLoadState('loading');

    const fail = () => {
      if (!cancelled) {
        setLoadState('error');
        stop();
      }
    };
    timeoutRef.current = setTimeout(fail, START_TIMEOUT_MS);
    // Modal.tsx는 배경 클릭(clickClose)으로 닫힐 때 콜백을 주지 않으므로, 닫혔는지 주기적으로 보고 영상을 끊는다.
    watchRef.current = setInterval(() => {
      if (!modalRef.current?.isShow()) {
        stop();
      }
    }, 1000);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(() => undefined);
    } else {
      import('hls.js').then(({ default: HlsClass }) => {
        if (cancelled) {
          return;
        }
        if (!HlsClass.isSupported()) {
          fail();
          return;
        }
        const hls = new HlsClass({ lowLatencyMode: false });
        hlsRef.current = hls;
        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            fail();
          }
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        video.play().catch(() => undefined);
      }).catch(fail);
    }

    return () => {
      cancelled = true;
    };
  }, [ streamUrl, attempt ]);

  useImperativeHandle(ref, () => ({
    show(nextName, nextStreamUrl) {
      setName(nextName);
      setStreamUrl(nextStreamUrl);
      setAttempt((n) => n + 1);
      setOpen(true);
      modalRef.current?.show();
    },
  }));

  const close = () => {
    stop();
    modalRef.current?.hide();
    setOpen(false);
  };

  // 배경 클릭으로 닫히면 Modal이 알려 주지 않으므로, 열려 있는 동안 실제로 닫혔는지 지켜본다(뒤로 가기 기록 정리용).
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (!modalRef.current?.isShow()) {
        setOpen(false);
      }
    }, 300);
    return () => clearInterval(timer);
  }, [ open ]);

  // 뒤로 가기 = 영상 창 닫기(앱이 꺼지지 않게).
  useBackToCloseHook(open, close, 'cctv-modal');

  return (
    <Modal ref={modalRef} clickClose>
      <Container>
        <Flex flexrow flexalign='center' style={{ justifyContent: 'space-between' }}>
          <NameText>{name}</NameText>
          <CloseButton type='button' onClick={close}>닫기</CloseButton>
        </Flex>

        <VideoArea>
          {loadState === 'loading' && <StatusText>불러오는 중...</StatusText>}
          {loadState === 'error' && <StatusText>영상을 불러올 수 없습니다</StatusText>}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{ display: loadState === 'playing' ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px', background: '#000' }}
            onPlaying={() => {
              clearTimeout(timeoutRef.current);
              setLoadState('playing');
            }}
            // stop()이 src를 비울 때 나는 오류는 무시 — 실제로 재생하려던 소스가 있을 때만 실패로 본다.
            onError={(e) => {
              if (e.currentTarget.getAttribute('src')) {
                setLoadState('error');
              }
            }}
          />
        </VideoArea>

        <Flex flexalign='center' style={{ marginTop: '8px' }}>
          <RequestButton type='button' onClick={() => setAttempt((n) => n + 1)}>
            다시 불러오기
          </RequestButton>
        </Flex>
      </Container>
    </Modal>
  );

});

CctvFrameModal.displayName = 'CctvFrameModal';

const Container = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '12px',
  padding: '12px',
  minWidth: '240px',
});

const NameText = styled.div({
  fontSize: '15px',
  fontWeight: 600,
});

const CloseButton = styled.button({
  border: 'none',
  background: 'transparent',
  fontSize: '13px',
  color: '#888',
  cursor: 'pointer',
});

// 영상은 가로 3:2(720x480) — 화면이 작으면 80vw, 크면 560px에서 멈추도록.
const VideoArea = styled.div({
  marginTop: '8px',
  width: '80vw',
  maxWidth: '560px',
  aspectRatio: '3 / 2',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: '8px',
  background: '#F4F6F8',
});

const StatusText = styled.div({
  fontSize: '13px',
  color: '#888',
});