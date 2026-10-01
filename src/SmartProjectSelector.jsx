import React, { useState, useRef, useEffect, useMemo } from 'react';
import { normalizeJVName } from './utils';

/**
 * SmartProjectSelector
 * 수백 개 이상의 프로젝트 중에서도 연도별 필터링과 실시간 다중 키워드 검색을 통해
 * 원하는 프로젝트를 1초 만에 찾아 선택할 수 있는 초고성능 스마트 프로젝트 선택기 컴포넌트
 * (PINTEL / PREVAX / Supabase 감성의 모던 커맨드 팔레트 UI)
 */
export default function SmartProjectSelector({
  projects = [],
  selectedProjectId = '',
  onSelectProject,
  placeholder = '프로젝트를 검색하여 선택하세요',
  compact = false,
  style = {},
  className = '',
  defaultYear = 'ALL',
  selectedYears = null // 외부 다중 연도 필터와 연동 가능
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState(defaultYear);
  const [siteFilter, setSiteFilter] = useState('ALL');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // 현재 선택된 프로젝트 객체
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find(p => String(p.id) === String(selectedProjectId)) || null;
  }, [projects, selectedProjectId]);

  // 프로젝트 목록에서 존재하는 연도 목록 추출 (최신순)
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    const currentYear = new Date().getFullYear();
    yearsSet.add(String(currentYear));

    projects.forEach(p => {
      const s = p.startDate || p.start_date || '';
      const e = p.endDate || p.end_date || '';
      if (s.length >= 4) {
        const y = parseInt(s.slice(0, 4), 10);
        if (!isNaN(y)) yearsSet.add(String(y));
      }
      if (e.length >= 4) {
        const y = parseInt(e.slice(0, 4), 10);
        if (!isNaN(y)) yearsSet.add(String(y));
      }
    });

    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  // 주요 Site 목록 추출
  const availableSites = useMemo(() => {
    const siteSet = new Set();
    projects.forEach(p => {
      const s = normalizeJVName(p.site || '').trim();
      if (s && s !== '선택 안됨') siteSet.add(s);
    });
    return Array.from(siteSet).sort();
  }, [projects]);

  // 드롭다운 열릴 때 검색 입력창 포커스
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  // 외부 클릭 감지하여 닫기
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // ESC 키 누르면 닫기
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 연도 및 검색 필터링된 프로젝트 목록
  const filteredList = useMemo(() => {
    return projects.filter(p => {
      // 1. 연도 필터링
      if (yearFilter !== 'ALL') {
        const yStart = `${yearFilter}-01-01`;
        const yEnd = `${yearFilter}-12-31`;
        const pStart = p.startDate || p.start_date || '';
        const pEnd = p.endDate || p.end_date || '';
        if (pStart && pEnd) {
          if (pStart > yEnd || pEnd < yStart) return false;
        } else if (pStart) {
          if (pStart > yEnd) return false;
        } else if (pEnd) {
          if (pEnd < yStart) return false;
        }
      }

      // 외부 다중 연도 필터가 주어졌고 yearFilter가 ALL인 경우 외부 필터 적용
      if (yearFilter === 'ALL' && selectedYears && selectedYears.length > 0 && !selectedYears.includes('ALL')) {
        const pStart = p.startDate || p.start_date || '';
        const pEnd = p.endDate || p.end_date || '';
        const sYr = pStart ? parseInt(pStart.slice(0, 4), 10) : null;
        const eYr = pEnd ? parseInt(eEndYear(pEnd), 10) : null;
        const matchAny = selectedYears.some(yrStr => {
          const yNum = parseInt(yrStr, 10);
          if (isNaN(yNum)) return true;
          if (sYr && eYr) return yNum >= sYr && yNum <= eYr;
          if (sYr) return yNum >= sYr;
          if (eYr) return yNum <= eYr;
          return true;
        });
        if (!matchAny) return false;
      }

      // 2. Site 필터링
      if (siteFilter !== 'ALL') {
        const s = normalizeJVName(p.site || '').trim();
        if (s !== siteFilter) return false;
      }

      // 3. 키워드 검색 (띄어쓰기 구분 다중 단어 검색 지원)
      if (search.trim()) {
        const queryTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
        const targetText = [
          p.manufacturingNo || p.manufacturing_no || '',
          normalizeJVName(p.name || ''),
          normalizeJVName(p.site || ''),
          p.line || '',
          p.pm || p.manager || ''
        ].join(' ').toLowerCase();

        const match = queryTerms.every(term => targetText.includes(term));
        if (!match) return false;
      }

      return true;
    });
  }, [projects, yearFilter, siteFilter, search, selectedYears]);

  function eEndYear(str) {
    return str.slice(0, 4);
  }

  const handleSelect = (pId) => {
    if (onSelectProject) {
      onSelectProject(pId);
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onSelectProject) {
      onSelectProject('');
    }
  };

  return (
    <div
      ref={containerRef}
      className={`smart-project-selector-wrapper ${className}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: compact ? 'auto' : '100%',
        minWidth: compact ? '240px' : '280px',
        ...style
      }}
    >
      {/* 1. 트리거 버튼 (현재 선택된 프로젝트 표시) */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: compact ? '6px 12px' : '8px 14px',
          background: 'var(--bg-card)',
          border: isOpen ? '1.5px solid var(--neon-cyan)' : '1px solid var(--border-medium)',
          borderRadius: '10px',
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 14px var(--neon-cyan-glow)' : 'var(--shadow-sm)',
          transition: 'all 0.2s ease',
          userSelect: 'none',
          minHeight: compact ? '34px' : '40px',
          color: 'var(--text-primary)'
        }}
        title={selectedProject ? `${selectedProject.manufacturingNo ? `[${selectedProject.manufacturingNo}] ` : ''}${selectedProject.name}` : placeholder}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
          <span style={{ fontSize: compact ? '13px' : '15px', flexShrink: 0 }}>🏢</span>
          {selectedProject ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {selectedProject.manufacturingNo && (
                <span
                  style={{
                    background: 'rgba(37, 99, 235, 0.15)',
                    color: 'var(--neon-cyan)',
                    padding: '2px 7px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    flexShrink: 0
                  }}
                >
                  {selectedProject.manufacturingNo}
                </span>
              )}
              <span style={{ fontSize: compact ? '12px' : '13.5px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {normalizeJVName(selectedProject.name)}
              </span>
              {selectedProject.site && (
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', flexShrink: 0 }}>
                  ({selectedProject.site}{selectedProject.line ? ` · ${selectedProject.line}` : ''})
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: compact ? '12px' : '13px', color: 'var(--text-muted)' }}>
              {placeholder}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {selectedProject && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px 5px',
                fontSize: '12px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              title="선택 해제"
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              ✕
            </button>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            ▼
          </span>
        </div>
      </div>

      {/* 2. 드롭다운 팝오버 (모던 커맨드 팔레트) */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            width: compact ? '400px' : '100%',
            minWidth: '320px',
            maxWidth: '560px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: '14px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            backdropFilter: 'blur(16px)',
            color: 'var(--text-primary)'
          }}
        >
          {/* 헤더: 검색창 & 빠른 닫기 */}
          <div style={{ padding: '12px 14px', background: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--input-bg)',
                border: '1.5px solid var(--primary-blue)',
                borderRadius: '8px',
                padding: '7px 12px',
                boxShadow: '0 0 10px rgba(37, 99, 235, 0.15)'
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--neon-cyan)' }}>🔍</span>
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="제조번호, 프로젝트명, Site, Line 검색..."
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '13px',
                  background: 'transparent',
                  color: 'var(--text-primary)'
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: 0
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* 연도 탭 필터 바 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '4px' }}>연도:</span>
              <button
                type="button"
                onClick={() => setYearFilter('ALL')}
                style={{
                  padding: '3px 9px',
                  borderRadius: '14px',
                  fontSize: '11px',
                  fontWeight: yearFilter === 'ALL' ? 700 : 500,
                  background: yearFilter === 'ALL' ? 'var(--primary-blue)' : 'var(--bg-card)',
                  color: yearFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                  border: yearFilter === 'ALL' ? '1px solid var(--primary-blue)' : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  boxShadow: yearFilter === 'ALL' ? '0 0 10px rgba(37, 99, 235, 0.35)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                전체
              </button>
              {availableYears.map(yr => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setYearFilter(yr)}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '14px',
                    fontSize: '11px',
                    fontWeight: yearFilter === yr ? 700 : 500,
                    background: yearFilter === yr ? 'var(--primary-blue)' : 'var(--bg-card)',
                    color: yearFilter === yr ? '#ffffff' : 'var(--text-secondary)',
                    border: yearFilter === yr ? '1px solid var(--primary-blue)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    boxShadow: yearFilter === yr ? '0 0 10px rgba(37, 99, 235, 0.35)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {yr}년
                </button>
              ))}
            </div>

            {/* Site 필터 바 (Site가 있을 때) */}
            {availableSites.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '4px' }}>Site:</span>
                <button
                  type="button"
                  onClick={() => setSiteFilter('ALL')}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10.5px',
                    fontWeight: siteFilter === 'ALL' ? 700 : 500,
                    background: siteFilter === 'ALL' ? '#0891b2' : 'var(--bg-card)',
                    color: siteFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                    border: siteFilter === 'ALL' ? '1px solid #0891b2' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  전체
                </button>
                {availableSites.slice(0, 6).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSiteFilter(s)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '10.5px',
                      fontWeight: siteFilter === s ? 700 : 500,
                      background: siteFilter === s ? '#0891b2' : 'var(--bg-card)',
                      color: siteFilter === s ? '#ffffff' : 'var(--text-secondary)',
                      border: siteFilter === s ? '1px solid #0891b2' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 검색 결과 건수 표시 */}
          <div style={{ padding: '7px 14px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            <span>검색 결과: <b style={{ color: 'var(--text-primary)' }}>{filteredList.length}</b>건 (전체 {projects.length}개)</span>
            {selectedProject && (
              <span style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>현재 선택됨 ✓</span>
            )}
          </div>

          {/* 프로젝트 리스트 목록 */}
          <div
            style={{
              maxHeight: '340px',
              overflowY: 'auto',
              padding: '4px 0'
            }}
          >
            {filteredList.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '26px', display: 'block', marginBottom: '8px' }}>🔍</span>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  일치하는 프로젝트가 없습니다.
                </div>
                <div style={{ fontSize: '11.5px', marginTop: '4px' }}>
                  검색어나 연도 필터를 변경해 보세요.
                </div>
              </div>
            ) : (
              filteredList.map(p => {
                const isSelected = String(p.id) === String(selectedProjectId);
                const sDate = p.startDate || p.start_date || '';
                const eDate = p.endDate || p.end_date || '';

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(37, 99, 235, 0.16)' : 'transparent',
                      borderLeft: isSelected ? '4px solid var(--neon-cyan)' : '4px solid transparent',
                      transition: 'all 0.12s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {/* 상단 라인: 제조번호, Site, Line, 선택 상태 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {p.manufacturingNo ? (
                          <span
                            style={{
                              background: 'rgba(37, 99, 235, 0.15)',
                              color: 'var(--neon-cyan)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              border: '1px solid rgba(56, 189, 248, 0.25)'
                            }}
                          >
                            {p.manufacturingNo}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>번호미등록</span>
                        )}
                        <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {normalizeJVName(p.site || '')}{p.line ? ` · ${normalizeJVName(p.line)}` : ''}
                        </span>
                      </div>

                      {isSelected && (
                        <span style={{ color: 'var(--neon-cyan)', fontWeight: 800, fontSize: '12px' }}>
                          ✓ 선택됨
                        </span>
                      )}
                    </div>

                    {/* 프로젝트명 */}
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                      {normalizeJVName(p.name)}
                    </div>

                    {/* 하단 정보: 기간 및 담당자 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      <span>
                        📅 {sDate || '미정'} ~ {eDate || '미정'}
                      </span>
                      {p.pm && (
                        <span>담당: {p.pm}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
