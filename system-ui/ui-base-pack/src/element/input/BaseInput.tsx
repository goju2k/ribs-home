import { useContext, useEffect, useRef, useState } from 'react';

import { FormContext, FormContextType } from '../../context/FormContext';
import { BaseFormElementProp } from '../../type/base-prop';
import './BaseInput.css';

export type InputValidHandler = (character:string|null, value:string) => string|undefined;
export type InputErrorHandler = (message:string) => void;

export interface CustomRef {
  elem:HTMLInputElement|null;
}
export interface BaseInputProps<T> extends BaseFormElementProp<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement, T> {
  onInputValid?:InputValidHandler;
  onInputError?:InputErrorHandler;
  cref?: CustomRef;
}

export function BaseInput<T>({ 
  onInputValid, onInputError,
  targetId, 
  type, 
  cref,
  ...props 
}:BaseInputProps<T>) {

  const { data, setData } = useContext<FormContextType<T>>(FormContext);
  const contextValue = String(data[targetId]);
  const [ value, setValue ] = useState<string>(contextValue);

  useEffect(() => {
    setValue(String(data[targetId]));
  }, [ data, targetId ]);

  const valueBeforePaste = useRef<string>();

  return (
    <input
      className='base-input'
      {...props} 
      ref={(r) => {
        cref && (cref.elem = r);
      }}
      value={value}
      onPaste={(e) => {
        const target = e.target as HTMLInputElement;
        valueBeforePaste.current = target.value;
      }}
      onInput={onInputValid ? (e) => {
        
        valueBeforePaste.current = value;

        const { data, inputType } = e.nativeEvent as InputEvent;
        const fromPaste = inputType === 'insertFromPaste' || inputType === 'deleteContentBackward';
        const fromInsertText = inputType === 'insertText' || inputType === 'insertCompositionText';

        if (!fromPaste && !fromInsertText) {
          return;
        }
        
        const target = e.target as HTMLInputElement;
        const invalidReason = onInputValid(data, target.value);
        
        if (invalidReason !== undefined) {
          
          // 입력된 단어를 되돌린다
          const start = target.selectionStart;

          // 되돌리는 로직
          // (입력된 단어를 제외하고 다시 조합하여 value 에 셋팅)
          if (fromPaste) { // 붙여넣기의 경우 이전 값으로 되돌리기
            target.value = valueBeforePaste.current || '';
            valueBeforePaste.current = undefined;
          } else if (start) { // 일반 입력의 경우 커서도 원위치 하기위해 selectionStart, End 조정
            const pre = target.value.substring(0, start - 1);
            const aft = target.value.substring(start, target.value.length);
            target.value = pre + aft;
            target.selectionStart = start - 1;
            target.selectionEnd = target.selectionStart;
          }

          onInputError && onInputError(invalidReason);
        }
        
      } : undefined}
      onChange={(e) => {
        setValue(e.target.value);
        if (setData) {
          setData({ ...data, [targetId]: e.target.value });
        }
        props.onChange && props.onChange(e);
      }}
    />
  );
}