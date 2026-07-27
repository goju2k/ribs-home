/* eslint-disable @next/next/no-img-element */

'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import styled from 'styled-components';

import { Flex } from 'ui-base-pack';

import { RequestButton } from '../../components/base/Button';
import { Modal, ModalControl } from '../../components/layout/Modal';

export interface CctvFrameModalControl {
  show:(name:string, cctvUrl:string) => void;
}

type LoadState = 'loading' | 'loaded' | 'error';

const AUTO_REFRESH_MS = 60000;

// ffmpeg/스트리밍 없이 ITS가 내려주는 정지 이미지 URL을 프록시(/api/rain-assist/cctv/frame)를
// 거쳐 그대로 보여준다. 실제 운영 확인 결과 이 정지 이미지 자체가 약 60초 주기로 갱신되므로,
// 모달이 떠 있는 동안 60초마다 자동으로 다시 불러온다("새로고침" 버튼으로 수동 갱신도 그대로
// 지원, 누르면 자동 갱신 주기도 그 시점부터 다시 시작). 기존 GlobalToast.tsx와 동일한
// imperative ref(show/hide) 패턴으로 Modal을 감싼다.
export const CctvFrameModal = forwardRef<CctvFrameModalControl>((_props, ref) => {

  const modalRef = useRef<ModalControl>(null);
  const [ name, setName ] = useState('');
  const [ cctvUrl, setCctvUrl ] = useState('');
  const [ cacheBust, setCacheBust ] = useState(0);
  const [ loadState, setLoadState ] = useState<LoadState>('loading');
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval>>();

  // 언마운트 시에도 인터벌이 남아있지 않도록.
  useEffect(() => () => clearInterval(autoRefreshTimerRef.current), []);

  const refresh = () => {
    setCacheBust(Date.now());
    setLoadState('loading');
  };

  // Modal.tsx는 배경 클릭(clickClose)으로 닫힐 때 별도 콜백을 주지 않으므로, 매 tick마다
  // modalRef.current?.isShow()로 실제로 아직 열려 있는지 확인해 닫혔으면 스스로 정리한다.
  const startAutoRefresh = () => {
    clearInterval(autoRefreshTimerRef.current);
    autoRefreshTimerRef.current = setInterval(() => {
      if (!modalRef.current?.isShow()) {
        clearInterval(autoRefreshTimerRef.current);
        return;
      }
      refresh();
    }, AUTO_REFRESH_MS);
  };

  useImperativeHandle(ref, () => ({
    show(nextName, nextCctvUrl) {
      setName(nextName);
      setCctvUrl(nextCctvUrl);
      setCacheBust(Date.now());
      setLoadState('loading');
      modalRef.current?.show();
      startAutoRefresh();
    },
  }));

  const imageSrc = cctvUrl ? `/api/rain-assist/cctv/frame?cctvUrl=${encodeURIComponent(cctvUrl)}&t=${cacheBust}` : '';

  return (
    <Modal ref={modalRef} clickClose>
      <Container>
        <Flex flexrow flexalign='center' style={{ justifyContent: 'space-between' }}>
          <NameText>{name}</NameText>
          <CloseButton
            type='button'
            onClick={() => {
              clearInterval(autoRefreshTimerRef.current);
              modalRef.current?.hide();
            }}
          >
            닫기
          </CloseButton>
        </Flex>

        <ImageArea>
          {loadState === 'loading' && <StatusText>불러오는 중...</StatusText>}
          {loadState === 'error' && <StatusText>영상을 불러올 수 없습니다</StatusText>}
          {imageSrc && (
            <img
              key={imageSrc}
              src={imageSrc}
              alt={name}
              style={{ display: loadState === 'loaded' ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }}
              onLoad={() => setLoadState('loaded')}
              onError={() => setLoadState('error')}
            />
          )}
        </ImageArea>

        <Flex flexalign='center' style={{ marginTop: '8px' }}>
          <RequestButton
            type='button'
            onClick={() => {
              refresh();
              startAutoRefresh();
            }}
          >
            새로고침
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

// 정사각형 유지 + 화면이 작으면 80vw, 크면 560px에서 멈추도록.
const ImageArea = styled.div({
  marginTop: '8px',
  width: '80vw',
  height: '80vw',
  maxWidth: '560px',
  maxHeight: '560px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
});

const StatusText = styled.div({
  fontSize: '13px',
  color: '#888',
});