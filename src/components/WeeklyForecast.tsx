import React from 'react';
import { DailyForecast } from '../types';
import { Calendar } from 'lucide-react';
import { WeatherIcon } from './WeatherIcon';

interface WeeklyForecastProps {
  daily: DailyForecast[];
}

export const WeeklyForecast: React.FC<WeeklyForecastProps> = ({ daily }) => {
  return (
    <section className="flex-1 px-4 py-4 bg-[#0d172a] space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs text-white/90 font-semibold">
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span>7일간 실시간 주간 예보</span>
        </div>
        <div className="text-[11px] text-emerald-300 font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>4대 모델 앙상블 연동</span>
        </div>
      </div>

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
