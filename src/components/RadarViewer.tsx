import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { LocationItem, CurrentWeather } from '../types';
import { Play, Pause, RotateCcw, Crosshair, MapPin, Layers, AlertCircle, RefreshCw, Info } from 'lucide-react';
import { RoadMoistureMonitor } from './RoadMoistureMonitor';

interface RadarViewerProps {
  location: LocationItem;
  currentWeather?: CurrentWeather | null;
}

interface RadarFrame {
  time: number;
  path: string;
  timeStr: string;
  relativeTimeStr: string;
}

export const RadarViewer: React.FC<RadarViewerProps> = ({ location, currentWeather }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);

  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [host, setHost] = useState<string>('https://tilecache.rainviewer.com');
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [opacity, setOpacity] = useState<number>(0.92);
  const [colorScheme, setColorScheme] = useState<number>(4); // 4: 선명한 레인보우 (기본값), 2: Universal Blue (기상청 표준)
  const [mapTheme, setMapTheme] = useState<'dark-mono' | 'light-mono' | 'standard'>('dark-mono'); // 다크 모노크롬(기본값)

  // 1. RainViewer 메타데이터 수신
  const fetchRadarData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`RainViewer API 응답 실패 (${res.status})`);
      }

      const data = await res.json();
      if (!data || !data.radar || !data.radar.past || data.radar.past.length === 0) {
        throw new Error('사용 가능한 실시간 레이더 프레임이 없습니다.');
      }

      const hostUrl = data.host || 'https://tilecache.rainviewer.com';
      setHost(hostUrl);

      const nowTs = Math.floor(Date.now() / 1000);
      const pastFrames: RadarFrame[] = data.radar.past.map((f: { time: number; path: string }) => {
        const frameDate = new Date(f.time * 1000);
        const timeStr = frameDate.toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Seoul'
        });
        const diffMins = Math.round((nowTs - f.time) / 60);
        const relativeTimeStr = diffMins <= 2 ? '최신 실황' : `${diffMins}분 전`;

        return {
          time: f.time,
          path: f.path,
          timeStr,
          relativeTimeStr
        };
      });

      setFrames(pastFrames);
      // 가장 최신 프레임 선택
      setCurrentFrameIndex(pastFrames.length - 1);
      setIsLoading(false);

      // [최적화] 줌 7 기준 현재 위치 주변 3x3 레이더 타일 사전 로드 (Prefetching)
      try {
        const zoom = 7;
        const xCenter = Math.floor(((location.lon + 180) / 360) * Math.pow(2, zoom));
        const yCenter = Math.floor(
          ((1 - Math.log(Math.tan((location.lat * Math.PI) / 180) + 1 / Math.cos((location.lat * Math.PI) / 180)) / Math.PI) / 2) *
            Math.pow(2, zoom)
        );

        const recentFrames = pastFrames.slice(-4);
        recentFrames.forEach((frame) => {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const img = new Image();
              img.src = `${hostUrl}${frame.path}/256/${zoom}/${xCenter + dx}/${yCenter + dy}/4/1_1.png`;
            }
          }
        });
      } catch (prefetchErr) {
        // 프리페치는 보조 기능이므로 실패해도 메인 로딩에 영향 없음
      }
    } catch (err: any) {
      console.error('RainViewer 로드 실패:', err);
      setErrorMsg('실시간 비구름 레이더 데이터를 수신하지 못했습니다. 잠시 후 다시 시도해주세요.');
      setIsLoading(false);
    }
  }, [location.lat, location.lon]);

  useEffect(() => {
    fetchRadarData();
  }, [fetchRadarData]);

  // 2. Leaflet 지도 초기화
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // OpenStreetMap 표준 고선명 베이스맵 (전 세계 및 대한민국 전역/진주시/초전동 도로망 및 지명 완벽 표출)
    const osmTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const map = L.map(mapContainerRef.current, {
      center: [location.lat, location.lon],
      zoom: 7,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    // 1) OpenStreetMap 표준 고선명 타일 (도로망, 강, 행정구역, 한글/영문 지명 내장)
    const baseLayer = L.tileLayer(osmTileUrl, {
      subdomains: ['a', 'b', 'c'],
      maxZoom: 19,
      zIndex: 1,
      keepBuffer: 8,
      updateWhenIdle: false,
      className: mapTheme === 'dark-mono' ? 'radar-dark-map-tiles' : mapTheme === 'light-mono' ? 'radar-light-map-tiles' : ''
    }).addTo(map);
    baseTileLayerRef.current = baseLayer;

    // 커스텀 줌 컨트롤 (우상단)
    L.control
      .zoom({
        position: 'topright'
      })
      .addTo(map);

    // 내 위치 마커 & 원형 펄스 반경 (다크 모노크롬 흑백 지도에서 최적 시인성을 제공하는 시안-화이트 펄스)
    const customIcon = L.divIcon({
      className: 'custom-radar-marker',
      html: `<div class="relative flex items-center justify-center">
        <div class="absolute w-7 h-7 rounded-full bg-cyan-400/40 animate-ping"></div>
        <div class="relative w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-500/50"></div>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const marker = L.marker([location.lat, location.lon], { icon: customIcon }).addTo(map);
    marker.bindPopup(`<div class="text-xs font-bold text-slate-900 bg-white/95 px-2 py-1 rounded shadow">${location.name} (관제 중심)</div>`);
    markerRef.current = marker;

    const circle = L.circle([location.lat, location.lon], {
      color: '#06b6d4',
      fillColor: '#06b6d4',
      fillOpacity: 0.12,
      weight: 1.5,
      radius: 15000 // 15km 반경
    }).addTo(map);
    circleRef.current = circle;

    mapInstanceRef.current = map;

    // DOM 렌더링 및 모바일 뷰포트 레이아웃 지연에 대응하는 3단계 InvalidateSize 트리거
    const t1 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.setView([location.lat, location.lon], 7, { animate: false });
      }
    }, 60);

    const t2 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);

    const t3 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 500);

    // ResizeObserver로 컨테이너 크기 변경 자동 감지
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [location.lat, location.lon]);

  // 위치 변경 시 지도 중심 이동
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize();
      mapInstanceRef.current.setView([location.lat, location.lon], 7);
      if (markerRef.current) {
        markerRef.current.setLatLng([location.lat, location.lon]);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng([location.lat, location.lon]);
      }
    }
  }, [location]);

  // 베이스맵 테마 변경 시 타일 컨테이너 필터 클래스 동적 반영
  useEffect(() => {
    if (baseTileLayerRef.current) {
      const container = baseTileLayerRef.current.getContainer();
      if (container) {
        container.classList.remove('radar-dark-map-tiles', 'radar-light-map-tiles');
        if (mapTheme === 'dark-mono') {
          container.classList.add('radar-dark-map-tiles');
        } else if (mapTheme === 'light-mono') {
          container.classList.add('radar-light-map-tiles');
        }
      }
    }
  }, [mapTheme]);

  // 3. 레이더 타일 레이어 업데이트 (프레임 또는 불투명도 변경 시)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || frames.length === 0 || !frames[currentFrameIndex]) return;

    const currentFrame = frames[currentFrameIndex];
    // 표준 256px 타일(베이스맵과 1:1 정밀 매칭), colorScheme(4: Rainbow, 2: Universal Blue), smoothing(1_1: 양선형 보간)
    const radarTileUrl = `${host}${currentFrame.path}/256/{z}/{x}/{y}/${colorScheme}/1_1.png`;

    if (radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current);
    }

    const newRadarLayer = L.tileLayer(radarTileUrl, {
      tileSize: 256,
      maxNativeZoom: 7, // RainViewer 7레벨 네이티브 타일 100% 매칭 로드
      opacity: opacity,
      zIndex: 10,
      maxZoom: 10,
      className: 'radar-tiles-smooth'
    });

    newRadarLayer.addTo(map);
    radarLayerRef.current = newRadarLayer;
  }, [currentFrameIndex, frames, host, opacity, colorScheme]);

  // 4. 자동 재생 타이머 (500ms 주기 루프)
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
    }, 700);

    return () => clearInterval(interval);
  }, [isPlaying, frames.length]);

  // 위치 바로가기
  const handleResetLocation = (zoomLevel: number) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([location.lat, location.lon], zoomLevel, {
        animate: true
      });
    }
  };

  const activeFrame = frames[currentFrameIndex];

  return (
    <div className="w-full px-3 py-2 space-y-3">
      {/* 1. 상단 정보 카드 */}
      <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-3.5 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white">실시간 비구름 레이더</span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  LIVE 10분
                </span>
              </div>
              <p className="text-[11px] text-white/50">
                {location.name} 및 전국 강수 구름 이동 실황 (RainViewer 오픈 레이더)
              </p>
            </div>
          </div>

          <button
            onClick={fetchRadarData}
            disabled={isLoading}
            className="p-2 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all active:scale-95"
            title="레이더 실황 새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. 레이더 지도 컨테이너 */}
      <div className="relative w-full h-[340px] sm:h-[400px] lg:h-[460px] bg-slate-950 rounded-2xl overflow-hidden border border-white/10 shadow-xl">
        {/* 지도 렌더링 DIV */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* 로딩 인디케이터 */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-blue-300 font-medium">최신 레이더 영상 수신 중...</span>
          </div>
        )}

        {/* 에러 상태 오버레이 */}
        {errorMsg && !isLoading && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-4 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
            <p className="text-xs text-white/80 max-w-xs mb-3">{errorMsg}</p>
            <button
              onClick={fetchRadarData}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 지도 상단 퀵 바로가기 및 지도 테마 토글 */}
        <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-white/15 shadow-xl max-w-[calc(100%-110px)]">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handleResetLocation(7)}
              className="px-2 py-1 text-[11px] font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all flex items-center gap-1"
            >
              <MapPin className="w-3 h-3 text-cyan-400" />
              초전동
            </button>
            <button
              onClick={() => handleResetLocation(6)}
              className="px-2 py-1 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              영남권
            </button>
            <button
              onClick={() => handleResetLocation(5)}
              className="px-2 py-1 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              전국
            </button>
          </div>

          <div className="w-[1px] h-4 bg-white/20 self-center mx-0.5"></div>

          {/* 지도 흑백/컬러 테마 토글 */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setMapTheme('dark-mono')}
              className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 ${
                mapTheme === 'dark-mono'
                  ? 'bg-slate-700 text-cyan-300 shadow-sm border border-cyan-500/40'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="어두운 흑백 관제 지도 (권장)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              다크 흑백
            </button>
            <button
              onClick={() => setMapTheme('light-mono')}
              className={`px-1.5 py-1 text-[10px] font-medium rounded-lg transition-all ${
                mapTheme === 'light-mono'
                  ? 'bg-white/20 text-white font-bold'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
              title="밝은 흑백 지도"
            >
              라이트 흑백
            </button>
            <button
              onClick={() => setMapTheme('standard')}
              className={`px-1.5 py-1 text-[10px] font-medium rounded-lg transition-all ${
                mapTheme === 'standard'
                  ? 'bg-white/20 text-white font-bold'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
              title="일반 컬러 지도"
            >
              컬러 지도
            </button>
          </div>
        </div>

        {/* 현재 표시 중인 프레임 시간 뱃지 */}
        {activeFrame && (
          <div className="absolute top-2 right-12 z-10 bg-slate-950/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/20 text-[11px] font-bold text-white shadow-xl flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                currentFrameIndex === frames.length - 1 ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
              }`}
            ></div>
            <span>{activeFrame.timeStr}</span>
            <span
              className={`text-[10px] font-semibold ${
                currentFrameIndex === frames.length - 1 ? 'text-emerald-300' : 'text-cyan-300/80'
              }`}
            >
              ({currentFrameIndex === frames.length - 1 ? 'LIVE 최신' : activeFrame.relativeTimeStr})
            </span>
          </div>
        )}

        {/* 하단 우측 강수 강도 범례 (Legend) */}
        <div className="absolute bottom-2 right-2 z-10 bg-slate-950/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/20 shadow-xl text-[10px]">
          <div className="text-[9px] text-white/70 mb-1 font-semibold flex items-center justify-between">
            <span>강우 강도 (mm/h)</span>
            <span className="text-[8px] text-cyan-300">고대비 컬러</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/60">약</span>
            <div className="flex h-2.5 rounded overflow-hidden shadow-inner border border-white/20">
              <div className="w-3.5 bg-[#40a0ff]" title="약한 비"></div>
              <div className="w-3.5 bg-[#00e1ff]" title="보통 비"></div>
              <div className="w-3.5 bg-[#00ff80]" title="비"></div>
              <div className="w-3.5 bg-[#ffd000]" title="강한 비"></div>
              <div className="w-3.5 bg-[#ff6000]" title="매우 강한 비"></div>
              <div className="w-3.5 bg-[#ff0040]" title="집중호우"></div>
              <div className="w-3.5 bg-[#b000b0]" title="극심한 폭우"></div>
            </div>
            <span className="text-rose-400 font-bold">폭우</span>
          </div>
        </div>
      </div>

      {/* 3. 타임라인 컨트롤러 바 */}
      {frames.length > 0 && (
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-3.5 shadow-lg space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!isPlaying && currentFrameIndex === frames.length - 1) {
                    setCurrentFrameIndex(0);
                  }
                  setIsPlaying(!isPlaying);
                }}
                className={`p-2 rounded-xl border transition-all flex items-center justify-center ${
                  isPlaying
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                    : 'bg-white/10 text-white/80 border-white/10 hover:bg-white/20'
                }`}
                title={isPlaying ? '일시정지' : '재생'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIndex(0);
                }}
                className="p-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl border border-white/10 transition-all"
                title="처음으로 (-2시간)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{activeFrame?.timeStr}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      currentFrameIndex === frames.length - 1
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {currentFrameIndex === frames.length - 1 ? 'LIVE 최신 실황' : activeFrame?.relativeTimeStr}
                  </span>
                </div>
                <span className="text-[10px] text-white/50">과거 2시간 ~ 현재 실황 비구름 추적 (실시간 연동)</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-white/60 font-mono">
                {currentFrameIndex + 1} / {frames.length} 프레임
              </span>
            </div>
          </div>

          {/* 슬라이더 컨트롤 */}
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={currentFrameIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentFrameIndex(Number(e.target.value));
              }}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[9px] text-white/40 font-mono">
              <span>{frames[0]?.timeStr} (-2시간 추적시작)</span>
              <span>{frames[Math.floor(frames.length / 2)]?.timeStr} (-1시간)</span>
              <span className="text-emerald-400 font-bold">{frames[frames.length - 1]?.timeStr} (LIVE 실황)</span>
            </div>
          </div>

          {/* 색상 모드 및 투명도 조절 */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-white/70">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-white/50 mr-1">비구름:</span>
              <button
                onClick={() => setColorScheme(4)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  colorScheme === 4
                    ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 text-white shadow-sm'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                선명한 레인보우
              </button>
              <button
                onClick={() => setColorScheme(2)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  colorScheme === 2
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                기상청 블루
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/50">투명도:</span>
              <input
                type="range"
                min={0.4}
                max={1.0}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-400"
              />
              <span className="text-[10px] font-mono text-white/90 w-7 text-right">
                {Math.round(opacity * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}


      {/* 4. 유용한 가이드 카드 */}
      <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-200/80">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed text-[11px]">
          파란색 점은 <strong>{location.name}</strong> 위치이며, 원형 테두리는 약 15km 근접 반경입니다.
          지도를 손가락으로 드래그하거나 확대하여 비구름의 유입 경로를 확인하실 수 있습니다.
        </p>
      </div>

      {/* 5. 국도 33호선 장재삼거리 노면 수분 & 결로 관제 계측판 (가짜 비디오 철거 & 캠2 삭제) */}
      <RoadMoistureMonitor
        temperature={currentWeather?.temp}
        humidity={currentWeather?.humidity}
        rain={currentWeather?.rain}
        windSpeed={currentWeather?.windSpeed}
        precipitationProbability={currentWeather?.pop}
      />
    </div>
  );
};
