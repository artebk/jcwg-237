import { toSafeNum } from './weatherTypes';

/**
 * [예보 전용] 강수확률(POP) 연계 정밀 예보 상태 및 아이콘 판별 알고리즘 (v8.4)
 * - 0% ~ 19%: 맑음 / 구름많음 / 흐림 (순수 운량 기준)
 * - 20% ~ 39%: 흐림 (비로 단정하지 않고 흐림 예보)
 * - 40% ~ 65%: 비가능성 / 이슬비가능성 (구름 속 물음표 ? cloud-doubt-rain 전용 아이콘)
 *   * 0.1mm 미세 강수 또는 WMO 51~57: "이슬비가능성"
 *   * 0.3mm 이상 또는 WMO 61~67/80~82: "비가능성"
 * - 66% ~ 100% (또는 예보 강수량 >= 0.5mm): 확실한 강수 확정 표기 ("이슬비" / "비" / "소나기")
 */
export function determineForecastSkyState(params: {
  wmoCode: number;
  isDay: number;
  ensRain: number;
  ensPop: number;
  humidity?: number;
}): { text: string; icon: string } {
  const c = toSafeNum(params.wmoCode, 1);
  const rain = params.ensRain || 0;
  const pop = params.ensPop || 0;
  const isDay = params.isDay;

  // 1. 눈(Snow) 계열 WMO 코드 (71, 73, 75, 77, 85, 86)
  if ([71, 73, 75, 77, 85, 86].includes(c)) {
    return { text: "눈", icon: "❄️" };
  }

  // 2. 뇌우 / 낙뢰 (Thunderstorm: 95, 96, 99) 코드 처리
  const isThunder = [95, 96, 99].includes(c);
  if (isThunder) {
    if (rain >= 0.5 || pop >= 66) {
      return { text: "뇌우/비", icon: "⛈️" };
    }
    if (pop >= 40 && pop <= 65) {
      return { text: "뇌우/비 가능성", icon: "cloud-doubt-thunder-rain" };
    }
    if (pop >= 20 && pop < 40) {
      return { text: "흐림(대기불안정)", icon: "☁️" };
    }
    return { text: "구름많음", icon: isDay ? "⛅" : "☁️" };
  }

  // 3. 안개 / 박무 (Fog: 45, 48)
  if (c === 45 || c === 48) {
    return { text: "안개/흐림", icon: "🌫️" };
  }

  // 4. 확실한 강수 확정 (POP >= 66% 또는 유의미한 강수량 rain >= 0.5mm)
  if (pop >= 66 || rain >= 0.5) {
    // 4-1. 소나기
    if (c === 80 || c === 81 || c === 82) {
      return { text: "소나기", icon: isDay ? "🌦️" : "🌧️" };
    }
    // 4-2. 이슬비 (0.1~0.4mm 또는 WMO 51~57)
    if ([51, 53, 55, 56, 57].includes(c) || (rain >= 0.1 && rain < 0.5)) {
      return { text: "이슬비", icon: "🌧️" };
    }
    // 4-3. 강한 비
    if (rain >= 3.0 || c === 65) {
      return { text: "강한 비", icon: "🌧️" };
    }
    // 4-4. 일반 비
    return { text: "비", icon: "🌧️" };
  }

  // 5. [비/이슬비 가능성 구간]: 강수확률 40% ~ 65% (단정하지 않고 가능성 표기)
  if (pop >= 40 && pop <= 65) {
    // 0.1mm 이상 미세 강우 또는 이슬비 코드인 경우 "이슬비가능성"
    if ([51, 53, 55, 56, 57].includes(c) || (rain >= 0.1 && rain < 0.3)) {
      return { text: "이슬비가능성", icon: "cloud-doubt-rain" };
    }
    // 일반 비 또는 소나기 모의 시 "비가능성"
    return { text: "비가능성", icon: "cloud-doubt-rain" };
  }

  // 6. [20% ~ 39% 구간] 흐림 (비로 단정하지 않음)
  if (pop >= 20 || c === 3) {
    return { text: "흐림", icon: "☁️" };
  }

  // 7. 순수 운량에 따른 맑음 / 구름많음 / 흐림 (POP < 20%)
  if (c === 0) {
    return { text: "맑음", icon: isDay ? "☀️" : "🌕" };
  }
  if (c === 1 || c === 2) {
    return { text: "구름많음", icon: isDay ? "⛅" : "☁️" };
  }

  // 기본 fallback
  return { text: "구름많음", icon: isDay ? "⛅" : "☁️" };
}

/**
 * [실시간 실황 전용] 현재 시점 날씨 상태 판별 알고리즘 (Hero 카드 및 현재 시점 슬롯 전용)
 * - 지상 실측 강우(rain > 0) 및 복합 강수 지수(CPI)를 최우선 판별
 */
export function determineCurrentSkyState(params: {
  wmoCode: number;
  isDay: number;
  ensRain: number;
  ensPop: number;
  cpi?: number;
}): { text: string; icon: string } {
  const c = toSafeNum(params.wmoCode, 1);
  const rain = params.ensRain || 0;
  const pop = params.ensPop || 0;
  const isDay = params.isDay;
  const cpi = params.cpi ?? 0;

  // 0. [복합 강수 판정 지수 (CPI) 또는 실측 강우 확정]
  if (cpi >= 0.45 || rain >= 0.1) {
    if (rain >= 3.0 || c === 65) {
      return { text: "강한 비", icon: "🌧️" };
    }
    const isShower = c === 80 || c === 81 || c === 82;
    if (isShower) {
      return { text: "소나기", icon: isDay ? "🌦️" : "🌧️" };
    }
    const isDrizzle = [51, 53, 55, 56, 57].includes(c) || (rain >= 0.1 && rain < 0.5);
    if (isDrizzle) {
      return { text: "이슬비", icon: "🌧️" };
    }
    return { text: "비", icon: "🌧️" };
  }

  // 1. 눈(Snow) 계열
  if ([71, 73, 75, 77, 85, 86].includes(c)) {
    return { text: "눈", icon: "❄️" };
  }

  // 2. 안개 / 박무
  if (c === 45 || c === 48) {
    return { text: "안개/흐림", icon: "🌫️" };
  }

  // 3. 뇌우 계열 WMO 코드 (95, 96, 99)
  if ([95, 96, 99].includes(c)) {
    return { text: "뇌우/비", icon: "⛈️" };
  }

  // 4. 소나기 계열 WMO 코드
  if (c === 80 || c === 81 || c === 82) {
    if (pop >= 66 || rain >= 0.5) {
      return { text: "소나기", icon: isDay ? "🌦️" : "🌧️" };
    }
    return { text: "소나기", icon: isDay ? "🌦️" : "🌧️" };
  }

  // 5. 66% 이상 강수 확정
  if (pop >= 66) {
    if ([51, 53, 55, 56, 57].includes(c) || rain < 0.5) {
      return { text: "이슬비", icon: "🌧️" };
    }
    return { text: "비", icon: "🌧️" };
  }

  // 6. 비/이슬비 가능성 (강수확률 40% ~ 65%)
  if (pop >= 40 && pop <= 65) {
    if ([51, 53, 55, 56, 57].includes(c)) {
      return { text: "이슬비가능성", icon: "cloud-doubt-rain" };
    }
    return { text: "비가능성", icon: "cloud-doubt-rain" };
  }

  // 7. 흐림 (POP 20% ~ 39% 또는 WMO 흐림 코드)
  if (pop >= 20 || c === 3) {
    return { text: "흐림", icon: "☁️" };
  }

  // 8. 순수 운량에 따른 맑음 / 구름많음 / 흐림
  if (c === 0) {
    return { text: "맑음", icon: isDay ? "☀️" : "🌕" };
  }
  if (c === 1 || c === 2) {
    return { text: "구름많음", icon: isDay ? "⛅" : "☁️" };
  }
  if (c === 3) {
    return { text: "흐림", icon: "☁️" };
  }

  return { text: "구름많음", icon: isDay ? "⛅" : "☁️" };
}

// 하위 호환성을 위한 래퍼 (기본은 예보 판별기 호출)
export function determinePreciseSkyState(params: {
  wmoCode: number;
  isDay: number;
  ensRain: number;
  ensPop: number;
  humidity?: number;
}): { text: string; icon: string } {
  return determineForecastSkyState(params);
}

// 기상 상태 파싱: 4대 변수 간소화 (기존 호환 래퍼)
export function parseWmoCode(code: any, isDay: number = 1, rainAmount?: number, pop?: number): { text: string; icon: string } {
  const rainVal = rainAmount ?? 0;
  const popVal = pop ?? (rainVal >= 0.5 ? 70 : rainVal > 0 ? 40 : 10);
  return determinePreciseSkyState({
    wmoCode: toSafeNum(code, 1),
    isDay: isDay,
    ensRain: rainVal,
    ensPop: popVal
  });
}

export function parseWindDirection(deg: any): string {
  if (deg === null || deg === undefined || isNaN(Number(deg))) return "남";
  const num = Number(deg);
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  const idx = Math.round(num / 45) % 8;
  return dirs[idx < 0 ? idx + 8 : idx] || "남";
}

// KST 기준 오늘 날짜 문자열 반환 (YYYY-MM-DD)
export function getKstTodayDateStr(refDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(refDate); // "YYYY-MM-DD"
}

// KST 기준 날짜 및 요일 파싱 도우미 (타임존 및 과거일수 오차 완전 방지)
export function parseKstDateInfo(dateInput: string | Date): { dayName: string; dateStr: string; diffDays: number } {
  try {
    let dateStrInput = '';
    if (typeof dateInput === 'string') {
      dateStrInput = dateInput.substring(0, 10);
    } else {
      dateStrInput = getKstTodayDateStr(dateInput);
    }

    const targetDate = new Date(`${dateStrInput}T12:00:00+09:00`);
    const todayStr = getKstTodayDateStr(new Date());
    const todayDate = new Date(`${todayStr}T12:00:00+09:00`);

    const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000));

    const month = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(targetDate);
    const day = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', day: 'numeric' }).format(targetDate);
    const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(targetDate);
    const dateStr = `${month.replace(/[^0-9]/g, '')}/${day.replace(/[^0-9]/g, '')}`;

    let dayName = `${weekday}요일`;
    if (diffDays === 0) {
      dayName = `오늘 (${weekday})`;
    } else if (diffDays === 1) {
      dayName = `내일 (${weekday})`;
    } else if (diffDays < 0) {
      dayName = `어제 (${weekday})`;
    }

    return { dayName, dateStr, diffDays };
  } catch {
    const fallbackDate = new Date();
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][fallbackDate.getDay()] || "월";
    return {
      dayName: `오늘 (${weekday})`,
      dateStr: `${fallbackDate.getMonth() + 1}/${fallbackDate.getDate()}`,
      diffDays: 0
    };
  }
}

// KST 기준 날짜 및 시간 파싱 도우미 (타임존 오차 방지)
export function parseKstDateTimeParts(refDate: Date = new Date()): {
  year: string;
  month: string;
  day: string;
  hour: string;
  dateStr: string;
  isoPrefix: string;
  hourNum: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(refDate);
  const partMap: Record<string, string> = {};
  parts.forEach(p => { partMap[p.type] = p.value; });

  const year = partMap.year;
  const month = partMap.month;
  const day = partMap.day;
  const hour = partMap.hour;
  const hourNum = parseInt(hour, 10);
  const dateStr = `${parseInt(month, 10)}/${parseInt(day, 10)}`;
  const isoPrefix = `${year}-${month}-${day}T${hour}`;

  return { year, month, day, hour, dateStr, isoPrefix, hourNum };
}

export function getDayOfWeek(d: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[d.getDay()];
}
