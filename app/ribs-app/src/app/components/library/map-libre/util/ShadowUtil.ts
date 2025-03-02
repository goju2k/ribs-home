import SunCalc from 'suncalc';

import { testdata } from '../data';

class ShadowClass {

  calculateShadowPolygon(building: typeof testdata, date?:Date) {
    const [ longitude, latitude ] = building.properties.center;
    const sunPos = SunCalc.getPosition(date || new Date(), latitude, longitude);

    const shadowLength = building.properties.height / Math.tan(sunPos.altitude);
    const azimuthRad = sunPos.azimuth; // Reverse azimuth direction
  
    return building.geometry.coordinates.map((polygon) => polygon.concat(polygon.map(([ lng, lat ]) => {
      // Move point in the sun's direction
      const newLng = lng + (shadowLength / 111320) * Math.cos(azimuthRad);
      const newLat = lat + (shadowLength / 110540) * Math.sin(azimuthRad);
      return [ newLng, newLat ];
    })));
  }

  getSample() {
    const poly = [
      [ 127.03108144816491, 37.49520096173731 ],
      [ 127.03141220965153, 37.49528968242991 ],
      [ 127.03155850736937, 37.49502622369995 ],
      [ 127.03117746545621, 37.49492131156923 ],
    ];

    const shadow = poly.map(([ lng, lat ]) => [ lng - 0.0001, lat + 0.0001 ]);

    return [ poly, shadow ];
  }
  
}

export const ShadowUtil = new ShadowClass();