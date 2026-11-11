import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// 1. 핵심 UI 렌더링을 최우선으로 실행하여 화면 백화(Blank Screen) 원천 방지
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

// 2. PWA 서비스 워커 안전 비동기 등록 (아이프레임 환경 및 무한 새로고침 루프 방지 가드 탑재)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // AI Studio 미리보기 아이프레임 환경에서는 서비스 워커 및 강제 새로고침 비활성화
  const isInsideIframe = window.self !== window.top;

  if (!isInsideIframe) {
    // 동적 import로 virtual:pwa-register를 비동기 지연 로드하여 UI 차단 배제
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
        updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            console.log('[PWA] 새 버전 감지');
            // 무한 새로고침 루프 방지: 세션 당 1회만 자동 갱신
            const sessionKey = 'PWA_AUTO_UPDATED_AT';
            const lastUpdated = sessionStorage.getItem(sessionKey);
            const now = Date.now();
            if (!lastUpdated || now - Number(lastUpdated) > 30000) {
              sessionStorage.setItem(sessionKey, String(now));
              if (typeof updateSW === 'function') {
                updateSW(true).catch((err) => console.warn('[PWA] 업데이트 리로드 실패:', err));
              }
            }
          },
          onRegisteredSW(_swUrl, registration) {
            if (registration) {
              // 10분 주기 새 배포 버전 백그라운드 체크
              setInterval(() => {
                registration.update().catch(() => {});
              }, 10 * 60 * 1000);
            }
          },
        });

        // 스마트폰 화면 켜짐 및 백그라운드 복귀 시 버전 확인
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            navigator.serviceWorker.getRegistration().then((reg) => {
              reg?.update().catch(() => {});
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] 서비스 워커 등록 초기화 건너뜀:', err);
      });
  }
}
