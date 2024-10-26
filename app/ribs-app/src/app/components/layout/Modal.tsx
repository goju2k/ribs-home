import { DetailedHTMLProps, forwardRef, HTMLAttributes, useImperativeHandle, useState } from 'react';

export interface ShowParam {
  left?: string;
  top?: string;
  transform?: string;
  transition?: string;
}
export interface ModalControl {
  show:(option?:ShowParam)=>void;
  hide:()=>void;
  isShow:()=>boolean;
}

export interface ModalProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  padding?:string;
  clickClose?:boolean;
}

export const Modal = forwardRef<ModalControl, React.PropsWithChildren<ModalProps>>(({
  padding = '10px',
  clickClose,
  children,
  style,
  ...props
}, ref) => {

  const [ show, setShow ] = useState(false);
  const [ left, setLeft ] = useState('50%');
  const [ top, setTop ] = useState('50%');
  const [ transition, setTransition ] = useState<string>();
  const [ transform, setTransform ] = useState('translate(-50%, -50%)');

  useImperativeHandle(ref, () => ({
    show(option?:ShowParam) {
      
      const { left, top, transform, transition } = option || {};
      left && setLeft(left);
      top && setTop(top);
      transform && setTransform(transform);
      transition && setTransition(transition);

      setShow(true);

    },
    hide() {
      setShow(false);
    },
    isShow() {
      return show;
    },
  }));

  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.64)',
          zIndex: 9999,
          display: show ? '' : 'none',
          overflow: 'hidden',
        }}
        onClick={clickClose ? () => {
          setShow(false);
        } : undefined}
      />
      <div
        style={{
          ...style,
          position: 'fixed',
          left,
          top,
          transform,
          padding,
          zIndex: 10000,
          display: show ? '' : 'none',
          transition,
        }}
        {...props}
      >
        {children}
      </div>
    </>
  );
});

Modal.displayName = 'Modal';