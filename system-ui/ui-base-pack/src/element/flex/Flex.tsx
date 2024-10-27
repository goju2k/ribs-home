import React, { forwardRef } from 'react';

import { BaseElementProp } from '../../type/base-prop';

export type FlexAlign = 'left-center' | 'left-top' | 'left-bottom' | 'center' | 'center-top' | 'center-bottom' | 'right-center' | 'right-top' | 'right-bottom';
export interface FlexProps extends BaseElementProp<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  tagName?:keyof Pick<JSX.IntrinsicElements, 'div'|'section'|'article'>;
  flexrow?:boolean;
  flexalign?:FlexAlign;
  flexoutline?:boolean;
  flexgap?:React.CSSProperties['gap'];
  flexpadding?:React.CSSProperties['padding'];
  flexsize?:React.CSSProperties['width'];
  flexoverflow?:React.CSSProperties['overflow'];
  flexspacebetween?:boolean;
  flexspaceevenly?:boolean;
  flexwidth?:React.CSSProperties['width'];
  flexheight?:React.CSSProperties['height'];
  flexfit?:boolean;
}

export const Flex = forwardRef<HTMLDivElement, FlexProps>(({
  tagName: CustomTag = 'div',
  flexrow, flexalign, flexoutline, flexsize, flexoverflow, flexspacebetween, flexspaceevenly, flexgap, flexwidth, flexheight, flexpadding, flexfit,
  style,
  children,
  ...props 
}:FlexProps, ref) => (
  <CustomTag
    ref={ref}
    className='base-flex'
    style={{ 
      position: 'relative',
      display: 'flex',
      width: flexwidth || '100%',
      height: flexheight || '100%',
      flex: getFlexStyle(flexsize, flexfit),
      ...getFlexAlignStyle(flexrow, flexalign, flexspacebetween, flexspaceevenly),
      flexDirection: flexrow ? 'row' : 'column',
      gap: flexgap,
      padding: flexpadding,
      overflow: flexoverflow || 'auto',
      border: `${flexoutline ? 1 : 0}px solid gray`,
      ...style, 
    }}
    {...props}
  >
    {children}
  </CustomTag>
));

Flex.displayName = 'Flex';

function getFlexStyle(flexSize?:React.CSSProperties['width'], flexfit?:boolean):React.CSSProperties['flex'] {
  if (flexfit) {
    return '0 0 fit-content';
  }
  return flexSize !== undefined ? `0 0 ${flexSize}` : '1 1 auto';
}

function getFlexAlignStyle(flexRow?:boolean, align?:FlexAlign, flexSpaceBetween?:boolean, flexSpaceEvenly?:boolean):React.CSSProperties {
  
  let forceJustifyContent:React.CSSProperties['justifyContent']|undefined;
  if (flexSpaceBetween) {
    forceJustifyContent = 'space-between';
  } else if (flexSpaceEvenly) {
    forceJustifyContent = 'space-evenly';
  }

  if (align === undefined) {

    return { alignItems: 'flex-start', justifyContent: forceJustifyContent || 'flex-start' };
  }

  if (align === 'center') {
    return { alignItems: 'center', justifyContent: forceJustifyContent || 'center' };
  }

  const [ rowAlign, colAlign ] = align.split('-');
  const styleObject:React.CSSProperties = {};
  
  if (rowAlign === 'left') {
    styleObject[getAlignTargetAttribute(true, flexRow)] = 'flex-start';
  } else if (rowAlign === 'right') {
    styleObject[getAlignTargetAttribute(true, flexRow)] = 'flex-end';
  } else {
    styleObject[getAlignTargetAttribute(true, flexRow)] = 'center';
  }

  if (colAlign === 'top') {
    styleObject[getAlignTargetAttribute(false, flexRow)] = 'flex-start';
  } else if (colAlign === 'bottom') {
    styleObject[getAlignTargetAttribute(false, flexRow)] = 'flex-end';
  } else {
    styleObject[getAlignTargetAttribute(false, flexRow)] = 'center';
  }

  if (forceJustifyContent) {
    styleObject.justifyContent = forceJustifyContent;
  }
  
  return styleObject;

}

function getAlignTargetAttribute(rowAlign?:boolean, flexRow?:boolean):'alignItems'|'justifyContent' {
  if (rowAlign) {
    return flexRow ? 'justifyContent' : 'alignItems';  
  }
  return flexRow ? 'alignItems' : 'justifyContent';
}