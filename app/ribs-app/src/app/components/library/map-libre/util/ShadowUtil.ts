import SunCalc from 'suncalc';

import { testdata } from '../data';

class ShadowClass {

  calculateShadowPolygon(building: typeof testdata, date?:Date) {

    const [ longitude, latitude ] = building.properties.center;

    // Get sun position
    const sunPos = SunCalc.getPosition(date || new Date(), latitude, longitude);

    // Convert azimuth and altitude to degrees
    const azimuth = (270 - sunPos.azimuth * 180 / Math.PI) % 360;
    const altitude = sunPos.altitude * 180 / Math.PI;

    if (altitude <= 0) return [[[]]]; // No shadow at night

    // Calculate shadow length
    function calculateShadowPoint([ lng, lat ]:number[], length:number, angle:number) {
      const offsetLng = (length * Math.cos(angle * Math.PI / 180)) / 111320;
      const offsetLat = (length * Math.sin(angle * Math.PI / 180)) / 110540;
      return [ lng + offsetLng, lat + offsetLat ];
    }

    const shadowLength = building.properties.height / Math.tan(altitude * Math.PI / 180); // Calculate shadow length
    const shadowDirection = (azimuth + 180) % 360; // Opposite of sun

    const codi = building.geometry.coordinates;
    const result: number[][][][] = [];
    codi.forEach((polygon) => {

      result.push([ polygon ]);

      const shadowBase = polygon.map((position) => calculateShadowPoint(position, shadowLength, shadowDirection));

      // 다각형 여러개 생산
      polygon.forEach((curr, idx) => {

        const next = polygon[idx + 1];
        if (!next) {
          return;
        }

        const curr2 = shadowBase[idx];
        const next2 = shadowBase[idx + 1];
        result.push([[ curr, next, next2, curr2 ]]);
        
      });

      result.push([ shadowBase ]);
    });

    console.log('result', result);

    return result;

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