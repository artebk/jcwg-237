import React from 'react';
import { LocationItem, ActiveTab } from '../types';
import { Menu, Database, LocateFixed, Loader2, MapPin, Clock, Calendar, Globe, Cloud, Radar } from 'lucide-react';
import { useDragScroll } from '../utils/useDragScroll';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderNavProps {
  locations: LocationItem[];
  selectedLocation: LocationItem;
  onSelectLocation: (loc: LocationItem) => void;
  onOpenModal: () => void;
  onRequestGPS: () => void;
  isGpsLoading: boolean;
  activeTab?: ActiveTab;
  onChangeTab?: (tab: ActiveTab) => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  locations,
  selectedLocation,
  onSelectLocation,
  onOpenModal,
  onRequestGPS,
  isGpsLoading,
  activeTab = 'hourly',
  onChangeTab,
}) => {
  const tabsScroll = useDragScroll<HTMLDivElement>({ dragSpeed: 1.2, enableWheel: false });
  const isGpsActive = selectedLocation.id === 'current_gps';

  const NAV_TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'hourly', label: '시간별', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'weekly', label: '주간예보', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'radar', label: '레이더·노면', icon: <Radar className="w-3.5 h-3.5" /> },
    { id: 'national', label: '전국날씨', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'airQuality', label: '미세먼지', icon: <Cloud className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-3 sm:px-4 bg-[#0d1627]/95 backdrop-blur-md border-b border-white/10 select-none">
      {/* 좌측: 메뉴 & 지역 탭 & GPS 버튼 */}
      <div className="flex items-center min-w-0 flex-1 mr-2">
        <button
          id="menuBtn"
          onClick={onOpenModal}
          className="p-2 mr-1 sm:mr-2 text-white/80 hover:text-white active:scale-95 transition-transform rounded-lg hover:bg-white/5 flex items-center gap-1 shrink-0"
          title="Google Apps Script 및 시트 연동 설정"
          aria-label="메뉴 및 연동 설정"
        >
          <Menu className="w-5 h-5 text-yellow-400" />
        </button>

        <div
          ref={tabsScroll.ref}
          {...tabsScroll.events}
          className={`flex items-center space-x-2 sm:space-x-3 overflow-x-auto no-scrollbar py-1 flex-1 cursor-grab active:cursor-grabbing ${
            tabsScroll.isDragging ? 'cursor-grabbing' : ''
          }`}
        >
          {/* 기본 고정 지역 (초장동) */}
          {locations.map((loc) => {
            const isActive = selectedLocation.id === loc.id;
            return (
              <button
                key={loc.id}
                id={`loc-tab-${loc.id}`}
                onClick={() => onSelectLocation(loc)}
                className={`whitespace-nowrap px-2 py-1 transition-all relative flex items-center gap-1 ${
                  isActive
                    ? 'text-sm sm:text-base font-bold text-white'
                    : 'text-xs sm:text-sm font-normal text-white/50 hover:text-white/80'
                }`}
              >
                <span>{loc.name}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-full transition-all" />
                )}
              </button>
            );
          })}

          {/* 실시간 GPS 현재 위치 조회 버튼 */}
          <button
            id="btnRequestGPS"
            onClick={onRequestGPS}
            disabled={isGpsLoading}
            className={`whitespace-nowrap px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 shrink-0 text-xs font-medium border ${
              isGpsActive
                ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50 font-semibold shadow-sm'
                : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
            } ${isGpsLoading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
            title="현재 실시간 GPS 위치로 날씨 예보를 조회합니다"
          >
            {isGpsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : isGpsActive ? (
              <MapPin className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span className="hidden sm:inline">
              {isGpsLoading ? '위치 찾는 중...' : isGpsActive ? '내 위치 (GPS)' : '내 위치로 날씨 받기'}
            </span>
            <span className="sm:hidden">
              {isGpsLoading ? '탐색중' : isGpsActive ? '내위치' : 'GPS'}
            </span>
          </button>
        </div>
      </div>

      {/* 중앙/우측: 데스크톱 전용 탭 내비게이션 (md 이상 화면에서 자동 노출) */}
      {onChangeTab && (
        <nav
          aria-label="데스크톱 탭 메뉴"
          className="hidden md:flex items-center gap-1 bg-slate-900/90 border border-white/10 rounded-xl p-1 mx-2 shrink-0 shadow-inner"
        >
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChangeTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* 우측 유틸리티 버튼 (PWA 설치 & Apps Script 모달) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <PWAInstallButton variant="header" />
        <button
          id="gasQuickBtn"
          onClick={onOpenModal}
          className="px-2.5 py-1 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center gap-1.5 hover:bg-blue-500/30 transition-colors shrink-0"
          title="구글 시트 연동 설정"
        >
          <Database className="w-3 h-3 text-yellow-400" />
          <span className="hidden sm:inline font-mono text-[11px]">Apps Script</span>
          <span className="sm:hidden font-mono text-[10px]">시트</span>
        </button>
      </div>
    </header>
  );
};
