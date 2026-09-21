$desktop = [Environment]::GetFolderPath('Desktop')
$filePath = Join-Path $desktop "SKBM 11, 13 Line E1111, E2222 JC.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($filePath)
    $ws = $wb.Sheets.Item("Planning")
    
    # Simulate user dragging from Row 5 (Header) to Row 135 (End of 4th equipment)
    $range = $ws.Range("B5:BH135")
    $null = $range.Copy()
    
    Add-Type -AssemblyName System.Windows.Forms
    $dataObj = [System.Windows.Forms.Clipboard]::GetDataObject()
    
    $memStream = $dataObj.GetData("Html Format")
    if ($memStream -is [System.IO.MemoryStream]) {
        $reader = New-Object System.IO.StreamReader($memStream, [System.Text.Encoding]::UTF8)
        $htmlText = $reader.ReadToEnd()
        [System.IO.File]::WriteAllText("C:\Users\minja\.gemini\antigravity-ide\scratch\project-manager\scripts\dragged_html.html", $htmlText, [System.Text.Encoding]::UTF8)
        Write-Host "Wrote dragged_html.html (Length: $($htmlText.Length))"
    }

    if ($dataObj.GetDataPresent("Text")) {
        $text = $dataObj.GetData("Text")
        [System.IO.File]::WriteAllText("C:\Users\minja\.gemini\antigravity-ide\scratch\project-manager\scripts\dragged_text.txt", $text, [System.Text.Encoding]::UTF8)
        Write-Host "Wrote dragged_text.txt (Length: $($text.Length))"
    }
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
