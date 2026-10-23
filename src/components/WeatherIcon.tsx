import React from 'react';

interface WeatherIconProps {
  icon: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * 4단계 하늘상태 정밀 아이콘 렌더러
 * - 45%~59% 구간: 구름 속 큰 물방울 + 물방울 내 물음표(?) 전용 그래픽
 * - 기타 구간: 표준 고해상도 날씨 이모지 및 그래픽
 */
export const WeatherIcon: React.FC<WeatherIconProps> = ({
  icon,
  className = '',
  size = 'md'
}) => {
  const isThunderDoubt =
    icon === 'cloud-doubt-thunder-rain' ||
    icon === '⛈️❓' ||
    icon?.includes('thunder-rain');

  const isDoubtRain =
    isThunderDoubt ||
    icon === 'cloud-doubt-rain' ||
    icon === '🌧️❓' ||
    icon === '🌦️❓' ||
    icon?.includes('?');

  const sizeClasses = {
    sm: 'w-5 h-5 text-sm',
    md: 'w-6 h-6 text-xl',
    lg: 'w-8 h-8 text-2xl',
    xl: 'w-10 h-10 text-3xl'
  };

  if (isDoubtRain) {
    const svgSize = size === 'sm' ? 24 : size === 'md' ? 32 : size === 'lg' ? 40 : 50;
    const titleText = isThunderDoubt
      ? "뇌우/비 올 가능성 (강수확률 40%~74% 경계 구간)"
      : "비/소나기 올 가능성 (강수확률 40%~74% 경계 구간)";

    return (
      <span
        className={`inline-flex items-center justify-center relative select-none ${className}`}
        style={{ width: `${svgSize}px`, height: `${svgSize}px` }}
        title={titleText}
      >
        <svg
          viewBox="0 0 100 100"
          width={svgSize}
          height={svgSize}
          className="overflow-visible filter drop-shadow"
        >
          <defs>
            {/* 구름 그라데이션 (차콜 그레이) */}
            <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#808896" />
              <stop offset="50%" stopColor="#596373" />
              <stop offset="100%" stopColor="#3d4554" />
            </linearGradient>

            {/* 물방울 그라데이션 (선명하고 밝은 아쿠아 스카이블루) */}
            <linearGradient id="dropGrad" x1="20%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#e0f2fe" />
              <stop offset="35%" stopColor="#bae6fd" />
              <stop offset="70%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* 번개 그라데이션 (선명한 앰버 옐로우/골드) */}
            <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>

            {/* 그림자 필터 */}
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* 1. 배경 구름 (모양: 둥근 아치형 뭉게구름) */}
          <g filter="url(#softShadow)">
            <path
              d="M 22 55 
                 C 14 55, 10 46, 15 38 
                 C 14 26, 26 20, 34 25 
                 C 40 16, 55 16, 62 24 
                 C 72 18, 85 25, 84 37 
                 C 90 44, 86 55, 78 55 
                 Z"
              fill="url(#cloudGrad)"
              stroke="#2d3748"
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </g>

          {/* 2. 전면 거대 물방울 (구름 중앙을 덮는 형태) */}
          <g filter="url(#softShadow)">
            {/* 물방울 메인 바디 */}
            <path
              d="M 50 10 
                 C 50 10, 77 46, 77 66 
                 C 77 81, 65 91, 50 91 
                 C 35 91, 23 81, 23 66 
                 C 23 46, 50 10, 50 10 
                 Z"
              fill="url(#dropGrad)"
              stroke="#0284c7"
              strokeWidth="4"
              strokeLinejoin="round"
            />

            {/* 물방울 좌측 하이라이트 광택 1 */}
            <path
              d="M 31 60 C 29 67, 31 75, 36 82"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.85"
            />

            {/* 물방울 좌측 하단 작은 반사광 점 2 */}
            <ellipse
              cx="42"
              cy="85"
              rx="2.5"
              ry="1.8"
              fill="#ffffff"
              opacity="0.8"
            />

            {/* 물방울 우측 하단 반사광 */}
            <ellipse
              cx="70"
              cy="77"
              rx="2"
              ry="3"
              fill="#ffffff"
              opacity="0.7"
              transform="rotate(25 70 77)"
            />
          </g>

          {/* 3. 뇌우 코드일 경우: 물방울 위로 전면 돌출되는 선명한 번개(⚡) 볼트 */}
          {isThunderDoubt && (
            <g filter="url(#softShadow)">
              <path
                d="M 28 22 
                   L 14 46 
                   L 26 46 
                   L 12 72 
                   L 32 42 
                   L 22 42 
                   Z"
                fill="url(#boltGrad)"
                stroke="#b45309"
                strokeWidth="2.5"
                strokeLinejoin="miter"
              />
            </g>
          )}

          {/* 4. [핵심] 중앙 매우 크고 굵은 블랙(#000000) 물음표 (?) */}
          <g className="select-none">
            {/* 물음표 상단 곡선 */}
            <path
              d="M 37 47
                 C 37.5 37, 43 32, 52 32 
                 C 61 32, 67 37.5, 67 46 
                 C 67 52.5, 62.5 57, 58 61 
                 C 54 64.5, 52.5 67.5, 52.5 71.5 
                 L 45.5 71.5 
                 C 45.5 64.5, 48.5 60.5, 53.5 56.5 
                 C 57.5 53, 60 50.5, 60 46 
                 C 60 41.5, 56.5 38.5, 52 38.5 
                 C 46.5 38.5, 43.5 41.5, 43 47 
                 Z"
              fill="#000000"
            />
            {/* 물음표 하단 큼직하고 선명한 원형 점 (Dot) */}
            <circle
              cx="49"
              cy="80.5"
              r="4.8"
              fill="#000000"
            />
          </g>
        </svg>
      </span>
    );
  }

  // 일반 이모지 아이콘
  return (
    <span className={`inline-block filter drop-shadow-sm leading-none ${sizeClasses[size]} ${className}`}>
      {icon}
    </span>
  );
};
