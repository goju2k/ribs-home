import { forwardRef, ReactNode, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { MaverMapGlContext } from '../NaverMapGl';

// Marker Interfaces
export interface NaverMarkerProps {
  option: naver.maps.MarkerOptions;
  children?: ReactNode;
}

export interface NaverMarkerRef {
  marker?:naver.maps.Marker;
}

// Marker Component
export const NaverMarker = forwardRef<NaverMarkerRef, NaverMarkerProps>(({
  option,
  children,
}, ref) => {
  
  const mapContext = useContext(MaverMapGlContext);
  
  const markerDiv = useRef<HTMLDivElement>(document.createElement('div'));
  const markerRef = useRef<naver.maps.Marker>();
  const [ marker, setMarker ] = useState<naver.maps.Marker>();

  useEffect(() => {
    
    if (mapContext.map) {

      if (!markerRef.current) {

        const naverMarker = new naver.maps.Marker({
          map: mapContext.map,
          icon: { content: markerDiv.current },
          ...option,
        });
        
        markerRef.current = naverMarker;
        setMarker(naverMarker);

        console.log('marker created', markerRef.current);

      } else {

        markerRef.current.setOptions({
          map: mapContext.map,
          icon: { content: markerDiv.current },
          ...option,
        });

        console.log('marker updated', markerRef.current);

      }

    }

    return () => {
      console.log('marker release', markerRef.current);
      markerRef.current?.setMap(null);
    };

  }, [ mapContext ]);

  useImperativeHandle(ref, () => ({ marker }), [ marker ]);
  
  if (!mapContext) {
    return null;
  }

  return createPortal(children, markerDiv.current);
  
});

NaverMarker.displayName = 'NaverMarker';