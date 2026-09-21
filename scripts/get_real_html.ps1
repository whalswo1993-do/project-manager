$desktop = [Environment]::GetFolderPath('Desktop')
$filePath = Join-Path $desktop "SKBM 11, 13 Line E1111, E2222 JC.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($filePath)
    $ws = $wb.Sheets.Item("Planning")
    $null = $ws.UsedRange.Copy()
    
    Add-Type -AssemblyName System.Windows.Forms
    $dataObj = [System.Windows.Forms.Clipboard]::GetDataObject()
    
    # In Windows Forms, "Html Format" is retrieved via stream or string
    $memStream = $dataObj.GetData("Html Format")
    if ($memStream -is [System.IO.MemoryStream]) {
        $reader = New-Object System.IO.StreamReader($memStream, [System.Text.Encoding]::UTF8)
        $htmlText = $reader.ReadToEnd()
        [System.IO.File]::WriteAllText("C:\Users\minja\.gemini\antigravity-ide\scratch\project-manager\scripts\real_excel_html.html", $htmlText, [System.Text.Encoding]::UTF8)
        Write-Host "Wrote real_excel_html.html (Length: $($htmlText.Length))"
    } else {
        Write-Host "Html Format was type: $($memStream.GetType().FullName)"
    }
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
