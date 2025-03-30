import { Marker } from 'maplibre-gl';
import { PropsWithChildren } from 'react';

import { LngLat } from '../geometry/lng-lat';

export interface NaverMarkerProps extends PropsWithChildren {
  lngLat: LngLat;
}

export type NaverMarkerRef = Marker|undefined;