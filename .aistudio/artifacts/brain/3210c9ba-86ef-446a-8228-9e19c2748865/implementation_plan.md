# 가상 우산 착용 뱃지 전면 제거 및 실측·노면 수분 결합 체계 구축 계획

사용자의 명확한 피드백을 반영하여, **① 실제 영상 분석이 아닌 가상 연산으로 혼란을 주던 '우산 착용' 뱃지를 UI 및 데이터 모델에서 완전히 제거**하고, **② 현재 날씨 판단을 기상청 및 4대 수치모델 실측 데이터와 실제 물리 모델 기반 '노면 수분 계측 지수(RMI)' 결합 방식으로 완전 일원화**하기 위한 구현 계획서입니다.

---

## 사용자 확정 사항 (User Confirmed Requirements)

> [!IMPORTANT]
> 1. **혼란을 주는 '우산 착용' 뱃지 완전 삭제**:
>    - 메인 히어로 카드(`HeroWeather.tsx`)의 `☂️ 우산 착용 (XX%)` 뱃지 및 관련 가상 영상 분석 잔재를 시스템 전반에서 완전히 제거.
> 2. **현재 날씨 판단 핵심 데이터 소스 일원화**:
>    - **기상청 및 4대 수치모델 실측 데이터**(Open-Meteo 지상 실황 관측값, ECMWF/GFS/ICON/KMA 가중 앙상블, WMO 기상 코드)와
>    - **물리 모델 기반 노면 수분 계측 지수(RMI)** 결합.
>    - 노면 건조/결로/젖음 상태(DRY/DAMP/WET)를 실제 기상 판정(Composite Precipitation Index, CPI)의 보조 지표로 연동.

---

## 1. 세부 변경 계획

### 1.1 UI 컴포넌트 정리 (`src/components/HeroWeather.tsx`)
- `umbrellaIndexBadge` (`☂️ 우산 착용`) 요소 및 툴팁 완전 삭제.
- 노면 상태 뱃지(`🛣️ 노면 상태 및 RMI %`)를 핵심 지표로 정돈하여 직관적인 지상 상태를 표출.

### 1.2 지상 실황 분석 엔진 정비 (`src/utils/cctvWeatherAnalyzer.ts`)
- 과거 가상 영상 캔버스 픽셀 연산 가드 및 보행자 우산 착용률 계산 로직 완전 철거.
- **노면 수분 계측기(Road Moisture Estimator)** 역할로 코드 정돈:
  - 기온($T$), 습도($RH$), 강수량($Rain$), 이슬점($T_d$), 풍속에 기반한 노면 건조/결로/젖음(RMI) 계측에 집중.

### 1.3 데이터 페처 및 기상 엔진 연동 (`src/utils/weather/weatherFetcher.ts`)
- `CurrentWeather` 객체에서 `umbrellaIndex` 제거 또는 안전값(`undefined`) 처리.
- 현재 날씨 판정(`determineCurrentSkyState` 및 `cpiRes`)에서 허위 지상 우산 점수 대신, **실측 강수량 + 기상청 WMO 코드 + 노면 수분 지수(RMI)**의 실제 물리적 데이터만을 융합하여 기상 상태를 판정.

### 1.4 데이터 타입 및 인터페이스 정리 (`src/types/index.ts`, `src/utils/weather/weatherTypes.ts`)
- `CurrentWeather`의 `umbrellaIndex` 속성을 선택적(optional)으로 전환하거나 안전하게 정리.

### 1.5 형상 관리 문서 동기화 (`agent.md`, `spec.md`)
- `agent.md` [섹션 29] 및 `spec.md` [섹션 16.9]에 가상 우산 뱃지 영구 삭제 및 기상청·수치모델·노면수분 결합 판정 규격 마크다운 기록.

---

## 2. 검증 계획
1. `lint_applet` (`tsc --noEmit`) 실행으로 TypeScript 타입 무결성 검증.
2. `compile_applet` 실행으로 앱 빌드 성공 확인.
3. 메인 화면에서 허위 81% 우산 착용 뱃지가 완전히 사라지고, 실측 기상 및 노면 수분 지표가 정상 표출되는지 검증.
