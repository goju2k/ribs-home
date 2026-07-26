/* eslint-disable @next/next/no-img-element */

'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { Modal, ModalControl } from '../../components/layout/Modal';

export interface CctvFrameModalControl {
  show:(name:string, cctvUrl:string) => void;
}

type LoadState = 'loading' | 'loaded' | 'error';

// ffmpeg/스트리밍 없이 ITS가 내려주는 정지 이미지 URL을 프록시(/api/rain-assist/cctv/frame)를
// 거쳐 그대로 보여준다 — "1프레임이면 충분"하므로 폴링 없이 "새로고침" 버튼으로 수동 재요청만
// 지원한다. 기존 GlobalToast.tsx와 동일한 imperative ref(show/hide) 패턴으로 Modal을 감싼다.
export const CctvFrameModal = forwardRef<CctvFrameModalControl>((_props, ref) => {

  const modalRef = useRef<ModalControl>(null);
  const [ name, setName ] = useState('');
  const [ cctvUrl, setCctvUrl ] = useState('');
  const [ cacheBust, setCacheBust ] = useState(0);
  const [ loadState, setLoadState ] = useState<LoadState>('loading');

  useImperativeHandle(ref, () => ({
    show(nextName, nextCctvUrl) {
      setName(nextName);
      setCctvUrl(nextCctvUrl);
      setCacheBust(Date.now());
      setLoadState('loading');
      modalRef.current?.show();
    },
  }));

  const imageSrc = cctvUrl ? `/api/rain-assist/cctv/frame?cctvUrl=${encodeURIComponent(cctvUrl)}&t=${cacheBust}` : '';

  return (
    <Modal ref={modalRef} clickClose>
      <Container>
        <Flex flexrow flexalign='center' style={{ justifyContent: 'space-between' }}>
          <NameText>{name}</NameText>
          <CloseButton type='button' onClick={() => modalRef.current?.hide()}>닫기</CloseButton>
        </Flex>

        <ImageArea>
          {loadState === 'loading' && <StatusText>불러오는 중...</StatusText>}
          {loadState === 'error' && <StatusText>영상을 불러올 수 없습니다</StatusText>}
          {imageSrc && (
            <img
              key={imageSrc}
              src={imageSrc}
              alt={name}
              style={{ display: loadState === 'loaded' ? 'block' : 'none', maxWidth: '80vw', maxHeight: '60vh' }}
              onLoad={() => setLoadState('loaded')}
              onError={() => setLoadState('error')}
            />
          )}
        </ImageArea>

        <RefreshButton
          type='button'
          onClick={() => {
            setCacheBust(Date.now());
            setLoadState('loading');
          }}
        >
          새로고침
        </RefreshButton>
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

const ImageArea = styled.div({
  marginTop: '8px',
  minHeight: '120px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const StatusText = styled.div({
  fontSize: '13px',
  color: '#888',
});

const RefreshButton = styled.button({
  marginTop: '8px',
  width: '100%',
  padding: '8px',
  borderRadius: '8px',
  border: '1px solid gray',
  background: '#f5f5f5',
  cursor: 'pointer',
  fontSize: '13px',
});