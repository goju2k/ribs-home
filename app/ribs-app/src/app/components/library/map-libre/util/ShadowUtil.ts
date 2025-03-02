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

    if (Math.floor(altitude) <= 0) return [[[]]]; // No shadow at night

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

      //   const next = polygon[idx + 1];
      //   if (!next) {
      //     return;
      //   }

      //   const curr2 = shadowBase[idx];
      //   const next2 = shadowBase[idx + 1];
      //   result.push([[ curr, next, next2, curr2 ]]);
        
      // });

      // convexHull 로 한번에 처리
      const calcShadow = this.convexHull([ ...polygon, ...shadowBase ]);

      result.push([ calcShadow ]);

    });

    console.log('result', result);

    return result;

  }

  convexHull(points: number[][]) {
    if (points.length < 3) return points; // A hull isn't possible with fewer than 3 points.

    // Sort points by x, then by y (if x-coordinates are the same)
    points.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

    // Cross product function to determine turn direction
    function cross(o: number[], a: number[], b: number[]) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }

    const lower = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const p of points) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    // Remove the last point of each half because it's repeated at the beginning of the other half
    upper.pop();
    lower.pop();

    return lower.concat(upper);
  }

}

export const ShadowUtil = new ShadowClass();