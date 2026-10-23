import React, { useState } from 'react';
import { usePWAInstall } from '../utils/usePWAInstall';
import { Download, Share2, PlusSquare, X, CheckCircle2, Smartphone } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'modal';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already running as an installed PWA, do not show install prompt
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (installed) {
        setJustInstalled(true);
        setTimeout(() => setJustInstalled(false), 4000);
      }
    } else {
      // If beforeinstallprompt hasn't fired or on iOS/manual browser, show user-friendly step guide
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {variant === 'header' ? (
        <button
          onClick={handleInstallClick}
          className="px-2.5 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1.5 hover:bg-amber-500/30 transition-all active:scale-95 shrink-0 shadow-xs"
          title="홈 화면에 앱으로 설치하여 전체 화면으로 빠르고 편리하게 사용하세요"
          aria-label="앱 설치하기"
        >
          <Download className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
          <span className="font-semibold text-[11px]">앱 설치</span>
        </button>
      ) : (
        <div className="bg-gradient-to-r from-amber-500/15 via-blue-500/15 to-indigo-500/15 border border-amber-400/30 rounded-xl p-3 flex items-center justify-between gap-3 my-2 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white tracking-tight">초장동 날씨를 홈 화면에 설치</p>
              <p className="text-[11px] text-white/60 truncate">웹 브라우저 주소창 없이 앱처럼 1초 만에 실행</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow-md active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>설치하기</span>
          </button>
        </div>
      )}

      {/* 성공 토스트 알림 */}
      {justInstalled && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/90 text-emerald-200 border border-emerald-500/40 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold backdrop-blur-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>앱 설치가 완료되었습니다! 홈 화면에서 바로 실행하세요.</span>
        </div>
      )}

      {/* 수동 브라우저 설치 안내 모달 (크롬 / 사파리 / 삼성인터넷) */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-[#0f172a] border border-white/15 p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">홈 화면에 앱 설치하기</h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-white/80">
              {isIOS ? (
                /* iOS Safari 가이드 */
                <div className="space-y-2.5">
                  <p className="font-semibold text-amber-300">📱 iPhone / iPad (Safari 브라우저):</p>
                  <div className="p-3 bg-white/5 rounded-xl space-y-2 border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                      <span className="flex items-center gap-1.5">
                        하단 도구 모음의 <Share2 className="w-3.5 h-3.5 text-blue-400" /> <strong>공유</strong> 버튼 터치
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                      <span className="flex items-center gap-1.5">
                        목록을 내려 <PlusSquare className="w-3.5 h-3.5 text-amber-400" /> <strong>'홈 화면에 추가'</strong> 터치
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                      <span>우측 상단 <strong>'추가'</strong>를 누르면 설치 완료!</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Chrome & Android 가이드 */
                <div className="space-y-2.5">
                  <p className="font-semibold text-amber-300">🤖 안드로이드 Chrome / 삼성 브라우저:</p>
                  <div className="p-3 bg-white/5 rounded-xl space-y-2.5 border border-white/10">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                      <div>
                        우측 상단 <strong>메뉴 (점 3개 ⋮)</strong> 아이콘 터치
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                      <div>
                        메뉴에서 <strong className="text-amber-300">‘앱 설치’</strong> 또는 <strong className="text-amber-300">‘홈 화면에 추가’</strong> 선택
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                      <div>
                        팝업창에서 <strong>‘설치’</strong>를 누르면 홈 화면에 앱 아이콘이 바로 등록됩니다!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-400/20 text-[11px] text-emerald-300">
                💡 <strong>설치 시 장점:</strong> 브라우저 상단 주소창 없이 네이티브 앱처럼 넓은 화면과 빠른 캐시 로딩 속도로 바로 실행됩니다.
              </div>
            </div>

            <button
              onClick={() => setShowGuideModal(false)}
              className="mt-4 w-full rounded-xl bg-white/10 hover:bg-white/15 py-2.5 text-xs font-semibold text-white transition-colors border border-white/10"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
};
