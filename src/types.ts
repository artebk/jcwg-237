export type DataStatus = 'DIRECT_LIVE' | 'GAS_ENSEMBLE' | 'PREVIOUS_RUN' | 'FALLBACK';

export interface LocationItem {
  id: string;
  name: string;
  fullName: string;
  lat: number;
  lon: number;
  isDefault?: boolean;
}

export interface HourlyForecast {
  dateLabel: string;
  hour: string;
  fullHour: number;
  conditionText: string;
  conditionIcon: string;
  temp: number;
  pop: string;
  popNum: number;
  rain: string;
  rainNum: number;
  windSpeed: string;
  windNum: number;
  windDir: string;
  ecmwfTemp?: number;
  kmaTemp?: number;
  gfsTemp?: number;
  iconTemp?: number;
  isPast?: boolean;
  isCurrent?: boolean;
  segmentType?: 'past' | 'current' | 'forecast12' | 'forecast24' | 'forecast36' | 'forecast48' | 'extended72';
  stepHours?: number;
  relativeHourOffset?: number;
  rawTime?: string;
}

export interface CurrentWeather {
  location: string;
  temp: number;
  ecmwfTemp: number;
  kmaTemp: number;
  gfsTemp?: number;
  iconTemp?: number;
  pop?: number;
  rain?: number;
  accumRainSoFar: number;
  forecastDailyRain: number;
  conditionText: string;
  conditionIcon: string;
  windSpeed: number;
  windDirection: string;
  isDay: number;
  humidity?: number;
  dewPoint?: number;
  feelsLike?: number;
  roadMoistureIndex?: number;
  roadCondition?: 'DRY' | 'DAMP' | 'WET';
  roadConditionText?: string;
  cpi?: number;
  updatedAt: string;
  dataStatus?: DataStatus;
}

export interface DailyForecast {
  dayName: string;
  dateStr: string;
  conditionText: string;
  conditionIcon: string;
  minTemp: number;
  maxTemp: number;
  pop: number;
  rain: number;
}

export interface NationalCity {
  id: string;
  name: string;
  temp: number;
  condition: string;
  conditionIcon?: string;
  pop: number;
  rain: number;
  lat: number;
  lon: number;
}

export interface AirQualityData {
  pm10: number;
  pm10Status: "좋음" | "보통" | "나쁨" | "매우나쁨";
  pm25: number;
  pm25Status: "좋음" | "보통" | "나쁨" | "매우나쁨";
  o3: number;
  o3Status: "좋음" | "보통" | "나쁨";
  no2: number;
  aqiScore: number;
  overallStatus: "좋음" | "보통" | "나쁨" | "매우나쁨";
}

// 구글 스프레드시트 Raw_Logs DB 14개 표준 필드 규격
export interface RawLogEntry {
  timestamp: string;          // 1. 수집시각(KST)
  location: string;           // 2. 위치
  temp: number;               // 3. 앙상블기온(°C)
  ecmwfTemp: number;          // 4. ECMWF(°C)
  kmaTemp: number;            // 5. KMA(°C)
  gfsTemp: number;            // 6. GFS(°C)
  iconTemp: number;           // 7. ICON(°C)
  pop: number;                // 8. 강수확률(POP %)
  accumRain: number;          // 9. 실측누적강수량(mm)
  forecastDailyRain: number;  // 10. 오늘24h총예보(mm)
  condition: string;          // 11. 기상상태
  windSpeed: number;          // 12. 풍속(m/s)
  windDir: string;            // 13. 풍향
  status: DataStatus;         // 14. 데이터상태
}

// 구글 스프레드시트 Control_Board 관리 파라미터 규격
export interface ControlBoardConfig {
  stationName: string;
  stationLat: number;
  stationLon: number;
  ecmwfWeight: number;
  kmaWeight: number;
  iconWeight: number;
  gfsWeight: number;
  radarNowcastWeight0h: number;
  radarNoEchoCap: number;
  cronIntervalHours: number;
  autoSyncEnabled: boolean;
}

export type ActiveTab = "hourly" | "weekly" | "radar" | "national" | "airQuality";
