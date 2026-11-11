import {
  LocationItem,
  HourlyForecast,
  CurrentWeather,
  DailyForecast,
  NationalCity,
  RawLogEntry,
  AirQualityData
} from '../../types';
import {
  toSafeNum,
  LOCATIONS,
  AIR_QUALITY_SAMPLE,
  NATIONAL_CITIES
} from './weatherTypes';
import {
  calculateDewPoint,
  calculateRoadMoistureIndex,
  calculateCompositePrecipitationIndex,
  calculateDynamicEnsemble
} from './ensembleEngine';
import {
  determineForecastSkyState,
  determineCurrentSkyState,
  determinePreciseSkyState,
  parseWmoCode,
  parseWindDirection,
  getKstTodayDateStr,
  parseKstDateInfo,
  parseKstDateTimeParts,
  getDayOfWeek
} from './conditionClassifier';
import {
  analyzeMultiStationGroundTruth,
  analyzeJangjaeCctvGroundTruth
} from '../cctvWeatherAnalyzer';

// 메모리 캐시 (직전 런 유지 PREVIOUS_RUN)
const memoryForecastCache: Record<string, { data: any; savedAt: number }> = {};

/**
 * 실시간 4대 모델 앙상블 및 관측 실황 통합 기상 예보 조회 (v8.4)
 */
export async function fetchEnsembleForecast(location: LocationItem, gasUrl?: string): Promise<{
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
            gfsTemp: gasCur.gfsTemp != null ? toSafeNum(gasCur.gfsTemp, toSafeNum(gasCur.temp, 20.0)) : undefined,
            iconTemp: gasCur.iconTemp != null ? toSafeNum(gasCur.iconTemp, toSafeNum(gasCur.temp, 20.0)) : undefined,
            pop: toSafeNum(gasCur.pop ?? gasCur.curPopEns, 0),
            rain: toSafeNum(gasCur.rain ?? gasCur.curHourRain, 0.0),
            accumRainSoFar: toSafeNum(gasCur.accumRain ?? gasCur.accumRainSoFar, 0.0),
            forecastDailyRain: toSafeNum(gasCur.forecastDailyRain, 0.0),
            conditionText: gasCur.condition || gasCur.conditionText || '구름많음',
            conditionIcon: gasCur.icon || gasCur.conditionIcon || '⛅',
            windSpeed: toSafeNum(gasCur.wind ?? gasCur.windSpeed, 1.0),
            windDirection: gasCur.windDir || gasCur.windDirection || '남',
            isDay: gasCur.isDay !== undefined ? toSafeNum(gasCur.isDay, 1) : 1,
            updatedAt: gasCur.updatedAt || new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }),
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

          const rawLogs: RawLogEntry[] = [{
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
          }];

          const gasResult = {
            current,
            hourly,
            daily: await fetchDailyForecastDirect(location),
            rawLogs
          };

          memoryForecastCache[location.id] = { data: gasResult, savedAt: Date.now() };
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.setItem(`WEATHER_CACHE_${location.id}`, JSON.stringify({
                data: gasResult,
                savedAt: Date.now()
              }));
            }
          } catch { /* ignore */ }

          return gasResult;
        }
      }
    } catch (err) {
      console.warn("GAS API 연동 지연/실패, Open-Meteo Multi-Model 실시간 직접 호출로 자동 전환:", err);
    }
  }

  // 2. Open-Meteo 실시간 동시 수신 및 4대 모델 앙상블 (8초 타임아웃)
  try {
    const primaryUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&models=best_match,ecmwf_ifs025,kma_seamless,gfs_seamless,icon_seamless&wind_speed_unit=ms&past_days=1&forecast_days=8&timezone=Asia%2FSeoul`;
    const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&wind_speed_unit=ms&past_days=1&forecast_days=8&timezone=Asia%2FSeoul`;

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
      console.warn("Open-Meteo 4-Model 1차 호출 실패, 백업 엔드포인트 시도:", primaryErr);
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
      throw new Error("Open-Meteo 데이터 파싱 불가");
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
    const bestTemp = h["temperature_2m_best_match"] || h.temperature_2m || [];
    const ecmwfTemp = h["temperature_2m_ecmwf_ifs025"] || bestTemp;
    const kmaTemp = h["temperature_2m_kma_seamless"] || [];
    const gfsTemp = h["temperature_2m_gfs_seamless"] || [];
    const iconTemp = h["temperature_2m_icon_seamless"] || [];

    const bestPop = h["precipitation_probability_best_match"] || h.precipitation_probability || [];
    const ecmwfPop = h["precipitation_probability_ecmwf_ifs025"] || bestPop;
    const kmaPop = h["precipitation_probability_kma_seamless"] || [];
    const gfsPop = h["precipitation_probability_gfs_seamless"] || [];
    const iconPop = h["precipitation_probability_icon_seamless"] || [];

    const bestRain = h["precipitation_best_match"] || h.precipitation || [];
    const ecmwfRain = h["precipitation_ecmwf_ifs025"] || bestRain;
    const kmaRain = h["precipitation_kma_seamless"] || [];
    const gfsRain = h["precipitation_gfs_seamless"] || [];
    const iconRain = h["precipitation_icon_seamless"] || [];

    const bestWind = h["wind_speed_10m_best_match"] || h.wind_speed_10m || [];
    const ecmwfWind = h["wind_speed_10m_ecmwf_ifs025"] || bestWind;
    const kmaWind = h["wind_speed_10m_kma_seamless"] || [];
    const gfsWind = h["wind_speed_10m_gfs_seamless"] || [];
    const iconWind = h["wind_speed_10m_icon_seamless"] || [];

    const bestCodes = h["weather_code_best_match"] || h.weather_code || [];
    const kmaWeatherCodes = h["weather_code_kma_seamless"] || bestCodes;
    const weatherCodes = h["weather_code_ecmwf_ifs025"] || bestCodes;
    const windDirs = h["wind_direction_10m_ecmwf_ifs025"] || h["wind_direction_10m_best_match"] || h.wind_direction_10m || [];

    const now = new Date();
    const kstNow = parseKstDateTimeParts(now);
    const kstPrefix = kstNow.isoPrefix;

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const kstYesterday = parseKstDateTimeParts(yesterday);
    const yesterdayDateStr = kstYesterday.dateStr;

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const kstTomorrow = parseKstDateTimeParts(tomorrow);
    const tomorrowDateStr = kstTomorrow.dateStr;

    let curIdx = h.time ? h.time.findIndex((t: string) => t.startsWith(kstPrefix)) : -1;
    if (curIdx === -1) {
      curIdx = h.time ? h.time.findIndex((t: string) => t.includes(`T${kstNow.hour}:00`)) : -1;
      if (curIdx === -1) {
        curIdx = h.time ? Math.min(24, h.time.length - 1) : 0;
      }
    }

    // [기온 앙상블 기준값 및 KMA 결측/이상치 안전 보정 (v8.4)]
    const curEcmwfT = toSafeNum(ecmwfTemp[curIdx], liveObsTemp != null ? liveObsTemp : 20.0);
    const curGfsT = gfsTemp[curIdx] != null ? toSafeNum(gfsTemp[curIdx], curEcmwfT) : curEcmwfT;
    const curIconT = iconTemp[curIdx] != null ? toSafeNum(iconTemp[curIdx], curEcmwfT) : curEcmwfT;
    const curTriAvgT = Number(((curEcmwfT + curGfsT + curIconT) / 3).toFixed(1));

    // 기상청 지상 실측 진주 관측소 우선 연동하되, 결측 시 타 수치모델 앙상블 평균으로 안전보정
    let curKmaT = curTriAvgT;
    if (kmaTemp[curIdx] != null && !isNaN(Number(kmaTemp[curIdx]))) {
      const rawK = Number(kmaTemp[curIdx]);
      if (Math.abs(rawK - curTriAvgT) <= 2.2) {
        curKmaT = rawK;
      } else {
        curKmaT = curTriAvgT;
      }
    }

    const curEcmwfP = toSafeNum(ecmwfPop[curIdx], 0);
    const curGfsP = gfsPop[curIdx] != null ? toSafeNum(gfsPop[curIdx], curEcmwfP) : curEcmwfP;
    const curIconP = iconPop[curIdx] != null ? toSafeNum(iconPop[curIdx], curEcmwfP) : curEcmwfP;
    const curTriAvgP = Math.round((curEcmwfP + curGfsP + curIconP) / 3);
    const curKmaP = kmaPop[curIdx] != null && !isNaN(Number(kmaPop[curIdx])) ? Number(kmaPop[curIdx]) : curTriAvgP;

    const curRainE = toSafeNum(ecmwfRain[curIdx], 0);
    const curRainG = gfsRain[curIdx] != null ? toSafeNum(gfsRain[curIdx], 0) : 0;
    const curRainI = iconRain[curIdx] != null ? toSafeNum(iconRain[curIdx], 0) : 0;
    const curTriAvgR = Number(((curRainE + curRainG + curRainI) / 3).toFixed(1));
    const curRainK = kmaRain[curIdx] != null && !isNaN(Number(kmaRain[curIdx])) ? Number(kmaRain[curIdx]) : curTriAvgR;

    const curEcmwfW = toSafeNum(ecmwfWind[curIdx], liveObsWind != null ? liveObsWind : 1.2);
    const curKmaW = kmaWind[curIdx] != null ? toSafeNum(kmaWind[curIdx], curEcmwfW) : curEcmwfW;
    const curGfsW = gfsWind[curIdx] != null ? toSafeNum(gfsWind[curIdx], curEcmwfW) : curEcmwfW;
    const curIconW = iconWind[curIdx] != null ? toSafeNum(iconWind[curIdx], curEcmwfW) : curEcmwfW;

    const curKmaCode = kmaWeatherCodes[curIdx] != null ? kmaWeatherCodes[curIdx] : (weatherCodes[curIdx] != null ? weatherCodes[curIdx] : 1);

    const curEns = calculateDynamicEnsemble({
      ecmwfTemp: curEcmwfT,
      kmaTemp: curKmaT,
      gfsTemp: curGfsT,
      iconTemp: curIconT,
      bestTemp: bestTemp[curIdx],
      ecmwfPop: curEcmwfP,
      kmaPop: curKmaP,
      gfsPop: curGfsP,
      iconPop: curIconP,
      bestPop: bestPop[curIdx],
      ecmwfRain: curRainE,
      kmaRain: curRainK,
      gfsRain: curRainG,
      iconRain: curRainI,
      bestRain: bestRain[curIdx],
      ecmwfWind: curEcmwfW,
      kmaWind: curKmaW,
      gfsWind: curGfsW,
      iconWind: curIconW,
      bestWind: bestWind[curIdx],
      isExtendedTerm: false,
      wmoCode: curKmaCode
    });

    const curTempEns = curEns.ensTemp;
    const curWindEns = curEns.ensWind;
    const curHourRain = curEns.ensRain;

    // 지상 실측 기온 반영
    const finalCurTemp = liveObsTemp != null
      ? Number((liveObsTemp * 0.75 + curTempEns * 0.25).toFixed(1))
      : curTempEns;

    const finalCurWind = liveObsWind != null ? Number(liveObsWind.toFixed(1)) : curWindEns;
    const finalCurWindDir = liveObsWindDir != null
      ? parseWindDirection(liveObsWindDir)
      : parseWindDirection(windDirs[curIdx]);

    let today24hTotalRain = 0.0;
    let accumRainSoFar = 0.0;
    if (Array.isArray(h.time)) {
      for (let i = 0; i < h.time.length; i++) {
        const timeStr = h.time[i] || '';
        const isTodaySlot = timeStr.startsWith(`${kstNow.year}-${kstNow.month}-${kstNow.day}`);
        if (isTodaySlot) {
          const rE = toSafeNum(ecmwfRain[i], 0);
          const rK = kmaRain[i];
          const rG = gfsRain[i];
          const rI = iconRain[i];
          const slotRain = calculateDynamicEnsemble({
            ecmwfTemp: curTriAvgT,
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
      if (idx >= 0 && idx < (ecmwfRain?.length || 0)) {
        const rVal = toSafeNum(ecmwfRain[idx], 0);
        recent6hRains.push(rVal);
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

    const isDay = liveObsIsDay !== null ? liveObsIsDay : (kstNow.hourNum >= 6 && kstNow.hourNum < 20 ? 1 : 0);
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
      updatedAt: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' }),
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
      const itemDate = new Date(slotTimeStr.includes('+') || slotTimeStr.endsWith('Z') ? slotTimeStr : `${slotTimeStr}+09:00`);
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

      // 슬롯별 기온 및 KMA 결측/이상치 안전 보정 (v8.4)
      const tE = toSafeNum(ecmwfTemp[idx], 20.0);
      const tG = gfsTemp[idx] != null ? toSafeNum(gfsTemp[idx], tE) : tE;
      const tI = iconTemp[idx] != null ? toSafeNum(iconTemp[idx], tE) : tE;
      const tTriAvg = Number(((tE + tG + tI) / 3).toFixed(1));

      let tK = tTriAvg;
      if (kmaTemp[idx] != null && !isNaN(Number(kmaTemp[idx]))) {
        const rawK = Number(kmaTemp[idx]);
        if (Math.abs(rawK - tTriAvg) <= 2.2) {
          tK = rawK;
        } else {
          tK = tTriAvg;
        }
      }

      const pE = toSafeNum(ecmwfPop[idx], 0);
      const pG = gfsPop[idx] != null ? toSafeNum(gfsPop[idx], pE) : pE;
      const pI = iconPop[idx] != null ? toSafeNum(iconPop[idx], pE) : pE;
      const pTriAvg = Math.round((pE + pG + pI) / 3);
      const pK = kmaPop[idx] != null && !isNaN(Number(kmaPop[idx])) ? Number(kmaPop[idx]) : pTriAvg;

      const rE = toSafeNum(ecmwfRain[idx], 0);
      const rG = gfsRain[idx] != null ? toSafeNum(gfsRain[idx], 0) : 0;
      const rI = iconRain[idx] != null ? toSafeNum(iconRain[idx], 0) : 0;
      const rTriAvg = Number(((rE + rG + rI) / 3).toFixed(1));
      const rK = kmaRain[idx] != null && !isNaN(Number(kmaRain[idx])) ? Number(kmaRain[idx]) : rTriAvg;

      const wE = toSafeNum(ecmwfWind[idx], 1.2);
      const wK = kmaWind[idx] != null ? toSafeNum(kmaWind[idx], wE) : wE;
      const wG = gfsWind[idx] != null ? toSafeNum(gfsWind[idx], wE) : wE;
      const wI = iconWind[idx] != null ? toSafeNum(iconWind[idx], wE) : wE;

      const code = weatherCodes[idx] != null ? weatherCodes[idx] : 1;
      const targetWmo = isCurrent ? finalWeatherCode : code;
      const isExtended = segmentType === 'extended72';

      const ensSlot = calculateDynamicEnsemble({
        ecmwfTemp: tE,
        kmaTemp: tK,
        gfsTemp: tG,
        iconTemp: tI,
        bestTemp: bestTemp[idx],
        ecmwfPop: pE,
        kmaPop: pK,
        gfsPop: pG,
        iconPop: pI,
        bestPop: bestPop[idx],
        ecmwfRain: rE,
        kmaRain: rK,
        gfsRain: rG,
        iconRain: rI,
        bestRain: bestRain[idx],
        ecmwfWind: wE,
        kmaWind: wK,
        gfsWind: wG,
        iconWind: wI,
        bestWind: bestWind[idx],
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

      const hourIsDay = isCurrent ? isDay : (itemHourNum >= 6 && itemHourNum < 20 ? 1 : 0);

      // [예보 상태 판정: 40~65% 비/이슬비 가능성, 66% 이상 확정 표기]
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

    const todayDateStr = kstNow.dateStr;
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
          hourlyList.push(buildSlot(idx, offset === 0 ? 'current' : 'forecast36', false, offset === 0, 1, offset));
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

    // 7일간 주간 4대 수치모델 영역별 가중 앙상블 예보
    const dailyList: DailyForecast[] = [];
    if (raw.daily && Array.isArray(raw.daily.time)) {
      const dMaxE = raw.daily.temperature_2m_max_ecmwf_ifs025 || raw.daily.temperature_2m_max || [];
      const dMaxK = raw.daily.temperature_2m_max_kma_seamless || [];
      const dMaxG = raw.daily.temperature_2m_max_gfs_seamless || [];
      const dMaxI = raw.daily.temperature_2m_max_icon_seamless || [];

      const dMinE = raw.daily.temperature_2m_min_ecmwf_ifs025 || raw.daily.temperature_2m_min || [];
      const dMinK = raw.daily.temperature_2m_min_kma_seamless || [];
      const dMinG = raw.daily.temperature_2m_min_gfs_seamless || [];
      const dMinI = raw.daily.temperature_2m_min_icon_seamless || [];

      const dRainE = raw.daily.precipitation_sum_ecmwf_ifs025 || raw.daily.precipitation_sum || [];
      const dRainK = raw.daily.precipitation_sum_kma_seamless || [];
      const dRainG = raw.daily.precipitation_sum_gfs_seamless || [];
      const dRainI = raw.daily.precipitation_sum_icon_seamless || [];

      const dPop = raw.daily.precipitation_probability_max_ecmwf_ifs025 || raw.daily.precipitation_probability_max || [];
      const dCodes = raw.daily.weather_code_ecmwf_ifs025 || raw.daily.weather_code_kma_seamless || raw.daily.weather_code || [];

      for (let d = 0; d < raw.daily.time.length; d++) {
        const dateInfo = parseKstDateInfo(raw.daily.time[d]);
        if (dateInfo.diffDays < 0) continue;
        if (dailyList.length >= 8) break;

        const maxE = toSafeNum(dMaxE[d], 22);
        const maxG = dMaxG[d] != null ? Number(dMaxG[d]) : maxE;
        const maxI = dMaxI[d] != null ? Number(dMaxI[d]) : maxE;
        const maxTri = (maxE + maxG + maxI) / 3;
        const maxK = dMaxK[d] != null && Math.abs(Number(dMaxK[d]) - maxTri) <= 2.5 ? Number(dMaxK[d]) : maxTri;
        const ensMaxT = Math.round((maxE * 0.50) + (maxK * 0.35) + (maxI * 0.10) + (maxG * 0.05));

        const minE = toSafeNum(dMinE[d], 14);
        const minG = dMinG[d] != null ? Number(dMinG[d]) : minE;
        const minI = dMinI[d] != null ? Number(dMinI[d]) : minE;
        const minTri = (minE + minG + minI) / 3;
        const minK = dMinK[d] != null && Math.abs(Number(dMinK[d]) - minTri) <= 2.5 ? Number(dMinK[d]) : minTri;
        const ensMinT = Math.round((minE * 0.50) + (minK * 0.35) + (minI * 0.10) + (minG * 0.05));

        const rE = toSafeNum(dRainE[d], 0);
        const rG = dRainG[d] != null ? Number(dRainG[d]) : (rE > 0 ? rE * 0.5 : 0);
        const rI = dRainI[d] != null ? Number(dRainI[d]) : (rE > 0 ? rE * 0.5 : 0);
        const rTri = (rE + rG + rI) / 3;
        const rK = dRainK[d] != null ? Number(dRainK[d]) : rTri;
        const ensRainSum = Number(((rE * 0.45) + (rK * 0.40) + (rG * 0.10) + (rI * 0.05)).toFixed(1));

        const popVal = toSafeNum(dPop[d], 0);
        const ensPop = popVal > 0 
          ? popVal 
          : (ensRainSum >= 5.0 
              ? Math.min(95, Math.round(50 + ensRainSum * 3))
              : ensRainSum >= 0.5 
                ? Math.min(75, Math.round(35 + ensRainSum * 15))
                : ensRainSum > 0 
                  ? Math.min(45, Math.round(20 + ensRainSum * 40))
                  : 10);
        const code = toSafeNum(dCodes[d], 1);
        const cond = determineForecastSkyState({
          wmoCode: code,
          isDay: 1,
          ensRain: ensRainSum,
          ensPop: ensPop
        });

        dailyList.push({
          dayName: dateInfo.dayName,
          dateStr: dateInfo.dateStr,
          conditionText: cond.text,
          conditionIcon: cond.icon,
          minTemp: ensMinT,
          maxTemp: ensMaxT,
          pop: ensPop,
          rain: ensRainSum
        });
      }
    }

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

    memoryForecastCache[location.id] = { data: finalResult, savedAt: Date.now() };
    try {
      if (typeof window !== 'undefined' && window.localStorage && hourlyList.length > 0) {
        localStorage.setItem(`WEATHER_CACHE_${location.id}`, JSON.stringify({
          data: finalResult,
          savedAt: Date.now()
        }));
      }
    } catch { /* ignore */ }

    return finalResult;
  } catch (err) {
    console.warn("Open-Meteo multi-model fetch failed, checking cached data / fallback:", err);

    try {
      let cachedData: any = memoryForecastCache[location.id]?.data;
      if (!cachedData && typeof window !== 'undefined' && window.localStorage) {
        const cachedStr = localStorage.getItem(`WEATHER_CACHE_${location.id}`);
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (parsed && parsed.data && Array.isArray(parsed.data.hourly) && parsed.data.hourly.length > 0) {
            cachedData = parsed.data;
          }
        }
      }

      if (cachedData && cachedData.current) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
        return {
          ...cachedData,
          current: {
            ...cachedData.current,
            dataStatus: 'PREVIOUS_RUN' as const,
            updatedAt: `${timeStr} (직전 런 유지)`
          }
        };
      }
    } catch { /* ignore */ }

    return getFallbackPayload(location);
  }
}

/**
 * 안전한 기본 폴백 페이로드 생성
 */
function getFallbackPayload(location: LocationItem) {
  const now = new Date();
  const kst = parseKstDateTimeParts(now);
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });

  const current: CurrentWeather = {
    location: location.fullName,
    temp: 20.0,
    ecmwfTemp: 20.0,
    kmaTemp: 20.0,
    gfsTemp: 20.0,
    iconTemp: 20.0,
    pop: 20,
    rain: 0.0,
    accumRainSoFar: 0.0,
    forecastDailyRain: 0.0,
    conditionText: "구름많음",
    conditionIcon: "⛅",
    windSpeed: 1.2,
    windDirection: "남",
    isDay: kst.hourNum >= 6 && kst.hourNum < 20 ? 1 : 0,
    updatedAt: `${timeStr} (오프라인)`,
    dataStatus: 'FALLBACK'
  };

  const hourlyList: HourlyForecast[] = [];
  for (let offset = -18; offset <= 72; offset += (offset <= 12 ? 1 : 4)) {
    const itemDate = new Date(now.getTime() + offset * 60 * 60 * 1000);
    const itemKst = parseKstDateTimeParts(itemDate);
    const isPast = offset < 0;
    const isCurrent = offset === 0;
    const isDay = itemKst.hourNum >= 6 && itemKst.hourNum < 20 ? 1 : 0;

    hourlyList.push({
      dateLabel: `(${getDayOfWeek(itemDate)}) ${itemKst.dateStr}`,
      hour: itemKst.hour,
      fullHour: itemKst.hourNum,
      conditionText: "구름많음",
      conditionIcon: isDay ? "⛅" : "☁️",
      temp: 20,
      pop: "20%",
      popNum: 20,
      rain: "0.0mm",
      rainNum: 0,
      windSpeed: "1.2m/s",
      windNum: 1.2,
      windDir: "남",
      ecmwfTemp: 20,
      kmaTemp: 20,
      gfsTemp: 20,
      iconTemp: 20,
      isPast,
      isCurrent,
      segmentType: isPast ? 'past' : isCurrent ? 'current' : 'forecast36',
      stepHours: 1,
      relativeHourOffset: offset,
      rawTime: itemDate.toISOString()
    });
  }

  const dailyList: DailyForecast[] = [];
  for (let d = 0; d < 7; d++) {
    const dayDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const dayKst = parseKstDateTimeParts(dayDate);
    const weekday = getDayOfWeek(dayDate);
    dailyList.push({
      dayName: d === 0 ? `오늘 (${weekday})` : d === 1 ? `내일 (${weekday})` : `${dayKst.month}/${dayKst.day} (${weekday})`,
      dateStr: dayKst.dateStr,
      conditionText: "구름많음",
      conditionIcon: "⛅",
      minTemp: 14,
      maxTemp: 22,
      pop: 20,
      rain: 0.0
    });
  }

  return {
    current,
    hourly: hourlyList,
    daily: dailyList,
    rawLogs: []
  };
}

export async function fetchDailyForecastDirect(location: LocationItem): Promise<DailyForecast[]> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&models=best_match,ecmwf_ifs025,kma_seamless,gfs_seamless,icon_seamless&timezone=Asia%2FSeoul&forecast_days=8`;
    const res = await fetch(url, { cache: 'no-store' });
    const raw = await res.json();
    const result: DailyForecast[] = [];
    if (raw.daily && Array.isArray(raw.daily.time)) {
      const dMaxE = raw.daily.temperature_2m_max_ecmwf_ifs025 || raw.daily.temperature_2m_max || [];
      const dMaxK = raw.daily.temperature_2m_max_kma_seamless || [];
      const dMaxG = raw.daily.temperature_2m_max_gfs_seamless || [];
      const dMaxI = raw.daily.temperature_2m_max_icon_seamless || [];

      const dMinE = raw.daily.temperature_2m_min_ecmwf_ifs025 || raw.daily.temperature_2m_min || [];
      const dMinK = raw.daily.temperature_2m_min_kma_seamless || [];
      const dMinG = raw.daily.temperature_2m_min_gfs_seamless || [];
      const dMinI = raw.daily.temperature_2m_min_icon_seamless || [];

      const dRainE = raw.daily.precipitation_sum_ecmwf_ifs025 || raw.daily.precipitation_sum || [];
      const dRainK = raw.daily.precipitation_sum_kma_seamless || [];
      const dRainG = raw.daily.precipitation_sum_gfs_seamless || [];
      const dRainI = raw.daily.precipitation_sum_icon_seamless || [];

      const dPop = raw.daily.precipitation_probability_max_ecmwf_ifs025 || raw.daily.precipitation_probability_max || [];
      const dCodes = raw.daily.weather_code_ecmwf_ifs025 || raw.daily.weather_code_kma_seamless || raw.daily.weather_code || [];

      for (let d = 0; d < raw.daily.time.length; d++) {
        const dateInfo = parseKstDateInfo(raw.daily.time[d]);
        if (dateInfo.diffDays < 0) continue;
        if (result.length >= 8) break;

        const maxE = toSafeNum(dMaxE[d], 22);
        const maxG = dMaxG[d] != null ? Number(dMaxG[d]) : maxE;
        const maxI = dMaxI[d] != null ? Number(dMaxI[d]) : maxE;
        const maxTri = (maxE + maxG + maxI) / 3;
        const maxK = dMaxK[d] != null && Math.abs(Number(dMaxK[d]) - maxTri) <= 2.5 ? Number(dMaxK[d]) : maxTri;
        const ensMaxT = Math.round((maxE * 0.50) + (maxK * 0.35) + (maxI * 0.10) + (maxG * 0.05));

        const minE = toSafeNum(dMinE[d], 14);
        const minG = dMinG[d] != null ? Number(dMinG[d]) : minE;
        const minI = dMinI[d] != null ? Number(dMinI[d]) : minE;
        const minTri = (minE + minG + minI) / 3;
        const minK = dMinK[d] != null && Math.abs(Number(dMinK[d]) - minTri) <= 2.5 ? Number(dMinK[d]) : minTri;
        const ensMinT = Math.round((minE * 0.50) + (minK * 0.35) + (minI * 0.10) + (minG * 0.05));

        const rE = toSafeNum(dRainE[d], 0);
        const rG = dRainG[d] != null ? Number(dRainG[d]) : (rE > 0 ? rE * 0.5 : 0);
        const rI = dRainI[d] != null ? Number(dRainI[d]) : (rE > 0 ? rE * 0.5 : 0);
        const rTri = (rE + rG + rI) / 3;
        const rK = dRainK[d] != null ? Number(dRainK[d]) : rTri;
        const ensRainSum = Number(((rE * 0.45) + (rK * 0.40) + (rG * 0.10) + (rI * 0.05)).toFixed(1));

        const popVal = toSafeNum(dPop[d], 0);
        const ensPop = popVal > 0 ? popVal : (ensRainSum >= 0.5 ? 70 : ensRainSum > 0 ? 40 : 10);
        const code = toSafeNum(dCodes[d], 1);
        const cond = determineForecastSkyState({
          wmoCode: code,
          isDay: 1,
          ensRain: ensRainSum,
          ensPop: ensPop
        });

        result.push({
          dayName: dateInfo.dayName,
          dateStr: dateInfo.dateStr,
          conditionText: cond.text,
          conditionIcon: cond.icon,
          minTemp: ensMinT,
          maxTemp: ensMaxT,
          pop: ensPop,
          rain: ensRainSum
        });
      }
    }
    return result;
  } catch (e) {
    return [];
  }
}

export async function fetchRealtimeNationalWeather(currentJinju?: CurrentWeather): Promise<NationalCity[]> {
  try {
    const lats = NATIONAL_CITIES.map(c => c.lat).join(',');
    const lons = NATIONAL_CITIES.map(c => c.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,precipitation,relative_humidity_2m,wind_speed_10m,is_day&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&forecast_days=1&timezone=Asia%2FSeoul`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`National weather fetch error: ${res.status}`);
    }
    const data = await res.json();
    const locationsData = Array.isArray(data) ? data : [data];

    const nowKST = new Date();
    const kstHourFormatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false });
    const currentHourKST = parseInt(kstHourFormatter.format(nowKST), 10) || 0;

    return NATIONAL_CITIES.map((city, idx) => {
      if (city.id === 'jinju' && currentJinju) {
        return {
          ...city,
          temp: Math.round(currentJinju.temp),
          condition: currentJinju.conditionText,
          conditionIcon: currentJinju.conditionIcon,
          pop: currentJinju.pop !== undefined ? currentJinju.pop : (currentJinju.forecastDailyRain > 0 ? 45 : 10),
          rain: currentJinju.accumRainSoFar || currentJinju.forecastDailyRain || 0
        };
      }

      const locData = locationsData[idx] || locationsData[0];
      if (!locData) return city;

      const cur = locData.current || {};
      const hourly = locData.hourly || {};
      const hourlyPop = hourly.precipitation_probability?.[currentHourKST];
      const hourlyRain = hourly.precipitation?.[currentHourKST];
      const hourlyCode = hourly.weather_code?.[currentHourKST];

      const wCode = cur.weather_code !== undefined ? cur.weather_code : (hourlyCode ?? 1);
      const rain = toSafeNum(cur.precipitation !== undefined ? cur.precipitation : hourlyRain, 0);
      const isDay = cur.is_day !== undefined ? cur.is_day : (currentHourKST >= 6 && currentHourKST < 20 ? 1 : 0);
      
      const popArr = hourly.precipitation_probability || [];
      const curHourPop = hourlyPop !== undefined ? Number(hourlyPop) : (popArr.length > 0 ? Math.max(...popArr.slice(0, 24)) : (rain > 0 ? 70 : 10));
      const pop = isNaN(curHourPop) ? 0 : Math.round(curHourPop);

      const cond = parseWmoCode(wCode, isDay, rain, pop);
      const temp = Math.round(toSafeNum(cur.temperature_2m, city.temp));

      return {
        ...city,
        temp,
        condition: cond.text,
        conditionIcon: cond.icon,
        pop,
        rain: Number(rain.toFixed(1))
      };
    });
  } catch (err) {
    console.warn('전국 날씨 실시간 동기화 실패, 기본값 사용:', err);
    return NATIONAL_CITIES;
  }
}

export async function fetchRealtimeAirQuality(lat: number, lon: number): Promise<AirQualityData> {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,ozone,nitrogen_dioxide,european_aqi,us_aqi&timezone=Asia%2FSeoul`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Air Quality API error: ${res.status}`);
    }
    const json = await res.json();
    const cur = json.current || {};

    const pm10 = Math.round(toSafeNum(cur.pm10, 24));
    const pm25 = Math.round(toSafeNum(cur.pm2_5, 12));
    const o3 = Number((toSafeNum(cur.ozone, 55) / 2000).toFixed(3));
    const no2 = Number((toSafeNum(cur.nitrogen_dioxide, 30) / 1910).toFixed(3));

    let pm10Status: "좋음" | "보통" | "나쁨" | "매우나쁨" = "좋음";
    if (pm10 > 150) pm10Status = "매우나쁨";
    else if (pm10 > 80) pm10Status = "나쁨";
    else if (pm10 > 30) pm10Status = "보통";

    let pm25Status: "좋음" | "보통" | "나쁨" | "매우나쁨" = "좋음";
    if (pm25 > 75) pm25Status = "매우나쁨";
    else if (pm25 > 35) pm25Status = "나쁨";
    else if (pm25 > 15) pm25Status = "보통";

    let o3Status: "좋음" | "보통" | "나쁨" = "좋음";
    if (o3 > 0.09) o3Status = "나쁨";
    else if (o3 > 0.03) o3Status = "보통";

    let aqiScore = Math.max(
      Math.round((pm10 / 100) * 100),
      Math.round((pm25 / 50) * 100),
      Math.round(toSafeNum(cur.european_aqi, 30))
    );
    if (isNaN(aqiScore) || aqiScore <= 0) aqiScore = 32;

    let overallStatus: "좋음" | "보통" | "나쁨" | "매우나쁨" = "좋음";
    if (pm10Status === "매우나쁨" || pm25Status === "매우나쁨" || aqiScore > 250) {
      overallStatus = "매우나쁨";
    } else if (pm10Status === "나쁨" || pm25Status === "나쁨" || aqiScore > 100) {
      overallStatus = "나쁨";
    } else if (pm10Status === "보통" || pm25Status === "보통" || aqiScore > 50) {
      overallStatus = "보통";
    }

    return {
      pm10,
      pm10Status,
      pm25,
      pm25Status,
      o3,
      o3Status,
      no2,
      aqiScore,
      overallStatus
    };
  } catch (err) {
    console.warn('대기질 실시간 API 호출 실패, 기본값 사용:', err);
    return AIR_QUALITY_SAMPLE;
  }
}
