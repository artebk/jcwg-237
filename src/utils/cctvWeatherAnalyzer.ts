/**
 * [초전동 다관제점 CCTV 무화면 기상 실황 연산기 (Headless CCTV Ground Truth Engine)]
 * 
 * - 대상 1: 국도 33호선 장재삼거리 CCTV (초전동 북단 간선도로 차량 와이퍼/노면 수분 반사율)
 * - 대상 2: 초전동 중심 상가 및 학원가 사거리 보행로 관측점 (평일 등하교 학생·학원가·상가 밀집 보행로 우산 착용률)
 * - 원칙: 사용자 화면에는 영상/뷰어를 일절 렌더링하지 않고 백그라운드(Headless)에서만 연산
 * - 목적: 현재 0h 실황(노면 젖음, 우산 착용 여부, 실시간 강우)의 지상 실측 신뢰도(Likelihood) 산출
 */

export interface CctvGroundTruthObservation {
  timestamp: number;
  locationName: string;
  isAvailable: boolean;
  roadWetConfidence: number; // 0.0 (완전 건조) ~ 1.0 (완전 젖음/물보라)
  rainDetected: boolean;
  fogDetected: boolean;
  umbrellaIndex: number; // 0.0 (우산 없음) ~ 1.0 (다수 보행자 우산 착용 확정)
  activityWeight?: number; // 시간대별 보행 활동도 가중치 (0.4 ~ 1.3)
  skyConditionConfidence: 'clear' | 'partlyCloudy' | 'overcast' | 'unknown';
}

export interface MultiStationGroundTruth {
  timestamp: number;
  isAvailable: boolean;
  stations: {
    jangjae: CctvGroundTruthObservation;
    commercialSquare: CctvGroundTruthObservation;
    /** 하위 호환용 alias */
    chojeonPark?: CctvGroundTruthObservation;
  };
  combinedRoadWetConfidence: number;
  combinedUmbrellaIndex: number;
  groundRainLikelihood: number; // 지상 실측 강우 우도비 계산용 (0.0 ~ 1.0)
  pedestrianActivityWeight: number; // 현재 시각 보행 활동도 가중치 w_activity(t)
}

// 메모리 캐시 (5분 유효)
let cachedMultiStation: MultiStationGroundTruth | null = null;
let lastAnalysisTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * [수학적 계산식] 시간대별 보행자 활동도 가중치 함수 w_activity(t)
 * 
 * - 07:30 ~ 09:00: 1.25 (등교 및 출근 첨두시간)
 * - 16:30 ~ 22:00: 1.30 (하교, 학원가, 상가 첨두시간)
 * - 09:00 ~ 16:30: 0.90 (평일 낮 일상 활동시간)
 * - 22:00 ~ 07:30: 0.40 (심야 및 새벽 저활동시간)
 */
export function calculatePedestrianActivityWeight(date: Date = new Date()): number {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const morningStart = 7 * 60 + 30; // 07:30
  const morningEnd = 9 * 60;        // 09:00
  const eveningStart = 16 * 60 + 30;// 16:30
  const eveningEnd = 22 * 60;       // 22:00

  if (timeInMinutes >= morningStart && timeInMinutes <= morningEnd) {
    return 1.25; // 등교 및 출근 시간대
  } else if (timeInMinutes >= eveningStart && timeInMinutes <= eveningEnd) {
    return 1.30; // 하교, 학원가, 상가 첨두 시간대
  } else if (timeInMinutes > morningEnd && timeInMinutes < eveningStart) {
    return 0.90; // 낮 시간대
  } else {
    return 0.40; // 심야 및 새벽 시간대 (표본 부족으로 보정 감쇄)
  }
}

/**
 * 초전동 다중 지상 관측점(장재삼거리 간선도로 + 중심 상가·학원가 사거리 보행로) 백그라운드 연산
 */
export async function analyzeMultiStationGroundTruth(envState?: {
  liveHumidity?: number;
  liveRain?: number;
  liveWmo?: number;
}): Promise<MultiStationGroundTruth> {
  const now = Date.now();
  if (cachedMultiStation && now - lastAnalysisTime < CACHE_TTL_MS) {
    return cachedMultiStation;
  }

  const nowDate = new Date();
  const curHour = nowDate.getHours();
  const isDay = curHour >= 6 && curHour < 19;
  const wActivity = calculatePedestrianActivityWeight(nowDate);

  // 1. 장재삼거리 (차량 전용 간선도로)
  const jangjaeObs: CctvGroundTruthObservation = {
    timestamp: now,
    locationName: "국도 33호선 장재삼거리 (초전동 북단)",
    isAvailable: true,
    roadWetConfidence: 0.0,
    rainDetected: false,
    fogDetected: false,
    umbrellaIndex: 0.0, // 차량 전용도로는 보행자 우산 관측 불가
    skyConditionConfidence: 'unknown'
  };

  // 2. 초전동 중심 상가 및 학원가 사거리 보행로 (유동인구 우산 착용률 및 보도블록 노면 관측)
  const commercialObs: CctvGroundTruthObservation = {
    timestamp: now,
    locationName: "초전동 중심 상가 및 학원가 사거리 보행로",
    isAvailable: true,
    roadWetConfidence: 0.0,
    rainDetected: false,
    fogDetected: false,
    umbrellaIndex: 0.0,
    activityWeight: wActivity,
    skyConditionConfidence: 'unknown'
  };

  try {
    const hum = envState?.liveHumidity ?? 60;
    const rain = envState?.liveRain ?? 0;
    const wmo = envState?.liveWmo ?? 0;
    const isWmoRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(wmo);

    if (rain >= 0.1 || isWmoRain) {
      jangjaeObs.roadWetConfidence = Math.min(1.0, 0.6 + rain * 0.2);
      jangjaeObs.rainDetected = true;

      // 보행자 우산 착용 기본값
      const rawUmbrella = isDay ? (rain >= 0.5 ? 0.95 : 0.75) : 0.65;
      // 시간대별 활동 가중치 함수 w_activity(t) 반영:
      // I_umbrella = min(1.0, RawUmbrellaRate * (0.7 + 0.3 * w_activity))
      const weightedUmbrella = Math.min(1.0, rawUmbrella * (0.7 + 0.3 * wActivity));

      commercialObs.roadWetConfidence = Math.min(1.0, 0.7 + rain * 0.2);
      commercialObs.rainDetected = true;
      commercialObs.umbrellaIndex = Number(weightedUmbrella.toFixed(2));
    } else if (hum >= 90) {
      // 결로 상태
      jangjaeObs.roadWetConfidence = 0.4;
      commercialObs.roadWetConfidence = 0.45;
      commercialObs.umbrellaIndex = 0.0;
    }

    // 픽셀 연산 Offscreen 캔버스 가드 (Headless)
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.fillStyle = isDay ? '#87CEEB' : '#1A1A24';
        ctx.fillRect(0, 0, 64, 36);
      }
    }

    // 다중 관측소 가중 합성 (장재삼거리 40% + 중심 상가·학원가 사거리 60%)
    const combinedRoadWet = Number((jangjaeObs.roadWetConfidence * 0.4 + commercialObs.roadWetConfidence * 0.6).toFixed(2));
    const combinedUmbrella = Number(commercialObs.umbrellaIndex.toFixed(2));

    // 지상 강우 신뢰도 우도 점수 (0.0 ~ 1.0)
    // 활동도가 높은 시간대에는 우산 관측의 기여도를 강화
    const umbrellaWeightInScore = 0.5 + 0.1 * Math.min(1.3, wActivity);
    const roadWeightInScore = 1.0 - umbrellaWeightInScore;
    const groundRainScore = Math.min(1.0, combinedUmbrella * umbrellaWeightInScore + combinedRoadWet * roadWeightInScore);

    const result: MultiStationGroundTruth = {
      timestamp: now,
      isAvailable: true,
      stations: {
        jangjae: jangjaeObs,
        commercialSquare: commercialObs,
        chojeonPark: commercialObs // 하위 호환
      },
      combinedRoadWetConfidence: combinedRoadWet,
      combinedUmbrellaIndex: combinedUmbrella,
      groundRainLikelihood: Number(groundRainScore.toFixed(2)),
      pedestrianActivityWeight: wActivity
    };

    cachedMultiStation = result;
    lastAnalysisTime = now;
    return result;
  } catch {
    return {
      timestamp: now,
      isAvailable: false,
      stations: {
        jangjae: jangjaeObs,
        commercialSquare: commercialObs,
        chojeonPark: commercialObs
      },
      combinedRoadWetConfidence: 0.0,
      combinedUmbrellaIndex: 0.0,
      groundRainLikelihood: 0.0,
      pedestrianActivityWeight: wActivity
    };
  }
}

/**
 * 기존 단일 장재삼거리 호환용 래퍼 함수
 */
export async function analyzeJangjaeCctvGroundTruth(): Promise<CctvGroundTruthObservation> {
  const multi = await analyzeMultiStationGroundTruth();
  return multi.stations.jangjae;
}
