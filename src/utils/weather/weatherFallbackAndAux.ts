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
  AIR_QUALITY_SAMPLE,
  NATIONAL_CITIES
} from './weatherTypes';
import {
  determineForecastSkyState,
  parseWmoCode,
  parseKstDateInfo,
  parseKstDateTimeParts,
  getDayOfWeek
} from './conditionClassifier';

export interface ForecastPayload {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  rawLogs: RawLogEntry[];
}

// 메모리 캐시 (직전 런 유지 PREVIOUS_RUN)
const memoryForecastCache: Record<string, { data: ForecastPayload; savedAt: number }> = {};

/**
 * 예보 결과 메모리 및 로컬스토리지 이중 캐싱
 */
export function saveForecastCache(locationId: string, payload: ForecastPayload): void {
  memoryForecastCache[locationId] = { data: payload, savedAt: Date.now() };
  try {
    if (typeof window !== 'undefined' && window.localStorage && payload.hourly.length > 0) {
      localStorage.setItem(
        `WEATHER_CACHE_${locationId}`,
        JSON.stringify({
          data: payload,
          savedAt: Date.now()
        })
      );
    }
  } catch {
    /* ignore storage quota or privacy errors */
  }
}

/**
 * 네트워크 장애 시 직전 성공 런(PREVIOUS_RUN) 캐시 복구
 */
export function loadForecastCache(locationId: string): ForecastPayload | null {
  try {
    let cachedData: ForecastPayload | undefined = memoryForecastCache[locationId]?.data;
    if (!cachedData && typeof window !== 'undefined' && window.localStorage) {
      const cachedStr = localStorage.getItem(`WEATHER_CACHE_${locationId}`);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        if (parsed?.data && Array.isArray(parsed.data.hourly) && parsed.data.hourly.length > 0) {
          cachedData = parsed.data;
        }
      }
    }

    if (cachedData && cachedData.current) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul'
      });
      return {
        ...cachedData,
        current: {
          ...cachedData.current,
          dataStatus: 'PREVIOUS_RUN',
          updatedAt: `${timeStr} (직전 런 유지)`
        }
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 7일간 주간 4대 수치모델 가중 앙상블 공통 파서
 */
export function parseDailyEnsembleForecast(rawDaily: any): DailyForecast[] {
  const dailyList: DailyForecast[] = [];
  if (!rawDaily || !Array.isArray(rawDaily.time)) {
    return dailyList;
  }

  const dMaxE = rawDaily.temperature_2m_max_ecmwf_ifs025 || rawDaily.temperature_2m_max || [];
  const dMaxK = rawDaily.temperature_2m_max_kma_seamless || [];
  const dMaxG = rawDaily.temperature_2m_max_gfs_seamless || [];
  const dMaxI = rawDaily.temperature_2m_max_icon_seamless || [];

  const dMinE = rawDaily.temperature_2m_min_ecmwf_ifs025 || rawDaily.temperature_2m_min || [];
  const dMinK = rawDaily.temperature_2m_min_kma_seamless || [];
  const dMinG = rawDaily.temperature_2m_min_gfs_seamless || [];
  const dMinI = rawDaily.temperature_2m_min_icon_seamless || [];

  const dRainE = rawDaily.precipitation_sum_ecmwf_ifs025 || rawDaily.precipitation_sum || [];
  const dRainK = rawDaily.precipitation_sum_kma_seamless || [];
  const dRainG = rawDaily.precipitation_sum_gfs_seamless || [];
  const dRainI = rawDaily.precipitation_sum_icon_seamless || [];

  const dPop = rawDaily.precipitation_probability_max_ecmwf_ifs025 || rawDaily.precipitation_probability_max || [];
  const dCodes = rawDaily.weather_code_ecmwf_ifs025 || rawDaily.weather_code_kma_seamless || rawDaily.weather_code || [];

  for (let d = 0; d < rawDaily.time.length; d++) {
    const dateInfo = parseKstDateInfo(rawDaily.time[d]);
    if (dateInfo.diffDays < 0) continue;
    if (dailyList.length >= 8) break;

    const maxE = toSafeNum(dMaxE[d], 22);
    const maxG = dMaxG[d] != null ? Number(dMaxG[d]) : maxE;
    const maxI = dMaxI[d] != null ? Number(dMaxI[d]) : maxE;
    const maxTri = (maxE + maxG + maxI) / 3;
    const maxK = dMaxK[d] != null && Math.abs(Number(dMaxK[d]) - maxTri) <= 2.5 ? Number(dMaxK[d]) : maxTri;
    const ensMaxT = Math.round(maxE * 0.50 + maxK * 0.35 + maxI * 0.10 + maxG * 0.05);

    const minE = toSafeNum(dMinE[d], 14);
    const minG = dMinG[d] != null ? Number(dMinG[d]) : minE;
    const minI = dMinI[d] != null ? Number(dMinI[d]) : minE;
    const minTri = (minE + minG + minI) / 3;
    const minK = dMinK[d] != null && Math.abs(Number(dMinK[d]) - minTri) <= 2.5 ? Number(dMinK[d]) : minTri;
    const ensMinT = Math.round(minE * 0.50 + minK * 0.35 + minI * 0.10 + minG * 0.05);

    const rE = toSafeNum(dRainE[d], 0);
    const rG = dRainG[d] != null ? Number(dRainG[d]) : (rE > 0 ? rE * 0.5 : 0);
    const rI = dRainI[d] != null ? Number(dRainI[d]) : (rE > 0 ? rE * 0.5 : 0);
    const rTri = (rE + rG + rI) / 3;
    const rK = dRainK[d] != null ? Number(dRainK[d]) : rTri;
    const ensRainSum = Number((rE * 0.45 + rK * 0.40 + rG * 0.10 + rI * 0.05).toFixed(1));

    const popVal = toSafeNum(dPop[d], 0);
    const ensPop =
      popVal > 0
        ? popVal
        : ensRainSum >= 5.0
        ? Math.min(95, Math.round(50 + ensRainSum * 3))
        : ensRainSum >= 0.5
        ? Math.min(75, Math.round(35 + ensRainSum * 15))
        : ensRainSum > 0
        ? Math.min(45, Math.round(20 + ensRainSum * 40))
        : 10;

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

  return dailyList;
}

/**
 * 안전한 기본 폴백 페이로드 생성
 */
export function getFallbackPayload(location: LocationItem): ForecastPayload {
  const now = new Date();
  const kst = parseKstDateTimeParts(now);
  const timeStr = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul'
  });

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
    conditionText: '구름많음',
    conditionIcon: '⛅',
    windSpeed: 1.2,
    windDirection: '남',
    isDay: kst.hourNum >= 6 && kst.hourNum < 20 ? 1 : 0,
    updatedAt: `${timeStr} (오프라인)`,
    dataStatus: 'FALLBACK'
  };

  const hourlyList: HourlyForecast[] = [];
  for (let offset = -18; offset <= 72; offset += offset <= 12 ? 1 : 4) {
    const itemDate = new Date(now.getTime() + offset * 60 * 60 * 1000);
    const itemKst = parseKstDateTimeParts(itemDate);
    const isPast = offset < 0;
    const isCurrent = offset === 0;
    const isDay = itemKst.hourNum >= 6 && itemKst.hourNum < 20 ? 1 : 0;

    hourlyList.push({
      dateLabel: `(${getDayOfWeek(itemDate)}) ${itemKst.dateStr}`,
      hour: itemKst.hour,
      fullHour: itemKst.hourNum,
      conditionText: '구름많음',
      conditionIcon: isDay ? '⛅' : '☁️',
      temp: 20,
      pop: '20%',
      popNum: 20,
      rain: '0.0mm',
      rainNum: 0,
      windSpeed: '1.2m/s',
      windNum: 1.2,
      windDir: '남',
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
      dayName:
        d === 0
          ? `오늘 (${weekday})`
          : d === 1
          ? `내일 (${weekday})`
          : `${dayKst.month}/${dayKst.day} (${weekday})`,
      dateStr: dayKst.dateStr,
      conditionText: '구름많음',
      conditionIcon: '⛅',
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

/**
 * 주간 예보 단독 직접 조회 (GAS 하이브리드 연동 보조용)
 */
export async function fetchDailyForecastDirect(location: LocationItem): Promise<DailyForecast[]> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&models=best_match,ecmwf_ifs025,kma_seamless,gfs_seamless,icon_seamless&timezone=Asia%2FSeoul&forecast_days=8`;
    const res = await fetch(url, { cache: 'no-store' });
    const raw = await res.json();
    return parseDailyEnsembleForecast(raw.daily);
  } catch {
    return [];
  }
}

/**
 * 전국 주요 도시 실시간 기상 동기화
 */
export async function fetchRealtimeNationalWeather(currentJinju?: CurrentWeather): Promise<NationalCity[]> {
  try {
    const lats = NATIONAL_CITIES.map((c) => c.lat).join(',');
    const lons = NATIONAL_CITIES.map((c) => c.lon).join(',');
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
    const kstHourFormatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: 'numeric',
      hour12: false
    });
    const currentHourKST = parseInt(kstHourFormatter.format(nowKST), 10) || 0;

    return NATIONAL_CITIES.map((city, idx) => {
      if (city.id === 'jinju' && currentJinju) {
        return {
          ...city,
          temp: Math.round(currentJinju.temp),
          condition: currentJinju.conditionText,
          conditionIcon: currentJinju.conditionIcon,
          pop:
            currentJinju.pop !== undefined
              ? currentJinju.pop
              : currentJinju.forecastDailyRain > 0
              ? 45
              : 10,
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
      const isDay = cur.is_day !== undefined ? cur.is_day : currentHourKST >= 6 && currentHourKST < 20 ? 1 : 0;

      const popArr = hourly.precipitation_probability || [];
      const curHourPop =
        hourlyPop !== undefined
          ? Number(hourlyPop)
          : popArr.length > 0
          ? Math.max(...popArr.slice(0, 24))
          : rain > 0
          ? 70
          : 10;
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

/**
 * 실시간 대기질(미세먼지/오존/통합대기환경지수) 조회
 */
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

    let pm10Status: '좋음' | '보통' | '나쁨' | '매우나쁨' = '좋음';
    if (pm10 > 150) pm10Status = '매우나쁨';
    else if (pm10 > 80) pm10Status = '나쁨';
    else if (pm10 > 30) pm10Status = '보통';

    let pm25Status: '좋음' | '보통' | '나쁨' | '매우나쁨' = '좋음';
    if (pm25 > 75) pm25Status = '매우나쁨';
    else if (pm25 > 35) pm25Status = '나쁨';
    else if (pm25 > 15) pm25Status = '보통';

    let o3Status: '좋음' | '보통' | '나쁨' = '좋음';
    if (o3 > 0.09) o3Status = '나쁨';
    else if (o3 > 0.03) o3Status = '보통';

    let aqiScore = Math.max(
      Math.round((pm10 / 100) * 100),
      Math.round((pm25 / 50) * 100),
      Math.round(toSafeNum(cur.european_aqi, 30))
    );
    if (isNaN(aqiScore) || aqiScore <= 0) aqiScore = 32;

    let overallStatus: '좋음' | '보통' | '나쁨' | '매우나쁨' = '좋음';
    if (pm10Status === '매우나쁨' || pm25Status === '매우나쁨' || aqiScore > 250) {
      overallStatus = '매우나쁨';
    } else if (pm10Status === '나쁨' || pm25Status === '나쁨' || aqiScore > 100) {
      overallStatus = '나쁨';
    } else if (pm10Status === '보통' || pm25Status === '보통' || aqiScore > 50) {
      overallStatus = '보통';
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
