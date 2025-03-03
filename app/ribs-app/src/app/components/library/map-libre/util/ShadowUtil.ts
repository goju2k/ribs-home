/* eslint-disable prefer-destructuring */
import SunCalc from 'suncalc';

import { PolygonUtil } from './PolygonUtil';

import { testdata } from '../data';

class ShadowClass {

  calculateShadowPolygon(building: typeof testdata, date?:Date) {

    const [ longitude, latitude ] = building.properties.center;

    // Get sun position
    const sunPos = SunCalc.getPosition(date || new Date(), latitude, longitude);

    // Convert azimuth and altitude to degrees
    const azimuth = (270 - sunPos.azimuth * 180 / Math.PI) % 360;
    const altitude = sunPos.altitude * 180 / Math.PI;

    if (Math.floor(altitude) <= 8) return [[[]]]; // No shadow at night or dawn / sunset

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

      const shadowBase = polygon.map((position) => calculateShadowPoint(position, shadowLength, shadowDirection));

      // 다각형 여러개 생산
      // polygon.forEach((curr, idx) => {

      //   let next = polygon[idx + 1];
      //   const curr2 = shadowBase[idx];
      //   let next2 = shadowBase[idx + 1];
      //   if (!next) {
      //     next = polygon[0];
      //     next2 = shadowBase[0];
      //     result.push([[ curr, next, next2, curr2 ]]);
      //     return;
      //   }

      //   result.push([[ curr, next, next2, curr2 ]]);
        
      // });

      // convexHull 로 한번에 처리
      // const calcShadow = this.convexHull([ ...polygon, ...shadowBase ]);
      // result.push([ calcShadow ]);
      
      // 최적화된 그림자 한붓그리기
      result.push([ PolygonUtil.getOnePathDrawingBetweenPolygons(polygon, shadowBase) ]);

    });

    return result;

  }

}

export const ShadowUtil = new ShadowClass();