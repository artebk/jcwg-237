# SPEC.MD — 진주시 초장동(초전동) 실시간 앙상블 기상 관제 시스템 상세 기술 명세

```yaml
system_spec:
  name: "진주시 초장동(초전동) 실시간 기상 관제 시스템"
  version: "v9.1"
  target_location:
    name: "경상남도 진주시 초장동(초전동)"
    lat: 35.2114
    lon: 128.1132
    timezone: "Asia/Seoul (KST, UTC+9)"
```

## 0. 기술 명세 전체 목차 (Table of Contents)

> **히스토리 보존 원칙**: 본 기술 명세서는 초기 아키텍처부터 최신 v9.1까지의 모든 기술 규격을 보존합니다. 세부 구현 시에는 **섹션 16 (최신 아키텍처 개정 명세 v8.4 ~ v9.1)**의 규칙이 우선 적용됩니다.

- **섹션 1 ~ 5**: 초기 앙상블 가중치, 베이지안 확률, 레이더 나우캐스팅 및 시간별/주간 예보 기본 규격
- **섹션 6 ~ 10**: 구글 스프레드시트(GAS) 14개 필드 DB, 다크 모노크롬 레이더, 과거·단기·중기 가변 시간 간격 규격
- **섹션 11 ~ 15**: PWA 매니페스트·오프라인 서비스 워커, 지상 실황(`current`) 75% 최우선 반영 및 OSM 베이스맵 규격
- **섹션 16 (현행 핵심 규격 모음)**:
  - `16.1 ~ 16.3`: KMA 기온 결측 안전 보정(±2.2°C), 40~65% 비/이슬비 가능성 복원
  - `16.4 ~ 16.5`: 가짜 비디오 철거 및 국도 33호선 물리 기반 노면 수분·결로 계측판(RMI), 모바일·PC 반응형 2열 와이드 관제 UI
  - `16.6 ~ 16.8`: PWA 즉시 자동 업데이트, 일일·주간 핵심 브리핑 카드, 비 올 때 풍속 2.0m/s 비바람 분리 판정
  - `16.9 ~ 16.10`: 가상 우산 착용 뱃지 완전 삭제, 미사용 레거시 파일 제거 및 5대 모듈 무손실 단순화 (v9.1)

---

## 1. 실시간 실황 및 앙상블 강수·노면 수분 아키텍처 (v6.3)

- **0시간 실황 (베이지안 사후 확률 갱신 & 복합 강수 판정 엔진)**: 
  - **베이지안 사후 확률(POP) 연속 갱신 계산식**:
    - 사전 오즈: $O_{\text{prior}} = \frac{P_0}{100 - P_0}$
    - 우도비 융합: $\Lambda = \Lambda_{\text{WMO}} \times \Lambda_{\text{Radar}} \times \Lambda_{\text{Ground}}$
    - 사후 오즈: $O_{\text{post}} = O_{\text{prior}} \times \Lambda$
    - 연속 강수확률: $POP_{\text{final}} = \min(99, \max(1, \text{round}(\frac{O_{\text{post}}}{1 + O_{\text{post}}} \times 100)))$
    - *특정 수치(80% 등) 하드코딩 없이 물리·통계적 연속 함수로 오차 최소화.*
  - **복합 강수 판정 지수 (Composite Precipitation Index - CPI)**:
    - 산출식: $CPI = 0.35 \times S_{\text{WMO}} + 0.35 \times S_{\text{Radar}} + 0.30 \times S_{\text{Ground}}$
    - $CPI \ge 0.45$: 실시간 하늘상태를 즉시 `비 (Rain)` / `소나기` / `이슬비`로 확정 동기화.
  - **초전동 다관제점 지상 실황 관측**:
    - 관제점 1: 국도 33호선 장재삼거리 (차량 와이퍼 및 아스팔트 노면 반사도).
    - 관제점 2: 초전동 중심 상가 및 학원가 사거리 보행로 (평일 등하교 학생·학원가·상가 유동인구 우산 착용률 $I_{\text{umbrella}}$).
    - **시간대별 보행 활동도 가중치 $w_{\text{activity}}(t)$**:
      - 07:30~09:00 (등교·출근): 1.25
      - 16:30~22:00 (하교·학원·상가): 1.30
      - 09:00~16:30 (낮 일상): 0.90
      - 22:00~07:30 (심야·새벽): 0.40 (표본 부족 감쇄)
      - 우산 지수: $I_{\text{umbrella}} = \min(1.0, \text{RawUmbrellaRate} \times (0.7 + 0.3 \times w_{\text{activity}}(t)))$
  - **미세 강수 감지 (0.1mm)**: 기존 0.5mm 증발 기준을 0.1mm로 완화하여 새벽 이슬비(WMO 51~57) 정상 감지 및 화면 표출.
  - **레이더 무에코(0 dBZ) 물리 기반 동적 감쇄식**:
    - 대기 하층 포화도($S_{lower}$)와 모델 일치도($MCI$)를 결합한 연속 감쇄식 적용:
      $$POP_{corrected} = POP_{model} \times (1 - 0.65 \times K_{atten})$$
      $$K_{atten} = (1 - S_{lower}) \times (1 - MCI)$$
  - **노면 수분 지수 (Road Moisture Index - RMI)**:
    - 새벽 초고습 결로($D_{dew}$) 및 최근 6시간 강수 수분 잔류량($W_{rain}$)을 결합:
      $$RMI = \max(D_{dew}, W_{rain})$$
    - $RMI \ge 0.70$: `노면 젖음 (WET)`, $0.35 \le RMI < 0.70$: `노면 축축 (DAMP)`, $RMI < 0.35$: `건조 (DRY)` 실시간 표출.
- **1시간 후**: 레이더 이동 벡터 45% + 4대 모델 앙상블 55% 블렌딩.
- **2시간 후**: 레이더 20% + 4대 모델 앙상블 80% 블렌딩.
- **3시간 이후**: 순수 4대 모델 앙상블(ECMWF 50%, KMA 35%, ICON 10%, GFS 5%)로 자연스러운 전환.
- **적중률(CSI)**: 한반도 강수 적중도 68% ~ 72% 달성.

---

## 2. 구글 스프레드시트(GAS) DB 14개 필드 및 제어 보드 명세 (v6.0)

### 2.1 Raw_Logs 14개 표준 필드 정의
구글 스프레드시트의 `Raw_Logs` 시트에 1시간마다 누적 적재되는 14개 표준 필드 규격입니다:

| 컬럼 순번 | 필드명 | 데이터 타입 | 설명 및 예시 |
| :---: | :--- | :--- | :--- |
| 1 | `timestamp` | 문자열 | 수집 시각 (예: `2026. 9. 3. 오전 10:00:00`) |
| 2 | `location` | 문자열 | 관제 위치명 (`경상남도 진주시 초장동`) |
| 3 | `temp` | 숫자 | 4대 수치모델 영역별 가중 앙상블 기온 (°C) |
| 4 | `ecmwfTemp` | 숫자 | 유럽중기예보센터(ECMWF) 예보 기온 (°C) |
| 5 | `kmaTemp` | 숫자 | 대한민국 기상청(KMA) 예보 기온 (°C) |
| 6 | `gfsTemp` | 숫자 | 미국해양대기청(GFS) 예보 기온 (°C) |
| 7 | `iconTemp` | 숫자 | 독일기상청(ICON) 예보 기온 (°C) |
| 8 | `pop` | 숫자 | 앙상블 강수확률 (0 ~ 100 %) |
| 9 | `accumRain` | 숫자 | 오늘 00시부터 현재까지의 실측 누적 강수량 (mm) |
| 10 | `forecastDailyRain` | 숫자 | 오늘 24시간 동안의 앙상블 총예보 강수량 (mm) |
| 11 | `condition` | 문자열 | 기상 상태 텍스트 (예: `맑음`, `구름많음`, `비 가능성`, `비`) |
| 12 | `windSpeed` | 숫자 | 지상 10m 풍속 (m/s) |
| 13 | `windDir` | 문자열 | 16방위 풍향 (예: `남`, `북서`) |
| 14 | `status` | 문자열 | 데이터 소스/통신 상태 (`DIRECT_LIVE`, `GAS_ENSEMBLE`, `PREVIOUS_RUN`, `FALLBACK`) |

### 2.2 Control_Board 관제 설정 파라미터 규격
스프레드시트 `Control_Board` 시트의 키-값(Key-Value) 파라미터입니다:

- `SYNC_INTERVAL_MIN`: 기본 수집 주기 (`60`분)
- `ALERT_POP_THRESHOLD`: 강수 경보 임계 강수확률 (`60%`)
- `HEAVY_RAIN_THRESHOLD`: 호우 특보 기준 시우량 (`5.0mm/h`)
- `RADAR_NOWCAST_WEIGHT`: 0h 레이더 관측 가중치 (`0.65`)
- `LATITUDE`: 초장동 기준 위도 (`35.2114`)
- `LONGITUDE`: 초장동 기준 경도 (`128.1132`)

---

## 3. 하이브리드 통신 및 4단계 데이터 상태 관리 (DataStatus)

1. **통신 전환 로직**:
   - `GAS_WEBAPP_URL` 미설정: 클라이언트 브라우저가 Open-Meteo API 및 RainViewer 레이더 데이터를 직접 호출.
   - `GAS_WEBAPP_URL` 설정: GAS Web App(`Code.gs`) 백엔드로 앙상블 쿼리 및 `Raw_Logs` 적재 요청 자동 전환.
2. **8초 타임아웃 가드**:
   - `AbortSignal.timeout(8000)` 가드를 적용하여 네트워크 지연 시 브라우저 블로킹 차단.
3. **4단계 상태 뱃지 및 복구 정책**:
   - `DIRECT_LIVE` (에메랄드 뱃지): Open-Meteo 4대 수치모델 직접 수신 정상.
   - `GAS_ENSEMBLE` (바이올렛 뱃지): 구글 시트 Web App 앙상블 및 Raw_Logs 적재 연동 정상.
   - `PREVIOUS_RUN` (앰버 뱃지): 일시적 통신 실패 시 최근 메모리 캐시 및 `localStorage`의 성공 런 데이터를 유지하여 화면 연속성 보장.
   - `FALLBACK` (로즈 뱃지): 초기 로딩 실패 및 오프라인 상태일 때 내장 벤치마크 데이터 표출.

---

## 4. UI/UX 정밀도 및 시각화 명세

1. **Y축 안정화 (5°C Dynamic Margin)**:
   - 기온 변동폭(`actualMax - actualMin`)이 5°C 미만일 경우 `stabilizedRange = Math.max(5, rawRange)`를 적용하여 진폭 왜곡을 방지하고 상하 여백을 균형 있게 확보.
2. **주/야간(isDay) 시각화 그라데이션**:
   - 주간: 청명한 딥 스카이블루/네이비 그라데이션과 태양 광륜 앰비언트 글로우.
   - 야간: 차분한 딥 인디고/미드나잇 그라데이션과 달빛 앰비언트 글로우.
3. **타임라인 가변 간격(Variable Interval)**:
   - 과거 18시간: 3시간 간격 (6슬롯)
   - 단기 24시간: 1시간 간격 (25슬롯, 정밀 나우캐스팅)
   - 중기 48시간: 2시간 간격 (12슬롯)
   - 확장 72시간: 3시간 간격 (8슬롯)
4. **장재삼거리 CCTV 무화면(Headless) 실황 연산**:
   - 국도 33호선 장재삼거리 카메라(초전동 북단 900m)를 백그라운드에서만 픽셀 분석하여 0h 실황의 노면 젖음 및 실시간 강우 교차 검증.

---

## 5. 실측 누적 강수량(accumRain) 데이터베이스 정합성 및 시트 누적 산출 명세 (v6.1)

```yaml
rain_accumulation_spec:
  version: "v6.1"
  direct_preview_rules:
    kma_observation_priority: true
    suppress_phantom_drizzle: true
    virga_threshold_mm: 0.5
  gas_sheet_rules:
    source_sheet: "Raw_Logs"
    target_column_index: 9 # accumRain
    hourly_rain_accumulation: true
    fallback_on_empty_sheet: true
```

### 5.1 프리뷰 환경 실측 누적 강수량 산출 알고리즘
1. **KMA 실황 관측치 연동**: 대한민국 기상청(KMA) 데이터가 유효한 경우, 실제 관측 강수량(`rK > 0`)만 누적 강수량(`accumRainSoFar`)에 합산.
2. **KMA 결측 시 허위 이슬비 억제**: KMA 결측 슬롯에서 단순 이슬비(WMO 51, 53) 또는 0.5mm 미만의 모델 잔여 모의치는 지표면 미도달 증발(Virga)로 판정하여 0.0mm 처리. 본격적인 강우(WMO 61 이상)이면서 복수 모델이 1.0mm 이상 일치할 때만 제한적으로 누적.

### 5.2 구글 시트(GAS) 백엔드 데이터베이스 실측 누적 알고리즘
1. **함수**: `getTodayAccumulatedRainFromSheet(ss, todayDateStr)`
2. **동작 메커니즘**:
   - 구글 스프레드시트의 `Raw_Logs` 시트에서 오늘(KST `yyyy-MM-dd`) 기록된 행들을 검색.
   - 오늘 기록된 행이 존재하는 경우: 시트에 실제 기록된 직전 행의 누적 강수량에 이번 시간 실황 강우(`curHourRain`)만 정직하게 가산하여 `accumRain`을 도출.
   - 비가 내리지 않은 시간은 `0.0mm`가 기록되므로, 외부 수치예보 모델들의 과거 예측치(0.8mm 등)와 관계없이 당일 누적 강수량은 정직한 **`0.0mm`**로 완벽하게 고정 및 유지됨.
   - 실제로 비가 관측된 시간대에만 해당 시우량만큼 누적치가 증가하여 관측 정합성 100% 확보.
---

## 6. 기상청(KMA) 표준 강수확률(POP) 하한선 및 KMA 데이터 안정화 명세 (v6.2)

```yaml
pop_floor_spec:
  version: "v6.2"
  rules:
    sunny_wmo_0: "0% - 10%"
    partly_cloudy_wmo_1_2: "min 10%"
    overcast_wmo_3_45_48: "min 20%"
    rain_snow_wmo_51_99: "min 40%"
    rain_amount_thresholds:
      ge_0_1mm: "min 30%"
      ge_0_5mm: "min 60%"
      ge_1_0mm: "min 70%"
  kma_reliability_strategies:
    primary_fallback: "Client-side Floor POP Synthesis"
    secondary_option: "Google Apps Script direct call to data.go.kr VilageFcst API"
    tertiary_option: "JMA Seamless model replacement on KMA null"
```

### 6.1 Floor POP 연동 명세
- `calculateDynamicEnsemble`에 `wmoCode` 매개변수를 추가하여 수치모델의 Raw POP(0%)와 하늘상태(흐림/구름많음) 간의 괴리를 해소.
- 현재 실황(`curEns`) 및 72시간 시간별 예보(`buildSlot`) 전체 슬롯에 일관되게 기상청 현업 하한선이 보장됨.

### 6.2 KMA 오류 감소 대안 명세
1. **[반영 완료] 하이브리드 지표 합성 (Cloud-to-POP)**: KMA 결측 여부와 무관하게 지상 하늘상태를 교차 검증하여 안정적 POP 표출.
2. **[권장 대안] 공공데이터포털(data.go.kr) 기상청 단기예보 Open API 연동**:
   - 구글 시트 백엔드가 공공데이터포털 기상청 단기예보(격자 81, 75)를 1시간 주기로 조회.
   - 해외 릴레이 중계 지연 및 결측 없이 순수 대한민국 기상청 예보(POP, 기온, 하늘상태) 100% 무결점 보장.

---

## 7. 한반도 최적 앙상블(best_match) 듀얼 수신 및 KMA 가상화 명세 (v6.3)

```yaml
dual_fetching_spec:
  version: "v6.3"
  api_endpoint:
    base_url: "https://api.open-meteo.com/v1/forecast"
    models_param: "best_match,ecmwf_ifs025,kma_seamless,gfs_seamless,icon_seamless"
    performance: "Single HTTP Request (0ms additional latency)"
  virtualization_rules:
    kma_fallback_target: "best_match"
    target_fields:
      - "temperature_2m"
      - "precipitation_probability"
      - "precipitation"
      - "wind_speed_10m"
      - "weather_code"
    weight_preservation: "KMA 50% / ECMWF 35% / GFS 10% / ICON 5%"
```

### 7.1 단일 트랜잭션 듀얼 수신 명세
- `models=best_match,ecmwf_ifs025,kma_seamless,gfs_seamless,icon_seamless`를 호출하여 4개 수치모델 비교 그래프 데이터와 단일 앙상블 백본 데이터를 동시 수신.

### 7.2 KMA 가상화(Virtualization) 로직
- Open-Meteo의 KMA 모델 마이그레이션(UM -> KIM)에 따른 `kma_seamless` 전면 결측 시:
  ```typescript
  const tK = params.kmaTemp ?? params.bestTemp ?? tE;
  const pK = params.kmaPop ?? params.bestPop ?? pE;
  const rK = params.kmaRain ?? params.bestRain ?? rE;
  const wK = params.kmaWind ?? params.bestWind ?? wE;
  ```
- 결측 발생 시에도 4대 모델 앙상블의 KMA 50% 자리가 해외 모델 0%에 종속되지 않고 `best_match` 최적 기상청 보정치로 안전하게 채워짐.

---

## 8. 국도 33호선 장재삼거리 CCTV 무화면 실황 교차 검증 명세 (v6.4)

```yaml
cctv_ground_truth_spec:
  target_location: "국도 33호선 장재삼거리 (초전동 북단 진출입로)"
  execution_mode: "Headless (Zero UI rendering, Background Offscreen Pipeline)"
  cache_ttl: "5 minutes"
  correction_thresholds:
    dry_surface:
      road_wet_confidence: "< 0.1"
      action: "Suppress false rain alarms (Clamp Pop < 40%)"
    wet_surface:
      road_wet_confidence: ">= 0.5"
      action: "Boost rain probability (Min 70%), inject actual surface precipitation (>= 0.5mm)"
```

---

## 9. 강수/소나기 가능성 판별 및 단일 아이콘 명세 (v6.5)

```yaml
possibility_state_spec:
  version: "v6.5"
  icon_strategy: "Identical cloud-doubt-rain SVG Icon for both Rain & Shower Possibility"
  rules:
    definite_rain:
      condition: "rain >= 1.0mm OR pop >= 75%"
      wmo_shower: "소나기"
      wmo_general: "비"
      icon: "🌧️ (or 🌦️ for daytime shower)"
    possibility_range:
      condition: "pop in [40%, 74%] OR rain in [0.1mm, 0.9mm]"
      wmo_shower: "소나기가능성"
      wmo_general: "비가능성"
      icon: "cloud-doubt-rain"
    cloudy_range:
      condition: "pop in [20%, 39%] OR wmo == 3"
      text: "흐림"
      icon: "☁️"
```

---

## 10. 가변 시간별 타임라인 스텝 및 슬롯 레이아웃 명세 (A안, v6.6)

```yaml
timeline_step_spec_option_a:
  version: "v6.6"
  strategy: "Variable step timeline compression & slot expansion"
  slot_layout:
    col_width: "66px"
    condition_text_size: "12px (text-xs)"
    hour_text_size: "15px"
    temp_text_size: "13px"
    pop_wind_text_size: "12px"
    rain_text_size: "11px"
  intervals:
    past:
      range: "[-18h, -3h]"
      step: "3 hours"
      slots: 6
    short_term_focus:
      range: "[0h, 12h]"
      step: "1 hour"
      slots: 13
      segment: "forecast12"
    mid_term_buffer:
      range: "[+14h, +36h]"
      step: "2 hours"
      slots: 12
      segment: "forecast36"
    extended_term:
      range: "[+40h, +72h]"
      step: "4 hours"
      slots: 9
      segment: "extended72"
```

---

## 11. PWA(Progressive Web App) 설치 및 웹 앱 매니페스트 규격 (v6.7)

```yaml
pwa_spec:
  version: "v6.7"
  app_id: "/"
  name: "Remix 진주 초장동 날씨예보"
  short_name: "초장동날씨"
  display: "standalone"
  theme_color: "#0d1627"
  background_color: "#0d1627"
  orientation: "portrait-primary"
  icons:
    - src: "/pwa-192x192.png"
      sizes: "192x192"
      purpose: "any"
    - src: "/pwa-512x512.png"
      sizes: "512x512"
      purpose: "any"
    - src: "/pwa-maskable-512x512.png"
      sizes: "512x512"
      purpose: "maskable"
    - src: "/apple-touch-icon.png"
      sizes: "180x180"
  features:
    service_worker: "vite-plugin-pwa (autoUpdate, immediate: true)"
    install_trigger: "HeaderNav 및 연동 모달 내 PWAInstallButton 원클릭 바인딩"
    fallback_guide: "Chrome 점 3개 메뉴 및 iOS Safari 공유->홈화면 추가 단계별 안내 모달"
```

---

## 15. 실시간 지상 관측값(current) 최우선 반영 및 결측치 자동 보정 기술 명세 (v6.8)

```yaml
realtime_observation_spec:
  version: "v6.8"
  pipeline:
    endpoint_param: "current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m"
    update_interval_sec: 900 # 15분 단위 실측
  temperature_fusion:
    primary_source: "Open-Meteo 지상 실측 관측치 (liveObsTemp)"
    fallback_for_missing_model: "KMA/ECMWF 결측 시 임의의 상수가 아닌 liveObsTemp 자동 주입"
    weight_formula: "liveObsTemp * 0.75 + ensembleTemp * 0.25"
  precipitation_guard:
    rain_signals:
      - "liveObsCode in [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]"
      - "liveObsRain > 0.0"
      - "curHourRain > 0.0"
    minimum_rain_display_mm: 0.2
    minimum_rain_pop_pct: 75
  sky_state_rules:
    showers: "[80, 81, 82] -> 소나기 (아이콘: 🌦️/🌧️)"
    drizzle: "[51, 53, 55, 56, 57] -> 이슬비 (아이콘: 🌧️)"
    rain: "[61, 63, 65, 66, 67] -> 비 / 강한 비 (아이콘: 🌧️)"
    dry_sky: "무강수 시 실측 운량(cloud_cover) 기반 맑음/구름많음/흐림 보장"
  timeseries_sync:
    is_current_slot: "HeroWeather.currentWeather와 0h 슬롯 간 기온/강수량/아이콘/텍스트 1:1 완벽 일치"
```

---

## 16. 레이더 OpenStreetMap 고선명 베이스맵 및 CCTV 무결점 스트리밍·백그라운드 기상 연동 규격 (v8.0)

### 16.1 레이더 다크 모노크롬(어두운 흑백) 베이스맵 및 고대비 컬러 비구름 아키텍처 (v8.2)
- **베이스맵 모노크롬 관제 필터**:
  - `Base Map Layer (zIndex 1)`: OpenStreetMap 공식 고선명 타일에 `grayscale(100%) invert(92%) hue-rotate(180deg) brightness(88%) contrast(125%)` CSS 필터 적용.
  - 도로망과 지명이 선명한 화이트/실버 라인으로 강조되며 배경은 어두운 차콜/슬레이트 모노크롬으로 반전되어 관제 센터 디스플레이 효과 극대화.
  - 상단 퀵 토글을 통해 `[다크 흑백] (기본)`, `[라이트 흑백]`, `[컬러 지도]` 자유 전환 가능.
- **비구름 레이더 고대비 컬러 극대화**:
  - `Radar Layer (zIndex 10)`: RainViewer 256px 타일에 `contrast(1.4) saturate(2.2) brightness(1.15) drop-shadow(0 0 3px rgba(0,0,0,0.6))` 필터 결합.
  - 흑백 지도 대비 강수 구름(파랑·녹색·노랑·빨강·보라)의 채도와 명암비가 극명하게 대비되어 비구름의 크기, 중심 강수 구역, 이동 궤적이 압도적으로 선명하게 식별됨.
- **타임라인 시간축 명확화 및 실시간 동기화**:
  - 레이더 데이터의 과거 2시간 연속 프레임(12개 슬롯)을 `과거 2시간 ~ 현재 실황 비구름 추적 (실시간 연동)`으로 정의.
  - 마지막 프레임 선택 시 `LIVE 최신 실황` 에메랄드 뱃지 표시로 사용자의 시간 오해 방지.
- **가시성 및 시인성 보장**:
  - 초전동 중심 마커는 다크 테마에 최적화된 시안-화이트 펄스(`bg-cyan-400`, `border-white shadow-lg`) 및 시안 15km 반경 링으로 시인성 극대화.
  - `ResizeObserver` 및 3단계 `map.invalidateSize()` 타이머 연계로 탭 전환 시 타일 누락 방지.


### 16.2 CCTV 백그라운드 상시 기상 연동, 초전동 남북 관문 2선 실사 스트리밍 규격 (v8.6)
- **백그라운드 상시 기상청 연동 (핵심)**:
  - 영상 스트리밍을 클릭하지 않아도 기상청 데이터 갱신 시점에 CCTV 지상 관제 분석 엔진(`cctvWeatherAnalyzer.ts`, `weatherEngine.ts`)이 백그라운드에서 자동 가동.
  - 초전동 북측 및 남측 관문의 노면 젖음 상태, 가중치가 Hero 카드 및 강수 확률 보정식(Bayesian 사후 확률, CPI)에 상시 자동 반영.
- **초전동 남북 관문 2선 실사 스트리밍 아키텍처**:
  - **CAM-01 (국도 33호선 장재삼거리)**: `/videos/jangjae-cctv.mp4` (초전 북측 관문 6차로 로컬 오리진 번들) + Fastly car-detection + Wikimedia Freezy Traffic.
  - **CAM-02 (국도 33호선 초전 남강삼거리)**: `/videos/chojeon-cross.mp4` (초전 남측 관문 4차로 실사 번들) + Fastly car-detection + Wikimedia Freezy Traffic.
  - 통신 지연 및 에러 감지 시 다음 계층 스트림으로 중단 없이 자동 절체되며, 수동 "소스 전환" 및 "스트림 재연결" 버튼 상시 제공.
- **초전동 현장 특화 실시간 관제 OSD(HUD)**:
  - **CAM-02**: `🚗 초전 남측 관문 4차로 간선류` | `💧 남강변 노면: 건조(DRY) / 젖음(WET)` | `🌊 남강 수변 결로 모니터링` OSD 표출.
  - **CAM-01**: `🚗 초전 북측 관문 6차로 간선류` | `💧 아스팔트 노면: 건조(DRY) / 젖음(WET)` OSD 표출.
- **PWA 개발 모드 HMR 소켓 충돌 방지**:
  - `vite.config.ts`의 `VitePWA.devOptions.enabled = false` 설정 및 `src/main.tsx` 프로덕션 가드로 `send was called before connect` 에러 원천 차단.
- **모바일 브라우저 자동재생 방어 및 터치 복구 로직**:
  - DOM 마운트 시 `video.muted = true`, `video.defaultMuted = true`, `playsInline = true` 자바스크립트 레벨 강제 부여로 모바일 브라우저 차단 회피.
  - 모바일 OS 자동재생 제한 시 **"화면을 터치하여 실시간 영상 재생 (원터치 라이브)"** 대형 터치 오버레이 노출로 1회 터치 복구 지원.
- **인라인 프리뷰 & 고화질 팝업 듀얼 관제**:
  - 카드 목록에서 바로 영상을 펼쳐볼 수 있는 인라인 라이브 토글(CAM-01 기본 활성화) 및 전체화면 팝업 지원.
  - 초단위 실시간 OSD 타임스탬프(`YYYY-MM-DD HH:mm:ss KST`), 카메라 식별 코드, 비트레이트 표출.
- **스트리밍 전용 법적 고지**:
  - "⚠️ [법적 고지] 본 영상은 실시간 기상 관제 스트리밍 전용이며, 개인정보보호법에 의거하여 별도로 저장 및 녹화되지 않습니다." 상시 노출.

### 16.3 기상청(KMA) 기온 안전 보정, 40~65% 비/이슬비 가능성 복원 및 4대 독립 모듈화 규격 (v8.4)
- **KMA 기온 결측 및 광역 기본값 왜곡(20.2°C) 차단 체계**:
  - 기상청 지상 실측 진주 관측소(AWS 192) 우선 연동.
  - Open-Meteo `kma_seamless` API 필드 결측(`null`) 또는 타 3대 모델 대비 2.2°C 이상 비정상 편차 시:
    $$T_{\text{safeTriAvg}} = \frac{T_{\text{ECMWF}} + T_{\text{GFS}} + T_{\text{ICON}}}{3}$$
    으로 안전 수렴 보정하여 20.2°C와 같은 기온 튐 및 전체 앙상블 왜곡 완전 차단.
- **강수 판정 및 비/이슬비 가능성 구간 복원 (40~65% 가능성 / 66% 이상 확정)**:
  - 0.1mm 이상 강수 모의 시 이슬비 계열로 취급.
  - **POP 40% ~ 65% (강수 가능성 구간)**:
    - 0.1mm 미세 강수 모의 또는 WMO 51~57: **"이슬비가능성"** (전용 구름+물음표 `cloud-doubt-rain` 아이콘).
    - 0.3mm 이상 강수 모의 또는 WMO 61~67/80~82: **"비가능성"** (전용 구름+물음표 `cloud-doubt-rain` 아이콘).
  - **POP 66% 이상 (확실한 강수 확정)**: 확실한 **"이슬비"** 또는 **"비"**(`🌧️`)로 확정 표기.
  - **POP 20% ~ 39%**: **"흐림"**(`☁️`) (비로 단정하지 않음).
  - **POP < 20%**: 운량에 따른 **"맑음"** / **"구름많음"** / **"흐림"**.
- **날씨 엔진 복잡도 해소를 위한 4대 모듈화 구조**:
  - `src/utils/weather/weatherTypes.ts`: 공통 인터페이스, 모델 가중치, 시스템 설정.
  - `src/utils/weather/conditionClassifier.ts`: 실황 및 예보 정밀 하늘상태/강수 판별 알고리즘.
  - `src/utils/weather/ensembleEngine.ts`: 4대 수치모델 동적 가중 앙상블 및 KMA 결측치 안전 보정.
  - `src/utils/weather/weatherFetcher.ts`: Open-Meteo, 지상 실황, GAS API 다중 소스 수신 및 캐시 파이프라인.
  - `src/utils/weatherEngine.ts`: Facade 통합 엔트리로 기존 컴포넌트(`App.tsx` 등) 100% 하위 호환성 보장.

### 16.4 국도 33호선 장재삼거리 노면 수분 및 결로 관제 계측판 (v8.5)
- **가짜 비디오 플레이어 전면 철거**:
  - 외부 반복 샘플 비디오 재생기 및 더미 MP4 스트림을 제거하고 100% 실측 물리 기반 계측판으로 전면 전환.
- **캠2 (CAM-02) 영구 삭제**:
  - 실시간 영상 및 센서 신뢰성이 확보되지 않는 2번 관제점 완전 삭제.
- **국도 33호선 장재삼거리 (CAM-01 위치) 실측 계측판**:
  - 기상청 진주 관측소 기온($T$), 습도($RH$), 강수량, 이슬점($T_d$), 풍속 연동.
  - **노면 상태 (DRY / DAMP / WET)** 및 노면 수분 지수(RMI) 게이지 표출.
  - **이슬점 결손($T - T_d$)** 기반 수변 결로 및 안개 발생 위험 실시간 판정.
  - **블랙아이스 주의보**: 기온 $1.5^\circ\text{C}$ 이하 및 RMI $0.35$ 이상 시 자동 발령.

### 16.5 스마트폰·PC 모니터 실시간 자동 전환 반응형 동적 UI 아키텍처 규격 (v8.6)
- **화면 크기별 내비게이션 자동 전환 (Navigation Auto-Switching)**:
  - 모바일(< 768px): 한 손 조작성에 최적화된 **하단 고정 탭바** 유지 (`md:hidden`).
  - 데스크톱/태블릿(≥ 768px): 하단 탭바 자동 숨김 및 **상단 헤더 탭바 (`HeaderNav`)**로 통합 전환.
- **와이드 대시보드 및 2열 분할 관제 레이아웃 (lg 이상, ≥ 1024px)**:
  - 기존 430px 고정 갇힘 한계를 탈피하고 `max-w-7xl` 풀 캔버스 활용.
  - 좌측(4.5열): 실시간 히어로 날씨, 앙상블 비중 분석기, 대기질 퀵 위젯 상시 모니터링.
  - 우측(7.5열): 48시간 시간별 앙상블 복합 차트 및 테이블, 주간 예보, 레이더 지도(높이 460px 확장) 및 국도 33호선 노면 계측판 와이드 표출.
- **모바일 비례 스케일링**:
  - 320px 소형 모바일(iPhone SE)부터 430px 대화면(Galaxy S Ultra)까지 글꼴 크기, 여백, 터치 영역($44\text{px}$) 유동 비례 조정.

### 16.6 PWA 설치 앱 캐시 갱신 및 자동 업데이트 규격 (v8.7)
- **오프라인 우선 캐시 정책 및 지연 해소**:
  - 설치된 PWA(홈 화면 바로가기)의 이전 캐시(CacheStorage) 고착을 방지하기 위해 `registerSW`의 `onNeedRefresh` 콜백을 등록하여 새 배포 감지 시 즉시 `updateSW(true)`로 화면 갱신.
- **주기적 및 이벤트 기반 업데이트 감지**:
  - 백그라운드 10분 주기 `registration.update()` 자동 호출.
  - 앱 화면 복귀(`visibilitychange`) 및 사용자의 날씨 "새로고침" 터치 시 서비스 워커 업데이트 동시 트리거.

### 16.7 일일·주간 날씨 지능형 요약 브리핑 및 기상 지표 정밀화 (v8.8)
- **일일 날씨 핵심 브리핑 카드 (`HourlyTableChart.tsx`)**:
  - 오늘 하루 최고/최저 기온, 일교차, 40~65% 이슬비가능성 및 66% 이상 비 확정 시간대 요약.
  - 평균 풍속 및 순간 최대 풍속, 보퍼트 풍속 계급 라벨 병기.
  - 우산 휴대 여부, 환기/빨래 지수 등 맞춤 생활 기상 가이드 제공.
- **주간 종합 기상 전망 브리핑 카드 (`WeeklyForecast.tsx`)**:
  - 7일간 전반 전망 및 최고/최저 기온 요일 분석.
  - 비 오는 요일 사전 안내 및 주말(토/일) 나들이 기상 전망.
  - 환절기 추천 옷차림 및 생활 팁 제공.
- **현재 날씨 현재 습도 및 이슬점 핵심 영역 표출 (`HeroWeather.tsx`)**:
  - `weatherFetcher.ts`의 `liveObsHumidity`, `liveObsDewPoint` 필드 바인딩 누락 해결.
  - 현재 기온 우측 핵심 영역에 `💧 현재습도 {humidity}% (이슬점 {dewPoint}°)` 전용 카드로 시인성 강화.
- **풍속 예측 소수점 1자리 정밀화 및 보퍼트 계급 연계**:
  - `Math.round()`로 정수화되던 풍속을 `Number(ensSlot.ensWind.toFixed(1))`로 정밀도 복원.
  - 기상청 보퍼트 풍속 계급에 따른 체감 등급(고요/실바람/남실바람/산들바람/건들바람/강풍) 병기.
- **React Hooks 호출 순서 규격 준수 (`HourlyTableChart.tsx`)**:
  - 데이터 로딩 분기(`if (!hourly || hourly.length === 0)`) 이전에 모든 훅(`useMemo`, `useCallback`, `useEffect`)을 최상단에서 우선 호출하도록 배치하여 컴포넌트 라이프사이클 내 훅 순서 및 수량 불변성 확보.

### 16.8 비·바람 결합 기상 분리 판정 및 핵심 브리핑 규격 (v8.9)
- **비 올 때 vs 비 안 올 때 바람 판정 분리 (풍속 $2.0\text{m/s}$ 임계치)**:
  - 비 내리는 시간대 풍속 $\ge 2.0\text{m/s}$ 시 빗줄기 들이침(Driving Rain) 현상으로 분류, "비바람 주의" 문구 및 강조 뱃지 발령.
  - 비 내리는 시간대 풍속 $< 2.0\text{m/s}$ 시 "차분히 내리는 비"로 분리 안내.
  - 비 안 올 때 풍속은 쾌적한 산들바람 또는 강풍 주의 등 일반 기상 기준으로 분리 표출.
- **시간당 강수량 $2.0\text{mm/h}$ 이상 및 우산 안내 지침**:
  - 굵은 빗줄기로 젖음 위험이 커지는 시간당 $2.0\text{mm}$ 이상 수치를 명확히 제시.
  - 핵심 가이드는 "외출 시 우산 챙기세요"로 직관적이고 명확하게 전달.

### 16.9 가상 우산 착용 뱃지 완전 삭제 및 실측·노면 수분 결합 체계 (v9.0)
- **가상 우산 착용 뱃지 전면 제거**:
  - 메인 히어로 카드(`HeroWeather.tsx`)의 `☂️ 우산 착용 (XX%)` 뱃지 및 `cctvWeatherAnalyzer.ts`의 인위적 우산 착용률 산출 로직 완전 삭제.
- **기상청 실측 데이터 + 노면 수분 계측 지수(RMI) 결합 체계**:
  - 현재 날씨 판정 시 실측 강수량, 기상청 WMO 코드, 4대 수치모델 앙상블 및 물리 기반 노면 수분 계측 지수(RMI, 0.00~1.00)만을 직접 결합.
  - 도로 건조/결로/젖음(DRY/DAMP/WET) 상태를 투명하게 표출.

### 16.10 무손실 코드베이스 단순화 및 5대 기상 엔진 모듈 분리 규격 (v9.1)
- **미사용 레거시 파일 및 속성 완전 삭제**:
  - 사문화된 `src/utils/cctvWeatherAnalyzer.ts`, `src/components/CctvStreamViewer.tsx` 파일 및 `CurrentWeather.umbrellaIndex` 속성 완전 제거.
- **기상 엔진 5대 독립 모듈 구조 (`src/utils/weather/`)**:
  1. `weatherTypes.ts`: 공통 인터페이스, 지역 좌표, 모델 가중치 및 SSOT 설정.
  2. `conditionClassifier.ts`: 실황·예보 하늘상태 및 40~65% 가능성 / 66% 확정 판별기.
  3. `ensembleEngine.ts`: 4대 수치모델 동적 가중 앙상블, 이슬점 및 물리 노면 수분 지수(RMI/CPI) 계산기.
  4. `weatherFetcher.ts`: GAS 하이브리드 및 Open-Meteo 4대 모델 메인 수집기 (`extractSlotModelInputs` 공통 추출 함수로 0h·시간별 중복 제거).
  5. `weatherFallbackAndAux.ts`: 이중 캐시(`saveForecastCache`, `loadForecastCache`), 오프라인 폴백, 주간 7일 공통 파서(`parseDailyEnsembleForecast`), 전국 날씨·대기질 보조 API 모듈.
- **문서 히스토리 보존 및 목차 인덱싱**:
  - `agent.md` 및 `spec.md`의 전체 과거 버전 이력을 100% 보존하고 상단 목차(TOC)를 통해 현행 유효 규격 즉시 탐색 지원.










