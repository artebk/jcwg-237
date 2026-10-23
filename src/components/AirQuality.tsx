import React, { useState, useEffect, useCallback } from 'react';
import { AIR_QUALITY_SAMPLE, fetchRealtimeAirQuality } from '../utils/weatherEngine';
import { AirQualityData, LocationItem } from '../types';
import { Wind, Activity, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';

interface AirQualityProps {
  location: LocationItem;
}

export const AirQuality: React.FC<AirQualityProps> = ({ location }) => {
  const [data, setData] = useState<AirQualityData>(AIR_QUALITY_SAMPLE);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  const loadAirData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchRealtimeAirQuality(location.lat, location.lon);
      setData(res);
      const now = new Date();
      setLastSyncTime(
        now.toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Seoul'
        })
      );
    } catch (e) {
      console.warn('대기질 로드 실패:', e);
    } finally {
      setIsLoading(false);
    }
  }, [location.lat, location.lon]);

  useEffect(() => {
    loadAirData();
  }, [loadAirData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case '좋음':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case '보통':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case '나쁨':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case '매우나쁨':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default:
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    }
  };

  const getAqiDescription = (status: string) => {
    switch (status) {
      case '좋음':
        return '공기가 맑고 쾌적하여 야외 활동에 매우 적합합니다.';
      case '보통':
        return '실외 활동 시 무리가 없는 보통 수준의 공기질입니다.';
      case '나쁨':
        return '호흡기 민감군 및 어린이는 장시간 실외 활동을 자제하세요.';
      case '매우나쁨':
        return '미세먼지 경보 수준입니다. 외출을 자제하고 마스크를 착용하세요.';
      default:
        return '실시간 대기 환경 지수입니다.';
    }
  };

  return (
    <div className="flex-1 px-4 py-4 bg-[#0d172a] space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-white/90">{location.name} 실시간 대기질</h3>
        <div className="flex items-center gap-2">
          {lastSyncTime && (
            <span className="text-[10px] text-emerald-300 font-mono">
              {lastSyncTime} 동기화
            </span>
          )}
          <button
            onClick={loadAirData}
            disabled={isLoading}
            className="p-1 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="대기질 실시간 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Hero AQI Card */}
      <div className="bg-[#111e36]/90 rounded-2xl p-4 border border-white/5 flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-xs text-white/60">통합대기환경지수 (CAI)</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extralight text-emerald-400 font-mono">
              {data.aqiScore}
            </span>
            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getStatusColor(data.overallStatus)}`}>
              {data.overallStatus}
            </span>
          </div>
          <p className="text-xs text-white/70 pt-1">
            {getAqiDescription(data.overallStatus)}
          </p>
        </div>
        <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
          {data.overallStatus === '나쁨' || data.overallStatus === '매우나쁨' ? (
            <AlertCircle className="w-8 h-8 text-amber-400" />
          ) : (
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          )}
        </div>
      </div>

      {/* 4 Detail Metric Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-[#111e36]/90 border border-white/5">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span>미세먼지 (PM10)</span>
            <Wind className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-mono text-white font-light">{data.pm10}</span>
            <span className="text-[10px] text-white/40">㎍/㎥</span>
          </div>
          <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-medium rounded border ${getStatusColor(data.pm10Status)}`}>
            {data.pm10Status}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#111e36]/90 border border-white/5">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span>초미세먼지 (PM2.5)</span>
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-mono text-white font-light">{data.pm25}</span>
            <span className="text-[10px] text-white/40">㎍/㎥</span>
          </div>
          <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-medium rounded border ${getStatusColor(data.pm25Status)}`}>
            {data.pm25Status}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#111e36]/90 border border-white/5">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span>오존 (O₃)</span>
            <span className="text-[10px] text-white/40">ppm</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-mono text-white font-light">{data.o3}</span>
            <span className="text-[10px] text-white/40">ppm</span>
          </div>
          <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-medium rounded border ${getStatusColor(data.o3Status)}`}>
            {data.o3Status}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#111e36]/90 border border-white/5">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span>이산화질소 (NO₂)</span>
            <span className="text-[10px] text-white/40">ppm</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-mono text-white font-light">{data.no2}</span>
            <span className="text-[10px] text-white/40">ppm</span>
          </div>
          <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-medium rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
            좋음
          </span>
        </div>
      </div>
    </div>
  );
};
