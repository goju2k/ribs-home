export function 취득세({ 전용면적, 거래가격 }, result) {

  if (!전용면적 || !거래가격) {
    result.취득세 = 0;
    result.취득세율 = 0;
    console.log('취득세 skip');
    return false;
  }

  let 취득세율 = 0.011;
  if (전용면적 <= 85) {

    if (거래가격 > 60000 && 거래가격 <= 90000) {
      취득세율 = 0.03223;
    } else if (거래가격 > 90000) {
      취득세율 = 0.03223;
    }

  } else {

    취득세율 = 0.013;
    if (거래가격 > 60000 && 거래가격 <= 90000) {
      취득세율 = 0.03423;
    } else if (거래가격 > 90000) {
      취득세율 = 0.035;
    }

  }

  result.취득세 = 거래가격 * 취득세율;
  result.취득세율 = 취득세율;
  console.log('취득세율', 취득세율, '취득세', result.취득세);

  return true;

}