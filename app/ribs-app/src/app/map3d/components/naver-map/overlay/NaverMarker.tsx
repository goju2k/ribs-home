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
  const [ markerCreated, setMarkerCreated ] = useState(false);
  useEffect(() => {
    
    if (mapContext.map && !markerRef.current) {
      markerRef.current = new naver.maps.Marker({
        map: mapContext.map,
        icon: { content: markerDiv.current },
        ...option,
      });
      setMarkerCreated(true);
    }

    return () => {
      markerRef.current && markerRef.current.setMap(null);
    };

  }, []);

  useImperativeHandle(ref, () => ({ marker: markerRef.current }), [ markerCreated ]);
  
  if (!mapContext) {
    return null;
  }

  return createPortal(children, markerDiv.current);
  
});

NaverMarker.displayName = 'NaverMarker';