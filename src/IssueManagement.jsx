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
    const [reportForm, setReportForm] = useState({
        work_details: '',
        special_notes: '',
        issues: '',
        personnel_count: 0
    });
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
            setMsg('?�보 목록??불러?�는???�패?�습?�다.');
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
        setMsg('?��? ?�일???�는 �?..');
        setIsExtracting(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: false });
            let allText = '';
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const text = XLSX.utils.sheet_to_csv(sheet);
                allText += `\n[Sheet: ${sheetName}]\n` + text;
            });
            
            setMsg('AI가 주요 ??��??추출?�고 ?�습?�다... (??5~10�?');
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) throw new Error('Gemini API ?��? ?�정?��? ?�았?�니??');
            
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
            const prompt = `
?�음?� ?�장 공사?�보(?��?)???�본 ?�스?�입?�다. ???�용?�서 4가지 주요 ?�보�?추출?�여 ?�수 JSON ?�맷?�로 반환?�주?�요. (마크?�운 ?�맷?�나 백틱???��?�??�함?��? 마세??)

?�식:
{
  "work_details": "금일 진행??주요 ?�업(?�무) ?�용 ?�약 (?�중 ?�인?� \\n ?�용)",
  "special_notes": "?�이?�항, 공�??�항, 기�? 참고?�항 ?�약 (?�으�?�?문자??",
  "issues": "?�슈?�항, 문제?? ?�재 결품, 지???�유 ?�약 (?�으�?�?문자??",
  "personnel_count": ?�입 ?�원 ?�적 총합 (?�자�? ?�악?????�면 0)
}

?�본 ?�스??
${allText.substring(0, 30000)}
`;
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);
            
            setReportForm({
                work_details: parsed.work_details || '',
                special_notes: parsed.special_notes || '',
                issues: parsed.issues || '',
                personnel_count: Number(parsed.personnel_count) || 0
            });
            setMsg('AI가 ?�보 ?�용???�공?�으�?구조?�했?�니?? ?�??버튼???�러주세??');
        } catch (error) {
            console.error(error);
            setMsg('?�일 분석 ?�패: ' + error.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const saveReport = async () => {
        if (!selectedProject) return setMsg('?�로?�트�?먼�? ?�택?�주?�요.');
        if (!reportDate) return setMsg('?�짜�??�택?�주?�요.');
        if (!reportForm.work_details.trim()) return setMsg('?�업(?�무) ?�용???�력?�주?�요.');

        setMsg('?�??�?..');
        const { error } = await supabase.from('daily_reports').insert([{
            project_id: selectedProject,
            report_date: reportDate,
            work_details: reportForm.work_details.trim(),
            special_notes: reportForm.special_notes.trim(),
            issues: reportForm.issues.trim(),
            personnel_count: reportForm.personnel_count,
            content: '' // fallback or obsolete
        }]);

        if (error) {
            setMsg('?�???�패: ' + error.message);
        } else {
            setMsg('공사?�보가 ?�공?�으�??�?�되?�습?�다.');
            setReportForm({ work_details: '', special_notes: '', personnel_count: 0 });
            loadReports(selectedProject);
        }
    };

    const removeReport = async (id) => {
        if (confirm('???�보�???��?�시겠습?�까?')) {
            await supabase.from('daily_reports').delete().eq('id', id);
            loadReports(selectedProject);
        }
    };

    const generatePPT = async () => {
        if (startDate > endDate) return setAnalyzeMsg('?�작?�이 종료?�보???????�습?�다.');
        
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return setAnalyzeMsg('Gemini API ?��? ?�정?��? ?�았?�니??');

        setIsAnalyzing(true);
        setAnalyzeMsg('?�이?��? ?�집?�는 �?..');

        try {
            // 1. Fetch all reports in date range
            const { data: reports, error } = await supabase
                .from('daily_reports')
                .select('*')
                .gte('report_date', startDate)
                .lte('report_date', endDate);

            if (error) throw error;
            if (!reports || reports.length === 0) {
                throw new Error('?�당 기간???�록??공사?�보가 ?�습?�다.');
            }

            setAnalyzeMsg('AI가 ?�체 ?�로?�트�?종합 분석 중입?�다... (??10~30�?');

            // Group reports by project
            const grouped = {};
            reports.forEach(r => {
                const p = projects.find(x => x.id === r.project_id);
                if (!p) return;
                const pName = `${p.manufacturingNo} ${p.name}`;
                if (!grouped[pName]) grouped[pName] = [];
                // Use structured data for PPT gen
                const details = `?�업?�용: ${r.work_details || ''}\n?�이?�항: ${r.special_notes || ''}\n?�슈: ${r.issues || ''}\n?�입?�원: ${r.personnel_count || 0}�?;
                const content = r.content || details; // Fallback for old records
                grouped[pName].push(`- ${r.report_date}:\n${content}`);
            });

            let compiledText = '';
            for (const [pName, lines] of Object.entries(grouped)) {
                compiledText += `\n\n[?�로?�트: ${pName}]\n` + lines.join('\n\n');
            }

            // 2. Call Gemini
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

            const prompt = `
?�음?� ${startDate}부??${endDate}까�? ?�집??�??�로?�트?�의 공사?�보 ?�용?�니??
???�용?�을 분석?�여 1?�이지 분량??[?�체 종합 ?�약]�? [�??�로?�트�?주요 ?�슈/?�이?�항]???�리?�주?�요.
결과??반드???�래 JSON ?�식?�로�??�답?�세??(마크?�운 백틱 ?�이 ?�수 JSON�?반환).

{
  "summary": "?�체 ?�로?�트?�의 진행 ?�황, 공통 ?�슈, 주의???�을 ?�함???�세??종합 ?�약 ?�스??(줄바꿈�? \\n ?�용)",
  "projects": [
    {
      "project_name": "?�로?�트 ?�름",
      "issues": [
        "분석??주요 ?�슈???�이?�항 1",
        "분석??주요 ?�슈???�이?�항 2"
      ]
    }
  ]
}

공사?�보 ?�역:
${compiledText.substring(0, 30000)}
`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);

            if (!parsed.summary || !parsed.projects) {
                throw new Error('AI ?�답???�바�??�식???�닙?�다.');
            }

            setAnalyzeMsg('PPT 보고?��? ?�성 중입?�다...');

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
                    { text: { text: 'TW ?�로?�트 관�?- AI ?�합 분석 보고??, options: { x: 0.2, y: 0.1, w: 5, h: 0.4, color: 'FFFFFF', fontSize: 12, bold: true } } },
                    { text: { text: `${startDate} ~ ${endDate}`, options: { x: '70%', y: 0.1, w: '28%', h: 0.4, color: 'FFFFFF', fontSize: 10, align: 'right' } } }
                ]
            });

            // Slide 1: Summary
            let slide1 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
            slide1.addText('?�체 ?�로?�트 종합 ?�약', { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 24, bold: true, color: '0F172A' });
            
            // Draw a neat box for summary
            slide1.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.5, w: '90%', h: 3.5, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
            slide1.addText(parsed.summary, {
                x: 0.7, y: 1.7, w: '86%', h: 3.1,
                fontSize: 12, color: '334155', valign: 'top', breakLine: true
            });

            // Slide 2..N: Projects
            parsed.projects.forEach(p => {
                let pSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
                pSlide.addText(`?�로?�트�??�슈: ${p.project_name}`, { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 22, bold: true, color: '0F172A' });
                
                pSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.5, w: '90%', h: 3.5, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
                
                const bulletList = p.issues.map(iss => ({ text: iss, options: { bullet: true } }));
                pSlide.addText(bulletList, {
                    x: 0.7, y: 1.7, w: '86%', h: 3.1,
                    fontSize: 14, color: '334155', valign: 'top', lineSpacing: 24
                });
            });

            await pptx.writeFile({ fileName: `?�로?�트_?�합분석보고??${endDate}.pptx` });

            setAnalyzeMsg('?�� 분석 �?PPT ?�성???�료?�었?�니??');

        } catch (error) {
            console.error(error);
            if (error.message.includes('429') || error.message.includes('quota') || error.message.toLowerCase().includes('too many requests') || error.message.includes('exceeded')) {
                setAnalyzeMsg('?�� 무료 AI ?�용?�이 ?�시?�으�?초과?�었?�니?? 1�??�에 ?�시 ?�도?�주?�요. (과금?��? ?�습?�다)');
            } else {
                setAnalyzeMsg('?�류 발생: ' + error.message);
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
                        <h1><span style={{color: 'var(--primary)'}}>AI</span> ?�로?�트 ?�슈 �??�보 관�?/h1>
                        <p>공사?�보 ?�스??축적 �?AI 기반 ?�동 PPT 보고???�성</p>
                    </div>
                </div>
                <div style={{display: 'flex', gap: '0.5rem', background: '#e1e4e8', padding: '0.3rem', borderRadius: '8px'}}>
                    <button 
                        style={{padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: activeTab==='register'?'#fff':'transparent', color: activeTab==='register'?'#0969da':'#57606a', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab==='register'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}
                        onClick={() => setActiveTab('register')}
                    >
                        ?�보 ?�록
                    </button>
                    <button 
                        style={{padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: activeTab==='analyze'?'#fff':'transparent', color: activeTab==='analyze'?'#0969da':'#57606a', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab==='analyze'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}
                        onClick={() => setActiveTab('analyze')}
                    >
                        AI ?�합 분석 & PPT
                    </button>
                </div>
            </header>

            <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, .csv" style={{display: 'none'}} />

            {activeTab === 'register' ? (
                <div className="main-container">
                    <aside className="sidebar">
                        <div>
                            <div className="panel-title">?�로?�트 �??�짜 *</div>
                            <select className="project-select" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} style={{marginBottom: '0.5rem'}}>
                                <option value="">?�로?�트�??�택?�세??/option>
                                {projectOptions.map(p => (
                                    <option key={p.id} value={p.id}>{p.manufacturingNo} · {p.name}</option>
                                ))}
                            </select>
                            <input type="date" className="project-select" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                        </div>

                        <div style={{marginTop: '1rem'}}>
                            <div className="panel-title">공사?�보 ?�본 ?�로??/div>
                            <div className={`dropzone ${isDragging ? 'dragover' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current.click()}>
                                <div className="dropzone-icon">?��</div>
                                <div style={{fontSize: '0.85rem', fontWeight: 500}}>?��? ?�일 ?�로??(.xlsx)</div>
                                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>?�릭?�거???�래�?/div>
                            </div>
                        </div>

                        <div>
                            <div className="panel-title" style={{fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between'}}>
                                <span>공사?�보 ?�이??/span>
                                {(reportForm.work_details || reportForm.special_notes || reportForm.issues) && <span style={{color: 'var(--primary)', cursor: 'pointer'}} onClick={()=>setReportForm({work_details: '', special_notes: '', issues: '', personnel_count: 0})}>초기??/span>}
                            </div>
                            
                            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem'}}>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?�업(?�무) ?�용 *</label>
                                    <textarea className="paste-textarea" style={{minHeight: '100px'}} placeholder="AI가 ?�동?�로 추출???�업 ?�용???�시?�니??" value={reportForm.work_details} onChange={(e) => setReportForm({...reportForm, work_details: e.target.value})}></textarea>
                                </div>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?�이?�항</label>
                                    <textarea className="paste-textarea" style={{minHeight: '60px'}} placeholder="?�이?�항" value={reportForm.special_notes} onChange={(e) => setReportForm({...reportForm, special_notes: e.target.value})}></textarea>
                                </div>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?�슈?�항</label>
                                    <textarea className="paste-textarea" style={{minHeight: '60px'}} placeholder="?�슈 �?지???�유" value={reportForm.issues} onChange={(e) => setReportForm({...reportForm, issues: e.target.value})}></textarea>
                                </div>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?�입 ?�원 ?�적</label>
                                    <input type="number" className="project-select" placeholder="0" value={reportForm.personnel_count} onChange={(e) => setReportForm({...reportForm, personnel_count: Number(e.target.value)})} />
                                </div>
                            </div>

                            <button className="btn-analyze" onClick={saveReport} disabled={!reportForm.work_details.trim() || !selectedProject || !reportDate || isExtracting}>
                                {isExtracting ? 'AI 추출 �?..' : 'Save'}
                            </button>
                            
                            {msg && (
                                <div style={{marginTop: '1rem', padding: '0.8rem', borderRadius: '6px', backgroundColor: msg.includes('?�패') ? 'var(--danger-bg)' : 'var(--accent-bg)', color: msg.includes('?�패') ? 'var(--danger)' : 'var(--accent)', fontSize: '0.85rem', fontWeight: 500}}>
                                    {msg}
                                </div>
                            )}
                        </div>
                    </aside>

                    <div className="content-area">
                        {!selectedProject ? (
                            <div className="empty-state">
                                <h3>?�로?�트�??�택?�주?�요</h3>
                                <p>좌측?�서 ?�로?�트�??�택?�면 ?�록???�보 목록???�시?�니??</p>
                            </div>
                        ) : projectReports.length === 0 ? (
                            <div className="empty-state">
                                <h3>?�록???�보가 ?�습?�다</h3>
                                <p>좌측?�서 공사?�보�??�로?�하�??�?�해보세??</p>
                            </div>
                        ) : (
                            <div className="dashboard-section">
                                <div className="section-header">
                                    <span style={{fontSize: '1.5rem'}}>?��</span>
                                    <h2 className="section-title">?�록???�보 목록</h2>
                                </div>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                    {projectReports.map(report => (
                                        <div key={report.id} className="issue-card" style={{borderLeftColor: '#6e7781'}}>
                                            <div className="issue-meta">
                                                <span><b style={{color: '#24292f'}}>{report.report_date}</b> ?�보</span>
                                                <button onClick={() => removeReport(report.id)} style={{background:'transparent', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.8rem'}}>??��</button>
                                            </div>
                                            <div className="issue-content" style={{background: '#f6f8fa', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem'}}>
                                                {report.work_details ? (
                                                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.8rem'}}>
                                                        <div>
                                                            <div style={{fontWeight: 600, color: '#0969da', marginBottom: '0.3rem'}}>?�업(?�무) ?�용</div>
                                                            <div style={{whiteSpace: 'pre-wrap'}}>{report.work_details}</div>
                                                        </div>
                                                        {report.special_notes && (
                                                            <div>
                                                                <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>?�이?�항</div>
                                                                <div style={{whiteSpace: 'pre-wrap'}}>{report.special_notes}</div>
                                                            </div>
                                                        )}
                                                        {report.issues && (
                                                            <div>
                                                                <div style={{fontWeight: 600, color: 'var(--danger)', marginBottom: '0.3rem'}}>?�슈?�항</div>
                                                                <div style={{whiteSpace: 'pre-wrap'}}>{report.issues}</div>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>?�입 ?�원 ?�적: <span style={{fontWeight: 'normal'}}>{report.personnel_count}�?/span></div>
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
                        <h2 style={{margin: '0 0 1rem 0', color: 'var(--text-color)'}}>?�� AI ?�체 ?�로?�트 ?�합 분석</h2>
                        <p style={{color: 'var(--text-muted)', marginBottom: '2rem'}}>?�택??기간 ?�안 ?�록??모든 ?�로?�트??공사?�보�???번에 ?�집?�여,<br/>Gemini AI가 종합 1?�이지 ?�약�??�로?�트�??�슈�?분석??PPT�?만들??줍니??</p>
                        
                        <div style={{display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem', alignItems: 'center'}}>
                            <div style={{textAlign: 'left'}}>
                                <label style={{display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem'}}>?�작??/label>
                                <input type="date" className="project-select" value={startDate} onChange={e => setStartDate(e.target.value)} style={{width: '200px'}} />
                            </div>
                            <span style={{color: 'var(--text-muted)', marginTop: '1.2rem'}}>~</span>
                            <div style={{textAlign: 'left'}}>
                                <label style={{display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem'}}>종료??/label>
                                <input type="date" className="project-select" value={endDate} onChange={e => setEndDate(e.target.value)} style={{width: '200px'}} />
                            </div>
                        </div>

                        <button 
                            style={{background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', border: 'none', padding: '1rem 2rem', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', width: '100%', boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)', transition: 'all 0.2s'}}
                            onClick={generatePPT}
                            disabled={isAnalyzing}
                        >
                            {isAnalyzing ? '분석 �?..' : '?�체 ?�로?�트 분석 �?PPT ?�운로드 ?��'}
                        </button>

                        {analyzeMsg && (
                            <div style={{marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', background: analyzeMsg.includes('?�류') ? 'var(--danger-bg)' : '#f0f5ff', color: analyzeMsg.includes('?�류') ? 'var(--danger)' : '#0969da', fontWeight: 500}}>
                                {analyzeMsg}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

