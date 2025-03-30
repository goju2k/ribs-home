import { Marker } from 'maplibre-gl';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createPortal } from 'react-dom';

import { NaverMarkerProps, NaverMarkerRef } from './naver-marker-types';

import { useKBLandNaverMap } from '../../KBLandNaverMap';
import { NaverMap3d } from '../map/naver-map-types';

export const NaverMarker = forwardRef<NaverMarkerRef, NaverMarkerProps>(({
  lngLat, 
  children,
}, ref) => {
  
  const map = useKBLandNaverMap<NaverMap3d>();
  const markerDiv = useRef<HTMLDivElement>(document.createElement('div'));
  const markerRef = useRef<Marker>();
  useEffect(() => {
    
    if (map) {
      markerRef.current = new Marker({ element: markerDiv.current, rotationAlignment: 'viewport', pitchAlignment: 'viewport', anchor: 'bottom' }).setLngLat(lngLat).addTo(map);
    }

    return () => {
      markerRef.current && markerRef.current.remove();
    };

  }, [ map ]);

  useImperativeHandle(ref, () => markerRef.current, []);

  return createPortal(children, markerDiv.current);
});

NaverMarker.displayName = 'NaverMarker';