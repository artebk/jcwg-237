/**
 * [날씨 관제 엔진 통합 Facade 엔트리 v8.4]
 * 
 * 시스템 복잡도 해소 및 유지보수성 극대화를 위해 4대 독립 모듈로 아키텍처 재편:
 * 1. src/utils/weather/weatherTypes.ts (타입 및 시스템 아키텍처 설정)
 * 2. src/utils/weather/conditionClassifier.ts (강수확률 40~65% 가능성, 66% 확정 표기 및 상태 판정)
 * 3. src/utils/weather/ensembleEngine.ts (4대 모델 가중 앙상블 및 KMA 결측 안전 보정)
 * 4. src/utils/weather/weatherFetcher.ts (Open-Meteo, 지상 실측, GAS API 및 캐싱)
 */

export * from './weather/weatherTypes';
export * from './weather/conditionClassifier';
export * from './weather/ensembleEngine';
export * from './weather/weatherFetcher';
