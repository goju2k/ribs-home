import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { BaseFlex, BaseText } from 'ui-base-pack';

import { GlobalToastMessage } from './toast';

import { ModalControl } from '../../layout/Modal';
import { CommonModal } from '../modal/CommonModal';

export function GlobalToast() {

  const commonModalRef = useRef<ModalControl>(null);
  const message = useRecoilValue(GlobalToastMessage);

  const lastSetMessageTime = useRef(Date.now());
  useEffect(() => {

    setMessageState('');
    commonModalRef.current?.hide();

    setTimeout(() => {

      if (message.message) {
        setMessageState(message.message);
        lastSetMessageTime.current = Date.now();
        commonModalRef.current?.show();
      }

      // setTimeout(() => {
      //   if (Date.now() - lastSetMessageTime.current >= displayTime) {
      //     setMessageState('');
      //     commonModalRef.current?.hide();
      //   }
      // }, displayTime);

    }, 100);

  }, [ message ]);

  const [ messageState, setMessageState ] = useState('');

  return (
    <CommonModal
      ref={commonModalRef}
      buttonProps={{
        buttonName: '확인',
        buttonType: 'progress',
        buttonClick: () => {
          commonModalRef.current?.hide();
        },
      }}
    >
      <BaseFlex flexfit>
        <BaseText textColor='#fff' textWhiteSpace='pre-line' style={{ overflow: 'hidden', width: '100%' }}>
          {messageState}
        </BaseText>
      </BaseFlex>
    </CommonModal>
  );
}