import { Fragment, useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from './icons';
import './Quotations.css';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';
import { analyzeWorkbook, analyzePastedText, buildQuotations } from './quotationParser';
import { PasteZone, PasteEntry } from './PasteZone';

// 품목 구분 (견적 라인 대분류 + 상세 리스트 품목 구분). 화면 필터 순서이기도 하다.
const CATEGORY_ORDER = ['가공품', '시장품', '잡자재', '기구 SET', '인건비', '경비', '프로그램', '차감', '기타'];
const CATEGORY_ICON = { '가공품': '', '시장품': '', '잡자재': '', '기구 SET': '', '인건비': '', '경비': '', '프로그램': '', '차감': '', '기타': '' };
function normalizeCategory(raw) {
    const c = String(raw || '').trim();
    if (/가공/.test(c)) return '가공품';
    if (/구매|시장|상용/.test(c)) return '시장품';
    if (CATEGORY_ORDER.includes(c)) return c;
    return '기타';
}
const categoryBadgeClass = (cat) => (cat === '가공품' ? 'process' : cat === '시장품' ? 'purchase' : 'other');
const fmtKRW = (n) => (n === null || n === undefined || n === '' ? '-' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
const revisionNumber = (rev) => { const m = String(rev || '').match(/(\d+)/); return m ? Number(m[1]) : -1; };

const normTitle = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

// 이미 등록된 견적 중 이번 데이터가 이어서 들어갈 대상 찾기
// - 견적번호가 있으면: 같은 견적번호+제목 중 같은 리비전 (리비전 정보가 없으면 가장 최신 것). 리비전이 다르면 새로 등록
// - 견적번호가 없으면(상세 리스트만 붙여넣은 경우): 같은 프로젝트명(제목)의 가장 최신 견적에 추가
function findExistingQuotation(q, title, quotations) {
    const t = normTitle(title);
    const latestFirst = (a, b) => (revisionNumber(b.revision) - revisionNumber(a.revision)) || (new Date(b.created_at) - new Date(a.created_at));
    if (q.quote_no) {
        const same = quotations.filter(e => e.quote_no === q.quote_no && normTitle(e.title) === t).sort(latestFirst);
        if (q.revision) return same.find(e => e.revision === q.revision) || null;
        return same[0] || null;
    }
    return quotations.filter(e => normTitle(e.title) === t).sort(latestFirst)[0] || null;
}

// 등록된 견적의 견적 라인을 파서 입력 형태로 되돌린다 → 상세 리스트만 붙여넣어도 견적 단가와 연결·검증된다
function existingLinesAnalysis(target, items) {
    const lines = items
        .filter(it => it.quotation_id === target.id && it.source === 'quotation')
        .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
        .map(it => ({
            source: 'quotation', section: it.section || '', category: it.item_category, item_name: it.item_name,
            group: it.item_name, sub: '', discipline: it.spec || null, unit_name: it.unit_name || '', uom: it.uom || '',
            quantity: Number(it.quantity), unit_price: Number(it.unit_price), total_price: Number(it.total_price), remark: it.remark || '', row: null,
        }));
    if (!lines.length) return null;
    return { kind: 'quotation', sheetName: '등록된 견적', meta: { projectName: target.title, quoteNo: target.quote_no || undefined }, lines, sections: [], totals: {}, fromExisting: true };
}

// 견적서 내용의 프로젝트명 → 등록된 프로젝트와 이름(공백·대소문자 무시)이 같거나 제조번호가 들어 있으면 연결,
// 아니면 그 프로젝트명 그대로 견적 프로젝트로 묶는다. (사용자가 고르거나 입력하지 않는다)
function resolveQuotationProject(title, projects = []) {
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
    const t = norm(title);
    const match = t && projects.find(p => (p.name && norm(p.name) === t) || (p.manufacturing_no && norm(p.manufacturing_no).length >= 4 && t.includes(norm(p.manufacturing_no))));
    return match
        ? { projectId: match.id, projectName: null, linkedLabel: match.manufacturing_no ? `${match.manufacturing_no} · ${match.name}` : match.name }
        : { projectId: null, projectName: String(title || '').trim(), linkedLabel: null };
}

export default function Quotations(props) {
    const canManage = ['admin', 'grade3'].includes(props.role);
    if (!canManage) return <QuotationsAccessDenied />;
    return <QuotationsManager {...props} />;
}

function QuotationsAccessDenied() {
    return (
            <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--bg-card, var(--surface))', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle, var(--border-faint))', margin: '40px auto', maxWidth: '440px', boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.06))' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--bad-wash)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: '28px' }}><Icon name="lock" size="1.1em" /></div>
                <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary, var(--brand))', margin: '0 0 12px' }}>견적 관리 접근 권한 제한</h3>
                <p style={{ fontSize: '14.5px', color: 'var(--text-secondary, var(--brand))', lineHeight: 1.65, margin: '0 0 20px' }}>
                    견적 조회 및 관리 기능은 <b>Grade 3(PM/소장) 이상</b> 등급만 이용할 수 있습니다.<br />
                    해당 기능을 이용하시려면 운영자에게 권한을 부여받으시기 바랍니다.
                </p>
                <div style={{ background: 'var(--bg-card-subtle, var(--bg-card-subtle))', border: '1px solid var(--border-medium, var(--border-subtle))', borderRadius: 'var(--radius-xl)', padding: '16px 20px', textAlign: 'left', fontSize: '13.5px', color: 'var(--text-secondary, var(--brand))', margin: '0 auto' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary, var(--brand))', marginBottom: '10px', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span><Icon name="info" size="1.1em" /></span><span>권한 부여 및 시스템 문의</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: 1.6 }}>
                        <div>• 담당자: 조민재 선임 (PM팀)</div>
                        <div>• E-mail: cmj1012@twgroup.co.kr</div>
                        <div>• Tel: +82 10 5506 8739</div>
                    </div>
                </div>
            </div>
    );
}

// 저장 전 미리보기: 분석된 품목·단가와 정합성 검증 결과를 보여주고, 제목을 고친 뒤 저장한다
function QuotationPreview({ draft, preview, titleOverrides, setTitleOverrides, previewOpen, setPreviewOpen, projects, quotations, onRemoveSource, onSave, onReset, busy, canManage }) {
    const chip = (text, tone = 'neutral') => {
        const tones = {
            neutral: { background: 'var(--bg-card-subtle)', color: 'var(--text-secondary)' },
            ok: { background: 'var(--ok-wash)', color: 'var(--ok)' },
            error: { background: 'var(--bad-wash)', color: 'var(--bad)' },
            warn: { background: 'var(--warn-wash)', color: 'var(--warn)' },
        };
        return <span style={{ ...tones[tone], borderRadius: 'var(--radius-xs)', padding: '2px 8px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{text}</span>;
    };

    return (
        <div style={{ marginTop: '14px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px 16px', background: 'var(--bg-card, var(--surface))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}><Icon name="list" size="1.1em" /> 저장 전 미리보기</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        {draft.fileName ? `파일: ${draft.fileName}` : '표 붙여넣기 — 다른 시트를 계속 붙여넣으면 아래에 합쳐집니다'} · 원본 파일은 서버에 저장하지 않습니다
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {draft.analyses.map((a, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '2px 4px 2px 10px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                                <Icon name={a.kind === 'quotation' ? 'receipt' : 'list'} size={13} /> {a.sheetName} · {a.kind === 'quotation' ? `견적서 ${a.lines.length}행` : `${a.listLabel || '상세 리스트'} ${a.items.length}행`}
                                {!draft.fileName && (
                                    <button type="button" title="이 붙여넣기 빼기" onClick={() => onRemoveSource(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0 4px' }}><Icon name="x" size="1.1em" /></button>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={onReset} disabled={busy} style={{ padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card-subtle)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <Icon name="x" size="1.1em" /> 취소
                    </button>
                    <button type="button" onClick={onSave} disabled={busy || !canManage} style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: busy ? 'var(--ink-4)' : 'var(--btn-bg)', color: busy ? 'var(--on-brand)' : 'var(--btn-ink)', fontWeight: 700, cursor: 'pointer' }}>
                        {busy ? '저장 중...' : `${preview.quotations.length}건 저장`}
                    </button>
                </div>
            </div>

            {preview.warnings.map((w, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--signal)', marginBottom: '6px' }}><Icon name="alert" size="1.1em" /> {w}</div>)}

            {preview.quotations.map((q, qi) => {
                const s = q.summary;
                const open = !!previewOpen[qi];
                const effectiveTitle = (titleOverrides[qi] ?? q.title).trim() || q.title;
                const proj = resolveQuotationProject(effectiveTitle, projects);
                const existing = q.appendTo || findExistingQuotation(q, effectiveTitle, quotations);
                const saveMode = q.appendTo
                    ? chip(`등록된 견적에 상세 리스트 추가${existing.revision ? ` (${existing.revision})` : ''}`, 'ok')
                    : existing
                        ? chip(`등록된 같은 견적을 갱신${existing.revision ? ` (${existing.revision})` : ''} — 이번에 넣은 시트 부분만 바뀝니다`, 'warn')
                        : chip('새 견적으로 등록');
                const catCounts = {};
                q.items.forEach(it => { const c = normalizeCategory(it.item_category); catCounts[c] = (catCounts[c] || 0) + 1; });
                return (
                    <div key={qi} style={{ borderTop: qi ? '1px dashed var(--border-subtle)' : 'none', paddingTop: qi ? '12px' : 0, marginTop: qi ? '12px' : 0 }}>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            프로젝트명 (견적서 내용에서 자동 인식 — 견적조회 제목·프로젝트 묶음으로 쓰입니다. 필요하면 수정)
                        </label>
                        <input
                            type="text"
                            value={titleOverrides[qi] ?? q.title}
                            onChange={e => setTitleOverrides(prev => ({ ...prev, [qi]: e.target.value }))}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '14px', fontWeight: 700 }}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                            {saveMode}
                            {proj.linkedLabel ? chip(`등록 프로젝트 연결: ${proj.linkedLabel}`, 'ok') : chip(`프로젝트: ${effectiveTitle}`)}
                            {q.quote_no && chip(`견적번호 ${q.quote_no}`)}
                            {q.revision && chip(`리비전 ${q.revision}`)}
                            {q.quote_date && chip(`견적일 ${q.quote_date}`)}
                            {chip(`견적 라인 ${s.lines}`)}
                            {chip(`상세 품목 ${s.details}`)}
                            {s.blocks > 0 && chip(`상세견적 단가 연결 ${s.linkedBlocks}/${s.blocks}`, s.linkedBlocks === s.blocks ? 'ok' : 'warn')}
                            {s.errors ? chip(`✗ 검증 오류 ${s.errors}`, 'error') : chip('수량×단가=금액 검증 통과', 'ok')}
                            {s.warnings > 0 && chip(`△ 경고 ${s.warnings}`, 'warn')}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {CATEGORY_ORDER.filter(c => catCounts[c]).map(c => <span key={c} style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{CATEGORY_ICON[c]} {c} {catCounts[c]}</span>)}
                        </div>
                        {q.checks.length > 0 && (
                            <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '12px' }}>
                                {q.checks.slice(0, 12).map((c, i) => (
                                    <li key={i} style={{ color: c.level === 'error' ? 'var(--bad)' : 'var(--signal)' }}>{c.message}{c.row ? ` (행 ${c.row})` : ''}</li>
                                ))}
                            </ul>
                        )}
                        <button
                            type="button"
                            onClick={() => setPreviewOpen(prev => ({ ...prev, [qi]: !prev[qi] }))}
                            style={{ marginTop: '8px', background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 0, fontSize: '12.5px', fontWeight: 600 }}
                        >
                            {open ? '품목 접기' : `품목 ${q.items.length}개 보기`}
                        </button>
                        {open && (
                            <div style={{ overflowX: 'auto', marginTop: '6px', maxHeight: '420px', overflowY: 'auto' }}>
                                <table className="data-table nested">
                                    <thead>
                                        <tr>
                                            <th>구분</th>
                                            <th>대분류 / 유닛</th>
                                            <th>품목명</th>
                                            <th>메이커/재질 · 규격</th>
                                            <th>수량</th>
                                            <th className="money-cell">단가 (₩)</th>
                                            <th className="money-cell">금액 (₩)</th>
                                            <th>검증</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {q.items.map((it, i) => {
                                            const cat = normalizeCategory(it.item_category);
                                            return (
                                                <tr key={i} style={it.source === 'detail' ? { background: 'var(--bg-card-subtle)' } : undefined}>
                                                    <td><span className={`badge-category cat-${categoryBadgeClass(cat)}`}>{cat}</span></td>
                                                    <td style={{ fontSize: '12px' }}>{it.unit_name || it.section || '-'}</td>
                                                    <td>
                                                        {it.source === 'detail' ? '· ' : ''}{it.item_name}
                                                        {it.parent_item && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>⤷ {it.parent_item}</div>}
                                                    </td>
                                                    <td style={{ fontSize: '12px' }}>{[it.maker, it.spec].filter(Boolean).join(' · ') || '-'}</td>
                                                    <td>{it.quantity}{it.uom ? ` ${it.uom}` : ''}</td>
                                                    <td className="money-cell">{fmtKRW(it.unit_price)}</td>
                                                    <td className="money-cell">{fmtKRW(it.total_price)}</td>
                                                    <td style={{ textAlign: 'center' }}>{it.check_status === 'ok' ? '' : it.check_status === 'mismatch' ? <span style={{ color: 'var(--bad)' }}>✗</span> : '–'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function QuotationsManager({ projects, role, onPermissionDenied, currentCustomer = "SK on" }) {
    const canManage = ['admin', 'grade3'].includes(role);
    const notifyPermission = (feature) => {
        if (onPermissionDenied) {
            onPermissionDenied(feature);
        } else {
            alert(`[${feature}] 권한이 없습니다. 운영자에게 권한을 부여받으시기 바랍니다.`);
        }
    };

    const [isExtracting, setIsExtracting] = useState(false);
    // 저장 전 미리보기: 파일 1개의 시트들 또는 시트별 붙여넣기 결과를 모은다 (원본 파일은 보관하지 않는다)
    const [draft, setDraft] = useState(null); // { fileName, analyses: [...] }
    const [titleOverrides, setTitleOverrides] = useState({});
    const [previewOpen, setPreviewOpen] = useState({});
    const [quotations, setQuotations] = useState([]);
    const [quotationItems, setQuotationItems] = useState([]);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [sortOrder, setSortOrder] = useState('recent'); // 'recent', 'priceDesc', 'priceAsc', 'nameAsc'
    
    // 다차원 연동 필터 상태 (공정, 프로젝트, 구분, 품목명, 유닛명)
    const [filterProcess, setFilterProcess] = useState('전체'); // '전체' | 'Notching' | 'Stacking'
    const [filterProject, setFilterProject] = useState('전체'); // '전체' | projectKey
    const [filterCategory, setFilterCategory] = useState('전체'); // '전체' | '가공품' | '시장품' | '기타'
    const [filterItemName, setFilterItemName] = useState('전체'); // '전체' | itemName
    const [filterUnitName, setFilterUnitName] = useState('전체'); // '전체' | unitName
    const [filterSource, setFilterSource] = useState('전체'); // '전체' | 'detail'(부품) | 'quotation'(견적 항목)
    const [isListCollapsed, setIsListCollapsed] = useState(false);

    const [msg, setMsg] = useState('');
    const [expandedProjects, setExpandedProjects] = useState({});

    const [collapsedSections, setCollapsedSections] = useState(() => {
        try {
            const saved = localStorage.getItem('pm_quot_collapsed_sections');
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.warn(e);
        }
        return { newQuote: false, itemSearch: false, projectSummary: false };
    });

    const toggleSection = (key) => {
        setCollapsedSections(prev => {
            const next = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem('pm_quot_collapsed_sections', JSON.stringify(next));
            } catch (e) {}
            return next;
        });
    };

    const setAllSections = (collapsed) => {
        const next = { newQuote: collapsed, itemSearch: collapsed, projectSummary: collapsed };
        setCollapsedSections(next);
        try {
            localStorage.setItem('pm_quot_collapsed_sections', JSON.stringify(next));
        } catch (e) {}
    };

    // 견적 조회 소항목 선택 필터 ('all' | 'newQuote' | 'itemSearch' | 'projectSummary')
    const [activeQuoteSection, setActiveQuoteSection] = useState(() => {
        try {
            return localStorage.getItem('pm_quot_active_section') || 'all';
        } catch (e) {
            return 'all';
        }
    });

    const handleSelectQuoteSection = (secId) => {
        setActiveQuoteSection(secId);
        try { localStorage.setItem('pm_quot_active_section', secId); } catch (e) {}
        if (secId !== 'all') {
            setCollapsedSections(prev => {
                const next = { ...prev, [secId]: false };
                try { localStorage.setItem('pm_quot_collapsed_sections', JSON.stringify(next)); } catch (e) {}
                return next;
            });
        }
    };

    const toggleAllProjects = (expand) => {
        const next = {};
        Object.keys(groupedQuotations).forEach(k => {
            next[k] = expand;
        });
        setExpandedProjects(next);
    };
    
    const fileInputRef = useRef(null);
    const searchContainerRef = useRef(null);

    const loadQuotationsData = async () => {
        try {
            const { data: qData, error: qError } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
            if (qError) throw qError;
            setQuotations(qData || []);

            // Supabase는 한 번에 최대 1000행만 돌려준다 → 품목은 나눠서 끝까지 읽는다
            const PAGE = 1000;
            const allItems = [];
            for (let from = 0; ; from += PAGE) {
                const { data: iData, error: iError } = await supabase.from('quotation_items').select('*')
                    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, from + PAGE - 1);
                if (iError) throw iError;
                allItems.push(...(iData || []));
                if (!iData || iData.length < PAGE) break;
            }
            setQuotationItems(allItems);
        } catch (error) {
            console.error("Failed to load quotations:", error);
            setMsg("데이터를 불러오는데 실패했습니다: " + error.message);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadQuotationsData();
        const handleClickOutside = (event) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // 미리보기: 상세 리스트만 붙여넣었고 같은 프로젝트의 견적이 이미 등록돼 있으면, 그 견적 라인과 함께 분석해 단가 연결까지 보여준다
    const preview = useMemo(() => {
        if (!draft || !draft.analyses.length) return null;
        const base = buildQuotations(draft.analyses, { fileName: draft.fileName });
        const hasQuoteSheet = draft.analyses.some(a => a.kind === 'quotation');
        if (hasQuoteSheet || base.quotations.length !== 1) return base;
        const target = findExistingQuotation(base.quotations[0], base.quotations[0].title, quotations);
        const pseudo = target && existingLinesAnalysis(target, quotationItems);
        if (!pseudo) return base;
        const merged = buildQuotations([pseudo, ...draft.analyses], { fileName: draft.fileName });
        merged.quotations.forEach(q => { q.appendTo = target; });
        return merged;
    }, [draft, quotations, quotationItems]);

    const resetDraft = () => {
        setDraft(null);
        setTitleOverrides({});
        setPreviewOpen({});
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // 엑셀 파일 첨부: 브라우저 안에서만 읽고 분석한다. 원본 파일은 서버에 올리거나 보관하지 않는다.
    const handleFileSelect = async (file) => {
        if (!file) return;
        if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
            setMsg(<span style={{ color: 'var(--bad)' }}>엑셀 견적서(.xlsx / .xls)만 분석할 수 있습니다. PDF·이미지는 표를 엑셀에서 복사해 붙여넣어 주세요.</span>);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        setIsExtracting(true);
        try {
            const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
            const analyses = analyzeWorkbook(XLSX, wb);
            if (!analyses.length) throw new Error("견적서 시트(Item / Details / Unit Price) 또는 상세 리스트 시트(Item / Q'ty / Unit Price)를 찾지 못했습니다.");
            setDraft({ fileName: file.name, analyses });
            setTitleOverrides({});
            setPreviewOpen({});
            setMsg(`'${file.name}' 분석 완료 — 아래 미리보기에서 품목과 검증 결과를 확인한 뒤 저장하세요.`);
        } catch (error) {
            console.error("Quotation parse error:", error);
            setMsg(<span style={{ color: 'var(--bad)' }}>분석 실패: {error.message}</span>);
        } finally {
            setIsExtracting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // 표 붙여넣기: 시트 하나씩 붙여넣으면 미리보기에 차례로 쌓인다 (견적서 시트 + 상세 리스트 시트 여러 개)
    const handlePastedText = (text) => {
        const n = (draft?.analyses.length || 0) + 1;
        const analysis = analyzePastedText(text, `붙여넣기 ${n}`);
        if (analysis.kind === 'unknown') {
            setMsg(<span style={{ color: 'var(--bad)' }}>붙여넣은 표에서 수량·단가·금액 열을 찾지 못했습니다. 품목 행이 포함되도록 드래그해 주세요.</span>);
            return;
        }
        setDraft(prev => ({ fileName: prev?.fileName || '', analyses: [...(prev?.analyses || []), analysis] }));
        const kindLabel = analysis.kind === 'quotation' ? '견적서 시트' : `상세 리스트 시트${analysis.listLabel ? `(${analysis.listLabel})` : ''}`;
        const count = analysis.kind === 'quotation' ? analysis.lines.length : analysis.items.length;
        setMsg(`붙여넣기 ${n}: ${kindLabel}로 인식 (${count}개 품목). 다른 시트도 이어서 붙여넣을 수 있습니다.`);
    };

    const removeDraftSource = (index) => {
        setDraft(prev => {
            const analyses = prev.analyses.filter((_, i) => i !== index);
            return analyses.length ? { ...prev, analyses } : null;
        });
    };

    // 저장: 새 견적 등록 / 같은 견적(같은 리비전) 갱신 / 기존 견적에 상세 리스트 추가
    // 갱신할 때는 이번에 들어온 부분만 바꾼다 (견적 라인이 있으면 견적 라인, 상세 리스트는 같은 종류의 상세만)
    const saveOneQuotation = async (q, title, projectId, projectName) => {
        const target = q.appendTo || findExistingQuotation(q, title, quotations);
        const appendOnly = !!q.appendTo;
        const newItems = appendOnly ? q.items.filter(it => it.source === 'detail') : q.items;

        const header = {
            project_id: projectId,
            project_name: projectName,
            title,
            total_amount: q.total_amount || 0,
            quote_no: q.quote_no || null,
            revision: q.revision || null,
            quote_date: q.quote_date || null,
            rfq_no: q.rfq_no || null,
            client: q.client || null,
            source_name: draft?.fileName || '표 붙여넣기',
            sheet_names: q.sheet_names,
            parse_summary: { ...q.summary, checks: q.checks.slice(0, 50) },
        };

        let quotationId;
        let lineOffset = 0;
        if (target) {
            quotationId = target.id;
            const existingItems = quotationItems.filter(it => it.quotation_id === quotationId);
            const hasLines = newItems.some(it => it.source === 'quotation');
            const detailSections = new Set(newItems.filter(it => it.source === 'detail').map(it => it.section));
            const removeIds = existingItems
                .filter(it => (hasLines && it.source !== 'detail') || (it.source === 'detail' && detailSections.has(it.section)))
                .map(it => it.id);
            for (let i = 0; i < removeIds.length; i += 200) {
                const { error: delErr } = await supabase.from('quotation_items').delete().in('id', removeIds.slice(i, i + 200));
                if (delErr) throw delErr;
            }
            const kept = existingItems.filter(it => !removeIds.includes(it.id));
            lineOffset = hasLines ? 0 : kept.reduce((m, it) => Math.max(m, it.line_no || 0), 0);
            // 머리 정보는 이번 데이터에 있는 값만 덮어쓴다 (상세만 붙여넣었으면 견적번호·총액 등은 그대로)
            const patch = appendOnly
                ? { sheet_names: [...new Set([...(target.sheet_names || []), ...q.sheet_names])] }
                : Object.fromEntries(Object.entries(header).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
            const { error: upErr } = await supabase.from('quotations').update(patch).eq('id', quotationId);
            if (upErr) throw upErr;
        } else {
            let payload = { customer: currentCustomer, ...header };
            let { data: created, error: insErr } = await supabase.from('quotations').insert(payload).select().single();
            if (insErr && String(insErr.message || '').toLowerCase().includes('customer')) {
                delete payload.customer;
                const retry = await supabase.from('quotations').insert(payload).select().single();
                created = retry.data;
                insErr = retry.error;
            }
            if (insErr) throw insErr;
            quotationId = created.id;
        }

        const rows = newItems.map(it => ({
            quotation_id: quotationId,
            item_name: it.item_name,
            unit_name: it.unit_name || '',
            item_category: it.item_category,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total_price: it.total_price,
            section: it.section || null,
            parent_item: it.parent_item || null,
            maker: it.maker || null,
            spec: it.spec || null,
            uom: it.uom || null,
            remark: it.remark || null,
            source: it.source,
            line_no: lineOffset + it.line_no,
            check_status: it.check_status,
        }));
        for (let i = 0; i < rows.length; i += 500) {
            const { error: iErr } = await supabase.from('quotation_items').insert(rows.slice(i, i + 500));
            if (iErr) throw iErr;
        }
        return { count: rows.length, mode: appendOnly ? 'append' : target ? 'update' : 'new' };
    };

    const handleSaveDraft = async () => {
        if (!canManage) return notifyPermission('견적서 등록');
        if (!preview || !preview.quotations.length) return;
        const errorCount = preview.quotations.reduce((s, q) => s + q.summary.errors, 0);
        if (errorCount && !window.confirm(`검증 오류가 ${errorCount}건 있습니다 (수량×단가≠금액 등).\n원본 견적서를 확인하지 않고 그대로 저장할까요?`)) return;

        setIsExtracting(true);
        try {
            const results = [];
            for (let i = 0; i < preview.quotations.length; i++) {
                const q = preview.quotations[i];
                const title = (titleOverrides[i] ?? q.title).trim() || q.title;
                // 프로젝트는 견적서 내용의 프로젝트명으로 정한다 (같은 이름의 등록 프로젝트가 있으면 그 프로젝트에 연결)
                const { projectId, projectName } = resolveQuotationProject(title, projects);
                results.push({ title, ...(await saveOneQuotation(q, title, projectId, projectName)) });
            }
            const modeLabel = { new: '새로 등록', update: '기존 견적 갱신', append: '기존 견적에 상세 추가' };
            setMsg(`저장 완료 — ${results.map(r => `${r.title} (${modeLabel[r.mode]}, 품목 ${r.count}개)`).join(' / ')}. 원본 파일은 보관하지 않습니다.`);
            resetDraft();
            loadQuotationsData();
        } catch (error) {
            console.error("Quotation save error:", error);
            setMsg(
                <span style={{ color: 'var(--bad)' }}>
                    저장 실패: {error.message}
                    <div style={{ fontSize: '11px', color: 'var(--ink-3)', fontWeight: 'normal', marginTop: '4px' }}>
                        DB에 견적 상세 컬럼(quote_no, maker, spec 등)이 아직 없으면 이 오류가 납니다. 담당자에게 문의해주세요.
                    </div>
                </span>
            );
        } finally {
            setIsExtracting(false);
        }
    };

    const handleDeleteQuotation = async (id) => {
        if (!window.confirm('이 견적서와 모든 세부 품목 데이터를 삭제하시겠습니까?')) return;
        try {
            const { error: iErr } = await supabase.from('quotation_items').delete().eq('quotation_id', id);
            if (iErr) throw iErr;
            const { error: qErr } = await supabase.from('quotations').delete().eq('id', id);
            if (qErr) throw qErr;
            
            setMsg('견적서가 성공적으로 삭제되었습니다.');
            loadQuotationsData();
        } catch (error) {
            console.error(error);
            setMsg('삭제 실패: ' + error.message);
        }
    };

    const handleDeleteProjectQuotations = async (e, group) => {
        e.stopPropagation();
        if (!window.confirm(`'${group.name}' 프로젝트의 모든 견적서와 세부 품목 데이터를 삭제하시겠습니까?`)) return;
        
        try {
            const quotationIds = group.quotations.map(q => q.id);
            if (quotationIds.length === 0) return;
            
            const { error: iErr } = await supabase.from('quotation_items').delete().in('quotation_id', quotationIds);
            if (iErr) throw iErr;
            
            const { error: qErr } = await supabase.from('quotations').delete().in('id', quotationIds);
            if (qErr) throw qErr;
            
            setMsg('해당 프로젝트의 모든 견적서가 삭제되었습니다.');
            loadQuotationsData();
        } catch (error) {
            console.error(error);
            setMsg('삭제 실패: ' + error.message);
        }
    };

    // 현재 고객사(currentCustomer)에 해당하는 견적서만 격리 필터링
    const customerQuotations = useMemo(() => {
        const pIds = new Set((projects || []).map(p => p.id));
        const pNames = new Set((projects || []).map(p => p.name));
        return quotations.filter(q => {
            if (q.customer) return q.customer === currentCustomer;
            if (q.project_id && pIds.has(q.project_id)) return true;
            if (q.project_name && pNames.has(q.project_name)) return true;
            return currentCustomer === "SK on";
        });
    }, [quotations, projects, currentCustomer]);

    const customerQuotationIds = useMemo(() => {
        return new Set(customerQuotations.map(q => q.id));
    }, [customerQuotations]);

    // 1. 모든 품목 데이터에 공정, 프로젝트, 정규화 구분 메타데이터 결합 (현재 고객사 견적서 품목만)
    const enrichedItems = useMemo(() => {
        return quotationItems
            .filter(item => customerQuotationIds.has(item.quotation_id))
            .map(item => {
                const q = customerQuotations.find(quot => quot.id === item.quotation_id);
                let projectKey = "미지정 프로젝트";
                let projectObj = null;
                if (q) {
                    if (q.project_id) {
                        projectObj = projects.find(p => p.id === q.project_id);
                        if (projectObj) {
                            projectKey = `${projectObj.manufacturing_no || ''} · ${projectObj.name || ''}`.replace(/^ ·\s*/, '');
                        }
                    } else if (q.project_name) {
                        projectKey = q.project_name;
                    }
                }

                // 공정 판별: Stacking(STK), Notching(NC)
                const combinedText = [
                    projectKey,
                    projectObj?.name,
                    projectObj?.equipment,
                    projectObj?.line,
                    q?.title,
                    item.unit_name,
                    item.item_name
                ].filter(Boolean).join(' ');

                const isNC = /(?:notching|notcher|노칭|\bnc\b)/i.test(combinedText);
                const isSTK = /(?:stacking|stacker|스택|스태킹|\bstk\b)/i.test(combinedText);

                let processType = "기타";
                if (isNC && !isSTK) processType = "Notching";
                else if (isSTK && !isNC) processType = "Stacking";
                else if (isNC && isSTK) processType = "Both";

                // 구분 정규화: 가공품 / 시장품(구매품) / 잡자재 / 기구 SET / 인건비 / 경비 / 프로그램 / 차감 / 기타
                const normCategory = normalizeCategory(item.item_category);

                // 수량 0(예: 0 MD 인건비)은 그대로 0으로 보여야 한다. 값이 비어 있을 때만 1로 본다
                const quantity = item.quantity === null || item.quantity === undefined || item.quantity === '' ? 1 : Number(item.quantity);
                const unitPrice = Number(item.unit_price) || 0;
                return {
                    ...item,
                    projectKey,
                    quotationTitle: q?.title || '견적서',
                    quoteLabel: [q?.quote_no, q?.revision].filter(Boolean).join(' '),
                    quoteDate: q?.quote_date || null,
                    isLine: item.source === 'quotation',
                    processType,
                    normCategory,
                    unit_name: item.unit_name || '',
                    unit_price: unitPrice,
                    quantity,
                    total_price: item.total_price === null || item.total_price === undefined ? unitPrice * quantity : Number(item.total_price)
                };
            });
    }, [quotationItems, customerQuotations, customerQuotationIds, projects]);

    // 자료 구분: 부품(상세 리스트) / 견적 항목(SET·인건비·경비) — 예전 AI 등록분(source 없음)은 상세 리스트에서 뽑은 것이라 부품으로 본다
    const scopedItems = useMemo(() => {
        if (filterSource === 'detail') return enrichedItems.filter(i => !i.isLine);
        if (filterSource === 'quotation') return enrichedItems.filter(i => i.isLine);
        return enrichedItems;
    }, [enrichedItems, filterSource]);
    const sourceCounts = useMemo(() => ({
        all: enrichedItems.length,
        detail: enrichedItems.filter(i => !i.isLine).length,
        quotation: enrichedItems.filter(i => i.isLine).length,
    }), [enrichedItems]);

    // 2. [공정 필터]에 따른 유효 프로젝트 목록
    const availableProjects = useMemo(() => {
        const counts = {};
        scopedItems.forEach(item => {
            if (filterProcess !== '전체') {
                if (filterProcess === 'Notching' && item.processType !== 'Notching' && item.processType !== 'Both') return;
                if (filterProcess === 'Stacking' && item.processType !== 'Stacking' && item.processType !== 'Both') return;
            }
            counts[item.projectKey] = (counts[item.projectKey] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [scopedItems, filterProcess]);

    // 유효한 선택 프로젝트 결정 (파생 상태)
    const effectiveProject = (filterProject !== '전체' && availableProjects.some(p => p.name === filterProject)) ? filterProject : '전체';

    // 3. [공정 + 프로젝트]에 따른 구분(가공품/시장품/기타) 건수
    const availableCategories = useMemo(() => {
        const counts = Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0]));
        scopedItems.forEach(item => {
            if (filterProcess !== '전체') {
                if (filterProcess === 'Notching' && item.processType !== 'Notching' && item.processType !== 'Both') return;
                if (filterProcess === 'Stacking' && item.processType !== 'Stacking' && item.processType !== 'Both') return;
            }
            if (effectiveProject !== '전체' && item.projectKey !== effectiveProject) return;
            if (counts[item.normCategory] !== undefined) counts[item.normCategory]++;
            else counts['기타']++;
        });
        return counts;
    }, [scopedItems, filterProcess, effectiveProject]);

    // 4. [공정 + 프로젝트 + 구분] 복합 조건에 따른 유효 품목 목록 (핵심 연동!)
    const availableItemNames = useMemo(() => {
        const itemMap = {};
        scopedItems.forEach(item => {
            if (filterProcess !== '전체') {
                if (filterProcess === 'Notching' && item.processType !== 'Notching' && item.processType !== 'Both') return;
                if (filterProcess === 'Stacking' && item.processType !== 'Stacking' && item.processType !== 'Both') return;
            }
            if (effectiveProject !== '전체' && item.projectKey !== effectiveProject) return;
            if (filterCategory !== '전체' && item.normCategory !== filterCategory) return;

            if (!itemMap[item.item_name]) {
                itemMap[item.item_name] = { count: 0, minPrice: item.unit_price, maxPrice: item.unit_price };
            }
            itemMap[item.item_name].count++;
            itemMap[item.item_name].minPrice = Math.min(itemMap[item.item_name].minPrice, item.unit_price);
            itemMap[item.item_name].maxPrice = Math.max(itemMap[item.item_name].maxPrice, item.unit_price);
        });

        return Object.entries(itemMap)
            .map(([name, info]) => ({ name, ...info }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [scopedItems, filterProcess, effectiveProject, filterCategory]);

    // 유효한 선택 품목명 결정 (파생 상태)
    const effectiveItemName = (filterItemName !== '전체' && availableItemNames.some(i => i.name === filterItemName)) ? filterItemName : '전체';

    // 5. [공정 + 프로젝트 + 구분 + 품목] 복합 조건에 따른 유효 유닛 목록
    const availableUnitNames = useMemo(() => {
        const unitSet = new Set();
        scopedItems.forEach(item => {
            if (filterProcess !== '전체') {
                if (filterProcess === 'Notching' && item.processType !== 'Notching' && item.processType !== 'Both') return;
                if (filterProcess === 'Stacking' && item.processType !== 'Stacking' && item.processType !== 'Both') return;
            }
            if (effectiveProject !== '전체' && item.projectKey !== effectiveProject) return;
            if (filterCategory !== '전체' && item.normCategory !== filterCategory) return;
            if (effectiveItemName !== '전체' && item.item_name !== effectiveItemName) return;
            if (searchQuery.trim() && !item.item_name.toLowerCase().includes(searchQuery.toLowerCase().trim())) return;

            if (item.unit_name) unitSet.add(item.unit_name);
        });
        return [...unitSet].sort();
    }, [scopedItems, filterProcess, effectiveProject, filterCategory, effectiveItemName, searchQuery]);

    // 유효한 선택 유닛명 결정 (파생 상태)
    const effectiveUnitName = (filterUnitName !== '전체' && availableUnitNames.includes(filterUnitName)) ? filterUnitName : '전체';

    // 자동완성 추천 품목 (현재 조건의 availableItemNames 중에서만 검색!)
    const suggestedItems = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase().trim();
        return availableItemNames.filter(item => item.name.toLowerCase().includes(q));
    }, [availableItemNames, searchQuery]);

    // 6. 최종 검색 결과 필터링
    const filteredResults = useMemo(() => {
        const list = scopedItems.filter(item => {
            if (filterProcess !== '전체') {
                if (filterProcess === 'Notching' && item.processType !== 'Notching' && item.processType !== 'Both') return false;
                if (filterProcess === 'Stacking' && item.processType !== 'Stacking' && item.processType !== 'Both') return false;
            }
            if (effectiveProject !== '전체' && item.projectKey !== effectiveProject) return false;
            if (filterCategory !== '전체' && item.normCategory !== filterCategory) return false;
            if (effectiveItemName !== '전체' && item.item_name !== effectiveItemName) return false;
            if (effectiveUnitName !== '전체' && item.unit_name !== effectiveUnitName) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                // 품목명·유닛명뿐 아니라 메이커/재질(SMC, A6061)·규격(KQ2L06)·상위 견적 항목으로도 찾는다
                const haystack = [item.item_name, item.unit_name, item.maker, item.spec, item.parent_item].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }

            return true;
        });

        if (sortOrder === 'priceDesc') list.sort((a, b) => b.unit_price - a.unit_price);
        else if (sortOrder === 'priceAsc') list.sort((a, b) => a.unit_price - b.unit_price);
        else if (sortOrder === 'nameAsc') list.sort((a, b) => a.item_name.localeCompare(b.item_name));
        else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return list;
    }, [scopedItems, filterProcess, effectiveProject, filterCategory, effectiveItemName, effectiveUnitName, searchQuery, sortOrder]);

    // 단가 통계 계산
    const { statMinPrice, statMaxPrice, statAvgPrice, statTotalPrice } = useMemo(() => {
        if (filteredResults.length === 0) return { statMinPrice: 0, statMaxPrice: 0, statAvgPrice: 0, statTotalPrice: 0 };
        const prices = filteredResults.map(i => i.unit_price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const total = filteredResults.reduce((sum, i) => sum + i.total_price, 0);
        const avg = Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length);
        return { statMinPrice: min, statMaxPrice: max, statAvgPrice: avg, statTotalPrice: total };
    }, [filteredResults]);

    const handleResetFilters = () => {
        setFilterProcess('전체');
        setFilterProject('전체');
        setFilterCategory('전체');
        setFilterItemName('전체');
        setFilterUnitName('전체');
        setFilterSource('전체');
        setSearchQuery('');
        setSortOrder('recent');
    };

    const groupedQuotations = {};
    customerQuotations.forEach(q => {
        let key = "미지정 프로젝트";
        if (q.project_id) {
            const p = projects.find(proj => proj.id === q.project_id);
            if (p) key = p.manufacturing_no ? `${p.manufacturing_no} · ${p.name}` : p.name;
        } else if (q.project_name) {
            key = q.project_name;
        }
        
        if (!groupedQuotations[key]) {
            groupedQuotations[key] = { name: key, quotations: [], total_amount: 0, part_count: 0, line_count: 0, latest_date: null };
        }
        const g = groupedQuotations[key];
        g.quotations.push(q);
        quotationItems.forEach(item => {
            if (item.quotation_id !== q.id) return;
            if (item.source === 'quotation') g.line_count++;
            else g.part_count++;
        });
        if (q.quote_date && (!g.latest_date || q.quote_date > g.latest_date)) g.latest_date = q.quote_date;
    });
    // 프로젝트 총액: 같은 견적번호는 최신 리비전만 더한다 (R10 + R12 이중 합산 방지)
    Object.values(groupedQuotations).forEach(g => {
        const latestByQuote = {};
        g.quotations.forEach(q => {
            const k = q.quote_no || q.id;
            const cur = latestByQuote[k];
            if (!cur || revisionNumber(q.revision) > revisionNumber(cur.revision)) latestByQuote[k] = q;
        });
        g.total_amount = Object.values(latestByQuote).reduce((s, q) => s + Number(q.total_amount || 0), 0);
        g.quotations.sort((a, b) => String(a.quote_no || '').localeCompare(String(b.quote_no || '')) || revisionNumber(b.revision) - revisionNumber(a.revision));
    });

    const toggleProject = (name) => {
        setExpandedProjects(prev => ({ ...prev, [name]: !prev[name] }));
    };

    return (
        <>
            {/* 견적 조회 시스템 메인 헤더 카드 (틀고정) */}
            <div className="system-sticky-header">
                <div className="system-header-row">
                    <div className="system-title-group">
                        <div className="system-logo-icon theme-quotations">
                            <Icon name="receipt" size="1.1em" />
                        </div>
                        <div className="system-title-text">
                            <h2>
                                견적 조회 시스템 (Quotation Management System)
                            </h2>
                            <p>
                                프로젝트별 견적 내역 조회, 사양 및 품목별 단가 종합 분석 관리
                            </p>
                        </div>
                    </div>

                    <div className="system-header-actions">
                        <button
                            type="button"
                            onClick={() => setAllSections(false)}
                            className="system-toggle-all-btn"
                            title="견적 조회의 모든 소항목 펼치기"
                        >
                            <Icon name="chevDown" size="1.1em" /> 전체 펼치기
                        </button>
                        <button
                            type="button"
                            onClick={() => setAllSections(true)}
                            className="system-toggle-all-btn"
                            title="견적 조회의 모든 소항목 접기"
                        >
                            <Icon name="chevUp" size="1.1em" /> 전체 접기
                        </button>
                    </div>
                </div>

                {/* 소항목 필터 버튼 그룹 */}
                <div className="system-sub-nav">
                    {[
                        { id: 'all', label: '전체 표시' },
                        { id: 'newQuote', label: '새 견적서 등록' },
                        { id: 'itemSearch', label: '단가 & 품목 검색 및 단가 추이' },
                        { id: 'projectSummary', label: '프로젝트별 견적 종합 요약 및 내역' }
                    ].map(sec => (
                        <button
                            key={sec.id}
                            type="button"
                            onClick={() => handleSelectQuoteSection(sec.id)}
                            className={`system-sub-btn ${activeQuoteSection === sec.id ? 'active' : ''}`}
                        >
                            {sec.label}
                        </button>
                    ))}
                </div>
            </div>

            {(activeQuoteSection === 'all' || activeQuoteSection === 'newQuote') && (
            <section>
                {!canManage && (
                    <div style={{background: 'var(--brand-wash)', border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <span><Icon name="info" size="1.1em" /> <b>견적 조회 전용 모드 ({role?.toUpperCase() || 'GRADE2'})</b> : 견적 비용 집계 및 품목별 단가 검색만 가능하며, 견적서 등록 및 삭제 권한은 제한됩니다.</span>
                    </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: collapsedSections.newQuote ? '0' : '14px'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <h2 style={{margin: 0}}>새 견적서 등록 {!canManage && <Icon name="lock" size={12} />}</h2>
                        <button
                            type="button"
                            onClick={() => toggleSection('newQuote')}
                            style={{
                                background: collapsedSections.newQuote ? 'var(--brand)' : 'var(--bg-card-subtle)',
                                color: collapsedSections.newQuote ? 'var(--btn-ink)' : 'var(--ink-2)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)',
                                padding: '2px 8px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            {collapsedSections.newQuote ? '펼치기' : '접기'}
                        </button>
                    </div>
                </div>
                {!collapsedSections.newQuote ? (
                    <>
                        {/* 등록 방법: 표 붙여넣기(주) + 파일 첨부(보조)를 제목 바로 아래 가운데에 크게 보여준다 */}
                        <input type="file" ref={fileInputRef} onChange={e=>handleFileSelect(e.target.files[0])} accept=".xlsx,.xlsm,.xls" style={{display:'none'}}/>
                        <PasteEntry
                            block
                            align="center"
                            drmNote
                            file={{
                                label: `파일 첨부 (Excel)${!canManage ? ' ' : ''}`,
                                busy: isExtracting,
                                busyLabel: '처리 중...',
                                disabled: isExtracting,
                                title: !canManage ? '등록 권한이 없습니다 (클릭 시 권한 안내)' : '엑셀 견적서(.xlsx/.xls)를 첨부합니다',
                                onClick: () => {
                                    if (!canManage) return notifyPermission('견적서 파일 업로드');
                                    fileInputRef.current.click();
                                },
                            }}
                        >
                            <PasteZone
                                size={draft ? 'md' : 'lg'}
                                label={draft ? '다른 시트도 이어서 붙여넣기' : '견적서 표 붙여넣기'}
                                hint={draft ? '다른 시트의 표 복사 → 클릭 → Ctrl+V' : '엑셀에서 표를 복사(Ctrl+C) → 이 칸을 클릭 → 붙여넣기(Ctrl+V)'}
                                title="견적서 시트와 상세 리스트 시트를 각각 드래그해 복사한 뒤 하나씩 붙여넣으세요. 드래그 범위는 달라도 됩니다."
                                disabled={!canManage}
                                disabledReason="견적서 등록 권한이 없습니다"
                                busy={isExtracting}
                                busyLabel="처리 중..."
                                onPaste={(e) => {
                                    if (!canManage) {
                                        e.preventDefault();
                                        notifyPermission('견적서 등록');
                                        return;
                                    }
                                    const text = e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text");
                                    e.preventDefault();
                                    e.target.value = ""; // 입력창 비우기
                                    if (text && text.trim().length > 5) {
                                        handlePastedText(text);
                                    } else {
                                        setMsg(<span style={{ color: 'var(--bad)' }}>붙여넣은 내용에 표 데이터가 없습니다. 엑셀에서 표 범위를 드래그해 복사(Ctrl+C)한 뒤 붙여넣어 주세요.</span>);
                                    }
                                }}
                            />
                        </PasteEntry>

                        {msg &&<p className="notice" style={{marginTop:'12px',fontWeight:'bold',color:'var(--ok)',textAlign:'center'}}>{msg}</p>}
                        {!draft && (
                            <div style={{ marginTop: '12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '6px 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    {['① 견적서 시트 표 복사 → 붙여넣기', '② 상세 리스트(Detail List) 시트 표 복사 → 이어서 붙여넣기', '③ 미리보기에서 단가 검증 확인 → 저장'].map((step, i) => (
                                        <Fragment key={step}>
                                            {i > 0 && <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}><Icon name="chevRight" size="1.1em" /></span>}
                                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card-subtle)' }}>{step}</span>
                                        </Fragment>
                                    ))}
                                </div>
                                <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                                    프로젝트는 견적서 안의 "프로젝트 명"으로 자동 등록되고(같은 이름의 등록 프로젝트가 있으면 연결), AI 없이 정해진 규칙으로 품목별 KRW 단가를 읽습니다. 원본 파일은 보관하지 않습니다.
                                </p>
                            </div>
                        )}
                        {draft && preview && (
                            <QuotationPreview
                                draft={draft}
                                preview={preview}
                                titleOverrides={titleOverrides}
                                setTitleOverrides={setTitleOverrides}
                                previewOpen={previewOpen}
                                setPreviewOpen={setPreviewOpen}
                                projects={projects}
                                quotations={quotations}
                                onRemoveSource={removeDraftSource}
                                onSave={handleSaveDraft}
                                onReset={() => { resetDraft(); setMsg(''); }}
                                busy={isExtracting}
                                canManage={canManage}
                            />
                        )}
                    </>
                ) : (
                    <div 
                        onClick={() => toggleSection('newQuote')}
                        style={{
                            padding: '10px 14px',
                            background: 'var(--bg-card-subtle)',
                            border: '1px dashed var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            textAlign: 'center',
                            color: 'var(--ink-3)',
                            fontSize: '13px',
                            cursor: 'pointer',
                            marginTop: '8px'
                        }}
                    >
                        <Icon name="pencil" size="1.1em" /> 새 견적서 등록 영역이 접혀 있습니다. (클릭하여 펼치기 <Icon name="chevDown" size="1.1em" /> )
                    </div>
                )}
            </section>
            )}

            {/* 품목별 단가 검색 및 다차원 연동 필터 섹션 */}
            {(activeQuoteSection === 'all' || activeQuoteSection === 'itemSearch') && (
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0 }}>
                                품목별 견적 단가 조회 및 비교
                            </h2>
                            <button
                                type="button"
                                onClick={() => toggleSection('itemSearch')}
                                style={{
                                    background: collapsedSections.itemSearch ? 'var(--brand)' : 'var(--bg-card-subtle)',
                                    color: collapsedSections.itemSearch ? 'var(--btn-ink)' : 'var(--ink-2)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                {collapsedSections.itemSearch ? '펼치기' : '접기'}
                            </button>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
                            공정(NC/STK), 프로젝트, 구분(가공품/시장품/인건비 등), 품목을 선택하면 조건에 맞는 품목들만 실시간 연동됩니다. 직접 검색은 메이커·재질·규격으로도 됩니다.
                        </span>
                    </div>
                    {!collapsedSections.itemSearch && (
                        <button 
                            type="button"
                            onClick={handleResetFilters}
                            className="filter-reset-btn"
                            title="선택된 모든 검색 조건 및 필터를 초기화합니다"
                        >
                            <Icon name="refresh" size="1.1em" /> 필터 초기화
                        </button>
                    )}
                </div>

                {!collapsedSections.itemSearch ? (
                    <>

                {/* 다차원 연동 필터 카드 */}
                <div className="quote-filter-card">
                    {/* 행 0: 자료 구분 — 부품 단가(상세 리스트)와 견적 항목(SET·인건비·경비)을 나눠 본다 */}
                    <div className="quote-filter-row">
                        <div className="quote-filter-group">
                            <label className="quote-filter-label"><Icon name="file" size="1.1em" /> 자료 구분</label>
                            <div className="quote-pill-group">
                                {[
                                    { id: '전체', label: `전체 (${sourceCounts.all})` },
                                    { id: 'detail', label: `부품 단가 · 상세 리스트 (${sourceCounts.detail})` },
                                    { id: 'quotation', label: `견적 항목 · SET·인건비·경비 (${sourceCounts.quotation})` },
                                ].map(opt => (
                                    <button key={opt.id} type="button" className={`quote-pill-btn ${filterSource === opt.id ? 'active' : ''}`} onClick={() => setFilterSource(opt.id)}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 행 1: 공정 / 프로젝트 / 구분(가공품/시장품/기타) */}
                    <div className="quote-filter-row">
                        {/* 1. 공정 필터 */}
                        <div className="quote-filter-group">
                            <label className="quote-filter-label">
                                <Icon name="settings" size="1.1em" /> 공정 선택 (Notching / Stacking)
                            </label>
                            <div className="quote-pill-group">
                                <button 
                                    type="button" 
                                    className={`quote-pill-btn ${filterProcess === '전체' ? 'active' : ''}`}
                                    onClick={() => setFilterProcess('전체')}
                                >
                                    전체 공정
                                </button>
                                <button 
                                    type="button" 
                                    className={`quote-pill-btn ${filterProcess === 'Notching' ? 'active-nc' : ''}`}
                                    onClick={() => setFilterProcess('Notching')}
                                >
                                    Notching (NC)
                                </button>
                                <button 
                                    type="button" 
                                    className={`quote-pill-btn ${filterProcess === 'Stacking' ? 'active-stk' : ''}`}
                                    onClick={() => setFilterProcess('Stacking')}
                                >
                                    Stacking (STK)
                                </button>
                            </div>
                        </div>

                        {/* 2. 프로젝트 필터 (공정에 맞춰 연동) */}
                        <div className="quote-filter-group" style={{ flex: '1 1 240px' }}>
                            <label className="quote-filter-label">
                                <Icon name="folder" size="1.1em" /> 프로젝트 선택 ({availableProjects.length}개 프로젝트)
                            </label>
                            <select 
                                className="quote-select"
                                style={{ width: '100%' }}
                                value={effectiveProject}
                                onChange={e => setFilterProject(e.target.value)}
                            >
                                <option value="전체">모든 프로젝트 ({scopedItems.length}건)</option>
                                {availableProjects.map(p => (
                                    <option key={p.name} value={p.name}>
                                        {p.name} ({p.count}건)
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 3. 품목 구분 필터 (가공품 / 시장품 / 기타) */}
                        <div className="quote-filter-group">
                            <label className="quote-filter-label">
                                 품목 구분
                            </label>
                            <div className="quote-pill-group">
                                <button 
                                    type="button"
                                    className={`quote-pill-btn ${filterCategory === '전체' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('전체')}
                                >
                                    전체
                                </button>
                                {CATEGORY_ORDER.filter(cat => availableCategories[cat] > 0 || cat === '가공품' || cat === '시장품' || cat === filterCategory).map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        className={`quote-pill-btn ${filterCategory === cat ? 'active' : ''}`}
                                        onClick={() => setFilterCategory(cat)}
                                    >
                                        {CATEGORY_ICON[cat]} {cat} ({availableCategories[cat] || 0})
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 행 2: 복합 조건 연동 품목 드롭다운 / 직접 검색창 / 유닛 드롭다운 / 정렬 */}
                    <div className="quote-filter-row">
                        {/* 4. 복합 연동 품목 드롭다운 */}
                        <div className="quote-filter-group" style={{ flex: '1 1 240px' }}>
                            <label className="quote-filter-label">
                                <Icon name="search" size="1.1em" /> 품목 선택 (조건 만족: {availableItemNames.length}개 품목)
                            </label>
                            <select 
                                className="quote-select"
                                style={{ width: '100%' }}
                                value={effectiveItemName}
                                onChange={e => {
                                    const val = e.target.value;
                                    setFilterItemName(val);
                                    if (val !== '전체') setSearchQuery(val);
                                    else setSearchQuery('');
                                }}
                            >
                                <option value="전체">
                                    {filterProcess !== '전체' || filterProject !== '전체' || filterCategory !== '전체' 
                                        ? `선택 조건 전체 품목 (${availableItemNames.length}개 품목)`
                                        : `전체 품목 선택 (${availableItemNames.length}개 품목)`}
                                </option>
                                {availableItemNames.map(item => (
                                    <option key={item.name} value={item.name}>
                                        {item.name} ({item.count}건 · ₩{item.minPrice.toLocaleString()})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 5. 직접 검색창 (실시간 타이핑 자동완성) */}
                        <div className="quote-filter-group" style={{ flex: '1 1 200px', position: 'relative' }} ref={searchContainerRef}>
                            <label className="quote-filter-label">
                                 직접 검색
                            </label>
                            <input 
                                type="text"
                                placeholder="품목명 직접 입력..."
                                value={searchQuery}
                                onChange={e => {
                                    const val = e.target.value;
                                    setSearchQuery(val);
                                    setIsSearchFocused(true);
                                    const match = availableItemNames.find(i => i.name.toLowerCase() === val.toLowerCase());
                                    if (match) setFilterItemName(match.name);
                                    else if (!val) setFilterItemName('전체');
                                }}
                                onFocus={() => setIsSearchFocused(true)}
                                style={{
                                    padding: '7px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-subtle)',
                                    fontSize: '13px',
                                    outline: 'none',
                                    width: '100%',
                                    boxSizing: 'border-box'
                                }}
                            />
                            {isSearchFocused && suggestedItems.length > 0 && (
                                <ul className="autocomplete-dropdown" style={{ top: '100%', left: 0, right: 0 }}>
                                    {suggestedItems.slice(0, 50).map((item, idx) => (
                                        <li key={idx} onMouseDown={() => {
                                            setSearchQuery(item.name);
                                            setFilterItemName(item.name);
                                            setIsSearchFocused(false);
                                        }}>
                                            <span style={{ fontWeight: 600 }}>{item.name}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--ink-3)', marginLeft: '6px' }}>({item.count}건)</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* 6. 유닛명 드롭다운 (선택 조건에 해당하는 유닛만) */}
                        {availableUnitNames.length > 0 && (
                            <div className="quote-filter-group" style={{ flex: '0 1 180px' }}>
                                <label className="quote-filter-label">
                                     유닛/파트
                                </label>
                                <select 
                                    className="quote-select"
                                    style={{ width: '100%' }}
                                    value={effectiveUnitName}
                                    onChange={e => setFilterUnitName(e.target.value)}
                                >
                                    <option value="전체">모든 유닛 ({availableUnitNames.length}개)</option>
                                    {availableUnitNames.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* 7. 정렬 */}
                        <div className="quote-filter-group" style={{ flex: '0 0 140px' }}>
                            <label className="quote-filter-label">
                                 정렬
                            </label>
                            <select 
                                className="quote-select"
                                style={{ width: '100%' }}
                                value={sortOrder}
                                onChange={e => setSortOrder(e.target.value)}
                            >
                                <option value="recent">최신순</option>
                                <option value="priceDesc">단가 높은 순</option>
                                <option value="priceAsc">단가 낮은 순</option>
                                <option value="nameAsc">품목명 가나다순</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 통계 요약 칩 바 및 접기/펼치기 토글 */}
                <div className="quote-stat-bar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                        <div className="quote-stat-chip highlight">
                            <span>조회된 품목:</span> <b>{filteredResults.length}건</b>
                        </div>
                        {filteredResults.length > 0 && (
                            <>
                                <div className="quote-stat-chip">
                                    <span>최저 단가:</span> <b style={{ color: 'var(--ok)' }}>₩{statMinPrice.toLocaleString()}</b>
                                </div>
                                <div className="quote-stat-chip">
                                    <span>최고 단가:</span> <b style={{ color: 'var(--bad)' }}>₩{statMaxPrice.toLocaleString()}</b>
                                </div>
                                <div className="quote-stat-chip">
                                    <span>평균 단가:</span> <b style={{ color: 'var(--brand)' }}>₩{statAvgPrice.toLocaleString()}</b>
                                </div>
                                <div className="quote-stat-chip">
                                    <span>합계 금액:</span> <b>₩{statTotalPrice.toLocaleString()}</b>
                                </div>
                            </>
                        )}
                    </div>
                    {filteredResults.length > 0 && (
                        <button
                            type="button"
                            className="quote-collapse-toggle-btn"
                            onClick={() => setIsListCollapsed(prev => !prev)}
                        >
                            {isListCollapsed ? '결과 목록 펼치기' : '결과 목록 접기'}
                        </button>
                    )}
                </div>

                {/* 접힘 상태 안내 배너 또는 결과 테이블 */}
                {isListCollapsed && filteredResults.length > 0 ? (
                    <div 
                        className="quote-collapsed-banner"
                        onClick={() => setIsListCollapsed(false)}
                    >
                        <span><Icon name="list" size="1.1em" /> 조회된 품목 <b>{filteredResults.length}건</b>의 목록이 접혀 있습니다.</span>
                        <span className="expand-link">클릭하여 펼쳐보기 <Icon name="chevDown" size="1.1em" /></span>
                    </div>
                ) : (
                    <>
                        <div className="quote-table-container">
                            <table className="data-table sticky-header">
                                <thead>
                                    <tr>
                                        <th style={{ width: '80px', textAlign: 'center' }}>공정</th>
                                        <th style={{ width: '90px', textAlign: 'center' }}>구분</th>
                                        <th>프로젝트명</th>
                                        <th>유닛명</th>
                                        <th>품목명</th>
                                        <th>메이커/재질 · 규격</th>
                                        <th style={{ width: '80px', textAlign: 'center' }}>수량</th>
                                        <th className="money-cell">단가 (₩)</th>
                                        <th className="money-cell">총액 (₩)</th>
                                        <th style={{ width: '95px', textAlign: 'center' }}>등록일</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredResults.length > 0 ? (
                                        filteredResults.map(item => {
                                            const procBadgeClass = item.processType === 'Notching' ? 'nc' : item.processType === 'Stacking' ? 'stk' : item.processType === 'Both' ? 'both' : 'other';
                                            const procBadgeText = item.processType === 'Notching' ? 'NC' : item.processType === 'Stacking' ? 'STK' : item.processType === 'Both' ? 'NC+STK' : '-';
                                            const catClass = item.normCategory === '가공품' ? 'process' : item.normCategory === '시장품' ? 'purchase' : 'other';
                                            
                                            return (
                                                <tr key={item.id}>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className={`badge-process ${procBadgeClass}`}>
                                                            {procBadgeText}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className={`badge-category cat-${catClass}`}>
                                                            {item.normCategory}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12.5px' }}>
                                                        {item.projectKey}
                                                        {(item.quoteLabel || item.quoteDate) && (
                                                            <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-tertiary)' }}>
                                                                {[item.quoteLabel, item.quoteDate].filter(Boolean).join(' · ')}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ color: item.unit_name ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                                        {item.unit_name || '-'}
                                                    </td>
                                                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                                                        {item.isLine && <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 'var(--radius-md)', padding: '0 4px', marginRight: '6px' }}>견적</span>}
                                                        {item.item_name}
                                                        {(item.parent_item || item.section) && (
                                                            <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-tertiary)' }}>
                                                                {item.parent_item ? `⤷ ${item.parent_item}` : item.section}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                        {[item.maker, item.spec].filter(Boolean).join(' · ') || '-'}
                                                    </td>
                                                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                        {item.quantity}{item.uom ? ` ${item.uom}` : ''}
                                                    </td>
                                                    <td className="money-cell" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                                                        {fmtKRW(item.unit_price)}
                                                    </td>
                                                    <td className="money-cell" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        {fmtKRW(item.total_price)}
                                                    </td>
                                                    <td style={{ color: 'var(--text-tertiary)', fontSize: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        {new Date(item.created_at).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="10" style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '36px 20px' }}>
                                                <div style={{ fontSize: '24px', marginBottom: '8px' }}><Icon name="search" size="1.1em" /></div>
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>선택하신 조건에 해당하는 견적 품목이 없습니다.</div>
                                                <div style={{ fontSize: '12px', color: 'var(--ink-4)', marginTop: '4px' }}>공정, 프로젝트 또는 구분 조건을 변경하거나 초기화해 보세요.</div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {filteredResults.length > 8 && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsListCollapsed(true)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--ink-3)',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        padding: '4px 8px'
                                    }}
                                >
                                    <Icon name="chevUp" size="1.1em" /> 목록 접기
                                </button>
                            </div>
                        )}
                    </>
                )}
            </>
        ) : (
            <div 
                onClick={() => toggleSection('itemSearch')}
                style={{
                    padding: '12px 16px',
                    background: 'var(--bg-card-subtle)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    color: 'var(--ink-3)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginTop: '8px'
                }}
            >
                <Icon name="search" size="1.1em" /> 품목별 견적 단가 조회 및 비교 섹션이 접혀 있습니다. (총 {filteredResults.length}건 검색됨, 클릭하여 펼치기 <Icon name="chevDown" size="1.1em" /> )
            </div>
        )}
    </section>
    )}

    {(activeQuoteSection === 'all' || activeQuoteSection === 'projectSummary') && (
            <section>
                <div className="title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0 }}>프로젝트별 견적 비용 집계</h2>
                            <button
                                type="button"
                                onClick={() => toggleSection('projectSummary')}
                                style={{
                                    background: collapsedSections.projectSummary ? 'var(--brand)' : 'var(--bg-card-subtle)',
                                    color: collapsedSections.projectSummary ? 'var(--btn-ink)' : 'var(--ink-2)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                {collapsedSections.projectSummary ? '펼치기' : '접기'}
                            </button>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--brand)', fontWeight: 'normal' }}>
                            ※품목별 견적단가를 확인하기 위한 단순 합산 집계로 최종 견적 금액과 총 금액의 차이가 있을 수 있습니다.
                        </span>
                    </div>
                    {!collapsedSections.projectSummary && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                onClick={() => toggleAllProjects(true)}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '12px',
                                    background: 'var(--bg-card-subtle)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <Icon name="chevDown" size="1.1em" /> 모든 프로젝트 펼치기
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleAllProjects(false)}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '12px',
                                    background: 'var(--bg-card-subtle)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <Icon name="chevUp" size="1.1em" /> 모든 프로젝트 접기
                            </button>
                        </div>
                    )}
                </div>
                {!collapsedSections.projectSummary ? (
                    <div style={{ marginTop: '15px' }}>
                        {Object.values(groupedQuotations).map(group => (
                            <div key={group.name} className="project-accordion">
                                <div className="pa-header" onClick={() => toggleProject(group.name)}>
                                    <div className="pa-title">
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {group.name}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!canManage) return notifyPermission('프로젝트 견적 전체 삭제');
                                                    handleDeleteProjectQuotations(e, group);
                                                }} 
                                                style={{
                                                    padding: '2px 8px',
                                                    fontSize: '11px',
                                                    color: 'var(--on-brand)',
                                                    background: canManage ? 'var(--bad)' : 'var(--ink-4)',
                                                    border: 'none',
                                                    borderRadius: 'var(--radius-md)',
                                                    cursor: 'pointer'
                                                }}
                                                title={!canManage ? "삭제 권한이 없습니다 (클릭 시 권한 안내)" : ""}
                                            >
                                                전체 삭제 {!canManage && <Icon name="lock" size={12} />}
                                            </button>
                                        </h3>
                                        <div className="pa-summary">
                                            <span className="pa-badge other">견적 {group.quotations.length}건</span>
                                            <span className="pa-badge process"><Icon name="receipt" size="1.1em" /> 부품 {group.part_count}개</span>
                                            <span className="pa-badge purchase"><Icon name="list" size="1.1em" /> 견적 항목 {group.line_count}개</span>
                                            {group.latest_date && <span className="pa-badge other">최근 견적일 {group.latest_date}</span>}
                                        </div>
                                    </div>
                                    <div className="pa-total" title="같은 견적번호는 최신 리비전 총액만 합산">총 ₩ {fmtKRW(group.total_amount)} <span>{expandedProjects[group.name] ? '' : ''}</span></div>
                                </div>
                                
                                {expandedProjects[group.name] && (
                                    <div className="pa-body">
                                        {group.quotations.map((quotation) => {
                                            const itemsInQuotation = quotationItems
                                                .filter(item => item.quotation_id === quotation.id)
                                                .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));
                                            // 견적 항목 → 상세 리스트 종류별(형교환 상세 / 개조 상세 …)로 묶어서 보여준다
                                            const itemGroups = [];
                                            const lineItems = itemsInQuotation.filter(i => i.source === 'quotation');
                                            if (lineItems.length) itemGroups.push({ key: 'lines', label: '견적 항목 (SET · 인건비 · 경비)', items: lineItems });
                                            itemsInQuotation.filter(i => i.source !== 'quotation').forEach(i => {
                                                const label = `${i.section || '부품 상세'}`;
                                                let g = itemGroups.find(x => x.label === label);
                                                if (!g) { g = { key: label, label, items: [] }; itemGroups.push(g); }
                                                g.items.push(i);
                                            });
                                            return (
                                                <div key={quotation.id} className="pa-quotation">
                                                    <h4 className="pa-quotation-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span>
                                                            <Icon name="file" size="1.1em" /> {quotation.title}{' '}
                                                            <small>
                                                                ({[quotation.quote_no, quotation.revision, quotation.quote_date ? `견적일 ${quotation.quote_date}` : null].filter(Boolean).join(' · ') || '견적번호 없음'} / 등록 {new Date(quotation.created_at).toLocaleDateString()})
                                                            </small>
                                                            {quotation.parse_summary && quotation.parse_summary.errors > 0 && (
                                                                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--bad)' }}><Icon name="alert" size="1.1em" /> 검증 오류 {quotation.parse_summary.errors}건</span>
                                                            )}
                                                        </span>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (!canManage) return notifyPermission('견적 삭제');
                                                                handleDeleteQuotation(quotation.id);
                                                            }} 
                                                            style={{
                                                                padding: '2px 8px',
                                                                fontSize: '11px',
                                                                color: 'var(--on-brand)',
                                                                background: canManage ? 'var(--bad)' : 'var(--ink-4)',
                                                                border: 'none',
                                                                borderRadius: 'var(--radius-md)',
                                                                cursor: 'pointer'
                                                            }}
                                                            title={!canManage ? "삭제 권한이 없습니다 (클릭 시 권한 안내)" : ""}
                                                        >
                                                            삭제 {!canManage && <Icon name="lock" size={12} />}
                                                        </button>
                                                    </h4>
                                                    <div style={{ overflowX: 'auto' }}>
                                                        <table className="data-table nested">
                                                            <thead>
                                                                <tr>
                                                                    <th>구분</th>
                                                                    <th>유닛명</th>
                                                                    <th>품목명</th>
                                                                    <th>메이커/재질 · 규격</th>
                                                                    <th>수량</th>
                                                                    <th className="money-cell">단가 (₩)</th>
                                                                    <th className="money-cell">총액 (₩)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {itemGroups.map(g => (
                                                                    <Fragment key={g.key}>
                                                                        {itemGroups.length > 1 && (
                                                                            <tr>
                                                                                <td colSpan="7" style={{ background: 'var(--bg-card-subtle)', fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                                                                                    {g.label} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>· {g.items.length}개</span>
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                        {g.items.map(item => {
                                                                            const cat = normalizeCategory(item.item_category);
                                                                            return (
                                                                                <tr key={item.id}>
                                                                                    <td><span className={`badge-category cat-${categoryBadgeClass(cat)}`}>{cat}</span></td>
                                                                                    <td>{item.unit_name || (item.source === 'quotation' ? item.section : '') || '-'}</td>
                                                                                    <td>
                                                                                        {item.item_name}
                                                                                        {item.parent_item && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>⤷ {item.parent_item}</div>}
                                                                                        {item.check_status === 'mismatch' && <span style={{ color: 'var(--bad)', fontSize: '11px' }}> <Icon name="alert" size="1.1em" /> 수량×단가≠금액</span>}
                                                                                    </td>
                                                                                    <td style={{ fontSize: '12px' }}>{[item.maker, item.spec].filter(Boolean).join(' · ') || '-'}</td>
                                                                                    <td>{item.quantity}{item.uom ? ` ${item.uom}` : ''}</td>
                                                                                    <td className="money-cell">{fmtKRW(item.unit_price)}</td>
                                                                                    <td className="money-cell">{fmtKRW(item.total_price)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </Fragment>
                                                                ))}
                                                                {itemsInQuotation.length === 0 && <tr><td colSpan="7">품목이 없습니다.</td></tr>}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                        {Object.values(groupedQuotations).length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-2)', border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)', borderRadius: 'var(--radius-md)' }}>
                                아직 등록된 견적서가 없습니다.
                            </div>
                        )}
                    </div>
                ) : (
                    <div 
                        onClick={() => toggleSection('projectSummary')}
                        style={{
                            padding: '12px 16px',
                            background: 'var(--bg-card-subtle)',
                            border: '1px dashed var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            textAlign: 'center',
                            color: 'var(--ink-3)',
                            fontSize: '13px',
                            cursor: 'pointer',
                            marginTop: '12px'
                        }}
                    >
                        <Icon name="barChart" size="1.1em" /> 프로젝트별 견적 비용 집계 ({Object.keys(groupedQuotations).length}개 프로젝트)가 접혀 있습니다. (클릭하여 펼치기 <Icon name="chevDown" size="1.1em" /> )
                    </div>
                )}
            </section>
            )}
        </>
    );
}
