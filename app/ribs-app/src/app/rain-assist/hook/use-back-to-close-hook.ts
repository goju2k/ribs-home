import { useEffect, useRef } from 'react';

// 열린 시트·모달을 "뒤로 가기"로 닫는다. 열릴 때 기록을 한 칸 쌓고(pushState), 뒤로 가기(popstate)가
// 오면 닫는다. 화면 안에서 직접 닫았으면 쌓아 둔 칸을 되돌려(history.back) 기록에 빈 칸이 남지 않게 한다.
// 앱 웹뷰(0.7~)는 안드로이드 뒤로 가기를 webView.goBack()으로 넘기므로 같은 방식으로 닫힌다.
// 기존 state를 펼쳐 담는 이유: Next 앱 라우터는 popstate 때 state의 자기 정보(__NA 등)가 없으면 페이지를
// 통째로 새로고침한다 — 우리 칸에도 그대로 들고 있어야 같은 화면에서 조용히 지나간다.
export function useBackToCloseHook(open:boolean, onClose:() => void, key:string) {

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      if (pushedRef.current) {
        pushedRef.current = false;
        if (window.history.state?.overlay === key) {
          window.history.back();
        }
      }
      return undefined;
    }

    window.history.pushState({ ...(window.history.state ?? {}), overlay: key }, '');
    pushedRef.current = true;

    const handlePopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [ open, key ]);
}