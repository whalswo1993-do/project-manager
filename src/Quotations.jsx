import React, { useState, useRef, useEffect } from 'react';
import './Quotations.css';
import { supabase } from './supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';

export default function Quotations({ projects, session, role }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [selectedProjectInput, setSelectedProjectInput] = useState('');
    const [quotations, setQuotations] = useState([]);
    const [quotationItems, setQuotationItems] = useState([]);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [sortOrder, setSortOrder] = useState('recent'); // 'recent' or 'priceDesc'
    
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

    const loadQuotationsData = async () => {
        try {
            const { data: qData, error: qError } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
            if (qError) throw qError;
            setQuotations(qData || []);

            const { data: iData, error: iError } = await supabase.from('quotation_items').select('*').order('created_at', { ascending: false });
            if (iError) throw iError;
            setQuotationItems(iData || []);
        } catch (error) {
            console.error("Failed to load quotations:", error);
            setMsg("데이터를 불러오는데 실패했습니다: " + error.message);
        }
    };

    const determineCategory = (text) => {
        const lower = String(text).toLowerCase();
        if (/개조|개발|이설|비용|용역/i.test(lower)) return '용역/기타';
        if (/스틸|al|알루미늄|acetal|아세탈|peak|피크|도면/i.test(lower)) return '가공품';
        return '구매품';
    };

    const handleFileUpload = async (fileOrText) => {
        if (!fileOrText) return;
        if (!selectedProjectInput.trim()) {
            setMsg("업로드하기 전에 견적서를 연결할 프로젝트명을 입력하거나 선택해주세요.");
            return;
        }

        setIsExtracting(true);
        setMsg("견적서를 분석 중입니다...");

        try {
            let extractedData = { title: typeof fileOrText === 'string' ? '클립보드 붙여넣기' : fileOrText.name, items: [] };

            if (typeof fileOrText === 'string') {
                const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
                if (!apiKey) throw new Error("AI 분석용 Gemini API 키가 설정되지 않았습니다.");
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" }); 
                
                const prompt = `당신은 견적서(Quotation) 데이터를 분석하는 전문가입니다. 첨부된 엑셀 복사 데이터를 분석하여 아래 JSON 구조로만 데이터를 추출하세요.
요구사항:
1. title: 문서의 제목(알 수 없으면 "클립보드 견적 데이터"로 입력)
2. items: 배열 형태. 품목명(item_name), 유닛명(unit_name), 품목구분(item_category), 수량(quantity), 단가(unit_price), 총액(total_price)
유닛명(unit_name) 규칙:
 - 어떤 유닛/파트에 들어가는 부품인지 명시되어 있다면 해당 유닛명을 추출, 없으면 빈 문자열("")
품목구분(item_category) 규칙:
 - Maker가 명시되어 있는 상용품은 "구매품"
 - 스틸계열, AL계열, Acetal, Peak재질, 도면참조 등 제작/가공품은 "가공품"
 - 개발, 이설 관련 비용은 "용역/기타"
 
주의: JSON 이외의 어떠한 설명이나 마크다운을 포함하지 말고 순수 JSON만 응답하세요. 숫자는 콤마 없이 입력하세요.
출력 예시:
{
  "title": "클립보드 견적 데이터",
  "items": [
    { "item_name": "도면참조 Base Plate", "unit_name": "Stacking부", "item_category": "가공품", "quantity": 2, "unit_price": 5000000, "total_price": 10000000 }
  ]
}`;
                
                const result = await model.generateContent([
                    { text: fileOrText },
                    prompt
                ]);
                
                let responseText = result.response.text().trim();
                responseText = responseText.replace(/^\`\`\`json\s*/, "").replace(/\s*\`\`\`$/, "");
                const json = JSON.parse(responseText);
                
                extractedData.title = json.title || '클립보드 데이터';
                extractedData.items = json.items || [];
            } else if (fileOrText.name.match(/\.(xlsx|xls)$/i)) {
                const data = await fileOrText.arrayBuffer();
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
            } else if (fileOrText.type.startsWith("image/") || fileOrText.name.match(/\.(pdf)$/i)) {
                const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
                if (!apiKey) throw new Error("AI 분석용 Gemini API 키가 설정되지 않았습니다.");
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" }); 
                
                const reader = new FileReader();
                const b64 = await new Promise(res => {
                    reader.onload = () => res(reader.result);
                    reader.readAsDataURL(fileOrText);
                });
                const b64d = b64.split(",")[1];
                
                const prompt = `당신은 견적서(Quotation) 데이터를 분석하는 전문가입니다. 첨부된 이미지나 문서를 분석하여 아래 JSON 구조로만 데이터를 추출하세요.
요구사항:
1. title: 견적서의 제목이나 발행처 이름
2. items: 배열 형태. 품목명(item_name), 유닛명(unit_name), 품목구분(item_category), 수량(quantity), 단가(unit_price), 총액(total_price)
유닛명(unit_name) 규칙:
 - 어떤 유닛/파트에 들어가는 부품인지 명시되어 있다면 해당 유닛명을 추출, 없으면 빈 문자열("")
품목구분(item_category) 규칙:
 - Maker가 명시되어 있는 상용품은 "구매품"
 - 스틸계열, AL계열, Acetal, Peak재질, 도면참조 등 제작/가공품은 "가공품"
 - 개발, 이설 관련 비용은 "용역/기타"
 
주의: JSON 이외의 어떠한 설명이나 마크다운을 포함하지 말고 순수 JSON만 응답하세요. 숫자는 콤마 없이 입력하세요.
출력 예시:
{
  "title": "부품 견적서",
  "items": [
    { "item_name": "도면참조 Base Plate", "unit_name": "Stacking부", "item_category": "가공품", "quantity": 2, "unit_price": 5000000, "total_price": 10000000 },
    { "item_name": "SMC 실린더", "unit_name": "Lifter", "item_category": "구매품", "quantity": 4, "unit_price": 300000, "total_price": 1200000 }
  ]
}`;
                
                const result = await model.generateContent([
                    { inlineData: { data: b64d, mimeType: fileOrText.type } },
                    prompt
                ]);
                
                let responseText = result.response.text().trim();
                responseText = responseText.replace(/^\`\`\`json\s*/, "").replace(/\s*\`\`\`$/, "");
                const json = JSON.parse(responseText);
                
                extractedData.title = json.title || fileOrText.name;
                extractedData.items = json.items || [];
            } else {
                throw new Error("지원하지 않는 파일 형식입니다. (Excel, PDF, 이미지, 클립보드 텍스트)");
            }

            if (extractedData.items.length === 0) {
                throw new Error("파일에서 품목 데이터를 추출하지 못했습니다.");
            }

            const matchedProject = projects.find(p => p.name === selectedProjectInput.trim() || p.manufacturing_no === selectedProjectInput.trim());
            const projectId = matchedProject ? matchedProject.id : null;
            const projectName = matchedProject ? null : selectedProjectInput.trim();

            const totalAmount = extractedData.items.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
            
            let targetQuotId;
            let existingQuots = [];

            if (projectId) {
                const { data } = await supabase.from('quotations').select('id').eq('project_id', projectId).eq('title', extractedData.title);
                existingQuots = data || [];
            } else if (projectName) {
                const { data } = await supabase.from('quotations').select('id').eq('project_name', projectName).eq('title', extractedData.title);
                existingQuots = data || [];
            }

            if (existingQuots.length > 0) {
                targetQuotId = existingQuots[0].id;
                
                if (existingQuots.length > 1) {
                    const extraIds = existingQuots.slice(1).map(q => q.id);
                    await supabase.from('quotation_items').delete().in('quotation_id', extraIds);
                    await supabase.from('quotations').delete().in('id', extraIds);
                }

                const { error: upErr } = await supabase.from('quotations').update({
                    title: extractedData.title,
                    total_amount: totalAmount,
                    created_at: new Date().toISOString()
                }).eq('id', targetQuotId);
                if (upErr) throw upErr;
                
                const { error: delErr } = await supabase.from('quotation_items').delete().eq('quotation_id', targetQuotId);
                if (delErr) throw delErr;
            } else {
                const { data: newQuot, error: qErr } = await supabase.from('quotations').insert({
                    project_id: projectId,
                    project_name: projectName,
                    title: extractedData.title,
                    total_amount: totalAmount
                }).select().single();
                if (qErr) throw qErr;
                targetQuotId = newQuot.id;
            }

            const itemsToInsert = extractedData.items.map(item => ({
                quotation_id: targetQuotId,
                item_name: item.item_name,
                unit_name: item.unit_name || '',
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
            let userFriendlyMsg = "견적서를 분석하거나 저장하는 도중 알 수 없는 오류가 발생했습니다.";
            if (error.message.includes("429")) {
                userFriendlyMsg = "AI 분석 요청 횟수(무료 할당량)를 초과했습니다. 약 1분 후 다시 시도해주세요.";
            } else if (error.message.includes("503")) {
                userFriendlyMsg = "AI 분석 서버에 일시적인 과부하가 발생했습니다. 잠시 후 다시 시도해주세요.";
            } else if (error.message.includes("지원하지 않는 파일") || error.message.includes("추출하지 못했습니다") || error.message.includes("API 키가")) {
                userFriendlyMsg = error.message;
            }
            
            setMsg(
                <span style={{ color: '#ef4444' }}>
                    분석/저장 실패: {userFriendlyMsg}
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal', marginTop: '4px' }}>
                        원인파악용 기술 정보: {error.message}
                    </div>
                </span>
            );
        } finally {
            setIsExtracting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
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

    const handleCheckboxChange = (cat) => {
        setFilterCategory(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    const uniqueItemNames = [...new Set(quotationItems.map(item => item.item_name))].sort();
    const suggestedItems = uniqueItemNames.filter(name => 
        name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    let searchResults = quotationItems.filter(item => {
        if (!searchQuery) return false;
        
        const matchName = item.item_name.toLowerCase() === searchQuery.toLowerCase() || 
                          item.item_name.toLowerCase().includes(searchQuery.toLowerCase());
        
        let matchCategory = false;
        if (item.item_category === '가공품' && filterCategory['가공품']) matchCategory = true;
        if (item.item_category === '구매품' && filterCategory['구매품']) matchCategory = true;
        if (item.item_category === '용역/기타' && filterCategory['용역/기타']) matchCategory = true;
        
        return matchName && matchCategory;
    });

    if (sortOrder === 'priceDesc') {
        searchResults.sort((a, b) => b.unit_price - a.unit_price);
    } else {
        searchResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const selectSuggestion = (name) => {
        setSearchQuery(name);
        setIsSearchFocused(false);
    };

    const groupedQuotations = {};
    quotations.forEach(q => {
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
                total_amount: 0,
                process_amount: 0,
                purchase_amount: 0,
                other_amount: 0
            };
        }
        groupedQuotations[key].quotations.push(q);
        groupedQuotations[key].total_amount += Number(q.total_amount);
        
        // 카테고리별 누적액 계산
        const qItems = quotationItems.filter(item => item.quotation_id === q.id);
        qItems.forEach(item => {
            if (item.item_category === '가공품') groupedQuotations[key].process_amount += Number(item.total_price);
            else if (item.item_category === '구매품') groupedQuotations[key].purchase_amount += Number(item.total_price);
            else groupedQuotations[key].other_amount += Number(item.total_price);
        });
    });

    const toggleProject = (name) => {
        setExpandedProjects(prev => ({ ...prev, [name]: !prev[name] }));
    };

    return (
        <>
            <section>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                    <h2>새 견적서 등록</h2>
                    <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                        <input type="file" ref={fileInputRef} onChange={e=>handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, image/*, .pdf" style={{display:'none'}}/>
                        <textarea 
                            placeholder="엑셀 표 붙여넣기 (Ctrl+V)"
                            disabled={isExtracting}
                            style={{
                                height: '35px',
                                width: '180px',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: '1px solid #10b981',
                                outline: 'none',
                                resize: 'none',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                boxSizing: 'border-box',
                                fontSize: '13px',
                                fontFamily: 'inherit'
                            }}
                            onPaste={(e) => {
                                const items = e.clipboardData?.items;
                                if (items) {
                                    for (let i = 0; i < items.length; i++) {
                                        const item = items[i];
                                        if (item.type.indexOf("image") !== -1) {
                                            e.preventDefault();
                                            const file = item.getAsFile();
                                            if (file) { handleFileUpload(file); return; }
                                        }
                                    }
                                }
                                const text = e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text");
                                if (text && text.trim().length > 5) {
                                    e.preventDefault();
                                    e.target.value = ""; // 입력창 비우기
                                    handleFileUpload(text);
                                }
                            }}
                        />
                        <button onClick={()=>fileInputRef.current.click()} disabled={isExtracting} style={{background:isExtracting?'#94a3b8':'linear-gradient(135deg, #10b981, #059669)',color:'#fff',padding:'8px 14px',borderRadius:'8px',fontWeight:'bold',border:'none',boxShadow:'0 2px 5px rgba(0,0,0,0.1)', height:'35px', whiteSpace:'nowrap'}}>
                            {isExtracting ? "✨ AI 분석 중..." : "✨ 파일 첨부 (Excel/이미지)"}
                        </button>
                    </div>
                </div>
                <div className="grid">
                    <label className="wide" style={{ gridColumn: 'span 7' }}>
                        적용할 프로젝트명 (선택 또는 직접 입력)
                        <input 
                            type="text"
                            list="project-list"
                            placeholder="A사 10라인 라우팅..."
                            value={selectedProjectInput}
                            onChange={(e) => setSelectedProjectInput(e.target.value)}
                        />
                        <datalist id="project-list">
                            {projects.map(p => (
                                <option key={p.id} value={p.name}>{p.manufacturing_no} · {p.name}</option>
                            ))}
                        </datalist>
                    </label>
                </div>
                

                {msg && <p className="notice" style={{marginTop:'10px',fontWeight:'bold',color:'#059669'}}>{msg}</p>}
            </section>

            <section>
                <div className="filterbar">
                    <h2>품목별 단가 검색</h2>
                    <div className="category-checkboxes">
                        <label><input type="checkbox" checked={filterCategory['가공품']} onChange={() => handleCheckboxChange('가공품')} /> 가공품</label>
                        <label><input type="checkbox" checked={filterCategory['구매품']} onChange={() => handleCheckboxChange('구매품')} /> 구매품</label>
                        <label><input type="checkbox" checked={filterCategory['용역/기타']} onChange={() => handleCheckboxChange('용역/기타')} /> 개발/이설/기타</label>
                    </div>
                    <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{maxWidth: '150px'}}>
                        <option value="recent">최신순</option>
                        <option value="priceDesc">단가 높은 순</option>
                    </select>
                </div>
                <div className="search-bar" ref={searchContainerRef} style={{ position: 'relative', marginTop: '10px' }}>
                    <input 
                        type="text" 
                        placeholder="품목명을 검색하세요 (예: 렌즈, 서버, 모터)"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsSearchFocused(true);
                        }}
                        onFocus={() => setIsSearchFocused(true)}
                        style={{ width: '100%', fontSize: '15px' }}
                    />
                    
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
                    <div style={{ marginTop: '15px', overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>구분</th>
                                    <th>유닛명</th>
                                    <th>품목명</th>
                                    <th className="money-cell">단가 (₩)</th>
                                    <th>등록일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {searchResults.length > 0 ? (
                                    searchResults.map(item => (
                                        <tr key={item.id}>
                                            <td><span className={`badge-category cat-${item.item_category === '가공품' ? 'process' : item.item_category === '구매품' ? 'purchase' : 'other'}`}>{item.item_category}</span></td>
                                            <td>{item.unit_name || '-'}</td>
                                            <td>{item.item_name}</td>
                                            <td className="money-cell">{Number(item.unit_price).toLocaleString()}</td>
                                            <td>{new Date(item.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', color: '#57606a', padding: '20px' }}>검색 결과가 없습니다. 체크박스 필터를 확인해주세요.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section>
                <div className="title">
                    <h2>프로젝트별 견적 비용 집계</h2>
                </div>
                <div style={{ marginTop: '15px' }}>
                    {Object.values(groupedQuotations).map(group => (
                        <div key={group.name} className="project-accordion">
                            <div className="pa-header" onClick={() => toggleProject(group.name)}>
                                <div className="pa-title">
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {group.name}
                                        {['admin', 'grade3'].includes(role) && (
                                            <button onClick={(e) => handleDeleteProjectQuotations(e, group)} style={{ padding: '2px 8px', fontSize: '11px', color: 'white', background: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>전체 삭제</button>
                                        )}
                                    </h3>
                                    <div className="pa-summary">
                                        <span className="pa-badge process">가공품: ₩{group.process_amount.toLocaleString()}</span>
                                        <span className="pa-badge purchase">구매품: ₩{group.purchase_amount.toLocaleString()}</span>
                                        <span className="pa-badge other">기타: ₩{group.other_amount.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="pa-total">총 ₩ {group.total_amount.toLocaleString()} <span>{expandedProjects[group.name] ? '▴' : '▾'}</span></div>
                            </div>
                            
                            {expandedProjects[group.name] && (
                                <div className="pa-body">
                                    {group.quotations.map((quotation, qIdx) => {
                                        const itemsInQuotation = quotationItems.filter(item => item.quotation_id === quotation.id);
                                        return (
                                            <div key={quotation.id} className="pa-quotation">
                                                <h4 className="pa-quotation-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span>📄 {quotation.title} <small>({new Date(quotation.created_at).toLocaleDateString()})</small></span>
                                                    {['admin', 'grade3'].includes(role) && (
                                                        <button onClick={() => handleDeleteQuotation(quotation.id)} style={{ padding: '2px 8px', fontSize: '11px', color: 'white', background: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>삭제</button>
                                                    )}
                                                </h4>
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table className="data-table nested">
                                                        <thead>
                                                            <tr>
                                                                <th>구분</th>
                                                                <th>유닛명</th>
                                                                <th>품목명</th>
                                                                <th>수량</th>
                                                                <th className="money-cell">단가 (₩)</th>
                                                                <th className="money-cell">총액 (₩)</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {itemsInQuotation.map(item => (
                                                                <tr key={item.id}>
                                                                    <td><span className={`badge-category cat-${item.item_category === '가공품' ? 'process' : item.item_category === '구매품' ? 'purchase' : 'other'}`}>{item.item_category}</span></td>
                                                                    <td>{item.unit_name || '-'}</td>
                                                                    <td>{item.item_name}</td>
                                                                    <td>{item.quantity}</td>
                                                                    <td className="money-cell">{Number(item.unit_price).toLocaleString()}</td>
                                                                    <td className="money-cell">{Number(item.total_price).toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                            {itemsInQuotation.length === 0 && <tr><td colSpan="6">품목이 없습니다.</td></tr>}
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
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#57606a', border: '1px solid #dce5ed', borderRadius: '8px' }}>
                            아직 등록된 견적서가 없습니다.
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
