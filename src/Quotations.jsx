import React, { useState, useRef, useEffect, useMemo } from 'react';
import './Quotations.css';
import { supabase } from './supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';

export default function Quotations({ projects, session, role, onPermissionDenied }) {
    const canManage = ['admin', 'grade3'].includes(role);
    const notifyPermission = (feature) => {
        if (onPermissionDenied) {
            onPermissionDenied(feature);
        } else {
            alert(`[${feature}] 권한이 없습니다. 운영자에게 권한을 부여받으시기 바랍니다.`);
        }
    };
    const [isDragging, setIsDragging] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [selectedProjectInput, setSelectedProjectInput] = useState('');
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
    const [isListCollapsed, setIsListCollapsed] = useState(false);

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
                const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" }); 
                
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
                responseText = responseText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
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
                const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" }); 
                
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
                responseText = responseText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
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
            let userFriendlyMsg = "견적서를 분석하거나 저장하는 도중 알 수 없는 오류가 발생했습니다. 지속되면 담당자에게 문의해주세요.";
            if (error.message.includes("429")) {
                userFriendlyMsg = "AI 분석 요청량이 폭주하여 일시적으로 제한되었습니다. 약 1~2분 뒤에 다시 시도해주시고, 계속 안 될 경우 담당자에게 문의해주세요.";
            } else if (error.message.includes("503")) {
                userFriendlyMsg = "AI 분석 서버에 일시적인 과부하가 발생했습니다. 잠시 후 다시 시도해주시고, 계속 안 될 경우 담당자에게 문의해주세요.";
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

    // 1. 모든 품목 데이터에 공정, 프로젝트, 정규화 구분 메타데이터 결합
    const enrichedItems = useMemo(() => {
        return quotationItems.map(item => {
            const q = quotations.find(quot => quot.id === item.quotation_id);
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

            // 구분 정규화: 가공품 / 시장품(구매품) / 기타
            const rawCat = String(item.item_category || '').trim();
            let normCategory = "기타";
            if (/가공/i.test(rawCat)) normCategory = "가공품";
            else if (/구매|시장|상용/i.test(rawCat)) normCategory = "시장품";

            return {
                ...item,
                projectKey,
                quotationTitle: q?.title || '견적서',
                processType,
                normCategory,
                unit_name: item.unit_name || '',
                unit_price: Number(item.unit_price) || 0,
                quantity: Number(item.quantity) || 1,
                total_price: Number(item.total_price) || (Number(item.unit_price) || 0) * (Number(item.quantity) || 1)
            };
        });
    }, [quotationItems, quotations, projects]);

    // 2. [공정 필터]에 따른 유효 프로젝트 목록
    const availableProjects = useMemo(() => {
        const counts = {};
        enrichedItems.forEach(item => {
            if (filterProcess !== '전체') {
                if (filterProcess === 'Notching' && item.processType !== 'Notching' && item.processType !== 'Both') return;
                if (filterProcess === 'Stacking' && item.processType !== 'Stacking' && item.processType !== 'Both') return;
            }
            counts[item.projectKey] = (counts[item.projectKey] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [enrichedItems, filterProcess]);

    // 유효한 선택 프로젝트 결정 (파생 상태)
    const effectiveProject = (filterProject !== '전체' && availableProjects.some(p => p.name === filterProject)) ? filterProject : '전체';

    // 3. [공정 + 프로젝트]에 따른 구분(가공품/시장품/기타) 건수
    const availableCategories = useMemo(() => {
        const counts = { '가공품': 0, '시장품': 0, '기타': 0 };
        enrichedItems.forEach(item => {
            if (filterProcess !== '전체') {
                if (filterProcess === 'Notching' && item.processType !== 'Notching' && item.processType !== 'Both') return;
                if (filterProcess === 'Stacking' && item.processType !== 'Stacking' && item.processType !== 'Both') return;
            }
            if (effectiveProject !== '전체' && item.projectKey !== effectiveProject) return;
            if (counts[item.normCategory] !== undefined) counts[item.normCategory]++;
            else counts['기타']++;
        });
        return counts;
    }, [enrichedItems, filterProcess, effectiveProject]);

    // 4. [공정 + 프로젝트 + 구분] 복합 조건에 따른 유효 품목 목록 (핵심 연동!)
    const availableItemNames = useMemo(() => {
        const itemMap = {};
        enrichedItems.forEach(item => {
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
    }, [enrichedItems, filterProcess, effectiveProject, filterCategory]);

    // 유효한 선택 품목명 결정 (파생 상태)
    const effectiveItemName = (filterItemName !== '전체' && availableItemNames.some(i => i.name === filterItemName)) ? filterItemName : '전체';

    // 5. [공정 + 프로젝트 + 구분 + 품목] 복합 조건에 따른 유효 유닛 목록
    const availableUnitNames = useMemo(() => {
        const unitSet = new Set();
        enrichedItems.forEach(item => {
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
    }, [enrichedItems, filterProcess, effectiveProject, filterCategory, effectiveItemName, searchQuery]);

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
        const list = enrichedItems.filter(item => {
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
                const matchName = item.item_name.toLowerCase().includes(q);
                const matchUnit = item.unit_name && item.unit_name.toLowerCase().includes(q);
                if (!matchName && !matchUnit) return false;
            }

            return true;
        });

        if (sortOrder === 'priceDesc') list.sort((a, b) => b.unit_price - a.unit_price);
        else if (sortOrder === 'priceAsc') list.sort((a, b) => a.unit_price - b.unit_price);
        else if (sortOrder === 'nameAsc') list.sort((a, b) => a.item_name.localeCompare(b.item_name));
        else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return list;
    }, [enrichedItems, filterProcess, effectiveProject, filterCategory, effectiveItemName, effectiveUnitName, searchQuery, sortOrder]);

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
        setSearchQuery('');
        setSortOrder('recent');
    };

    const groupedQuotations = {};
    quotations.forEach(q => {
        let key = "미지정 프로젝트";
        if (q.project_id) {
            const p = projects.find(proj => proj.id === q.project_id);
            if (p) key = p.manufacturing_no ? `${p.manufacturing_no} · ${p.name}` : p.name;
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
        
        const qItems = quotationItems.filter(item => item.quotation_id === q.id);
        qItems.forEach(item => {
            if (item.item_category === '가공품') groupedQuotations[key].process_amount += Number(item.total_price);
            else if (item.item_category === '구매품' || item.item_category === '시장품') groupedQuotations[key].purchase_amount += Number(item.total_price);
            else groupedQuotations[key].other_amount += Number(item.total_price);
        });
    });

    const toggleProject = (name) => {
        setExpandedProjects(prev => ({ ...prev, [name]: !prev[name] }));
    };

    return (
        <>
            <section>
                {!canManage && (
                    <div style={{background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <span>ℹ️ <b>견적 조회 전용 모드 ({role?.toUpperCase() || 'GRADE2'})</b> : 견적 비용 집계 및 품목별 단가 검색만 가능하며, 견적서 등록 및 삭제 권한은 제한됩니다.</span>
                    </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                    <h2>새 견적서 등록 {!canManage && "🔒"}</h2>
                    <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                        <input type="file" ref={fileInputRef} onChange={e=>handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, image/*, .pdf" style={{display:'none'}}/>
                        <textarea 
                            placeholder={canManage ? "엑셀 표 붙여넣기 (Ctrl+V)" : "등록 권한 없음 (클릭 시 안내)"}
                            disabled={isExtracting}
                            onClick={() => {
                                if (!canManage) notifyPermission('견적서 등록');
                            }}
                            style={{
                                height: '35px',
                                width: '180px',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: canManage ? '1px solid #10b981' : '1px solid #d1d5da',
                                outline: 'none',
                                resize: 'none',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                boxSizing: 'border-box',
                                fontSize: '13px',
                                fontFamily: 'inherit',
                                background: canManage ? '#fff' : '#f3f4f6',
                                cursor: canManage ? 'text' : 'pointer'
                            }}
                            onPaste={(e) => {
                                if (!canManage) {
                                    e.preventDefault();
                                    notifyPermission('견적서 등록');
                                    return;
                                }
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
                        <button 
                            onClick={() => {
                                if (!canManage) return notifyPermission('견적서 파일 업로드');
                                fileInputRef.current.click();
                            }} 
                            disabled={isExtracting} 
                            style={{
                                background: !canManage ? '#9ca3af' : isExtracting ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontWeight: 'bold',
                                border: 'none',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                                height: '35px',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer'
                            }}
                            title={!canManage ? "등록 권한이 없습니다 (클릭 시 권한 안내)" : ""}
                        >
                            {isExtracting ? "✨ AI 분석 중..." : "✨ 파일 첨부 (Excel/이미지)"} {!canManage && "🔒"}
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
                                <option key={p.id} value={p.name}>{p.manufacturing_no ? `${p.manufacturing_no} · ` : ''}{p.name}</option>
                            ))}
                        </datalist>
                    </label>
                </div>

                {msg && <p className="notice" style={{marginTop:'10px',fontWeight:'bold',color:'#059669'}}>{msg}</p>}
            </section>

            {/* 품목별 단가 검색 및 다차원 연동 필터 섹션 */}
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                    <div>
                        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            품목별 견적 단가 조회 및 비교
                        </h2>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                            공정(NC/STK), 프로젝트, 구분(가공품/시장품/기타), 품목을 선택하면 조건에 맞는 품목들만 드롭다운에 실시간 연동되어 표출됩니다.
                        </span>
                    </div>
                    <button 
                        onClick={handleResetFilters}
                        style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '12.5px',
                            fontWeight: '600',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        🔄 필터 초기화
                    </button>
                </div>

                {/* 다차원 연동 필터 카드 */}
                <div className="quote-filter-card">
                    {/* 행 1: 공정 / 프로젝트 / 구분(가공품/시장품/기타) */}
                    <div className="quote-filter-row">
                        {/* 1. 공정 필터 */}
                        <div className="quote-filter-group">
                            <label className="quote-filter-label">
                                ⚙️ 공정 선택 (Notching / Stacking)
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
                                📁 프로젝트 선택 ({availableProjects.length}개 프로젝트)
                            </label>
                            <select 
                                className="quote-select"
                                style={{ width: '100%' }}
                                value={effectiveProject}
                                onChange={e => setFilterProject(e.target.value)}
                            >
                                <option value="전체">모든 프로젝트 ({enrichedItems.length}건)</option>
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
                                🏷️ 품목 구분
                            </label>
                            <div className="quote-pill-group">
                                <button 
                                    type="button"
                                    className={`quote-pill-btn ${filterCategory === '전체' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('전체')}
                                >
                                    전체
                                </button>
                                <button 
                                    type="button"
                                    className={`quote-pill-btn ${filterCategory === '가공품' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('가공품')}
                                >
                                    🛠️ 가공품 ({availableCategories['가공품'] || 0})
                                </button>
                                <button 
                                    type="button"
                                    className={`quote-pill-btn ${filterCategory === '시장품' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('시장품')}
                                >
                                    🛒 시장품 ({availableCategories['시장품'] || 0})
                                </button>
                                <button 
                                    type="button"
                                    className={`quote-pill-btn ${filterCategory === '기타' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('기타')}
                                >
                                    ⚙️ 기타 ({availableCategories['기타'] || 0})
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 행 2: 복합 조건 연동 품목 드롭다운 / 직접 검색창 / 유닛 드롭다운 / 정렬 */}
                    <div className="quote-filter-row">
                        {/* 4. 복합 연동 품목 드롭다운 */}
                        <div className="quote-filter-group" style={{ flex: '1 1 240px' }}>
                            <label className="quote-filter-label">
                                🔍 품목 선택 (조건 만족: {availableItemNames.length}개 품목)
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
                                ⌨️ 직접 검색
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
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
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
                                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({item.count}건)</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* 6. 유닛명 드롭다운 (선택 조건에 해당하는 유닛만) */}
                        {availableUnitNames.length > 0 && (
                            <div className="quote-filter-group" style={{ flex: '0 1 180px' }}>
                                <label className="quote-filter-label">
                                    🧩 유닛/파트
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
                                ↕️ 정렬
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
                                    <span>최저 단가:</span> <b style={{ color: '#16a34a' }}>₩{statMinPrice.toLocaleString()}</b>
                                </div>
                                <div className="quote-stat-chip">
                                    <span>최고 단가:</span> <b style={{ color: '#dc2626' }}>₩{statMaxPrice.toLocaleString()}</b>
                                </div>
                                <div className="quote-stat-chip">
                                    <span>평균 단가:</span> <b style={{ color: '#2563eb' }}>₩{statAvgPrice.toLocaleString()}</b>
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
                            {isListCollapsed ? '▾ 결과 목록 펼치기' : '▴ 결과 목록 접기'}
                        </button>
                    )}
                </div>

                {/* 접힘 상태 안내 배너 또는 결과 테이블 */}
                {isListCollapsed && filteredResults.length > 0 ? (
                    <div 
                        className="quote-collapsed-banner"
                        onClick={() => setIsListCollapsed(false)}
                    >
                        <span>📋 조회된 품목 <b>{filteredResults.length}건</b>의 목록이 접혀 있습니다.</span>
                        <span className="expand-link">클릭하여 펼쳐보기 ▾</span>
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
                                        <th style={{ width: '70px', textAlign: 'center' }}>수량</th>
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
                                                    <td style={{ fontWeight: 600, color: '#1e293b' }}>
                                                        {item.projectKey}
                                                    </td>
                                                    <td style={{ color: item.unit_name ? '#334155' : '#94a3b8' }}>
                                                        {item.unit_name || '-'}
                                                    </td>
                                                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                                                        {item.item_name}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {item.quantity}
                                                    </td>
                                                    <td className="money-cell" style={{ fontWeight: 700, color: '#1e40af' }}>
                                                        {item.unit_price.toLocaleString()}
                                                    </td>
                                                    <td className="money-cell">
                                                        {item.total_price.toLocaleString()}
                                                    </td>
                                                    <td style={{ color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                                                        {new Date(item.created_at).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="9" style={{ textAlign: 'center', color: '#64748b', padding: '36px 20px' }}>
                                                <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>선택하신 조건에 해당하는 견적 품목이 없습니다.</div>
                                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>공정, 프로젝트 또는 구분 조건을 변경하거나 초기화해 보세요.</div>
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
                                        color: '#64748b',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        padding: '4px 8px'
                                    }}
                                >
                                    ▴ 목록 접기
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>

            <section>
                <div className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2>프로젝트별 견적 비용 집계</h2>
                    <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 'normal' }}>
                        ※품목별 견적단가를 확인하기 위한 단순 합산 집계로 최종 견적 금액과 총 금액의 차이가 있을 수 있습니다.
                    </span>
                </div>
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
                                                color: 'white',
                                                background: canManage ? '#ef4444' : '#9ca3af',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                            title={!canManage ? "삭제 권한이 없습니다 (클릭 시 권한 안내)" : ""}
                                        >
                                            전체 삭제 {!canManage && "🔒"}
                                        </button>
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
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!canManage) return notifyPermission('견적 삭제');
                                                            handleDeleteQuotation(quotation.id);
                                                        }} 
                                                        style={{
                                                            padding: '2px 8px',
                                                            fontSize: '11px',
                                                            color: 'white',
                                                            background: canManage ? '#ef4444' : '#9ca3af',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                        title={!canManage ? "삭제 권한이 없습니다 (클릭 시 권한 안내)" : ""}
                                                    >
                                                        삭제 {!canManage && "🔒"}
                                                    </button>
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
