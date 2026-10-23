import React from 'react';
import { ActiveTab } from '../types';
import { Clock, Calendar, Globe, Cloud, Radar } from 'lucide-react';

interface BottomNavProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab }) => {
  return (
    <nav className="fixed bottom-0 inset-x-0 mx-auto w-full max-w-lg md:hidden h-16 bg-[#0a1120]/95 backdrop-blur-lg border-t border-white/10 flex items-center justify-between px-2 z-40 select-none pb-[env(safe-area-inset-bottom,0px)]">
      <button
        id="tab-hourly"
        onClick={() => onChangeTab('hourly')}
        className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all ${
          activeTab === 'hourly'
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 font-semibold'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Clock className="w-4 h-4" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 whitespace-nowrap">시간별</span>
      </button>

      <button
        id="tab-weekly"
        onClick={() => onChangeTab('weekly')}
        className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all ${
          activeTab === 'weekly'
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 font-semibold'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Calendar className="w-4 h-4" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 whitespace-nowrap">주간예보</span>
      </button>

      <button
        id="tab-radar"
        onClick={() => onChangeTab('radar')}
        className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all ${
          activeTab === 'radar'
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 font-semibold'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Radar className="w-4 h-4 text-blue-400" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 whitespace-nowrap">레이더·노면</span>
      </button>

      <button
        id="tab-national"
        onClick={() => onChangeTab('national')}
        className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all ${
          activeTab === 'national'
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 font-semibold'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Globe className="w-4 h-4" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 whitespace-nowrap">전국날씨</span>
      </button>

      <button
        id="tab-airQuality"
        onClick={() => onChangeTab('airQuality')}
        className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all ${
          activeTab === 'airQuality'
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 font-semibold'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Cloud className="w-4 h-4" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 whitespace-nowrap">미세먼지</span>
      </button>
    </nav>
  );
};
