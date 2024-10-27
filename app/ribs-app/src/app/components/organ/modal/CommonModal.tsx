import Link from 'next/link';
import { forwardRef } from 'react';
import styled, { CSSProperties } from 'styled-components';
import { Flex, BaseText } from 'ui-base-pack';

import { Modal, ModalControl } from '../../layout/Modal';
import { overrideFC } from '../../OverrideFc';

interface CommonModalProps {
  title?:string|string[];
  titleStyle?:CSSProperties;
  subTitle?:string;
  onHide?:()=>void;
  buttonProps?:ProcessButtonProps;
}

const OpacityContainer = styled.div`
  @keyframes showUp {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  animation: showUp 0.7s;
`;

export const CommonModal = forwardRef<ModalControl|null, React.PropsWithChildren<CommonModalProps>>(({
  title = [],
  titleStyle,
  subTitle,
  onHide,
  buttonProps,
  children,
}, ref) => {
  
  title = Array.isArray(title) ? title : [ title ];

  return (
    <Modal ref={ref}>
  
      <OpacityContainer>
      
        <Flex
          flexfit
          flexwidth='330px'
          flexalign='center'
          flexpadding='20px'
          flexgap='21px'
          style={{
            borderRadius: '16px',
            border: '1px solid var(--colors-nutral-white-white-main, #FFF)',
            background: 'black',
            opacity: 0.9,
            transition: 'opacity 1s',
          }}
        >

          <Flex>
          
            <Flex flexrow>
              <Flex flexgap='4px'>
                {title.map((t, idx) => <TitleText style={titleStyle} key={`title-${idx}`}>{t}</TitleText>)}
              </Flex>
              <Flex
                flexfit
                onClick={() => {
                  onHide && onHide();
                  // @ts-ignore ref 공통 처리를 위해..
                  ref?.current.hide();
                }}
              >
                <CloseIcon />
              </Flex>
            </Flex>

            {subTitle && <SubInfoText>{subTitle}</SubInfoText>}
        
          </Flex>

          {children}

          {buttonProps && (
            <Flex flexalign='center'>
              <ProcessButton {...buttonProps} />
            </Flex>
          )}

        </Flex>
      </OpacityContainer>
    
    </Modal>
  );
});

CommonModal.displayName = 'CommonModal';

const TitleText = overrideFC(BaseText)({
  textSize: 18,
  textWeight: 700,
});

const SubInfoText = overrideFC(BaseText)({
  textColor: '#8A8A8A',
  textSize: 12,
  textWeight: 500,
  style: { marginTop: '12px' },
});

function CloseIcon() {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      style={{ cursor: 'pointer' }}
    >
      <path d='M6.4 19L5 17.6L10.6 12L5 6.4L6.4 5L12 10.6L17.6 5L19 6.4L13.4 12L19 17.6L17.6 19L12 13.4L6.4 19Z' fill='white' />
    </svg>
  );
}

export type ProcessButtonType = 'complete'|'progress'|'change'|'share';
export interface ProcessButtonProps {
  buttonName: string;
  buttonType?: ProcessButtonType;
  buttonDisabled?: boolean;
  linkTo?: string;
  buttonClick?:()=>void;
  style?:CSSProperties;
}

function getButtonColor(type:ProcessButtonType) {
  if (type === 'complete') {
    return 'linear-gradient(88deg, #D901FC -19.63%, #AC01FC 29.65%, #FEBD01 115.74%)';
  } if (type === 'change') {
    return 'transparent';
  } if (type === 'share') {
    return 'rgba(204, 204, 204, 0.42)';
  }
    
  return 'linear-gradient(89deg, #AF76F7 -3.32%, #821FFF 99.62%)';
}

const StyledButton = styled.button<ProcessButtonProps>(({ buttonDisabled, buttonType }) => ({
  width: '100%',
  maxWidth: '480px',
  height: '50px',
  borderRadius: '999px',
  padding: buttonType === 'share' ? '0 34px' : '0 15px',
  border: buttonType === 'change' ? '2px solid #AF76F7' : undefined,
  background: buttonDisabled ? '#3E3E3E' : getButtonColor(buttonType || 'complete'),
  cursor: buttonDisabled ? 'default' : 'pointer',
  transition: 'all 0.5s',
}));

function ProcessButton(props:ProcessButtonProps) {
  const {
    buttonName,
    buttonDisabled = false,
    linkTo,
    buttonClick,
  } = props;

  const linkElem = linkTo 
    ? (
      <Link href={linkTo || ''}>
        <BaseText text={buttonName} textColor='#FEFDFF' textWeight={600} textSize={16} />
      </Link>
    )
    : <BaseText text={buttonName} textColor='#FEFDFF' textWeight={600} textSize={16} />;

  return (
    <StyledButton {...props} onClick={!buttonDisabled ? buttonClick : undefined}>
      {
        buttonDisabled
          ? <BaseText text={buttonName} textColor='#999' textWeight={600} textSize={16} />
          : linkElem
      }
    </StyledButton>
  );
}