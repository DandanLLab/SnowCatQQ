# SnowCat 9.9.37 适配验证启动（一次性脚本，复用 snowcat-launch 逻辑）
$ErrorActionPreference = 'Stop'
$NapcatDir = 'C:\dsh\.tmp\napcat-shell'
$QQPath = 'D:\SnowCat.Portable\SnowCat.9.9.37-54395.Shell\QQ.exe'
$root = Split-Path $QQPath -Parent
$app = Get-ChildItem (Join-Path $root 'versions') -Directory | ForEach-Object {
  $pj = Join-Path $_.FullName 'resources\app\package.json'
  if (Test-Path $pj) { Get-Content $pj -Raw | ConvertFrom-Json }
} | Sort-Object { [version]($_.version -replace '-.*','') } -Descending | Select-Object -First 1

$qqnt = [ordered]@{
  name = 'qq-chat'
  verHash = ''
  version = $app.version
  linuxVersion = ''
  linuxVerHash = ''
  private = $true
  description = 'QQ'
  productName = 'QQ'
  author = @{ name = 'Tencent'; email = 'QQ-Team@tencent.com' }
  homepage = 'https://im.qq.com'
  sideEffects = $true
  bin = @{ qd = 'externals/devtools/cli/index.js' }
  main = './loadNapCat.js'
  buildVersion = if ($app.version -match '-(\d+)$') { $Matches[1] } else { '0' }
  isPureShell = $true
  isByteCodeShell = $true
  platform = 'win32'
  eleArch = 'x64'
}
$qqntPath = Join-Path $NapcatDir 'qqnt.json'
[IO.File]::WriteAllText($qqntPath, ($qqnt | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
$mainJs = (Join-Path $NapcatDir 'napcat.mjs').Replace('\', '/')
Set-Content (Join-Path $NapcatDir 'loadNapCat.js') -Value "(async () => {await import(`"file:///$mainJs`")})()" -Encoding ASCII

$env:NAPCAT_PATCH_PACKAGE = $qqntPath
$env:NAPCAT_LOAD_PATH = Join-Path $NapcatDir 'loadNapCat.js'
$env:NAPCAT_INJECT_PATH = Join-Path $NapcatDir 'NapCatWinBootHook.dll'
$env:NAPCAT_MAIN_PATH = $mainJs
Write-Host ("[OK] qqnt=" + $app.version + " build=" + $qqnt['buildVersion'])
$logFile = Join-Path $NapcatDir ('snowcat-boot5-' + (Get-Date -Format 'HHmmss') + '.log')
Start-Process -FilePath (Join-Path $NapcatDir 'NapCatWinBootMain.exe') -ArgumentList ('"' + $QQPath + '"', '"' + (Join-Path $NapcatDir 'NapCatWinBootHook.dll') + '"', '-q<Account>') -WindowStyle Hidden -RedirectStandardError $logFile
Write-Host 'launched'
