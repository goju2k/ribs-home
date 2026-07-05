import { RainBlob } from './blob-detection';

export interface BlobMatch {
  from:RainBlob;
  to:RainBlob;
}

function distanceSq(a:RainBlob, b:RainBlob):number {
  const dRow = a.centroidRow - b.centroidRow;
  const dCol = a.centroidCol - b.centroidCol;
  return (dRow * dRow) + (dCol * dCol);
}

// 각 fromBlobs 원소마다 중심점(그리드 col/row)이 가장 가까운 toBlobs 원소를 찾아 페어링한다.
// 다대일 매칭을 허용하는 단순 최근접 탐색 — 정밀한 병합/분열 처리는 확인 모드 범위 밖.
export function matchNearestBlobs(fromBlobs:RainBlob[], toBlobs:RainBlob[]):BlobMatch[] {

  if (toBlobs.length === 0) {
    return [];
  }

  return fromBlobs.map((from) => {

    let nearest = toBlobs[0];
    let nearestDist = distanceSq(from, nearest);

    for (let i = 1; i < toBlobs.length; i += 1) {
      const dist = distanceSq(from, toBlobs[i]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = toBlobs[i];
      }
    }

    return { from, to: nearest };
  });

}