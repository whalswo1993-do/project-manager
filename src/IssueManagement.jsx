import React, { useState, useRef, useEffect, useMemo } from 'react';
import './IssueManagement.css';
import { supabase } from './supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';

export default function IssueManagement({ projects }) {
    const [selectedProject, setSelectedProject] = useState('');
    const [issues, setIssues] = useState([]);
    const [pastedText, setPastedText] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [msg, setMsg] = useState('');
    
    const fileInputRef = useRef(null);

    // Filter out active/completed projects for the dropdown
    const projectOptions = useMemo(() => {
        return (projects || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    }, [projects]);

    useEffect(() => {
        if (selectedProject) {
            loadIssues(selectedProject);
        } else {
            setIssues([]);
        }
    }, [selectedProject]);

    async function loadIssues(projectId) {
        setMsg('');
        const { data, error } = await supabase
            .from('project_issues')
            .select('*')
            .eq('project_id', projectId)
            .order('date', { ascending: false });
        
        if (error) {
            console.error(error);
            setMsg('이슈 목록을 불러오는데 실패했습니다.');
            return;
        }
        setIssues(data || []);
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
        if (file) {
            await handleFileUpload(file);
        }
    };

    const handleFileUpload = async (file) => {
        if (!file) return;
        if (!selectedProject) {
            setMsg('먼저 프로젝트를 선택해주세요.');
            return;
        }
        setMsg('엑셀 파일을 읽는 중...');
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            
            let allText = '';
            // Read all sheets
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const text = XLSX.utils.sheet_to_csv(sheet);
                allText += `\n--- Sheet: ${sheetName} ---\n` + text;
            });
            
            if (!allText.trim()) {
                setMsg('파일에서 텍스트를 추출할 수 없습니다.');
                return;
            }
            
            setPastedText(allText);
            setMsg('엑셀 내용을 불러왔습니다. 분석 버튼을 눌러주세요.');
        } catch (error) {
            console.error(error);
            setMsg('엑셀 파일 읽기 실패: ' + error.message);
        }
    };

    const handlePaste = (e) => {
        setPastedText(e.target.value);
    };

    const analyzeText = async () => {
        if (!selectedProject) {
            setMsg('프로젝트를 먼저 선택해주세요.');
            return;
        }
        if (!pastedText.trim()) {
            setMsg('분석할 공사일보 내용이 없습니다.');
            return;
        }

        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            setMsg('Gemini API 키가 설정되지 않았습니다. (.env 파일을 확인해주세요)');
            return;
        }

        setIsLoading(true);
        setMsg('AI가 공사일보를 분석 중입니다... (약 10~30초 소요)');

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `
다음은 건설/설비 공사일보 내용입니다. 이 내용에서 프로젝트와 관련된 문제점(Issue), 특이사항, 그리고 추후 프로젝트 진행 시 주의해야 할 점을 추출해주세요.
결과는 반드시 아래 JSON 배열 형식으로만 응답해주세요. (다른 설명이나 마크다운 백틱은 절대 포함하지 말고 오직 JSON 배열만 반환하세요).

[
  {
    "issue_content": "발생한 이슈나 문제점 상세 내용 요약",
    "category": "단발성 또는 지속 발생 또는 주요 결함",
    "future_notes": "추후 다른 프로젝트 진행 시 신경써야 할 부분이나 개선점 (없으면 빈 문자열)"
  }
]

공사일보 내용:
${pastedText.substring(0, 15000)} // 길이를 제한하여 토큰 초과 방지
`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            // Clean markdown backticks if Gemini adds them
            let cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            const parsedIssues = JSON.parse(cleanText);
            
            if (!Array.isArray(parsedIssues)) {
                throw new Error("AI 응답이 올바른 배열 형태가 아닙니다.");
            }

            setMsg('분석 완료! DB에 저장 중...');

            const today = new Date().toISOString().slice(0, 10);
            const insertData = parsedIssues.map(issue => ({
                project_id: selectedProject,
                date: today,
                issue_content: issue.issue_content,
                category: issue.category || '단발성',
                future_notes: issue.future_notes || ''
            }));

            const { error } = await supabase.from('project_issues').insert(insertData);
            if (error) throw error;

            setMsg('성공적으로 분석 및 저장되었습니다.');
            setPastedText(''); // Clear input
            loadIssues(selectedProject); // Reload issues
            
        } catch (error) {
            console.error(error);
            setMsg('분석 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const recentIssues = issues.slice(0, 10); // Show top 10 latest
    const repeatedIssues = issues.filter(i => i.category.includes('지속') || i.category.includes('반복'));
    const futureNotes = issues.filter(i => i.future_notes && i.future_notes.trim().length > 0);

    return (
        <div className="issue-management-container">
            <header className="issue-management-header">
                <div className="logo-area">
                    <div className="logo-icon">AI</div>
                    <div className="logo-text">
                        <h1><span style={{color: 'var(--primary)'}}>AI</span> 프로젝트 이슈 관리 <span style={{fontSize:'0.75rem', color:'#db2777', fontWeight:'normal'}}>Gemini Powered</span></h1>
                        <p>공사일보 자동 분석 및 프로젝트 이슈 축적 시스템</p>
                    </div>
                </div>
            </header>

            <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, .csv" style={{display: 'none'}} />

            <div className="main-container">
                <aside className="sidebar">
                    <div>
                        <div className="panel-title">프로젝트 선택 *</div>
                        <select 
                            className="project-select" 
                            value={selectedProject} 
                            onChange={(e) => setSelectedProject(e.target.value)}
                        >
                            <option value="">프로젝트를 선택하세요</option>
                            {projectOptions.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.manufacturingNo} · {p.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{marginTop: '1rem'}}>
                        <div className="panel-title">공사일보 업로드</div>
                        <div 
                            className={`dropzone ${isDragging ? 'dragover' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current.click()}
                        >
                            <div className="dropzone-icon">📊</div>
                            <div style={{fontSize: '0.85rem', fontWeight: 500}}>엑셀 파일 업로드 (.xlsx)</div>
                            <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>여기로 드래그하거나 클릭</div>
                        </div>
                    </div>

                    <div>
                        <div className="panel-title" style={{fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between'}}>
                            <span>텍스트 직접 붙여넣기 (Ctrl+V)</span>
                            {pastedText && <span style={{color: 'var(--primary)', cursor: 'pointer'}} onClick={()=>setPastedText('')}>지우기</span>}
                        </div>
                        <textarea 
                            className="paste-textarea" 
                            placeholder="공사일보 파일 내용이나 텍스트를 복사하여 이곳에 붙여넣어 주세요..."
                            value={pastedText}
                            onChange={handlePaste}
                        ></textarea>

                        <button 
                            className="btn-analyze" 
                            onClick={analyzeText}
                            disabled={isLoading || !pastedText.trim() || !selectedProject}
                        >
                            {isLoading ? 'AI 분석 및 저장 중...' : '공사일보 분석 시작 (AI)'}
                        </button>
                        
                        {msg && (
                            <div style={{marginTop: '1rem', padding: '0.8rem', borderRadius: '6px', backgroundColor: msg.includes('실패') || msg.includes('오류') ? 'var(--danger-bg)' : 'var(--accent-bg)', color: msg.includes('실패') || msg.includes('오류') ? 'var(--danger)' : 'var(--accent)', fontSize: '0.85rem', fontWeight: 500}}>
                                {msg}
                            </div>
                        )}
                    </div>
                </aside>

                <div className="content-area">
                    {!selectedProject ? (
                        <div className="empty-state">
                            <h3>프로젝트를 선택해주세요</h3>
                            <p>좌측에서 프로젝트를 선택하면 해당 프로젝트에 누적된 이슈와 주의사항을 확인할 수 있습니다.</p>
                        </div>
                    ) : issues.length === 0 ? (
                        <div className="empty-state">
                            <h3>분석된 이슈가 없습니다</h3>
                            <p>공사일보를 업로드하고 분석을 시작하여 프로젝트 이슈를 축적해보세요.</p>
                        </div>
                    ) : (
                        <>
                            <div className="dashboard-section">
                                <div className="section-header">
                                    <span style={{fontSize: '1.5rem'}}>🚨</span>
                                    <h2 className="section-title">최근 발생 이슈 (Top 10)</h2>
                                </div>
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem'}}>
                                    {recentIssues.map(issue => (
                                        <div key={issue.id} className="issue-card">
                                            <div className="issue-meta">
                                                <span>{issue.date}</span>
                                                <span className="issue-badge">{issue.category}</span>
                                            </div>
                                            <p className="issue-content">{issue.issue_content}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {repeatedIssues.length > 0 && (
                                <div className="dashboard-section">
                                    <div className="section-header">
                                        <span style={{fontSize: '1.5rem'}}>🔁</span>
                                        <h2 className="section-title">지속/반복 발생 이슈</h2>
                                    </div>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                        {repeatedIssues.map(issue => (
                                            <div key={issue.id} className="issue-card category-지속">
                                                <div className="issue-meta">
                                                    <span>{issue.date} 발견</span>
                                                    <span className="issue-badge" style={{color: 'var(--danger)', borderColor: 'var(--danger-bg)'}}>{issue.category}</span>
                                                </div>
                                                <p className="issue-content">{issue.issue_content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {futureNotes.length > 0 && (
                                <div className="dashboard-section">
                                    <div className="section-header">
                                        <span style={{fontSize: '1.5rem'}}>💡</span>
                                        <h2 className="section-title">추후 프로젝트 주의 및 개선사항</h2>
                                    </div>
                                    <div style={{display: 'grid', gridTemplateColumns: '1fr', gap: '1rem'}}>
                                        {futureNotes.map(issue => (
                                            <div key={issue.id} className="issue-future">
                                                <strong>{issue.date} 도출된 인사이트:</strong>
                                                {issue.future_notes}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
