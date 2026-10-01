import React, { useState, useRef, useEffect, useMemo } from 'react';
import { normalizeJVName } from './utils';

/**
 * SmartProjectSelector
 * 수백 개 이상의 프로젝트 중에서도 연도별 필터링과 실시간 다중 키워드 검색을 통해
 * 원하는 프로젝트를 1초 만에 찾아 선택할 수 있는 고성능 스마트 프로젝트 선택기 컴포넌트
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
          padding: compact ? '6px 10px' : '8px 12px',
          background: '#ffffff',
          border: isOpen ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
          borderRadius: '8px',
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : '0 1px 2px rgba(0,0,0,0.05)',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          minHeight: compact ? '34px' : '40px'
        }}
        title={selectedProject ? `${selectedProject.manufacturingNo ? `[${selectedProject.manufacturingNo}] ` : ''}${selectedProject.name}` : placeholder}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
          <span style={{ fontSize: compact ? '13px' : '14px', flexShrink: 0 }}>🏢</span>
          {selectedProject ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {selectedProject.manufacturingNo && (
                <span
                  style={{
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: '1px solid #bfdbfe',
                    flexShrink: 0
                  }}
                >
                  {selectedProject.manufacturingNo}
                </span>
              )}
              <span style={{ fontSize: compact ? '12px' : '13px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {normalizeJVName(selectedProject.name)}
              </span>
              {selectedProject.site && (
                <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>
                  ({selectedProject.site}{selectedProject.line ? ` · ${selectedProject.line}` : ''})
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: compact ? '12px' : '13px', color: '#94a3b8' }}>
              {placeholder}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {selectedProject && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '12px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="선택 해제"
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = '#fee2e2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              ✕
            </button>
          )}
          <span style={{ fontSize: '11px', color: '#64748b', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
            ▼
          </span>
        </div>
      </div>

      {/* 2. 드롭다운 팝오버 */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: compact ? '380px' : '100%',
            minWidth: '320px',
            maxWidth: '540px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* 헤더: 검색창 & 빠른 닫기 */}
          <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1.5px solid #3b82f6', borderRadius: '6px', padding: '6px 10px' }}>
              <span style={{ fontSize: '14px', color: '#3b82f6' }}>🔍</span>
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
                  color: '#1e293b'
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>연도:</span>
              <button
                type="button"
                onClick={() => setYearFilter('ALL')}
                style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: yearFilter === 'ALL' ? 700 : 500,
                  background: yearFilter === 'ALL' ? '#2563eb' : '#ffffff',
                  color: yearFilter === 'ALL' ? '#ffffff' : '#64748b',
                  border: yearFilter === 'ALL' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  cursor: 'pointer'
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
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: yearFilter === yr ? 700 : 500,
                    background: yearFilter === yr ? '#2563eb' : '#ffffff',
                    color: yearFilter === yr ? '#ffffff' : '#64748b',
                    border: yearFilter === yr ? '1px solid #2563eb' : '1px solid #cbd5e1',
                    cursor: 'pointer'
                  }}
                >
                  {yr}년
                </button>
              ))}
            </div>

            {/* Site 필터 바 (Site가 있을 때) */}
            {availableSites.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>Site:</span>
                <button
                  type="button"
                  onClick={() => setSiteFilter('ALL')}
                  style={{
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '10.5px',
                    fontWeight: siteFilter === 'ALL' ? 700 : 500,
                    background: siteFilter === 'ALL' ? '#0891b2' : '#ffffff',
                    color: siteFilter === 'ALL' ? '#ffffff' : '#64748b',
                    border: siteFilter === 'ALL' ? '1px solid #0891b2' : '1px solid #cbd5e1',
                    cursor: 'pointer'
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
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontSize: '10.5px',
                      fontWeight: siteFilter === s ? 700 : 500,
                      background: siteFilter === s ? '#0891b2' : '#ffffff',
                      color: siteFilter === s ? '#ffffff' : '#64748b',
                      border: siteFilter === s ? '1px solid #0891b2' : '1px solid #cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 검색 결과 건수 표시 */}
          <div style={{ padding: '6px 12px', background: '#f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
            <span>검색 결과: <b>{filteredList.length}</b>건 (전체 {projects.length}개)</span>
            {selectedProject && (
              <span style={{ color: '#2563eb', fontWeight: 600 }}>현재 선택됨 ✓</span>
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
              <div style={{ padding: '30px 16px', textAlign: 'center', color: '#94a3b8' }}>
                <span style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }}>🔍</span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                  일치하는 프로젝트가 없습니다.
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
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
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      borderLeft: isSelected ? '4px solid #2563eb' : '4px solid transparent',
                      transition: 'background-color 0.1s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    {/* 상단 라인: 제조번호, Site, Line, 선택 상태 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {p.manufacturingNo ? (
                          <span
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontSize: '11px',
                              fontWeight: 700,
                              border: '1px solid #bae6fd'
                            }}
                          >
                            {p.manufacturingNo}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>번호미등록</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                          {normalizeJVName(p.site || '')}{p.line ? ` · ${normalizeJVName(p.line)}` : ''}
                        </span>
                      </div>

                      {isSelected && (
                        <span style={{ color: '#2563eb', fontWeight: 800, fontSize: '12px' }}>
                          ✓ 선택됨
                        </span>
                      )}
                    </div>

                    {/* 프로젝트명 */}
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#1d4ed8' : '#1e293b', lineHeight: 1.35 }}>
                      {normalizeJVName(p.name)}
                    </div>

                    {/* 하단 정보: 기간 및 담당자 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
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
