'use client';

import { useEffect, useState } from 'react';
import styled from 'styled-components';

// 비올까(goju2k/my-rain-assist-aos) 배포본. 레이더 피드와 같은 버킷/CloudFront에 올리며 latest.json이
// 지금 받을 파일을 가리킨다 — APK만 새로 올리면 웹 배포 없이 이 페이지가 따라간다.
// latest.json: { versionName, versionCode, file, sizeBytes, sha256, uploadedAt }
const APP_BASE_URL = 'https://d8dfs01bak16j.cloudfront.net/rain-assist/app/';

// 사이트의 GA4 측정 ID. GTM 컨테이너가 이 Google 태그를 띄우므로, gtag 형식 명령을 dataLayer에 넣고
// send_to로 지정하면 GTM 쪽 설정 없이 GA에 이벤트가 남는다(send_to 없이는 전송되지 않았다).
const GA_MEASUREMENT_ID = 'G-4V5HCSXBLM';

interface LatestApp {
  versionName:string;
  versionCode:number;
  file:string;
  sizeBytes:number;
  sha256:string;
  uploadedAt:string;
}

function trackDownload(latest:LatestApp) {
  const w = window as unknown as { dataLayer?:unknown[]; };
  w.dataLayer = w.dataLayer ?? [];
  // gtag()와 같은 형태 — Google 태그는 arguments 객체로 들어온 명령만 처리한다.
  const gtag = function gtagCommand(..._args:unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer?.push(arguments);
  };
  gtag('event', 'app_download', {
    send_to: GA_MEASUREMENT_ID,
    app_name: 'raining-now',
    app_version: latest.versionName,
    app_version_code: latest.versionCode,
    transport_type: 'beacon',
  });
}

function formatDate(iso:string):string {
  const d = new Date(new Date(iso).getTime() + (9 * 60 * 60 * 1000));
  return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}

export default function RainingNowDownloadPage() {

  const [ latest, setLatest ] = useState<LatestApp>();
  const [ failed, setFailed ] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // CloudFront 직접 호출은 CORS가 간헐적으로 빠지므로 같은 출처 API로 받는다(app-latest/route.ts 참고).
    fetch('/api/rain-assist/app-latest', { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json:LatestApp) => (json?.file ? setLatest(json) : setFailed(true)))
      .catch((e) => {
        if (!(e instanceof Error && e.name === 'AbortError')) {
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <Page>
      <Main>
        <Header>
          <AppIcon aria-hidden>
            <svg width='30' height='30' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
              <path d='M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7' />
              <path d='M9 18l-1 2M13 18l-1 2M17 18l-1 2' />
            </svg>
          </AppIcon>
          <div>
            <Title>비올까</Title>
            <Subtitle>다가오는 비를 미리 알려주는 Android 앱</Subtitle>
          </div>
        </Header>

        <Lead>
          주변 150km의 비구름을 기상청 레이더로 계속 지켜보다가, 비가 내 위치로 다가오면
          &ldquo;약 15분 뒤 비가 와요&rdquo;처럼 미리 알려줍니다. 지도에서는 비구름이 어디서 어느 쪽으로
          움직이는지와 앞으로 30분 동안의 비 세기를 볼 수 있습니다.
        </Lead>

        <Notice>
          <NoticeTitle>받기 전에 알아 두세요</NoticeTitle>
          <ul>
            <li><b>개인이 쓰려고 만든 앱</b>입니다. 기상청 공식 예보가 아니며, 예보는 30분 앞까지만 보고 틀릴 수 있습니다.</li>
            <li><b>Android 12 이상</b>에서만 동작합니다. iPhone은 지원하지 않습니다.</li>
            <li><b>Play 스토어 앱이 아닙니다.</b> 설치할 때 &ldquo;출처를 알 수 없는 앱&rdquo; 설치를 허용해야 하고, Play 프로텍트 경고가 뜰 수 있습니다.</li>
          </ul>
        </Notice>

        <Section>
          <SectionTitle>처음 켤 때 요청하는 권한</SectionTitle>
          <PermissionList>
            <li><PermName>알림</PermName><PermWhy>비가 다가오거나 그치면 알려 드리려고</PermWhy></li>
            <li><PermName>위치 (정확한 위치, 항상 허용)</PermName><PermWhy>앱을 꺼 두어도 내 주변의 비를 계속 지켜보려고</PermWhy></li>
            <li><PermName>배터리 최적화 제외</PermName><PermWhy>백그라운드 감시가 중간에 끊기지 않게</PermWhy></li>
          </PermissionList>
          <Small>감시하는 동안 상단 알림창에 &ldquo;주변 비구름을 감지하고 있어요&rdquo; 알림이 계속 떠 있고, 그만큼 배터리를 조금 더 씁니다.</Small>
        </Section>

        <Section>
          <SectionTitle>위치 정보</SectionTitle>
          <Body>
            비 예보는 폰 안에서 계산합니다. 내 위치 좌표를 서버로 보내거나 저장하지 않습니다.
            다만 지도(네이버 지도)와 레이더 이미지를 받을 때 보고 있는 지역이 요청에 포함되고,
            도로 CCTV를 켜면 지도에 보이는 범위로 카메라 목록을 조회합니다.
          </Body>
        </Section>

        <Section>
          <SectionTitle>업데이트</SectionTitle>
          <Body>새 버전이 나오면 앱을 열 때 알려 드리고, 앱 안에서 바로 받아 설치할 수 있습니다.</Body>
        </Section>

        <DownloadCard>
          {latest && (
            <>
              <DownloadLink
                href={`${APP_BASE_URL}${latest.file}`}
                download={latest.file}
                onClick={() => trackDownload(latest)}
              >
                <svg aria-hidden width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                  <path d='M12 3v12m0 0l-5-5m5 5l5-5M4 19h16' />
                </svg>
                APK 받기
              </DownloadLink>
              <Meta>
                <div>버전 {latest.versionName} · {(latest.sizeBytes / (1024 * 1024)).toFixed(0)}MB · {formatDate(latest.uploadedAt)}</div>
                <Sha>SHA-256 {latest.sha256}</Sha>
              </Meta>
            </>
          )}
          {!latest && !failed && <Meta>최신 버전 정보를 불러오는 중...</Meta>}
          {failed && <Meta>버전 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Meta>}
        </DownloadCard>

        <Footer>
          레이더 자료: 기상청 · 도로 CCTV: 국가교통정보센터(ITS)
          <br />
          <a href='/rain-assist'>지도에서 지금 비 보기</a>
        </Footer>
      </Main>
    </Page>
  );
}

// 사이트 공통 스타일(GlobalStyled)이 지도 화면용으로 body를 overflow: hidden으로 막아 두었으므로,
// 이 페이지는 화면 전체를 덮는 자체 스크롤 영역이 된다.
const Page = styled.div({
  position: 'fixed',
  inset: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  background: '#F4F6F8',
  color: '#15202B',
  fontFamily: '\'Pretendard Variable\', Pretendard, system-ui, sans-serif',
});

const Main = styled.main({
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 20px 48px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});

const Header = styled.div({ display: 'flex', alignItems: 'center', gap: '14px' });

const AppIcon = styled.div({
  width: '56px',
  height: '56px',
  flex: 'none',
  borderRadius: '16px',
  background: '#1F6FEB',
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const Title = styled.h1({ margin: 0, fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px' });

const Subtitle = styled.div({ fontSize: '14px', color: '#4A5560', marginTop: '2px' });

const Lead = styled.p({ margin: 0, fontSize: '15px', lineHeight: 1.65, color: '#2B3640' });

const Notice = styled.section({
  background: '#FFF6E5',
  border: '1px solid #F2D9A6',
  borderRadius: '16px',
  padding: '16px 18px',
  fontSize: '14px',
  lineHeight: 1.6,
  color: '#3D2E12',
  ul: { margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' },
});

const NoticeTitle = styled.h2({ margin: 0, fontSize: '15px', fontWeight: 800, color: '#8A5300' });

const Section = styled.section({
  background: '#FFFFFF',
  borderRadius: '16px',
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

const SectionTitle = styled.h2({ margin: 0, fontSize: '16px', fontWeight: 800 });

const Body = styled.p({ margin: 0, fontSize: '14px', lineHeight: 1.65, color: '#2B3640' });

const PermissionList = styled.ul({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  li: { display: 'flex', flexDirection: 'column', gap: '2px' },
});

const PermName = styled.span({ fontSize: '14px', fontWeight: 700 });

const PermWhy = styled.span({ fontSize: '13px', color: '#4A5560' });

const Small = styled.p({ margin: 0, fontSize: '13px', lineHeight: 1.55, color: '#4A5560' });

const DownloadCard = styled.section({
  background: '#FFFFFF',
  borderRadius: '16px',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

const DownloadLink = styled.a({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '52px',
  borderRadius: '14px',
  background: '#1F6FEB',
  color: '#FFFFFF',
  fontSize: '16px',
  fontWeight: 800,
  textDecoration: 'none',
  '&:hover': { background: '#1A5ED0' },
});

const Meta = styled.div({ fontSize: '13px', color: '#4A5560', lineHeight: 1.6, textAlign: 'center' });

const Sha = styled.div({ fontSize: '11px', color: '#6B7680', wordBreak: 'break-all', marginTop: '4px', fontFamily: 'ui-monospace, monospace' });

const Footer = styled.footer({
  fontSize: '12px',
  color: '#6B7680',
  textAlign: 'center',
  lineHeight: 1.8,
  a: { color: '#1F6FEB' },
});