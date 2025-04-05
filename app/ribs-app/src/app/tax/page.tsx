'use client';

import { Form, Input, InputProps } from '@mint-ui/core';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { BudgetPlanner } from './js/budget-planner';

const Container = styled.div`
  padding: 10px;
  display: flex;
  width: fit-content;
  border: 1px solid lightgray;
  border-radius: 5px;
  gap: 20px;
  margin: 20px;
  overflow: auto;
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
    KB시세일반가: 190000,
  });

  const [ result, setResult ] = useState<ResultData>({
    취득세: 0,
    취득세율: 0,
    중개보수: 0,
    중개수수료율: 0,
    필요자금: 0,
    대출금액: 0,
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
      <Flex flexfit>
        입력값
        <Form data={data} setData={setData}>
          <Flex flexpadding='10px' flexgap='5px'>
            <CalcInput<CalcData> targetId='전용면적' unit='㎡' />
            <CalcInput<CalcData> targetId='매물종별구분' />
            <CalcInput<CalcData> targetId='매물거래구분' />
            <br />
            <CalcInput<CalcData> targetId='거래가격' unit='만원' />
            <CalcInput<CalcData> targetId='월차임액' unit='만원' />
            <br />
            <CalcInput<CalcData> targetId='보유자금' unit='만원' />
            <CalcInput<CalcData> targetId='대출금액' unit='만원' />
            <CalcInput<CalcData> targetId='대출금리' type='number' step={0.1} unit='%'  />
            <CalcInput<CalcData> targetId='대출기간년수' unit='년' />
            <br />
            <CalcInput<CalcData> targetId='KB시세일반가' unit='만원' />
          </Flex>
        </Form>
      </Flex>
      <Flex  flexfit>
        출력값
        <Flex flexpadding='5px 10px'>
          {objectToString(result)}
        </Flex>
      </Flex> 
    </Container>
  );
}

function objectToString(data:Record<string,any>, level = 0){
  return Object.getOwnPropertyNames(data).map((name, idx) => {
    const val = data[name as keyof typeof data];
    const text = typeof val === 'object' ? objectToString(val, level + 1) : Number(val).toLocaleString();
    return <div style={{paddingLeft: `${level * 16}px`}} key={`${level}_${idx}`}>{name} : {text}</div>
  })
}

function CalcInput<T>({
  targetId,
  unit = '',
  style,
  ...props
}:InputProps<T> & {unit?:string}) {
  return (
    <Flex flexrow flexgap='4px' flexalign='left-center'>
      {String(targetId)}: <Input<T> inputMode='numeric' targetId={targetId} style={{maxWidth:'80px', textAlign: 'right', ...style}} {...props} /> {unit}
    </Flex>
  );
}