/* eslint-disable prefer-destructuring */
class PolygonClass {
  
  getOnePathDrawingBetweenPolygons(polygon1:number[][], polygon2:number[][]) {

    polygon1 = [ ...polygon1 ];
    polygon2 = [ ...polygon2 ];

    const result: number[][] = [];

    // convert to lines
    const pairedLines = this.convertPolygonsToLines(polygon1, polygon2);
    
    // find two lines which does not intersected with any other lines
    const twoLines:number[][][] = [];
    const checkLines = [ ...this.convertPolygonToLines(polygon1), ...this.convertPolygonToLines(polygon2) ];
    pairedLines.forEach((line) => {
      
      const [ point1, point2 ] = line;
      
      const intersected = checkLines.some((line2) => {
        const [ point3, point4 ] = line2;
        return this.doLinesIntersect(point1, point2, point3, point4);
      });

      if (!intersected) {
        twoLines.push(line);
      }

    });

    if (twoLines.length === 2) {

      const [ Line1, Line2 ] = twoLines;

      // polygon1 to polygon2
      const [ fromLine1, toLine1 ] = Line1;
      const [ fromLine2, toLine2 ] = Line2;
      
      // polygon2 draw until meet the "toLine2"
      // 단, 홀수이면 reverse 로 그리기
      this.sortArrayInputItemFirst(polygon2.length % 2 === 0 ? polygon2 : polygon2.reverse(), toLine1);
      polygon2.some((point) => {
      
        if (point === toLine2) {
          result.push(point);
          return true;
        }

        result.push(point);

        return false;
      });

      // polygon1 draw until meet the "toLine1"
      this.sortArrayInputItemFirst(polygon1, fromLine2);
      polygon1.some((point) => {
      
        if (point === fromLine1) {
          result.push(point);
          return true;
        }

        result.push(point);

        return false;
      });

    } else {
      console.error('twoLines.length', twoLines.length, 'is not 2');
    }

    return result;

  }

  sortArrayInputItemFirst(array:number[][], item: number[]) {

    let i = 0;
    while (array[0] !== item) {

      if (i > array.length) {
        console.error('item is not exists in the array');
        break;
      }

      const array0 = array.shift();
      if (array0 !== undefined) {
        array.push(array0);
      } else {
        break;
      }

      i += 1;

    }
    return array;
  }

  convertPolygonToLines(polygon:number[][]) {
    const result:number[][][] = [];
    polygon.forEach((curr, idx) => {

      let next = polygon[idx + 1];
      if (!next) {
        next = polygon[0];
        result.push([ curr, next ]);
        return;
      }

      result.push([ curr, next ]);
      
    });

    return result;
  }

  convertPolygonsToLines(polygon1:number[][], polygon2:number[][]) {
    
    const result:number[][][] = [];
    polygon1.forEach((curr, idx) => {
      result.push([ curr, polygon2[idx] ]);
    });

    return result;
  }

  crossProduct(P:number[], Q:number[], R:number[]) {
    return (Q[0] - P[0]) * (R[1] - P[1]) - (Q[1] - P[1]) * (R[0] - P[0]);
  }

  isBetween(P:number[], Q:number[], R:number[]) {
    return Math.min(P[0], Q[0]) < R[0] && R[0] < Math.max(P[0], Q[0])
             && Math.min(P[1], Q[1]) < R[1] && R[1] < Math.max(P[1], Q[1]);
  }

  doLinesIntersect(A:number[], B:number[], C:number[], D:number[]) {    

    const d1 = this.crossProduct(A, B, C);
    const d2 = this.crossProduct(A, B, D);
    const d3 = this.crossProduct(C, D, A);
    const d4 = this.crossProduct(C, D, B);

    if ((d1 * d2 < 0) && (d3 * d4 < 0)) {
      return true; // Proper intersection
    }

    // Check for collinear cases (overlapping segments)
    if (d1 === 0 && this.isBetween(A, B, C)) return true;
    if (d2 === 0 && this.isBetween(A, B, D)) return true;
    if (d3 === 0 && this.isBetween(C, D, A)) return true;
    if (d4 === 0 && this.isBetween(C, D, B)) return true;

    return false; // No intersection
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

export const PolygonUtil = new PolygonClass();