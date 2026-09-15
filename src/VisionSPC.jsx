import React, { useState, useRef, useMemo, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import './VisionSPC.css';
import { calculateStats, exportResultsToExcelWithExcelJS } from './exportSPC';
import { supabase } from './supabase';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function VisionSPC() {
    const [isDragging, setIsDragging] = useState(false);
    const [items, setItems] = useState([]); // [{ name, data: [], specs: { target, usl, lsl, subgroup }, stats: {} }]
    const [activeItemIndex, setActiveItemIndex] = useState(null);
    const [sigmaMethod, setSigmaMethod] = useState('moving_range');
    const [targetCp, setTargetCp] = useState('1.67');
    
    // 프리셋 관련 상태
    const [customPresets, setCustomPresets] = useState({});
    const [presetSelect, setPresetSelect] = useState('');
    const [newPresetName, setNewPresetName] = useState('');

    const fileInputRef = useRef(null);
    const presetFileInputRef = useRef(null);

    const activeItem = activeItemIndex !== null ? items[activeItemIndex] : null;

    useEffect(() => {
        loadCustomPresets();

        const channel = supabase
            .channel('spc-presets-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'spc_presets' },
                (payload) => {
                    loadCustomPresets();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const loadCustomPresets = async () => {
        try {
            const { data, error } = await supabase.from('spc_presets').select('*');
            if (error) throw error;
            
            const loadedPresets = {};
            if (data) {
                data.forEach(row => {
                    loadedPresets[row.name] = row.data;
                });
            }
            setCustomPresets(loadedPresets);
        } catch (e) {
            console.error("Failed to load presets from Supabase", e);
        }
    };
    const parseSpcGrid = (parsedGrid) => {
        if (!parsedGrid || parsedGrid.length === 0) return [];

        let labelColIdx = -1;
        
        const keywordScore = {};
        for (let r = 0; r < Math.min(20, parsedGrid.length); r++) {
            const row = parsedGrid[r];
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] || "").trim().toLowerCase();
                if (["usl", "lsl", "target", "raw data"].includes(cell)) {
                    keywordScore[c] = (keywordScore[c] || 0) + 1;
                }
            }
        }
        
        if (Object.keys(keywordScore).length > 0) {
            labelColIdx = parseInt(Object.keys(keywordScore).reduce((a, b) => keywordScore[a] > keywordScore[b] ? a : b));
        }

        let uslRowIdx = -1, lslRowIdx = -1, targetRowIdx = -1, rawDataRowIdx = -1;
        let headerRowIdx = -1;

        if (labelColIdx !== -1) {
            for (let r = 0; r < Math.min(50, parsedGrid.length); r++) {
                const cell = String(parsedGrid[r][labelColIdx] || "").trim().toLowerCase();
                if (cell === "usl") uslRowIdx = r;
                else if (cell === "lsl") lslRowIdx = r;
                else if (cell === "target") targetRowIdx = r;
                else if (cell === "raw data") rawDataRowIdx = r;
            }

            const pivotRow = Math.max(0, uslRowIdx > -1 ? uslRowIdx : rawDataRowIdx > -1 ? rawDataRowIdx : 1);
            for (let r = pivotRow - 1; r >= 0; r--) {
                const nonEmpties = parsedGrid[r].filter((v, i) => i !== labelColIdx && String(v).trim() !== "").length;
                if (nonEmpties > 0) {
                    headerRowIdx = r;
                    break;
                }
            }
        }

        if (headerRowIdx === -1) {
            for (let r = 0; r < Math.min(10, parsedGrid.length); r++) {
                if (parsedGrid[r] && parsedGrid[r].some(cell => String(cell).trim() !== "")) {
                    if (String(parsedGrid[r][0] || "").toUpperCase().includes("CP")) continue;
                    headerRowIdx = r;
                    break;
                }
            }
        }

        if (headerRowIdx === -1) return [];

        const headers = parsedGrid[headerRowIdx];
        const parsedItems = [];

        headers.forEach((headerName, c) => {
            if (c === labelColIdx) return;
            const hName = String(headerName || "").trim();
            if (!hName) return;
            
            const colData = [];
            let startRow = rawDataRowIdx !== -1 ? rawDataRowIdx : headerRowIdx + 1;
            
            for (let r = startRow; r < parsedGrid.length; r++) {
                if (r === uslRowIdx || r === lslRowIdx || r === targetRowIdx || r === headerRowIdx) continue;
                
                const row = parsedGrid[r];
                if (!row) continue;
                
                const cellVal = row[c];
                if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== "") {
                    const num = parseFloat(String(cellVal).replace(/,/g, ''));
                    if (!isNaN(num)) {
                        colData.push(num);
                    }
                }
            }
            
            if (colData.length > 0) {
                const min = Math.min(...colData);
                const max = Math.max(...colData);
                const calcTarget = (min + max) / 2;
                const calcMargin = (max - min) * 0.1;
                
                let usl = max + calcMargin;
                let lsl = min - calcMargin;
                let target = calcTarget;

                if (uslRowIdx !== -1 && parsedGrid[uslRowIdx] && parsedGrid[uslRowIdx][c]) {
                    const val = parseFloat(String(parsedGrid[uslRowIdx][c]).replace(/,/g, ''));
                    if (!isNaN(val)) usl = val;
                }
                if (lslRowIdx !== -1 && parsedGrid[lslRowIdx] && parsedGrid[lslRowIdx][c]) {
                    const val = parseFloat(String(parsedGrid[lslRowIdx][c]).replace(/,/g, ''));
                    if (!isNaN(val)) lsl = val;
                }
                if (targetRowIdx !== -1 && parsedGrid[targetRowIdx] && parsedGrid[targetRowIdx][c]) {
                    const val = parseFloat(String(parsedGrid[targetRowIdx][c]).replace(/,/g, ''));
                    if (!isNaN(val)) target = val;
                }

                const specs = { target, usl, lsl, subgroup: 1 };
                const stats = calculateStats(colData, specs, sigmaMethod);
                
                parsedItems.push({
                    name: hName,
                    data: colData,
                    specs,
                    stats
                });
            }
        });
        
        return parsedItems;
    };

    // Excel 파싱
    const handleFileUpload = async (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const buffer = e.target.result;
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            
            const worksheet = workbook.worksheets[0];
            const parsedGrid = [];
            worksheet.eachRow((row, rowNumber) => {
                const rowValues = row.values.slice(1); // row.values[0] is empty in ExcelJS
                parsedGrid.push(rowValues);
            });
            
            const parsedItems = parseSpcGrid(parsedGrid);
            
            setItems(parsedItems);
            if (parsedItems.length > 0) setActiveItemIndex(0);
        };
        reader.readAsArrayBuffer(file);
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

    const handleSpecChange = (field, value) => {
        if (!activeItem) return;
        const newItems = [...items];
        const item = { ...newItems[activeItemIndex] };
        item.specs[field] = parseFloat(value);
        item.stats = calculateStats(item.data, item.specs, sigmaMethod);
        newItems[activeItemIndex] = item;
        setItems(newItems);
    };

    useEffect(() => {
        if (items.length > 0) {
            const newItems = items.map(item => ({
                ...item,
                stats: calculateStats(item.data, item.specs, sigmaMethod)
            }));
            setItems(newItems);
        }
    }, [sigmaMethod]);

    const handleSavePreset = async () => {
        if (items.length === 0) {
            alert("데이터를 먼저 입력해 주세요.");
            return;
        }
        const rawName = newPresetName.trim();
        if (!rawName) {
            alert("저장할 신규 모델명을 입력해 주세요.");
            return;
        }
        const presetData = {};
        items.forEach(item => {
            presetData[item.name] = { ...item.specs };
        });
        
        try {
            const { error } = await supabase
                .from('spc_presets')
                .upsert({ name: rawName, data: presetData }, { onConflict: 'name' });
                
            if (error) throw error;
            
            const updated = { ...customPresets, [rawName]: presetData };
            setCustomPresets(updated);
            setNewPresetName('');
            setPresetSelect(`custom_${rawName}`);
            alert(`모델 스펙 저장 완료: '${rawName}'`);
        } catch (error) {
            console.error("Failed to save preset to Supabase", error);
            alert("저장 중 오류가 발생했습니다.");
        }
    };

    const handleLoadPreset = (val) => {
        setPresetSelect(val);
        if (!val || val.startsWith("builtin_")) return;
        
        const cleanName = val.replace("custom_", "");
        const presetData = customPresets[cleanName];
        if (presetData && items.length > 0) {
            const newItems = items.map(item => {
                if (presetData[item.name]) {
                    const newSpecs = { ...item.specs, ...presetData[item.name] };
                    return { ...item, specs: newSpecs, stats: calculateStats(item.data, newSpecs, sigmaMethod) };
                }
                return item;
            });
            setItems(newItems);
        }
    };

    const handleDeletePreset = async () => {
        if (!presetSelect || presetSelect.startsWith("builtin_")) return;
        const cleanName = presetSelect.replace("custom_", "");
        if (window.confirm(`'${cleanName}' 모델 스펙 프리셋을 삭제하시겠습니까?`)) {
            try {
                const { error } = await supabase
                    .from('spc_presets')
                    .delete()
                    .eq('name', cleanName);
                    
                if (error) throw error;
                
                const updated = { ...customPresets };
                delete updated[cleanName];
                setCustomPresets(updated);
                setPresetSelect('');
            } catch (error) {
                console.error("Failed to delete preset from Supabase", error);
                alert("삭제 중 오류가 발생했습니다.");
            }
        }
    };

    const handleExportPresetsJSON = () => {
        if (Object.keys(customPresets).length === 0) {
            alert("저장된 프리셋이 없습니다.");
            return;
        }
        const jsonString = JSON.stringify(customPresets, null, 2);
        const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `spc_model_presets_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportPresetsJSON = async (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                const upsertData = Object.keys(imported).map(key => ({
                    name: key,
                    data: imported[key]
                }));
                
                const { error } = await supabase
                    .from('spc_presets')
                    .upsert(upsertData, { onConflict: 'name' });
                    
                if (error) throw error;
                
                const updated = { ...customPresets, ...imported };
                setCustomPresets(updated);
                alert("프리셋을 성공적으로 불러왔습니다.");
            } catch (err) {
                console.error(err);
                alert("가져오기 중 오류가 발생했거나 올바른 JSON 파일이 아닙니다.");
            }
        };
        reader.readAsText(file);
    };

    const handlePaste = (e) => {
        const text = e.target.value;
        if (!text || text.trim() === "") return;
        
        try {
            const lines = text.split(/\r?\n/);
            if (lines.length < 2) return;
            
            const parsedGrid = lines.map(line => {
                if (line.includes('\t')) {
                    return line.split('\t').map(cell => cell.trim());
                } else {
                    return line.split(',').map(cell => cell.trim());
                }
            }).filter(row => row.length > 0 && row.some(cell => cell !== ""));
            
            if (parsedGrid.length === 0) return;
            const parsedItems = parseSpcGrid(parsedGrid);
            
            if (parsedItems.length > 0) {
                setItems(parsedItems);
                setActiveItemIndex(0);
                e.target.value = ""; // clear textarea
            } else {
                alert("유효한 숫자 데이터가 없습니다.");
            }
            
        } catch (error) {
            console.error(error);
            alert("데이터 파싱 중 오류가 발생했습니다.");
        }
    };

    const chartData = useMemo(() => {
        if (!activeItem || !activeItem.stats) return null;
        const { data, specs, stats } = activeItem;
        
        const min = Math.min(...data, specs.lsl || 0);
        const max = Math.max(...data, specs.usl || 0);
        const range = max - min;
        const binCount = 20;
        const binWidth = range / binCount;
        
        const bins = Array(binCount).fill(0);
        const binLabels = [];
        for (let i = 0; i < binCount; i++) {
            binLabels.push((min + (i * binWidth) + (binWidth / 2)).toFixed(3));
        }

        data.forEach(val => {
            let binIndex = Math.floor((val - min) / binWidth);
            if (binIndex >= binCount) binIndex = binCount - 1;
            if (binIndex < 0) binIndex = 0;
            bins[binIndex]++;
        });

        const normalCurve = [];
        for (let i = 0; i < binCount; i++) {
            const x = min + (i * binWidth) + (binWidth / 2);
            const exponent = -Math.pow(x - stats.mean, 2) / (2 * Math.pow(stats.sigma, 2));
            const y = (1 / (stats.sigma * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
            normalCurve.push(y * data.length * binWidth);
        }

        return {
            labels: binLabels,
            datasets: [
                {
                    type: 'line',
                    label: '정규분포',
                    data: normalCurve,
                    borderColor: '#58a6ff',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    type: 'bar',
                    label: '히스토그램',
                    data: bins,
                    backgroundColor: 'rgba(88,166,255,0.25)',
                    borderColor: '#58a6ff',
                    borderWidth: 1,
                }
            ]
        };
    }, [activeItem]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color: 'rgba(48, 54, 61, 0.5)' } },
            y: { grid: { color: 'rgba(48, 54, 61, 0.5)' }, beginAtZero: true }
        }
    };

    return (
        <div className="vision-spc-container">
            <header className="vision-spc-header">
                <div className="logo-area">
                    <div className="logo-icon">SPC</div>
                    <div className="logo-text">
                        <h1><span style={{color: 'var(--primary)'}}>Vision</span> SPC 분석기</h1>
                        <p>설비 비전 검사 데이터 기반 공정능력(Cp/Cpk) 통계 및 분석</p>
                    </div>
                </div>
            </header>

            <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} accept=".xlsx, .xls" style={{display: 'none'}} />
            <input type="file" ref={presetFileInputRef} onChange={(e) => handleImportPresetsJSON(e.target.files[0])} accept=".json" style={{display: 'none'}} />

            <div className="main-container">
                <aside className="sidebar">
                    <div>
                        <div className="panel-title">데이터 입력</div>
                        <div 
                            className={`dropzone ${isDragging ? 'dragover' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current.click()}
                            style={{marginBottom: '1rem'}}
                        >
                            <div className="dropzone-icon">📁</div>
                            <div className="dropzone-text">검사 로그 파일 (.xlsx)</div>
                            <div className="dropzone-subtext">여기로 드래그하거나 클릭하여 파일 선택</div>
                        </div>

                        <div className="paste-area">
                            <div className="panel-title" style={{fontSize: '0.8rem'}}>클립보드 데이터 붙여넣기 (CTRL+V)</div>
                            <textarea 
                                className="paste-textarea" 
                                placeholder="엑셀에서 헤더를 포함한 데이터를 복사하여 이곳에 붙여넣어 주세요..."
                                onInput={handlePaste}
                            ></textarea>
                        </div>
                    </div>

                    <div style={{marginTop: '1.5rem'}}>
                        <div className="panel-title">분석 항목 목록</div>
                        <div className="items-container">
                            {items.length === 0 ? (
                                <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem'}}>
                                    데이터를 먼저 입력해 주세요.
                                </div>
                            ) : (
                                items.map((item, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`item-row ${activeItemIndex === idx ? 'active' : ''}`}
                                        onClick={() => setActiveItemIndex(idx)}
                                    >
                                        <div className="item-info">
                                            <span className="item-name">{item.name}</span>
                                            <span className="item-subtext">N={item.stats?.n}</span>
                                        </div>
                                        {item.stats?.cpk >= parseFloat(targetCp) ? (
                                            <span className="badge badge-success">합격</span>
                                        ) : (
                                            <span className="badge badge-danger">불량</span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </aside>

                <main className="content-area">
                    <div className="config-bar">
                        <div style={{display:'flex', gap:'1rem'}}>
                            <div className="config-item">
                                <span>표준편차(σ):</span>
                                <select className="config-select" value={sigmaMethod} onChange={(e) => setSigmaMethod(e.target.value)}>
                                    <option value="moving_range">군내 (MR / d2)</option>
                                    <option value="sample_std">전체 (Sample Std)</option>
                                </select>
                            </div>
                            <div className="config-item">
                                <span>타겟 Cp:</span>
                                <select className="config-select" value={targetCp} onChange={(e) => setTargetCp(e.target.value)}>
                                    <option value="1.33">1.33</option>
                                    <option value="1.67">1.67</option>
                                    <option value="2.00">2.00</option>
                                </select>
                            </div>
                            <div className="config-item">
                                <span>프리셋 로드:</span>
                                <select className="config-select" value={presetSelect} onChange={(e) => handleLoadPreset(e.target.value)}>
                                    <option value="">모델 선택...</option>
                                    {Object.keys(customPresets).map(k => (
                                        <option key={k} value={`custom_${k}`}>{k}</option>
                                    ))}
                                </select>
                                {presetSelect && <button onClick={handleDeletePreset} style={{background:'var(--danger)', color:'#fff', border:'none', borderRadius:'4px', padding:'4px 8px', cursor:'pointer', marginLeft:'4px'}}>삭제</button>}
                            </div>
                        </div>
                        <div style={{display:'flex', gap:'0.5rem'}}>
                            <button className="btn" onClick={() => presetFileInputRef.current.click()}>가져오기</button>
                            <button className="btn" onClick={handleExportPresetsJSON}>내보내기</button>
                            {items.length > 0 && (
                                <>
                                    <button className="btn" style={{background: '#24292f', color: '#fff', border: 'none'}} onClick={() => window.print()}>🖨️ 인쇄 / PDF 저장</button>
                                    <button className="btn" style={{background: '#2da44e', color: '#fff', border: 'none'}} onClick={() => exportResultsToExcelWithExcelJS(items, parseFloat(targetCp), sigmaMethod)}>📊 Excel 리포트 출력</button>
                                </>
                            )}
                        </div>
                    </div>

                    {!activeItem ? (
                        <div className="welcome-screen">
                            <div className="welcome-icon">⚡</div>
                            <h2>Vision SPC 분석기</h2>
                            <p>설비 비전 검사 데이터 기반 공정능력(Cp/Cpk) 통계 및 분석을 오프라인에서 실시간으로 지원합니다.</p>
                            <div className="welcome-steps">
                                <div className="welcome-step">
                                    <div className="welcome-step-num">1</div>
                                    <div style={{textAlign: 'center', fontWeight: '500'}}>엑셀 파일 업로드 또는 데이터 복사/붙여넣기</div>
                                </div>
                                <div className="welcome-step">
                                    <div className="welcome-step-num">2</div>
                                    <div style={{textAlign: 'center', fontWeight: '500'}}>각 항목별 스펙(LSL, USL, Target) 설정</div>
                                </div>
                                <div className="welcome-step">
                                    <div className="welcome-step-num">3</div>
                                    <div style={{textAlign: 'center', fontWeight: '500'}}>분석 결과 확인 및 엑셀/PDF 보고서 저장</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="dashboard-grid">
                            <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                                <div className="card">
                                    <div className="card-header">
                                        <div className="card-title">{activeItem.name} 결과 요약</div>
                                    </div>
                                    <div className="stats-grid">
                                        <div className={`stat-card ${activeItem.stats?.cp >= parseFloat(targetCp) ? 'pass' : 'fail'}`}>
                                            <div className="stat-card-title">Cp (단기)</div>
                                            <div className="stat-card-value">{activeItem.stats?.cp.toFixed(2)}</div>
                                        </div>
                                        <div className={`stat-card ${activeItem.stats?.cpk >= parseFloat(targetCp) ? 'pass' : 'fail'}`}>
                                            <div className="stat-card-title">Cpk (치우침 고려)</div>
                                            <div className="stat-card-value">{activeItem.stats?.cpk.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="card-header">
                                        <div className="card-title">단일 항목 스펙 수정</div>
                                    </div>
                                    <table className="spec-table">
                                        <thead>
                                            <tr><th>구분</th><th>설정치</th></tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>Target</td><td><input type="number" step="any" className="spec-input" value={activeItem.specs.target} onChange={(e) => handleSpecChange('target', e.target.value)} /></td></tr>
                                            <tr><td>USL</td><td><input type="number" step="any" className="spec-input" value={activeItem.specs.usl} onChange={(e) => handleSpecChange('usl', e.target.value)} /></td></tr>
                                            <tr><td>LSL</td><td><input type="number" step="any" className="spec-input" value={activeItem.specs.lsl} onChange={(e) => handleSpecChange('lsl', e.target.value)} /></td></tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="card">
                                    <div className="card-header"><div className="card-title">현재 스펙 모델로 저장</div></div>
                                    <div style={{display:'flex', gap:'0.5rem', padding:'1rem'}}>
                                        <input className="spec-input" placeholder="새 모델명" value={newPresetName} onChange={e => setNewPresetName(e.target.value)} />
                                        <button className="btn" onClick={handleSavePreset}>저장</button>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{height: '100%'}}>
                                <div className="card-header">
                                    <div className="card-title">공정능력 정규분포 차트</div>
                                </div>
                                <div className="chart-wrapper">
                                    {chartData && <Chart type='bar' data={chartData} options={chartOptions} />}
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
