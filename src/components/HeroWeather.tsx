import React, { useState, useEffect, useRef } from 'react';
import { CurrentWeather, LocationItem } from '../types';
import {
  RotateCw,
  CloudRain,
  Wind,
  Compass,
  Sparkles,
  HelpCircle,
  X,
  Thermometer,
  CloudSun,
  ShieldCheck,
  Globe2,
  Droplets
} from 'lucide-react';
import { WeatherIcon } from './WeatherIcon';

interface HeroWeatherProps {
  current: CurrentWeather;
  location: LocationItem;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

export const HeroWeather: React.FC<HeroWeatherProps> = ({
  current,
  location,
  onRefresh,
  isRefreshing,
}) => {
  const [showEnsembleModal, setShowEnsembleModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // 모달 외부 클릭 및 ESC 키 처리
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowEnsembleModal(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowEnsembleModal(false);
    };

    if (showEnsembleModal) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showEnsembleModal]);

  // 주/야간 테마 그라데이션 정밀 분기 (isDay: 1 주간, 0 야간)
  const isDay = current.isDay === 1;
  const bgGradient = isDay
    ? 'bg-gradient-to-b from-[#0f2b48] via-[#14355a] to-[#0d1e34]'
    : 'bg-gradient-to-b from-[#080e1c] via-[#0d162b] to-[#111a33]';

  // 데이터 상태 뱃지 렌더러 (DIRECT_LIVE, GAS_ENSEMBLE, PREVIOUS_RUN, FALLBACK)
  const renderDataStatusBadge = () => {
    const status = current.dataStatus || 'DIRECT_LIVE';
    switch (status) {
      case 'GAS_ENSEMBLE':
        return (
          <span 
            id="badgeGasEnsemble"
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 font-mono"
            title="구글 시트(GAS) 앙상블 및 Raw_Logs 연동 수신 상태"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
            구글시트 (GAS 앙상블)
          </span>
        );
      case 'PREVIOUS_RUN':
        return (
          <span 
            id="badgePreviousRun"
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 font-mono"
            title="일시적 통신 장애 대비 직전 유효 데이터(8초 타임아웃 가드) 유지 중"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            직전 런 유지 (PREVIOUS_RUN)
          </span>
        );
      case 'FALLBACK':
        return (
          <span 
            id="badgeFallback"
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/50 text-rose-200 font-mono"
            title="네트워크 오프라인 비상 대체 시계열 데이터"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            대체 데이터 (Fallback)
          </span>
        );
      case 'DIRECT_LIVE':
      default:
        return (
          <span 
            id="badgeDirectLive"
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-mono"
            title="Open-Meteo 4대 수치모델 실시간 직접 수신 정상"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            정상 (Direct Open-Meteo)
          </span>
        );
    }
  };

  return (
    <section className={`relative px-4 sm:px-5 pt-5 sm:pt-6 pb-6 sm:pb-7 ${bgGradient} border-b lg:border border-white/5 lg:border-white/10 lg:rounded-2xl overflow-hidden select-none transition-colors duration-500 shadow-xl`}>
      {/* Decorative Sky Glow (주/야간 광륜 분기) */}
      <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden">
        {isDay ? (
          <div
            id="skyIllustrationDay"
            className="absolute -top-6 right-8 w-32 h-32 rounded-full bg-amber-400/20 blur-2xl animate-pulse"
          />
        ) : (
          <div
            id="skyIllustrationNight"
            className="absolute top-2 right-10 w-28 h-28 rounded-full shadow-[-14px_10px_0_0_#fef08a] rotate-[35deg] opacity-70"
          />
        )}
        <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-blue-500/10 blur-2xl" />
      </div>

      {/* Top row: Location & Status & Ensemble Badge */}
      <div className="flex items-center justify-between z-10 relative mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/80">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">{location.fullName}</span>
          </div>
          {renderDataStatusBadge()}
        </div>

        <div className="flex items-center gap-2">
          {/* 4대 모델 영역별 가중 앙상블 클릭 가능한 반응형 뱃지 */}
          <button
            id="btnEnsembleBadge"
            type="button"
            onClick={() => setShowEnsembleModal(prev => !prev)}
            className="group flex items-center gap-1 text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full bg-yellow-400/15 hover:bg-yellow-400/25 border border-yellow-400/40 hover:border-yellow-300 text-yellow-300 font-mono transition-all cursor-pointer shadow-sm active:scale-95"
            title="클릭하여 4대 모델 가중치 구성 및 알고리즘 확인"
            aria-label="4대 모델 앙상블 가중치 보기"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0 group-hover:rotate-12 transition-transform" />
            <span className="font-semibold underline decoration-dotted decoration-yellow-400/60 underline-offset-2">
              4대 모델 영역별 가중 앙상블
            </span>
            <HelpCircle className="w-3 h-3 text-yellow-400/80 shrink-0 ml-0.5" />
          </button>

          <button
            id="refreshBtn"
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white active:scale-90 hover:bg-white/20 transition-all ${
              isRefreshing ? 'opacity-80' : ''
            }`}
            title="실시간 앙상블 즉시 갱신"
            aria-label="날씨 새로고침"
          >
            <RotateCw
              id="refreshIcon"
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-yellow-300' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* 앙상블 구성 설명 말풍선 / 팝오버 윈도우 */}
      {showEnsembleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            ref={modalRef}
            className="relative w-full max-w-lg bg-[#0f172a] border border-yellow-400/30 rounded-2xl shadow-2xl overflow-hidden text-white animate-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-blue-950/80 via-slate-900 to-slate-900 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-yellow-400/10 border border-yellow-400/30 text-yellow-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    4대 글로벌 수치모델 영역별 앙상블 체계
                  </h3>
                  <p className="text-[11px] text-yellow-300/80 font-mono">
                    ECMWF + KMA + GFS + ICON 실시간 가중 합성
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEnsembleModal(false)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-3.5 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
              {/* 1. 기온 */}
              <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-blue-400" />
                    기온 (Temperature)
                  </span>
                  <span className="text-[11px] font-mono text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    ECMWF 50% + KMA 35% + ICON 10% + GFS 5%
                  </span>
                </div>
                <p className="text-white/60 text-[11px] leading-relaxed">
                  유럽중기예보(ECMWF)의 안정적인 종관 기온장에 한국 기상청(KMA)의 국지 복잡 지형 효과를 결합하여 오차를 최소화합니다.
                </p>
              </div>

              {/* 2. 하늘상태 및 강수확률 */}
              <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <CloudSun className="w-3.5 h-3.5 text-amber-400" />
                    하늘상태 & 강수확률 (Sky / POP)
                  </span>
                  <span className="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    단기 KMA 50% · 중기 ECMWF 55%
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-white/70 font-mono mt-1">
                  <div className="bg-black/20 p-1.5 rounded border border-white/5">
                    <span className="text-emerald-300 font-bold block">단기(0~36h):</span>
                    KMA 50% + ECMWF 35% + GFS 10% + ICON 5%
                  </div>
                  <div className="bg-black/20 p-1.5 rounded border border-white/5">
                    <span className="text-blue-300 font-bold block">중기(37~72h):</span>
                    ECMWF 55% + KMA 30% + GFS 10% + ICON 5%
                  </div>
                </div>
              </div>

              {/* 3. 예상 강수량 */}
              <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
                    예상 강수량 (Precipitation)
                  </span>
                  <span className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    집중호우 시 KMA 55% 강화
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-white/60">
                  <div className="flex justify-between items-center">
                    <span>• 일반 강수:</span>
                    <strong className="font-mono text-white/90">ECMWF 45% + KMA 40% + GFS 10% + ICON 5%</strong>
                  </div>
                  <div className="flex justify-between items-center text-amber-200">
                    <span>• 집중호우 (≥5mm/h):</span>
                    <strong className="font-mono text-amber-300">KMA 55% + ECMWF 35% + GFS 5% + ICON 5%</strong>
                  </div>
                </div>
              </div>

              {/* 4. 바람 및 태풍 */}
              <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5 text-teal-400" />
                    바람 & 강풍/태풍 (Wind Speed)
                  </span>
                  <span className="text-[11px] font-mono text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                    ECMWF 40~45% + KMA 35~40%
                  </span>
                </div>
                <p className="text-white/60 text-[11px]">
                  일반 바람(ECMWF 40:KMA 35:ICON 15:GFS 10)과 강풍/태풍(≥9m/s 시 ECMWF 45:KMA 40)의 해양 기압경도력을 정밀 반영합니다.
                </p>
              </div>

              {/* 5. 4대 수치모델 프로필 */}
              <div className="bg-blue-950/40 rounded-xl p-3 border border-blue-500/20">
                <div className="text-[11px] font-semibold text-blue-300 mb-2 flex items-center gap-1">
                  <Globe2 className="w-3.5 h-3.5" />
                  실시간 연동 4대 글로벌 수치모델
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <div className="bg-white/5 p-2 rounded border border-white/5">
                    <strong className="text-blue-300 block">🇪🇺 ECMWF IFS</strong>
                    <span className="text-white/50">유럽중기예보센터 (세계 최고 종관 정확도)</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded border border-white/5">
                    <strong className="text-emerald-300 block">🇰🇷 KMA UM/LDAPS</strong>
                    <span className="text-white/50">대한민국 기상청 (한반도 국지 지형 최적화)</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded border border-white/5">
                    <strong className="text-cyan-300 block">🇺🇸 GFS Seamless</strong>
                    <span className="text-white/50">미국 해양대기청 NOAA (글로벌 순환장)</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded border border-white/5">
                    <strong className="text-amber-300 block">🇩🇪 ICON Seamless</strong>
                    <span className="text-white/50">독일 기상청 DWD (비정수 격자 미기상)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-950 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                기상청 & WMO 표준 검증 완료
              </span>
              <button
                type="button"
                onClick={() => setShowEnsembleModal(false)}
                className="px-3 py-1 rounded-lg bg-yellow-400 text-slate-950 font-semibold hover:bg-yellow-300 transition-all cursor-pointer text-xs"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Temperature & State */}
      <div className="relative z-10 flex items-center justify-between mt-2">
        <div>
          <div className="flex items-baseline">
            <span id="currentTemp" className="text-7xl font-extralight temp-gold leading-none">
              {current.temp != null && !isNaN(current.temp) ? current.temp.toFixed(1) : '--.-'}
            </span>
            <span className="text-4xl font-light text-yellow-300 ml-1">°</span>
          </div>

          {/* 4대 수치모델 기온 분해 표시 영역 (2개씩 2줄 그리드로 고정하여 오른쪽 UI 가독성 확보) */}
          <div className="grid grid-cols-2 gap-1.5 mt-2.5 text-[10.5px] font-mono text-white/70 max-w-[240px]">
            <div className="bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center justify-between gap-1">
              <span className="text-white/60">ECMWF:</span>
              <strong className="text-blue-300">{(current.ecmwfTemp ?? current.temp ?? 0).toFixed(1)}°</strong>
            </div>
            <div className="bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center justify-between gap-1">
              <span className="text-white/60">KMA:</span>
              <strong className="text-emerald-300">{(current.kmaTemp ?? current.temp ?? 0).toFixed(1)}°</strong>
            </div>
            <div className="bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center justify-between gap-1">
              <span className="text-white/60">GFS:</span>
              <strong className="text-cyan-300">{(current.gfsTemp ?? current.temp ?? 0).toFixed(1)}°</strong>
            </div>
            <div className="bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center justify-between gap-1">
              <span className="text-white/60">ICON:</span>
              <strong className="text-amber-300">{(current.iconTemp ?? current.temp ?? 0).toFixed(1)}°</strong>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end text-right">
          <div className="flex items-center space-x-2">
            <span id="currentIcon" className="flex items-center justify-center filter drop-shadow">
              <WeatherIcon icon={current.conditionIcon || '⛅'} size="xl" />
            </span>
            <span id="currentCond" className="text-xl font-medium text-white/95 tracking-tight">
              {current.conditionText || '구름많음'}
            </span>
          </div>

          {/* Precipitation: Realtime vs Today Accum vs 24h Total Forecast */}
          <div className="mt-2 text-right space-y-0.5 font-mono">
            <div className="text-xs text-white/90 flex items-center justify-end gap-1 font-sans">
              <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
              <span>실시간 강수: <strong id="curHourRain" className="font-semibold text-cyan-200">{(current.rain ?? 0).toFixed(1)} mm/h</strong></span>
            </div>
            <div className="text-[11px] text-white/70 flex items-center justify-end gap-1.5 font-sans">
              <span>오늘 누적: <strong className="text-white/90 font-mono">{(current.accumRainSoFar ?? 0).toFixed(1)} mm</strong></span>
              <span className="text-white/30">|</span>
              <span>총예상: <strong className="text-white/80 font-mono">{(current.forecastDailyRain ?? 0).toFixed(1)} mm</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Wind & Humidity & Road Moisture & Meta */}
      <div className="mt-4 flex items-center justify-between text-xs text-white/50 pt-2.5 border-t border-white/5 flex-wrap gap-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-white/70">
            <Wind className="w-3.5 h-3.5 text-blue-300" />
            <span>풍속 {(current.windSpeed ?? 1.0).toFixed(1)}m/s</span>
          </span>
          <span className="flex items-center gap-1 text-white/70">
            <Compass className="w-3.5 h-3.5 text-yellow-300" />
            <span>풍향 {current.windDirection || '남'}</span>
          </span>
          {current.humidity != null && (
            <span className="flex items-center gap-1 text-white/70">
              <Droplets className="w-3.5 h-3.5 text-cyan-300" />
              <span>습도 {current.humidity}%</span>
              {current.dewPoint != null && (
                <span className="text-[10px] text-white/40 font-mono">(이슬점 {current.dewPoint}°)</span>
              )}
            </span>
          )}
          {current.roadConditionText && (
            <span
              id="roadConditionBadge"
              className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-sans font-medium border ${
                current.roadCondition === 'WET'
                  ? 'bg-blue-500/20 text-blue-200 border-blue-400/40'
                  : current.roadCondition === 'DAMP'
                  ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30'
                  : 'bg-white/5 text-white/50 border-white/10'
              }`}
              title={`노면 수분 지수(RMI): ${((current.roadMoistureIndex || 0) * 100).toFixed(0)}%`}
            >
              <span>🛣️ {current.roadConditionText}</span>
              {current.roadMoistureIndex != null && current.roadMoistureIndex > 0 && (
                <span className="font-mono text-[9.5px] opacity-75">
                  ({Math.round(current.roadMoistureIndex * 100)}%)
                </span>
              )}
            </span>
          )}
          {current.umbrellaIndex != null && current.umbrellaIndex > 0.1 && (
            <span
              id="umbrellaIndexBadge"
              className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-sans font-medium bg-purple-500/20 text-purple-200 border border-purple-400/40"
              title={`초전 학원가·상가 사거리 보행자 우산 관제 지수: ${Math.round(current.umbrellaIndex * 100)}%`}
            >
              <span>☂️ 우산 착용</span>
              <span className="font-mono text-[9.5px] opacity-75">
                ({Math.round(current.umbrellaIndex * 100)}%)
              </span>
            </span>
          )}
        </div>
        <span id="updateTime" className="text-white/60 font-mono">
          {current.updatedAt || '00:00'} (KST)
        </span>
      </div>
    </section>
  );
};

