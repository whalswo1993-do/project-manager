$desktop = [Environment]::GetFolderPath('Desktop')
$filePath = Join-Path $desktop "SKBM 11, 13 Line E1111, E2222 JC.xlsx"
Write-Host "Target file: $filePath"
if (-not (Test-Path $filePath)) {
    Write-Host "File does not exist!"
    exit 1
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($filePath)
    $ws = $wb.Sheets.Item("Planning")
    $used = $ws.UsedRange
    Write-Host "UsedRange Address: $($used.Address)"
    $null = $used.Copy()
    
    Add-Type -AssemblyName System.Windows.Forms
    $dataObj = [System.Windows.Forms.Clipboard]::GetDataObject()
    $formats = $dataObj.GetFormats()
    Write-Host "Available Clipboard Formats: $($formats -join ', ')"

    if ($dataObj.GetDataPresent("Text")) {
        $text = $dataObj.GetData("Text")
        [System.IO.File]::WriteAllText("C:\Users\minja\.gemini\antigravity-ide\scratch\project-manager\scripts\clipboard_text.txt", $text, [System.Text.Encoding]::UTF8)
        Write-Host "Wrote clipboard_text.txt (Length: $($text.Length))"
    }

    if ($dataObj.GetDataPresent("Html Format")) {
        $html = $dataObj.GetData("Html Format")
        [System.IO.File]::WriteAllText("C:\Users\minja\.gemini\antigravity-ide\scratch\project-manager\scripts\clipboard_html.txt", $html, [System.Text.Encoding]::UTF8)
        Write-Host "Wrote clipboard_html.txt (Length: $($html.Length))"
    }
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
