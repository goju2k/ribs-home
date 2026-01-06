import axios, { AxiosResponse } from 'axios';
import { NextResponse } from 'next/server';

export const revalidate = 0;

// let cnt = 0;
export async function GET(_request: Request, { params }: { params: Promise<{ gb: string; }>; }) {
  
  const { gb } = (await params);

  const result = gb === '2' ? await fetchYoungpung() : await fetchKyobo();
  
  return NextResponse.json(result);
}

const fetchKyobo = async () => {
  const { data } = await axios.get<unknown, AxiosResponse<{data:[];}>>('https://product.kyobobook.co.kr/api/gw/pdt/product/S000218735457/location-inventory', { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36' } });
  return data.data;
};

const fetchYoungpung = async () => {
  const { data } = await axios.get<unknown, AxiosResponse<{data:{labst:number;werksNm:string;}[];}>>('https://m.ypbooks.co.kr/back_shop/base_shop/api/v1/product/stock-info?iBookCd=101394998&iNorPrc=15000&iGubun=y', { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36' } });
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