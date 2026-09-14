import React, { useState, useRef, useEffect, useMemo } from 'react';
import './IssueManagement.css';
import { supabase } from './supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';

export default function IssueManagement({ projects }) {
    const [activeTab, setActiveTab] = useState('register'); // 'register' or 'analyze'
    
    // Register Tab States
    const [selectedProject, setSelectedProject] = useState('');
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
        if (activeTab === 'register' && selectedProject) {
            loadReports(selectedProject);
        }
    }, [selectedProject, activeTab]);

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
        const file = e.dataTransfer.files[0];
        if (file) await handleFileUpload(file);
    };

    const handleFileUpload = async (file) => {
        if (!file) return;
        setMsg('엑셀 파일을 읽는 중...');
        setIsExtracting(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: false });
            let allText = '';
            workbook.SheetNames.forEach(sheetName => {
                if (sheetName.includes('설치현황') || sheetName.includes('현황')) return;
                const sheet = workbook.Sheets[sheetName];
                const text = XLSX.utils.sheet_to_csv(sheet);
                allText += `\n[Sheet: ${sheetName}]\n` + text;
            });
            
            setMsg('AI가 주요 항목을 추출하고 있습니다... (약 5~10초)');
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');
            
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
            const prompt = `
다음은 현장 공사일보(엑셀)의 원본 텍스트입니다. 이 내용에서 일자별로 데이터를 분류하여 3가지 주요 정보(작업내용, 특이사항, 투입인원)를 추출해주세요.
특히 투입인원은 부서별(PM, 설계, 설비기술, 제어, 비전)로 세분화하여 파악해주세요. 파악할 수 없는 인원은 기타(personnel_count)로 합산하세요.
결과는 반드시 아래 JSON 배열 포맷으로만 반환해주세요. (마크다운 포맷이나 백틱을 절대로 포함하지 마세요.)

형식:
[
  {
    "date": "YYYY-MM-DD",
    "work_details": "해당 일자의 진행 작업(업무) 내용 요약 (다중 라인은 \\n 사용)",
    "special_notes": "특이사항, 이슈사항, 문제점, 지연 사유 등 요약 (없으면 빈 문자열)",
    "personnel_count": 부서 파악이 안되는 기타 인원수 합계 (숫자),
    "pm_count": PM 투입 인원 (숫자),
    "design_count": 설계 투입 인원 (숫자),
    "facility_count": 설비기술 투입 인원 (숫자),
    "control_count": 제어 투입 인원 (숫자),
    "vision_count": 비전 투입 인원 (숫자)
  }
]

원본 텍스트:
${allText.substring(0, 30000)}
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
            setMsg(\`AI가 \${parsed.length}일치의 일보 내용을 성공적으로 구조화했습니다. 저장 버튼을 눌러주세요.\`);
        } catch (error) {
            console.error(error);
            setMsg('파일 분석 실패: ' + error.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const saveReport = async () => {
        if (!selectedProject) return setMsg('프로젝트를 먼저 선택해주세요.');
        const validReports = extractedReports.filter(r => r.date && r.work_details.trim());
        if (validReports.length === 0) return setMsg('저장할 작업(업무) 내용과 날짜가 없습니다.');

        setMsg('중복 데이터 확인 및 저장 중...');
        const dates = validReports.map(r => r.date);
        
        // 1. Delete overlapping dates for this project (Overwrite mechanism)
        await supabase.from('daily_reports')
            .delete()
            .eq('project_id', selectedProject)
            .in('report_date', dates);

        // 2. Insert new ones
        const insertData = validReports.map(r => ({
            project_id: selectedProject,
            report_date: r.date,
            work_details: r.work_details.trim(),
            special_notes: r.special_notes.trim(),
            issues: '', 
            personnel_count: r.personnel_count || 0,
            pm_count: r.pm_count || 0,
            design_count: r.design_count || 0,
            facility_count: r.facility_count || 0,
            control_count: r.control_count || 0,
            vision_count: r.vision_count || 0,
            content: '' 
        }));

        const { error } = await supabase.from('daily_reports').insert(insertData);

        if (error) {
            setMsg('저장 실패: ' + error.message);
        } else {
            setMsg(\`\${validReports.length}일치의 공사일보가 성공적으로 저장(업데이트)되었습니다.\`);
            setExtractedReports([{
                date: new Date().toISOString().slice(0, 10),
                work_details: '', special_notes: '', personnel_count: 0,
                pm_count: 0, design_count: 0, facility_count: 0, control_count: 0, vision_count: 0
            }]);
            loadReports(selectedProject);
        }
    };

    const removeReport = async (id) => {
        if (confirm('이 일보를 삭제하시겠습니까?')) {
            await supabase.from('daily_reports').delete().eq('id', id);
            loadReports(selectedProject);
        }
    };

    const generatePPT = async () => {
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
                .lte('report_date', endDate);

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
                const pName = `${p.manufacturingNo} ${p.name}`;
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
            const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

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
                    { text: { text: 'TW 프로젝트 관리 - AI 통합 분석 보고서', options: { x: 0.2, y: 0.1, w: 5, h: 0.4, color: 'FFFFFF', fontSize: 12, bold: true } } },
                    { text: { text: `${startDate} ~ ${endDate}`, options: { x: '70%', y: 0.1, w: '28%', h: 0.4, color: 'FFFFFF', fontSize: 10, align: 'right' } } }
                ]
            });

            // Slide 1: Summary
            let slide1 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
            slide1.addText('전체 프로젝트 종합 요약', { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 24, bold: true, color: '0F172A' });
            
            // Draw a neat box for summary
            slide1.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.5, w: '90%', h: 3.5, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
            slide1.addText(parsed.summary, {
                x: 0.7, y: 1.7, w: '86%', h: 3.1,
                fontSize: 12, color: '334155', valign: 'top', breakLine: true
            });

            // Slide 2..N: Projects
            parsed.projects.forEach(p => {
                let pSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
                pSlide.addText(`프로젝트별 이슈: ${p.project_name}`, { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 22, bold: true, color: '0F172A' });
                
                pSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.5, w: '90%', h: 3.5, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
                
                const bulletList = p.issues.map(iss => ({ text: iss, options: { bullet: true } }));
                pSlide.addText(bulletList, {
                    x: 0.7, y: 1.7, w: '86%', h: 3.1,
                    fontSize: 14, color: '334155', valign: 'top', lineSpacing: 24
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
            <header className="issue-management-header">
                <div className="logo-area">
                    <div className="logo-icon">AI</div>
                    <div className="logo-text">
                        <h1><span style={{color: 'var(--primary)'}}>AI</span> 프로젝트 이슈 및 일보 관리</h1>
                        <p>공사일보 텍스트 축적 및 AI 기반 자동 PPT 보고서 생성</p>
                    </div>
                </div>
                <div style={{display: 'flex', gap: '0.5rem', background: '#e1e4e8', padding: '0.3rem', borderRadius: '8px'}}>
                    <button 
                        style={{padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: activeTab==='register'?'#fff':'transparent', color: activeTab==='register'?'#0969da':'#57606a', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab==='register'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}
                        onClick={() => setActiveTab('register')}
                    >
                        일보 등록
                    </button>
                    <button 
                        style={{padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: activeTab==='analyze'?'#fff':'transparent', color: activeTab==='analyze'?'#0969da':'#57606a', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab==='analyze'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}
                        onClick={() => setActiveTab('analyze')}
                    >
                        AI 통합 분석 & PPT
                    </button>
                </div>
            </header>

            <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, .csv" style={{display: 'none'}} />

            {activeTab === 'register' ? (
                <div className="main-container">
                    <aside className="sidebar">
                        <div>
                            <div className="panel-title">프로젝트 및 날짜 *</div>
                            <select className="project-select" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} style={{marginBottom: '0.5rem'}}>
                                <option value="">프로젝트를 선택하세요</option>
                                {projectOptions.map(p => (
                                    <option key={p.id} value={p.id}>{p.manufacturingNo} · {p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{marginTop: '1rem', marginBottom: '1rem'}}>
                            <div className="panel-title">공사일보 원본 업로드</div>
                            <div className={`dropzone ${isDragging ? 'dragover' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current.click()}>
                                <div className="dropzone-icon">📁</div>
                                <div style={{fontSize: '0.85rem', fontWeight: 500}}>엑셀 파일 업로드 (.xlsx)</div>
                                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>클릭하거나 드래그</div>
                            </div>
                        </div>

                        <div>
                            <div className="panel-title" style={{fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems:'center'}}>
                                <span>공사일보 데이터 ({extractedReports.length}일치)</span>
                                <div style={{display:'flex', gap:'8px'}}>
                                    <span style={{color: 'var(--primary)', cursor: 'pointer'}} onClick={() => setExtractedReports([...extractedReports, {date: new Date().toISOString().slice(0,10), work_details:'', special_notes:'', personnel_count:0, pm_count:0, design_count:0, facility_count:0, control_count:0, vision_count:0}])}>+ 일자 추가</span>
                                    <span style={{color: 'var(--danger)', cursor: 'pointer'}} onClick={()=>setExtractedReports([{date: new Date().toISOString().slice(0, 10), work_details: '', special_notes: '', personnel_count: 0, pm_count:0, design_count:0, facility_count:0, control_count:0, vision_count:0}])}>초기화</span>
                                </div>
                            </div>
                            
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
                                            <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom:'4px', display:'block'}}>투입 인원 실적</label>
                                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px'}}>
                                                <div style={{fontSize:'0.7rem'}}>PM <input type="number" value={report.pm_count} onChange={e=>{const newR=[...extractedReports]; newR[idx].pm_count=Number(e.target.value); setExtractedReports(newR);}} style={{width:'40px', padding:'2px'}}/></div>
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

                            <button className="btn-analyze" onClick={saveReport} disabled={!selectedProject || isExtracting || extractedReports.every(r=>!r.work_details.trim())}>
                                {isExtracting ? 'AI 추출 중...' : 'Save All'}
                            </button>
                            
                            {msg && (
                                <div style={{marginTop: '1rem', padding: '0.8rem', borderRadius: '6px', backgroundColor: msg.includes('실패') ? 'var(--danger-bg)' : 'var(--accent-bg)', color: msg.includes('실패') ? 'var(--danger)' : 'var(--accent)', fontSize: '0.85rem', fontWeight: 500}}>
                                    {msg}
                                </div>
                            )}
                        </div>
                    </aside>

                    <div className="content-area">
                        {!selectedProject ? (
                            <div className="empty-state">
                                <h3>프로젝트를 선택해주세요</h3>
                                <p>좌측에서 프로젝트를 선택하면 등록된 일보 목록이 표시됩니다.</p>
                            </div>
                        ) : projectReports.length === 0 ? (
                            <div className="empty-state">
                                <h3>등록된 일보가 없습니다</h3>
                                <p>좌측에서 공사일보를 업로드하고 저장해보세요.</p>
                            </div>
                        ) : (
                            <div className="dashboard-section">
                                <div className="section-header">
                                    <span style={{fontSize: '1.5rem'}}>📝</span>
                                    <h2 className="section-title">등록된 일보 목록</h2>
                                </div>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                    {projectReports.map(report => (
                                        <div key={report.id} className="issue-card" style={{borderLeftColor: '#6e7781'}}>
                                            <div className="issue-meta">
                                                <span><b style={{color: '#24292f'}}>{report.report_date}</b> 일보</span>
                                                <button onClick={() => removeReport(report.id)} style={{background:'transparent', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.8rem'}}>삭제</button>
                                            </div>
                                            <div className="issue-content" style={{background: '#f6f8fa', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem'}}>
                                                {report.work_details ? (
                                                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.8rem'}}>
                                                        <div>
                                                            <div style={{fontWeight: 600, color: '#0969da', marginBottom: '0.3rem'}}>작업(업무) 내용</div>
                                                            <div style={{whiteSpace: 'pre-wrap'}}>{report.work_details}</div>
                                                        </div>
                                                        {report.special_notes && (
                                                            <div>
                                                                <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>특이/이슈사항</div>
                                                                <div style={{whiteSpace: 'pre-wrap'}}>{report.special_notes}</div>
                                                            </div>
                                                        )}
                                                        {report.issues && (
                                                            <div>
                                                                <div style={{fontWeight: 600, color: 'var(--danger)', marginBottom: '0.3rem'}}>이슈사항 (과거 데이터)</div>
                                                                <div style={{whiteSpace: 'pre-wrap'}}>{report.issues}</div>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>투입 인원 실적 (총 {(report.pm_count||0)+(report.design_count||0)+(report.facility_count||0)+(report.control_count||0)+(report.vision_count||0)+(report.personnel_count||0)}명)</div>
                                                            <div style={{display:'flex', gap:'8px', flexWrap:'wrap', fontSize:'0.75rem', background:'#fff', padding:'6px', borderRadius:'4px', border:'1px solid #e1e4e8'}}>
                                                                {report.pm_count > 0 && <span>PM: {report.pm_count}</span>}
                                                                {report.design_count > 0 && <span>설계: {report.design_count}</span>}
                                                                {report.facility_count > 0 && <span>설비: {report.facility_count}</span>}
                                                                {report.control_count > 0 && <span>제어: {report.control_count}</span>}
                                                                {report.vision_count > 0 && <span>비전: {report.vision_count}</span>}
                                                                {report.personnel_count > 0 && <span>기타: {report.personnel_count}</span>}
                                                                {(!report.pm_count && !report.design_count && !report.facility_count && !report.control_count && !report.vision_count && !report.personnel_count) && <span>없음</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto'}}>
                                                        {report.content}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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
        </div>
    );
}
