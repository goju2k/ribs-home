import axios, { AxiosResponse } from 'axios';
import { NextResponse } from 'next/server';

export const revalidate = 0;

// gb=1(교보)/2(영풍) 둘 다 book마다 다른 상품코드를 쓰므로 code(필수 의도, 하위호환을 위해
// 기존 하드코딩 값을 기본값으로 둠) 쿼리 파라미터로 대상 책을 지정한다 — 추적 대상 책이 늘어나도
// 이 라우트는 무수정, kyobo-bot의 BOOK_TARGETS만 늘리면 된다.
const DEFAULT_KYOBO_CODE = 'S000218735457';
const DEFAULT_YOUNGPUNG_CODE = '101394998';
const DEFAULT_YOUNGPUNG_PRICE = 15000;

export async function GET(request: Request, { params }: { params: Promise<{ gb: string; }>; }) {

  const { gb } = (await params);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const price = Number(searchParams.get('price') ?? DEFAULT_YOUNGPUNG_PRICE);

  const result = gb === '2'
    ? await fetchYoungpung(code ?? DEFAULT_YOUNGPUNG_CODE, price)
    : await fetchKyobo(code ?? DEFAULT_KYOBO_CODE);

  return NextResponse.json(result);
}

const fetchKyobo = async (code: string) => {
  const { data } = await axios.get<unknown, AxiosResponse<{data:[];}>>(`https://product.kyobobook.co.kr/api/gw/pdt/product/${code}/location-inventory`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36' } });
  return data.data;
};

const fetchYoungpung = async (code: string, price: number) => {
  const { data } = await axios.get<unknown, AxiosResponse<{data:{labst:number;werksNm:string;}[];}>>(`https://m.ypbooks.co.kr/back_shop/base_shop/api/v1/product/stock-info?iBookCd=${code}&iNorPrc=${price}&iGubun=y`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36' } });
  return [
    {
      strAreaGrpCode: '001',
      list: data.data.map((item) => ({
        gb: '2',
        strName: item.werksNm,
        realInvnQntt: item.labst,
      })),
    },
  ];
};

// const a = [
//   {
//     strAreaGrpCode: '001',
//     list: [
//       {
//         barcode: '9791124035115',
//         saleCmdtId: 'S000218735457',
//         saleCmdtGrpDvsnCode: 'SGK',
//         saleCmdtDvsnCode: 'KOR',
//         strRdpCode: '001',
//         strName: '광화문',
//         strAreaGrpCode: '001',
//         strAdrs: '서울특별시 종로구 종로 1, 교보생명빌딩 지하 1층',
//         strTlnm: '02-397-3400',
//         realInvnQntt: 103,
//         dlvrRqrmDyCont: 0,
//         plorRqrmDyCont: 0,
//       }
//     ]
//   }
// ];

// const b = [
//   {
//     strAreaGrpCode: '001',
//     list: [
//       {
//         barcode: '9791124035115',
//         saleCmdtId: 'S000218735457',
//         saleCmdtGrpDvsnCode: 'SGK',
//         saleCmdtDvsnCode: 'KOR',
//         strRdpCode: '001',
//         strName: '광화문',
//         strAreaGrpCode: '001',
//         strAdrs: '서울특별시 종로구 종로 1, 교보생명빌딩 지하 1층',
//         strTlnm: '02-397-3400',
//         realInvnQntt: 53,
//         dlvrRqrmDyCont: 0,
//         plorRqrmDyCont: 0,
//       }
//     ]
//   }
// ];