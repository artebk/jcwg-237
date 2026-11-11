import { HourlyForecast, DailyForecast } from '../types';

/**
 * 기상청 보퍼트(Beaufort) 풍속 계급에 따른 한국어 풍속 등급 및 체감 설명
 */
export function getWindSpeedScaleDescription(speed: number): { label: string; tip: string } {
  if (speed < 0.3) {
    return { label: '고요', tip: '연기가 수직으로 올라가는 고요한 상태입니다.' };
  } else if (speed < 1.6) {
    return { label: '실바람', tip: '바람 방향이 눈에 띄며 나뭇잎이 살짝 흔들립니다.' };
  } else if (speed < 3.4) {
    return { label: '남실바람', tip: '얼굴에 바람이 느껴지며 쾌적한 산책에 좋습니다.' };
  } else if (speed < 5.5) {
    return { label: '산들바람', tip: '나뭇잎과 작은 가지가 쉴 새 없이 흔들립니다.' };
  } else if (speed < 8.0) {
    return { label: '건들바람', tip: '작은 나무가 흔들리고 먼지가 일 수 있습니다.' };
  } else if (speed < 10.8) {
    return { label: '흔들바람', tip: '큰 나뭇가지가 흔들리며 우산 쓰기 어렵습니다.' };
  } else {
    return { label: '강풍 주의', tip: '나무 전체가 흔들리며 강풍에 각별한 주의가 필요합니다.' };
  }
}

export interface DailySummary {
  title: string;
  tempSummary: string;
  maxTemp: number;
  minTemp: number;
  tempDiff: number;
  rainSummary: string;
  rainHighlightTime?: string;
  maxPop: number;
  maxRain: number;
  windSummary: string;
  avgWind: number;
  maxWind: number;
  windScaleLabel: string;
  lifeGuide: string;
  umbrellaNeeded: boolean;
  isDrivingRain: boolean;
}

export interface WeeklySummary {
  title: string;
  headline: string;
  tempTrend: string;
  rainSchedule: string;
  weekendForecast: string;
  clothingTip: string;
  highestDay: string;
  lowestDay: string;
}

/**
 * 시간별 예보(48시간/오늘) 데이터를 분석하여 '오늘의 날씨 핵심 브리핑'을 자동 생성
 * - 비 올 때와 비 안 올 때의 바람 분리 판정 (비 올 때 풍속 2.0m/s 이상 시 비바람/들이침 주의)
 * - 강수량 시간당 2.0mm 이상 시 굵은 빗줄기 및 우산 챙김 가이드
 */
export function generateDailyWeatherSummary(hourly: HourlyForecast[]): DailySummary {
  if (!hourly || hourly.length === 0) {
    return {
      title: '오늘의 초전동 날씨 핵심 브리핑',
      tempSummary: '기상 데이터를 수신 중입니다.',
      maxTemp: 20,
      minTemp: 15,
      tempDiff: 5,
      rainSummary: '강수 데이터 집계 중',
      maxPop: 0,
      maxRain: 0,
      windSummary: '바람 데이터 집계 중',
      avgWind: 1.5,
      maxWind: 2.0,
      windScaleLabel: '남실바람',
      lifeGuide: '실시간 예보를 확인해 주세요.',
      umbrellaNeeded: false,
      isDrivingRain: false
    };
  }

  // 오늘 데이터만 필터링 (isCurrent 포함 향후 24시간 또는 오늘 라벨 슬롯)
  const todaySlots = hourly.filter((h) => !h.isPast && (h.dateLabel.includes('오늘') || h.isCurrent)).slice(0, 24);
  const targetSlots = todaySlots.length >= 4 ? todaySlots : hourly.slice(0, 24);

  const temps = targetSlots.map((h) => h.temp);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);
  const tempDiff = Math.max(0, maxTemp - minTemp);

  // 강수 분석
  let maxPop = 0;
  let maxPopSlot: HourlyForecast | null = null;
  let totalRain = 0;
  let maxHourlyRain = 0;

  targetSlots.forEach((slot) => {
    if (slot.popNum > maxPop) {
      maxPop = slot.popNum;
      maxPopSlot = slot;
    }
    if (slot.rainNum > maxHourlyRain) {
      maxHourlyRain = slot.rainNum;
    }
    totalRain += slot.rainNum;
  });

  // 전반 바람 분석
  const winds = targetSlots.map((h) => h.windNum);
  const avgWind = Number((winds.reduce((acc, v) => acc + v, 0) / (winds.length || 1)).toFixed(1));
  const maxWind = Number(Math.max(...winds).toFixed(1));
  const windScale = getWindSpeedScaleDescription(avgWind);

  // 비 오는 시간대의 바람 분석 (비가 올 때와 안 올 때 바람 완전 분리)
  const rainSlots = targetSlots.filter((h) => h.popNum >= 40 || h.rainNum >= 0.1);
  const hasRainPeriod = rainSlots.length > 0;
  const rainWind = hasRainPeriod
    ? Number((rainSlots.reduce((acc, h) => acc + h.windNum, 0) / rainSlots.length).toFixed(1))
    : (maxPopSlot ? maxPopSlot.windNum : avgWind);
  const maxRainWind = hasRainPeriod
    ? Number(Math.max(...rainSlots.map((h) => h.windNum)).toFixed(1))
    : maxWind;

  // 기온 요약 문구
  let tempSummary = `오늘 최고 ${maxTemp}°C / 최저 ${minTemp}°C로 일교차가 ${tempDiff}°C입니다.`;
  if (tempDiff >= 10) {
    tempSummary += ' 환절기 큰 일교차에 주의하세요.';
  } else {
    tempSummary += ' 대체로 온화한 기온이 이어집니다.';
  }

  // 강수 요약 문구
  let rainSummary = '';
  let rainHighlightTime = '';
  let umbrellaNeeded = false;

  if (maxHourlyRain >= 2.0) {
    umbrellaNeeded = true;
    rainHighlightTime = maxPopSlot ? `${maxPopSlot.hour}시경` : '오후';
    rainSummary = `${rainHighlightTime} 강수확률 ${maxPop}%로 시간당 ${maxHourlyRain.toFixed(1)}mm의 다소 강한 비가 예상됩니다.`;
  } else if (maxPop >= 66 || maxHourlyRain >= 0.5) {
    umbrellaNeeded = true;
    rainHighlightTime = maxPopSlot ? `${maxPopSlot.hour}시경` : '오후';
    rainSummary = `${rainHighlightTime} 강수확률 ${maxPop}%로 비(${maxHourlyRain.toFixed(1)}mm/h)가 내릴 것으로 예상됩니다.`;
  } else if (maxPop >= 40 || maxHourlyRain >= 0.1) {
    umbrellaNeeded = true;
    rainHighlightTime = maxPopSlot ? `${maxPopSlot.hour}시경` : '오후';
    rainSummary = `${rainHighlightTime} 강수확률 ${maxPop}%로 한때 이슬비(${maxHourlyRain.toFixed(1)}mm/h) 가능성이 있습니다.`;
  } else if (maxPop >= 20) {
    rainSummary = `강수확률 최고 ${maxPop}%로 종일 흐리겠으나 뚜렷한 비 소식은 없습니다.`;
  } else {
    rainSummary = `강수확률이 ${maxPop}%로 낮아 종일 맑고 쾌청하겠습니다.`;
  }

  // 바람 요약 문구: 비 올 때와 안 올 때 완전 분리 (풍속 2.0m/s 임계치 적용)
  let windSummary = '';
  const isDrivingRain = umbrellaNeeded && (rainWind >= 2.0 || maxRainWind >= 2.0);

  if (umbrellaNeeded) {
    // 1. 비가 올 때의 바람 판정
    if (isDrivingRain) {
      windSummary = `비와 함께 바람(풍속 ${rainWind.toFixed(1)}m/s, 최대 ${maxRainWind.toFixed(1)}m/s)이 불어 빗줄기가 들이치니 비바람에 주의하세요.`;
    } else {
      windSummary = `비가 내리는 동안 풍속 ${rainWind.toFixed(1)}m/s로 바람이 잔잔하여 비가 차분히 내립니다.`;
    }
  } else {
    // 2. 비가 안 올 때의 바람 판정
    if (avgWind >= 5.0 || maxWind >= 7.0) {
      windSummary = `평균 풍속 ${avgWind}m/s (순간최대 ${maxWind}m/s)로 바람이 다소 강하니 시설물 관리에 유의하세요.`;
    } else {
      windSummary = `평균 풍속 ${avgWind}m/s (${windScale.label})로 바람이 잔잔하여 야외활동하기 쾌적합니다.`;
    }
  }

  // 생활 가이드 팁: 사용자 요청 반영 (우산 챙기세요 + 강수량/확률/비바람 정보로 사용자가 판단 가능)
  let lifeGuide = '';
  if (umbrellaNeeded) {
    if (isDrivingRain) {
      if (maxHourlyRain >= 2.0) {
        lifeGuide = `외출 시 우산 챙기세요. 시간당 ${maxHourlyRain.toFixed(1)}mm 비와 바람(풍속 ${rainWind.toFixed(1)}m/s)으로 빗줄기가 들이쳐 옷이 젖기 쉽습니다.`;
      } else {
        lifeGuide = `외출 시 우산 챙기세요. 비와 함께 바람(풍속 ${rainWind.toFixed(1)}m/s)이 들이치니 주의하세요.`;
      }
    } else {
      if (maxHourlyRain >= 2.0) {
        lifeGuide = `외출 시 우산 챙기세요. (시간당 최대 ${maxHourlyRain.toFixed(1)}mm 다소 강한 비 예상)`;
      } else {
        lifeGuide = `외출 시 우산 챙기세요. (강수확률 ${maxPop}%, 시간당 ${maxHourlyRain.toFixed(1)}mm)`;
      }
    }
  } else if (tempDiff >= 10) {
    lifeGuide = '종일 비 소식은 없으나 아침·저녁 일교차가 크니 걸칠 수 있는 외투를 챙기세요.';
  } else if (avgWind >= 5.0) {
    lifeGuide = '비는 없으나 바람이 다소 강하니 시설물 관리와 낙하물에 유의하세요.';
  } else {
    lifeGuide = '비 소식 없이 쾌청하며 세탁물 건조 및 야외 산책, 환기하기에 아주 좋은 날씨입니다.';
  }

  return {
    title: '오늘의 초전동 날씨 핵심 브리핑',
    tempSummary,
    maxTemp,
    minTemp,
    tempDiff,
    rainSummary,
    rainHighlightTime,
    maxPop,
    maxRain: totalRain,
    windSummary,
    avgWind,
    maxWind,
    windScaleLabel: windScale.label,
    lifeGuide,
    umbrellaNeeded,
    isDrivingRain
  };
}

/**
 * 7일간 주간 예보 데이터를 분석하여 '주간 종합 기상 전망 브리핑'을 자동 생성
 */
export function generateWeeklyWeatherSummary(daily: DailyForecast[]): WeeklySummary {
  if (!daily || daily.length === 0) {
    return {
      title: '이번 주(7일간) 초전동 기상 전망',
      headline: '주간 기상 데이터를 종합 분석 중입니다.',
      tempTrend: '평년 기온을 유지할 것으로 전망됩니다.',
      rainSchedule: '비 소식 없음',
      weekendForecast: '주말 맑음 예상',
      clothingTip: '환절기 옷차림 권장',
      highestDay: '수요일',
      lowestDay: '금요일'
    };
  }

  const maxTemps = daily.map((d) => d.maxTemp);
  const minTemps = daily.map((d) => d.minTemp);
  const highestTemp = Math.max(...maxTemps);
  const lowestTemp = Math.min(...minTemps);

  const highestDayObj = daily.find((d) => d.maxTemp === highestTemp) || daily[0];
  const lowestDayObj = daily.find((d) => d.minTemp === lowestTemp) || daily[0];

  // 비 소식이 있는 날짜들 추출
  const rainDays = daily.filter((d) => d.pop >= 40 || d.rain >= 0.5);
  let rainSchedule = '향후 7일간 큰 비 소식 없이 대체로 맑거나 구름 끼는 날이 많겠습니다.';
  if (rainDays.length > 0) {
    const rainDetails = rainDays.map((d) => {
      const rainAmtStr = d.rain >= 2.0 ? `, 예상 ${d.rain.toFixed(1)}mm` : '';
      return `${d.dayName}(강수확률 ${d.pop}%${rainAmtStr})`;
    }).join(', ');
    rainSchedule = `${rainDetails}에 비 소식이 있으니 외출 시 우산 챙기세요.`;
  }

  // 주말(토, 일) 날씨 분석
  const weekendDays = daily.filter((d) => d.dayName.includes('토') || d.dayName.includes('일'));
  let weekendForecast = '주말 예보를 집계 중입니다.';
  if (weekendDays.length > 0) {
    const weekendRain = weekendDays.some((d) => d.pop >= 40);
    if (weekendRain) {
      weekendForecast = '주말 중 한때 비가 내릴 가능성이 있어 외출 시 우산 챙기세요.';
    } else {
      const avgWeekendMax = Math.round(weekendDays.reduce((acc, d) => acc + d.maxTemp, 0) / weekendDays.length);
      weekendForecast = `주말 동안 맑고 낮 기온 약 ${avgWeekendMax}°C로 야외 나들이에 적합하겠습니다.`;
    }
  }

  const headline = rainDays.length > 0
    ? `주중 ${rainDays[0].dayName} 비 소식이 있으며, 주간 낮 최고기온은 ${highestTemp}°C 수준입니다.`
    : `이번 주는 전반적으로 비 소식 없이 쾌청하며, 최고 ${highestTemp}°C / 최저 ${lowestTemp}°C 분포를 보입니다.`;

  const tempTrend = `주간 평균 기온은 낮 ${Math.round(maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length)}°C, 아침 ${Math.round(minTemps.reduce((a, b) => a + b, 0) / minTemps.length)}°C입니다.`;
  const clothingTip = highestTemp - lowestTemp >= 10
    ? '아침저녁과 한낮의 기온 차가 10°C 이상 크므로 얇은 옷을 겹쳐 입는 것을 추천합니다.'
    : '활동하기 무난한 계절 옷차림이 적합합니다.';

  return {
    title: '이번 주(7일간) 초전동 기상 전망',
    headline,
    tempTrend,
    rainSchedule,
    weekendForecast,
    clothingTip,
    highestDay: `${highestDayObj.dayName} (${highestTemp}°C)`,
    lowestDay: `${lowestDayObj.dayName} (${lowestTemp}°C)`
  };
}
