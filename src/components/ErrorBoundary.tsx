import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] React 컴포넌트 렌더링 오류 감지:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0d1627] text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-white">화면을 표시하는 중 문제가 발생했습니다</h2>
              <p className="text-xs text-white/60 leading-relaxed">
                일시적인 데이터 수신 또는 렌더링 오류입니다. 아래 버튼을 눌러 새로고침해 주세요.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 text-[11px] text-rose-300 font-mono text-left max-h-32 overflow-y-auto break-all">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer active:scale-98"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>화면 다시 불러오기 (새로고침)</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
