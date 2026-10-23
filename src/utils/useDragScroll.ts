import React, { useRef, useState, useCallback, useEffect } from 'react';

interface UseDragScrollOptions {
  dragSpeed?: number;
  enableWheel?: boolean;
}

/**
 * 데스크톱 마우스 드래그 횡스크롤 및 모바일 터치 스크롤을 모두 원활하게 지원하는 React Hook
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  options: UseDragScrollOptions = {}
) {
  const { dragSpeed = 1.2, enableWheel = true } = options;
  const containerRef = useRef<T>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  // 마우스 다운 이벤트 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 마우스 좌클릭(button 0)일 때만 작동
    if (e.button !== 0 || !containerRef.current) return;

    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.pageX - containerRef.current.offsetLeft;
    startScrollLeftRef.current = containerRef.current.scrollLeft;
    setIsDragging(true);
  }, []);

  // 윈도우 전역 마우스 이동 및 마우스 업 감지로 컨테이너 밖으로 나가도 드래그 유지
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;

      const x = e.pageX - containerRef.current.offsetLeft;
      const walk = (x - startXRef.current) * dragSpeed;

      if (Math.abs(walk) > 3) {
        hasMovedRef.current = true;
      }

      containerRef.current.scrollLeft = startScrollLeftRef.current - walk;
    };

    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        setTimeout(() => {
          hasMovedRef.current = false;
        }, 50);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragSpeed]);

  // 드래그 중 의도치 않은 자식 요소 클릭(아이콘, 버튼 등) 방지
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (hasMovedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  // 마우스 휠 세로 회전 시 횡스크롤로 부드럽게 전환 지원 (Shift 키 없이도 편리한 스크롤)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!enableWheel || !containerRef.current) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) {
        containerRef.current.scrollLeft += e.deltaY;
      }
    },
    [enableWheel]
  );

  return {
    ref: containerRef,
    isDragging,
    events: {
      onMouseDown: handleMouseDown,
      onClickCapture: handleClickCapture,
      onWheel: handleWheel,
    },
  };
}
