import { CSSProperties } from 'react';

type OverridedProps<P> = Omit<P, 'className'>;
type OverrideFcProps = JSX.IntrinsicAttributes & {style?:CSSProperties;};

export function overrideFC<P extends OverrideFcProps>(
  OriginalComponent:React.FC<P>,
) {
  
  function override<T = {}>(props:OverridedProps<P> | ((props:OverridedProps<P & T>) => OverridedProps<P>)) {
    
    const newFc = (propsTop:P & T) => {

      const baseProps = typeof props === 'function' ? props(propsTop) : props;
      const prevStyle = baseProps.style || {};
      if (propsTop.style) { 
        const newStyle = { ...propsTop.style };
        Object.assign(propsTop.style, prevStyle);
        Object.assign(propsTop.style, newStyle);
      }

      return <OriginalComponent {...baseProps} {...propsTop} />;
    };

    return newFc;
  }
  return override;
}