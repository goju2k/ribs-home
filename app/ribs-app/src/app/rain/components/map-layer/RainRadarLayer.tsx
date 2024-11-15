/* eslint-disable @next/next/no-img-element */

import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { MapControlState, useUpdateMapControl } from '../../state/map-controls';
import { getOffset, getScreenOffset } from '../../util/map-util';

export function RainRadarLayer() {
  
  // 기준 바운더리
  const pos = useRef([
    new Position(30.8101038494, 121.3322516155),
    new Position(40.1670385352, 120.609116658),
    new Position(40.0701181652, 133.0225827684),
    new Position(30.7283967663, 132.0821758282),
  ]);

  const controller = useMintMapController();

  const [ imageSize, setImageSize ] = useState<number>(1453);
  const [ imageSize2, setImageSize2 ] = useState<number>(1380.9291408325953);
  const [ imageShow, setImageShow ] = useState(false);
  
  const handleZoomStart = () => {
    setImageShow(false);
  };

  const handleZoomChanged = () => {

    // x축
    const offset1 = getOffset(controller, pos.current[2]);
    const offset2 = getOffset(controller, pos.current[1]);
    const size = Math.floor(offset1.x - offset2.x);
  
    // y축
    const offset1_y = getOffset(controller, pos.current[1]);
    const offset2_y = getOffset(controller, pos.current[0]);
    const size_y = Math.floor(offset2_y.y - offset1_y.y);

    setImageSize(size);
    setImageSize2(size_y);
    setImageShow(true);

    // 현재위치 대기상태
    updateControl('askPosition', false);
    
  };

  useEffect(() => {

    handleZoomChanged();
    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', handleZoomChanged);

    return () => {
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', handleZoomChanged);
    };

  }, []);

  const [ radarStartPosition ] = useState(new Position(40.1670385352, 120.609116658));
  
  const [ tmBefore, setTmBefore ] = useState(4);
  const [ tm, setTm ] = useState(getTime(tmBefore));

  const { opacity, currPosition, temperatureFlag } = useRecoilValue(MapControlState);
  const updateControl = useUpdateMapControl();
  useEffect(() => {
    updateControl('tmText', `${tm.substring(4, 6)}월 ${tm.substring(6, 8)}일 ${tm.substring(8, 10)}시 ${tm.substring(10, 12)}분`);
  }, [ tm ]);

  const imageRef = useRef<HTMLImageElement>(null);
  const [ imgLoaded, setImgLoaded ] = useState(false);
  const { color } = useRainValue({
    imgPin: pos.current[1],
    imgElement: imageRef.current,
    imgLoaded,
  });
  
  return (
    <>

      {!temperatureFlag && imgLoaded && (
        <>
          <MapControlWrapper positionHorizontal='left' positionVertical='bottom'>
            {(!!LegendsMap.get(color) && (
              <MapLegendContainer style={{ margin: '0 0 20px 10px' }}>
                <Flex flexfit>
                  <Flex flexfit>
                    <LegendItem style={{ width: '10px', background: color, opacity }} />
                    <LegendItem>{LegendsMap.get(color)} mm/h</LegendItem>
                  </Flex>
                </Flex>
              </MapLegendContainer>
            )
            )}
          </MapControlWrapper>
          <MapControlWrapper width='100%' height='100%' disablePointerEvent>
            <Flex flexalign='center'>
              <Point style={{ borderWidth: '1px', width: '8px', height: '8px', background: '#65ff78', borderColor: '#109500' }} />
            </Flex>
          </MapControlWrapper>
        </>
      )}

      {!temperatureFlag && (
        <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
          <MapLegendContainer>
            <Flex flexrow flexgap='4px'>
              <Flex>
                {Legends.map(([ color ], idx) => <LegendItem key={`legend-item-${idx}`} style={{ width: '10px', background: color, opacity }} />)}
              </Flex>
              <Flex flexfit>
                {Legends.map(([ , value ], idx) => <LegendItem key={`legend-item-value-${idx}`}>{value}</LegendItem>)}
              </Flex>
            </Flex>
            <Flex flexfit style={{ fontSize: '12px' }}>mm/h</Flex>
          </MapLegendContainer>
        </MapControlWrapper>
      )}

      {imageShow && (
        <MapMarkerWrapper position={radarStartPosition} disablePointerEvent>
          <div style={{ width: `${imageSize}px`, height: `${imageSize2}px`, border: '0px solid coral' }}>
            <img 
              crossOrigin='anonymous'
              ref={imageRef}
              src={`https://vapi.kma.go.kr/BUFD/rdr_sfc_pty_img_${tm}_1453.png`}
              alt={`radar-${tm}`}
              style={{ width: '100%', height: '100%', opacity }}
              onLoad={() => {
                console.log('setImgLoaded true');
                setImgLoaded(true);
              }}
              onError={() => {
                if (tmBefore < 30) {

                  const nextBefore = tmBefore + 5;
                  setTmBefore(nextBefore);

                  const time = getTime(nextBefore);
                  setTm(time);
                  
                }
              }}
            />
          </div>
        </MapMarkerWrapper>
      )}

      {currPosition && (
        <MapMarkerWrapper position={currPosition}>
          <>
            <ArrowImgMarker
              src='/images/rain/marker_arrow.png'
              alt='The position of the marker'
              style={{ position: 'absolute', transform: 'translate(-50%, -150%)', opacity: 0.8 }}
            />
            <Point />
          </>
        </MapMarkerWrapper>
      )}

      {/* 기준점 가이드라인 */}
      {/* {pos.current.map((p, idx) => (
        <MapMarkerWrapper position={p} key={idx}>
          <div style={{
            width: '24px',
            height: '24px', 
            background: 'lightgray',
            fontSize: 12,
            textAlign: 'center',
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)', 
          }}
          >
            {`p${idx}`}
          </div>
        </MapMarkerWrapper>
      ))} */}

      {/* <PolygonMarker
        position={pos.current} 
        mode='POLYLINE'
      /> */}
        
    </>
  );
}

const Point = styled.div({
  position: 'absolute', 
  width: '12px',
  height: '12px', 
  background: '#ff6565',
  border: '2px solid red',
  borderRadius: '50%',
  transform: 'translate(-50%, -50%)', 
});

const ArrowImgMarker = styled.img`
  @keyframes arrow-bounce {
    0% {
      transform: translate(-50%, -150%);
    }
    50% {
      transform: translate(-50%, -200%);
    }
    100% {
      transform: translate(-50%, -150%);
    }
  }
  animation: arrow-bounce 1s infinite;
`;

function getTime(minuteBefore?:number) {
  let now = new Date();
  if (minuteBefore) {
    now = new Date(now.setMinutes(now.getMinutes() - minuteBefore));
  }
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

const MapLegendContainer = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '8px', 
  padding: '5px', 
  marginBottom: '20px',
  marginRight: '10px',
  fontSize: '14px',
});
const LegendItem = styled.div({ height: '14px', fontSize: '12px' });

const Legends:[string, number][] = [
  [ 'rgb(51, 51, 51)', 110 ],
  [ 'rgb(0, 3, 144)', 90 ],
  [ 'rgb(76, 78, 177)', 80 ],
  [ 'rgb(179, 180, 222)', 70 ],
  [ 'rgb(147, 0, 228)', 60 ],
  [ 'rgb(179, 41, 255)', 50 ],
  [ 'rgb(201, 105, 255)', 40 ],
  [ 'rgb(224, 169, 255)', 30 ],
  [ 'rgb(180, 0, 0)', 25 ],
  [ 'rgb(210, 0, 0)', 20 ],
  [ 'rgb(255, 50, 0)', 15 ],
  [ 'rgb(255, 102, 0)', 10 ],
  [ 'rgb(204, 170, 0)', 9 ],
  [ 'rgb(224, 185, 0)', 8 ],
  [ 'rgb(249, 205, 0)', 7 ],
  [ 'rgb(255, 220, 31)', 6 ],
  [ 'rgb(255, 225, 0)', 5 ],
  [ 'rgb(0, 90, 0)', 4 ],
  [ 'rgb(0, 140, 0)', 3 ],
  [ 'rgb(0, 190, 0)', 2 ],
  [ 'rgb(0, 255, 0)', 1 ],
  [ 'rgb(0, 51, 245)', 0.5 ],
  [ 'rgb(0, 155, 245)', 0.1 ],
  [ 'rgb(0, 200, 255)', 0 ],
];

const LegendsMap = new Map<string, number>(Legends);

interface RainValueHookProps {
  imgPin: Position;
  imgElement: HTMLImageElement|null;
  imgLoaded: boolean;
}
function useRainValue({ imgPin, imgElement, imgLoaded }:RainValueHookProps) {

  const controller = useMintMapController();

  const [ center, setCenter ] = useState(controller.getCenter());
  const [ centerPx, setCenterPx ] = useState(getScreenOffset(controller, controller.getCenter()));
  const [ color, setColor ] = useState('');

  const canvas = useRef(document.createElement('canvas'));
  const ctx = useRef(canvas.current.getContext('2d'));

  if (imgElement && imgLoaded) {
    canvas.current.width = imgElement.width;
    canvas.current.height = imgElement.height;
    ctx.current && (ctx.current.imageSmoothingEnabled = false);
    ctx.current?.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height);
  }

  function getPixelColor(x:number, y:number) {
    
    if (!ctx.current) {
      return '';
    }

    // Get image data for the specified pixel
    x = Math.floor(x);
    y = Math.floor(y);

    const pixelData = ctx.current.getImageData(x, y, 1, 1).data;

    // Extract the RGBA values
    const red = pixelData[0];
    const green = pixelData[1];
    const blue = pixelData[2];
    // const alpha = pixelData[3]; // 0 (transparent) to 255 (opaque)

    return `rgb(${red}, ${green}, ${blue})`;
  }

  const centerChanged:Parameters<typeof controller.addEventListener>[1] = ({ param }) => {

    // 센터 계산
    const c = param.center;
    const offset = getScreenOffset(controller, c);
    setCenter(c);
    setCenterPx(offset);
    
    if (!imgElement || !imgLoaded) {
      return;
    }
    
    // 센터의 이미지내에서의 좌표 계산
    const imgOffset = getScreenOffset(controller, imgPin);
    const x = offset.x - imgOffset.x;
    const y = offset.y - imgOffset.y;
    // console.log('offset', offset.x, offset.y);
    // console.log('imgPin', imgOffset.x, imgOffset.y);
    // console.log('getPixelColor', x, y);

    // 컬러 결정
    const color = getPixelColor(x, y);
    setColor(color);

  };

  useEffect(() => {
    controller.addEventListener('IDLE', centerChanged);
    return () => {
      controller.removeEventListener('IDLE', centerChanged);
    };

  }, [ imgLoaded ]);

  return {
    center,
    centerPx,
    color,
  };

}