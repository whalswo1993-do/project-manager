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
            setMsg('?ºÎ≥¥ Î™©Î°ù??Î∂àÎü¨?§Îäî???§Ìå®?àÏäµ?àÎã§.');
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
        setMsg('?ëÏ? ?åÏùº???ΩÎäî Ï§?..');
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
            
            setMsg('AIÍ∞Ä Ï£ºÏöî ??™©??Ï∂îÏ∂ú?òÍ≥† ?àÏäµ?àÎã§... (??5~10Ï¥?');
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) throw new Error('Gemini API ?§Í? ?§Ï†ï?òÏ? ?äÏïò?µÎãà??');
            
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
            const prompt = `
?§Ïùå?Ä ?ÑÏû• Í≥µÏÇ¨?ºÎ≥¥(?ëÏ?)???êÎ≥∏ ?çÏä§?∏ÏûÖ?àÎã§. ???¥Ïö©?êÏÑú 4Í∞ÄÏßÄ Ï£ºÏöî ?ïÎ≥¥Î•?Ï∂îÏ∂ú?òÏó¨ ?úÏàò JSON ?¨Îß∑?ºÎ°ú Î∞òÌôò?¥Ï£º?∏Ïöî. (ÎßàÌÅ¨?§Ïö¥ ?¨Îß∑?¥ÎÇò Î∞±Ìã±???àÎ?Î°??¨Ìï®?òÏ? ÎßàÏÑ∏??)

?ïÏãù:
{
  "work_details": "Í∏àÏùº ÏßÑÌñâ??Ï£ºÏöî ?ëÏóÖ(?ÖÎ¨¥) ?¥Ïö© ?îÏïΩ (?§Ï§ë ?ºÏù∏?Ä \\n ?¨Ïö©)",
  "special_notes": "?πÏù¥?¨Ìï≠, Í≥µÏ??¨Ìï≠, Í∏∞Ì? Ï∞∏Í≥†?¨Ìï≠ ?îÏïΩ (?ÜÏúºÎ©?Îπ?Î¨∏Ïûê??",
  "issues": "?¥Ïäà?¨Ìï≠, Î¨∏Ï†ú?? ?êÏû¨ Í≤∞Ìíà, ÏßÄ???¨Ïú† ?îÏïΩ (?ÜÏúºÎ©?Îπ?Î¨∏Ïûê??",
  "personnel_count": ?¨ÏûÖ ?∏Ïõê ?§Ï†Å Ï¥ùÌï© (?´ÏûêÎß? ?åÏïÖ?????òÎ©¥ 0)
}

?êÎ≥∏ ?çÏä§??
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
            setMsg('AIÍ∞Ä ?ºÎ≥¥ ?¥Ïö©???±Í≥µ?ÅÏúºÎ°?Íµ¨Ï°∞?îÌñà?µÎãà?? ?Ä??Î≤ÑÌäº???åÎü¨Ï£ºÏÑ∏??');
        } catch (error) {
            console.error(error);
            setMsg('?åÏùº Î∂ÑÏÑù ?§Ìå®: ' + error.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const saveReport = async () => {
        if (!selectedProject) return setMsg('?ÑÎ°ú?ùÌä∏Î•?Î®ºÏ? ?†ÌÉù?¥Ï£º?∏Ïöî.');
        if (!reportDate) return setMsg('?†ÏßúÎ•??†ÌÉù?¥Ï£º?∏Ïöî.');
        if (!reportForm.work_details.trim()) return setMsg('?ëÏóÖ(?ÖÎ¨¥) ?¥Ïö©???ÖÎ†•?¥Ï£º?∏Ïöî.');

        setMsg('?Ä??Ï§?..');
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
            setMsg('?Ä???§Ìå®: ' + error.message);
        } else {
            setMsg('Í≥µÏÇ¨?ºÎ≥¥Í∞Ä ?±Í≥µ?ÅÏúºÎ°??Ä?•Îêò?àÏäµ?àÎã§.');
            setReportForm({ work_details: '', special_notes: '', issues: '', personnel_count: 0 });
            loadReports(selectedProject);
        }
    };

    const removeReport = async (id) => {
        if (confirm('???ºÎ≥¥Î•???†ú?òÏãúÍ≤†Ïäµ?àÍπå?')) {
            await supabase.from('daily_reports').delete().eq('id', id);
            loadReports(selectedProject);
        }
    };

    const generatePPT = async () => {
        if (startDate > endDate) return setAnalyzeMsg('?úÏûë?ºÏù¥ Ï¢ÖÎ£å?ºÎ≥¥???????ÜÏäµ?àÎã§.');
        
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return setAnalyzeMsg('Gemini API ?§Í? ?§Ï†ï?òÏ? ?äÏïò?µÎãà??');

        setIsAnalyzing(true);
        setAnalyzeMsg('?∞Ïù¥?∞Î? ?òÏßë?òÎäî Ï§?..');

        try {
            // 1. Fetch all reports in date range
            const { data: reports, error } = await supabase
                .from('daily_reports')
                .select('*')
                .gte('report_date', startDate)
                .lte('report_date', endDate);

            if (error) throw error;
            if (!reports || reports.length === 0) {
                throw new Error('?¥Îãπ Í∏∞Í∞Ñ???±Î°ù??Í≥µÏÇ¨?ºÎ≥¥Í∞Ä ?ÜÏäµ?àÎã§.');
            }

            setAnalyzeMsg('AIÍ∞Ä ?ÑÏ≤¥ ?ÑÎ°ú?ùÌä∏Î•?Ï¢ÖÌï© Î∂ÑÏÑù Ï§ëÏûÖ?àÎã§... (??10~30Ï¥?');

            // Group reports by project
            const grouped = {};
            reports.forEach(r => {
                const p = projects.find(x => x.id === r.project_id);
                if (!p) return;
                const pName = `${p.manufacturingNo} ${p.name}`;
                if (!grouped[pName]) grouped[pName] = [];
                // Use structured data for PPT gen
                const details = `?ëÏóÖ?¥Ïö©: ${r.work_details || ''}\n?πÏù¥?¨Ìï≠: ${r.special_notes || ''}\n?¥Ïäà: ${r.issues || ''}\n?¨ÏûÖ?∏Ïõê: ${r.personnel_count || 0}Î™?;
                const content = r.content || details; // Fallback for old records
                grouped[pName].push(`- ${r.report_date}:\n${content}`);
            });

            let compiledText = '';
            for (const [pName, lines] of Object.entries(grouped)) {
                compiledText += `\n\n[?ÑÎ°ú?ùÌä∏: ${pName}]\n` + lines.join('\n\n');
            }

            // 2. Call Gemini
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

            const prompt = `
?§Ïùå?Ä ${startDate}Î∂Ä??${endDate}ÍπåÏ? ?òÏßë??Í∞??ÑÎ°ú?ùÌä∏?§Ïùò Í≥µÏÇ¨?ºÎ≥¥ ?¥Ïö©?ÖÎãà??
???¥Ïö©?§ÏùÑ Î∂ÑÏÑù?òÏó¨ 1?òÏù¥ÏßÄ Î∂ÑÎüâ??[?ÑÏ≤¥ Ï¢ÖÌï© ?îÏïΩ]Í≥? [Í∞??ÑÎ°ú?ùÌä∏Î≥?Ï£ºÏöî ?¥Ïäà/?πÏù¥?¨Ìï≠]???ïÎ¶¨?¥Ï£º?∏Ïöî.
Í≤∞Í≥º??Î∞òÎìú???ÑÎûò JSON ?ïÏãù?ºÎ°úÎß??ëÎãµ?òÏÑ∏??(ÎßàÌÅ¨?§Ïö¥ Î∞±Ìã± ?ÜÏù¥ ?úÏàò JSONÎß?Î∞òÌôò).

{
  "summary": "?ÑÏ≤¥ ?ÑÎ°ú?ùÌä∏?§Ïùò ÏßÑÌñâ ?ÅÌô©, Í≥µÌÜµ ?¥Ïäà, Ï£ºÏùò???±ÏùÑ ?¨Ìï®???ÅÏÑ∏??Ï¢ÖÌï© ?îÏïΩ ?çÏä§??(Ï§ÑÎ∞îÍøàÏ? \\n ?¨Ïö©)",
  "projects": [
    {
      "project_name": "?ÑÎ°ú?ùÌä∏ ?¥Î¶Ñ",
      "issues": [
        "Î∂ÑÏÑù??Ï£ºÏöî ?¥Ïäà???πÏù¥?¨Ìï≠ 1",
        "Î∂ÑÏÑù??Ï£ºÏöî ?¥Ïäà???πÏù¥?¨Ìï≠ 2"
      ]
    }
  ]
}

Í≥µÏÇ¨?ºÎ≥¥ ?¥Ïó≠:
${compiledText.substring(0, 30000)}
`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);

            if (!parsed.summary || !parsed.projects) {
                throw new Error('AI ?ëÎãµ???¨Î∞îÎ•??ïÏãù???ÑÎãô?àÎã§.');
            }

            setAnalyzeMsg('PPT Î≥¥Í≥†?úÎ? ?ùÏÑ± Ï§ëÏûÖ?àÎã§...');

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
                    { text: { text: 'TW ?ÑÎ°ú?ùÌä∏ Í¥ÄÎ¶?- AI ?µÌï© Î∂ÑÏÑù Î≥¥Í≥†??, options: { x: 0.2, y: 0.1, w: 5, h: 0.4, color: 'FFFFFF', fontSize: 12, bold: true } } },
                    { text: { text: `${startDate} ~ ${endDate}`, options: { x: '70%', y: 0.1, w: '28%', h: 0.4, color: 'FFFFFF', fontSize: 10, align: 'right' } } }
                ]
            });

            // Slide 1: Summary
            let slide1 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
            slide1.addText('?ÑÏ≤¥ ?ÑÎ°ú?ùÌä∏ Ï¢ÖÌï© ?îÏïΩ', { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 24, bold: true, color: '0F172A' });
            
            // Draw a neat box for summary
            slide1.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.5, w: '90%', h: 3.5, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
            slide1.addText(parsed.summary, {
                x: 0.7, y: 1.7, w: '86%', h: 3.1,
                fontSize: 12, color: '334155', valign: 'top', breakLine: true
            });

            // Slide 2..N: Projects
            parsed.projects.forEach(p => {
                let pSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
                pSlide.addText(`?ÑÎ°ú?ùÌä∏Î≥??¥Ïäà: ${p.project_name}`, { x: 0.5, y: 0.8, w: '90%', h: 0.5, fontSize: 22, bold: true, color: '0F172A' });
                
                pSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.5, w: '90%', h: 3.5, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 } });
                
                const bulletList = p.issues.map(iss => ({ text: iss, options: { bullet: true } }));
                pSlide.addText(bulletList, {
                    x: 0.7, y: 1.7, w: '86%', h: 3.1,
                    fontSize: 14, color: '334155', valign: 'top', lineSpacing: 24
                });
            });

            await pptx.writeFile({ fileName: `?ÑÎ°ú?ùÌä∏_?µÌï©Î∂ÑÏÑùÎ≥¥Í≥†??${endDate}.pptx` });

            setAnalyzeMsg('?éâ Î∂ÑÏÑù Î∞?PPT ?ùÏÑ±???ÑÎ£å?òÏóà?µÎãà??');

        } catch (error) {
            console.error(error);
            if (error.message.includes('429') || error.message.includes('quota') || error.message.toLowerCase().includes('too many requests') || error.message.includes('exceeded')) {
                setAnalyzeMsg('?ö® Î¨¥Î£å AI ?¨Ïö©?âÏù¥ ?ºÏãú?ÅÏúºÎ°?Ï¥àÍ≥º?òÏóà?µÎãà?? 1Î∂??§Ïóê ?§Ïãú ?úÎèÑ?¥Ï£º?∏Ïöî. (Í≥ºÍ∏à?òÏ? ?äÏäµ?àÎã§)');
            } else {
                setAnalyzeMsg('?§Î•ò Î∞úÏÉù: ' + error.message);
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
                        <h1><span style={{color: 'var(--primary)'}}>AI</span> ?ÑÎ°ú?ùÌä∏ ?¥Ïäà Î∞??ºÎ≥¥ Í¥ÄÎ¶?/h1>
                        <p>Í≥µÏÇ¨?ºÎ≥¥ ?çÏä§??Ï∂ïÏ†Å Î∞?AI Í∏∞Î∞ò ?êÎèô PPT Î≥¥Í≥†???ùÏÑ±</p>
                    </div>
                </div>
                <div style={{display: 'flex', gap: '0.5rem', background: '#e1e4e8', padding: '0.3rem', borderRadius: '8px'}}>
                    <button 
                        style={{padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: activeTab==='register'?'#fff':'transparent', color: activeTab==='register'?'#0969da':'#57606a', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab==='register'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}
                        onClick={() => setActiveTab('register')}
                    >
                        ?ºÎ≥¥ ?±Î°ù
                    </button>
                    <button 
                        style={{padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: activeTab==='analyze'?'#fff':'transparent', color: activeTab==='analyze'?'#0969da':'#57606a', fontWeight: 600, cursor: 'pointer', boxShadow: activeTab==='analyze'?'0 1px 3px rgba(0,0,0,0.1)':'none'}}
                        onClick={() => setActiveTab('analyze')}
                    >
                        AI ?µÌï© Î∂ÑÏÑù & PPT
                    </button>
                </div>
            </header>

            <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} accept=".xlsx, .xls, .csv" style={{display: 'none'}} />

            {activeTab === 'register' ? (
                <div className="main-container">
                    <aside className="sidebar">
                        <div>
                            <div className="panel-title">?ÑÎ°ú?ùÌä∏ Î∞??†Ïßú *</div>
                            <select className="project-select" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} style={{marginBottom: '0.5rem'}}>
                                <option value="">?ÑÎ°ú?ùÌä∏Î•??†ÌÉù?òÏÑ∏??/option>
                                {projectOptions.map(p => (
                                    <option key={p.id} value={p.id}>{p.manufacturingNo} ¬∑ {p.name}</option>
                                ))}
                            </select>
                            <input type="date" className="project-select" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                        </div>

                        <div style={{marginTop: '1rem'}}>
                            <div className="panel-title">Í≥µÏÇ¨?ºÎ≥¥ ?êÎ≥∏ ?ÖÎ°ú??/div>
                            <div className={`dropzone ${isDragging ? 'dragover' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current.click()}>
                                <div className="dropzone-icon">?ìÅ</div>
                                <div style={{fontSize: '0.85rem', fontWeight: 500}}>?ëÏ? ?åÏùº ?ÖÎ°ú??(.xlsx)</div>
                                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>?¥Î¶≠?òÍ±∞???úÎûòÍ∑?/div>
                            </div>
                        </div>

                        <div>
                            <div className="panel-title" style={{fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between'}}>
                                <span>Í≥µÏÇ¨?ºÎ≥¥ ?∞Ïù¥??/span>
                                {(reportForm.work_details || reportForm.special_notes || reportForm.issues) && <span style={{color: 'var(--primary)', cursor: 'pointer'}} onClick={()=>setReportForm({work_details: '', special_notes: '', issues: '', personnel_count: 0})}>Ï¥àÍ∏∞??/span>}
                            </div>
                            
                            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem'}}>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?ëÏóÖ(?ÖÎ¨¥) ?¥Ïö© *</label>
                                    <textarea className="paste-textarea" style={{minHeight: '100px'}} placeholder="AIÍ∞Ä ?êÎèô?ºÎ°ú Ï∂îÏ∂ú???ëÏóÖ ?¥Ïö©???úÏãú?©Îãà??" value={reportForm.work_details} onChange={(e) => setReportForm({...reportForm, work_details: e.target.value})}></textarea>
                                </div>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?πÏù¥?¨Ìï≠</label>
                                    <textarea className="paste-textarea" style={{minHeight: '60px'}} placeholder="?πÏù¥?¨Ìï≠" value={reportForm.special_notes} onChange={(e) => setReportForm({...reportForm, special_notes: e.target.value})}></textarea>
                                </div>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?¥Ïäà?¨Ìï≠</label>
                                    <textarea className="paste-textarea" style={{minHeight: '60px'}} placeholder="?¥Ïäà Î∞?ÏßÄ???¨Ïú†" value={reportForm.issues} onChange={(e) => setReportForm({...reportForm, issues: e.target.value})}></textarea>
                                </div>
                                <div>
                                    <label style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>?¨ÏûÖ ?∏Ïõê ?§Ï†Å</label>
                                    <input type="number" className="project-select" placeholder="0" value={reportForm.personnel_count} onChange={(e) => setReportForm({...reportForm, personnel_count: Number(e.target.value)})} />
                                </div>
                            </div>

                            <button className="btn-analyze" onClick={saveReport} disabled={!reportForm.work_details.trim() || !selectedProject || !reportDate || isExtracting}>
                                {isExtracting ? 'AI Ï∂îÏ∂ú Ï§?..' : 'Save'}
                            </button>
                            
                            {msg && (
                                <div style={{marginTop: '1rem', padding: '0.8rem', borderRadius: '6px', backgroundColor: msg.includes('?§Ìå®') ? 'var(--danger-bg)' : 'var(--accent-bg)', color: msg.includes('?§Ìå®') ? 'var(--danger)' : 'var(--accent)', fontSize: '0.85rem', fontWeight: 500}}>
                                    {msg}
                                </div>
                            )}
                        </div>
                    </aside>

                    <div className="content-area">
                        {!selectedProject ? (
                            <div className="empty-state">
                                <h3>?ÑÎ°ú?ùÌä∏Î•??†ÌÉù?¥Ï£º?∏Ïöî</h3>
                                <p>Ï¢åÏ∏°?êÏÑú ?ÑÎ°ú?ùÌä∏Î•??†ÌÉù?òÎ©¥ ?±Î°ù???ºÎ≥¥ Î™©Î°ù???úÏãú?©Îãà??</p>
                            </div>
                        ) : projectReports.length === 0 ? (
                            <div className="empty-state">
                                <h3>?±Î°ù???ºÎ≥¥Í∞Ä ?ÜÏäµ?àÎã§</h3>
                                <p>Ï¢åÏ∏°?êÏÑú Í≥µÏÇ¨?ºÎ≥¥Î•??ÖÎ°ú?úÌïòÍ≥??Ä?•Ìï¥Î≥¥ÏÑ∏??</p>
                            </div>
                        ) : (
                            <div className="dashboard-section">
                                <div className="section-header">
                                    <span style={{fontSize: '1.5rem'}}>?ìù</span>
                                    <h2 className="section-title">?±Î°ù???ºÎ≥¥ Î™©Î°ù</h2>
                                </div>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                                    {projectReports.map(report => (
                                        <div key={report.id} className="issue-card" style={{borderLeftColor: '#6e7781'}}>
                                            <div className="issue-meta">
                                                <span><b style={{color: '#24292f'}}>{report.report_date}</b> ?ºÎ≥¥</span>
                                                <button onClick={() => removeReport(report.id)} style={{background:'transparent', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.8rem'}}>??†ú</button>
                                            </div>
                                            <div className="issue-content" style={{background: '#f6f8fa', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem'}}>
                                                {report.work_details ? (
                                                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.8rem'}}>
                                                        <div>
                                                            <div style={{fontWeight: 600, color: '#0969da', marginBottom: '0.3rem'}}>?ëÏóÖ(?ÖÎ¨¥) ?¥Ïö©</div>
                                                            <div style={{whiteSpace: 'pre-wrap'}}>{report.work_details}</div>
                                                        </div>
                                                        {report.special_notes && (
                                                            <div>
                                                                <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>?πÏù¥?¨Ìï≠</div>
                                                                <div style={{whiteSpace: 'pre-wrap'}}>{report.special_notes}</div>
                                                            </div>
                                                        )}
                                                        {report.issues && (
                                                            <div>
                                                                <div style={{fontWeight: 600, color: 'var(--danger)', marginBottom: '0.3rem'}}>?¥Ïäà?¨Ìï≠</div>
                                                                <div style={{whiteSpace: 'pre-wrap'}}>{report.issues}</div>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div style={{fontWeight: 600, color: '#1f2328', marginBottom: '0.3rem'}}>?¨ÏûÖ ?∏Ïõê ?§Ï†Å: <span style={{fontWeight: 'normal'}}>{report.personnel_count}Î™?/span></div>
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
                        <h2 style={{margin: '0 0 1rem 0', color: 'var(--text-color)'}}>?ìä AI ?ÑÏ≤¥ ?ÑÎ°ú?ùÌä∏ ?µÌï© Î∂ÑÏÑù</h2>
                        <p style={{color: 'var(--text-muted)', marginBottom: '2rem'}}>?†ÌÉù??Í∏∞Í∞Ñ ?ôÏïà ?±Î°ù??Î™®Îì† ?ÑÎ°ú?ùÌä∏??Í≥µÏÇ¨?ºÎ≥¥Î•???Î≤àÏóê ?òÏßë?òÏó¨,<br/>Gemini AIÍ∞Ä Ï¢ÖÌï© 1?òÏù¥ÏßÄ ?îÏïΩÍ≥??ÑÎ°ú?ùÌä∏Î≥??¥ÏäàÎ•?Î∂ÑÏÑù??PPTÎ°?ÎßåÎì§??Ï§çÎãà??</p>
                        
                        <div style={{display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem', alignItems: 'center'}}>
                            <div style={{textAlign: 'left'}}>
                                <label style={{display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem'}}>?úÏûë??/label>
                                <input type="date" className="project-select" value={startDate} onChange={e => setStartDate(e.target.value)} style={{width: '200px'}} />
                            </div>
                            <span style={{color: 'var(--text-muted)', marginTop: '1.2rem'}}>~</span>
                            <div style={{textAlign: 'left'}}>
                                <label style={{display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem'}}>Ï¢ÖÎ£å??/label>
                                <input type="date" className="project-select" value={endDate} onChange={e => setEndDate(e.target.value)} style={{width: '200px'}} />
                            </div>
                        </div>

                        <button 
                            style={{background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', border: 'none', padding: '1rem 2rem', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', width: '100%', boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)', transition: 'all 0.2s'}}
                            onClick={generatePPT}
                            disabled={isAnalyzing}
                        >
                            {isAnalyzing ? 'Î∂ÑÏÑù Ï§?..' : '?ÑÏ≤¥ ?ÑÎ°ú?ùÌä∏ Î∂ÑÏÑù Î∞?PPT ?§Ïö¥Î°úÎìú ?ì•'}
                        </button>

                        {analyzeMsg && (
                            <div style={{marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', background: analyzeMsg.includes('?§Î•ò') ? 'var(--danger-bg)' : '#f0f5ff', color: analyzeMsg.includes('?§Î•ò') ? 'var(--danger)' : '#0969da', fontWeight: 500}}>
                                {analyzeMsg}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
