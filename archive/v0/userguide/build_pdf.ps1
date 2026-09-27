# Generate PDF from HTML user guides (requires Microsoft Edge)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) {
    $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path $edge)) {
    Write-Error "Microsoft Edge not found. Open ja/index.html or en/index.html in a browser and use Print > Save as PDF."
    exit 1
}

$pairs = @(
    @{ Html = "$root\ja\index.html"; Pdf = "$root\CoBRAC_UserGuide_ja.pdf" },
    @{ Html = "$root\en\index.html"; Pdf = "$root\CoBRAC_UserGuide_en.pdf" }
)

foreach ($p in $pairs) {
    $htmlPath = (Resolve-Path $p.Html).Path
    $uri = [System.Uri]::new($htmlPath).AbsoluteUri
    Write-Host "Printing: $uri"
    & $edge --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$($p.Pdf)" $uri 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    if (Test-Path $p.Pdf) {
        Write-Host "Created: $($p.Pdf) ($((Get-Item $p.Pdf).Length) bytes)"
    } else {
        Write-Warning "Failed: $($p.Pdf)"
    }
}
