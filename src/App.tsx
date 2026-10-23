/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  LOCATIONS,
  fetchEnsembleForecast
} from './utils/weatherEngine';
import {
  LocationItem,
  HourlyForecast,
  CurrentWeather,
  DailyForecast,
  ActiveTab,
  RawLogEntry
} from './types';
import { HeaderNav } from './components/HeaderNav';
import { HeroWeather } from './components/HeroWeather';
import { HourlyTableChart } from './components/HourlyTableChart';
import { WeeklyForecast } from './components/WeeklyForecast';
import { NationalWeather } from './components/NationalWeather';
import { AirQuality } from './components/AirQuality';
import { RadarViewer } from './components/RadarViewer';
import { BottomNav } from './components/BottomNav';
import { GasIntegrationModal } from './components/GasIntegrationModal';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export default function App() {
  const [selectedLocation, setSelectedLocation] = useState<LocationItem>(LOCATIONS[0]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('hourly');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [gasUrl, setGasUrl] = useState<string>(() => {
    return localStorage.getItem('GAS_WEBAPP_URL') || '';
  });

  const [currentWeather, setCurrentWeather] = useState<CurrentWeather>({
    location: LOCATIONS[0].fullName,
    temp: 26.0,
    ecmwfTemp: 25.8,
    kmaTemp: 26.3,
    accumRainSoFar: 0.0,
    forecastDailyRain: 0.0,
    conditionText: '연결 중...',
    conditionIcon: '⛅',
    windSpeed: 1.0,
    windDirection: '남',
    isDay: 1,
    updatedAt: '연결 중...',
    dataStatus: 'DIRECT_LIVE'
  });

  const [hourlyList, setHourlyList] = useState<HourlyForecast[]>([]);
  const [dailyList, setDailyList] = useState<DailyForecast[]>([]);
  const [rawLogs, setRawLogs] = useState<RawLogEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 토스트 메시지 자동 해제 타이머
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // 실시간 날씨 데이터 로드 (앙상블 60:40)
  const loadWeatherData = useCallback(
    async (loc: LocationItem, urlToUse?: string) => {
      setIsRefreshing(true);
      try {
        const data = await fetchEnsembleForecast(loc, urlToUse !== undefined ? urlToUse : gasUrl);
        setCurrentWeather(data.current);
        setHourlyList(data.hourly);
        setDailyList(data.daily);
        if (data.rawLogs && data.rawLogs.length > 0) {
          setRawLogs(data.rawLogs);
        }
      } catch (err) {
        console.error('실시간 날씨 데이터 로드 실패:', err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [gasUrl]
  );

  // 초기 렌더링 및 지역 변경 시 즉시 실시간 데이터 호출 + 5분 주기 자동 갱신 및 탭 포커스 시 동기화
  useEffect(() => {
    loadWeatherData(selectedLocation);

    // 5분마다 실시간 자동 갱신 (300,000ms)
    const interval = setInterval(() => {
      loadWeatherData(selectedLocation);
    }, 5 * 60 * 1000);

    // 브라우저 탭 활성화 시 즉시 실시간 재동기화
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadWeatherData(selectedLocation);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedLocation, loadWeatherData]);

  // 실시간 GPS 현재 위치 조회 핸들러
  const handleRequestGPS = () => {
    if (!navigator.geolocation) {
      setToastMessage({
        text: '현재 브라우저 환경에서 Geolocation 위치 조회를 지원하지 않습니다.',
        type: 'error'
      });
      return;
    }

    setIsGpsLoading(true);
    setToastMessage({
      text: '현재 GPS 위치 좌표를 수신하는 중입니다...',
      type: 'info'
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(4));
        const lon = Number(position.coords.longitude.toFixed(4));

        const gpsLocation: LocationItem = {
          id: 'current_gps',
          name: '내 위치',
          fullName: `현재 위치 (위도 ${lat}, 경도 ${lon})`,
          lat: lat,
          lon: lon,
          isDefault: false
        };

        setSelectedLocation(gpsLocation);
        setIsGpsLoading(false);
        setToastMessage({
          text: `현재 위치(위도 ${lat}, 경도 ${lon}) 실시간 날씨를 불러왔습니다.`,
          type: 'success'
        });
      },
      (error) => {
        setIsGpsLoading(false);
        console.warn('GPS 위치 획득 실패:', error);
        let errorMsg = '위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = '위치 접근 권한이 차단되었습니다. 브라우저 주소창에서 위치 권한을 허용해주세요.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = '위치 확인 응답 시간이 초과되었습니다. 다시 시도해주세요.';
        }
        setToastMessage({
          text: errorMsg,
          type: 'error'
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // 수동 새로고침 (기상 데이터 갱신 + PWA 앱 최신 버전 동시 확인)
  const handleRefresh = async () => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => {});
      });
    }
    await loadWeatherData(selectedLocation);
  };

  // GAS URL 저장 핸들러
  const handleSaveGasUrl = (url: string) => {
    setGasUrl(url);
    localStorage.setItem('GAS_WEBAPP_URL', url);
    loadWeatherData(selectedLocation, url);
  };

  const handleSelectCityFromNational = (cityName: string) => {
    const found = LOCATIONS.find((l) => cityName.includes(l.name));
    if (found) {
      setSelectedLocation(found);
    }
    setActiveTab('hourly');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans antialiased">
      {/* Dynamic Responsive Frame: Mobile w-full max-w-lg mx-auto | Desktop lg:max-w-7xl lg:px-6 */}
      <div className="relative flex flex-col w-full max-w-lg lg:max-w-7xl mx-auto min-h-screen bg-[#0d1627] shadow-2xl pb-20 md:pb-8 lg:pb-12 border-x border-white/5">
        
        {/* 1. Header Navigation Bar (초장동 + 실시간 GPS + 데스크톱 상단 탭 메뉴) */}
        <HeaderNav
          locations={LOCATIONS}
          selectedLocation={selectedLocation}
          onSelectLocation={(loc) => setSelectedLocation(loc)}
          onOpenModal={() => setIsModalOpen(true)}
          onRequestGPS={handleRequestGPS}
          isGpsLoading={isGpsLoading}
          activeTab={activeTab}
          onChangeTab={(tab) => setActiveTab(tab)}
        />

        {/* 안내 및 오류 토스트 알림 */}
        {toastMessage && (
          <div
            id="toastNotification"
            className={`mx-3 sm:mx-4 mt-2 px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all shadow-lg border ${
              toastMessage.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-600/40'
                : toastMessage.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-600/40'
                : 'bg-blue-950/90 text-blue-200 border-blue-600/40'
            }`}
          >
            <div className="flex items-center gap-2 pr-2">
              {toastMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className="leading-snug">{toastMessage.text}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-white/60 hover:text-white shrink-0 cursor-pointer"
              aria-label="알림 닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 메인 뷰포트: 모바일은 1열 수직 배열, 데스크톱(lg 이상)은 2열 분할 와이드 관제 레이아웃 */}
        <div className="lg:p-4 lg:grid lg:grid-cols-12 lg:gap-6 items-start">
          {/* 좌측 관제 컬럼 (lg: 4.5열): 실시간 히어로 날씨 카드 + 고정 실황 */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            <HeroWeather
              current={currentWeather}
              location={selectedLocation}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
            />

            {/* 데스크톱 전용 퀵 위젯: 대기질 요약 (대기질 탭이 아닐 때 좌측 하단에 상시 표출하여 종합 관제성 극대화) */}
            <div className="hidden lg:block">
              {activeTab !== 'airQuality' && (
                <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white/90 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      초전동 대기 환경 지수 요약
                    </span>
                    <button
                      onClick={() => setActiveTab('airQuality')}
                      className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      상세보기 &rarr;
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                      <div className="text-[10.5px] text-white/50">초미세먼지 (PM2.5)</div>
                      <div className="text-sm font-bold text-emerald-300 mt-0.5">14 ㎍/㎥ (좋음)</div>
                    </div>
                    <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                      <div className="text-[10.5px] text-white/50">미세먼지 (PM10)</div>
                      <div className="text-sm font-bold text-emerald-300 mt-0.5">28 ㎍/㎥ (좋음)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 우측 관제 컬럼 (lg: 7.5열): 선택된 탭별 정밀 분석 콘텐츠 */}
          <div className="lg:col-span-7 xl:col-span-8 min-w-0">
            {activeTab === 'hourly' && <HourlyTableChart hourly={hourlyList} />}
            {activeTab === 'weekly' && <WeeklyForecast daily={dailyList} />}
            {activeTab === 'radar' && (
              <RadarViewer location={selectedLocation} currentWeather={currentWeather} />
            )}
            {activeTab === 'national' && (
              <NationalWeather
                onSelectCity={handleSelectCityFromNational}
                currentJinju={currentWeather}
              />
            )}
            {activeTab === 'airQuality' && <AirQuality location={selectedLocation} />}
          </div>
        </div>

        {/* 4. 하단 네비게이션 바 (모바일 전용 md:hidden) */}
        <BottomNav activeTab={activeTab} onChangeTab={(tab) => setActiveTab(tab)} />

        {/* 5. 구글 시트 & 백엔드 연동 모달 */}
        <GasIntegrationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          gasUrl={gasUrl}
          onSaveGasUrl={handleSaveGasUrl}
          rawLogs={rawLogs}
          currentWeather={currentWeather}
        />

      </div>
    </div>
  );
}
