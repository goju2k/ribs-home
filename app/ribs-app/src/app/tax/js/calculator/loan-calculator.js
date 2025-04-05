/* eslint-disable */
const Param = {
  필요자금: 0,
  대출금액: 0,
  KB시세대비대출금액비율: 0,
};

const Result = {
  거래가격: 0,
  보유자금: 0,
  대출금액: 0,
  대출금리: 0,
  대출기간년수: 0,
  KB시세일반가: 0,
};

export class LoanCalculator {

  param = Param;
  result = Result;

  reactive;

  constructor(
    param = { ...Param },
    onChangeResult,
    {
      reactive = false
    } = {}
  ) {
    this.param = param;
    this.onChangeResult = onChangeResult;
    this.reactive = reactive;
  }

  calculate(){
    
    return this;

  }

  getResult(){
    return this.result;
  }

}