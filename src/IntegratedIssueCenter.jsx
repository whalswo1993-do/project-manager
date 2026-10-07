import React, { useState, useEffect, useMemo } from 'react';
import './IntegratedIssueCenter.css';
import {
  getLocalIssues,
  fetchRemoteIssues,
  upsertIssue,
  deleteIssue,
  getRegisteredSiteNames
} from './issueService';
import { exportIssuesExcelReport } from './exportIssueReport';
import { normalizeJVName } from './utils';

export default function IntegratedIssueCenter({
  projects = [],
  sites = [],
  role = 'admin',
  currentCustomer = 'All',
  onPermissionDenied,
  externalNewIssueData = null,
  onClearExternalData = null
}) {
  const [issues, setIssues] = useState(() => getLocalIssues());
  const [isLoading, setIsLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // 뷰 모드: 'all' | 'site' | 'project' | 'knowledge'
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('pm_issue_view_mode') || 'all';
    } catch (e) {
      return 'all';
    }
  });

  // 필터 상태
  const [selectedProcess, setSelectedProcess] = useState('all'); // 'all' | 'stacking' | 'notching'
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all' | 'open' | 'in_progress' | 'resolved'
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState(currentCustomer === 'All' ? 'all' : currentCustomer);

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [activeIssue, setActiveIssue] = useState(null); // 수정 또는 조치 입력 대상
  const [viewDetailModalIssue, setViewDetailModalIssue] = useState(null);

  // 권한
  const canEdit = ['admin', 'grade3', 'grade2'].includes(role);

  useEffect(() => {
    try {
      localStorage.setItem('pm_issue_view_mode', viewMode);
    } catch (e) {}
  }, [viewMode]);

  // 원격 데이터 초기 로드
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      const data = await fetchRemoteIssues();
      if (isMounted) {
        setIssues(data);
        setIsLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, []);

  // 외부(예: 일보 특이사항에서 '이슈 센터로 등록' 클릭 시)에서 전달된 데이터 처리
  useEffect(() => {
    if (externalNewIssueData) {
      openCreateModal(externalNewIssueData);
      if (onClearExternalData) onClearExternalData();
    }
  }, [externalNewIssueData]);


  // 고객사 필터 동기화
  useEffect(() => {
    if (currentCustomer && currentCustomer !== 'All') {
      setSelectedCustomerFilter(currentCustomer);
    }
  }, [currentCustomer]);

  // 사이트 목록: [Site 관리] 및 프로젝트에 등록된 SITE 표시 (임의/비등록 사이트 제외)
  const availableSites = useMemo(() => getRegisteredSiteNames(sites, projects), [sites, projects]);

  // 통계 계산
  const stats = useMemo(() => {
    const total = issues.length;
    const resolved = issues.filter(i => i.status === 'resolved').length;
    const open = issues.filter(i => i.status === 'open').length;
    const inProgress = issues.filter(i => i.status === 'in_progress').length;

    const stacking = issues.filter(i => i.processType === 'stacking');
    const stackingResolved = stacking.filter(i => i.status === 'resolved').length;

    const notching = issues.filter(i => i.processType === 'notching');
    const notchingResolved = notching.filter(i => i.status === 'resolved').length;

    const siteIssues = issues.filter(i => i.issueType === 'site').length;
    const projectIssues = issues.filter(i => i.issueType === 'project').length;

    const resolvedRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    const stackingRate = stacking.length > 0 ? Math.round((stackingResolved / stacking.length) * 100) : 0;
    const notchingRate = notching.length > 0 ? Math.round((notchingResolved / notching.length) * 100) : 0;

    return {
      total,
      resolved,
      open,
      inProgress,
      resolvedRate,
      stackingTotal: stacking.length,
      stackingResolved,
      stackingRate,
      notchingTotal: notching.length,
      notchingResolved,
      notchingRate,
      siteIssues,
      projectIssues
    };
  }, [issues]);

  // 필터링된 이슈 목록
  const filteredIssues = useMemo(() => {
    return issues.filter(item => {
      // 뷰 모드 필터
      if (viewMode === 'site' && item.issueType !== 'site') return false;
      if (viewMode === 'project' && item.issueType !== 'project') return false;
      if (viewMode === 'knowledge' && item.status !== 'resolved') return false;

      // 공정 필터 (스태킹 / 노칭)
      if (selectedProcess !== 'all' && item.processType !== selectedProcess) return false;

      // 상태 필터
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;

      // 사이트 필터 (등록된 SITE명 정확 일치 — SKOH와 SKOH2가 섞이지 않도록)
      if (selectedSiteFilter !== 'all') {
        const itemSiteNorm = normalizeJVName(item.siteName || '').trim().toUpperCase();
        const targetNorm = normalizeJVName(selectedSiteFilter).trim().toUpperCase();
        if (itemSiteNorm !== targetNorm) return false;
      }

      // 고객사 필터
      if (selectedCustomerFilter !== 'all' && item.customer && item.customer !== selectedCustomerFilter) {
        return false;
      }

      // 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = [
          item.title,
          item.symptom,
          item.rootCause,
          item.interimAction,
          item.finalAction,
          item.preventiveAction,
          item.lineName,
          item.siteName,
          item.projectName,
          item.reporter,
          item.assignee,
          item.resolver
        ].filter(Boolean).join(' ').toLowerCase();

        if (!text.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.occurredDate || b.createdAt) - new Date(a.occurredDate || a.createdAt));
  }, [issues, viewMode, selectedProcess, selectedStatus, selectedSiteFilter, selectedCustomerFilter, searchQuery]);

  // 신규 모달 열기
  const openCreateModal = (initialData = {}) => {
    const defaultSite = availableSites[0] || '';
    setActiveIssue({
      id: '',
      issueType: initialData.issueType || 'site',
      siteName: initialData.siteName || defaultSite,
      projectId: initialData.projectId || '',
      projectName: initialData.projectName || '양산 라인 (Mass Production)',
      customer: initialData.customer || (currentCustomer !== 'All' ? currentCustomer : 'SK on'),
      processType: initialData.processType || 'stacking',
      lineName: initialData.lineName || '',
      occurredDate: initialData.occurredDate || new Date().toISOString().slice(0, 10),
      title: initialData.title || '',
      symptom: initialData.symptom || '',
      severity: initialData.severity || 'high',
      status: initialData.status || 'open',
      reporter: initialData.reporter || '',
      assignee: initialData.assignee || '',
      rootCause: initialData.rootCause || '',
      interimAction: initialData.interimAction || '',
      finalAction: initialData.finalAction || '',
      preventiveAction: initialData.preventiveAction || '',
      resolvedDate: initialData.resolvedDate || '',
      resolver: initialData.resolver || '',
      notes: initialData.notes || ''
    });
    setIsModalOpen(true);
  };

  // 수정 모달 열기
  const openEditModal = (issue) => {
    setActiveIssue({ ...issue });
    setIsModalOpen(true);
  };

  // 신속 조치 완료 모달 열기
  const openResolveModal = (issue) => {
    setActiveIssue({
      ...issue,
      status: 'resolved',
      resolvedDate: issue.resolvedDate || new Date().toISOString().slice(0, 10),
      resolver: issue.resolver || issue.assignee || ''
    });
    setIsResolveModalOpen(true);
  };

  // 저장 핸들러
  const handleSaveIssue = async (savedData) => {
    const updated = await upsertIssue(savedData);
    setIssues(updated);
    setIsModalOpen(false);
    setIsResolveModalOpen(false);
    setActiveIssue(null);
    showNotice('이슈 및 조치 내역이 안전하게 저장·동기화되었습니다.');
  };

  // 삭제 핸들러
  const handleDeleteIssue = async (issueId) => {
    if (!window.confirm('정말 이 이슈 항목을 삭제하시겠습니까? (삭제 후 복구할 수 없습니다)')) return;
    const updated = await deleteIssue(issueId);
    setIssues(updated);
    showNotice('이슈 항목이 삭제되었습니다.');
  };

  const showNotice = (text) => {
    setSyncMsg(text);
    setTimeout(() => setSyncMsg(''), 4000);
  };

  // 엑셀 보고서 다운로드 (ExcelJS 기반 기업 보고서 스타일)
  const handleExportExcel = async () => {
    if (filteredIssues.length === 0) {
      alert('내보낼 이슈 데이터가 없습니다.');
      return;
    }

    try {
      const filterInfo = {
        site: selectedSiteFilter === 'all' ? '전체' : selectedSiteFilter,
        process: selectedProcess === 'stacking' ? '스태킹 (Stacking)' : selectedProcess === 'notching' ? '노칭 (Notching)' : '전체',
        status: selectedStatus === 'resolved' ? '조치완료' : selectedStatus === 'in_progress' ? '조치진행중' : selectedStatus === 'open' ? '발생/접수' : '전체',
        query: searchQuery.trim() || '없음'
      };
      await exportIssuesExcelReport(filteredIssues, filterInfo);
      showNotice('📊 시인성 높은 엑셀 보고서가 다운로드되었습니다.');
    } catch (e) {
      console.error('Excel export error:', e);
      alert('엑셀 다운로드 중 오류가 발생했습니다: ' + e.message);
    }
  };

  return (
    <div className="integrated-issue-center">
      {/* 1. KPI 카드 그리드 (중복 헤더 박스를 제거하고 바로 배치하여 화면 개방감 극대화) */}
      <div className="iic-kpi-grid">
        <div className="iic-kpi-card">
          <div className="iic-kpi-label">전체 등록 이슈</div>
          <div className="iic-kpi-value">{stats.total}<span>건</span></div>
          <div className="iic-kpi-sub">
            <span className="dot-red"></span> 발생 {stats.open} · <span className="dot-yellow"></span> 조치중 {stats.inProgress} · <span className="dot-green"></span> 완료 {stats.resolved}
          </div>
        </div>

        <div className="iic-kpi-card kpi-stacking">
          <div className="iic-kpi-label">
            <span className="badge-proc stacking">🟦 스태킹 (Stacking)</span>
          </div>
          <div className="iic-kpi-value">{stats.stackingTotal}<span>건</span></div>
          <div className="iic-kpi-sub">
            조치 완료 {stats.stackingResolved}건 <b className="rate-text">({stats.stackingRate}%)</b>
          </div>
        </div>

        <div className="iic-kpi-card kpi-notching">
          <div className="iic-kpi-label">
            <span className="badge-proc notching">🟧 노칭 (Notching)</span>
          </div>
          <div className="iic-kpi-value">{stats.notchingTotal}<span>건</span></div>
          <div className="iic-kpi-sub">
            조치 완료 {stats.notchingResolved}건 <b className="rate-text">({stats.notchingRate}%)</b>
          </div>
        </div>

        <div className="iic-kpi-card">
          <div className="iic-kpi-label">분류별 현황</div>
          <div className="iic-kpi-value split-val">
            <span title="사이트(양산/법인) 이슈">🏭 사이트 {stats.siteIssues}</span>
            <span className="sep">/</span>
            <span title="프로젝트 이슈">📂 PJT {stats.projectIssues}</span>
          </div>
          <div className="iic-kpi-sub">
            전체 조치 완료율 <b className="rate-text">{stats.resolvedRate}%</b>
          </div>
        </div>
      </div>

      {/* 2. 네비게이션 뷰 탭 & 필터 툴바 (사이트 드롭다운 + 엑셀/신규이슈 시인성 강화) */}
      <div className="iic-controls-bar">
        {/* 상단 탭 및 우측 주요 액션 버튼 바 */}
        <div className="iic-toolbar-header-row">
          <div className="iic-view-tabs">
            <button
              type="button"
              className={`iic-view-tab ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
            >
              🌐 전체 통합 보기
            </button>
            <button
              type="button"
              className={`iic-view-tab ${viewMode === 'site' ? 'active' : ''}`}
              onClick={() => setViewMode('site')}
            >
              🏭 사이트별 이슈 (양산/법인)
            </button>
            <button
              type="button"
              className={`iic-view-tab ${viewMode === 'project' ? 'active' : ''}`}
              onClick={() => setViewMode('project')}
            >
              📂 프로젝트별 이슈
            </button>
            <button
              type="button"
              className={`iic-view-tab tab-knowledge ${viewMode === 'knowledge' ? 'active' : ''}`}
              onClick={() => setViewMode('knowledge')}
              title="과거 동일/유사 문제 해결 사례 및 재발방지 가이드 검색"
            >
              💡 재발 방지 지식베이스 ({stats.resolved}건)
            </button>
          </div>

          <div className="iic-top-action-buttons">
            {syncMsg && <span className="iic-sync-toast">{syncMsg}</span>}
            <button
              type="button"
              className="iic-btn iic-btn-excel-prominent"
              onClick={handleExportExcel}
              title="현재 필터링된 이슈 목록 및 상세 조치 이력을 고품질 서식 엑셀 보고서로 다운로드합니다"
            >
              📊 엑셀 보고서 다운로드
            </button>
            <button
              type="button"
              className="iic-btn iic-btn-new-prominent"
              onClick={() => {
                if (!canEdit) {
                  if (onPermissionDenied) onPermissionDenied('이슈 등록');
                  else alert('등록 권한이 없습니다.');
                  return;
                }
                openCreateModal();
              }}
            >
              ➕ 신규 이슈 등록
            </button>
          </div>
        </div>

        {/* 상세 필터 행: 전체 SITE 드롭다운 + 공정 토글 + 상태 + 검색 */}
        <div className="iic-filter-row">
          {/* 1. 전체 SITE 드롭다운 ([Site 관리]에 등록된 SITE만 표시) */}
          <div className="iic-filter-group site-dropdown-group">
            <span className="filter-label">🏢 전체 SITE:</span>
            <select
              className="iic-select site-select-prominent"
              value={selectedSiteFilter}
              onChange={(e) => setSelectedSiteFilter(e.target.value)}
              title="등록된 전체 SITE를 선택하여 해당 사이트의 이슈만 필터링합니다"
            >
              <option value="all">🌐 전체 사이트 ({availableSites.length}개소)</option>
              {availableSites.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {selectedSiteFilter !== 'all' && (
              <button
                type="button"
                className="site-clear-btn"
                onClick={() => setSelectedSiteFilter('all')}
                title="사이트 필터 초기화"
              >
                ✕ 해제
              </button>
            )}
          </div>

          {/* 2. 공정 선택 토글 (스태킹 / 노칭) */}
          <div className="iic-filter-group process-filter-group">
            <span className="filter-label">공정:</span>
            <button
              type="button"
              className={`proc-pill ${selectedProcess === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedProcess('all')}
            >
              전체
            </button>
            <button
              type="button"
              className={`proc-pill pill-stacking ${selectedProcess === 'stacking' ? 'active' : ''}`}
              onClick={() => setSelectedProcess('stacking')}
            >
              🟦 스태킹 ({stats.stackingTotal})
            </button>
            <button
              type="button"
              className={`proc-pill pill-notching ${selectedProcess === 'notching' ? 'active' : ''}`}
              onClick={() => setSelectedProcess('notching')}
            >
              🟧 노칭 ({stats.notchingTotal})
            </button>
          </div>

          {/* 3. 상태 필터 */}
          {viewMode !== 'knowledge' && (
            <div className="iic-filter-group">
              <span className="filter-label">상태:</span>
              <select
                className="iic-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">전체 상태</option>
                <option value="open">🔴 발생/접수</option>
                <option value="in_progress">🟡 조치 진행중</option>
                <option value="resolved">🟢 조치 완료</option>
              </select>
            </div>
          )}

          {/* 4. 검색 입력창 */}
          <div className="iic-search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder={viewMode === 'knowledge' ? "유사 증상, 원인, 조치 부품 검색 (예: 진공, 커터, 텐션, 센서)..." : "이슈명, 증상, 원인, 조치내용, 조치자 검색..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. 이슈 목록 뷰 (카드 리스트) */}
      <div className="iic-content-area">
        {filteredIssues.length === 0 ? (
          <div className="iic-empty-state">
            <div className="empty-icon">📂</div>
            <h4>조회된 이슈 내역이 없습니다</h4>
            <p>
              {searchQuery || selectedProcess !== 'all' || selectedStatus !== 'all' || selectedSiteFilter !== 'all'
                ? '선택된 필터 조건(SITE, 공정, 상태 등)에 해당하는 이슈가 없습니다. 필터를 초기화해 보세요.'
                : '아직 등록된 이슈가 없습니다. 상단의 [+ 신규 이슈 등록] 버튼을 눌러 첫 이슈를 기록해보세요.'}
            </p>
            {(searchQuery || selectedProcess !== 'all' || selectedStatus !== 'all' || selectedSiteFilter !== 'all') && (
              <button
                type="button"
                className="iic-btn iic-btn-subtle"
                onClick={() => {
                  setSelectedProcess('all');
                  setSelectedStatus('all');
                  setSelectedSiteFilter('all');
                  setSearchQuery('');
                }}
              >
                필터 전체 초기화
              </button>
            )}
          </div>
        ) : (
          <div className="iic-issues-grid">
            {filteredIssues.map((issue) => (
              <div
                key={issue.id}
                className={`iic-issue-card ${issue.status === 'resolved' ? 'is-resolved' : ''} proc-${issue.processType}`}
              >
                {/* 카드 상단 헤더 */}
                <div className="card-top-bar">
                  <div className="card-tags">
                    <span className={`tag-type ${issue.issueType}`}>
                      {issue.issueType === 'site' ? '🏭 사이트(양산)' : '📂 프로젝트'}
                    </span>
                    <span className={`tag-proc ${issue.processType}`}>
                      {issue.processType === 'stacking' ? '🟦 스태킹' : issue.processType === 'notching' ? '🟧 노칭' : '⚙️ 공통'}
                    </span>
                    {issue.severity && (
                      <span className={`tag-severity ${issue.severity}`}>
                        {issue.severity === 'critical' ? '🚨 긴급' : issue.severity === 'high' ? '⚠️ 높음' : '보통'}
                      </span>
                    )}
                  </div>

                  <div className="card-status-badge">
                    {issue.status === 'resolved' ? (
                      <span className="badge-status resolved">🟢 조치완료</span>
                    ) : issue.status === 'in_progress' ? (
                      <span className="badge-status in-progress">🟡 조치 진행중</span>
                    ) : (
                      <span className="badge-status open">🔴 접수/발생</span>
                    )}
                  </div>
                </div>

                {/* 카드 본문 타이틀 & 메타정보 */}
                <div className="card-body">
                  <h4 className="card-title" onClick={() => setViewDetailModalIssue(issue)}>
                    {issue.title}
                  </h4>

                  <div className="card-meta">
                    <span className="meta-site">📍 SITE: <b className="highlight-site">{normalizeJVName(issue.siteName || '')}</b></span>
                    {issue.projectName && issue.projectName !== '양산 라인 (Mass Production)' && (
                      <span className="meta-proj">📂 {normalizeJVName(issue.projectName)}</span>
                    )}
                    {issue.lineName && <span className="meta-line">⚙️ {issue.lineName}</span>}
                    <span className="meta-date">📅 발생: {issue.occurredDate}</span>
                  </div>

                  {/* 증상 요약 */}
                  <div className="card-section symptom-section">
                    <div className="section-title">🚨 현상 / 증상</div>
                    <div className="section-text">{issue.symptom || '기재된 상세 증상 없음'}</div>
                  </div>

                  {/* 조치 내용 하이라이트 (조치완료된 경우) */}
                  {issue.status === 'resolved' ? (
                    <div className="card-section resolved-summary-section">
                      <div className="resolved-summary-header">
                        <span>✅ <b>대응 완료 내용</b> ({issue.resolver ? `${issue.resolver} · ` : ''}{issue.resolvedDate || '완료'})</span>
                      </div>
                      {issue.rootCause && (
                        <div className="summary-line">
                          <b className="label">원인:</b> {issue.rootCause}
                        </div>
                      )}
                      <div className="summary-line">
                        <b className="label">조치:</b> {issue.finalAction || issue.interimAction || '조치 완료'}
                      </div>
                      {issue.preventiveAction && (
                        <div className="summary-line preventive">
                          <b className="label">재발방지:</b> {issue.preventiveAction}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 미완료 시 원인 분석 또는 임시 조치 상태 */
                    (issue.rootCause || issue.interimAction) && (
                      <div className="card-section ongoing-summary-section">
                        {issue.rootCause && <div><b>원인 분석:</b> {issue.rootCause}</div>}
                        {issue.interimAction && <div><b>임시 조치:</b> {issue.interimAction}</div>}
                      </div>
                    )
                  )}
                </div>

                {/* 카드 푸터: 담당자 & 액션 버튼 */}
                <div className="card-footer">
                  <div className="footer-assignee">
                    {issue.assignee ? (
                      <span>👤 담당: <b>{issue.assignee}</b></span>
                    ) : issue.reporter ? (
                      <span>✍️ 등록: {issue.reporter}</span>
                    ) : (
                      <span>-</span>
                    )}
                  </div>

                  <div className="footer-actions">
                    {/* 미완료 시 원클릭 조치 결과 기재 버튼 (핵심!) */}
                    {issue.status !== 'resolved' && (
                      <button
                        type="button"
                        className="btn-quick-resolve"
                        onClick={() => openResolveModal(issue)}
                        title="이슈 원인 분석 및 대응 완료 내용을 기재하고 완료 처리합니다"
                      >
                        ⚡ 조치결과 기재
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-card-action"
                      onClick={() => setViewDetailModalIssue(issue)}
                      title="상세 내역 전체 보기"
                    >
                      상세
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          className="btn-card-action"
                          onClick={() => openEditModal(issue)}
                          title="수정"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn-card-action btn-del"
                          onClick={() => handleDeleteIssue(issue.id)}
                          title="삭제"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. 신규 등록 / 전체 수정 모달 */}
      {isModalOpen && activeIssue && (
        <IssueEditModal
          issue={activeIssue}
          projects={projects}
          availableSites={availableSites}
          onSave={handleSaveIssue}
          onClose={() => { setIsModalOpen(false); setActiveIssue(null); }}
        />
      )}

      {/* 5. 조치 결과 전용 간편 모달 (엔지니어 완료 기재용) */}
      {isResolveModalOpen && activeIssue && (
        <IssueResolveModal
          issue={activeIssue}
          onSave={handleSaveIssue}
          onClose={() => { setIsResolveModalOpen(false); setActiveIssue(null); }}
        />
      )}

      {/* 6. 이슈 상세 뷰 모달 */}
      {viewDetailModalIssue && (
        <IssueDetailModal
          issue={viewDetailModalIssue}
          onClose={() => setViewDetailModalIssue(null)}
          onEdit={() => {
            const cur = viewDetailModalIssue;
            setViewDetailModalIssue(null);
            openEditModal(cur);
          }}
          onResolve={() => {
            const cur = viewDetailModalIssue;
            setViewDetailModalIssue(null);
            openResolveModal(cur);
          }}
        />
      )}
    </div>
  );
}

// ========================================================
// Sub-Modal 1: 신규 이슈 등록 및 전체 수정 모달
// ========================================================
function IssueEditModal({ issue, projects, availableSites, onSave, onClose }) {
  const [form, setForm] = useState({ ...issue });

  const handleChange = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('이슈 제목을 입력해주세요.');
      return;
    }
    if (!form.siteName.trim()) {
      alert('SITE/법인명을 선택하거나 입력해주세요.');
      return;
    }
    onSave(form);
  };

  return (
    <div className="iic-modal-overlay" onClick={onClose}>
      <div className="iic-modal-box" onClick={e => e.stopPropagation()}>
        <div className="iic-modal-header">
          <h3>{form.id ? '✏️ 이슈 수정 및 갱신' : '➕ 신규 이슈 등록 (스태킹/노칭 · SITE/프로젝트)'}</h3>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="iic-modal-form">
          {/* 분류 및 공정 선택 행 */}
          <div className="form-row-2">
            <div className="form-group">
              <label>이슈 분류 *</label>
              <div className="segmented-toggle">
                <button
                  type="button"
                  className={form.issueType === 'site' ? 'active' : ''}
                  onClick={() => {
                    handleChange('issueType', 'site');
                    if (!form.projectName) handleChange('projectName', '양산 라인 (Mass Production)');
                  }}
                >
                  🏭 사이트(양산/법인) 이슈
                </button>
                <button
                  type="button"
                  className={form.issueType === 'project' ? 'active' : ''}
                  onClick={() => handleChange('issueType', 'project')}
                >
                  📂 프로젝트 연계 이슈
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>공정 선택 (핵심) *</label>
              <div className="segmented-toggle proc-toggle">
                <button
                  type="button"
                  className={`btn-stacking ${form.processType === 'stacking' ? 'active' : ''}`}
                  onClick={() => handleChange('processType', 'stacking')}
                >
                  🟦 스태킹 (Stacking)
                </button>
                <button
                  type="button"
                  className={`btn-notching ${form.processType === 'notching' ? 'active' : ''}`}
                  onClick={() => handleChange('processType', 'notching')}
                >
                  🟧 노칭 (Notching)
                </button>
              </div>
            </div>
          </div>

          {/* 사이트 드롭다운 및 선택 */}
          <div className="form-row-2">
            <div className="form-group">
              <label>SITE / 법인 선택 *</label>
              <select
                value={form.siteName}
                onChange={e => handleChange('siteName', e.target.value)}
                required
                className="modal-site-select"
              >
                <option value="">-- SITE 선택 --</option>
                {/* 과거에 등록된 이슈의 SITE가 현재 목록에 없더라도 수정 시 값이 사라지지 않도록 유지 */}
                {form.siteName && !availableSites.includes(form.siteName) && (
                  <option value={form.siteName}>{form.siteName}</option>
                )}
                {availableSites.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {/* 빠른 선택 칩 */}
              <div className="site-quick-chips">
                {availableSites.slice(0, 10).map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`chip-btn ${form.siteName === s ? 'active' : ''}`}
                    onClick={() => handleChange('siteName', s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>{form.issueType === 'project' ? '프로젝트 선택 *' : '프로젝트명 / 양산 구분'}</label>
              {form.issueType === 'project' ? (
                <select
                  value={form.projectId}
                  onChange={e => {
                    const selId = e.target.value;
                    const p = projects.find(item => String(item.id) === String(selId));
                    handleChange('projectId', selId);
                    if (p) {
                      handleChange('projectName', p.name);
                      if (p.site) handleChange('siteName', normalizeJVName(p.site));
                      if (p.customer) handleChange('customer', p.customer);
                    }
                  }}
                  required
                >
                  <option value="">-- 프로젝트 선택 --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.site || p.customer || '미지정'})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="예: 양산 라인 (Mass Production), 2라인 양산..."
                  value={form.projectName}
                  onChange={e => handleChange('projectName', e.target.value)}
                />
              )}
            </div>
          </div>

          {/* 설비 호기, 발생일자, 긴급도 */}
          <div className="form-row-3">
            <div className="form-group">
              <label>설비 호기 / 라인명</label>
              <input
                type="text"
                placeholder="예: 스태커 3호기, 노칭 1호기..."
                value={form.lineName}
                onChange={e => handleChange('lineName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>발생 일자 *</label>
              <input
                type="date"
                value={form.occurredDate}
                onChange={e => handleChange('occurredDate', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>중요도 / 긴급도</label>
              <select
                value={form.severity}
                onChange={e => handleChange('severity', e.target.value)}
              >
                <option value="critical">🚨 긴급 (라인 정지 / 중대 품질 불량)</option>
                <option value="high">⚠️ 높음 (반복 알람 / 수율 저하)</option>
                <option value="medium">보통 (간헐적 발생 / 점검 요망)</option>
                <option value="low">낮음 (단순 확인 / 경미)</option>
              </select>
            </div>
          </div>

          {/* 제목 및 상세 증상 */}
          <div className="form-group">
            <label>이슈 제목 (핵심 요약) *</label>
            <input
              type="text"
              placeholder="예: 매거진 셀 로딩 시 진공 센서 알람 및 불완전 흡착"
              value={form.title}
              onChange={e => handleChange('title', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>상세 현상 및 증상 (Symptom) *</label>
            <textarea
              rows={3}
              placeholder="발생한 문제의 구체적인 현상, 에러 코드, 알람 빈도, 측정값 등을 상세히 기재해주세요."
              value={form.symptom}
              onChange={e => handleChange('symptom', e.target.value)}
            />
          </div>

          {/* 담당자 및 등록자 */}
          <div className="form-row-2">
            <div className="form-group">
              <label>등록자 (작성자 / 법인 담당자)</label>
              <input
                type="text"
                placeholder="예: 현장 홍길동 기사"
                value={form.reporter}
                onChange={e => handleChange('reporter', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>대응 담당자 ({form.processType === 'stacking' ? '스태킹 담당' : '노칭 담당'})</label>
              <input
                type="text"
                placeholder={`예: ${form.processType === 'stacking' ? '스태킹' : '노칭'} 김수석, 설비기술 박책임`}
                value={form.assignee}
                onChange={e => handleChange('assignee', e.target.value)}
              />
            </div>
          </div>

          {/* 🌟 조치 및 대응 이력 섹션 (완료 시 또는 진행 중 기재) */}
          <div className="form-collapsible-section">
            <div className="section-legend">
              <span>🛠️ 대응 및 조치 이력 (완료 시 필수 기재)</span>
              <div className="status-radio-group">
                <label className={form.status === 'open' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="modal-status"
                    checked={form.status === 'open'}
                    onChange={() => handleChange('status', 'open')}
                  /> 접수/발생
                </label>
                <label className={form.status === 'in_progress' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="modal-status"
                    checked={form.status === 'in_progress'}
                    onChange={() => handleChange('status', 'in_progress')}
                  /> 조치 진행중
                </label>
                <label className={form.status === 'resolved' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="modal-status"
                    checked={form.status === 'resolved'}
                    onChange={() => {
                      handleChange('status', 'resolved');
                      if (!form.resolvedDate) handleChange('resolvedDate', new Date().toISOString().slice(0, 10));
                    }}
                  /> 조치 완료
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>근본 원인 분석 (Root Cause)</label>
              <input
                type="text"
                placeholder="예: 진공 패드 실리콘 마모 및 필터 내 분진 퇴적, 나이프 클리어런스 벌어짐 등"
                value={form.rootCause}
                onChange={e => handleChange('rootCause', e.target.value)}
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>긴급 / 임시 조치 사항</label>
                <textarea
                  rows={2}
                  placeholder="현장에서 즉시 취한 응급 조치 내용"
                  value={form.interimAction}
                  onChange={e => handleChange('interimAction', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>최종 대응 및 조치 내용 (어떻게 대응했는지 상세) *</label>
                <textarea
                  rows={2}
                  placeholder="부품 교체, 파라미터 재세팅, 갭 조정, 프로그램 수정 등 실제 해결 방법"
                  value={form.finalAction}
                  onChange={e => handleChange('finalAction', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>🌟 재발 방지 대책 (Preventive Action - 동일 이슈 방지)</label>
              <textarea
                rows={2}
                placeholder="향후 동일 문제 재발 방지를 위한 점검 주기 반영, 체크리스트 등록, 표준화 지침 등"
                value={form.preventiveAction}
                onChange={e => handleChange('preventiveAction', e.target.value)}
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>조치 완료자</label>
                <input
                  type="text"
                  placeholder="예: 홍길동 책임 (스태킹)"
                  value={form.resolver}
                  onChange={e => handleChange('resolver', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>조치 완료일자</label>
                <input
                  type="date"
                  value={form.resolvedDate}
                  onChange={e => handleChange('resolvedDate', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="iic-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>취소</button>
            <button type="submit" className="btn-submit">
              {form.id ? '수정 사항 저장' : '이슈 등록 완료'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========================================================
// Sub-Modal 2: 조치 결과 전용 빠른 입력 모달 (담당자 완료 기재)
// ========================================================
function IssueResolveModal({ issue, onSave, onClose }) {
  const [form, setForm] = useState({
    ...issue,
    status: 'resolved',
    resolvedDate: issue.resolvedDate || new Date().toISOString().slice(0, 10),
    resolver: issue.resolver || issue.assignee || ''
  });

  const handleChange = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.finalAction.trim() && !form.rootCause.trim()) {
      alert('원인 분석 또는 조치 대응 내용을 입력해주세요.');
      return;
    }
    onSave(form);
  };

  return (
    <div className="iic-modal-overlay" onClick={onClose}>
      <div className="iic-modal-box modal-resolve-compact" onClick={e => e.stopPropagation()}>
        <div className="iic-modal-header resolve-header">
          <div>
            <h3>⚡ 조치 결과 및 재발방지 기재</h3>
            <p className="sub-title">[{issue.processType === 'stacking' ? '스태킹' : '노칭'}] {issue.title}</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="iic-modal-form">
          <div className="resolve-info-banner">
            <div>📍 SITE: <b>{normalizeJVName(issue.siteName || '')}</b> {issue.lineName ? `(${issue.lineName})` : ''}</div>
            <div>🚨 증상: {issue.symptom}</div>
          </div>

          <div className="form-group">
            <label>1. 근본 원인 분석 (Root Cause) *</label>
            <textarea
              rows={2}
              placeholder="문제가 발생한 직접적/간접적 근본 원인을 분석하여 기재해주세요."
              value={form.rootCause}
              onChange={e => handleChange('rootCause', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>2. 최종 대응 및 해결 조치 내용 (어떻게 대응했는가) *</label>
            <textarea
              rows={3}
              placeholder="현장에서 어떻게 대응하여 문제를 해결했는지 구체적인 방법(부품 교체, 파라미터 수치, 세팅값 등)을 기재해주세요."
              value={form.finalAction}
              onChange={e => handleChange('finalAction', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>3. 재발 방지 대책 (Preventive Action) *</label>
            <textarea
              rows={2}
              placeholder="동일한 문제가 다른 라인이나 차후에 재발하지 않도록 하기 위한 방안(점검 주기 등록, 센서 보정 루틴 등)"
              value={form.preventiveAction}
              onChange={e => handleChange('preventiveAction', e.target.value)}
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>조치 담당자 (엔지니어/소속) *</label>
              <input
                type="text"
                placeholder="예: 홍길동 책임 (스태킹 담당)"
                value={form.resolver}
                onChange={e => handleChange('resolver', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>조치 완료 일자 *</label>
              <input
                type="date"
                value={form.resolvedDate}
                onChange={e => handleChange('resolvedDate', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="iic-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>닫기</button>
            <button type="submit" className="btn-submit btn-resolve-complete">
              🟢 조치 완료 및 지식베이스 반영
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========================================================
// Sub-Modal 3: 이슈 상세 보기 모달
// ========================================================
function IssueDetailModal({ issue, onClose, onEdit, onResolve }) {
  return (
    <div className="iic-modal-overlay" onClick={onClose}>
      <div className="iic-modal-box modal-detail" onClick={e => e.stopPropagation()}>
        <div className="iic-modal-header">
          <div className="detail-tags">
            <span className={`tag-proc ${issue.processType}`}>
              {issue.processType === 'stacking' ? '🟦 스태킹' : '🟧 노칭'}
            </span>
            <span className={`badge-status ${issue.status}`}>
              {issue.status === 'resolved' ? '🟢 조치완료' : issue.status === 'in_progress' ? '🟡 조치중' : '🔴 접수'}
            </span>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="detail-content">
          <h2 className="detail-title">{issue.title}</h2>
          <div className="detail-meta-grid">
            <div><span className="lbl">구분:</span> {issue.issueType === 'site' ? '🏭 사이트(양산)' : '📂 프로젝트'}</div>
            <div><span className="lbl">SITE:</span> <b>{normalizeJVName(issue.siteName || '')}</b></div>
            <div><span className="lbl">라인/호기:</span> {issue.lineName || '-'}</div>
            <div><span className="lbl">발생일자:</span> {issue.occurredDate}</div>
            <div><span className="lbl">등록자:</span> {issue.reporter || '-'}</div>
            <div><span className="lbl">담당자:</span> {issue.assignee || '-'}</div>
          </div>

          <div className="detail-block">
            <h4>🚨 현상 및 상세 증상</h4>
            <p>{issue.symptom || '상세 내용 없음'}</p>
          </div>

          {issue.rootCause && (
            <div className="detail-block">
              <h4>🔍 원인 분석 (Root Cause)</h4>
              <p>{issue.rootCause}</p>
            </div>
          )}

          {issue.interimAction && (
            <div className="detail-block">
              <h4>⚡ 긴급/임시 조치</h4>
              <p>{issue.interimAction}</p>
            </div>
          )}

          <div className="detail-block highlight-action">
            <h4>✅ 최종 대응 및 해결 조치</h4>
            <p>{issue.finalAction || (issue.status === 'resolved' ? '조치 완료' : '조치 진행 중입니다.')}</p>
          </div>

          {issue.preventiveAction && (
            <div className="detail-block highlight-prevent">
              <h4>🛡️ 재발 방지 대책 (Preventive Action)</h4>
              <p>{issue.preventiveAction}</p>
            </div>
          )}

          {issue.status === 'resolved' && (
            <div className="detail-resolver-info">
              <span>조치 완료일: <b>{issue.resolvedDate}</b></span>
              <span>조치 완료자: <b>{issue.resolver || issue.assignee || '담당 엔지니어'}</b></span>
            </div>
          )}
        </div>

        <div className="iic-modal-actions">
          {issue.status !== 'resolved' && (
            <button type="button" className="btn-resolve-complete" onClick={onResolve}>
              ⚡ 조치결과 기재
            </button>
          )}
          <button type="button" className="btn-card-action" onClick={onEdit}>수정</button>
          <button type="button" className="btn-cancel" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
