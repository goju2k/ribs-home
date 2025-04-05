import { 중개보수 } from './calculator/agent-fee-calculator';
import { 대출계산 } from './calculator/loan-calculator';
import { 취득세 } from './calculator/tax-calculator';

/* eslint-disable */
const Param = {
  전용면적: 0,
  거래가격: 0,
  매물종별구분: '01',
  매물거래구분: '01',
  보유자금: 0,
  대출금액: 0,
  대출금리: 0,
  대출기간년수: 0,
  KB시세일반가: 0,
};

const Result = {
  취득세: 0,
  취득세율: 0,
  중개보수: 0,
  중개수수료율: 0,
  필요자금: 0,
  대출금액: 0,
  KB시세대비대출금액비율: 0,
};

export class BudgetPlanner {

  param = Param;
  result = Result;

  onChangeResult;
  reactive;

  constructor(
    param = { ...Param },
    onChangeResult = (_result) => {},
    {
      reactive = false
    } = {}
  ) {
    this.param = param;
    this.onChangeResult = onChangeResult;
    this.reactive = reactive;
  }

  setResult(){
    
    this.onChangeResult({...this.result});
    return this;
  }

  calculate(param){
    
    this.param = {... this.param, ...param};

    this.취득세();

    this.중개보수();

    this.필요자금();

    this.대출금액();

    this.최대대출가능한도();

    return this.setResult();
    
  }

  취득세(){
    return 취득세(this.param, this.result);

  }
  
  중개보수(){
    return 중개보수(this.param, this.result);
  }

  필요자금(){
    const {거래가격} = this.param;
    const {취득세, 중개보수} = this.result;
    
    if(!거래가격 || !취득세 || !중개보수){
      this.result.필요자금 = 0;
      return false;
    }

    this.result.필요자금 = 거래가격 + 취득세 + 중개보수;
    return true;
  }

  최대대출가능한도(){
    const {KB시세일반가} = this.param;
    if(!KB시세일반가){
      this.result.최대대출가능한도_50 = 0;
      this.result.최대대출가능한도_70 = 0;
      return false;
    }

    this.result.최대대출가능한도_50 = KB시세일반가 * 0.5;
    this.result.최대대출가능한도_70 = KB시세일반가 * 0.7;
  }

  대출금액(){
    return 대출계산(this.param, this.result);
  }

  getResult(){
    return this.result;
  }

}