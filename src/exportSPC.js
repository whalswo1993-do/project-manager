import ExcelJS from 'exceljs';

const d2Table = {
    2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078,
    11: 3.173, 12: 3.258, 13: 3.336, 14: 3.407, 15: 3.472, 16: 3.532, 17: 3.588, 18: 3.640, 19: 3.689, 20: 3.735,
    21: 3.778, 22: 3.819, 23: 3.858, 24: 3.895, 25: 3.931
};

export function calculateMean(data) {
    if (!data || data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
}

export function calculateSampleStd(data) {
    if (!data || data.length <= 1) return 0;
    const mean = calculateMean(data);
    const sqDiff = data.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0);
    return Math.sqrt(sqDiff / (data.length - 1));
}

export function calculateSigmaRBar(data, n) {
    if (!data || data.length <= 1) return 0;
    if (n === 1 || !n) {
        let sumMR = 0;
        for (let i = 1; i < data.length; i++) {
            sumMR += Math.abs(data[i] - data[i - 1]);
        }
        return (sumMR / (data.length - 1)) / 1.128;
    }
    const d2 = d2Table[n] || 1.128;
    let sumR = 0;
    let groupCount = 0;
    
    for (let i = 0; i <= data.length - n; i += n) {
        const sub = data.slice(i, i + n);
        const max = Math.max(...sub);
        const min = Math.min(...sub);
        sumR += (max - min);
        groupCount++;
    }
    
    if (groupCount === 0) return calculateSigmaRBar(data, 1);
    return (sumR / groupCount) / d2;
}

export function calculateStats(data, specs, method) {
    const { target, usl, lsl, subgroup } = specs;
    if (!data || data.length === 0) return null;
    const n = data.length;
    const mean = calculateMean(data);
    
    const stdDev = calculateSampleStd(data);
    let sigma = method === 'sample_std' ? stdDev : calculateSigmaRBar(data, subgroup);
    if (sigma === 0) sigma = 0.0001;

    let cp = 0, cpk = 0, cpu = 0, cpl = 0;
    if (usl !== null && lsl !== null) {
        cp = (usl - lsl) / (6 * sigma);
        cpu = (usl - mean) / (3 * sigma);
        cpl = (mean - lsl) / (3 * sigma);
        cpk = Math.min(cpu, cpl);
    }

    const kVal = Math.abs(target - mean) / ((usl - lsl) / 2);
    return { n, mean, stdDev, sigma, cp, cpk, kVal };
}

function drawSPCChartToContext(ctx, W, H, data, spec, mean, sigma, cp, cpk, isPrintMode) {
    ctx.clearRect(0, 0, W, H);
    
    const mLeft = 50, mRight = 40, mTop = 30, mBottom = 40;
    const chartW = W - mLeft - mRight;
    const chartH = H - mTop - mBottom;

    ctx.strokeStyle = isPrintMode ? '#333333' : '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mLeft, mTop);
    ctx.lineTo(mLeft, mTop + chartH);
    ctx.lineTo(mLeft + chartW, mTop + chartH);
    ctx.stroke();

    const binCount = 20;
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const rangeMin = Math.min(minVal, spec.lsl) - 0.5 * sigma;
    const rangeMax = Math.max(maxVal, spec.usl) + 0.5 * sigma;
    const dataRange = rangeMax - rangeMin;
    const binWidth = dataRange / binCount;
    const bins = Array(binCount).fill(0);
    
    data.forEach(val => {
        let binIdx = Math.floor((val - rangeMin) / binWidth);
        if (binIdx >= binCount) binIdx = binCount - 1;
        if (binIdx < 0) binIdx = 0;
        bins[binIdx]++;
    });

    const maxBinCount = Math.max(...bins) || 1;
    const getX = (val) => mLeft + ((val - rangeMin) / dataRange) * chartW;
    const getYHist = (count) => (mTop + chartH) - (count / maxBinCount) * chartH * 0.8;

    ctx.fillStyle = isPrintMode ? 'rgba(31, 111, 235, 0.1)' : 'rgba(56, 139, 253, 0.15)';
    ctx.strokeStyle = isPrintMode ? 'rgba(31, 111, 235, 0.4)' : 'rgba(56, 139, 253, 0.4)';
    ctx.lineWidth = 1;

    for (let i = 0; i < binCount; i++) {
        const count = bins[i];
        if (count === 0) continue;
        const xStart = getX(rangeMin + i * binWidth);
        const xEnd = getX(rangeMin + (i + 1) * binWidth);
        const yTop = getYHist(count);
        const barH = (mTop + chartH) - yTop;
        const barW = xEnd - xStart;
        ctx.fillRect(xStart, yTop, barW - 1, barH);
        ctx.strokeRect(xStart, yTop, barW - 1, barH);
    }

    const pdfPeak = 1.0 / (sigma * Math.sqrt(2.0 * Math.PI));
    const getYCurve = (yVal) => (mTop + chartH) - (yVal / pdfPeak) * chartH * 0.8;

    ctx.strokeStyle = '#d29922';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const steps = 150;
    for (let i = 0; i <= steps; i++) {
        const xVal = rangeMin + (i / steps) * dataRange;
        const yVal = (1.0 / (sigma * Math.sqrt(2.0 * Math.PI))) * Math.exp(-0.5 * Math.pow((xVal - mean) / sigma, 2));
        const screenX = getX(xVal);
        const screenY = getYCurve(yVal);
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
    }
    ctx.stroke();

    const drawDashedVerticalLine = (val, color, label, isDashed = true) => {
        const screenX = getX(val);
        if (screenX < mLeft || screenX > mLeft + chartW) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        if (isDashed) ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(screenX, mTop);
        ctx.lineTo(screenX, mTop + chartH);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.font = '500 10px Outfit, Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, screenX, mTop - 10);
        ctx.font = '400 9px monospace';
        ctx.fillText(val.toFixed(3), screenX, mTop + chartH + 12);
    };

    drawDashedVerticalLine(spec.lsl, '#f85149', 'LSL');
    drawDashedVerticalLine(spec.usl, '#f85149', 'USL');
    drawDashedVerticalLine(spec.target, '#2ea043', 'Target');
    drawDashedVerticalLine(mean, '#d29922', 'Mean', false);

    ctx.fillStyle = isPrintMode ? '#555555' : '#8b949e';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
        const count = Math.round((i / 4) * maxBinCount);
        const yPos = getYHist(count);
        ctx.fillText(count, mLeft - 8, yPos);
        if (i > 0) {
            ctx.strokeStyle = isPrintMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(48, 54, 61, 0.2)';
            ctx.beginPath();
            ctx.moveTo(mLeft, yPos);
            ctx.lineTo(mLeft + chartW, yPos);
            ctx.stroke();
        }
    }

    ctx.fillStyle = isPrintMode ? 'rgba(240, 240, 240, 0.9)' : 'rgba(22, 27, 34, 0.85)';
    ctx.strokeStyle = isPrintMode ? '#999999' : '#30363d';
    ctx.lineWidth = 1;
    const overlayW = 100, overlayH = 50, overlayX = mLeft + chartW - overlayW - 10, overlayY = mTop + 10;
    ctx.fillRect(overlayX, overlayY, overlayW, overlayH);
    ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);
    ctx.fillStyle = isPrintMode ? '#000000' : '#ffffff';
    ctx.font = '600 11px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Cp:  ${cp.toFixed(3)}`, overlayX + 10, overlayY + 18);
    ctx.fillText(`Cpk: ${cpk.toFixed(3)}`, overlayX + 10, overlayY + 36);
}

export async function exportResultsToExcelWithExcelJS(items, targetCp, method) {
    const workbook = new ExcelJS.Workbook();
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const summaryWs = workbook.addWorksheet('종합 요약 보고서');
    summaryWs.columns = [
        { header: '항목명', key: 'col', width: 20 },
        { header: '데이터 수 (N)', key: 'N', width: 15 },
        { header: '평균 (μ)', key: 'mean', width: 15 },
        { header: '표준편차 (σ)', key: 'sigma', width: 15 },
        { header: '하한치 (LSL)', key: 'lsl', width: 15 },
        { header: '상한치 (USL)', key: 'usl', width: 15 },
        { header: '타겟 (Target)', key: 'target', width: 15 },
        { header: 'Cp (단기)', key: 'cp', width: 12 },
        { header: 'Cpk (치우침)', key: 'cpk', width: 12 },
        { header: '판정 결과', key: 'status', width: 12 }
    ];

    summaryWs.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryWs.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6FEB' } };
    summaryWs.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    for (const item of items) {
        const { data, specs, stats, name } = item;
        let statusText = "불합격";
        if (stats.cpk >= targetCp) statusText = "합격";
        else if (stats.cpk >= 1.0) statusText = "경고";

        const row = summaryWs.addRow({
            col: name, N: stats.n, mean: parseFloat(stats.mean.toFixed(5)),
            sigma: parseFloat(stats.sigma.toFixed(5)), lsl: specs.lsl, usl: specs.usl, target: specs.target,
            cp: parseFloat(stats.cp.toFixed(3)), cpk: parseFloat(stats.cpk.toFixed(3)), status: statusText
        });
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell('col').font = { bold: true };
        row.getCell('cpk').font = { color: { argb: stats.cpk < targetCp ? 'FFFF0000' : 'FF2EA043' }, bold: true };

        const ws = workbook.addWorksheet(name.replace(/[/\\?*:[\]]/g, '').slice(0, 31)); // valid sheet name
        ws.getCell('A1').value = "분석 지표"; ws.getCell('B1').value = "수치 결과";
        ws.getCell('A1').font = { bold: true }; ws.getCell('B1').font = { bold: true };
        
        ws.getCell('A2').value = "측정 데이터 수 (N)"; ws.getCell('B2').value = stats.n;
        ws.getCell('A3').value = "측정값 평균 (Mean)"; ws.getCell('B3').value = parseFloat(stats.mean.toFixed(6));
        ws.getCell('A4').value = "표준편차 (Sigma)"; ws.getCell('B4').value = parseFloat(stats.sigma.toFixed(6));
        ws.getCell('A5').value = "치우침 계수 (k)"; ws.getCell('B5').value = parseFloat((stats.kVal * 100).toFixed(2)) + "%";
        ws.getCell('A6').value = "공정능력지수 (Cp)"; ws.getCell('B6').value = parseFloat(stats.cp.toFixed(3));
        ws.getCell('A7').value = "치우침 고려 지수 (Cpk)"; ws.getCell('B7').value = parseFloat(stats.cpk.toFixed(3));
        ws.getCell('B7').font = { bold: true, color: { argb: stats.cpk < targetCp ? 'FFFF0000' : 'FF2EA043' } };

        ws.getCell('A9').value = "규격 기준"; ws.getCell('B9').value = "설정값";
        ws.getCell('A9').font = { bold: true }; ws.getCell('B9').font = { bold: true };
        ws.getCell('A10').value = "Target (타겟값)"; ws.getCell('B10').value = specs.target;
        ws.getCell('A11').value = "USL (상한치)"; ws.getCell('B11').value = specs.usl;
        ws.getCell('A12').value = "LSL (하한치)"; ws.getCell('B12').value = specs.lsl;
        ws.getCell('A13').value = "Subgroup (부분군 크기)"; ws.getCell('B13').value = specs.subgroup;

        drawSPCChartToContext(ctx, 600, 400, data, specs, stats.mean, stats.sigma, stats.cp, stats.cpk, true);
        const base64Img = canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
        const imgId = workbook.addImage({ base64: base64Img, extension: 'png' });
        ws.addImage(imgId, { tl: { col: 4, row: 0 }, ext: { width: 480, height: 320 } });

        ws.getCell('A15').value = "측정 데이터 목록"; ws.getCell('A15').font = { bold: true, size: 11 };
        ws.getCell('A16').value = "No (인덱스)"; ws.getCell('B16').value = "측정값";
        ws.getCell('A16').font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell('B16').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getCell('A16').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF555555' } }; ws.getCell('B16').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF555555' } };

        data.forEach((val, valIdx) => {
            ws.getCell(`A${17 + valIdx}`).value = valIdx + 1;
            ws.getCell(`B${17 + valIdx}`).value = val;
        });
        ws.getColumn(1).width = 22; ws.getColumn(2).width = 16;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `설비_SPC_통합리포트_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
