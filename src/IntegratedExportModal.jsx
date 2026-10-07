import React, { useState, useEffect, useMemo } from 'react';
import { getConstructionPeriod, normalizeJVName } from './utils';

/**
 * 간트차트 & 공사 일정 달력 통합 종합 PPT 내보내기 모달
 * - 현재 보고 있는 화면(뷰포트) 정중앙에 fixed 팝업
 * - 내용 잘림 없이 시원하고 가독성 높은 레이아웃 (가로 스크롤 없음)
 * - 일정 기준 선택: 공사 일정 기준 vs 전체 프로젝트 일정 기준 ('공사·셋업' -> '공사' 통일)
 * - 기간 설정: 시작일 ~ 종료일 및 퀵 프리셋
 * - 슬라이드 구성 선택: 표지/KPI, 달력, 일일 부서별 공수표, 간트차트, 상세 명세서
 * - 100% Native Office 객체 기반 (수정 가능, 이미지 캡처 X)
 */
export default function IntegratedExportModal({
  isOpen,
  onClose,
  projects = [],
  defaultMode = 'construction',
  defaultStartDate = '',
  defaultEndDate = '',
  filters = {},
  onExport
}) {
  const [mode, setMode] = useState(defaultMode);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [slides, setSlides] = useState({
    summary: true,
    calendar: true,
    manpower: true,
    gantt: true,
    details: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode || 'construction');
      setStartDate(defaultStartDate || '');
      setEndDate(defaultEndDate || '');
      setExportError('');
    }
  }, [isOpen, defaultMode, defaultStartDate, defaultEndDate]);

  // 빠른 기간 설정
  const handleQuickRange = (type) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (type === 'thisMonth') {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (type === 'nextMonth') {
      const first = new Date(y, m + 1, 1);
      const last = new Date(y, m + 2, 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (type === 'thisQuarter') {
      const qStartMonth = Math.floor(m / 3) * 3;
      const first = new Date(y, qStartMonth, 1);
      const last = new Date(y, qStartMonth + 3, 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (type === 'thisYear') {
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-12-31`);
    } else if (type === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // 현재 설정에 따른 대상 프로젝트 건수 계산
  const matchingProjectsCount = useMemo(() => {
    if (!projects || !projects.length) return 0;
    const isConstruction = mode === 'construction';
    if (!startDate && !endDate) return projects.length;

    return projects.filter(p => {
      const cp = getConstructionPeriod(p);
      const effStart = isConstruction ? (cp.startDate || p.startDate || '') : (p.startDate || '');
      const effEnd = isConstruction ? (cp.endDate || p.endDate || '') : (p.endDate || '');

      if (startDate && endDate) {
        return (!effStart || effStart <= endDate) && (!effEnd || effEnd >= startDate);
      }
      if (startDate) return !effEnd || effEnd >= startDate;
      if (endDate) return !effStart || effStart <= endDate;
      return true;
    }).length;
  }, [projects, mode, startDate, endDate]);

  if (!isOpen) return null;

  const handleToggleSlide = (key) => {
    setSlides(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleExecuteExport = async () => {
    const selectedCount = Object.values(slides).filter(Boolean).length;
    if (selectedCount === 0) {
      setExportError('최소 1개 이상의 슬라이드를 선택해주세요.');
      return;
    }

    setIsExporting(true);
    setExportError('');
    try {
      await onExport({
        mode,
        startDate,
        endDate,
        includeSlides: slides,
        filters
      });
      onClose();
    } catch (err) {
      setExportError(err.message || 'PPT 생성 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="back"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '760px',
          maxWidth: '94vw',
          maxHeight: '90vh',
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-medium, #cbd5e1)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
          animation: 'modalFadeIn 0.2s ease-out'
        }}
      >
        {/* 모달 헤더 */}
        <div style={{
          padding: '18px 24px',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📊</span>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                종합 일정 보고서 PPT 내보내기
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 28px', fontSize: '12px', color: '#bfdbfe' }}>
              간트차트와 공사 일정 달력을 통합한 맞춤형 보고서 (Office 네이티브 표/도형 100% 직접 수정 가능)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#ffffff',
              fontSize: '18px',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* 모달 바디 (스크롤, 가로 스크롤 없음) */}
        <div style={{
          padding: '20px 24px',
          overflowY: 'auto',
          overflowX: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxSizing: 'border-box',
          width: '100%'
        }}>
          
          {/* 1. 일정 산출 기준 선택 (공사 vs 전체) */}
          <section style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>🎯</span>
              <span>1. 일정 산출 기준 선택</span>
              <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 500 }}>(필수)</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
              <div
                onClick={() => setMode('construction')}
                style={{
                  border: `2px solid ${mode === 'construction' ? '#2563eb' : 'var(--border-subtle, #e2e8f0)'}`,
                  background: mode === 'construction' ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-card-subtle, #f8fafc)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxSizing: 'border-box',
                  minWidth: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <input
                    type="radio"
                    name="scheduleMode"
                    checked={mode === 'construction'}
                    onChange={() => setMode('construction')}
                    style={{ cursor: 'pointer', flexShrink: 0, width: '16px', height: '16px' }}
                  />
                  <b style={{ fontSize: '13px', color: mode === 'construction' ? '#2563eb' : 'var(--text-primary)', whiteSpace: 'normal' }}>
                    🏗️ 공사 일정 기준 (추천)
                  </b>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', paddingLeft: '24px', lineHeight: 1.4, wordBreak: 'keep-all' }}>
                  공수 투입 시점 및 현장 공사 기간, <b>공사 진행률</b> 기준
                </div>
              </div>

              <div
                onClick={() => setMode('project')}
                style={{
                  border: `2px solid ${mode === 'project' ? '#2563eb' : 'var(--border-subtle, #e2e8f0)'}`,
                  background: mode === 'project' ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-card-subtle, #f8fafc)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxSizing: 'border-box',
                  minWidth: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <input
                    type="radio"
                    name="scheduleMode"
                    checked={mode === 'project'}
                    onChange={() => setMode('project')}
                    style={{ cursor: 'pointer', flexShrink: 0, width: '16px', height: '16px' }}
                  />
                  <b style={{ fontSize: '13px', color: mode === 'project' ? '#2563eb' : 'var(--text-primary)', whiteSpace: 'normal' }}>
                    📋 전체 프로젝트 일정 기준
                  </b>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', paddingLeft: '24px', lineHeight: 1.4, wordBreak: 'keep-all' }}>
                  계약 전 기간 및 프로젝트 <b>전체 종합 진행률</b> 기준
                </div>
              </div>
            </div>
          </section>

          {/* 2. 기간 설정 */}
          <section style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📅</span>
                <span>2. 보고서 대상 기간 설정</span>
              </div>
              <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
                포함 대상: <b>{matchingProjectsCount}</b>건 <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(전체 {projects.length}건)</span>
              </span>
            </div>

            <div style={{
              background: 'var(--bg-card-subtle, #f8fafc)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: '10px',
              padding: '12px 14px',
              boxSizing: 'border-box',
              width: '100%'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    border: '1px solid var(--input-border, #cbd5e1)',
                    borderRadius: '6px',
                    background: 'var(--input-bg, #fff)',
                    color: 'var(--input-text, #0f172a)'
                  }}
                  title="조회 시작일"
                />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700 }}>~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    border: '1px solid var(--input-border, #cbd5e1)',
                    borderRadius: '6px',
                    background: 'var(--input-bg, #fff)',
                    color: 'var(--input-text, #0f172a)'
                  }}
                  title="조회 종료일"
                />

                <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('thisMonth')}
                    style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-medium, #cbd5e1)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    이번 달
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('nextMonth')}
                    style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-medium, #cbd5e1)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    다음 달
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('thisQuarter')}
                    style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-medium, #cbd5e1)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    이번 분기
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('thisYear')}
                    style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-medium, #cbd5e1)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    올해 전체
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('all')}
                    style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    전체 기간
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                💡 설정하신 기간과 겹치거나 진행 중인 프로젝트만 추출하여 종합 보고서를 작성합니다. (미설정 시 전체 대상)
              </div>
            </div>
          </section>

          {/* 3. 포함할 슬라이드 구성 선택 (잘림 없이 선명하게 표시) */}
          <section style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📑</span>
              <span>3. 포함할 보고서 슬라이드 선택</span>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: 'var(--bg-card-subtle, #f8fafc)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: '10px',
              padding: '12px 14px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {[
                { id: 'summary', title: '슬라이드 1: 표지 및 Executive KPI 요약 대시보드', desc: '총 투입 공수, 피크 인원, 프로젝트 상태 요약 및 리스트' },
                { id: 'calendar', title: '슬라이드 2: 월간 공사 일정 달력 (Calendar View)', desc: '네이티브 달력 그리드 + 일자별 공수 배지 + 주차별 프로젝트 바' },
                { id: 'manpower', title: '슬라이드 3: 일일 부서별 공수 매트릭스 표 (Daily Matrix)', desc: '1일~말일 일자별/부서별(기구, 제어, 비전 등) 투입 인원 및 총합 표' },
                { id: 'gantt', title: '슬라이드 4: 종합 공사 간트차트 (Timeline Gantt Chart)', desc: '공사 일정 기준 타임라인 바 + 오늘선 + 마일스톤 + 진행률(%) 표기' },
                { id: 'details', title: '슬라이드 5: 프로젝트별 공사 및 공수 상세 명세서 (Table)', desc: '제조번호, Site, 공사 일정, 공사 구분, 부서별 실적 명세' }
              ].map(item => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: slides[item.id] ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-card, #ffffff)',
                    border: `1px solid ${slides[item.id] ? 'rgba(37, 99, 235, 0.3)' : 'var(--border-subtle, #e2e8f0)'}`,
                    transition: 'all 0.15s',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={slides[item.id]}
                    onChange={() => handleToggleSlide(item.id)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      accentColor: '#2563eb'
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: slides[item.id] ? '#1d4ed8' : 'var(--text-primary)' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      {item.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* 안내 박스 */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '11.5px',
            color: '#065f46',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>✨</span>
            <div style={{ lineHeight: 1.4, wordBreak: 'keep-all' }}>
              <b>100% Native Office 객체:</b> 이미지 캡쳐 없이 PowerPoint 기본 표와 도형으로 생성되어 텍스트, 수치, 서식을 자유롭게 직접 수정할 수 있습니다.
            </div>
          </div>

          {exportError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#dc2626',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              ⚠️ {exportError}
            </div>
          )}

        </div>

        {/* 모달 풋터 */}
        <div style={{
          padding: '14px 24px',
          background: 'var(--bg-card-subtle, #f8fafc)',
          borderTop: '1px solid var(--border-subtle, #e2e8f0)',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              border: '1px solid var(--border-medium, #cbd5e1)',
              borderRadius: '8px',
              background: 'var(--bg-card, #fff)',
              color: 'var(--text-secondary, #475569)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            취소
          </button>

          <button
            type="button"
            onClick={handleExecuteExport}
            disabled={isExporting}
            style={{
              padding: '8px 22px',
              fontSize: '13px',
              borderRadius: '8px',
              background: isExporting ? '#93c5fd' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
            }}
          >
            {isExporting ? (
              <>
                <span className="spinner" style={{ width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                <span>보고서 생성 중...</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>종합 PPT 보고서 다운로드 (.pptx)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
