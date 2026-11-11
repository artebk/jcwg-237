import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { HourlyForecast } from '../types';
import { useDragScroll } from '../utils/useDragScroll';
import { MoveHorizontal, Navigation, Sparkles, Thermometer, CloudRain, Wind } from 'lucide-react';
import { WeatherIcon } from './WeatherIcon';
import { generateDailyWeatherSummary } from '../utils/weatherSummaryGenerator';

interface HourlyTableChartProps {
  hourly: HourlyForecast[];
}

type TimelineFilter = 'all' | 'past' | 'short12' | 'mid36' | 'extended72';

export const HourlyTableChart: React.FC<HourlyTableChartProps> = ({ hourly }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<TimelineFilter>('all');

  // 마우스 드래그 횡스크롤 훅 적용
  const tableScroll = useDragScroll<HTMLDivElement>({ dragSpeed: 1.3, enableWheel: true });
  const filterScroll = useDragScroll<HTMLDivElement>({ dragSpeed: 1.2, enableWheel: false });

  // 필터별 아이템 선별 (A안: 단기 12h 1시간 간격, 중기 36h 2시간 간격, 확장 72h 4시간 간격)
  const filteredItems = useMemo(() => {
    if (!hourly || hourly.length === 0) return [];
    if (filterMode === 'past') {
      return hourly.filter((h) => h.isPast);
    }
    if (filterMode === 'short12') {
      return hourly.filter((h) => h.isCurrent || h.segmentType === 'forecast12' || h.segmentType === 'forecast24');
    }
    if (filterMode === 'mid36') {
      return hourly.filter((h) => h.segmentType === 'forecast36' || h.segmentType === 'forecast48');
    }
    if (filterMode === 'extended72') {
      return hourly.filter((h) => h.segmentType === 'extended72');
    }
    return hourly;
  }, [hourly, filterMode]);

  const items = filteredItems;

  // 전체 hourly 데이터 기준 현재 시점 인덱스 파악
  const curIdxInHourly = useMemo(() => {
    return hourly ? hourly.findIndex((h) => h.isCurrent) : -1;
  }, [hourly]);

  // 오늘 날씨 핵심 브리핑 요약 (React Rules of Hooks 준수를 위해 early return 이전에 호출)
  const dailySummary = useMemo(() => generateDailyWeatherSummary(hourly), [hourly]);

  const colWidth = 66;

  // 현재 시점(isCurrent)을 가로 스크롤 영역 정가운데로 이동시키는 함수
  const scrollToCurrent = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!tableScroll.ref.current) return;
    const currentItemIdx = items.findIndex((item) => item.isCurrent);
    if (currentItemIdx !== -1) {
      const container = tableScroll.ref.current;
      const targetCenterX = colWidth * currentItemIdx + colWidth / 2;
      const targetScrollLeft = Math.max(0, targetCenterX - container.clientWidth / 2);
      container.scrollTo({
        left: targetScrollLeft,
        behavior
      });
    }
  }, [items, colWidth, tableScroll.ref]);

  // 컴포넌트 마운트, 데이터 로드, 필터 변경 시 자동으로 현재 시점을 화면 정가운데에 배치
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToCurrent('smooth');
    }, 100);
    return () => clearTimeout(timer);
  }, [items, filterMode, scrollToCurrent]);

  if (!hourly || hourly.length === 0) {
    return (
      <section className="flex-1 px-3 py-6 bg-[#0d172a] text-center text-white/50 text-xs">
        시간별 시계열 예보를 불러오는 중입니다...
      </section>
    );
  }

  // 동적 SVG 기온 차트 연산 (5°C 동적 마진 Y축 안정화 기법 적용)
  const temps = items.map((i) => i.temp);
  const actualMin = temps.length > 0 ? Math.min(...temps) : 20;
  const actualMax = temps.length > 0 ? Math.max(...temps) : 30;
  const rawRange = actualMax - actualMin;

  // 최소 5°C 동적 여백(Dynamic Margin) 확보로 기온 미세 변화 시 곡선 과장 왜곡 방지
  const stabilizedRange = Math.max(5, rawRange);
  const rangePadding = (stabilizedRange - rawRange) / 2;
  const chartMin = actualMin - rangePadding;
  const chartMax = actualMax + rangePadding;
  const range = chartMax - chartMin || 5;

  const svgWidth = Math.max(items.length * colWidth, 400);
  const svgHeight = 84;

  const points = items.map((item, idx) => {
    const cx = Math.round(colWidth * idx + colWidth / 2);
    // Y 좌표 정규화: 상단 20px ~ 하단 64px 사이 부드럽게 안정화 배치
    const cy = Math.round(64 - ((item.temp - chartMin) / range) * 44);
    return { cx, cy, temp: item.temp, isPast: item.isPast, isCurrent: item.isCurrent };
  });

  const polylinePoints = points.map((p) => `${p.cx},${p.cy}`).join(' ');

  const hasCurrentInItems = items.some((item) => item.isCurrent);

  return (
    <section className="flex-1 px-3 py-4 bg-[#0d172a]">
      {/* 0. 오늘의 날씨 핵심 브리핑 & 생활 가이드 카드 (신규 추가) */}
      <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 shadow-lg backdrop-blur-md mb-3.5 space-y-2.5">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-yellow-400/15 text-yellow-300 rounded-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                <span>{dailySummary.title}</span>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                  4대 모델 종합
                </span>
              </h3>
            </div>
          </div>
          <span className="text-[11px] font-mono text-white/50">
            일교차 {dailySummary.tempDiff}°C
          </span>
        </div>

        {/* 4대 주요 기상 요약 그리드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-1">
            <div className="text-[10.5px] text-white/50 flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-yellow-400" />
              <span>기온 요약</span>
            </div>
            <div className="text-white/90 font-medium leading-relaxed">
              {dailySummary.tempSummary}
            </div>
          </div>

          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-1">
            <div className="text-[10.5px] text-white/50 flex items-center gap-1">
              <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
              <span>강수 전망</span>
            </div>
            <div className="text-white/90 font-medium leading-relaxed">
              {dailySummary.rainSummary}
            </div>
          </div>

          <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-1">
            <div className="text-[10.5px] text-white/50 flex items-center gap-1">
              <Wind className="w-3.5 h-3.5 text-blue-400" />
              <span>바람 상태</span>
            </div>
            <div className="text-white/90 font-medium leading-relaxed">
              {dailySummary.windSummary}
            </div>
          </div>

          <div className={`${dailySummary.isDrivingRain ? 'bg-rose-500/15 border-rose-500/30' : 'bg-amber-500/10 border-amber-500/20'} p-2.5 rounded-xl border space-y-1`}>
            <div className={`text-[10.5px] ${dailySummary.isDrivingRain ? 'text-rose-300' : 'text-amber-300'} flex items-center justify-between font-semibold`}>
              <span>💡 생활 기상 가이드</span>
              {dailySummary.isDrivingRain && (
                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-400/40 font-mono font-medium">
                  비바람 주의
                </span>
              )}
            </div>
            <div className={`${dailySummary.isDrivingRain ? 'text-rose-100' : 'text-amber-100'} font-medium leading-relaxed`}>
              {dailySummary.lifeGuide}
            </div>
          </div>
        </div>
      </div>

      {/* 1. 타임라인 세그먼트 필터 헤더 & 중앙 정렬 바로가기 버튼 */}
      <div className="flex items-center justify-between gap-1 mb-2.5">
        <div
          ref={filterScroll.ref}
          {...filterScroll.events}
          className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 select-none cursor-grab active:cursor-grabbing ${
            filterScroll.isDragging ? 'cursor-grabbing' : ''
          }`}
        >
          <span className="text-[11px] font-semibold text-white/50 px-1 shrink-0">시계열</span>
          <button
            id="btnFilterAll"
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
              filterMode === 'all'
                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            전체 ({hourly.length}개)
          </button>
          <button
            id="btnFilterPast"
            onClick={() => setFilterMode('past')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterMode === 'past'
                ? 'bg-slate-700 text-white shadow-sm font-semibold border border-slate-500/50'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            과거 18h <span className="text-[10px] text-white/60">(3h간격)</span>
          </button>
          <button
            id="btnFilterShort12"
            onClick={() => setFilterMode('short12')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterMode === 'short12'
                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
            단기 12h <span className="text-[10px] text-emerald-200/70">(1h간격)</span>
          </button>
          <button
            id="btnFilterMid36"
            onClick={() => setFilterMode('mid36')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterMode === 'mid36'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-300"></span>
            중기 36h <span className="text-[10px] text-indigo-200/70">(2h간격)</span>
          </button>
          <button
            id="btnFilterExtended72"
            onClick={() => setFilterMode('extended72')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterMode === 'extended72'
                ? 'bg-purple-600 text-white shadow-sm font-semibold'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-300"></span>
            확장 72h <span className="text-[10px] text-purple-200/70">(4h간격)</span>
          </button>
        </div>
        
        {/* 현재 위치 정중앙 스크롤 포커스 버튼 */}
        {hasCurrentInItems && (
          <button
            id="btnScrollToCurrentCenter"
            onClick={() => scrollToCurrent('smooth')}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-400/15 hover:bg-yellow-400/25 text-yellow-300 text-[11px] font-semibold transition-all border border-yellow-400/30 shrink-0"
            title="현재 시점을 화면 정가운데로 이동"
          >
            <Navigation className="w-3 h-3 rotate-45 text-yellow-400" />
            <span>현재 중앙 정렬</span>
          </button>
        )}
      </div>

      <div className="bg-[#111e36]/80 rounded-2xl p-3 border border-white/5 shadow-inner">
        <div
          ref={tableScroll.ref}
          {...tableScroll.events}
          className={`overflow-x-auto no-scrollbar scroll-smooth cursor-grab select-none ${
            tableScroll.isDragging ? 'cursor-grabbing' : ''
          }`}
          title="마우스로 클릭 후 좌우로 드래그하면 시계열을 이동할 수 있습니다"
        >
          <div style={{ width: `${svgWidth}px` }} className="select-none">
            
            {/* 2. 상단 구간/구분 태그 행 */}
            <div
              id="segmentTagRow"
              className="grid gap-1 pb-1.5 border-b border-white/5 text-[10px] text-center font-medium"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => {
                if (item.isCurrent) {
                  return (
                    <div key={idx} className="flex justify-center">
                      <span className="px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-300 font-bold border border-yellow-400/40 text-[9px]">
                        현재
                      </span>
                    </div>
                  );
                }
                if (item.isPast) {
                  // 명시적인 상대 시간 오프셋 또는 계산된 과거 시간차 표기
                  const offsetStr =
                    item.relativeHourOffset !== undefined
                      ? `${item.relativeHourOffset}h`
                      : `-${((curIdxInHourly !== -1 && curIdxInHourly > idx ? curIdxInHourly - idx : 6 - idx) * 3)}h`;
                  return (
                    <div key={idx} className="flex justify-center">
                      <span className="px-1 py-0.5 rounded bg-slate-700/60 text-slate-300 text-[9px] font-mono">
                        {offsetStr}
                      </span>
                    </div>
                  );
                }
                if (item.segmentType === 'extended72') {
                  const extOffsetStr = item.relativeHourOffset !== undefined ? `+${item.relativeHourOffset}h` : '+4h';
                  return (
                    <div key={idx} className="flex justify-center">
                      <span className="px-1 py-0.5 rounded bg-purple-900/40 text-purple-300 text-[9px] font-mono">
                        {extOffsetStr}
                      </span>
                    </div>
                  );
                }
                if (item.segmentType === 'forecast36' || item.segmentType === 'forecast48') {
                  const midOffsetStr = item.relativeHourOffset !== undefined ? `+${item.relativeHourOffset}h` : '+2h';
                  return (
                    <div key={idx} className="flex justify-center">
                      <span className="px-1 py-0.5 rounded bg-indigo-950/40 text-indigo-300 text-[9px] font-mono">
                        {midOffsetStr}
                      </span>
                    </div>
                  );
                }
                const offsetStr = item.relativeHourOffset !== undefined ? `+${item.relativeHourOffset}h` : '+1h';
                return (
                  <div key={idx} className="flex justify-center">
                    <span className="px-1 py-0.5 rounded bg-blue-950/40 text-blue-300 text-[9px] font-mono">
                      {offsetStr}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 3. 실시간 동적 날짜 헤더 */}
            <div
              id="dateHeaderRow"
              className="grid gap-1 text-xs text-white/50 py-1.5 border-b border-white/5 font-semibold"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => (
                <div key={idx} className="truncate text-center">
                  {idx === 0 || item.hour === '00' || item.hour === '0' || item.dateLabel.includes('오늘') || item.dateLabel.includes('내일') || item.dateLabel.includes('어제')
                    ? item.dateLabel
                    : ''}
                </div>
              ))}
            </div>

            {/* 4. 시간 헤더 */}
            <div
              id="hourRow"
              className="grid gap-1 text-[15px] text-center py-2 font-medium"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`transition-colors ${
                    item.isCurrent
                      ? 'text-yellow-400 font-bold drop-shadow-sm'
                      : item.isPast
                      ? 'text-slate-400 font-normal'
                      : hoverIndex === idx
                      ? 'text-yellow-300 font-bold'
                      : 'text-white/90'
                  }`}
                >
                  {item.hour}시
                </div>
              ))}
            </div>

            {/* 5. WMO 날씨 아이콘/상태 */}
            <div
              id="iconRow"
              className="grid gap-1 text-center py-1 text-xs text-white/80"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center justify-center p-1 rounded-lg transition-all ${
                    item.isCurrent
                      ? 'bg-yellow-500/10 border border-yellow-400/20'
                      : item.isPast
                      ? 'bg-slate-800/30'
                      : hoverIndex === idx
                      ? 'bg-white/10 scale-105'
                      : ''
                  }`}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <div className="h-7 flex items-center justify-center mb-0.5">
                    <WeatherIcon icon={item.conditionIcon} size="md" />
                  </div>
                  <span className="text-xs leading-tight font-medium text-white/90 truncate max-w-full">
                    {item.conditionText}
                  </span>
                </div>
              ))}
            </div>

            {/* 6. 연산 SVG 꺾은선 기온 차트 */}
            <div className="relative h-20 my-2 w-full flex items-center">
              <svg
                id="tempSvg"
                className="w-full h-full overflow-visible"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                preserveAspectRatio="none"
              >
                {/* 꺾은선 */}
                <polyline
                  id="tempLine"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />

                {/* 동적 노드 및 기온 텍스트 */}
                <g id="tempPoints">
                  {points.map((p, idx) => {
                    const isHovered = hoverIndex === idx;
                    const nodeStroke = p.isCurrent ? '#facc15' : p.isPast ? '#94a3b8' : '#3b82f6';
                    const nodeFill = p.isCurrent ? '#fef08a' : '#ffffff';
                    return (
                      <g
                        key={idx}
                        className="cursor-pointer transition-transform"
                        onMouseEnter={() => setHoverIndex(idx)}
                        onMouseLeave={() => setHoverIndex(null)}
                      >
                        <circle
                          cx={p.cx}
                          cy={p.cy}
                          r={isHovered ? 5.5 : p.isCurrent ? 5 : 3.5}
                          fill={nodeFill}
                          stroke={nodeStroke}
                          strokeWidth="2"
                          className="transition-all"
                        />
                        <text
                          x={p.cx}
                          y={p.cy - 9}
                          fill={isHovered || p.isCurrent ? '#ffd84d' : p.isPast ? '#94a3b8' : '#93c5fd'}
                          fontSize="13"
                          fontWeight={p.isCurrent ? '700' : '600'}
                          textAnchor="middle"
                          className="transition-colors select-none font-sans"
                        >
                          {p.temp}°
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            {/* 7. 강수확률 행 (상단과 1:1 수직 일치) */}
            <div
              id="popRow"
              className="grid text-center font-semibold text-yellow-400 py-1.5 border-t border-white/5"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`transition-all text-xs ${
                    item.isCurrent ? 'text-yellow-300 font-bold' : item.isPast ? 'text-slate-400 font-normal' : ''
                  } ${hoverIndex === idx ? 'scale-110 text-yellow-200' : ''}`}
                  title={`강수확률: ${item.pop}`}
                >
                  {item.pop}
                </div>
              ))}
            </div>

            {/* 8. 강수량 행 (상단과 1:1 수직 일치) */}
            <div
              id="rainRow"
              className="grid text-center text-white/80 py-1.5 border-t border-white/5"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => (
                <div key={idx} className="px-0.5" title={`강수량: ${item.rain}`}>
                  <div
                    className={`py-0.5 rounded text-[11px] font-mono transition-colors ${
                      item.rainNum > 0
                        ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30'
                        : item.isPast
                        ? 'bg-slate-800/30 text-slate-400'
                        : 'bg-white/5 text-white/60'
                    }`}
                  >
                    {item.rain}
                  </div>
                </div>
              ))}
            </div>

            {/* 9. 풍속 행 (상단과 1:1 수직 일치) */}
            <div
              id="windRow"
              className="grid text-center text-white/80 font-mono py-1.5 border-t border-white/5"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`text-xs ${item.isPast ? 'text-slate-400' : ''}`}
                  title={`풍속: ${item.windSpeed}`}
                >
                  {item.windSpeed}
                </div>
              ))}
            </div>

            {/* 10. 풍향 행 (상단과 1:1 수직 일치) */}
            <div
              id="windDirRow"
              className="grid text-center text-white/60 py-1.5 border-t border-white/5"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`text-xs font-medium ${item.isPast ? 'text-slate-500' : ''}`}
                  title={`풍향: ${item.windDir}`}
                >
                  {item.windDir}
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* 하단 지표 범례 가이드 */}
        <div className="flex items-center justify-between text-[10px] text-white/40 pt-2 px-1 border-t border-white/5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>강수확률(%)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>강수량(mm)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>풍속/풍향</span>
          </div>
          <span className="text-[9px] text-white/30">← 좌우 드래그 스크롤 →</span>
        </div>
      </div>
    </section>
  );
};
