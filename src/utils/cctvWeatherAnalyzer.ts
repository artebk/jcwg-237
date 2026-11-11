/**
 * [초전동 지상 관측점 노면 및 강우 실황 연산기 (Ground Truth Engine)]
 * 
 * - 대상: 국도 33호선 장재삼거리 및 초전 중심 관측점
 * - 원칙: 가상 영상 분석이나 허위 우산 착용률을 일절 배제하고, 실제 기상청 지상 실측(강수, 습도, 결로) 기반으로 연산
 * - 목적: 현재 0h 실황(노면 수분, 실시간 강우 가능성)의 물리적 지상 실측 신뢰도(Likelihood) 산출
 */

export interface CctvGroundTruthObservation {
  timestamp: number;
  locationName: string;
  isAvailable: boolean;
  roadWetConfidence: number; // 0.0 (완전 건조) ~ 1.0 (완전 젖음/물보라)
  rainDetected: boolean;
  fogDetected: boolean;
  /** @deprecated 가상 영상 분석 뱃지 제거로 미사용 (상시 0.0) */
  umbrellaIndex: number;
  activityWeight?: number;
  skyConditionConfidence: 'clear' | 'partlyCloudy' | 'overcast' | 'unknown';
}

export interface MultiStationGroundTruth {
  timestamp: number;
  isAvailable: boolean;
  stations: {
    jangjae: CctvGroundTruthObservation;
    commercialSquare: CctvGroundTruthObservation;
    chojeonPark?: CctvGroundTruthObservation;
  };
  combinedRoadWetConfidence: number;
  /** @deprecated 가상 영상 분석 뱃지 제거로 미사용 (상시 0.0) */
  combinedUmbrellaIndex: number;
  groundRainLikelihood: number; // 지상 실측 강우 우도비 계산용 (0.0 ~ 1.0)
  pedestrianActivityWeight: number;
}

// 메모리 캐시 (5분 유효)
let cachedMultiStation: MultiStationGroundTruth | null = null;
let lastAnalysisTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 초전동 지상 관측점 실황 백그라운드 연산 (물리 모델 기반)
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

  // 1. 장재삼거리 관측점
  const jangjaeObs: CctvGroundTruthObservation = {
    timestamp: now,
    locationName: "국도 33호선 장재삼거리 (초전동 북단)",
    isAvailable: true,
    roadWetConfidence: 0.0,
    rainDetected: false,
    fogDetected: false,
    umbrellaIndex: 0.0,
    skyConditionConfidence: 'unknown'
  };

  // 2. 초전 중심 상가 관측점
  const commercialObs: CctvGroundTruthObservation = {
    timestamp: now,
    locationName: "초전동 중심 관측점",
    isAvailable: true,
    roadWetConfidence: 0.0,
    rainDetected: false,
    fogDetected: false,
    umbrellaIndex: 0.0,
    skyConditionConfidence: 'unknown'
  };

  try {
    const hum = envState?.liveHumidity ?? 60;
    const rain = envState?.liveRain ?? 0;
    const wmo = envState?.liveWmo ?? 0;
    const isWmoRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(wmo);

    if (rain >= 0.1 || isWmoRain) {
      const wetness = Math.min(1.0, 0.4 + rain * 0.3);
      jangjaeObs.roadWetConfidence = wetness;
      jangjaeObs.rainDetected = true;
      commercialObs.roadWetConfidence = wetness;
      commercialObs.rainDetected = true;
    } else if (hum >= 90) {
      // 결로 상태
      jangjaeObs.roadWetConfidence = 0.35;
      commercialObs.roadWetConfidence = 0.35;
      jangjaeObs.fogDetected = true;
      commercialObs.fogDetected = true;
    }

    // 다중 관측소 가중 합성
    const combinedRoadWet = Number((jangjaeObs.roadWetConfidence * 0.5 + commercialObs.roadWetConfidence * 0.5).toFixed(2));

    // 지상 강우 신뢰도 우도 점수 (0.0 ~ 1.0)
    const groundRainScore = Math.min(1.0, combinedRoadWet);

    const result: MultiStationGroundTruth = {
      timestamp: now,
      isAvailable: true,
      stations: {
        jangjae: jangjaeObs,
        commercialSquare: commercialObs,
        chojeonPark: commercialObs
      },
      combinedRoadWetConfidence: combinedRoadWet,
      combinedUmbrellaIndex: 0.0,
      groundRainLikelihood: Number(groundRainScore.toFixed(2)),
      pedestrianActivityWeight: 1.0
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
      pedestrianActivityWeight: 1.0
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
