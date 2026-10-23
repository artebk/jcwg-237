import React, { useState, useEffect, useCallback } from 'react';
import { NATIONAL_CITIES, fetchRealtimeNationalWeather } from '../utils/weatherEngine';
import { CurrentWeather, NationalCity } from '../types';
import { CloudRain, MapPin, RefreshCw } from 'lucide-react';
import { WeatherIcon } from './WeatherIcon';

interface NationalWeatherProps {
  onSelectCity: (cityName: string) => void;
  currentJinju?: CurrentWeather;
}

export const NationalWeather: React.FC<NationalWeatherProps> = ({ onSelectCity, currentJinju }) => {
  const [cities, setCities] = useState<NationalCity[]>(NATIONAL_CITIES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  const loadRealtimeData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchRealtimeNationalWeather(currentJinju);
      setCities(data);
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' }));
    } catch (e) {
      console.warn('전국 날씨 로드 실패:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentJinju]);

  useEffect(() => {
    loadRealtimeData();
  }, [loadRealtimeData]);

  const getWeatherIcon = (cond: string) => {
    if (cond.includes('비가능성') || cond.includes('소나기가능성') || cond.includes('비 가능성') || cond.includes('소나기 가능성')) return 'cloud-doubt-rain';
    if (cond.includes('뇌우')) return '⛈️';
    if (cond.includes('눈')) return '❄️';
    if (cond.includes('소나기')) return '🌦️';
    if (cond.includes('비')) return '🌧️';
    if (cond.includes('흐림')) return '☁️';
    if (cond.includes('구름')) return '⛅';
    if (cond.includes('맑음')) return '☀️';
    return '⛅';
  };

  return (
    <div className="flex-1 px-4 py-4 bg-[#0d172a] space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-white/90 flex items-center gap-1">
          <MapPin className="w-4 h-4 text-blue-400" />
          전국 주요 도시 실시간 날씨
        </h3>
        <div className="flex items-center gap-2">
          {lastSyncTime && (
            <span className="text-[10px] text-emerald-300 font-mono">
              {lastSyncTime} 동기화
            </span>
          )}
          <button
            onClick={loadRealtimeData}
            disabled={isLoading}
            className="p-1 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="전국 날씨 실시간 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {cities.map((city) => (
          <div
            key={city.id}
            onClick={() => onSelectCity(city.name)}
            className={`p-3 rounded-xl bg-[#111e36]/90 border transition-all cursor-pointer flex flex-col justify-between ${
              city.id === 'jinju'
                ? 'border-yellow-400/40 bg-[#162744] ring-1 ring-yellow-400/20'
                : 'border-white/5 hover:border-blue-400/40 hover:bg-[#152544]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-sm text-white/90">{city.name}</span>
                {city.id === 'jinju' && (
                  <span className="px-1 py-0.2 bg-yellow-400/20 text-yellow-300 text-[9px] rounded font-bold">
                    현재
                  </span>
                )}
              </div>
              <div className="w-7 h-7 flex items-center justify-center">
                <WeatherIcon icon={city.conditionIcon || getWeatherIcon(city.condition)} size="lg" />
              </div>
            </div>

            <div className="flex items-end justify-between mt-3">
              <div>
                <span className="text-2xl font-light text-yellow-300 font-mono">{city.temp}°</span>
                <span className="block text-[11px] text-white/50">{city.condition}</span>
              </div>
              <div className="text-right">
                {city.pop > 0 && (
                  <span className="text-[11px] text-yellow-400 font-medium flex items-center gap-0.5 justify-end">
                    <CloudRain className="w-3 h-3 text-blue-400" />
                    {city.pop}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
