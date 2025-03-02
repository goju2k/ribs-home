import { SunPositionUtil } from './SunPositionUtil';

import { testdata } from '../data';

class ShadowClass {

  calculateShadowPolygon(building: typeof testdata) {

    const { sunAltitude, sunAzimuth } = SunPositionUtil.getSunPositionInfo({ lat: building.properties.center[1], lng: building.properties.center[0] });

    const shadowLength = building.properties.height / Math.tan(sunAltitude * Math.PI / 180);
    const azimuthRad = (sunAzimuth) * Math.PI / 180; // Reverse azimuth direction
  
    return building.geometry.coordinates.map((polygon) => polygon.map(([ lng, lat ]) => {
      // Move point in the sun's direction
      const newLng = lng + (shadowLength / 111320) * Math.cos(azimuthRad);
      const newLat = lat + (shadowLength / 110540) * Math.sin(azimuthRad);
      return [ newLng, newLat ];
    }));
  }
  
}

export const ShadowUtil = new ShadowClass();