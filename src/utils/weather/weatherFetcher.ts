import {
  LocationItem,
  HourlyForecast,
  CurrentWeather,
  DailyForecast,
  RawLogEntry
} from '../../types';
import { toSafeNum } from './weatherTypes';
import {
  calculateDewPoint,
  calculateRoadMoistureIndex,
  calculateCompositePrecipitationIndex,
  calculateDynamicEnsemble
} from './ensembleEngine';
import {
  determineForecastSkyState,
  determineCurrentSkyState,
  parseWindDirection,
  parseKstDateTimeParts,
  getDayOfWeek
} from './conditionClassifier';
import {
  saveForecastCache,
  loadForecastCache,
  parseDailyEnsembleForecast,
  getFallbackPayload,
  fetchDailyForecastDirect,
  fetchRealtimeNationalWeather,
  fetchRealtimeAirQuality
} from './weatherFallbackAndAux';

export {
  fetchDailyForecastDirect,
  fetchRealtimeNationalWeather,
  fetchRealtimeAirQuality
};

interface HourlyModelArrays {
  bestTemp: any[];
  ecmwfTemp: any[];
  kmaTemp: any[];
  gfsTemp: any[];
  iconTemp: any[];
  bestPop: any[];
  ecmwfPop: any[];
  kmaPop: any[];
  gfsPop: any[];
  iconPop: any[];
  bestRain: any[];
  ecmwfRain: any[];
  kmaRain: any[];
  gfsRain: any[];
  iconRain: any[];
  bestWind: any[];
  ecmwfWind: any[];
  kmaWind: any[];
  gfsWind: any[];
  iconWind: any[];
}

/**
 * 특정 인덱스(0h 또는 시간별 슬롯)에서 4대 수치모델 입력값 추출 및 KMA 결측/이상치(±2.2°C) 안전 보정
 */
function extractSlotModelInputs(
  arrays: HourlyModelArrays,
  idx: number,
  defaultTemp: number,
  defaultWind: number
) {
  const tE = toSafeNum(arrays.ecmwfTemp[idx], defaultTemp);
  const tG = arrays.gfsTemp[idx] != null ? toSafeNum(arrays.gfsTemp[idx], tE) : tE;
  const tI = arrays.iconTemp[idx] != null ? toSafeNum(arrays.iconTemp[idx], tE) : tE;
  const tTriAvg = Number(((tE + tG + tI) / 3).toFixed(1));

  let tK = tTriAvg;
  if (arrays.kmaTemp[idx] != null && !isNaN(Number(arrays.kmaTemp[idx]))) {
    const rawK = Number(arrays.kmaTemp[idx]);
    if (Math.abs(rawK - tTriAvg) <= 2.2) {
      tK = rawK;
    }
  }

  const pE = toSafeNum(arrays.ecmwfPop[idx], 0);
  const pG = arrays.gfsPop[idx] != null ? toSafeNum(arrays.gfsPop[idx], pE) : pE;
  const pI = arrays.iconPop[idx] != null ? toSafeNum(arrays.iconPop[idx], pE) : pE;
  const pTriAvg = Math.round((pE + pG + pI) / 3);
  const pK =
    arrays.kmaPop[idx] != null && !isNaN(Number(arrays.kmaPop[idx]))
      ? Number(arrays.kmaPop[idx])
      : pTriAvg;

  const rE = toSafeNum(arrays.ecmwfRain[idx], 0);
  const rG = arrays.gfsRain[idx] != null ? toSafeNum(arrays.gfsRain[idx], 0) : 0;
  const rI = arrays.iconRain[idx] != null ? toSafeNum(arrays.iconRain[idx], 0) : 0;
  const rTriAvg = Number(((rE + rG + rI) / 3).toFixed(1));
  const rK =
    arrays.kmaRain[idx] != null && !isNaN(Number(arrays.kmaRain[idx]))
      ? Number(arrays.kmaRain[idx])
      : rTriAvg;

  const wE = toSafeNum(arrays.ecmwfWind[idx], defaultWind);
  const wK = arrays.kmaWind[idx] != null ? toSafeNum(arrays.kmaWind[idx], wE) : wE;
  const wG = arrays.gfsWind[idx] != null ? toSafeNum(arrays.gfsWind[idx], wE) : wE;
  const wI = arrays.iconWind[idx] != null ? toSafeNum(arrays.iconWind[idx], wE) : wE;

  return {
    tTriAvg,
    ecmwfTemp: tE,
    kmaTemp: tK,
    gfsTemp: tG,
    iconTemp: tI,
    bestTemp: arrays.bestTemp[idx],
    ecmwfPop: pE,
    kmaPop: pK,
    gfsPop: pG,
    iconPop: pI,
    bestPop: arrays.bestPop[idx],
    ecmwfRain: rE,
    kmaRain: rK,
    gfsRain: rG,
    iconRain: rI,
    bestRain: arrays.bestRain[idx],
    ecmwfWind: wE,
    kmaWind: wK,
    gfsWind: wG,
    iconWind: wI,
    bestWind: arrays.bestWind[idx]
  };
}

/**
 * 실시간 4대 모델 앙상블 및 관측 실황 통합 기상 예보 조회 (v9.1)
 */
export async function fetchEnsembleForecast(
  location: LocationItem,
  gasUrl?: string
): Promise<{
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  rawLogs: RawLogEntry[];
}> {
  // 1. Google Apps Script Web App 연동 시도 (URL이 제공된 경우 8초 타임아웃)
  if (gasUrl && gasUrl.trim() !== '') {
    try {
      const gasController = new AbortController();
      const gasTimeout = setTimeout(() => gasController.abort(), 8000);
      const resp = await fetch(`${gasUrl.trim()}`, {
        cache: 'no-store',
        signal: gasController.signal
      });
      clearTimeout(gasTimeout);

      if (resp.ok) {
        const json = await resp.json();
        if (json.status === 'success' && json.data) {
          const gasData = json.data;
          const gasCur = gasData.current || {};
          const current: CurrentWeather = {
            location: gasCur.location || location.fullName,
            temp: toSafeNum(gasCur.temp, 20.0),
            ecmwfTemp: toSafeNum(gasCur.ecmwfTemp, toSafeNum(gasCur.temp, 20.0)),
            kmaTemp: toSafeNum(gasCur.kmaTemp, toSafeNum(gasCur.temp, 20.0)),
            gfsTemp:
              gasCur.gfsTemp != null
                ? toSafeNum(gasCur.gfsTemp, toSafeNum(gasCur.temp, 20.0))
                : undefined,
            iconTemp:
              gasCur.iconTemp != null
                ? toSafeNum(gasCur.iconTemp, toSafeNum(gasCur.temp, 20.0))
                : undefined,
            pop: toSafeNum(gasCur.pop ?? gasCur.curPopEns, 0),
            rain: toSafeNum(gasCur.rain ?? gasCur.curHourRain, 0.0),
            accumRainSoFar: toSafeNum(gasCur.accumRain ?? gasCur.accumRainSoFar, 0.0),
            forecastDailyRain: toSafeNum(gasCur.forecastDailyRain, 0.0),
            conditionText: gasCur.condition || gasCur.conditionText || '구름많음',
            conditionIcon: gasCur.icon || gasCur.conditionIcon || '⛅',
            windSpeed: toSafeNum(gasCur.wind ?? gasCur.windSpeed, 1.0),
            windDirection: gasCur.windDir || gasCur.windDirection || '남',
            isDay: gasCur.isDay !== undefined ? toSafeNum(gasCur.isDay, 1) : 1,
            updatedAt:
              gasCur.updatedAt ||
              new Date().toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Seoul'
              }),
            dataStatus: 'GAS_ENSEMBLE'
          };

          const hourly: HourlyForecast[] = (gasData.hourly || []).map((h: any) => {
            const hTemp = toSafeNum(h.temp, 20);
            const hPopStr = String(h.pop || '0');
            const hPopNum = parseInt(hPopStr.replace('%', ''), 10) || 0;
            const hRainStr = String(h.rain || '0');
            const hRainNum = parseFloat(hRainStr.replace('mm', '')) || 0;
            const hWindStr = String(h.wind ?? h.windSpeed ?? '1');
            const hWindNum = parseFloat(hWindStr.replace('m/s', '')) || 1;

            return {
              dateLabel: h.dateLabel || '',
              hour: String(h.hour || '00').padStart(2, '0'),
              fullHour: parseInt(h.hour, 10) || 0,
              conditionText: h.condition || h.conditionText || '구름많음',
              conditionIcon: h.icon || h.conditionIcon || '⛅',
              temp: hTemp,
              pop: hPopStr.includes('%') ? hPopStr : `${hPopStr}%`,
              popNum: hPopNum,
              rain: hRainStr.includes('mm') ? hRainStr : `${hRainStr}mm`,
              rainNum: hRainNum,
              windSpeed: hWindStr.includes('m/s') ? hWindStr : `${hWindStr}m/s`,
              windNum: hWindNum,
              windDir: h.windDir || h.windDirection || '남',
              ecmwfTemp: toSafeNum(h.ecmwfTemp, hTemp),
              kmaTemp: toSafeNum(h.kmaTemp, hTemp),
              gfsTemp: h.gfsTemp != null ? toSafeNum(h.gfsTemp, hTemp) : undefined,
              iconTemp: h.iconTemp != null ? toSafeNum(h.iconTemp, hTemp) : undefined,
              isPast: Boolean(h.isPast),
              isCurrent: Boolean(h.isCurrent),
              segmentType: h.segmentType || (h.isPast ? 'past' : h.isCurrent ? 'current' : 'forecast36'),
              stepHours: toSafeNum(h.stepHours, 1),
              rawTime: h.rawTime || ''
            };
          });

          const rawLogs: RawLogEntry[] = [
            {
              timestamp: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
              location: current.location,
              temp: current.temp,
              ecmwfTemp: current.ecmwfTemp,
              kmaTemp: current.kmaTemp,
              gfsTemp: current.gfsTemp,
              iconTemp: current.iconTemp,
              pop: current.pop,
              accumRain: current.accumRainSoFar,
              forecastDailyRain: current.forecastDailyRain,
              condition: current.conditionText,
              windSpeed: current.windSpeed,
              windDir: current.windDirection,
              status: 'GAS_ENSEMBLE' as const
            }
          ];

          const gasResult = {
            current,
            hourly,
            daily: await fetchDailyForecastDirect(location),
            rawLogs
          };

          saveForecastCache(location.id, gasResult);
          return gasResult;
        }
      }
    } catch (err) {
      console.warn('GAS API 연동 지연/실패, Open-Meteo Multi-Model 실시간 직접 호출로 자동 전환:', err);
    }
  }

  // 2. Open-Meteo 실시간 동시 수신 및 4대 모델 앙상블 (8초 타임아웃)
  try {
    const baseQuery = `latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&wind_speed_unit=ms&past_days=1&forecast_days=8&timezone=Asia%2FSeoul`;
    const primaryUrl = `https://api.open-meteo.com/v1/forecast?${baseQuery}&models=best_match,ecmwf_ifs025,kma_seamless,gfs_seamless,icon_seamless`;
    const fallbackUrl = `https://api.open-meteo.com/v1/forecast?${baseQuery}`;

    let raw: any = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(primaryUrl, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        raw = await res.json();
      }
    } catch (primaryErr) {
      console.warn('Open-Meteo 4-Model 1차 호출 실패, 백업 엔드포인트 시도:', primaryErr);
    }

    if (!raw || !raw.hourly) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(fallbackUrl, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        raw = await res.json();
      } else {
        throw new Error(`Open-Meteo HTTP Error: ${res.status}`);
      }
    }

    if (!raw || !raw.hourly) {
      throw new Error('Open-Meteo 데이터 파싱 불가');
    }

    const curObs = raw.current || null;
    const liveObsTemp = curObs?.temperature_2m != null ? Number(curObs.temperature_2m) : null;
    const liveObsRain = curObs
      ? Math.max(toSafeNum(curObs.precipitation, 0), toSafeNum(curObs.rain, 0), toSafeNum(curObs.showers, 0))
      : 0;
    const liveObsCode = curObs?.weather_code != null ? Number(curObs.weather_code) : null;
    const liveObsWind = curObs?.wind_speed_10m != null ? Number(curObs.wind_speed_10m) : null;
    const liveObsWindDir = curObs?.wind_direction_10m != null ? Number(curObs.wind_direction_10m) : null;
    const liveObsIsDay = curObs?.is_day != null ? Number(curObs.is_day) : null;
    const liveObsHumidity = curObs?.relative_humidity_2m != null ? Number(curObs.relative_humidity_2m) : 60;
    const liveObsDewPoint = calculateDewPoint(liveObsTemp != null ? liveObsTemp : 20, liveObsHumidity);

    const h = raw.hourly || {};
    const bestTemp = h['temperature_2m_best_match'] || h.temperature_2m || [];
    const bestPop = h['precipitation_probability_best_match'] || h.precipitation_probability || [];
    const bestRain = h['precipitation_best_match'] || h.precipitation || [];
    const bestWind = h['wind_speed_10m_best_match'] || h.wind_speed_10m || [];
    const bestCodes = h['weather_code_best_match'] || h.weather_code || [];

    const modelArrays: HourlyModelArrays = {
      bestTemp,
      ecmwfTemp: h['temperature_2m_ecmwf_ifs025'] || bestTemp,
      kmaTemp: h['temperature_2m_kma_seamless'] || [],
      gfsTemp: h['temperature_2m_gfs_seamless'] || [],
      iconTemp: h['temperature_2m_icon_seamless'] || [],
      bestPop,
      ecmwfPop: h['precipitation_probability_ecmwf_ifs025'] || bestPop,
      kmaPop: h['precipitation_probability_kma_seamless'] || [],
      gfsPop: h['precipitation_probability_gfs_seamless'] || [],
      iconPop: h['precipitation_probability_icon_seamless'] || [],
      bestRain,
      ecmwfRain: h['precipitation_ecmwf_ifs025'] || bestRain,
      kmaRain: h['precipitation_kma_seamless'] || [],
      gfsRain: h['precipitation_gfs_seamless'] || [],
      iconRain: h['precipitation_icon_seamless'] || [],
      bestWind,
      ecmwfWind: h['wind_speed_10m_ecmwf_ifs025'] || bestWind,
      kmaWind: h['wind_speed_10m_kma_seamless'] || [],
      gfsWind: h['wind_speed_10m_gfs_seamless'] || [],
      iconWind: h['wind_speed_10m_icon_seamless'] || []
    };

    const kmaWeatherCodes = h['weather_code_kma_seamless'] || bestCodes;
    const weatherCodes = h['weather_code_ecmwf_ifs025'] || bestCodes;
    const windDirs =
      h['wind_direction_10m_ecmwf_ifs025'] ||
      h['wind_direction_10m_best_match'] ||
      h.wind_direction_10m ||
      [];

    const now = new Date();
    const kstNow = parseKstDateTimeParts(now);
    const kstPrefix = kstNow.isoPrefix;
    const todayDateStr = kstNow.dateStr;
    const yesterdayDateStr = parseKstDateTimeParts(new Date(now.getTime() - 24 * 60 * 60 * 1000)).dateStr;
    const tomorrowDateStr = parseKstDateTimeParts(new Date(now.getTime() + 24 * 60 * 60 * 1000)).dateStr;

    let curIdx = h.time ? h.time.findIndex((t: string) => t.startsWith(kstPrefix)) : -1;
    if (curIdx === -1) {
      curIdx = h.time ? h.time.findIndex((t: string) => t.includes(`T${kstNow.hour}:00`)) : -1;
      if (curIdx === -1) {
        curIdx = h.time ? Math.min(24, h.time.length - 1) : 0;
      }
    }

    // 0h 현시점 4대 모델 입력값 추출 및 동적 가중 앙상블
    const curInputs = extractSlotModelInputs(
      modelArrays,
      curIdx,
      liveObsTemp != null ? liveObsTemp : 20.0,
      liveObsWind != null ? liveObsWind : 1.2
    );
    const curKmaCode =
      kmaWeatherCodes[curIdx] != null
        ? kmaWeatherCodes[curIdx]
        : weatherCodes[curIdx] != null
        ? weatherCodes[curIdx]
        : 1;

    const curEns = calculateDynamicEnsemble({
      ...curInputs,
      isExtendedTerm: false,
      wmoCode: curKmaCode
    });

    const curTempEns = curEns.ensTemp;
    const curWindEns = curEns.ensWind;
    const curHourRain = curEns.ensRain;

    // 지상 실측 기온 75% 우선 반영
    const finalCurTemp =
      liveObsTemp != null
        ? Number((liveObsTemp * 0.75 + curTempEns * 0.25).toFixed(1))
        : curTempEns;

    const finalCurWind = liveObsWind != null ? Number(liveObsWind.toFixed(1)) : curWindEns;
    const finalCurWindDir =
      liveObsWindDir != null
        ? parseWindDirection(liveObsWindDir)
        : parseWindDirection(windDirs[curIdx]);

    let today24hTotalRain = 0.0;
    let accumRainSoFar = 0.0;
    if (Array.isArray(h.time)) {
      for (let i = 0; i < h.time.length; i++) {
        const timeStr = h.time[i] || '';
        const isTodaySlot = timeStr.startsWith(`${kstNow.year}-${kstNow.month}-${kstNow.day}`);
        if (isTodaySlot) {
          const rE = toSafeNum(modelArrays.ecmwfRain[i], 0);
          const rK = modelArrays.kmaRain[i];
          const rG = modelArrays.gfsRain[i];
          const rI = modelArrays.iconRain[i];
          const slotRain = calculateDynamicEnsemble({
            ecmwfTemp: curInputs.tTriAvg,
            kmaTemp: rK,
            gfsTemp: rG,
            iconTemp: rI,
            ecmwfPop: 0,
            ecmwfRain: rE,
            kmaRain: rK,
            gfsRain: rG,
            iconRain: rI,
            ecmwfWind: 1.0,
            isExtendedTerm: false
          }).ensRain;
          today24hTotalRain += slotRain;
          if (i <= curIdx) {
            accumRainSoFar += slotRain;
          }
        }
      }
    }

    // 최근 6시간 강수량 배열
    const recent6hRains: number[] = [];
    for (let offset = 0; offset <= 5; offset++) {
      const idx = curIdx - offset;
      if (idx >= 0 && idx < (modelArrays.ecmwfRain?.length || 0)) {
        recent6hRains.push(toSafeNum(modelArrays.ecmwfRain[idx], 0));
      } else {
        recent6hRains.push(0);
      }
    }

    const roadMoisture = calculateRoadMoistureIndex({
      temp: finalCurTemp,
      dewPoint: liveObsDewPoint,
      relativeHumidity: liveObsHumidity,
      recentHourlyRains: recent6hRains
    });

    // 지상 관제 연동: 기상청 및 4대 수치모델 실측 데이터와 노면 수분계측 지수(RMI) 직접 결합
    const cpiRes = calculateCompositePrecipitationIndex({
      wmoCode: liveObsCode,
      observedRain: Math.max(liveObsRain, curHourRain),
      radarEchoDbz: 0,
      groundRainScore: roadMoisture.rmi
    });

    const isDay =
      liveObsIsDay !== null ? liveObsIsDay : kstNow.hourNum >= 6 && kstNow.hourNum < 20 ? 1 : 0;
    const finalWeatherCode = liveObsCode !== null ? liveObsCode : curKmaCode;

    // 현재 시점 날씨 판정 (determineCurrentSkyState)
    const currentSky = determineCurrentSkyState({
      wmoCode: finalWeatherCode,
      isDay,
      ensRain: curHourRain,
      ensPop: curEns.ensPop,
      cpi: cpiRes.cpi
    });

    const curKmaPopNum = curEns.ensPop;
    const curKmaRainNum = curHourRain;

    const current: CurrentWeather = {
      location: location.fullName,
      temp: finalCurTemp,
      ecmwfTemp: Number(curEns.rawTemps.ecmwf.toFixed(1)),
      kmaTemp: Number(curEns.rawTemps.kma.toFixed(1)),
      gfsTemp: Number(curEns.rawTemps.gfs.toFixed(1)),
      iconTemp: Number(curEns.rawTemps.icon.toFixed(1)),
      pop: curKmaPopNum,
      rain: curKmaRainNum,
      accumRainSoFar: Number(accumRainSoFar.toFixed(1)),
      forecastDailyRain: Number(today24hTotalRain.toFixed(1)),
      conditionText: currentSky.text,
      conditionIcon: currentSky.icon,
      windSpeed: finalCurWind,
      windDirection: finalCurWindDir,
      isDay,
      humidity: liveObsHumidity,
      dewPoint: liveObsDewPoint,
      roadMoistureIndex: roadMoisture.rmi,
      roadCondition: roadMoisture.condition,
      roadConditionText: roadMoisture.conditionText,
      updatedAt: now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Seoul'
      }),
      dataStatus: 'DIRECT_LIVE'
    };

    // 시간대별 슬롯 생성 헬퍼
    const buildSlot = (
      idx: number,
      segmentType: 'past' | 'current' | 'forecast36' | 'extended72',
      isPast: boolean,
      isCurrent: boolean,
      stepHours: number,
      relativeHourOffset: number
    ): HourlyForecast => {
      const slotTimeStr = h.time[idx] || '';
      const itemDate = new Date(
        slotTimeStr.includes('+') || slotTimeStr.endsWith('Z') ? slotTimeStr : `${slotTimeStr}+09:00`
      );
      const itemKst = parseKstDateTimeParts(itemDate);
      const itemHourNum = itemKst.hourNum;
      const itemHourStr = itemKst.hour;
      const itemDStr = itemKst.dateStr;
      const dayOfWeekStr = getDayOfWeek(itemDate);

      let dateLabel = `(${dayOfWeekStr}) ${itemDStr}`;
      if (itemDStr === yesterdayDateStr) {
        dateLabel = `(${dayOfWeekStr}) 어제 ${itemDStr}`;
      } else if (itemDStr === todayDateStr) {
        dateLabel = `(${dayOfWeekStr}) 오늘 ${itemDStr}`;
      } else if (itemDStr === tomorrowDateStr) {
        dateLabel = `(${dayOfWeekStr}) 내일 ${itemDStr}`;
      }

      const slotInputs = extractSlotModelInputs(modelArrays, idx, 20.0, 1.2);
      const code = weatherCodes[idx] != null ? weatherCodes[idx] : 1;
      const targetWmo = isCurrent ? finalWeatherCode : code;
      const isExtended = segmentType === 'extended72';

      const ensSlot = calculateDynamicEnsemble({
        ...slotInputs,
        isExtendedTerm: isExtended,
        wmoCode: targetWmo
      });

      let ensT = Math.round(ensSlot.ensTemp);
      let ensPop = ensSlot.ensPop;
      let ensRain = ensSlot.ensRain;
      let ensWind = Number(ensSlot.ensWind.toFixed(1));

      if (isCurrent) {
        ensT = Math.round(finalCurTemp);
        ensPop = curKmaPopNum;
        ensRain = curKmaRainNum;
        ensWind = Number(finalCurWind.toFixed(1));
      }

      const hourIsDay = isCurrent ? isDay : itemHourNum >= 6 && itemHourNum < 20 ? 1 : 0;

      const cond = isCurrent
        ? { text: current.conditionText, icon: current.conditionIcon }
        : determineForecastSkyState({
            wmoCode: code,
            isDay: hourIsDay,
            ensRain: ensRain,
            ensPop: ensPop
          });

      return {
        dateLabel,
        hour: itemHourStr,
        fullHour: itemHourNum,
        conditionText: cond.text,
        conditionIcon: cond.icon,
        temp: ensT,
        pop: `${ensPop}%`,
        popNum: ensPop,
        rain: `${ensRain.toFixed(1)}mm`,
        rainNum: ensRain,
        windSpeed: `${ensWind.toFixed(1)}m/s`,
        windNum: ensWind,
        windDir: parseWindDirection(windDirs[idx]),
        ecmwfTemp: Number(ensSlot.rawTemps.ecmwf.toFixed(1)),
        kmaTemp: Number(ensSlot.rawTemps.kma.toFixed(1)),
        gfsTemp: Number(ensSlot.rawTemps.gfs.toFixed(1)),
        iconTemp: Number(ensSlot.rawTemps.icon.toFixed(1)),
        isPast,
        isCurrent,
        segmentType,
        stepHours,
        relativeHourOffset,
        rawTime: h.time[idx]
      };
    };

    const hourlyList: HourlyForecast[] = [];
    if (Array.isArray(h.time) && h.time.length > 0) {
      // 1. 과거 18시간 (-18h ~ -3h, 3시간 간격)
      for (let offset = -18; offset <= -3; offset += 3) {
        const idx = curIdx + offset;
        if (idx >= 0 && idx < h.time.length) {
          hourlyList.push(buildSlot(idx, 'past', true, false, 3, offset));
        }
      }

      // 2. 현재 + 향후 12시간 (0h ~ 12h, 1시간 간격)
      for (let offset = 0; offset <= 12; offset += 1) {
        const idx = curIdx + offset;
        if (idx >= 0 && idx < h.time.length) {
          hourlyList.push(
            buildSlot(idx, offset === 0 ? 'current' : 'forecast36', false, offset === 0, 1, offset)
          );
        }
      }

      // 3. 14h ~ 36h (2시간 간격)
      for (let offset = 14; offset <= 36; offset += 2) {
        const idx = curIdx + offset;
        if (idx >= 0 && idx < h.time.length) {
          hourlyList.push(buildSlot(idx, 'forecast36', false, false, 2, offset));
        }
      }

      // 4. 40h ~ 72h (4시간 간격)
      for (let offset = 40; offset <= 72; offset += 4) {
        const idx = curIdx + offset;
        if (idx >= 0 && idx < h.time.length) {
          hourlyList.push(buildSlot(idx, 'extended72', false, false, 4, offset));
        }
      }
    }

    // 7일간 주간 4대 수치모델 가중 앙상블 예보 (단일 공유 파서 호출)
    const dailyList = parseDailyEnsembleForecast(raw.daily);

    const rawLogs: RawLogEntry[] = [
      {
        timestamp: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        location: current.location,
        temp: current.temp,
        ecmwfTemp: current.ecmwfTemp,
        kmaTemp: current.kmaTemp,
        gfsTemp: current.gfsTemp,
        iconTemp: current.iconTemp,
        pop: current.pop,
        accumRain: current.accumRainSoFar,
        forecastDailyRain: current.forecastDailyRain,
        condition: current.conditionText,
        windSpeed: current.windSpeed,
        windDir: current.windDirection,
        status: 'DIRECT_LIVE' as const
      }
    ];

    const finalResult = {
      current,
      hourly: hourlyList,
      daily: dailyList,
      rawLogs
    };

    saveForecastCache(location.id, finalResult);
    return finalResult;
  } catch (err) {
    console.warn('Open-Meteo multi-model fetch failed, checking cached data / fallback:', err);
    const cachedResult = loadForecastCache(location.id);
    if (cachedResult) {
      return cachedResult;
    }
    return getFallbackPayload(location);
  }
}
