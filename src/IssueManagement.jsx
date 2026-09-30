import { useState, useRef, useEffect, useMemo } from 'react';
import './IssueManagement.css';
import { supabase } from './supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';

export default function IssueManagement({ projects, role, onPermissionDenied }) {
    const [activeIssueSection, setActiveIssueSection] = useState(() => {
        try {
            const saved = localStorage.getItem('pm_issue_active_section');
            if (saved && ['all', 'register', 'list', 'analyze'].includes(saved)) return saved;
        } catch (e) {}
        return 'all';
    });

    useEffect(() => {
        try {
            localStorage.setItem('pm_issue_active_section', activeIssueSection);
        } catch (e) {}
    }, [activeIssueSection]);
    
    const isGrade1 = role === 'grade1';
    const notifyPermission = (feature) => {
        if (onPermissionDenied) {
            onPermissionDenied(feature);
        } else {
            alert(`[${feature}] 권한이 없습니다. 운영자에게 권한을 부여받으시기 바랍니다.`);
        }
    };
    
    // Register Tab States
    const [selectedProject, setSelectedProject] = useState(() => {
        try {
            return localStorage.getItem('pm_issue_selected_project') || '';
        } catch (e) {}
        return '';
    });

    useEffect(() => {
        try {
            localStorage.setItem('pm_issue_selected_project', selectedProject);
        } catch (e) {}
    }, [selectedProject]);
    const [extractedReports, setExtractedReports] = useState([{
        date: new Date().toISOString().slice(0, 10),
        work_details: '',
        special_notes: '',
        personnel_count: 0,
        pm_count: 0,
        design_count: 0,
        facility_count: 0,
        control_count: 0,
        vision_count: 0
    }]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [msg, setMsg] = useState('');
    const [projectReports, setProjectReports] = useState([]);
    const [expandedReports, setExpandedReports] = useState({});
    
    // 다중 프로젝트 일보 분류 모달 상태
    const [splitProjectModal, setSplitProjectModal] = useState({
        isOpen: false,
        uniqueProjects: [],
        projectFreq: {},
        projectSamples: {},
        selectedChoice: '',
        currentProjectName: '',
        workMap: null
    });
    
    // Analyze Tab States
    const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeMsg, setAnalyzeMsg] = useState('');

    const fileInputRef = useRef(null);

    const projectOptions = useMemo(() => {
        return (projects || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    }, [projects]);

    useEffect(() => {
        if (activeIssueSection !== 'analyze' && selectedProject) {
            loadReports(selectedProject);
        }
    }, [selectedProject, activeIssueSection]);

    async function loadReports(projectId) {
        setMsg('');
        const { data, error } = await supabase
            .from('daily_reports')
            .select('*')
            .eq('project_id', projectId)
            .order('report_date', { ascending: false });
        
        if (error) {
            console.error(error);
            setMsg('일보 목록을 불러오는데 실패했습니다.');
            return;
        }
        setProjectReports(data || []);
    }

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (isGrade1) {
            notifyPermission('공사일보 파일 업로드');
            return;
        }
        const file = e.dataTransfer.files[0];
        if (file) await handleFileUpload(file);
    };

    // 공수 맵 데이터를 직접입력 폼(extractedReports)에 병합 반영하는 공통 유틸
    const mergeManpowerIntoExtracted = (mpMap) => {
        const dates = Object.keys(mpMap || {}).sort();
        if (dates.length === 0) return 0;

        setExtractedReports(prev => {
            const isInitialEmpty = prev.length === 1 && !prev[0].work_details.trim() && !prev[0].special_notes.trim() && (prev[0].personnel_count || 0) === 0;
            const currentMap = {};
            if (!isInitialEmpty) {
                prev.forEach(r => {
                    if (r.date) currentMap[r.date] = { ...r };
                });
            }

            dates.forEach(d => {
                const m = mpMap[d];
                const totalMD = (m.pm_count || 0) + (m.design_count || 0) + (m.facility_count || 0) +
                                (m.control_count || 0) + (m.vision_count || 0) + (m.personnel_count || 0);
                const existingDbReport = (projectReports || []).find(p => p.report_date === d);

                if (!currentMap[d]) {
                    // 공수 데이터가 있거나 이미 DB에 등록되어 있던 일보인 경우 신규 카드로 생성
                    if (totalMD > 0 || existingDbReport) {
                        currentMap[d] = {
                            date: d,
                            work_details: existingDbReport?.work_details || existingDbReport?.content || '',
                            special_notes: existingDbReport?.special_notes || existingDbReport?.issues || '',
                            personnel_count: m.personnel_count || 0,
                            pm_count: m.pm_count || 0,
                            design_count: m.design_count || 0,
                            facility_count: m.facility_count || 0,
                            control_count: m.control_count || 0,
                            vision_count: m.vision_count || 0
                        };
                    }
                } else {
                    currentMap[d].pm_count = m.pm_count ?? currentMap[d].pm_count;
                    currentMap[d].design_count = m.design_count ?? currentMap[d].design_count;
                    currentMap[d].facility_count = m.facility_count ?? currentMap[d].facility_count;
                    currentMap[d].control_count = m.control_count ?? currentMap[d].control_count;
                    currentMap[d].vision_count = m.vision_count ?? currentMap[d].vision_count;
                    currentMap[d].personnel_count = m.personnel_count ?? currentMap[d].personnel_count;

                    if (!currentMap[d].work_details && existingDbReport) {
                        currentMap[d].work_details = existingDbReport.work_details || existingDbReport.content || '';
                    }
                    if (!currentMap[d].special_notes && existingDbReport) {
                        currentMap[d].special_notes = existingDbReport.special_notes || existingDbReport.issues || '';
                    }
                }
            });

            const mergedList = Object.values(currentMap).sort((a, b) => a.date.localeCompare(b.date));
            return mergedList.length > 0 ? mergedList : prev;
        });

        setCollapsedSections(prev => ({ ...prev, inputForm: false }));
        return dates.length;
    };

    const handleFileUpload = async (file) => {
        if (isGrade1) {
            notifyPermission('공사일보 파일 업로드');
            return;
        }
        if (!file) return;
        setMsg('엑셀 파일을 읽고 시트 구조를 분석하는 중...');
        setIsExtracting(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: false });

            // 1단계: 고속 정밀 시트 스캐닝 (Work Details 및 Manpower 시트 직접 추출)
            let detectedWorkMap = null;
            let detectedManpowerMap = null;
            let workSheetName = '';
            let manpowerSheetName = '';

            for (const sheetName of workbook.SheetNames) {
                // 간트차트, 설치현황 등 순수 일정 시트는 제외 (단, 일보/보고/인원/공수/출역/근태 키워드 시트는 유지)
                if ((sheetName.includes('설치현황') || sheetName.includes('공정현황') || sheetName.includes('진도') || 
                     sheetName.includes('Schedule') || sheetName.includes('Actual') || sheetName.includes('Plan') || 
                     sheetName.includes('그래프') || sheetName.includes('Utility') || sheetName.includes('비자보유')) 
                    && !sheetName.includes('일보') && !sheetName.includes('보고') && !sheetName.includes('작업') && !sheetName.includes('인원') && !sheetName.includes('공수') && !sheetName.includes('근태') && !sheetName.includes('출역')) {
                    continue;
                }

                const sheet = workbook.Sheets[sheetName];
                const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
                if (!grid || grid.length === 0) continue;

                const isExplicitManpower = /(인원|공수|투입|출역|근태|manpower|attendance)/i.test(sheetName) && !/(일보|보고|작업|공사|업무)/i.test(sheetName);
                const isExplicitWork = /(일보|보고|작업|공사|업무)/i.test(sheetName) && !/(인원|공수|근태|출역)/i.test(sheetName);

                // 작업내용 시트 검사 (명시적 공수 시트 제외 및 더 많은 일자 데이터를 가진 시트 우선 채택)
                if (!isExplicitManpower) {
                    const wMap = parseWorkSheetGrid(grid);
                    const wCount = wMap ? Object.keys(wMap).length : 0;
                    const curCount = detectedWorkMap ? Object.keys(detectedWorkMap).length : 0;
                    if (wCount > curCount) {
                        detectedWorkMap = wMap;
                        workSheetName = sheetName;
                    }
                }

                // 공수/인원 시트 검사 (명시적 일보 시트 제외 및 더 많은 유효 인원 데이터를 가진 시트 우선 채택)
                if (!isExplicitWork) {
                    const mTree = parseManpowerSheetGrid(grid);
                    const mCount = mTree ? Object.keys(mTree).length : 0;
                    const curMCount = detectedManpowerMap ? Object.keys(detectedManpowerMap).length : 0;
                    if (mCount > curMCount) {
                        detectedManpowerMap = mTree;
                        manpowerSheetName = sheetName;
                    }
                }
            }

            // 고속 시트 파싱으로 작업내용 또는 공수 데이터를 감지한 경우:
            if (detectedWorkMap || detectedManpowerMap) {
                if (detectedWorkMap) {
                    const workDates = Object.keys(detectedWorkMap).sort();
                    const projectDays = {};
                    const projectSamples = {};
                    Object.values(detectedWorkMap).forEach(w => {
                        const projs = splitProjectsFromText(w.work_details, projects);
                        const seenOnThisDay = new Set();
                        projs.forEach(p => {
                            if (p.name !== '일보 전체' && p.name !== '기타/공통') {
                                if (!seenOnThisDay.has(p.name)) {
                                    seenOnThisDay.add(p.name);
                                    projectDays[p.name] = (projectDays[p.name] || 0) + 1;
                                }
                                if (!projectSamples[p.name] && p.content) {
                                    projectSamples[p.name] = p.content;
                                }
                            }
                        });
                    });
                    const uniqueProjects = Object.keys(projectDays);

                    // 복수 프로젝트 감지 시 모달 오픈
                    if (uniqueProjects.length >= 2) {
                        let defaultChoice = uniqueProjects[0];
                        const curProjectObj = (projects || []).find(p => p.id === selectedProject);
                        const curProjDisp = curProjectObj ? (curProjectObj.manufacturingNo ? `[${curProjectObj.manufacturingNo}] ${curProjectObj.name}` : curProjectObj.name) : '선택된 프로젝트 없음';

                        if (curProjectObj) {
                            const curClean = (curProjectObj.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
                            const curLine = extractLineSignature(curClean);
                            let bestScore = -999;

                            uniqueProjects.forEach(cand => {
                                const candClean = cand.replace(/\s*\([^)]*\)\s*$/, '').trim();
                                const candLine = extractLineSignature(candClean);
                                let score = 0;
                                if (curProjectObj.manufacturingNo && cand.toUpperCase().includes(curProjectObj.manufacturingNo.toUpperCase())) score += 150;
                                if (candClean === curClean || cand.includes(curClean) || curClean.includes(candClean)) score += 100;
                                if (curLine && candLine && (curLine === candLine || isLineInRange(candLine, curLine) || isLineInRange(curLine, candLine))) score += 50;
                                if (score > bestScore) {
                                    bestScore = score;
                                    defaultChoice = cand;
                                }
                            });
                        }

                        setSplitProjectModal({
                            isOpen: true,
                            uniqueProjects,
                            projectFreq: projectDays,
                            projectSamples,
                            selectedChoice: defaultChoice,
                            recommendedProject: defaultChoice,
                            currentProjectName: curProjDisp,
                            workMap: detectedWorkMap,
                            manpowerMap: detectedManpowerMap
                        });

                        setMsg(`📂 엑셀 파일 분석 완료: [${workSheetName}] 시트에서 ${workDates.length}일치의 작업내용을 감지했습니다. 반영할 프로젝트를 선택해주세요.`);
                        setIsExtracting(false);
                        return;
                    }

                    // 단일 프로젝트거나 분리 대상이 없는 경우 바로 적용 (예: SKOJ 7라인 H055)
                    applyFilteredWorkMap('__ALL__', detectedWorkMap);
                }

                // 공수 데이터도 함께 병합 반영
                if (detectedManpowerMap) {
                    mergeManpowerIntoExtracted(detectedManpowerMap);
                }

                const msgParts = [];
                if (detectedWorkMap) msgParts.push(`작업내용(${Object.keys(detectedWorkMap).length}일치)`);
                if (detectedManpowerMap) msgParts.push(`공수(${Object.keys(detectedManpowerMap).length}일치)`);
                setMsg(`📂 엑셀 파일 정밀 분석 완료: ${msgParts.join(' 및 ')} 데이터를 직접입력 폼에 정상 반영했습니다.`);
                setIsExtracting(false);
                return;
            }

            // 2단계: 폴백 (Gemini AI 기반 구조화 분석)
            setMsg('AI가 엑셀 내용 구조화를 진행하고 있습니다... (약 5~10초)');
            let allText = '';
            workbook.SheetNames.forEach(sheetName => {
                if ((sheetName.includes('설치현황') || sheetName.includes('공정현황') || sheetName.includes('진도')) 
                    && !sheetName.includes('일보') && !sheetName.includes('보고') && !sheetName.includes('인원') && !sheetName.includes('공수')) {
                    return;
                }
                const sheet = workbook.Sheets[sheetName];
                const text = XLSX.utils.sheet_to_csv(sheet);
                allText += `\n[Sheet: ${sheetName}]\n` + text;
            });

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');
            
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
            const prompt = `
다음은 현장 공사일보(엑셀)의 원본 텍스트입니다. 이 내용에서 일자별로 데이터를 분류하여 3가지 주요 정보(작업내용, 특이사항, 투입인원)를 추출해주세요.
특히 투입인원은 부서별(소장/Manager, 설계, 설비기술, 제어, 비전)로 세분화하여 파악해주세요. 파악할 수 없는 인원은 기타(personnel_count)로 합산하세요.
결과는 반드시 아래 JSON 배열 포맷으로만 반환해주세요. (마크다운 포맷이나 백틱을 절대로 포함하지 마세요.)
**중요: 텍스트에 연도(Year)가 표기되어 있지 않은 경우, 반드시 올해(${new Date().getFullYear()}년)를 기준으로 날짜를 작성하세요.**

형식:
[
  {
    "date": "YYYY-MM-DD",
    "work_details": "해당 일자의 진행 작업(업무) 내용 요약 (다중 라인은 \\n 사용)",
    "special_notes": "특이사항, 이슈사항, 문제점, 지연 사유 등 요약 (없으면 빈 문자열)",
    "personnel_count": 부서 파악이 안되는 기타 인원수 합계 (숫자),
    "pm_count": 소장(Manager/PM) 투입 인원 (숫자),
    "design_count": 설계 투입 인원 (숫자),
    "facility_count": 설비기술 투입 인원 (숫자),
    "control_count": 제어 투입 인원 (숫자),
    "vision_count": 비전 투입 인원 (숫자)
  }
]

원본 텍스트:
${allText.substring(0, 100000)}
`;
            const result = await model.generateContent(prompt);
            let responseText = result.response.text();
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(responseText);
            
            if (Array.isArray(parsed) && parsed.length > 0) {
                setExtractedReports(parsed.map(r => ({
                    date: r.date || new Date().toISOString().slice(0, 10),
                    work_details: r.work_details || '',
                    special_notes: r.special_notes || r.issues || '',
                    personnel_count: Number(r.personnel_count) || 0,
                    pm_count: Number(r.pm_count) || 0,
                    design_count: Number(r.design_count) || 0,
                    facility_count: Number(r.facility_count) || 0,
                    control_count: Number(r.control_count) || 0,
                    vision_count: Number(r.vision_count) || 0
                })));
            }
            setMsg(`AI가 ${parsed.length}일치의 일보 내용을 성공적으로 구조화했습니다. 내용 확인 후 저장해주세요.`);
        } catch (error) {
            console.error(error);
            let userFriendlyMsg = "파일 분석 중 알 수 없는 오류가 발생했습니다. 지속되면 담당자에게 문의해주세요.";
            if (error.message.includes("429") || error.message.includes("quota")) {
                userFriendlyMsg = "AI 분석 요청량이 폭주하여 일시적으로 제한되었습니다. 약 1~2분 뒤에 다시 시도해주시고, 계속 안 될 경우 담당자에게 문의해주세요.";
            } else if (error.message.includes("403") || error.message.includes("API_KEY_INVALID")) {
                userFriendlyMsg = "API Key가 유효하지 않습니다. 환경설정에서 Gemini API Key를 확인해주세요.";
            }

            setMsg(
                <span style={{ color: '#ef4444' }}>
                    파일 분석 실패: {userFriendlyMsg}
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal', marginTop: '4px' }}>
                        원인파악용 기술 정보: {error.message}
                    </div>
                </span>
            );
        } finally {
            setIsExtracting(false);
        }
    };

    const handleEditReport = (report) => {
        setExtractedReports([{
            date: report.report_date,
            work_details: report.work_details || report.content || '',
            special_notes: report.special_notes || report.issues || '',
            personnel_count: report.personnel_count || 0,
            pm_count: report.pm_count || 0,
            design_count: report.design_count || 0,
            facility_count: report.facility_count || 0,
            control_count: report.control_count || 0,
            vision_count: report.vision_count || 0
        }]);
        setCollapsedSections(prev => ({ ...prev, inputForm: false }));
        setActiveIssueSection('all');
        setMsg(`✏️ ${report.report_date} 일보를 직접입력 폼에 불러왔습니다. 내용 수정 후 [Save All]을 눌러 저장해주세요.`);
    };

    const saveReport = async () => {
        if (isGrade1) return notifyPermission('공사일보 저장');
        if (!selectedProject) return setMsg('프로젝트를 먼저 선택해주세요.');

        // 유효한 일보 항목 필터링 (날짜가 있고, 작업내용/특이사항/공수 중 하나라도 입력된 경우 저장 가능)
        const validReports = extractedReports.filter(r => {
            if (!r.date) return false;
            const hasWork = Boolean(r.work_details && r.work_details.trim());
            const hasNotes = Boolean(r.special_notes && r.special_notes.trim());
            const totalMD = (r.pm_count || 0) + (r.design_count || 0) + (r.facility_count || 0) +
                            (r.control_count || 0) + (r.vision_count || 0) + (r.personnel_count || 0);
            return hasWork || hasNotes || totalMD > 0;
        });

        if (validReports.length === 0) return setMsg('저장할 일보 내용(작업내용, 특이사항 또는 투입 공수)이 없습니다.');

        setMsg('기존 등록 일보 확인 및 병합 저장 중...');
        const dates = validReports.map(r => r.date);
        
        // 1. 해당 프로젝트와 일자에 이미 저장된 기존 일보가 있는지 조회
        const { data: existingRows, error: fetchErr } = await supabase
            .from('daily_reports')
            .select('*')
            .eq('project_id', selectedProject)
            .in('report_date', dates);

        if (fetchErr) {
            console.warn('기존 일보 조회 경고:', fetchErr);
        }

        const existingMap = {};
        (existingRows || []).forEach(row => {
            existingMap[row.report_date] = row;
        });

        // 2. 기존 일보가 있으면 최신 내용으로 추가/병합, 없으면 신규 생성
        const insertData = validReports.map(r => {
            const existing = existingMap[r.date];
            const rWork = (r.work_details || '').trim();
            const rNotes = (r.special_notes || '').trim();
            const rTotalMD = (r.pm_count || 0) + (r.design_count || 0) + (r.facility_count || 0) +
                            (r.control_count || 0) + (r.vision_count || 0) + (r.personnel_count || 0);

            // 작업내용: 이번 폼에 내용이 있으면 최신 내용 반영, 비어있고 기존 DB가 있으면 기존 내용 유지
            const finalWork = rWork || (existing ? (existing.work_details || existing.content || '') : '');
            
            // 특이사항: 이번 폼에 내용이 있으면 반영, 비어있고 기존 DB가 있으면 기존 내용 유지
            const finalNotes = rNotes || (existing ? (existing.special_notes || existing.issues || '') : '');

            // 투입 인원: 이번 폼에 공수가 입력되어 있으면 반영, 0이고 기존 DB에 공수가 있었다면 기존 공수 유지
            let pm = r.pm_count || 0;
            let design = r.design_count || 0;
            let facility = r.facility_count || 0;
            let control = r.control_count || 0;
            let vision = r.vision_count || 0;
            let personnel = r.personnel_count || 0;

            if (rTotalMD === 0 && existing) {
                const exTotal = (existing.pm_count || 0) + (existing.design_count || 0) + (existing.facility_count || 0) +
                                (existing.control_count || 0) + (existing.vision_count || 0) + (existing.personnel_count || 0);
                if (exTotal > 0) {
                    pm = existing.pm_count || 0;
                    design = existing.design_count || 0;
                    facility = existing.facility_count || 0;
                    control = existing.control_count || 0;
                    vision = existing.vision_count || 0;
                    personnel = existing.personnel_count || 0;
                }
            }

            return {
                project_id: selectedProject,
                report_date: r.date,
                work_details: finalWork,
                special_notes: finalNotes,
                issues: existing?.issues || '', 
                personnel_count: personnel,
                pm_count: pm,
                design_count: design,
                facility_count: facility,
                control_count: control,
                vision_count: vision,
                content: existing?.content || '' 
            };
        });

        // 3. 해당 일자의 기존 데이터 삭제 후 병합된 최신 데이터 저장 (Overwrite/Merge)
        await supabase.from('daily_reports')
            .delete()
            .eq('project_id', selectedProject)
            .in('report_date', dates);

        const { error } = await supabase.from('daily_reports').insert(insertData);

        if (error) {
            setMsg('저장 실패: ' + error.message);
        } else {
            setMsg(`✅ ${insertData.length}일치의 공사일보가 성공적으로 저장(최신 반영/병합)되었습니다.`);
            setExtractedReports([{
                date: new Date().toISOString().slice(0, 10),
                work_details: '', special_notes: '', personnel_count: 0,
                pm_count: 0, design_count: 0, facility_count: 0, control_count: 0, vision_count: 0
            }]);
            loadReports(selectedProject);
        }
    };

    const removeReport = async (id) => {
        if (isGrade1) return notifyPermission('일보 삭제');
        if (confirm('이 일보를 삭제하시겠습니까?')) {
            await supabase.from('daily_reports').delete().eq('id', id);
            loadReports(selectedProject);
        }
    };

    // --- HTML / TSV 엑셀 표 파서 유틸리티 (모든 날짜 포맷 전천후 지원) ---
    const normalizeReportDate = (raw) => {
        if (!raw) return null;
        if (raw instanceof Date && !isNaN(raw)) {
            return raw.toISOString().slice(0, 10);
        }
        if (typeof raw === 'number' && raw > 30000 && raw < 70000) {
            const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
            return date.toISOString().slice(0, 10);
        }

        let str = String(raw).trim();
        if (!str) return null;

        // 엑셀 일련번호(문자열 형태 예: "46224") 지원
        if (/^\d{5}$/.test(str)) {
            const num = parseInt(str, 10);
            if (num > 30000 && num < 70000) {
                const date = new Date(Math.round((num - 25569) * 86400 * 1000));
                return date.toISOString().slice(0, 10);
            }
        }

        // 라인/호기/장비/공정/작업 등 일반 업무 텍스트는 4자리 연도가 포함되지 않은 한 날짜가 아님!
        if (/라인|line|호기|작업|장비|집진기|양산|대응|셋업|set-?up|설치|공정|반입|마킹|하역|개|대|ea|브라켓|모니터링|티칭|프로그램/i.test(str)) {
            if (!/20\d{2}/.test(str)) return null;
        }

        // 괄호 내 요일(월/화/수/목/금/토/일/Mon/Tue...) 사전 정규화
        let cleanStr = str.replace(/\s*\([월화수목금토일A-Za-z\s]+\)\s*/g, ' ').trim();

        // 1. 4자리 연도 YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD, YYYY년 M월 D일
        let m = cleanStr.match(/(20\d{2})[-./\s년]+(1[0-2]|0?[1-9])[-./\s월]+([12]\d|3[01]|0?[1-9])[일]?/);
        if (m) {
            return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
        }

        // 1-1. 8자리 연속 숫자 (예: 20260720)
        let m8 = cleanStr.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
        if (m8) {
            return `${m8[1]}-${m8[2]}-${m8[3]}`;
        }

        // 1-2. 영문 월명 포맷 (예: Sep/29/26, Sep 29, 2026, 29-Sep-2026)
        const engMonthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
        let mEng = cleanStr.match(/(?:^|[^\w])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[.\s/-]+([12]\d|3[01]|0?[1-9])[,\s/-]+(20\d{2}|\d{2})(?:$|[^\w])/i);
        if (mEng) {
            const mon = engMonthMap[mEng[1].toLowerCase().slice(0, 3)];
            const day = parseInt(mEng[2], 10);
            let yr = parseInt(mEng[3], 10);
            if (yr < 100) yr += 2000;
            return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }

        // 1-3. 미국식 포맷 MM.DD.YYYY, MM/DD/YYYY, (MM.DD.YYYY) (예: (07.10.2026))
        let mUS = cleanStr.match(/(?:^|[^\d])(1[0-2]|0?[1-9])[-./]([12]\d|3[01]|0?[1-9])[-./](20\d{2})(?:$|[^\d])/);
        if (mUS) {
            return `${mUS[3]}-${String(mUS[1]).padStart(2, '0')}-${String(mUS[2]).padStart(2, '0')}`;
        }

        // 1-4. 미국식 2자리 연도 포맷 M/D/YY (예: 9/29/26, 09/29/26)
        let mUS2 = cleanStr.match(/(?:^|[^\d])(1[0-2]|0?[1-9])[/.-]([12]\d|3[01]|0?[1-9])[/.-](2[4-9])(?:$|[^\d])/);
        if (mUS2) {
            return `20${mUS2[3]}-${String(mUS2[1]).padStart(2, '0')}-${String(mUS2[2]).padStart(2, '0')}`;
        }

        // 2. 2자리 연도 YY-MM-DD, YY/MM/DD, YY.MM.DD (예: 26/07/20, 26. 7. 20, 26-7-20)
        m = cleanStr.match(/(?:^|[^\d])(2[4-9])[-./\s년]+(1[0-2]|0?[1-9])[-./\s월]+([12]\d|3[01]|0?[1-9])[일]?(?:$|[^\d])/);
        if (m) {
            return `20${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
        }

        // 3. 월/일 포맷: [M/D], (M/D), 독립된 M/D나 M.D나 M월 D일 (호기/라인 번호 혼동 방지를 위해 연도 없는 하이픈(-)은 제외)
        m = cleanStr.match(/(?:^|\[|\(|일자|금일|일보)\s*(1[0-2]|0?[1-9])[/.\s월]+([12]\d|3[01]|0?[1-9])[일]?(?:\s*\]|\s*\)|$)/);
        if (m) {
            const currentYear = new Date().getFullYear();
            return `${currentYear}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
        }

        return null;
    };

    const extractGridFromClipboard = (html, text) => {
        if (html && html.includes('<table')) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const trs = Array.from(doc.querySelectorAll('tr'));
                if (trs.length > 0) {
                    const grid = trs.map(tr => {
                        const cells = Array.from(tr.querySelectorAll('th, td'));
                        return cells.map(c => (c.innerText || c.textContent || '').trim());
                    }).filter(row => row.length > 0 && row.some(c => c.length > 0));
                    if (grid.length > 0) return grid;
                }
            } catch (e) {
                console.warn('HTML table parsing error:', e);
            }
        }

        if (text && typeof text === 'string') {
            const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
            // 큰따옴표 내 줄바꿈(Alt+Enter)을 온전히 보존하는 스마트 TSV 파서
            const rows = [];
            let currentRow = [];
            let currentCell = '';
            let inQuotes = false;

            for (let i = 0; i < clean.length; i++) {
                const char = clean[i];
                const nextChar = clean[i + 1];

                if (char === '"') {
                    if (inQuotes && nextChar === '"') {
                        currentCell += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === '\t' && !inQuotes) {
                    currentRow.push(currentCell.trim());
                    currentCell = '';
                } else if (char === '\n' && !inQuotes) {
                    currentRow.push(currentCell.trim());
                    if (currentRow.some(c => c.length > 0)) {
                        rows.push(currentRow);
                    }
                    currentRow = [];
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
            if (currentCell || currentRow.length > 0) {
                currentRow.push(currentCell.trim());
                if (currentRow.some(c => c.length > 0)) {
                    rows.push(currentRow);
                }
            }
            if (rows.length > 0) return rows;
        }

        return [];
    };

    // 사이트 / 고객사 식별 시그니처 (HSBMA, SKOJ, SKOH2, SKOY, SKBA, SKBM, SKON, SK대전연구소, SDI, 현대차 아산 등 사이트 간 오연결 원천 차단)
    const extractSiteSignature = (str) => {
        if (!str) return null;
        const s = String(str).toLowerCase();
        if (/hsbma|북미\s*jv|현대\s*북미|북미/i.test(s)) return 'HSBMA';
        if (/skoj|sk\s*oj|서산|\boj[0-9]?\b/i.test(s)) return 'SKOJ';
        if (/skoh2|skoh|sk\s*oh2|이반차/i.test(s)) return 'SKOH2';
        if (/skoy|sk\s*oy|옌청/i.test(s)) return 'SKOY';
        if (/skba|sk\s*ba|조지아/i.test(s)) return 'SKBA';
        if (/skbm|sk\s*bm|코마롬/i.test(s)) return 'SKBM';
        if (/skon|sk\s*on/i.test(s)) return 'SKON';
        if (/대전\s*연구소|sk\s*대전|대전/i.test(s)) return 'SK_DAEJEON';
        if (/삼성\s*sdi|sdi|울산\s*m|울산/i.test(s)) return 'SDI';
        if (/현대차\s*아산|아산/i.test(s)) return 'HY_ASAN';
        return null;
    };

    // 라인 번호 / 범위 시그니처 추출 헬퍼 (예: "Line 5~8", "5~8라인", "1, 2라인", "3라인", "Line 3", "7라인")
    const extractLineSignature = (str) => {
        if (!str) return null;
        let m = str.match(/(?:line|라인|호기)\s*([0-9]+(?:\s*[-~,]\s*[0-9]+)?)/i);
        if (m) return m[1].replace(/\s+/g, '').replace('-', '~').replace(',', '~');

        // Lookbehind (?<![A-Za-z0-9]) 적용으로 'SKOH2 - 9Line' 등 사이트코드 내 숫자가 라인으로 오인식되는 문제 차단
        m = str.match(/(?<![A-Za-z0-9])([0-9]+(?:\s*[-~,]\s*[0-9]+)?)\s*(?:line|라인|호기)/i);
        if (m) return m[1].replace(/\s+/g, '').replace('-', '~').replace(',', '~');

        m = str.match(/(?<![A-Za-z0-9])([0-9]{1,2}\s*[-~]\s*[0-9]{1,2})(?![A-Za-z0-9])/);
        if (m) return m[1].replace(/\s+/g, '').replace('-', '~');

        return null;
    };

    // 라인 번호가 특정 범위(예: 7 in 5~8)에 포함되는지 검사
    const isLineInRange = (lineNumStr, rangeStr) => {
        if (!lineNumStr || !rangeStr) return false;
        if (lineNumStr === rangeStr) return true;
        const num = parseInt(lineNumStr, 10);
        const m = rangeStr.match(/^([0-9]+)~([0-9]+)$/);
        if (m && !isNaN(num)) {
            const start = parseInt(m[1], 10);
            const end = parseInt(m[2], 10);
            return num >= start && num <= end;
        }
        return false;
    };

    // 범용 지능형 프로젝트명 정규화 (사이트 격리 및 핵심 라인/공정/제조번호 통일)
    const normalizeProjectName = (rawTitle, bodyPreview = '', projectList = []) => {
        if (!rawTitle) return '';
        let clean = rawTitle.trim().replace(/^[■●▶◆【\[\s]+/, '').replace(/[】\]\s]+$/, '').trim();

        // 0. 사이트(Site) 시그니처 식별 (현재 앱 선택 프로젝트 및 텍스트 컨텍스트 기반 타 사이트 오연결 원천 차단)
        const curProjObj = (projects || []).find(p => p.id === selectedProject);
        const curSite = extractSiteSignature(curProjObj?.name);
        const candSite = extractSiteSignature(clean) || extractSiteSignature(bodyPreview) || curSite || 'HSBMA';

        // 1. 라인 번호 시그니처 추출 (제목 우선 -> 본문 앞머리 보조)
        let lineSig = extractLineSignature(clean);
        if (!lineSig && bodyPreview) {
            lineSig = extractLineSignature(bodyPreview);
            if (!lineSig) {
                const indLine = bodyPreview.match(/(?<![A-Za-z0-9])([5-8])\s*(?:line|라인|호기)/i);
                if (indLine) lineSig = '5~8';
                const ind12 = bodyPreview.match(/(?<![A-Za-z0-9])([1-2])\s*(?:line|라인|호기)/i);
                if (ind12) lineSig = '1~2';
                const ind3 = bodyPreview.match(/(?:(?<![A-Za-z0-9])3\s*(?:line|라인|호기)|3L-)/i);
                if (ind3) lineSig = '3';
                const ind7 = bodyPreview.match(/(?:(?<![A-Za-z0-9])7\s*(?:line|라인|호기)|7L-)/i);
                if (ind7) lineSig = '7';
            }
        }

        // 2. 공정/단계(Stage) 시그니처 판별
        const combinedContext = `${clean} ${bodyPreview}`;
        const isSetup = /set-?up|셋업|설치|하역|반입|마킹|unloading|installation|setting|도킹|레벨|조립/i.test(combinedContext);
        const isYangsan = /양산|생산대응|양산대응|양산\s*사전|생산/i.test(combinedContext);
        const isJC = /j\/?c|형교환|기종교체/i.test(combinedContext);
        const isSTK = /stk/i.test(clean);

        if (!lineSig) {
            if (isSTK && !isJC && !/3/.test(clean)) lineSig = '5~8';
            if (candSite === 'HSBMA' && isYangsan) lineSig = '1~2';
        }

        // 3. 앱에 등록된 프로젝트 목록과의 시맨틱 매칭 (동일 사이트 내에서만 매칭)
        const effectiveProjects = (projectList && projectList.length > 0) ? projectList : (projects || []);
        let bestProj = null;
        let highestScore = -999;

        // 제조번호(Manufacturing No: H055, E1127, S010A 등) 감지
        const mfgMatch = clean.match(/\b([EH]\d{3,4}|S\d{3}[A-Z]?)\b/i) || bodyPreview.match(/\b([EH]\d{3,4}|S\d{3}[A-Z]?)\b/i);
        const detectedMfgCode = mfgMatch ? mfgMatch[1].toUpperCase() : null;

        for (const p of effectiveProjects) {
            const pSite = extractSiteSignature(p.name);
            // 엄격한 사이트 격리 (Site Isolation): 서로 다른 사이트(예: HSBMA vs SKOH2)는 절대 연결하지 않음!
            if (candSite && pSite && candSite !== pSite) {
                continue;
            }

            const pName = p.name || '';
            const pClean = pName.replace(/\s*\([^)]*\)\s*$/, '').trim();
            const pLineSig = extractLineSignature(pClean);
            let score = 0;

            // 제조번호 일치 시 최우선 매칭 (+150)
            if (detectedMfgCode) {
                if (p.manufacturingNo && p.manufacturingNo.toUpperCase() === detectedMfgCode) {
                    score += 150;
                } else if (pName.toUpperCase().includes(detectedMfgCode)) {
                    score += 150;
                }
            }

            if (lineSig && pLineSig) {
                if (lineSig === pLineSig) {
                    score += 60;
                } else if (isLineInRange(lineSig, pLineSig)) {
                    score += 50;
                } else {
                    score -= 50;
                }
            }

            if (isSetup && /set-?up|셋업|설치/i.test(pName)) score += 25;
            if (isYangsan && /양산/i.test(pName)) score += 25;
            if (isJC && /j\/?c|형교환/i.test(pName)) score += 30;

            if (candSite === 'HSBMA' && /hsbma/i.test(pName)) score += 15;
            if (candSite === 'SKOJ' && /skoj|oj/i.test(pName)) score += 15;
            if (candSite === 'SK_DAEJEON' && /대전/i.test(pName)) score += 20;
            if (candSite === 'SDI' && /sdi|울산/i.test(pName)) score += 20;
            if (candSite === 'SKOY' && /skoy|옌청/i.test(pName)) score += 20;
            if (candSite === 'SKBA' && /skba|조지아/i.test(pName)) score += 20;
            if (isSTK && /5~8|set-?up|셋업/i.test(pName)) score += 20;

            // 키워드 단어 매칭
            const words = clean.split(/[\s,()_~-]+/).filter(w => w.length >= 2);
            words.forEach(w => {
                if (pClean.toLowerCase().includes(w.toLowerCase())) score += 8;
            });

            if (score > highestScore && score >= 25) {
                highestScore = score;
                bestProj = pClean;
            }
        }

        if (bestProj) return bestProj;

        // 4. 범용 폴백 표준화 규칙 (등록되지 않은 법인 계약건 등 사이트별 표준 명칭 통일)
        const curProjObjFallback = (projects || []).find(p => p.id === selectedProject);
        const sitePrefix = candSite || (curProjObjFallback?.name ? curProjObjFallback.name.split(/[\s-]+/)[0] : 'HSBMA');
        if (candSite === 'SK_DAEJEON') return 'SK대전 연구소 ST 고속화 개조';
        if (candSite === 'SDI') return '삼성SDI 울산M라인 LFP 일체형 Stack';
        if (candSite === 'SKOY') {
            if (lineSig === '10' || lineSig === '12' || lineSig === '10~12') return `SKOY ${lineSig}Line Job Change`;
            return 'SKOY Job Change';
        }
        if (candSite === 'SKBA') {
            if (lineSig === '1~6' || /1~6/i.test(clean)) return 'SKBA 1 (1~6라인)';
            if (lineSig === '7~12' || /7~12/i.test(clean)) return 'SKBA 2 (7~12라인)';
            return 'SKBA CS 작업일보';
        }
        if (candSite === 'SKOH2') {
            if (lineSig === '9' || /9L|9라인/i.test(clean)) return 'SKOH2 9Line Job Change';
            return 'SKOH2 BPD JC';
        }
        if (lineSig === '7') return detectedMfgCode ? `${sitePrefix} 7Line (${detectedMfgCode})` : `${sitePrefix} 7Line`;
        if (lineSig === '3' || isJC) return `${sitePrefix} 3Line J/C 양산대응`;
        if (lineSig === '5~8' || (isSTK && isSetup)) return `${sitePrefix} 5~8Line Set-up`;
        if (lineSig === '1~2' || isYangsan) return `${sitePrefix} 1~2Line 양산대응`;
        if (detectedMfgCode) return `${sitePrefix} (${detectedMfgCode})`;

        return clean;
    };

    // 작업내용 텍스트에서 [프로젝트명] 블록들을 분리 추출하고 정규화하는 파서 함수
    const splitProjectsFromText = (text, projectList = []) => {
        if (!text || typeof text !== 'string') return [];
        
        // 1. 엑셀 셀 내 줄바꿈(Alt+Enter)으로 대괄호가 쪼개진 경우 결합
        const rawLines = text.split(/\r?\n/);
        const lines = [];
        let accumulatingBracket = false;
        let bracketBuffer = '';

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const trimmed = line.trim();

            if (!accumulatingBracket) {
                if (/^[■●▶◆【\[]/.test(trimmed) && !/[】\]]/.test(trimmed)) {
                    accumulatingBracket = true;
                    bracketBuffer = trimmed;
                } else {
                    lines.push(line);
                }
            } else {
                bracketBuffer += ' ' + trimmed;
                if (/[】\]]/.test(trimmed)) {
                    lines.push(bracketBuffer);
                    accumulatingBracket = false;
                    bracketBuffer = '';
                }
            }
        }
        if (accumulatingBracket) lines.push(bracketBuffer);

        // 2. 프로젝트 블록 단위 파싱
        const rawBlocks = [];
        let curHeader = null;
        let curLines = [];
        const excludeTitles = /^(참고|비고|특이사항|이슈|이슈사항|주의|알림|공지|진행중|완료|대기|예정|취소|긴급|설비|설비기술|제어|비전|설계|소장|pm)$/i;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const m = trimmed.match(/^[■●▶◆【\[]\s*([^\]】]+)[】\]][:.\s-]*(.*)$/);
            const isDate = m ? normalizeReportDate(m[1]) : null;
            const candidate = m ? m[1].trim() : null;

            if (candidate && !isDate && !excludeTitles.test(candidate) && candidate.length >= 2) {
                if (curHeader) {
                    rawBlocks.push({ header: curHeader, lines: curLines });
                } else if (curLines.some(l => l.trim())) {
                    rawBlocks.push({ header: '기타/공통', lines: curLines });
                }
                curHeader = candidate;
                curLines = [];
                if (m[2] && m[2].trim()) curLines.push(m[2].trim());
            } else {
                curLines.push(line);
            }
        }
        if (curHeader) {
            rawBlocks.push({ header: curHeader, lines: curLines });
        } else if (curLines.some(l => l.trim())) {
            rawBlocks.push({ header: '일보 전체', lines: curLines });
        }

        return rawBlocks.map(b => {
            const bodyPreview = b.lines.slice(0, 3).join('\n');
            const normalizedName = (b.header === '기타/공통' || b.header === '일보 전체')
                ? b.header
                : normalizeProjectName(b.header, bodyPreview, projectList);
            return {
                name: normalizedName,
                rawName: b.header,
                content: b.lines.join('\n').trim()
            };
        });
    };

    // 엑셀 표(목록형 + 일일 보고서 양식 블록형 모두 지원) 종합 파서
    const parseWorkSheetGrid = (grid) => {
        const result = {};
        if (!grid || grid.length === 0) return result;

        // 1. 표준 테이블 목록형 양식인지 확인 ([일자, 작업내용, 특이사항...])
        let standardHeaderIdx = -1;
        let sDateCol = -1;
        let sWorkCol = -1;
        let sNoteCol = -1;
        let sDeptCol = -1;

        for (let r = 0; r < Math.min(12, grid.length); r++) {
            const row = grid[r];
            let dCol = -1, wCol = -1, nCol = -1, dpCol = -1;
            row.forEach((cell, cIdx) => {
                const clean = cell.replace(/\s+/g, '');
                if (/^(일자|날짜|일시|작업일자|보고일자|공사일자|Date)$/i.test(clean) && dCol === -1) dCol = cIdx;
                if (/^(작업내용|업무내용|공정|진행사항|작업현황|주요작업|작업상세|작업|업무|내용|금일작업|금일업무|업무실적|실적|진행내용|공정내용)$/i.test(clean) && wCol === -1) wCol = cIdx;
                if (/특이사항|이슈|비고|건의사항|문제점|특기사항|비고란|참고|전달사항|협의사항/i.test(clean) && nCol === -1) nCol = cIdx;
                if (/부서|팀|담당|구분|직종|소속/i.test(clean) && dpCol === -1) dpCol = cIdx;
            });

            if (dCol !== -1 && wCol !== -1) {
                standardHeaderIdx = r;
                sDateCol = dCol;
                sWorkCol = wCol;
                sNoteCol = nCol;
                sDeptCol = dpCol;
                break;
            }
        }

        if (standardHeaderIdx !== -1) {
            // 표준 목록형 파싱
            let lastDate = null;
            for (let r = standardHeaderIdx + 1; r < grid.length; r++) {
                const row = grid[r];
                if (!row || row.length === 0) continue;

                let rowDate = null;
                if (sDateCol !== -1 && row[sDateCol]) {
                    rowDate = normalizeReportDate(row[sDateCol]);
                } else {
                    for (let c = 0; c < Math.min(3, row.length); c++) {
                        const testDate = normalizeReportDate(row[c]);
                        if (testDate) {
                            rowDate = testDate;
                            break;
                        }
                    }
                }

                const currentDate = rowDate || lastDate;
                if (!currentDate) continue;
                if (rowDate) lastDate = rowDate;

                let workText = (sWorkCol !== -1 && row[sWorkCol]) ? row[sWorkCol].trim() : '';
                let noteText = (sNoteCol !== -1 && row[sNoteCol]) ? row[sNoteCol].trim() : '';
                const deptText = (sDeptCol !== -1 && row[sDeptCol]) ? row[sDeptCol].trim() : '';
                const prefix = deptText ? `[${deptText}] ` : '';

                if (!result[currentDate]) {
                    result[currentDate] = { date: currentDate, work_details: [], special_notes: [] };
                }
                if (workText && !/^(작업내용|공정|업무|내용)$/i.test(workText)) {
                    result[currentDate].work_details.push(`${prefix}${workText}`);
                }
                if (noteText && !/^(특이사항|이슈|비고)$/i.test(noteText)) {
                    result[currentDate].special_notes.push(noteText);
                }
            }
        } else {
            // 2. 일일 업무 보고서 블록형 양식 (Sequential Date Block Scanner: HSBMA, SKBA, Samsung SDI, SKOH2 BPD JC, SK대전연구소 등 전 양식 지원)
            let currentDate = null;
            let manpowerSectionStarted = false;

            // 가로형 헤더 구조(HSBMA Report 양식: Today vs Tomorrow vs Remark) 사전 분석
            let hTodayCol = -1;
            let hFutureCol = -1;
            let hRemarkCol = -1;

            for (let r = 0; r < Math.min(25, grid.length); r++) {
                const row = grid[r];
                if (!row) continue;
                let tCol = -1, fCol = -1, rCol = -1;
                row.forEach((cell, c) => {
                    const s = String(cell).replace(/\s+/g, '');
                    if (/Today|금일진행|당일진행/i.test(s) && !/Tomorrow|명일|예정/i.test(s) && tCol === -1) tCol = c;
                    if (/Tomorrow|명일진행|익일진행/i.test(s) && fCol === -1) fCol = c;
                    if (/Remark|특이사항|비고|이슈/i.test(s) && rCol === -1) rCol = c;
                });
                if (tCol !== -1 && fCol !== -1) {
                    hTodayCol = tCol;
                    hFutureCol = fCol;
                    hRemarkCol = rCol !== -1 ? rCol : 12;
                    break;
                }
            }

            for (let r = 0; r < grid.length; r++) {
                const row = grid[r];
                if (!row || row.length === 0) continue;

                const rowText = row.map(c => String(c || '')).join(' ');
                // 인원/공수 테이블(Manpower Table) 영역에 도달하면 작업내용 수집 중단
                if (/Manpower|인원현황|출역현황/i.test(rowText) && /Company|업체|직종|Position/i.test(grid[r + 1] ? grid[r + 1].join(' ') : '')) {
                    manpowerSectionStarted = true;
                }
                if (manpowerSectionStarted) continue;

                // 이 행에서 날짜가 감지되는지 확인 (단, 명일 진행/예정 셀은 제외)
                let detectedDate = null;
                for (let c = 0; c < row.length; c++) {
                    const cell = String(row[c] || '');
                    if (/명일|익일|예정|tomorrow/i.test(cell)) continue;
                    const d = normalizeReportDate(cell);
                    if (d) {
                        detectedDate = d;
                        break;
                    }
                }

                if (detectedDate) {
                    currentDate = detectedDate;
                    if (!result[currentDate]) {
                        result[currentDate] = { date: currentDate, work_details: [], special_notes: [] };
                    }
                }

                if (!currentDate) continue;

                // 가로형 헤더 구조에서 차일 날짜(d > currentDate) 감지 시 해당 열을 명일 계획 열로 지정
                if (hFutureCol === -1) {
                    row.forEach((cell, c) => {
                        const d = normalizeReportDate(cell);
                        if (d && d > currentDate && c > 3) {
                            hFutureCol = c;
                        }
                        if (/Remark|특이사항|이슈|비고/i.test(String(cell)) && hRemarkCol === -1) {
                            hRemarkCol = c;
                        }
                    });
                }

                const firstCol = String(row[0] || '').replace(/\s+/g, '');

                // 행 자체가 명일/익일 예정 행인 경우 전체 건너뜀
                const isPlanRow = /명일|익일|예정/i.test(firstCol) && !/이슈|특이사항|문제점|건의|비고|Remark/i.test(firstCol);
                if (isPlanRow) continue;

                const isSpecialNoteRow = /이슈|특이사항|문제점|건의|비고|Remark/i.test(firstCol) || /이슈\s*사항/i.test(rowText);
                const deptPrefix = /^(기구|제어|비전|설비|전장|전기|공압|배관)$/i.test(firstCol) ? `[${String(row[0]).trim()}] ` : '';

                for (let c = 0; c < row.length; c++) {
                    const cellVal = String(row[c] || '').trim();
                    if (!cellVal) continue;
                    if (/^(구분|주요\s*진행\s*사항|금일\s*진행|명일\s*진행|주요\s*진행\s*예정|명일\s*진행\s*예정|이슈\s*사항|특이사항|비고|일일\s*업무\s*보고|주요\s*업무|일자|날짜|Activity|Remark|Today|Tomorrow|기구|제어|비전|설비|Time|Weather|Temperature|Cut off)$/i.test(cellVal.replace(/[\s\(\),:]/g, ''))) continue;
                    if (/지연항목|안해도\s*됨|불러와야\s*함|Progress Behind|Progress\s*Guide/i.test(cellVal)) continue;
                    if (/^(Time|Weather|Temperature|Sunny|Cloudy|Rainy|26℃|\d{1,2}℃|\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})$/i.test(cellVal)) continue;
                    if (/^(Project|Work Scope|Main Contractor|Daily Progress Report|Cut off)\s*:/i.test(cellVal) || /Daily Progress Report/i.test(cellVal)) continue;
                    if (normalizeReportDate(cellVal)) continue;

                    // 명일/예정 열은 일보 기록 시 제외 (작업내용이나 특이사항 어디에도 넣지 않고 순수 당일 내용만 보존)
                    let isPlanCol = false;
                    let isRemarkCol = false;
                    if (hFutureCol !== -1) {
                        if (c >= hFutureCol && (hRemarkCol === -1 || c < hRemarkCol)) isPlanCol = true;
                        if (hRemarkCol !== -1 && c >= hRemarkCol) isRemarkCol = true;
                    } else {
                        isPlanCol = (c >= 1 && /명일|예정|tomorrow/i.test(String(row[c - 1] || '')));
                    }
                    if (isPlanCol) continue;

                    // 특이사항 또는 작업내용으로 분류하여 누적
                    const isNoteCell = isSpecialNoteRow || isRemarkCol || /^(특이사항|이슈):/i.test(cellVal);
                    if (isNoteCell) {
                        const noteToAdd = deptPrefix ? `${deptPrefix}${cellVal}` : cellVal;
                        if (!result[currentDate].special_notes.includes(noteToAdd)) {
                            result[currentDate].special_notes.push(noteToAdd);
                        }
                    } else if (cellVal.length >= 4 || /\[.*\]|<.*>|\d\./.test(cellVal)) {
                        let textToAdd = deptPrefix ? `${deptPrefix}${cellVal}` : cellVal;
                        if (grid[0] && grid[0][c] && /라인|line|cs|일보/i.test(grid[0][c]) && !/비고|비전/i.test(grid[0][c])) {
                            const colHdr = String(grid[0][c]).trim().replace(/\s+/g, ' ');
                            if (!textToAdd.includes(colHdr)) {
                                textToAdd = `[${colHdr}]\n${textToAdd}`;
                            }
                        }
                        if (!result[currentDate].work_details.includes(textToAdd)) {
                            result[currentDate].work_details.push(textToAdd);
                        }
                    }
                }
            }
        }

        const finalMap = {};
        Object.keys(result).forEach(d => {
            const item = result[d];
            const workJoined = item.work_details.join('\n');
            const noteJoined = item.special_notes.join('\n');
            if (workJoined || noteJoined) {
                finalMap[d] = {
                    date: d,
                    work_details: workJoined,
                    special_notes: noteJoined
                };
            }
        });

        return finalMap;
    };

    // 선택된 프로젝트 내용만 필터링하여 일보 직접입력 폼에 반영하는 함수
    const applyFilteredWorkMap = (targetProj, workMap) => {
        if (!workMap || Object.keys(workMap).length === 0) return;

        const targetMap = {};
        Object.entries(workMap).forEach(([date, w]) => {
            if (targetProj === '__ALL__') {
                targetMap[date] = { ...w };
            } else {
                const projs = splitProjectsFromText(w.work_details, projects);
                // 정규화된 프로젝트명으로 매칭되는 모든 블록을 수집
                const matches = projs.filter(p => p.name === targetProj);
                if (matches.length > 0) {
                    const combined = matches.map(m => m.content.trim()).filter(Boolean).join('\n\n');
                    if (combined) {
                        targetMap[date] = {
                            date,
                            work_details: combined,
                            special_notes: w.special_notes || ''
                        };
                    }
                }
            }
        });

        const validDates = Object.keys(targetMap).sort();
        if (validDates.length === 0) {
            setMsg(`선택한 프로젝트 [${targetProj}]에 해당하는 작업내용이 없습니다.`);
            return;
        }

        setExtractedReports(prev => {
            const isInitialEmpty = prev.length === 1 && !prev[0].work_details.trim() && !prev[0].special_notes.trim() && (prev[0].personnel_count || 0) === 0;
            const currentMap = {};
            if (!isInitialEmpty) {
                prev.forEach(r => {
                    if (r.date) currentMap[r.date] = { ...r };
                });
            }

            validDates.forEach(d => {
                const w = targetMap[d];
                const existingDbReport = (projectReports || []).find(p => p.report_date === d);

                if (!currentMap[d]) {
                    currentMap[d] = {
                        date: d,
                        work_details: w.work_details || existingDbReport?.work_details || existingDbReport?.content || '',
                        special_notes: w.special_notes || existingDbReport?.special_notes || existingDbReport?.issues || '',
                        personnel_count: existingDbReport?.personnel_count || 0,
                        pm_count: existingDbReport?.pm_count || 0,
                        design_count: existingDbReport?.design_count || 0,
                        facility_count: existingDbReport?.facility_count || 0,
                        control_count: existingDbReport?.control_count || 0,
                        vision_count: existingDbReport?.vision_count || 0
                    };
                } else {
                    currentMap[d].work_details = w.work_details || currentMap[d].work_details;
                    if (w.special_notes) {
                        currentMap[d].special_notes = currentMap[d].special_notes
                            ? `${currentMap[d].special_notes}\n${w.special_notes}`
                            : w.special_notes;
                    }
                    const curTotal = (currentMap[d].pm_count || 0) + (currentMap[d].design_count || 0) + (currentMap[d].facility_count || 0) +
                                    (currentMap[d].control_count || 0) + (currentMap[d].vision_count || 0) + (currentMap[d].personnel_count || 0);
                    if (curTotal === 0 && existingDbReport) {
                        currentMap[d].pm_count = existingDbReport.pm_count || 0;
                        currentMap[d].design_count = existingDbReport.design_count || 0;
                        currentMap[d].facility_count = existingDbReport.facility_count || 0;
                        currentMap[d].control_count = existingDbReport.control_count || 0;
                        currentMap[d].vision_count = existingDbReport.vision_count || 0;
                        currentMap[d].personnel_count = existingDbReport.personnel_count || 0;
                    }
                }
            });

            const mergedList = Object.values(currentMap).sort((a, b) => a.date.localeCompare(b.date));
            return mergedList.length > 0 ? mergedList : prev;
        });

        setCollapsedSections(prev => ({ ...prev, inputForm: false }));
        const label = targetProj === '__ALL__' ? '전체 내용' : `[${targetProj}]`;
        setMsg(`📋 작업내용 시트 붙여넣기 완료: ${label} ${validDates.length}일치 데이터(${validDates[0]} ~ ${validDates[validDates.length - 1]})를 직접입력 폼에 반영했습니다.`);
    };

    const parseManpowerSheetGrid = (grid) => {
        const finalMap = {};
        if (!grid || grid.length === 0) return finalMap;

        const initDate = (d) => {
            if (!finalMap[d]) {
                finalMap[d] = {
                    date: d,
                    pm_count: 0,
                    design_count: 0,
                    facility_count: 0,
                    control_count: 0,
                    vision_count: 0,
                    personnel_count: 0,
                    _totalFromSheet: 0
                };
            }
        };

        // 직종 자동 판별기 (현장별 다양한 직종 및 조직 명칭 통합)
        const classifyDept = (text) => {
            const clean = String(text || '').replace(/\s+/g, '');
            if (/소장|PM|현장소장|관리자|현장대리|Supervisor/i.test(clean)) return 'pm_count';
            if (/설계|도면|설계팀/i.test(clean)) return 'design_count';
            if (/설비|기구|생기|생산기술|설비기술|기계|배관|공압/i.test(clean)) return 'facility_count';
            if (/제어|전장|전기|PLC/i.test(clean)) return 'control_count';
            if (/비전|Vision|검사/i.test(clean)) return 'vision_count';
            if (/안전|통역|법인|CS|외주|^기타$/i.test(clean)) return 'personnel_count';
            if (/합계|총원|투입|인원|공수|총합|total|^계$/i.test(clean)) return '__TOTAL__';
            return null;
        };

        // 사용자 지침 기반 정밀 MD 환산 함수:
        // 주간 기준: 8시간 근무 시 1.0 MD, 8시간 초과~16시간 미만 = 1.5 MD, 16시간 이상 = 2.0 MD (4시간 반일 = 0.5 MD)
        // 야간 기준: 기본 1.5 MD부터 시작하여 동일하게 증가 (<=8시간 = 1.5 MD, 8시간 초과~16시간 미만 = 2.0 MD, 16시간 이상 = 2.5 MD)
        const calculateWorkedHoursToMD = (hours, isNight = false) => {
            const h = parseFloat(hours);
            if (isNaN(h) || h <= 0) return 0;
            if (!isNight) {
                if (h <= 4.5) return 0.5;
                if (h <= 8.5) return 1.0;
                if (h < 16.0) return 1.5;
                return 2.0;
            } else {
                if (h <= 8.5) return 1.5;
                if (h < 16.0) return 2.0;
                return 2.5;
            }
        };

        // 1. 유효 일자 열(Date Columns) 자동 감지 (단일행 일자 + 2행 분할 월/일 모두 지원)
        let bestDateRowIdx = -1;
        let maxDateCount = 0;
        let bestDateColMap = {};

        // A. 단일 행 내 일자(엑셀 일련번호, YYYY-MM-DD, M/D 등) 최다 보유 행 탐색
        for (let r = 0; r < Math.min(8, grid.length); r++) {
            const row = grid[r];
            let count = 0;
            const temp = {};
            row.forEach((cell, c) => {
                const d = normalizeReportDate(cell);
                if (d) {
                    count++;
                    temp[c] = d;
                }
            });
            if (count > maxDateCount && count >= 2) {
                maxDateCount = count;
                bestDateRowIdx = r;
                bestDateColMap = temp;
            }
        }

        // B. 2행 분할 헤더(상단 월 마커 + 하단 1~31 일수, 예: SKOY 양식) 검사
        if (maxDateCount < 5) {
            let monthRowIdx = -1;
            const monthCols = {};
            for (let r = 0; r < Math.min(6, grid.length); r++) {
                const row = grid[r];
                let currentYM = null;
                row.forEach((cell, c) => {
                    const s = String(cell).trim();
                    const mMonth = s.match(/(?:(20\d{2})년\s*)?(1[0-2]|0?[1-9])월/);
                    if (mMonth) {
                        const yr = mMonth[1] || new Date().getFullYear();
                        currentYM = `${yr}-${String(mMonth[2]).padStart(2, '0')}`;
                    }
                    if (currentYM) {
                        monthCols[c] = currentYM;
                    }
                });
                if (Object.keys(monthCols).length >= 5) {
                    monthRowIdx = r;
                    break;
                }
            }

            if (monthRowIdx !== -1) {
                for (let r = monthRowIdx + 1; r < Math.min(monthRowIdx + 4, grid.length); r++) {
                    const row = grid[r];
                    let dayCount = 0;
                    const temp = {};
                    row.forEach((cell, c) => {
                        const n = parseInt(String(cell).trim(), 10);
                        if (!isNaN(n) && n >= 1 && n <= 31 && monthCols[c]) {
                            temp[c] = `${monthCols[c]}-${String(n).padStart(2, '0')}`;
                            dayCount++;
                        }
                    });
                    if (dayCount > maxDateCount) {
                        maxDateCount = dayCount;
                        bestDateRowIdx = r;
                        bestDateColMap = temp;
                    }
                }
            }
        }

        const dateCols = Object.keys(bestDateColMap).map(c => parseInt(c, 10));

        // 2-Row Attendance (출근 행 + 퇴근 행) 양식 여부 판별
        let isTwoRowAttendance = false;
        if (dateCols.length > 0) {
            for (let r = bestDateRowIdx + 1; r < Math.min(bestDateRowIdx + 20, grid.length); r++) {
                const rowText = grid[r].map(c => String(c)).join(' ');
                if (/출근/i.test(rowText) && grid[r + 1] && /퇴근/i.test(grid[r + 1].map(c => String(c)).join(' '))) {
                    isTwoRowAttendance = true;
                    break;
                }
            }
        }

        if (dateCols.length > 0 && isTwoRowAttendance) {
            // [패턴 1] 2행 출퇴근 기록 양식 (SK대전연구소, 헝가리근태, 삼성SDI, SKBA 등)
            for (let r = bestDateRowIdx + 1; r < grid.length; r++) {
                const rowIn = grid[r];
                if (!rowIn || rowIn.length === 0) continue;

                const textIn = rowIn.slice(0, 6).map(c => String(c)).join(' ');
                if (!/출근/i.test(textIn)) continue;

                const rowOut = grid[r + 1] || [];
                let deptKey = 'personnel_count';
                for (let c = 0; c < 6; c++) {
                    const dk = classifyDept(rowIn[c] || rowOut[c]);
                    if (dk && dk !== '__TOTAL__') {
                        deptKey = dk;
                        break;
                    }
                }

                dateCols.forEach(col => {
                    const dateStr = bestDateColMap[col];
                    const inVal = rowIn[col];
                    const outVal = rowOut[col];

                    if (!inVal && !outVal) return;
                    const inStr = String(inVal).trim();
                    const outStr = String(outVal).trim();
                    if (/휴무|휴일|휴가|병가|귀국|공가|결근|LEAVE/i.test(inStr + ' ' + outStr)) return;

                    let startH = 0;
                    let endH = 0;
                    let hasIn = false;
                    let hasOut = false;

                    if (typeof inVal === 'number' && inVal > 0 && inVal < 1) {
                        startH = inVal * 24;
                        hasIn = true;
                    } else if (/^\d{1,2}(:\d{2})?$/.test(inStr)) {
                        const parts = inStr.split(':');
                        startH = parseInt(parts[0], 10) + (parts[1] ? parseInt(parts[1], 10) / 60 : 0);
                        hasIn = true;
                    }

                    if (typeof outVal === 'number' && outVal > 0 && outVal < 1) {
                        endH = outVal * 24;
                        hasOut = true;
                    } else if (/^\d{1,2}(:\d{2})?$/.test(outStr)) {
                        const parts = outStr.split(':');
                        endH = parseInt(parts[0], 10) + (parts[1] ? parseInt(parts[1], 10) / 60 : 0);
                        hasOut = true;
                    }

                    let md = 0;
                    const isNight = startH >= 19 || startH <= 5 || /야간/i.test(textIn);

                    if (hasIn && hasOut) {
                        if (endH < startH) endH += 24;
                        let duration = endH - startH;
                        if (duration >= 8.5) duration -= 1.0;
                        md = calculateWorkedHoursToMD(duration, isNight);
                    } else if (hasIn || hasOut || /출근|정상|근무|출장|^1$/i.test(inStr + ' ' + outStr)) {
                        md = isNight ? 1.5 : 1.0;
                    }

                    if (md > 0) {
                        initDate(dateStr);
                        finalMap[dateStr][deptKey] = (finalMap[dateStr][deptKey] || 0) + md;
                    }
                });
                r++; // 퇴근 행 건너뜀
            }
        } else if (dateCols.length > 0) {
            // [패턴 2] 가로 캘린더형 (근무 시간 8/10h, 시간범위 08:00~17:00, 직종별 인원수/MD 1/1.5/2 등)
            for (let r = bestDateRowIdx + 1; r < grid.length; r++) {
                const row = grid[r];
                if (!row || row.length === 0) continue;

                let deptKey = null;
                let isTotalRow = false;
                let rowLabel = '';
                for (let c = 0; c < Math.min(6, row.length); c++) {
                    const str = String(row[c]).trim();
                    rowLabel += ' ' + str;
                    const dk = classifyDept(str);
                    if (dk === '__TOTAL__') isTotalRow = true;
                    else if (dk && !deptKey) deptKey = dk;
                }

                if (!deptKey && !isTotalRow) continue;
                const targetDept = isTotalRow ? '__TOTAL__' : deptKey;

                dateCols.forEach(col => {
                    const dateStr = bestDateColMap[col];
                    const val = row[col];
                    if (!val) return;
                    const s = String(val).trim();
                    if (!s || /휴무|휴일|휴가|병가|귀국|공가|결근/i.test(s)) return;

                    let md = 0;
                    const isNight = /야간|심야|night/i.test(rowLabel);

                    // 1. "08:00 ~ 21:00" 형태의 출퇴근 시간 범위
                    const timeRangeMatch = s.match(/([0-9]{1,2}):([0-9]{2})\s*[-~]\s*([0-9]{1,2}):([0-9]{2})/);
                    if (timeRangeMatch) {
                        const stH = parseInt(timeRangeMatch[1], 10) + parseInt(timeRangeMatch[2], 10) / 60;
                        let etH = parseInt(timeRangeMatch[3], 10) + parseInt(timeRangeMatch[4], 10) / 60;
                        if (etH < stH) etH += 24;
                        let dur = etH - stH;
                        if (dur >= 8.5) dur -= 1.0;
                        md = calculateWorkedHoursToMD(dur, isNight || stH >= 19 || etH <= 6);
                    } else if (typeof val === 'number' && val > 0 && val < 1.0) {
                        // 2. 단일행 출근 시각 분수 표기 (0.375 = 09:00 출근) -> 1.0 MD 배정
                        md = isNight ? 1.5 : 1.0;
                    } else {
                        const n = parseFloat(s.replace(/[^0-9.]/g, ''));
                        // 엑셀 날짜 일련번호(45000~47000) 등 오기입 데이터 제외
                        if (!isNaN(n) && n > 0 && !(n > 30000 && n < 70000)) {
                            if (n >= 6 && n <= 24 && !isTotalRow) {
                                // 3. 근무한 시간 (8시간, 10시간, 12시간 등)
                                md = calculateWorkedHoursToMD(n, isNight);
                            } else {
                                // 4. 인원수 또는 MD 직접 표기 (1, 1.5, 2, 0.5 등)
                                md = n;
                            }
                        }
                    }

                    if (md > 0) {
                        initDate(dateStr);
                        if (targetDept === '__TOTAL__') {
                            finalMap[dateStr]._totalFromSheet = md;
                        } else {
                            finalMap[dateStr][targetDept] = (finalMap[dateStr][targetDept] || 0) + md;
                        }
                    }
                });
            }
        } else {
            // [패턴 3] 세로 일자형 목록 (날짜가 아래로 내려가고 부서가 상단 헤더에 있는 양식)
            let headerRowIdx = -1;
            let dateColIdx = -1;
            const deptColMap = {};

            for (let r = 0; r < Math.min(10, grid.length); r++) {
                const row = grid[r];
                let dCol = -1;
                const tempDeptCols = {};
                row.forEach((cell, cIdx) => {
                    const clean = cell.replace(/\s+/g, '');
                    if (/일자|날짜|Date/i.test(clean) && dCol === -1) {
                        dCol = cIdx;
                    }
                    const deptKey = classifyDept(clean);
                    if (deptKey) {
                        tempDeptCols[cIdx] = deptKey;
                    }
                });

                if (dCol !== -1 || Object.keys(tempDeptCols).length >= 2) {
                    headerRowIdx = r;
                    dateColIdx = dCol;
                    Object.assign(deptColMap, tempDeptCols);
                    break;
                }
            }

            const startR = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
            for (let r = startR; r < grid.length; r++) {
                const row = grid[r];
                if (!row || row.length === 0) continue;

                let rowDate = null;
                if (dateColIdx !== -1 && row[dateColIdx]) {
                    rowDate = normalizeReportDate(row[dateColIdx]);
                } else {
                    for (let c = 0; c < Math.min(3, row.length); c++) {
                        const testD = normalizeReportDate(row[c]);
                        if (testD) {
                            rowDate = testD;
                            break;
                        }
                    }
                }

                if (!rowDate) continue;
                initDate(rowDate);

                Object.entries(deptColMap).forEach(([colIdx, deptKey]) => {
                    const cNum = parseInt(colIdx, 10);
                    const val = row[cNum];
                    if (!val) return;
                    const s = String(val).trim();
                    if (!s || /휴무|휴일|휴가|병가|귀국|공가|결근/i.test(s)) return;

                    let md = 0;
                    const n = parseFloat(s.replace(/[^0-9.]/g, ''));
                    if (!isNaN(n) && n > 0 && !(n > 30000 && n < 70000)) {
                        if (n >= 6 && n <= 24 && deptKey !== '__TOTAL__') {
                            md = calculateWorkedHoursToMD(n, false);
                        } else {
                            md = n;
                        }
                    }

                    if (md > 0) {
                        if (deptKey === '__TOTAL__') {
                            finalMap[rowDate]._totalFromSheet = md;
                        } else {
                            finalMap[rowDate][deptKey] = (finalMap[rowDate][deptKey] || 0) + md;
                        }
                    }
                });
            }
        }

        // 3. 인원 합산 보정 (Total/합계가 '기타'로 오분류되지 않도록 처리)
        Object.values(finalMap).forEach(item => {
            const deptSum = (item.pm_count || 0) + (item.design_count || 0) + (item.facility_count || 0) + (item.control_count || 0) + (item.vision_count || 0);
            const totalVal = item._totalFromSheet || 0;

            if (deptSum > 0) {
                if (totalVal > deptSum && (!item.personnel_count || item.personnel_count === 0)) {
                    item.personnel_count = totalVal - deptSum;
                }
            } else if (totalVal > 0 && (!item.personnel_count || item.personnel_count === 0)) {
                item.personnel_count = totalVal;
            }
            delete item._totalFromSheet;
        });

        // 4. 데이터가 없는 일자는 자동 제외하여 일보 추가 방지
        const filteredMap = {};
        Object.entries(finalMap).forEach(([dateStr, item]) => {
            const totalMD = (item.pm_count || 0) + (item.design_count || 0) + (item.facility_count || 0) +
                            (item.control_count || 0) + (item.vision_count || 0) + (item.personnel_count || 0);
            if (totalMD > 0) {
                filteredMap[dateStr] = item;
            }
        });

        return filteredMap;
    };

    const handlePasteReportSheet = (e, type) => {
        e.preventDefault();
        if (isGrade1) return notifyPermission('일보 데이터 등록');

        const html = e.clipboardData?.getData("text/html") || "";
        const text = e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text") || "";

        if (!html && !text) {
            setMsg('클립보드에 복사된 표 데이터가 없습니다.');
            return;
        }

        const grid = extractGridFromClipboard(html, text);
        if (!grid || grid.length === 0) {
            setMsg('표 형태의 데이터를 인식하지 못했습니다. 엑셀에서 셀 범위를 복사(Ctrl+C)한 후 붙여넣어 주세요.');
            return;
        }

        if (type === 'work') {
            const workMap = parseWorkSheetGrid(grid);
            const dates = Object.keys(workMap).sort();
            if (dates.length === 0) {
                setMsg('작업내용 시트에서 날짜나 작업 내용을 찾을 수 없습니다. 일자 및 작업내용 열이 포함되어 있는지 확인해주세요.');
                return;
            }

            // 고유 프로젝트 목록 및 일자 수 집계
            const projectDays = {};
            const projectSamples = {};
            Object.values(workMap).forEach(w => {
                const projs = splitProjectsFromText(w.work_details, projects);
                const seenOnThisDay = new Set();
                projs.forEach(p => {
                    if (p.name !== '일보 전체' && p.name !== '기타/공통') {
                        if (!seenOnThisDay.has(p.name)) {
                            seenOnThisDay.add(p.name);
                            projectDays[p.name] = (projectDays[p.name] || 0) + 1;
                        }
                        if (!projectSamples[p.name] && p.content) {
                            projectSamples[p.name] = p.content;
                        }
                    }
                });
            });
            const uniqueProjects = Object.keys(projectDays);

            // 2개 이상의 복수 프로젝트가 감지된 경우 -> 사용자 선택 모달 오픈!
            if (uniqueProjects.length >= 2) {
                const curProjectObj = (projects || []).find(p => p.id === selectedProject);
                let defaultChoice = uniqueProjects[0];
                const curProjDisp = curProjectObj ? (curProjectObj.manufacturingNo ? `[${curProjectObj.manufacturingNo}] ${curProjectObj.name}` : curProjectObj.name) : '선택된 프로젝트 없음';

                if (curProjectObj) {
                    const curName = (curProjectObj.name || '').toLowerCase();
                    const curClean = (curProjectObj.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
                    const curLine = extractLineSignature(curClean);
                    let bestScore = -999;

                    uniqueProjects.forEach(cand => {
                        const candClean = cand.replace(/\s*\([^)]*\)\s*$/, '').trim();
                        const candLine = extractLineSignature(candClean);
                        let score = 0;

                        // 1. 제조번호(Manufacturing No: H055 등) 일치 시 최우선 가산 (+150)
                        if (curProjectObj.manufacturingNo) {
                            const curMfg = curProjectObj.manufacturingNo.toUpperCase();
                            if (cand.toUpperCase().includes(curMfg) || candClean.toUpperCase().includes(curMfg)) {
                                score += 150;
                            }
                        }

                        // 2. 사이트 시그니처 일치 (+30) 또는 타 사이트 오연결 차단 (-100)
                        const candSite = extractSiteSignature(cand);
                        const curSite = extractSiteSignature(curClean);
                        if (candSite && curSite) {
                            if (candSite === curSite) score += 30;
                            else score -= 100;
                        }

                        // 3. 프로젝트 정규화 명칭 완전 일치 시 최우선
                        if (candClean === curClean || cand.includes(curClean) || curClean.includes(candClean)) {
                            score += 100;
                        }

                        // 4. 라인 번호/범위 일치 여부
                        if (curLine && candLine) {
                            if (curLine === candLine) score += 60;
                            else if (isLineInRange(candLine, curLine) || isLineInRange(curLine, candLine)) score += 40;
                            else score -= 50;
                        }

                        // 5. 공정/단계(Stage) 일치 여부
                        const candIsSetup = /set-?up|셋업|설치/i.test(cand);
                        const curIsSetup = /set-?up|셋업|설치/i.test(curClean);
                        if (candIsSetup && curIsSetup) score += 20;

                        const candIsYangsan = /양산/i.test(cand);
                        const curIsYangsan = /양산/i.test(curClean);
                        if (candIsYangsan && curIsYangsan) score += 20;

                        const candIsJC = /j\/?c|형교환/i.test(cand);
                        const curIsJC = /j\/?c|형교환/i.test(curClean);
                        if (candIsJC && curIsJC) score += 25;

                        // 6. 단어 토큰 매칭
                        const tokens = curName.split(/[\s,()_~-]+/).filter(t => t.length >= 2);
                        tokens.forEach(t => {
                            if (cand.toLowerCase().includes(t)) score += 5;
                        });

                        if (score > bestScore) {
                            bestScore = score;
                            defaultChoice = cand;
                        }
                    });
                }

                setSplitProjectModal({
                    isOpen: true,
                    uniqueProjects,
                    projectFreq: projectDays,
                    projectSamples,
                    selectedChoice: defaultChoice,
                    recommendedProject: defaultChoice,
                    currentProjectName: curProjDisp,
                    workMap
                });
                return;
            }

            // 단일 프로젝트거나 분리할 프로젝트가 없는 경우 바로 적용
            applyFilteredWorkMap('__ALL__', workMap);
        } else if (type === 'manpower') {
            const mpMap = parseManpowerSheetGrid(grid);
            const dates = Object.keys(mpMap).sort();
            if (dates.length === 0) {
                setMsg('공수 시트에서 유효한 인원/공수 데이터(0 초과)를 찾을 수 없습니다. (데이터가 없는 일자는 자동으로 제외됩니다)');
                return;
            }

            mergeManpowerIntoExtracted(mpMap);
            setCollapsedSections(prev => ({ ...prev, inputForm: false }));
            setMsg(`👥 공수 시트 붙여넣기 완료: 유효 인원 데이터가 있는 ${dates.length}일치(${dates[0]} ~ ${dates[dates.length - 1]})를 직접입력 폼에 반영했습니다. (데이터 없는 일자는 자동 제외)`);
        }
    };

    const [collapsedSections, setCollapsedSections] = useState(() => {
        try {
            const saved = localStorage.getItem('pm_issue_collapsed_sections');
            if (saved) {
                const parsed = JSON.parse(saved);
                return { upload: false, inputForm: true, reportList: false, ...parsed };
            }
        } catch (e) {
            console.warn(e);
        }
        return { upload: false, inputForm: true, reportList: false };
    });

    const toggleSection = (key) => {
        setCollapsedSections(prev => {
            const next = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem('pm_issue_collapsed_sections', JSON.stringify(next));
            } catch (e) {}
            return next;
        });
    };

    const toggleReport = (id) => {
        setExpandedReports(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleAllReports = (expand) => {
        const next = {};
        projectReports.forEach(r => {
            next[r.id] = expand;
        });
        setExpandedReports(next);
    };

    const setAllSections = (expand) => {
        const next = { upload: !expand, inputForm: !expand, reportList: !expand };
        setCollapsedSections(next);
        try {
            localStorage.setItem('pm_issue_collapsed_sections', JSON.stringify(next));
        } catch (e) {}
        toggleAllReports(expand);
    };

    const generatePPT = async () => {
        if (isGrade1) return notifyPermission('AI 통합 분석 & PPT 보고서');
        if (startDate > endDate) return setAnalyzeMsg('시작일이 종료일보다 클 수 없습니다.');
        
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return setAnalyzeMsg('Gemini API 키가 설정되지 않았습니다.');

        setIsAnalyzing(true);
        setAnalyzeMsg('데이터를 수집하는 중...');

        try {
            // 1. Fetch all reports in date range
            const { data: reports, error } = await supabase
                .from('daily_reports')
                .select('*')
                .gte('report_date', startDate)
                .lte('report_date', endDate + 'T23:59:59.999Z');

            if (error) throw error;
            if (!reports || reports.length === 0) {
                throw new Error('해당 기간에 등록된 공사일보가 없습니다.');
            }

            setAnalyzeMsg('AI가 전체 프로젝트를 종합 분석 중입니다... (약 10~30초)');

            // Group reports by project
            const grouped = {};
            reports.forEach(r => {
                const p = projects.find(x => x.id === r.project_id);
                if (!p) return;
                const pName = p.manufacturingNo ? `${p.manufacturingNo} ${p.name}` : p.name;
                if (!grouped[pName]) grouped[pName] = [];
                // Use structured data for PPT gen
                const details = `작업내용: ${r.work_details || ''}\n특이/이슈사항: ${r.special_notes || r.issues || ''}\n투입인원: ${r.personnel_count || 0}명`;
                const content = r.content || details; // Fallback for old records
                grouped[pName].push(`- ${r.report_date}:\n${content}`);
            });

            let compiledText = '';
            for (const [pName, lines] of Object.entries(grouped)) {
                compiledText += `\n\n[프로젝트: ${pName}]\n` + lines.join('\n\n');
            }

            // 2. Call Gemini
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

            const prompt = `
다음은 ${startDate}부터 ${endDate}까지 수집된 각 프로젝트들의 공사일보 내용입니다.
이 내용들을 분석하여 1페이지 분량의 [전체 종합 요약]과, [각 프로젝트별 주요 이슈/특이사항]을 정리해주세요.
결과는 반드시 아래 JSON 형식으로만 응답하세요 (마크다운 백틱 없이 순수 JSON만 반환).

{
  "summary": "전체 프로젝트들의 진행 상황, 공통 이슈, 주의점 등을 포함한 상세한 종합 요약 텍스트 (줄바꿈은 \\n 사용)",
  "projects": [
    {
      "project_name": "프로젝트 이름",
      "issues": [
        "분석된 주요 이슈나 특이사항 1",
        "분석된 주요 이슈나 특이사항 2"
      ]
    }
  ]
}

공사일보 내역:
${compiledText.substring(0, 30000)}
`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);

            if (!parsed.summary || !parsed.projects) {
                throw new Error('AI 응답이 올바른 형식이 아닙니다.');
            }

            setAnalyzeMsg('PPT 보고서를 생성 중입니다...');

            // 3. Create PPT
            let pptx = new pptxgen();
            pptx.author = 'AI Issue Management';
            pptx.company = 'TW Project';
            pptx.title = 'Project Issues Report';

            // Master Slide Layout
            pptx.defineSlideMaster({
                title: 'MASTER_SLIDE',
                background: { color: 'F1F5F9' },
                objects: [
                    { rect: { x: 0, y: 0, w: '100%', h: 0.6, fill: { color: '0F172A' } } },
                    { text: { text: 'TW 프로젝트 관리 - AI 통합 분석 보고서', options: { x: 0.2, y: 0.1, w: 5, h: 0.4, color: 'FFFFFF', fontSize: 12, bold: true, fontFace: '맑은 고딕' } } },
                    { text: { text: `${startDate} ~ ${endDate}`, options: { x: '70%', y: 0.1, w: '28%', h: 0.4, color: 'FFFFFF', fontSize: 10, align: 'right', fontFace: '맑은 고딕' } } },
                    { rect: { x: 0.5, y: 1.5, w: '90%', h: 3.5, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } } }
                ]
            });

            // Slide 1: Summary
            let slide1 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
            slide1.addText('전체 프로젝트 종합 요약', { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 12, bold: true, color: '0F172A', fontFace: '맑은 고딕' });
            
            slide1.addText(parsed.summary, {
                x: 0.7, y: 1.7, w: '86%', h: 3.1,
                fontSize: 8, color: '334155', valign: 'top', breakLine: true, fontFace: '맑은 고딕',
                lineSpacingMultiple: 1.5, autoPaged: true
            });

            // Slide 2..N: Projects
            parsed.projects.forEach(p => {
                let pSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
                pSlide.addText(`프로젝트별 이슈: ${p.project_name}`, { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 12, bold: true, color: '0F172A', fontFace: '맑은 고딕' });
                
                const bulletList = p.issues.map(iss => ({ text: iss, options: { bullet: true, fontFace: '맑은 고딕' } }));
                pSlide.addText(bulletList, {
                    x: 0.7, y: 1.7, w: '86%', h: 3.1,
                    fontSize: 8, color: '334155', valign: 'top', fontFace: '맑은 고딕',
                    lineSpacingMultiple: 1.5, autoPaged: true
                });
            });

            await pptx.writeFile({ fileName: `프로젝트_통합분석보고서_${endDate}.pptx` });

            setAnalyzeMsg('🎉 분석 및 PPT 생성이 완료되었습니다!');

        } catch (error) {
            console.error(error);
            if (error.message.includes('429') || error.message.includes('quota') || error.message.toLowerCase().includes('too many requests') || error.message.includes('exceeded')) {
                setAnalyzeMsg('🚨 무료 AI 사용량이 일시적으로 초과되었습니다. 1분 뒤에 다시 시도해주세요. (과금되지 않습니다)');
            } else {
                setAnalyzeMsg('오류 발생: ' + error.message);
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="issue-management-container">
            {/* 프로젝트 이슈 및 일보관리 시스템 메인 헤더 카드 (틀고정) */}
            <div className="system-sticky-header">
                <div className="system-header-row">
                    <div className="system-title-group">
                        <div className="system-logo-icon">
                            📋
                        </div>
                        <div className="system-title-text">
                            <h2>
                                <span style={{ color: '#0969da', WebkitTextFillColor: '#0969da' }}>프로젝트</span> 이슈 및 일보관리 시스템 (Issue & Daily Log Management)
                            </h2>
                            <p>
                                공사일보 텍스트 축적 및 AI 기반 자동 PPT 보고서 생성
                            </p>
                        </div>
                    </div>

                    <div className="system-header-actions">
                        <button
                            type="button"
                            onClick={() => setAllSections(true)}
                            className="system-toggle-all-btn"
                            title="이슈 및 일보관리의 모든 소항목 펼치기"
                        >
                            ▾ 전체 펼치기
                        </button>
                        <button
                            type="button"
                            onClick={() => setAllSections(false)}
                            className="system-toggle-all-btn"
                            title="이슈 및 일보관리의 모든 소항목 접기"
                        >
                            ▴ 전체 접기
                        </button>
                    </div>
                </div>

                {/* 소항목 필터 네비게이션 버튼 바 */}
                <div className="system-sub-nav">
                    <button
                        type="button"
                        className={`system-sub-btn ${activeIssueSection === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveIssueSection('all')}
                    >
                        🌐 전체 표시
                    </button>
                    <button
                        type="button"
                        className={`system-sub-btn ${activeIssueSection === 'register' ? 'active' : ''}`}
                        onClick={() => {
                            setActiveIssueSection('register');
                            setCollapsedSections(prev => ({ ...prev, inputForm: false, upload: false }));
                        }}
                    >
                        ✏️ 공사일보 등록/업로드
                    </button>
                    <button
                        type="button"
                        className={`system-sub-btn ${activeIssueSection === 'list' ? 'active' : ''}`}
                        onClick={() => setActiveIssueSection('list')}
                    >
                        📋 등록된 일보 목록
                    </button>
                    <button
                        type="button"
                        className={`system-sub-btn ${activeIssueSection === 'analyze' ? 'active' : ''}`}
                        onClick={() => {
                            if (isGrade1) {
                                notifyPermission('AI 통합 분석 & PPT 보고서');
                                return;
                            }
                            setActiveIssueSection('analyze');
                        }}
                        title={isGrade1 ? "Grade 1은 권한이 제한됩니다 (클릭 시 권한 안내)" : ""}
                    >
                        📊 AI 프로젝트 통합 분석 & PPT {isGrade1 && "🔒"}
                    </button>
                </div>
            </div>

            <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, .csv" style={{display: 'none'}} />

            {activeIssueSection !== 'analyze' ? (
                <div className={`main-container ${activeIssueSection !== 'all' ? 'single-pane' : ''}`}>
                    {(activeIssueSection === 'all' || activeIssueSection === 'register') && (
                        <aside className="sidebar" style={{ maxWidth: activeIssueSection === 'register' ? '860px' : 'none', margin: activeIssueSection === 'register' ? '0 auto' : '0', width: '100%' }}>
                        {isGrade1 && (
                            <div style={{background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px', color: '#92400e', lineHeight: '1.4'}}>
                                🔒 <b>Grade 1 (조회 전용)</b><br/>
                                프로젝트 선택 후 등록된 일보 내역 조회만 가능하며, 일보 등록/삭제 및 AI 분석 기능은 제한됩니다.
                            </div>
                        )}
                        <div>
                            <div className="panel-title">프로젝트 및 날짜 *</div>
                            <select className="project-select" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} style={{marginBottom: '0.5rem'}}>
                                <option value="">프로젝트를 선택하세요</option>
                                {projectOptions.map(p => (
                                    <option key={p.id} value={p.id}>{p.manufacturingNo ? `${p.manufacturingNo} · ` : ''}{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{marginTop: '1rem', marginBottom: '1rem'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                                <div className="panel-title" style={{margin: 0, fontSize: '0.8rem', whiteSpace: 'nowrap'}}>공사일보 파일 첨부 및 표 붙여넣기</div>
                                <button
                                    type="button"
                                    onClick={() => toggleSection('upload')}
                                    style={{
                                        background: collapsedSections.upload ? '#3b82f6' : '#f1f5f9',
                                        color: collapsedSections.upload ? '#fff' : '#475569',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '4px',
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {collapsedSections.upload ? '▸ 펼치기' : '▾ 접기'}
                                </button>
                            </div>
                            {!collapsedSections.upload ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', paddingTop: '2px' }}>
                                    {/* 1. 파일 첨부 버튼 (Vision SPC처럼 가로 100% 확장) */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isGrade1) return notifyPermission('공사일보 파일 업로드');
                                            fileInputRef.current.click();
                                        }}
                                        disabled={isExtracting}
                                        style={{
                                            width: '100%',
                                            background: isGrade1 ? '#9ca3af' : isExtracting ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                                            color: '#fff',
                                            padding: '9px 16px',
                                            borderRadius: '8px',
                                            fontWeight: 'bold',
                                            border: 'none',
                                            boxShadow: '0 2px 5px rgba(16, 185, 129, 0.25)',
                                            height: '38px',
                                            whiteSpace: 'nowrap',
                                            cursor: isGrade1 ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            fontSize: '13px',
                                            boxSizing: 'border-box',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title={isGrade1 ? "등록 권한이 없습니다 (클릭 시 권한 안내)" : ""}
                                    >
                                        {isExtracting ? "⏳ AI 분석 중..." : "✨ 파일 첨부 (Excel)"} {isGrade1 && "🔒"}
                                    </button>

                                    {/* 2. 엑셀 작업내용 시트 표 붙여넣기 (Ctrl+V) */}
                                    <textarea
                                        placeholder="📋 1. 작업내용 시트 표 붙여넣기 (Ctrl+V)"
                                        onPaste={(e) => handlePasteReportSheet(e, 'work')}
                                        disabled={isGrade1}
                                        style={{
                                            width: '100%',
                                            height: '38px',
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #10b981',
                                            outline: 'none',
                                            resize: 'none',
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                            boxSizing: 'border-box',
                                            fontSize: '12px',
                                            fontFamily: 'inherit',
                                            background: isGrade1 ? '#f3f4f6' : '#ffffff',
                                            color: '#1e293b',
                                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                                            textAlign: 'left',
                                            cursor: isGrade1 ? 'not-allowed' : 'text'
                                        }}
                                        title={isGrade1 ? "등록 권한이 없습니다" : "엑셀의 작업내용 시트 표 범위를 복사(Ctrl+C)한 후 이 칸에 붙여넣기(Ctrl+V)하세요."}
                                    />

                                    {/* 3. 엑셀 공수(투입인원) 시트 표 붙여넣기 (Ctrl+V) */}
                                    <textarea
                                        placeholder="👥 2. 공수(투입인원) 시트 표 붙여넣기 (Ctrl+V)"
                                        onPaste={(e) => handlePasteReportSheet(e, 'manpower')}
                                        disabled={isGrade1}
                                        style={{
                                            width: '100%',
                                            height: '38px',
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #0284c7',
                                            outline: 'none',
                                            resize: 'none',
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                            boxSizing: 'border-box',
                                            fontSize: '12px',
                                            fontFamily: 'inherit',
                                            background: isGrade1 ? '#f3f4f6' : '#ffffff',
                                            color: '#1e293b',
                                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                                            textAlign: 'left',
                                            cursor: isGrade1 ? 'not-allowed' : 'text'
                                        }}
                                        title={isGrade1 ? "등록 권한이 없습니다" : "엑셀의 공수 시트 표 범위를 복사(Ctrl+C)한 후 이 칸에 붙여넣기(Ctrl+V)하세요. 날짜별로 작업내용과 자동 병합됩니다."}
                                    />
                                </div>
                            ) : (
                                <div
                                    onClick={() => toggleSection('upload')}
                                    style={{
                                        padding: '10px',
                                        background: '#f8fafc',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                        color: '#64748b',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    📁 공사일보 파일 첨부 및 표 붙여넣기 영역 접힘 (클릭하여 펼치기 ▾)
                                </div>
                            )}
                        </div>

                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: !collapsedSections.inputForm ? '6px' : '0'}}>
                                <div style={{fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap'}}>
                                    공사일보 데이터 ({extractedReports.length}일치 직접입력 등록)
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleSection('inputForm')}
                                    style={{
                                        background: collapsedSections.inputForm ? '#3b82f6' : '#f1f5f9',
                                        color: collapsedSections.inputForm ? '#fff' : '#475569',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '4px',
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        whiteSpace: 'nowrap',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {collapsedSections.inputForm ? '▸ 펼치기' : '▾ 접기'}
                                </button>
                            </div>
                            
                            {!collapsedSections.inputForm && (
                                <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '11px', whiteSpace: 'nowrap'}}>
                                    <span
                                        style={{color: isGrade1 ? '#9ca3af' : 'var(--primary)', cursor: isGrade1 ? 'not-allowed' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap'}}
                                        onClick={() => {
                                            if (isGrade1) return notifyPermission('일보 등록 및 편집');
                                            setExtractedReports([...extractedReports, {date: new Date().toISOString().slice(0,10), work_details:'', special_notes:'', personnel_count:0, pm_count:0, design_count:0, facility_count:0, control_count:0, vision_count:0}]);
                                        }}
                                    >
                                        + 일자 추가 {isGrade1 && "🔒"}
                                    </span>
                                    <span style={{color: '#cbd5e1'}}>|</span>
                                    <span
                                        style={{color: isGrade1 ? '#9ca3af' : 'var(--danger)', cursor: isGrade1 ? 'not-allowed' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap'}}
                                        onClick={() => {
                                            if (isGrade1) return notifyPermission('일보 등록 및 편집');
                                            setExtractedReports([{date: new Date().toISOString().slice(0, 10), work_details: '', special_notes: '', personnel_count: 0, pm_count:0, design_count:0, facility_count:0, control_count:0, vision_count:0}]);
                                        }}
                                    >
                                        초기화
                                    </span>
                                </div>
                            )}
                            
                            {!collapsedSections.inputForm ? (
                                <>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem', maxHeight:'60vh', overflowY:'auto', paddingRight:'5px'}}>
                                        {extractedReports.map((report, idx) => (
                                            <div key={idx} style={{background:'#f6f8fa', padding:'10px', borderRadius:'8px', border:'1px solid #e1e4e8', position:'relative'}}>
                                                {extractedReports.length > 1 && (
                                                    <button onClick={() => setExtractedReports(extractedReports.filter((_, i) => i !== idx))} style={{position:'absolute', right:'5px', top:'5px', background:'transparent', border:'none', color:'var(--danger)', cursor:'pointer', fontWeight:'bold'}}>×</button>
                                                )}
                                                <div style={{marginBottom:'8px'}}>
                                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>일자</label>
                                                    <input type="date" className="project-select" value={report.date} onChange={(e) => {
                                                        const newR = [...extractedReports];
                                                        newR[idx].date = e.target.value;
                                                        setExtractedReports(newR);
                                                    }} style={{padding:'4px'}} />
                                                </div>
                                                <div style={{marginBottom:'8px'}}>
                                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>작업(업무) 내용 *</label>
                                                    <textarea className="paste-textarea" style={{minHeight: '60px'}} placeholder="작업 내용" value={report.work_details} onChange={(e) => {
                                                        const newR = [...extractedReports];
                                                        newR[idx].work_details = e.target.value;
                                                        setExtractedReports(newR);
                                                    }}></textarea>
                                                </div>
                                                <div style={{marginBottom:'8px'}}>
                                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>특이/이슈사항</label>
                                                    <textarea className="paste-textarea" style={{minHeight: '40px'}} placeholder="특이사항 및 이슈사항" value={report.special_notes} onChange={(e) => {
                                                        const newR = [...extractedReports];
                                                        newR[idx].special_notes = e.target.value;
                                                        setExtractedReports(newR);
                                                    }}></textarea>
                                                </div>
                                                <div>
                                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom:'4px', display:'block'}}>
                                                        투입 인원 실적 (합계: {(report.pm_count||0)+(report.design_count||0)+(report.facility_count||0)+(report.control_count||0)+(report.vision_count||0)+(report.personnel_count||0)}명)
                                                    </label>
                                                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px'}}>
                                                        <div style={{fontSize:'0.7rem'}}>소장 <input type="number" value={report.pm_count} onChange={e=>{const newR=[...extractedReports]; newR[idx].pm_count=Number(e.target.value); setExtractedReports(newR);}} style={{width:'40px', padding:'2px'}}/></div>
                                                        <div style={{fontSize:'0.7rem'}}>설계 <input type="number" value={report.design_count} onChange={e=>{const newR=[...extractedReports]; newR[idx].design_count=Number(e.target.value); setExtractedReports(newR);}} style={{width:'40px', padding:'2px'}}/></div>
                                                        <div style={{fontSize:'0.7rem'}}>설비 <input type="number" value={report.facility_count} onChange={e=>{const newR=[...extractedReports]; newR[idx].facility_count=Number(e.target.value); setExtractedReports(newR);}} style={{width:'40px', padding:'2px'}}/></div>
                                                        <div style={{fontSize:'0.7rem'}}>제어 <input type="number" value={report.control_count} onChange={e=>{const newR=[...extractedReports]; newR[idx].control_count=Number(e.target.value); setExtractedReports(newR);}} style={{width:'40px', padding:'2px'}}/></div>
                                                        <div style={{fontSize:'0.7rem'}}>비전 <input type="number" value={report.vision_count} onChange={e=>{const newR=[...extractedReports]; newR[idx].vision_count=Number(e.target.value); setExtractedReports(newR);}} style={{width:'40px', padding:'2px'}}/></div>
                                                        <div style={{fontSize:'0.7rem'}}>기타 <input type="number" value={report.personnel_count} onChange={e=>{const newR=[...extractedReports]; newR[idx].personnel_count=Number(e.target.value); setExtractedReports(newR);}} style={{width:'40px', padding:'2px'}}/></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {(() => {
                                        const hasValidReportsToSave = extractedReports.some(r => {
                                            if (!r.date) return false;
                                            const hasWork = Boolean(r.work_details && r.work_details.trim());
                                            const hasNotes = Boolean(r.special_notes && r.special_notes.trim());
                                            const totalMD = (r.pm_count || 0) + (r.design_count || 0) + (r.facility_count || 0) +
                                                            (r.control_count || 0) + (r.vision_count || 0) + (r.personnel_count || 0);
                                            return hasWork || hasNotes || totalMD > 0;
                                        });

                                        return (
                                            <button
                                                className="btn-analyze"
                                                onClick={() => {
                                                    if (isGrade1) return notifyPermission('공사일보 저장');
                                                    saveReport();
                                                }}
                                                disabled={!selectedProject || isExtracting || !hasValidReportsToSave}
                                                title={!selectedProject ? '프로젝트를 먼저 선택해주세요' : !hasValidReportsToSave ? '저장할 일보 내용이나 공수가 입력되어야 합니다' : ''}
                                            >
                                                {isExtracting ? 'AI 추출 중...' : 'Save All' + (isGrade1 ? ' 🔒' : '')}
                                            </button>
                                        );
                                    })()}
                                </>
                            ) : (
                                <div
                                    onClick={() => toggleSection('inputForm')}
                                    style={{
                                        padding: '10px',
                                        background: '#f8fafc',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                        color: '#64748b',
                                        fontSize: '12px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        cursor: 'pointer',
                                        marginBottom: '10px'
                                    }}
                                >
                                    📝 일보 직접입력 등록 폼 접힘 ({extractedReports.length}일치, 클릭하여 펼치기 ▾)
                                </div>
                            )}
                            
                            {msg && (
                                <div style={{marginTop: '1rem', padding: '0.8rem', borderRadius: '6px', backgroundColor: msg.includes('실패') ? 'var(--danger-bg)' : 'var(--accent-bg)', color: msg.includes('실패') ? 'var(--danger)' : 'var(--accent)', fontSize: '0.85rem', fontWeight: 500}}>
                                    {msg}
                                </div>
                            )}
                        </div>
                    </aside>
                    )}

                    {(activeIssueSection === 'all' || activeIssueSection === 'list') && (
                    <div className="content-area">
                        {!selectedProject ? (
                            <div className="empty-state">
                                <div style={{ maxWidth: '420px', margin: '0 auto', textAlign: 'center' }}>
                                    <span style={{ fontSize: '2.8rem', display: 'block', marginBottom: '10px' }}>📂</span>
                                    <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>프로젝트를 선택해주세요</h3>
                                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '16px' }}>조회할 프로젝트를 선택하면 등록된 일보 목록이 표시됩니다.</p>
                                    <select 
                                        className="project-select" 
                                        value={selectedProject} 
                                        onChange={(e) => setSelectedProject(e.target.value)} 
                                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
                                    >
                                        <option value="">프로젝트를 선택하세요</option>
                                        {projectOptions.map(p => (
                                            <option key={p.id} value={p.id}>{p.manufacturingNo ? `${p.manufacturingNo} · ` : ''}{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ) : projectReports.length === 0 ? (
                            <div className="empty-state">
                                <div style={{ maxWidth: '420px', margin: '0 auto', textAlign: 'center' }}>
                                    <span style={{ fontSize: '2.8rem', display: 'block', marginBottom: '10px' }}>📄</span>
                                    <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>등록된 일보가 없습니다</h3>
                                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '16px' }}>공사일보를 업로드하고 저장해보세요.</p>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                        <select 
                                            className="project-select" 
                                            value={selectedProject} 
                                            onChange={(e) => setSelectedProject(e.target.value)} 
                                            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
                                        >
                                            {projectOptions.map(p => (
                                                <option key={p.id} value={p.id}>{p.manufacturingNo ? `${p.manufacturingNo} · ` : ''}{p.name}</option>
                                            ))}
                                        </select>
                                        {activeIssueSection === 'list' && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveIssueSection('register')}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '0.85rem',
                                                    background: '#0969da',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ✏️ 일보 등록하기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="dashboard-section">
                                <div className="section-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
                                        <span style={{fontSize: '1.5rem'}}>📝</span>
                                        <h2 className="section-title">
                                            {projects.find(p => p.id === selectedProject)?.name || '등록된'} 일보 ({projectReports.length}건)
                                        </h2>
                                        <select 
                                            className="project-select" 
                                            value={selectedProject} 
                                            onChange={(e) => setSelectedProject(e.target.value)} 
                                            style={{ width: 'auto', minWidth: '220px', maxWidth: '320px', padding: '4px 8px', fontSize: '0.85rem' }}
                                        >
                                            {projectOptions.map(p => (
                                                <option key={p.id} value={p.id}>{p.manufacturingNo ? `${p.manufacturingNo} · ` : ''}{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{display: 'flex', gap: '6px'}}>
                                        <button
                                            type="button"
                                            onClick={() => toggleAllReports(true)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                background: '#f8fafc',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                color: '#334155'
                                            }}
                                        >
                                            ▾ 전체 일보 펼치기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleAllReports(false)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                background: '#f8fafc',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                color: '#334155'
                                            }}
                                        >
                                            ▴ 전체 일보 접기
                                        </button>
                                    </div>
                                </div>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                    {projectReports.map(report => {
                                        const totalMD = (report.pm_count || 0) + (report.design_count || 0) + (report.facility_count || 0) +
                                                        (report.control_count || 0) + (report.vision_count || 0) + (report.personnel_count || 0);

                                        return (
                                            <div key={report.id} className="issue-card" style={{borderLeftColor: '#6e7781'}}>
                                                <div className="issue-meta" onClick={() => toggleReport(report.id)} style={{cursor: 'pointer'}}>
                                                    <span style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                                                        <b style={{color: '#24292f'}}>{report.report_date}</b> 일보 
                                                        {totalMD > 0 && (
                                                            <span style={{fontSize: '0.75rem', color: '#0969da', fontWeight: 600, background: '#eff6ff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bfdbfe'}}>
                                                                👥 {totalMD}명
                                                            </span>
                                                        )}
                                                        <span style={{fontSize:'0.8rem', color:'#6e7781'}}>{expandedReports[report.id] ? '▲' : '▼'}</span>
                                                    </span>
                                                    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if (isGrade1) return notifyPermission('일보 수정');
                                                                handleEditReport(report); 
                                                            }} 
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: isGrade1 ? '#9ca3af' : '#0969da',
                                                                cursor: isGrade1 ? 'not-allowed' : 'pointer',
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600
                                                            }} 
                                                            title="이 일보를 직접입력 폼으로 불러와 수정합니다"
                                                        >
                                                            ✏️ 수정
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if (isGrade1) return notifyPermission('일보 삭제');
                                                                removeReport(report.id); 
                                                            }} 
                                                            style={{background:'transparent', border:'none', color:isGrade1 ? '#9ca3af' : 'var(--danger)', cursor:'pointer', fontSize:'0.8rem'}} 
                                                            title={isGrade1 ? "삭제 권한이 없습니다 (클릭 시 권한 안내)" : ""}
                                                        >
                                                            삭제 {isGrade1 && "🔒"}
                                                        </button>
                                                    </div>
                                                </div>
                                                {expandedReports[report.id] && (
                                                    <div className="issue-content" style={{background: '#f6f8fa', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem'}}>
                                                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.8rem'}}>
                                                            <div>
                                                                <div style={{fontWeight: 600, color: '#0969da', marginBottom: '0.3rem'}}>작업(업무) 내용</div>
                                                                <div style={{whiteSpace: 'pre-wrap'}}>
                                                                    {report.work_details || report.content || (
                                                                        <span style={{color: '#94a3b8', fontStyle: 'italic'}}>(작업 내용 미입력 · 공수 등록됨)</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {(report.special_notes || report.issues) && (
                                                                <div>
                                                                    <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>특이/이슈사항</div>
                                                                    <div style={{whiteSpace: 'pre-wrap'}}>{report.special_notes || report.issues}</div>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>
                                                                    투입 인원 실적 (총 {totalMD}명)
                                                                </div>
                                                                <div style={{display:'flex', gap:'8px', flexWrap:'wrap', fontSize:'0.75rem', background:'#fff', padding:'6px', borderRadius:'4px', border:'1px solid #e1e4e8'}}>
                                                                    {report.pm_count > 0 && <span>소장: {report.pm_count}</span>}
                                                                    {report.design_count > 0 && <span>설계: {report.design_count}</span>}
                                                                    {report.facility_count > 0 && <span>설비: {report.facility_count}</span>}
                                                                    {report.control_count > 0 && <span>제어: {report.control_count}</span>}
                                                                    {report.vision_count > 0 && <span>비전: {report.vision_count}</span>}
                                                                    {report.personnel_count > 0 && <span>기타: {report.personnel_count}</span>}
                                                                    {totalMD === 0 && <span style={{color: '#94a3b8'}}>투입 인원 없음</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    )}
                </div>
            ) : (
                <div style={{padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', overflowY: 'auto', background: 'var(--bg-color)'}}>
                    <div style={{background: '#fff', padding: '2.5rem', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', width: '100%', maxWidth: '700px', textAlign: 'center'}}>
                        <h2 style={{margin: '0 0 1rem 0', color: 'var(--text-color)'}}>📊 AI 전체 프로젝트 통합 분석</h2>
                        <p style={{color: 'var(--text-muted)', marginBottom: '2rem'}}>선택한 기간 동안 등록된 모든 프로젝트의 공사일보를 한 번에 수집하여,<br/>Gemini AI가 종합 1페이지 요약과 프로젝트별 이슈를 분석해 PPT로 만들어 줍니다.</p>
                        
                        <div style={{display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem', alignItems: 'center'}}>
                            <div style={{textAlign: 'left'}}>
                                <label style={{display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem'}}>시작일</label>
                                <input type="date" className="project-select" value={startDate} onChange={e => setStartDate(e.target.value)} style={{width: '200px'}} />
                            </div>
                            <span style={{color: 'var(--text-muted)', marginTop: '1.2rem'}}>~</span>
                            <div style={{textAlign: 'left'}}>
                                <label style={{display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem'}}>종료일</label>
                                <input type="date" className="project-select" value={endDate} onChange={e => setEndDate(e.target.value)} style={{width: '200px'}} />
                            </div>
                        </div>

                        <button 
                            style={{background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', border: 'none', padding: '1rem 2rem', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', width: '100%', boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)', transition: 'all 0.2s'}}
                            onClick={generatePPT}
                            disabled={isAnalyzing}
                        >
                            {isAnalyzing ? '분석 중...' : '전체 프로젝트 분석 및 PPT 다운로드 📥'}
                        </button>

                        {analyzeMsg && (
                            <div style={{marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', background: analyzeMsg.includes('오류') ? 'var(--danger-bg)' : '#f0f5ff', color: analyzeMsg.includes('오류') ? 'var(--danger)' : '#0969da', fontWeight: 500}}>
                                {analyzeMsg}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 다중 프로젝트 일보 분류 모달 (SPM) */}
            {splitProjectModal.isOpen && (
                <div className="spm-overlay" onClick={() => setSplitProjectModal(prev => ({ ...prev, isOpen: false }))}>
                    <div className="spm-modal" onClick={e => e.stopPropagation()}>
                        <div className="spm-header">
                            <div className="spm-header-title">
                                <span style={{ fontSize: '1.25rem' }}>📑</span>
                                <span>다중 프로젝트 일보 분류 선택</span>
                            </div>
                            <button
                                type="button"
                                className="spm-close-btn"
                                onClick={() => setSplitProjectModal(prev => ({ ...prev, isOpen: false }))}
                            >
                                ✕
                            </button>
                        </div>
                        
                        <div className="spm-body">
                            <div className="spm-info-box">
                                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                                    🏢 현재 선택된 앱 프로젝트: <span style={{ color: '#0284c7' }}>{splitProjectModal.currentProjectName}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    붙여넣은 일보에서 <b>{splitProjectModal.uniqueProjects.length}개</b>의 프로젝트 작업내용이 함께 감지되었습니다.<br/>
                                    현재 프로젝트의 공사일보로 등록할 작업내용을 선택해주세요.
                                </div>
                            </div>

                            <div className="spm-options-list">
                                {splitProjectModal.uniqueProjects.map((pName) => {
                                    const count = splitProjectModal.projectFreq[pName] || 0;
                                    const sample = splitProjectModal.projectSamples[pName] || '';
                                    const isSelected = splitProjectModal.selectedChoice === pName;
                                    const isCurProj = splitProjectModal.recommendedProject === pName;

                                    return (
                                        <label
                                            key={pName}
                                            className={`spm-option-card ${isSelected ? 'selected' : ''}`}
                                            onClick={() => setSplitProjectModal(prev => ({ ...prev, selectedChoice: pName }))}
                                        >
                                            {/* 1. 상단 가로 일자 정렬 행 (라디오는 왼쪽 세로중앙, 그 뒤로 문구 일자 나열) */}
                                            <div className="spm-option-row">
                                                <input
                                                    type="radio"
                                                    name="spm-project-choice"
                                                    className="spm-radio-input"
                                                    checked={isSelected}
                                                    onChange={() => setSplitProjectModal(prev => ({ ...prev, selectedChoice: pName }))}
                                                />
                                                <div className="spm-title-area">
                                                    <span className="spm-project-title">[{pName}]</span>
                                                    <span className="spm-badge-count">{count}일치 감지</span>
                                                    {isCurProj && <span className="spm-badge-recommend">⭐ 현재 프로젝트 추천</span>}
                                                </div>
                                            </div>

                                            {/* 2. 하단 3줄 미리보기 네모 박스 */}
                                            {sample && (
                                                <div className="spm-preview-box">
                                                    {sample.split('\n').slice(0, 3).join('\n')}
                                                    {sample.split('\n').length > 3 ? '\n...' : ''}
                                                </div>
                                            )}
                                        </label>
                                    );
                                })}

                                {/* 원본 전체 등록 옵션 */}
                                <label
                                    className={`spm-option-card ${splitProjectModal.selectedChoice === '__ALL__' ? 'selected' : ''}`}
                                    onClick={() => setSplitProjectModal(prev => ({ ...prev, selectedChoice: '__ALL__' }))}
                                >
                                    <div className="spm-option-row">
                                        <input
                                            type="radio"
                                            name="spm-project-choice"
                                            className="spm-radio-input"
                                            checked={splitProjectModal.selectedChoice === '__ALL__'}
                                            onChange={() => setSplitProjectModal(prev => ({ ...prev, selectedChoice: '__ALL__' }))}
                                        />
                                        <div className="spm-title-area">
                                            <span className="spm-project-title">
                                                🌐 일보상 내용 전체 등록 (분리하지 않고 원본 전체 저장)
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginLeft: '30px' }}>
                                        감지된 모든 프로젝트 작업내용을 구분 없이 통째로 일보 폼에 반영합니다.
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="spm-footer">
                            <button
                                type="button"
                                className="spm-btn-cancel"
                                onClick={() => setSplitProjectModal(prev => ({ ...prev, isOpen: false }))}
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                className="spm-btn-apply"
                                onClick={() => {
                                    applyFilteredWorkMap(splitProjectModal.selectedChoice, splitProjectModal.workMap);
                                    if (splitProjectModal.manpowerMap) {
                                        mergeManpowerIntoExtracted(splitProjectModal.manpowerMap);
                                    }
                                    setSplitProjectModal(prev => ({ ...prev, isOpen: false }));
                                }}
                            >
                                ✓ 선택한 프로젝트 내용으로 폼에 반영
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
