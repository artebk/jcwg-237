import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// PWA 서비스 워커 등록 및 실시간 자동 업데이트(Auto-Update) 리스너
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // 새 버전 배포 감지 시 즉시 활성화 및 화면 자동 갱신
      console.log('[PWA] 새 버전 감지: 자동 업데이트 및 리로드 실행');
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // 앱 실행 중 10분 주기로 새 배포 버전 자동 체크
        setInterval(() => {
          registration.update().catch(() => {});
        }, 10 * 60 * 1000);
      }
    },
  });

  // 스마트폰 화면 켜짐 및 백그라운드 복귀(visibilitychange) 시 즉시 최신 버전 확인
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => {});
      });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
