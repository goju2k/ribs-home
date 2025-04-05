'use client';

import { Form, Input, InputProps } from '@mint-ui/core';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { BudgetPlanner } from './js/budget-planner';

const Container = styled.div`
  padding: 10px;
  input {
    border: 1px solid lightgray;
    padding: 5px 10px;
  }
`;

interface CalcData {
  전용면적: number;
  거래가격: number;
  매물종별구분: '01'|'02'|'05'|'06'|'08'|'09'|'10'|'11'|'33'|'38'|'99';
  매물거래구분: '01'|'02'|'03';
  월차임액?: number;
  보유자금: number;
  대출금액: number;
  대출금리: number;
  대출기간년수: number;
  KB시세일반가: number;
}

interface ResultData {
  취득세: number;
  취득세율: number;
  중개보수: number;
  중개수수료율: number;
  필요자금: number;
  대출금액: number;
  KB시세대비대출금액비율: number;
}

export default function Index() {

  const [ data, setData ] = useState<CalcData>({
    전용면적: 59,
    거래가격: 89000,
    매물종별구분: '01',
    매물거래구분: '01',
    월차임액: 0,
    보유자금: 30000,
    대출금액: 50000,
    대출금리: 3.9,
    대출기간년수: 20,
    KB시세일반가: 85000,
  });

  const [ result, setResult ] = useState<ResultData>({
    취득세: 0,
    취득세율: 0,
    중개보수: 0,
    중개수수료율: 0,
    필요자금: 0,
    대출금액: 0,
    KB시세대비대출금액비율: 0,
  });

  const { current: planner } = useRef(new BudgetPlanner(
    data, 
    (result) => {
      console.log('result', result);
      setResult(result as ResultData);
    },
    { reactive: false },
  ));

  const toNum = (data:Record<string, any>) => {
    Object.getOwnPropertyNames(data).forEach((name) => {
      if (name !== '매물종별구분' && name !== '매물거래구분') {
        data[name] = Number(data[name]);
      }
    });
    return data;
  };

  useEffect(() => {
    console.log('calculate', data);
    planner.calculate(toNum(data));
  }, [ data ]);

  return (
    <Container>
      입력값
      <Form data={data} setData={setData}>
        <Flex flexpadding='10px' flexgap='5px'>
          <CalcInput<CalcData> targetId='전용면적' />
          <CalcInput<CalcData> targetId='매물종별구분' />
          <CalcInput<CalcData> targetId='매물거래구분' />
          <br />
          <CalcInput<CalcData> targetId='거래가격' />
          <CalcInput<CalcData> targetId='월차임액' />
          <br />
          <CalcInput<CalcData> targetId='보유자금' />
          <CalcInput<CalcData> targetId='대출금액' />
          <CalcInput<CalcData> targetId='대출금리' />
          <CalcInput<CalcData> targetId='대출기간년수' />
        </Flex>
      </Form>
      출력값
      <Flex>
        {Object.getOwnPropertyNames(result).map((name, idx) => <div key={idx}>{name} : {Number(result[name as keyof typeof result]).toLocaleString()}</div>)}
      </Flex>
    </Container>
  );
}

function CalcInput<T>({
  targetId,
  ...props
}:InputProps<T>) {
  return (
    <Flex flexrow flexgap='4px' flexalign='left-center'>
      {String(targetId)}: <Input<T> inputMode='numeric' targetId={targetId} {...props} />
    </Flex>
  );
}