import { Client } from '@elastic/elasticsearch';
import axios from 'axios';
import express from 'express';

import { data } from './data';

const router = express.Router();

const es = new Client({
  node: 'http://home.ribs.kr:11001',
  auth: { apiKey: 'R1NKQ1U1WUJVYWNXaU04bnY5b2g6a2c0UlVSNWxxaHJRSGNHY0VLOTBtUQ==' },
});

router.get('/query', async (req, res) => {

  const { text } = req.query;

  const embedResp = await axios.post('http://home.ribs.kr:12000/embed', { text });
  const { embedding } = embedResp.data;

  const searchResp = await es.search({
    index: 'real_estate',
    size: 5,
    query: {
      script_score: {
        query: { match_all: {} },
        script: {
          source: "cosineSimilarity(params.vector, 'embedding') + 1.0",
          params: { vector: embedding },
        },
      },
    },
  });

  res.json(searchResp.hits.hits);
  
});

let reindexFlag = false;
router.get('/reindex', async (req, res) => {

  if (reindexFlag) {
    res.json({ status: 'reindex already working' });
    return;
  }
  
  reindexFlag = true;
  try {

    await es.indices.delete({ index: 'real_estate' }, { ignore: [ 404 ] });

    await es.indices.create({
      index: 'real_estate',
      body: {
        // @ts-ignore no check needed
        mappings: {
          properties: {
            description: { type: 'text' },
            embedding: {
              type: 'dense_vector',
              dims: 384,
              index: true,
              similarity: 'cosine',
            },
            location: { type: 'keyword' },
            rooms: { type: 'integer' },
            price: { type: 'keyword' },
            size_pyeong: { type: 'float' },
            floor: { type: 'integer' },
            pet_friendly: { type: 'boolean' },
            parking: { type: 'boolean' },
            subway_distance: { type: 'text' },
          },
        },
      },
    });

    const year = new Date().getFullYear();
    for (let i = 0; i < data.length; i++) {

      const item = data[i];
      const price = item.매매평균가 || item.실거래매매평균가 || item.매물매매평균가;
      if (!price) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const doc = {
        id: item.단지기본일련번호,
        name: item.단지명,
        price,
        size_pyeong: Number(item.평수),
        description: `${item.단지명}는 ${item.등수 && item.등수 === 1 ? '지역의 대장주로써' : ''} 세대수 ${item.세대수}세대, 준공년도 ${item.준공년도}년, 평형은 ${item.최소평수}평 부터 ${item.최대평수}평 정도의 ${year - Number(item.준공년도)}년차 아파트로 매매가격은 평균 ${price}억${item.재건축여부 === '1' ? ', 재건축 대상' : ''} 입니다.`,
      };
  
      const embedResp = await axios.post('http://home.ribs.kr:12000/embed', { text: doc.description });
      const { embedding } = embedResp.data;
      
      await es.index({
        index: 'real_estate',
        id: String(doc.id),
        document: {
          ...doc,
          embedding,
        },
      });
  
    }

  } catch (e) {
    console.log('reindex error', e);
  } finally {
    reindexFlag = false;
  }
  
  res.json({ status: 'ok' });

});

export default router;