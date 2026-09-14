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
    const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
    const [pastedText, setPastedText] = useState('');
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
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            let allText = '';
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const text = XLSX.utils.sheet_to_csv(sheet);
                allText += `\n[Sheet: ${sheetName}]\n` + text;
            });
            setPastedText(allText.trim());
            setMsg('엑셀 내용을 불러왔습니다. 저장 버튼을 눌러주세요.');
        } catch (error) {
            setMsg('엑셀 파일 읽기 실패: ' + error.message);
        }
    };

    const saveReport = async () => {
        if (!selectedProject) return setMsg('프로젝트를 먼저 선택해주세요.');
        if (!reportDate) return setMsg('날짜를 선택해주세요.');
        if (!pastedText.trim()) return setMsg('공사일보 내용이 없습니다.');

        setMsg('저장 중...');
        const { error } = await supabase.from('daily_reports').insert([{
            project_id: selectedProject,
            report_date: reportDate,
            content: pastedText.trim()
        }]);

        if (error) {
            setMsg('저장 실패: ' + error.message);
        } else {
            setMsg('공사일보가 성공적으로 저장되었습니다.');
            setPastedText('');
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
                grouped[pName].push(`- ${r.report_date}: ${r.content}`);
            });

            let compiledText = '';
            for (const [pName, lines] of Object.entries(grouped)) {
                compiledText += `\n\n[프로젝트: ${pName}]\n` + lines.join('\n');
            }

            // 2. Call Gemini
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
                            <input type="date" className="project-select" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                        </div>

                        <div style={{marginTop: '1rem'}}>
                            <div className="panel-title">공사일보 원본 업로드</div>
                            <div className={`dropzone ${isDragging ? 'dragover' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current.click()}>
                                <div className="dropzone-icon">📁</div>
                                <div style={{fontSize: '0.85rem', fontWeight: 500}}>엑셀 파일 업로드 (.xlsx)</div>
                                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>클릭하거나 드래그</div>
                            </div>
                        </div>

                        <div>
                            <div className="panel-title" style={{fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between'}}>
                                <span>텍스트 붙여넣기</span>
                                {pastedText && <span style={{color: 'var(--primary)', cursor: 'pointer'}} onClick={()=>setPastedText('')}>초기화</span>}
                            </div>
                            <textarea className="paste-textarea" placeholder="공사일보 내용을 붙여넣으세요..." value={pastedText} onChange={(e) => setPastedText(e.target.value)}></textarea>

                            <button className="btn-analyze" onClick={saveReport} disabled={!pastedText.trim() || !selectedProject || !reportDate}>
                                Save
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
                                            <div className="issue-content" style={{maxHeight: '150px', overflowY: 'auto', background: '#f6f8fa', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem'}}>
                                                {report.content}
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
