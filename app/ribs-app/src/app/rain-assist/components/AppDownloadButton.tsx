'use client';

import { useEffect, useState } from 'react';
import styled from 'styled-components';

// Android 앱(비올까, goju2k/my-rain-assist-aos) 배포본. 레이더 피드와 같은 버킷/CloudFront에 올리며,
// latest.json이 지금 받을 파일을 가리킨다 — APK만 새로 올리면 웹 배포 없이 버튼이 따라간다.
// latest.json: { versionName, versionCode, file, sizeBytes, sha256, uploadedAt }
const APP_BASE_URL = 'https://d8dfs01bak16j.cloudfront.net/rain-assist/app/';

interface LatestApp {
  versionName:string;
  file:string;
  sizeBytes:number;
}

// 일반 브라우저 전용 "앱 받기" 버튼(웹뷰는 이미 앱 안이라 page.tsx에서 숨긴다). 하단 줄(BottomBar)
// 왼쪽에 들어간다. latest.json을 못 받으면 버튼을 그리지 않는다.
export function AppDownloadButton() {

  const [ latest, setLatest ] = useState<LatestApp>();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${APP_BASE_URL}latest.json`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((json:LatestApp | undefined) => {
        if (json?.file) {
          setLatest(json);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!latest) {
    return null;
  }

  const sizeMb = (latest.sizeBytes / (1024 * 1024)).toFixed(0);

  return (
    <DownloadLink href={`${APP_BASE_URL}${latest.file}`} download={latest.file}>
      <svg width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden>
        <path d='M12 3v12m0 0l-5-5m5 5l5-5M4 19h16' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
      </svg>
      <span>
        Android 앱 받기
        <Meta>v{latest.versionName} · {sizeMb}MB</Meta>
      </span>
    </DownloadLink>
  );
}

const DownloadLink = styled.a({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  pointerEvents: 'auto',
  flex: 'none',
  height: '48px',
  boxSizing: 'border-box',
  padding: '0 14px',
  borderRadius: '16px',
  background: 'white',
  boxShadow: '0 2px 10px rgba(21, 32, 43, 0.16)',
  color: '#1f6feb',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
});

const Meta = styled.span({
  marginLeft: '6px',
  color: '#888',
  fontSize: '11px',
  fontWeight: 400,
});