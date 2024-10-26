import { CSSProperties } from 'react';

import { BaseElementProp } from '../../type/base-prop';

export interface BaseTextProps extends BaseElementProp<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  text?: string|number;
  tagName?:keyof Pick<JSX.IntrinsicElements, 'div'|'p'|'span'>;
  textSize?: number;
  textWeight?: number;
  textColor?: string;
  textWhiteSpace?: CSSProperties['whiteSpace'];
}

export function BaseText({
  tagName: CustomTag = 'div',
  textSize = 16,
  textWeight = 400,
  text = '',
  textColor,
  textWhiteSpace,
  style,
  children,
  ...props
}:React.PropsWithChildren<BaseTextProps>) {
  return (
    <CustomTag
      className='base-text' 
      style={{
        fontSize: `${textSize}px`, 
        fontWeight: textWeight, 
        color: textColor,
        whiteSpace: textWhiteSpace,
        ...style,
      }}
      {...props}
    >
      {text || children}
    </CustomTag>
  );
}