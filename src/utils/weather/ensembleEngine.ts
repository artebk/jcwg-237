import { toSafeNum, ENSEMBLE_CONFIG } from './weatherTypes';

/**
 * 1. 이슬점(Dew Point) 근사 계산 (Magnus-Tetens 공식)
 * T: 기온(°C), RH: 상대습도(%)
 */
export function calculateDewPoint(temp: number, relativeHumidity: number): number {
  const rh = Math.max(1, Math.min(100, relativeHumidity));
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * temp) / (b + temp)) + Math.log(rh / 100.0);
  const dewPoint = (b * alpha) / (a - alpha);
  return Number(dewPoint.toFixed(1));
}

/**
 * 2. 하층 포화도와 모델 일치도 기반 레이더 무에코(0 dBZ) 동적 감쇄율 계산
 * - S_lower (하층 포화 지수): 상대습도 및 이슬점 결손(T - Td) 결합
 * - MCI (모델 일치도 지수): 4대 모델의 비/강수 모의 합의 비율
 * - K_atten = (1 - S_lower) * (1 - MCI)
 * - POP_corrected = POP_model * (1 - 0.65 * K_atten)
 */
export function calculateRadarNoEchoAttenuation(params: {
  modelPop: number;
  relativeHumidity: number;
  temp: number;
  dewPoint: number;
  modelsRainSignals: boolean[]; // [ECMWF_rain, KMA_rain, GFS_rain, ICON_rain]
}): { correctedPop: number; kAtten: number; sLower: number; mci: number } {
  const { modelPop, relativeHumidity, temp, dewPoint, modelsRainSignals } = params;

  // 1) S_lower: 지표~1km 대기 포화도 (0 ~ 1)
  const rhTerm = Math.max(0, Math.min(1, (relativeHumidity - 70) / 25.0));
  const dewDepression = Math.max(0, temp - dewPoint);
  const dewTerm = Math.max(0, Math.min(1, 1 - dewDepression / 2.5));
  const sLower = Math.max(0, Math.min(1, rhTerm * 0.5 + dewTerm * 0.5));

  // 2) MCI (Model Consensus Index): 4대 모델 중 비를 예보하는 모델 비율 (0 ~ 1)
  const rainCount = modelsRainSignals.filter(Boolean).length;
  const mci = rainCount / Math.max(1, modelsRainSignals.length);

  // 3) K_atten: 감쇄 필요 계수 (0: 감쇄 안 함, 1: 최대 감쇄)
  const kAtten = (1.0 - sLower) * (1.0 - mci);

  // 4) 보정 POP: 레이더 무에코 시 최대 65% 감쇄 범위 내에서 연속 함수 적용
  const correctedPop = Math.round(modelPop * (1.0 - 0.65 * kAtten));

  return {
    correctedPop: Math.max(0, Math.min(100, correctedPop)),
    kAtten: Number(kAtten.toFixed(2)),
    sLower: Number(sLower.toFixed(2)),
    mci: Number(mci.toFixed(2))
  };
}

/**
 * 3. 베이지안 사후 확률(Bayesian Posterior Probability) 갱신 계산 엔진
 */
export function calculateBayesianPopUpdate(params: {
  priorPop: number;
  wmoCode?: number | null;
  radarEchoDbz?: number;
  groundRainLikelihood: number;
  observedRainAmount?: number;
}): {
  posteriorPop: number;
  likelihoodRatio: number;
  priorOdds: number;
  posteriorOdds: number;
} {
  const { priorPop, wmoCode, radarEchoDbz = 0, groundRainLikelihood, observedRainAmount = 0 } = params;

  // 1. 사전 확률 안전 클램핑 (1% ~ 95%)
  const clampedPrior = Math.max(1, Math.min(95, priorPop));
  const priorOdds = clampedPrior / (100 - clampedPrior);

  // 2. 우도비 산출
  let lambdaWmo = 1.0;
  if (wmoCode != null) {
    if ([65, 96, 99].includes(wmoCode)) {
      lambdaWmo = 6.0;
    } else if ([61, 63, 66, 67, 80, 81, 82, 95].includes(wmoCode)) {
      lambdaWmo = 4.5;
    } else if ([51, 53, 55, 56, 57].includes(wmoCode)) {
      lambdaWmo = 3.2;
    } else if (observedRainAmount >= 0.1) {
      lambdaWmo = 3.5;
    }
  } else if (observedRainAmount >= 0.1) {
    lambdaWmo = 3.5;
  }

  let lambdaRadar = 1.0;
  if (radarEchoDbz > 0) {
    lambdaRadar = 1.0 + Math.min(3.0, (radarEchoDbz / 15.0));
  } else if (observedRainAmount === 0 && (!wmoCode || ![51, 53, 55, 61, 63, 65].includes(wmoCode))) {
    lambdaRadar = 0.85;
  }

  const lambdaGround = 1.0 + (groundRainLikelihood * 3.5);
  const totalLikelihood = lambdaWmo * lambdaRadar * lambdaGround;

  const posteriorOdds = priorOdds * totalLikelihood;
  const rawPosteriorProb = (posteriorOdds / (1.0 + posteriorOdds)) * 100.0;
  const posteriorPop = Math.min(99, Math.max(1, Math.round(rawPosteriorProb)));

  return {
    posteriorPop,
    likelihoodRatio: Number(totalLikelihood.toFixed(2)),
    priorOdds: Number(priorOdds.toFixed(3)),
    posteriorOdds: Number(posteriorOdds.toFixed(3))
  };
}

/**
 * 4. 복합 강수 판정 지수 (CPI: Composite Precipitation Index)
 */
export function calculateCompositePrecipitationIndex(params: {
  wmoCode?: number | null;
  observedRain: number;
  radarEchoDbz?: number;
  groundRainScore: number;
}): {
  cpi: number;
  isRainConfirmed: boolean;
  scoreBreakdown: { sWmo: number; sRadar: number; sGround: number };
} {
  const { wmoCode, observedRain, radarEchoDbz = 0, groundRainScore } = params;

  let sWmo = 0.0;
  if (wmoCode != null) {
    if ([65, 96, 99].includes(wmoCode)) sWmo = 1.0;
    else if ([61, 63, 66, 67, 80, 81, 82, 95].includes(wmoCode)) sWmo = 0.9;
    else if ([51, 53, 55, 56, 57].includes(wmoCode)) sWmo = 0.75;
  }
  if (observedRain >= 0.5) sWmo = Math.max(sWmo, 1.0);
  else if (observedRain >= 0.1) sWmo = Math.max(sWmo, 0.8);

  let sRadar = 0.0;
  if (radarEchoDbz >= 30) sRadar = 1.0;
  else if (radarEchoDbz >= 15) sRadar = 0.75;
  else if (radarEchoDbz > 0) sRadar = 0.4;

  const sGround = Math.max(0, Math.min(1.0, groundRainScore));
  const cpi = Number((0.35 * sWmo + 0.35 * sRadar + 0.30 * sGround).toFixed(2));
  const isRainConfirmed = cpi >= 0.45;

  return {
    cpi,
    isRainConfirmed,
    scoreBreakdown: {
      sWmo: Number(sWmo.toFixed(2)),
      sRadar: Number(sRadar.toFixed(2)),
      sGround: Number(sGround.toFixed(2))
    }
  };
}

/**
 * 5. 결로·강수 결합 노면 수분 지수 (Road Moisture Index - RMI) 계산
 */
export function calculateRoadMoistureIndex(params: {
  temp: number;
  dewPoint: number;
  relativeHumidity: number;
  recentHourlyRains: number[];
}): {
  rmi: number;
  condition: 'DRY' | 'DAMP' | 'WET';
  conditionText: string;
  dewIndex: number;
  rainResidue: number;
} {
  const { temp, dewPoint, relativeHumidity, recentHourlyRains } = params;

  const rhNorm = Math.max(0, Math.min(1, (relativeHumidity - 85.0) / 15.0));
  const dewGap = Math.max(0, temp - dewPoint);
  const gapNorm = Math.max(0, Math.min(1, 1.0 - (dewGap / 2.0)));
  const dewIndex = Number((rhNorm * gapNorm).toFixed(2));

  const weights = [1.0, 0.8, 0.6, 0.4, 0.2, 0.1];
  let weightedRainSum = 0;
  for (let i = 0; i < Math.min(recentHourlyRains.length, weights.length); i++) {
    weightedRainSum += (recentHourlyRains[i] || 0) * weights[i];
  }
  const rainResidue = Math.min(1.0, Number((weightedRainSum / 1.5).toFixed(2)));

  const rmi = Math.max(dewIndex, rainResidue);

  let condition: 'DRY' | 'DAMP' | 'WET' = 'DRY';
  let conditionText = '건조';

  if (rmi >= 0.70) {
    condition = 'WET';
    conditionText = rainResidue >= dewIndex ? '노면 젖음(강수)' : '노면 젖음(초고습 결로)';
  } else if (rmi >= 0.35) {
    condition = 'DAMP';
    conditionText = dewIndex > rainResidue ? '노면 축축(새벽 이슬)' : '노면 축축(잔류 수분)';
  }

  return {
    rmi: Number(rmi.toFixed(2)),
    condition,
    conditionText,
    dewIndex,
    rainResidue
  };
}

/**
 * 6. 4대 모델(ECMWF, KMA, GFS, ICON) 영역별 동적 가중 앙상블 계산 엔진 (v8.4)
 * - 기상청 지상 실측(진주 관측소) 우선 연동
 * - KMA 결측/수신 지연 또는 2.2°C 이상 극단 이탈 시 타 3개 모델 앙상블 평균으로 안전 보정
 */
export function calculateDynamicEnsemble(params: {
  ecmwfTemp: number;
  kmaTemp?: number | null;
  gfsTemp?: number | null;
  iconTemp?: number | null;
  bestTemp?: number | null;
  ecmwfPop: number;
  kmaPop?: number | null;
  gfsPop?: number | null;
  iconPop?: number | null;
  bestPop?: number | null;
  ecmwfRain: number;
  kmaRain?: number | null;
  gfsRain?: number | null;
  iconRain?: number | null;
  bestRain?: number | null;
  ecmwfWind: number;
  kmaWind?: number | null;
  gfsWind?: number | null;
  iconWind?: number | null;
  bestWind?: number | null;
  isExtendedTerm: boolean;
  wmoCode?: number | null;
}) {
  const { weights, thresholds } = ENSEMBLE_CONFIG;

  // 1) 기온 기준값 및 결측치 안전 방어
  const tE = toSafeNum(params.ecmwfTemp, 20.0);
  const tG = params.gfsTemp != null && !isNaN(Number(params.gfsTemp)) ? Number(params.gfsTemp) : tE;
  const tI = params.iconTemp != null && !isNaN(Number(params.iconTemp)) ? Number(params.iconTemp) : tE;
  // 타 3대 모델(ECMWF, GFS, ICON) 앙상블 기준 평균
  const tTriAvg = Number(((tE + tG + tI) / 3).toFixed(1));

  // [KMA 기온 정합성 안전 가드]:
  // 결측치이거나, 타 3개 모델 평균 대비 2.2°C 이상 비정상 이탈 시 3개 모델 앙상블 평균으로 안전 수렴 보정
  let tK = tTriAvg;
  if (params.kmaTemp != null && !isNaN(Number(params.kmaTemp))) {
    const rawK = Number(params.kmaTemp);
    if (Math.abs(rawK - tTriAvg) <= 2.2) {
      tK = rawK;
    } else {
      // 2.2도 이상 단독 이탈 시 (예: 타 모델 17.8도 vs KMA 20.2도 결측치 왜곡)
      tK = tTriAvg;
    }
  }

  // 2) 강수확률(POP) 결측 방어
  const pE = toSafeNum(params.ecmwfPop, 0);
  const pG = params.gfsPop != null && !isNaN(Number(params.gfsPop)) ? Number(params.gfsPop) : pE;
  const pI = params.iconPop != null && !isNaN(Number(params.iconPop)) ? Number(params.iconPop) : pE;
  const pTriAvg = Math.round((pE + pG + pI) / 3);

  let pK = pTriAvg;
  if (params.kmaPop != null && !isNaN(Number(params.kmaPop))) {
    pK = Number(params.kmaPop);
  }

  // 3) 강수량(Rain) 결측 방어
  const rE = toSafeNum(params.ecmwfRain, 0);
  const rG = params.gfsRain != null && !isNaN(Number(params.gfsRain)) ? Number(params.gfsRain) : (rE > 0 ? rE * 0.5 : 0);
  const rI = params.iconRain != null && !isNaN(Number(params.iconRain)) ? Number(params.iconRain) : (rE > 0 ? rE * 0.5 : 0);
  const rTriAvg = Number(((rE + rG + rI) / 3).toFixed(1));

  let rK = rTriAvg;
  if (params.kmaRain != null && !isNaN(Number(params.kmaRain))) {
    rK = Number(params.kmaRain);
  }

  // 4) 풍속(Wind) 결측 방어
  const wE = toSafeNum(params.ecmwfWind, 1.0);
  const wG = params.gfsWind != null && !isNaN(Number(params.gfsWind)) ? Number(params.gfsWind) : wE;
  const wI = params.iconWind != null && !isNaN(Number(params.iconWind)) ? Number(params.iconWind) : wE;
  const wTriAvg = Number(((wE + wG + wI) / 3).toFixed(1));

  let wK = wTriAvg;
  if (params.kmaWind != null && !isNaN(Number(params.kmaWind))) {
    wK = Number(params.kmaWind);
  }

  // 1. 기온 앙상블: ECMWF 50%, KMA 35%, ICON 10%, GFS 5%
  const tW = weights.temperature;
  const ensTemp = Number(
    ((tE * tW.ecmwf) + (tK * tW.kma) + (tI * tW.icon) + (tG * tW.gfs)).toFixed(1)
  );

  // 2. 강수확률(POP) 앙상블: 단기 KMA 55% vs 중기 ECMWF 55%
  const popW = params.isExtendedTerm ? weights.skyAndPop.extended37to72h : weights.skyAndPop.shortTerm0to36h;
  let ensPop = Math.round(
    (pE * popW.ecmwf) +
    (pK * popW.kma) +
    (pG * popW.gfs) +
    (pI * popW.icon)
  );

  // WMO 코드에 따른 기상청 현업 예보 표준 하한선 보정
  const c = params.wmoCode != null ? Number(params.wmoCode) : null;
  if (c !== null) {
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(c)) {
      ensPop = Math.max(ensPop, 40); // 강우/강설 WMO 코드 시 최소 40%
    } else if (c === 3 || c === 45 || c === 48) {
      ensPop = Math.max(ensPop, 20); // 흐림/안개 시 최소 20%
    } else if (c === 1 || c === 2) {
      ensPop = Math.max(ensPop, 10);
    }
  }

  // 3. 강수량 (Rain) 앙상블: 일반 전선형 vs 대류성 집중호우(KMA 55%)
  const maxRain = Math.max(rE, rK, rG, rI);
  const isConvective = maxRain >= thresholds.convectiveRainTrigger;
  const rainW = isConvective ? weights.precipitationAmount.heavyConvectiveRain : weights.precipitationAmount.normalRain;
  const ensRain = Number(
    ((rE * rainW.ecmwf) + (rK * rainW.kma) + (rG * rainW.gfs) + (rI * rainW.icon)).toFixed(1)
  );

  // 유효 강우 예측 시 POP 하한선 동기화
  if (ensRain >= 1.0) {
    ensPop = Math.max(ensPop, 70);
  } else if (ensRain >= 0.5) {
    ensPop = Math.max(ensPop, 66); // 66% 이상 확정선
  } else if (ensRain >= 0.1) {
    ensPop = Math.max(ensPop, 40); // 0.1mm 이상 시 최소 40% (비/이슬비 가능성)
  }

  // 4. 풍속 (Wind) 앙상블: 일반 vs 강풍/태풍(>= 9m/s)
  const maxWind = Math.max(wE, wK, wG, wI);
  const isSevereWind = maxWind >= thresholds.severeWindTrigger;
  const windW = isSevereWind ? weights.windAndTyphoon.severeOrTyphoon : weights.windAndTyphoon.normalBreeze;
  const ensWind = Number(
    ((wE * windW.ecmwf) + (wK * windW.kma) + (wI * windW.icon) + (wG * windW.gfs)).toFixed(1)
  );

  return {
    ensTemp,
    ensPop,
    ensRain,
    ensWind,
    isConvective,
    isSevereWind,
    rawTemps: { ecmwf: tE, kma: tK, gfs: tG, icon: tI }
  };
}
