import React, { useState, useRef, useEffect } from 'react';
import './Quotations.css';
import { supabase } from './supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';

export default function Quotations({ projects, session }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    
    // 직접 입력을 위한 상태
    const [selectedProjectInput, setSelectedProjectInput] = useState('');
    
    const [quotations, setQuotations] = useState([]);
    const [quotationItems, setQuotationItems] = useState([]);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    
    // 카테고리 필터
    const [filterCategory, setFilterCategory] = useState({
        '가공품': true,
        '구매품': true,
        '용역/기타': true
    });

    const [msg, setMsg] = useState('');
    const [expandedProjects, setExpandedProjects] = useState({});
    
    const fileInputRef = useRef(null);
    const searchContainerRef = useRef(null);

    useEffect(() => {
        loadQuotationsData();
        
        // 검색창 바깥 클릭 시 드롭다운 닫기
        const handleClickOutside = (event) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const loadQuotationsData = async () => {
        try {
            const { data: qData, error: qError } = await supabase.from('quotations').select('*');
            if (qError) throw qError;
            setQuotations(qData || []);

            const { data: iData, error: iError } = await supabase.from('quotation_items').select('*');
            if (iError) throw iError;
            setQuotationItems(iData || []);
        } catch (error) {
            console.error("Failed to load quotations:", error);
            setMsg("데이터를 불러오는데 실패했습니다: " + error.message);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleFileUpload(file);
    };

    const determineCategory = (text) => {
        const lower = String(text).toLowerCase();
        if (/개조|개발|이설|비용|용역/i.test(lower)) return '용역/기타';
        if (/스틸|al|알루미늄|acetal|아세탈|peak|피크|도면/i.test(lower)) return '가공품';
        // 기본값 및 Maker가 있는 경우
        return '구매품';
    };

    const handleFileUpload = async (file) => {
        if (!file) return;
        if (!selectedProjectInput.trim()) {
            setMsg("업로드하기 전에 견적서를 연결할 프로젝트명을 입력하거나 선택해주세요.");
            return;
        }

        setIsExtracting(true);
        setMsg("견적서를 분석 중입니다...");

        try {
            let extractedData = { title: file.name, items: [] };

            if (file.name.match(/\.(xlsx|xls)$/i)) {
                // 엑셀 처리
                const data = await file.arrayBuffer();
                const wb = XLSX.read(data, { cellDates: false });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                rows.forEach(row => {
                    if (row.length >= 4) {
                        const strRow = row.join(' ').toLowerCase();
                        if (!strRow.includes('합계') && !strRow.includes('품명')) {
                            const nums = row.map(v => parseFloat(v)).filter(n => !isNaN(n));
                            const nameIdx = row.findIndex(v => typeof v === 'string' && v.trim().length > 1);
                            
                            if (nameIdx !== -1 && nums.length >= 2) {
                                extractedData.items.push({
                                    item_name: row[nameIdx],
                                    item_category: determineCategory(strRow),
                                    quantity: nums[0],
                                    unit_price: nums[1],
                                    total_price: nums.length > 2 ? nums[2] : nums[0] * nums[1]
                                });
                            }
                        }
                    }
                });
            } else if (file.type.startsWith("image/") || file.name.match(/\.(pdf)$/i)) {
                // Gemini API 처리
                const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
                if (!apiKey) throw new Error("AI 분석용 Gemini API 키가 설정되지 않았습니다.");
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" }); 
                
                const reader = new FileReader();
                const b64 = await new Promise(res => {
                    reader.onload = () => res(reader.result);
                    reader.readAsDataURL(file);
                });
                const b64d = b64.split(",")[1];
                
                const prompt = `당신은 견적서(Quotation) 데이터를 분석하는 전문가입니다. 첨부된 이미지나 문서를 분석하여 아래 JSON 구조로만 데이터를 추출하세요.
요구사항:
1. title: 견적서의 제목이나 발행처 이름
2. items: 배열 형태. 품목명(item_name), 품목구분(item_category), 수량(quantity), 단가(unit_price), 총액(total_price)
품목구분(item_category) 규칙:
 - Maker가 명시되어 있는 상용품은 "구매품"
 - 스틸계열, AL계열, Acetal, Peak재질, 도면참조 등 제작/가공품은 "가공품"
 - 개조, 개발, 이설 관련 비용은 "용역/기타"
 
주의: JSON 이외의 어떠한 설명이나 마크다운을 포함하지 말고 순수 JSON만 응답하세요. 숫자는 콤마 없이 입력하세요.
출력 예시:
{
  "title": "부품 견적서",
  "items": [
    { "item_name": "도면참조 Base Plate", "item_category": "가공품", "quantity": 2, "unit_price": 5000000, "total_price": 10000000 },
    { "item_name": "SMC 실린더", "item_category": "구매품", "quantity": 4, "unit_price": 300000, "total_price": 1200000 }
  ]
}`;
                
                const result = await model.generateContent([
                    { inlineData: { data: b64d, mimeType: file.type } },
                    prompt
                ]);
                
                let responseText = result.response.text().trim();
                responseText = responseText.replace(/^\`\`\`json\s*/, "").replace(/\s*\`\`\`$/, "");
                const json = JSON.parse(responseText);
                
                extractedData.title = json.title || file.name;
                extractedData.items = json.items || [];
            } else {
                throw new Error("지원하지 않는 파일 형식입니다. (Excel, PDF, 이미지)");
            }

            if (extractedData.items.length === 0) {
                throw new Error("파일에서 품목 데이터를 추출하지 못했습니다.");
            }

            // Project ID 매핑 로직 (입력값이 프로젝트 목록에 있는지 확인)
            const matchedProject = projects.find(p => p.name === selectedProjectInput.trim() || p.manufacturing_no === selectedProjectInput.trim());
            const projectId = matchedProject ? matchedProject.id : null;
            const projectName = matchedProject ? null : selectedProjectInput.trim();

            const totalAmount = extractedData.items.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
            
            const { data: newQuot, error: qErr } = await supabase.from('quotations').insert({
                project_id: projectId,
                project_name: projectName,
                title: extractedData.title,
                total_amount: totalAmount
            }).select().single();
            
            if (qErr) throw qErr;

            const itemsToInsert = extractedData.items.map(item => ({
                quotation_id: newQuot.id,
                item_name: item.item_name,
                item_category: item.item_category || '구매품',
                quantity: parseFloat(item.quantity) || 1,
                unit_price: parseFloat(item.unit_price) || 0,
                total_price: parseFloat(item.total_price) || 0
            }));

            const { error: iErr } = await supabase.from('quotation_items').insert(itemsToInsert);
            if (iErr) throw iErr;

            setMsg(`견적서 저장 완료! 총 ${itemsToInsert.length}개의 품목이 추출되었습니다.`);
            loadQuotationsData();
            
        } catch (error) {
            console.error("Upload Error:", error);
            setMsg("분석/저장 실패: " + error.message);
        } finally {
            setIsExtracting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleCheckboxChange = (cat) => {
        setFilterCategory(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    // 고유 품목명 추출 (자동완성용)
    const uniqueItemNames = [...new Set(quotationItems.map(item => item.item_name))].sort();
    
    // 자동완성 드롭다운 필터링
    const suggestedItems = uniqueItemNames.filter(name => 
        name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // 검색 결과 필터링
    const searchResults = quotationItems.filter(item => {
        if (!searchQuery) return false; // 검색어가 없으면 결과 렌더링 안 함
        
        const matchName = item.item_name.toLowerCase() === searchQuery.toLowerCase() || 
                          item.item_name.toLowerCase().includes(searchQuery.toLowerCase());
        
        let matchCategory = false;
        if (item.item_category === '가공품' && filterCategory['가공품']) matchCategory = true;
        if (item.item_category === '구매품' && filterCategory['구매품']) matchCategory = true;
        if (item.item_category === '용역/기타' && filterCategory['용역/기타']) matchCategory = true;
        
        return matchName && matchCategory;
    });

    const selectSuggestion = (name) => {
        setSearchQuery(name);
        setIsSearchFocused(false);
    };

    // 프로젝트 및 직접 입력 이름 기준 그룹화
    const groupedQuotations = {};
    quotations.forEach(q => {
        // 기존 프로젝트에 연결된 경우 프로젝트 이름 사용, 아니면 직접 입력된 이름 사용
        let key = "미지정 프로젝트";
        if (q.project_id) {
            const p = projects.find(proj => proj.id === q.project_id);
            if (p) key = `${p.manufacturing_no} · ${p.name}`;
        } else if (q.project_name) {
            key = q.project_name;
        }
        
        if (!groupedQuotations[key]) {
            groupedQuotations[key] = {
                name: key,
                quotations: [],
                total_amount: 0
            };
        }
        groupedQuotations[key].quotations.push(q);
        groupedQuotations[key].total_amount += Number(q.total_amount);
    });

    const toggleProject = (name) => {
        setExpandedProjects(prev => ({ ...prev, [name]: !prev[name] }));
    };

    return (
        <div className="quotations-container">
            <header className="quotations-header">
                <div className="logo-area">
                    <div className="logo-text" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>
                            <span style={{color: 'var(--primary)'}}>견적</span> 데이터베이스
                        </h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>프로젝트 투입 비용 관리 및 과거 단가 검색</p>
                </div>
            </header>

            <div className="quotations-main">
                <aside className="quotations-sidebar">
                    <div className="form-group">
                        <label>적용할 프로젝트명 (선택 또는 직접 입력)</label>
                        <input 
                            type="text"
                            list="project-list"
                            className="form-control" 
                            placeholder="프로젝트명을 입력하세요..."
                            value={selectedProjectInput}
                            onChange={(e) => setSelectedProjectInput(e.target.value)}
                        />
                        <datalist id="project-list">
                            {projects.map(p => (
                                <option key={p.id} value={p.name}>{p.manufacturing_no} · {p.name}</option>
                            ))}
                        </datalist>
                    </div>

                    <div 
                        className={`dropzone ${isDragging ? 'dragover' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current.click()}
                        style={{marginTop: '1rem', opacity: selectedProjectInput.trim() ? 1 : 0.5, pointerEvents: selectedProjectInput.trim() ? 'auto' : 'none'}}
                    >
                        <div className="dropzone-icon">📄</div>
                        <div className="dropzone-text">{isExtracting ? "분석 중..." : "견적서 파일 업로드"}</div>
                        <div className="dropzone-subtext">Excel, PDF, 이미지 지원<br/>AI가 자동으로 품목을 추출합니다.</div>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, .pdf, image/*" style={{display: 'none'}} />

                    {msg && (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '8px', fontSize: '0.85rem' }}>
                            {msg}
                        </div>
                    )}
                </aside>

                <main className="quotations-content">
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">품목별 단가 검색</div>
                            <div className="filter-checkboxes">
                                <label><input type="checkbox" checked={filterCategory['가공품']} onChange={() => handleCheckboxChange('가공품')} /> 가공품</label>
                                <label><input type="checkbox" checked={filterCategory['구매품']} onChange={() => handleCheckboxChange('구매품')} /> 구매품</label>
                                <label><input type="checkbox" checked={filterCategory['용역/기타']} onChange={() => handleCheckboxChange('용역/기타')} /> 개조/이설/기타</label>
                            </div>
                        </div>
                        
                        <div className="search-bar" ref={searchContainerRef} style={{ position: 'relative' }}>
                            <input 
                                type="text" 
                                className="search-input" 
                                placeholder="품목명을 검색하세요 (예: 렌즈, 서버, 모터)"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setIsSearchFocused(true);
                                }}
                                onFocus={() => setIsSearchFocused(true)}
                            />
                            
                            {/* 자동완성 팝업 */}
                            {isSearchFocused && suggestedItems.length > 0 && (
                                <ul className="autocomplete-dropdown">
                                    {suggestedItems.slice(0, 100).map((name, idx) => (
                                        <li key={idx} onMouseDown={() => selectSuggestion(name)}>
                                            {name}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        
                        {searchQuery && (
                            <div style={{ padding: '0 0 1.5rem 0' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>구분</th>
                                            <th>품목명</th>
                                            <th>수량</th>
                                            <th className="money-cell">단가 (₩)</th>
                                            <th>등록일</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {searchResults.length > 0 ? (
                                            searchResults.map(item => (
                                                <tr key={item.id}>
                                                    <td><span className={`badge-category cat-${item.item_category === '가공품' ? 'process' : item.item_category === '구매품' ? 'purchase' : 'other'}`}>{item.item_category}</span></td>
                                                    <td>{item.item_name}</td>
                                                    <td>{item.quantity}</td>
                                                    <td className="money-cell">{Number(item.unit_price).toLocaleString()}</td>
                                                    <td>{new Date(item.created_at).toLocaleDateString()}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="5" style={{ textAlign: 'center', color: '#57606a' }}>검색 결과가 없습니다. 체크박스 필터를 확인해주세요.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">프로젝트별 견적 비용 집계</div>
                        </div>
                        <div>
                            {Object.values(groupedQuotations).map(group => (
                                <div key={group.name} className="accordion-item">
                                    <div className="accordion-header" onClick={() => toggleProject(group.name)}>
                                        <div className="accordion-title">{group.name}</div>
                                        <div className="accordion-amount">총 ₩ {group.total_amount.toLocaleString()} <span>{expandedProjects[group.name] ? '▴' : '▾'}</span></div>
                                    </div>
                                    {expandedProjects[group.name] && (
                                        <div className="accordion-body">
                                            <table className="data-table" style={{ background: '#fff', margin: '1rem', width: 'calc(100% - 2rem)', border: '1px solid #d0d7de', borderRadius: '8px' }}>
                                                <thead>
                                                    <tr>
                                                        <th>견적서명</th>
                                                        <th>구분</th>
                                                        <th>품목명</th>
                                                        <th>수량</th>
                                                        <th className="money-cell">단가 (₩)</th>
                                                        <th className="money-cell">총액 (₩)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {quotationItems
                                                        .filter(item => group.quotations.some(q => q.id === item.quotation_id))
                                                        .map(item => {
                                                            const qName = group.quotations.find(q => q.id === item.quotation_id)?.title;
                                                            return (
                                                                <tr key={item.id}>
                                                                    <td style={{ fontSize: '0.8rem', color: '#57606a' }}>{qName}</td>
                                                                    <td><span className={`badge-category cat-${item.item_category === '가공품' ? 'process' : item.item_category === '구매품' ? 'purchase' : 'other'}`}>{item.item_category}</span></td>
                                                                    <td>{item.item_name}</td>
                                                                    <td>{item.quantity}</td>
                                                                    <td className="money-cell">{Number(item.unit_price).toLocaleString()}</td>
                                                                    <td className="money-cell">{Number(item.total_price).toLocaleString()}</td>
                                                                </tr>
                                                            );
                                                        })
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {Object.values(groupedQuotations).length === 0 && (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#57606a' }}>
                                    아직 등록된 견적서가 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
