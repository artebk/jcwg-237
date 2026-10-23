import React from 'react';
import { RoadMoistureMonitor, RoadMoistureMonitorProps } from './RoadMoistureMonitor';

export { RoadMoistureMonitor };
export type { RoadMoistureMonitorProps };

/**
 * [호환성 엔트리] CctvStreamViewer
 * 
 * - 사용자 확정 결정: 가짜 반복 재생 비디오 플레이어 전면 철거 & 캠2 즉시 삭제
 * - 실제 기상청 지상 실측 및 수치 앙상블 기반의 '국도 33호선 장재삼거리 노면 수분 및 결로 계측판'으로 100% 전환
 */
export const CctvStreamViewer: React.FC<RoadMoistureMonitorProps> = (props) => {
  return <RoadMoistureMonitor {...props} />;
};
