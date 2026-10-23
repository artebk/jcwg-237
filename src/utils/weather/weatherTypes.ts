import { LocationItem, HourlyForecast, CurrentWeather, DailyForecast, NationalCity, RawLogEntry, AirQualityData } from '../../types';

export const LOCATIONS: LocationItem[] = [
  { id: 'chojang', name: '초장동', fullName: '진주시 초장동(초전동)', lat: 35.2114, lon: 128.1132, isDefault: true }
];

export interface EnsembleModelWeight {
  key: string;
  name: string;
  weight: number;
  color: string;
  description: string;
}

export function toSafeNum(val: any, fallback: number = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

export function toSafeFixed(val: any, digits: number = 1, fallback: number = 0): string {
  const n = toSafeNum(val, fallback);
  return n.toFixed(digits);
}

export const ENSEMBLE_ARCHITECTURE_CONFIG = {
  version: "v8.4",
  title: "4대 글로벌 수치모델 + 실시간 레이더 앙상블 & 하이브리드 기상 관제 시스템 (v8.4)",
  models: [
    { key: "radar", name: "Radar", fullName: "고해상도 합성 레이더 (RainViewer 반사도 dBZ)", weight: 65, color: "text-purple-300", bg: "bg-purple-500/10", border: "border-purple-500/20", role: "초단기 0h 65% 실측/무에코 45% 경계 감쇄" },
    { key: "ecmwf", name: "ECMWF", fullName: "유럽중기예보센터 (IFS 0.25°/9km)", weight: 50, color: "text-blue-300", bg: "bg-blue-500/10", border: "border-blue-500/20", role: "중단기 기상장 50% 주도" },
    { key: "kma", name: "KMA", fullName: "대한민국 기상청 (진주 관측소 실측 & 수치 Seamless)", weight: 35, color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20", role: "지형 적응성 35% 반영 (결측 시 앙상블 평균 보정)" },
    { key: "icon", name: "ICON", fullName: "독일 기상청 (글로벌 고해상도)", weight: 10, color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/20", role: "경계층 보정 10%" },
    { key: "gfs", name: "GFS", fullName: "미국 해양대기청 (Seamless)", weight: 5, color: "text-cyan-300", bg: "bg-cyan-500/10", border: "border-cyan-500/20", role: "글로벌 순환 보정 5%" },
  ],
  formulas: {
    temperature: {
      label: "기온 (T2M)",
      formula: "T_ens = 0.50×ECMWF + 0.35×KMA + 0.10×ICON + 0.05×GFS",
      details: "ECMWF 50% + KMA 35% + ICON 10% + GFS 5% 가중 합성 (KMA 결측/이상치 시 타 3개 모델 평균 안전 보정)"
    },
    rain: {
      label: "강수량 (Rain)",
      formula: "일반: ECMWF 45% + KMA 40% + ICON 10% + GFS 5% / 집중호우(≥5mm/h): KMA 55% + ECMWF 35% + ICON 5% + GFS 5%",
      details: "호우 발생 시 KMA 국지 대류 가중치 상향으로 게릴라성 폭우 즉각 포착"
    },
    pop: {
      label: "강수확률 (POP)",
      formula: "단기(0~36h): KMA 55% + ECMWF 30% + GFS 10% + ICON 5% / 중기(37~72h): ECMWF 55% + KMA 30% + GFS 10% + ICON 5%",
      details: "초단기 한반도 국지 기상청(KMA) 가중치를 55%로 강화하여 국지 미세 강우 및 전선대 조기 포착"
    },
    rainThresholds: {
      label: "강수 판정 및 가능성 구간 규격 (v8.4)",
      formula: "0.1mm 이상: 이슬비 계열 / 40~65%: 비/이슬비 가능성 (구름물음표) / 66% 이상: 강수 확정 표기 (이슬비/비)",
      details: "40%~65% 사이의 비/이슬비 가능성 구간을 완전 복원하고, 강수 확정 기준을 66% 이상으로 엄격 적용"
    },
    radarNowcast: {
      label: "실시간 레이더 관측 연동 (나우캐스팅 동적 블렌딩 & 물리 기반 동적 감쇄식)",
      formula: "POP_corrected = POP_model × (1 - 0.65 × K_atten) | K_atten = (1 - S_lower) × (1 - MCI)",
      details: "대기 하층 포화도(상대습도, 이슬점 결손)와 4대 수치모델 일치도를 결합하여 지표 부근 하층 이슬비/안개비 구름 통과 시 과도한 감쇄를 물리적으로 보전"
    },
    roadMoisture: {
      label: "결로·강수 결합 노면 수분 지수 (Road Moisture Index - RMI)",
      formula: "RMI = max(D_dew, W_rain) | D_dew = max(0, min(1, (RH - 85)/15)) × max(0, min(1, 1 - (T - Td)/2.0))",
      details: "새벽 기온=이슬점 포화로 인한 노면 결로 젖음과 미세 강우에 의한 젖음 상태(DRY/DAMP/WET)를 정밀 산출"
    },
    wmoFilter: {
      label: "WMO 미세 강수(이슬비) 포착 기준",
      formula: "0.1mm 이상 강수 및 WMO 51~57 이슬비 정상 포착",
      details: "0.1mm 수준의 새벽 미세 이슬비 및 지표 결로 누락을 방지하고 정상 강수 아이콘과 상태를 표출"
    }
  },
  benchmarks: [
    { metric: "수치 기상 엔진", portal: "광역 단일 피드 (TWC / 단일 모델)", ensemble: "ECMWF 50% + KMA 35% + ICON 10% + GFS 5% (4대 모델)", highlight: true },
    { metric: "KMA 수치 보정", portal: "결측 시 엉뚱한 기본값 대입", ensemble: "진주 관측소 실측 우선 + 결측 시 ECMWF/GFS/ICON 평균 보정", highlight: true, accent: true },
    { metric: "강수 가능성 구간", portal: "단순 비 단정", ensemble: "0.1mm 이슬비, 40~65% 비/이슬비 가능성, 66% 이상 확정 표기", highlight: true, accent: true },
    { metric: "초단기(0~2h) 레이더 실측 가중치", portal: "0% (단순 모델 지연 표출)", ensemble: "최대 65% (0h: 65%, 1h: 45%, 2h: 20%, 3h+: 0%)", highlight: true, accent: true },
    { metric: "레이더 무에코 시 POP 보정", portal: "모델 90% 이상 맹목 표출 (오보)", ensemble: "하층 포화도·모델 일치도 기반 동적 감쇄식 (K_atten)", highlight: true, accent: true },
    { metric: "새벽 노면 젖음/결로 판별", portal: "지원 안 함 (단순 기온/강수만 표출)", ensemble: "노면 수분 지수(RMI) 기반 결로·젖음 상태 정밀 감지", highlight: true, accent: true },
    { metric: "격자 해상도 & 표준 좌표", portal: "13km ~ 25km 광역 보간", ensemble: "초전동 중심 35.2114°N, 128.1132°E 고해상도", highlight: false },
    { metric: "통신 안전성 & 회복 가드", portal: "네트워크 단절 시 먹통", ensemble: "8초 타임아웃 + 직전 런 유지(PREVIOUS_RUN) + 다중 엔드포인트", highlight: true, accent: true }
  ]
};

export const ENSEMBLE_CONFIG = {
  weights: {
    skyAndPop: {
      shortTerm0to36h: { kma: 0.55, ecmwf: 0.30, gfs: 0.10, icon: 0.05 },
      extended37to72h: { ecmwf: 0.55, kma: 0.30, gfs: 0.10, icon: 0.05 }
    },
    precipitationAmount: {
      normalRain: { ecmwf: 0.45, kma: 0.40, gfs: 0.10, icon: 0.05 },
      heavyConvectiveRain: { kma: 0.55, ecmwf: 0.35, gfs: 0.05, icon: 0.05 }
    },
    temperature: { ecmwf: 0.50, kma: 0.35, icon: 0.10, gfs: 0.05 },
    windAndTyphoon: {
      normalBreeze: { ecmwf: 0.40, kma: 0.35, icon: 0.15, gfs: 0.10 },
      severeOrTyphoon: { ecmwf: 0.45, kma: 0.40, gfs: 0.10, icon: 0.05 }
    }
  },
  thresholds: {
    convectiveRainTrigger: 5.0,
    severeWindTrigger: 9.0,
    rainConfirmPop: 66, // 66% 이상 시 확정 표기
    rainPossibilityMinPop: 40, // 40~65% 비/이슬비 가능성 구간
    drizzleMinAmount: 0.1 // 0.1mm 이상 이슬비 포착
  }
};

export const GAS_CODE_SNIPPET = `/**
 * 진주시 초전동 실시간 날씨 앙상블 & 기상 관제 백엔드 v8.4
 * - 진주시 초장동(초전동) 표준 좌표: 위도 35.2114°N, 경도 128.1132°E
 * - 4대 글로벌 수치모델(ECMWF 50%, KMA 35%, ICON 10%, GFS 5%) 가중 합성
 * - KMA 결측/수신 지연 시 ECMWF/GFS/ICON 앙상블 평균으로 안전 보정
 * - 0.1mm 이슬비, 40~65% 비/이슬비 가능성(물음표 구름), 66% 이상 확정 표기
 * - 8초 통신 가드 및 직전 런 유지(PREVIOUS_RUN) 복구 지원
 * 파일명: Code.gs
 */
const CONFIG = {
  LAT: 35.2114,
  LON: 128.1132,
  LOCATION_NAME: "진주시 초장동(초전동)",
  TIMEZONE: "Asia/Seoul",
  DB_NAME: "[진주 초전동] 날씨 DB"
};
`;

export const AIR_QUALITY_SAMPLE: AirQualityData = {
  pm10: 24,
  pm10Status: '좋음',
  pm25: 12,
  pm25Status: '좋음',
  o3: 0.028,
  o3Status: '좋음',
  no2: 0.015,
  aqiScore: 32,
  overallStatus: '좋음'
};

export const NATIONAL_CITIES: NationalCity[] = [
  { id: 'jinju', name: '진주 (초전동)', temp: 26, condition: '구름많음', pop: 20, rain: 0.0, lat: 35.204, lon: 128.118 },
  { id: 'seoul', name: '서울', temp: 27, condition: '흐림', pop: 30, rain: 0.0, lat: 37.5665, lon: 126.9780 },
  { id: 'busan', name: '부산', temp: 26, condition: '맑음', pop: 10, rain: 0.0, lat: 35.1796, lon: 129.0756 },
  { id: 'daegu', name: '대구', temp: 29, condition: '맑음', pop: 10, rain: 0.0, lat: 35.8714, lon: 128.6014 },
  { id: 'incheon', name: '인천', temp: 26, condition: '구름많음', pop: 20, rain: 0.0, lat: 37.4563, lon: 126.7052 },
  { id: 'gwangju', name: '광주', temp: 27, condition: '흐림', pop: 40, rain: 0.0, lat: 35.1595, lon: 126.8526 },
  { id: 'daejeon', name: '대전', temp: 27, condition: '구름많음', pop: 20, rain: 0.0, lat: 36.3504, lon: 127.3845 },
  { id: 'gangneung', name: '강릉', temp: 25, condition: '비', pop: 60, rain: 3.5, lat: 37.7519, lon: 128.8761 },
  { id: 'jeju', name: '제주', temp: 28, condition: '비', pop: 70, rain: 8.0, lat: 33.4996, lon: 126.5312 },
  { id: 'chuncheon', name: '춘천', temp: 26, condition: '구름많음', pop: 20, rain: 0.0, lat: 37.8813, lon: 127.7298 }
];

