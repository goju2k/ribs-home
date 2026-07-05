const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 서버 컨테이너의 시스템 타임존과 무관하게 항상 KST(UTC+9, DST 없음)로 포맷한다.
// Date의 getHours()/getFullYear() 등은 서버 OS 타임존을 따르는데, 컨테이너가 UTC로 떠 있으면
// KMA가 KST 기준으로 발행하는 시각과 어긋나 계속 9시간 전 이미지를 "최신"으로 착각하게 된다.
// UTC getter를 9시간 shift한 시각에 적용하면 서버 타임존 설정과 무관하게 항상 정확하다.
export function formatKstTm(instant:Date):string {
  const shifted = new Date(instant.getTime() + KST_OFFSET_MS);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(Math.floor(shifted.getUTCMinutes() / 5) * 5).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}