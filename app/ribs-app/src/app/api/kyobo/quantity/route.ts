import axios, { AxiosResponse } from 'axios';
import { NextResponse } from 'next/server';

export const revalidate = 0;

// let cnt = 0;
export async function GET(_request: Request) {
  
  const { data } = await axios.get<unknown, AxiosResponse<{data:[];}>>('https://product.kyobobook.co.kr/api/gw/pdt/product/S000218735457/location-inventory', { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36' } });
  
  // for test
  // const data = { data: cnt === 0 ? a : b };

  // cnt += 1;

  console.log('data', `${data}`);
  return NextResponse.json(data.data);
}

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