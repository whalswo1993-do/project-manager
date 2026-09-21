$desktop = [Environment]::GetFolderPath('Desktop')
$file = Get-ChildItem -Path $desktop -Filter "*SKOH2*" | Select-Object -First 1
Write-Host "Found file: $($file.FullName)"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($file.FullName)
    $ws = $wb.Sheets.Item("Planning")
    $null = $ws.UsedRange.Copy()
    
    Add-Type -AssemblyName System.Windows.Forms
    $dataObj = [System.Windows.Forms.Clipboard]::GetDataObject()
    
    if ($dataObj.GetDataPresent("Text")) {
        $text = $dataObj.GetData("Text")
        [System.IO.File]::WriteAllText("C:\Users\minja\.gemini\antigravity-ide\scratch\project-manager\scripts\skoh2_clipboard_text.txt", $text, [System.Text.Encoding]::UTF8)
        Write-Host "Wrote skoh2_clipboard_text.txt (Length: $($text.Length))"
    }
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
