import React, { useMemo } from 'react';
import { DailyForecast } from '../types';
import { Calendar, Sparkles, CloudSun, Shirt, Umbrella, ArrowUpDown } from 'lucide-react';
import { WeatherIcon } from './WeatherIcon';
import { generateWeeklyWeatherSummary } from '../utils/weatherSummaryGenerator';

interface WeeklyForecastProps {
  daily: DailyForecast[];
}

export const WeeklyForecast: React.FC<WeeklyForecastProps> = ({ daily }) => {
  const weeklySummary = useMemo(() => generateWeeklyWeatherSummary(daily), [daily]);

  return (
    <section className="flex-1 px-4 py-4 bg-[#0d172a] space-y-3.5">
      {/* 0. 이번 주 종합 기상 전망 브리핑 카드 (사용자 요청 반영) */}
      <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 shadow-lg backdrop-blur-md space-y-2.5">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/15 text-blue-300 rounded-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                <span>{weeklySummary.title}</span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  앙상블 전망
                </span>
              </h3>
            </div>
          </div>
          <span className="text-[10.5px] font-mono text-cyan-300/80">
            최고 {weeklySummary.highestDay}
          </span>
        </div>

        {/* 주간 기상 전망 4대 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-1">
            <div className="text-[10.5px] text-white/50 flex items-center gap-1">
              <CloudSun className="w-3.5 h-3.5 text-yellow-400" />
              <span>전반 전망 & 기온 추이</span>
            </div>
            <div className="text-white/90 font-medium leading-relaxed">
              {weeklySummary.headline}
            </div>
          </div>

          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-1">
            <div className="text-[10.5px] text-white/50 flex items-center gap-1">
              <Umbrella className="w-3.5 h-3.5 text-cyan-400" />
              <span>비 소식 및 강수 일정</span>
            </div>
            <div className="text-white/90 font-medium leading-relaxed">
              {weeklySummary.rainSchedule}
            </div>
          </div>

          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-1">
            <div className="text-[10.5px] text-white/50 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>주말(토/일) 기상 전망</span>
            </div>
            <div className="text-white/90 font-medium leading-relaxed">
              {weeklySummary.weekendForecast}
            </div>
          </div>

          <div className="bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20 space-y-1">
            <div className="text-[10.5px] text-blue-300 flex items-center gap-1 font-semibold">
              <Shirt className="w-3.5 h-3.5 text-blue-300" />
              <span>추천 옷차림 & 생활 팁</span>
            </div>
            <div className="text-blue-100 font-medium leading-relaxed">
              {weeklySummary.clothingTip}
            </div>
          </div>
        </div>
      </div>

      {/* 1. 주간 예보 목록 헤더 */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-white/90 font-semibold">
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span>7일간 일별 상세 예보</span>
        </div>
        <div className="text-[11px] text-emerald-300 font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>4대 모델 앙상블 연동</span>
        </div>
      </div>

      {/* 2. 7일간 리스트 */}
      <div className="space-y-2">
        {daily.map((day, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between bg-[#111e36]/80 hover:bg-[#111e36] transition-colors rounded-xl p-3 border border-white/5 text-xs"
          >
            {/* Day name & date */}
            <div className="w-24">
              <div className="font-semibold text-white/90">{day.dayName}</div>
              <div className="text-[10px] text-white/40">{day.dateStr}</div>
            </div>

            {/* Weather Condition */}
            <div className="flex items-center gap-1.5 w-24">
              <div className="w-6 h-6 flex items-center justify-center">
                <WeatherIcon icon={day.conditionIcon} size="md" />
              </div>
              <span className="text-white/80 font-medium">{day.conditionText}</span>
            </div>

            {/* Rain probability & rain amount */}
            <div className="w-20 text-right">
              <div className={`font-semibold ${day.pop > 30 ? 'text-yellow-400' : 'text-white/60'}`}>
                {day.pop}%
              </div>
              {day.rain > 0 ? (
                <div className="text-[10px] text-blue-300 font-mono font-medium">{day.rain} mm</div>
              ) : (
                <div className="text-[10px] text-white/30 font-mono">0.0 mm</div>
              )}
            </div>

            {/* Min / Max Temp Bar */}
            <div className="flex items-center gap-2 pl-2">
              <span className="text-blue-300 font-medium font-mono">{day.minTemp}°</span>
              <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden flex">
                <div className="h-full bg-gradient-to-r from-blue-400 to-yellow-400 rounded-full w-full" />
              </div>
              <span className="text-yellow-300 font-semibold font-mono">{day.maxTemp}°</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
