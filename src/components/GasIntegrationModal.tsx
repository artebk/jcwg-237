import React, { useState } from 'react';
import { RawLogEntry, CurrentWeather } from '../types';
import { GAS_CODE_SNIPPET, ENSEMBLE_ARCHITECTURE_CONFIG } from '../utils/weatherEngine';
import { X, Copy, Check, Table, Code2, Link2, BarChart2, ShieldCheck, Activity } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface GasIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawLogs: RawLogEntry[];
  currentWeather?: CurrentWeather;
  gasUrl: string;
  onSaveGasUrl: (url: string) => void;
}

export const GasIntegrationModal: React.FC<GasIntegrationModalProps> = ({
  isOpen,
  onClose,
  rawLogs,
  currentWeather,
  gasUrl,
  onSaveGasUrl,
}) => {
  const [activeTab, setActiveTab] = useState<'benchmarks' | 'sheet' | 'code' | 'settings'>('benchmarks');
  const [inputUrl, setInputUrl] = useState(gasUrl);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const config = ENSEMBLE_ARCHITECTURE_CONFIG;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GAS_CODE_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    onSaveGasUrl(inputUrl);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#0f1b30] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#13223f]">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-base font-semibold text-white">
              구글 시트 연동 & {config.title} {config.version}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-[#0c1628] text-xs">
          <button
            onClick={() => setActiveTab('benchmarks')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-1.5 font-medium transition-colors ${
              activeTab === 'benchmarks'
                ? 'text-yellow-300 border-b-2 border-yellow-400 bg-white/5'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <BarChart2 className="w-4 h-4 text-yellow-400" />
            <span>정확도 & 앙상블 구조</span>
          </button>

          <button
            onClick={() => setActiveTab('sheet')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-1.5 font-medium transition-colors ${
              activeTab === 'sheet'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-white/5'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Table className="w-4 h-4 text-blue-400" />
            <span>Raw_Logs 시트 뷰</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-1.5 font-medium transition-colors ${
              activeTab === 'code'
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-white/5'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span>Code.gs 백엔드</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-1.5 font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-purple-400 border-b-2 border-purple-400 bg-white/5'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Link2 className="w-4 h-4 text-purple-400" />
            <span>웹앱 URL 설정</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-white/80 space-y-4">
          
          {/* TAB 1: Comparison & Architecture (Single Source of Truth 기반 자동 렌더링) */}
          {activeTab === 'benchmarks' && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* 실시간 직전 기상 실황 분해 카드 */}
              {currentWeather && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-950/40 via-[#10203a] to-emerald-950/40 border border-blue-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-300 font-semibold text-xs">
                      <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span>현재 직전 실황 수집 데이터 (실시간 자동 동기화)</span>
                    </div>
                    <span className="text-[10px] text-white/50 font-mono">
                      기준시각: {currentWeather.updatedAt}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-2 pt-1 font-mono text-center">
                    <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                      <div className="text-[10px] text-yellow-300 font-semibold font-sans">앙상블 합성</div>
                      <div className="text-sm font-bold text-yellow-300">{currentWeather.temp.toFixed(1)}°C</div>
                    </div>
                    {config.models.map((m) => {
                      const tempVal = m.key === 'ecmwf' ? (currentWeather.ecmwfTemp ?? currentWeather.temp)
                                    : m.key === 'kma' ? (currentWeather.kmaTemp ?? currentWeather.temp)
                                    : m.key === 'gfs' ? (currentWeather.gfsTemp ?? currentWeather.temp)
                                    : (currentWeather.iconTemp ?? currentWeather.temp);
                      return (
                        <div key={m.key} className={`p-2 rounded-lg ${m.bg} border ${m.border}`}>
                          <div className={`text-[10px] ${m.color} font-sans`}>{m.name} ({m.weight}%)</div>
                          <div className={`text-xs font-semibold ${m.color}`}>{tempVal.toFixed(1)}°C</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-white/70 border-t border-white/5">
                    <span>상태: <strong className="text-white">{currentWeather.conditionText} {currentWeather.conditionIcon}</strong></span>
                    <span>실측누적: <strong className="text-blue-300">{(currentWeather.accumRainSoFar ?? 0).toFixed(1)} mm</strong></span>
                    <span>오늘24h총예보: <strong className="text-cyan-300">{(currentWeather.forecastDailyRain ?? 0).toFixed(1)} mm</strong></span>
                    <span>바람: <strong className="text-white">{currentWeather.windDirection} {currentWeather.windSpeed}m/s</strong></span>
                  </div>
                </div>
              )}

              {/* 4대 모델 가중치 합성 아키텍처 명세 (Single Source of Truth 자동 연동) */}
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{config.version} {config.title} 수학적 계산 공식</span>
                </div>
                <div className="space-y-2 text-[11px] leading-relaxed text-white/80 font-sans">
                  <div>
                    • <strong>{config.formulas.temperature.label}</strong>: <code className="text-yellow-300 font-mono">{config.formulas.temperature.formula}</code>
                    <div className="text-[10px] text-white/60 pl-2">↳ {config.formulas.temperature.details}</div>
                  </div>
                  <div>
                    • <strong>{config.formulas.rain.label}</strong>: <span className="text-cyan-200 font-mono">{config.formulas.rain.formula}</span>
                    <div className="text-[10px] text-white/60 pl-2">↳ {config.formulas.rain.details}</div>
                  </div>
                  <div>
                    • <strong>{config.formulas.pop.label}</strong>: <span className="text-emerald-200 font-mono">{config.formulas.pop.formula}</span>
                    <div className="text-[10px] text-white/60 pl-2">↳ {config.formulas.pop.details}</div>
                  </div>
                  <div>
                    • <strong>{config.formulas.wmoFilter.label}</strong>: <span className="text-amber-200">{config.formulas.wmoFilter.formula}</span>
                    <div className="text-[10px] text-white/60 pl-2">↳ {config.formulas.wmoFilter.details}</div>
                  </div>
                </div>
              </div>

              {/* 벤치마크 비교표 (config.benchmarks 자동 연동) */}
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0a1222]">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-[#142342] text-white/80">
                    <tr>
                      <th className="p-2 border-b border-white/10">비교 항목</th>
                      <th className="p-2 border-b border-white/10 text-white/50">한국 포털 (TWC/단일 모델)</th>
                      <th className="p-2 border-b border-white/10 text-yellow-300 font-bold">초전동 4대 모델 앙상블 {config.version}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/70">
                    {config.benchmarks.map((b, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium text-white/90">{b.metric}</td>
                        <td className="p-2">{b.portal}</td>
                        <td className={`p-2 ${b.accent ? 'text-yellow-300 font-bold' : b.highlight ? 'text-emerald-300 font-semibold' : 'text-emerald-300'}`}>
                          {b.ensemble}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Raw Logs Sheet View */}
          {activeTab === 'sheet' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white/90">
                  구글 스프레드시트 [<span className="text-blue-300">Raw_Logs</span>] 실시간 적재 현황
                </span>
                <span className="text-[11px] text-emerald-300 font-mono">
                  1시간 크론 분리 기록
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0a1222] shadow-inner max-h-72">
                <table className="w-full text-[11px] text-left border-collapse whitespace-nowrap">
                  <thead className="bg-[#142342] text-white/80 sticky top-0 font-mono">
                    <tr>
                      <th className="p-2 border-b border-white/10">수집시각</th>
                      <th className="p-2 border-b border-white/10">위치</th>
                      <th className="p-2 border-b border-white/10 text-yellow-300">앙상블</th>
                      <th className="p-2 border-b border-white/10 text-blue-300">ECMWF</th>
                      <th className="p-2 border-b border-white/10 text-emerald-300">KMA</th>
                      <th className="p-2 border-b border-white/10 text-cyan-300">GFS</th>
                      <th className="p-2 border-b border-white/10 text-amber-300">ICON</th>
                      <th className="p-2 border-b border-white/10 text-emerald-300">POP(%)</th>
                      <th className="p-2 border-b border-white/10 text-blue-300">실측누적(mm)</th>
                      <th className="p-2 border-b border-white/10 text-cyan-300">오늘24h(mm)</th>
                      <th className="p-2 border-b border-white/10">상태</th>
                      <th className="p-2 border-b border-white/10">풍속</th>
                      <th className="p-2 border-b border-white/10">풍향</th>
                      <th className="p-2 border-b border-white/10 text-purple-300">데이터상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-white/70">
                    {rawLogs.map((log, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="p-2">{log.timestamp}</td>
                        <td className="p-2 font-sans">{log.location}</td>
                        <td className="p-2 text-yellow-300 font-bold bg-yellow-500/10">{(log.temp ?? 0).toFixed(1)}°</td>
                        <td className="p-2 text-blue-300">{(log.ecmwfTemp ?? log.temp ?? 0).toFixed(1)}°</td>
                        <td className="p-2 text-emerald-300">{(log.kmaTemp ?? log.temp ?? 0).toFixed(1)}°</td>
                        <td className="p-2 text-cyan-300">{(log.gfsTemp ?? log.temp ?? 0).toFixed(1)}°</td>
                        <td className="p-2 text-amber-300">{(log.iconTemp ?? log.temp ?? 0).toFixed(1)}°</td>
                        <td className="p-2 text-emerald-300 font-semibold">{log.pop ?? 0}%</td>
                        <td className="p-2 text-blue-300">{(log.accumRain ?? 0).toFixed(1)}mm</td>
                        <td className="p-2 text-cyan-300">{(log.forecastDailyRain ?? 0).toFixed(1)}mm</td>
                        <td className="p-2 font-sans">{log.condition}</td>
                        <td className="p-2">{(log.windSpeed ?? 0).toFixed(1)}m/s</td>
                        <td className="p-2 font-sans">{log.windDir}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            log.status === 'GAS_ENSEMBLE' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                            log.status === 'PREVIOUS_RUN' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            log.status === 'FALLBACK' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                            'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {log.status || 'DIRECT_LIVE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Google Apps Script Source Code */}
          {activeTab === 'code' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-white/80 font-semibold">
                  Google Apps Script 백엔드 코드 (Code.gs v5.0 실적용본)
                </span>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>복사 완료!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>전체 코드 복사</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-3.5 bg-[#09111e] rounded-xl border border-white/10 text-[11px] font-mono text-emerald-300/90 overflow-x-auto max-h-72 select-all">
                {GAS_CODE_SNIPPET}
              </pre>
            </div>
          )}

          {/* TAB 4: Web App URL Configuration */}
          {activeTab === 'settings' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs space-y-2">
                <h4 className="font-semibold text-white">Google Apps Script 배포 URL 연동</h4>
                <p className="text-white/60 text-[11px]">
                  구글 스프레드시트 웹 앱 URL을 등록하면 실시간 앙상블 기상 데이터가 <code className="text-yellow-300">Raw_Logs</code> 시트와 완벽 동기화됩니다. (조회 시 락 방어 및 1시간 크론 자동화 지원).
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-white/80">
                  Google Apps Script Web App URL:
                </label>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#09111e] border border-white/20 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-yellow-400 transition-colors"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-white/50">
                  * 미등록 시에도 4대 글로벌 모델(ECMWF, KMA, GFS, ICON) 앙상블로 100% 실시간 작동합니다.
                </span>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>저장 완료</span>
                    </>
                  ) : (
                    <span>설정 저장</span>
                  )}
                </button>
              </div>

              <div className="pt-2 border-t border-white/10">
                <p className="text-xs font-semibold text-white/90 mb-1.5">앱 설치 및 홈 화면 추가</p>
                <PWAInstallButton variant="banner" />
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#13223f] flex items-center justify-between text-xs text-white/50">
          <span>진주시 초전동 4대 모델 앙상블 엔진 v5.0 (완전 동기화)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
