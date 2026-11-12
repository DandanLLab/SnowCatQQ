# SnowCat 雪猫 · 稳定线启动器（PowerShell）
#
# 零硬改设计（对照 start-tongling.ps1 的三处硬改，全部自动化）：
#   ① 自动发现 QQ：注册表 → 常见路径 → D:/OneKey 便携 → 找不到给一键安装提示
#   ② 自动读真实版本：versions/*/resources/app/package.json（废手工 qqnt.json 钉版）
#   ③ 自动生成 qqnt.json + loadNapCat.js 到运行时目录
# 用法: .\snowcat-launch.ps1 [-Account <REDACTED>] [-NapcatDir C:\dsh\.tmp\napcat-shell] [-QQPath 自定义QQ.exe]
# 2026-11-11 立项 · SnowCat Project

param(
  [string]$Account = '<REDACTED>',
  [string]$NapcatDir = 'C:\dsh\.tmp\napcat-shell',
  [string]$QQPath = '',
  [switch]$InstallIfMissing
)

$ErrorActionPreference = 'Stop'

# ─────────────── ① QQ 自动发现 ───────────────

function Find-QQInstall {
  param([string]$Override)

  if ($Override -and (Test-Path $Override)) {
    return @{ Path = $Override; Source = 'param' }
  }

  # 1) 注册表（标准安装版）
  try {
    $reg = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\QQ' -ErrorAction SilentlyContinue
    if ($reg -and $reg.UninstallString) {
      $dir = Split-Path $reg.UninstallString.Trim('"') -Parent
      $qq = Join-Path $dir 'QQ.exe'
      if (Test-Path $qq) { return @{ Path = $qq; Source = 'registry' } }
    }
  } catch {}

  # 2) 常见安装路径
  foreach ($p in @(
    "$env:ProgramFiles\Tencent\QQNT\QQ.exe",
    "${env:ProgramFiles(x86)}\Tencent\QQNT\QQ.exe",
    "$env:LOCALAPPDATA\Programs\Tencent\QQNT\QQ.exe"
  )) {
    if (Test-Path $p) { return @{ Path = $p; Source = 'common-path' } }
  }

  # 3) OneKey 便携包
  $onekey = Get-ChildItem 'D:\NapCat.Shell.Windows.OneKey\*\QQ.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($onekey) { return @{ Path = $onekey.FullName; Source = 'onekey-portable' } }

  return $null
}

# ─────────────── ② 真实版本探测 ───────────────

function Get-QQRealVersion {
  param([string]$QQExe)

  $root = Split-Path $QQExe -Parent
  # 权威源：versions/*/resources/app/package.json（便携版）
  $versions = Join-Path $root 'versions'
  if (Test-Path $versions) {
    $app = Get-ChildItem $versions -Directory | ForEach-Object {
      $pj = Join-Path $_.FullName 'resources\app\package.json'
      if (Test-Path $pj) { Get-Content $pj -Raw | ConvertFrom-Json }
    } | Sort-Object { [version]($_.version -replace '-.*', '') } -Descending | Select-Object -First 1
    if ($app) {
      return @{ version = $app.version; json = $app; dir = $root }
    }
  }
  # 标准安装版：QQ.exe 版本资源
  $vi = (Get-Item $QQExe).VersionInfo
  return @{ version = "$($vi.ProductVersion)"; json = $null; dir = $root }
}

# ─────────────── 主流程 ───────────────

Write-Host '== SnowCat 雪猫启动器 ==' -ForegroundColor Cyan

$found = Find-QQInstall -Override $QQPath
if (-not $found) {
  if ($InstallIfMissing) {
    Write-Host '[!] 未发现 QQ。请从 https://im.qq.com 安装最新 QQNT，或下载 OneKey 便携包后重跑。' -ForegroundColor Yellow
    Write-Host '    （一键下载安装线待后续批次接入安装器）' -ForegroundColor Gray
  } else {
    Write-Host '[X] 未发现 QQ 安装。用 -InstallIfMissing 查看安装指引，或 -QQPath 指定。' -ForegroundColor Red
  }
  exit 1
}

$ver = Get-QQRealVersion -QQExe $found.Path
Write-Host ("[✓] QQ: {0}  ({1})" -f $found.Path, $found.Source) -ForegroundColor Green
Write-Host ("[✓] 版本: {0}" -f $ver.version) -ForegroundColor Green

# ─────────────── ③ 自动生成 qqnt.json（不钉版，写实况） ───────────────

$qqnt = [ordered]@{
  name = 'qq-chat'
  verHash = ''
  version = $ver.version
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
  # buildVersion 取版本号 '-' 后段（52892 形态）；无则 0
  buildVersion = if ($ver.version -match '-(\d+)$') { $Matches[1] } else { '0' }
  isPureShell = $true
  isByteCodeShell = $true
  platform = 'win32'
  eleArch = 'x64'
}
$qqntPath = Join-Path $NapcatDir 'qqnt.json'
[IO.File]::WriteAllText($qqntPath, ($qqnt | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[✓] qqnt.json 已自动生成（$qqntPath），版本=实况 $($ver.version)" -ForegroundColor Green

# loadNapCat.js 每次启动重新生成（官方 launcher 语义）
$mainJs = (Join-Path $NapcatDir 'napcat.mjs').Replace('\', '/')

# ─────────────── ④ 判定注入目标（versions 分包结构 / 扁平结构） ───────────────
# 9.9.27+ 的 OneKey 便携版把真正的 Electron 程序放进了 versions\<ver>\resources\app\，
# 根目录不再有 resources\app\package.json。此前把 NAPCAT_PATCH_PACKAGE 固定指到根目录
# qqnt.json，导致新版 QQ 读到的仍是原始入口，loadNapCat.js 从不执行（进程能起、插件不加载）。

$patchTarget = $qqntPath          # 兜底：扁平结构，patch 根目录 qqnt.json
$loadJs = Join-Path $NapcatDir 'loadNapCat.js'
$layout = 'flat'

$versionsDir = Join-Path $NapcatDir 'versions'
if (Test-Path $versionsDir) {
  $candidates = @()
  # 优先用实况版本号精确匹配，再退到 versions\config.json 的 curVersion
  if ($ver.version) { $candidates += (Join-Path $versionsDir "$($ver.version)\resources\app") }
  $cfgPath = Join-Path $versionsDir 'config.json'
  if (Test-Path $cfgPath) {
    try {
      $cur = (Get-Content $cfgPath -Raw | ConvertFrom-Json).curVersion
      if ($cur) { $candidates += (Join-Path $versionsDir "$cur\resources\app") }
    } catch {}
  }
  # 最后按目录名兜底（取版本号最大的一个）
  Get-ChildItem $versionsDir -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { $candidates += (Join-Path $_.FullName 'resources\app') }

  foreach ($cand in ($candidates | Select-Object -Unique)) {
    $pkg = Join-Path $cand 'package.json'
    if (Test-Path $pkg) {
      $patchTarget = $pkg
      # loadNapCat.js 放到目标目录：main 里的相对路径 ./loadNapCat.js 才能解析
      $loadJs = Join-Path $cand 'loadNapCat.js'
      $layout = 'versions'
      break
    }
  }
}

# 首次接管真实 package.json 时留一份原始备份，便于回滚
if ($layout -eq 'versions') {
  $orig = "$patchTarget.orig"
  if (-not (Test-Path $orig)) {
    Copy-Item $patchTarget $orig -Force
    Write-Host "[✓] 已备份原始 package.json → $orig" -ForegroundColor DarkGray
  }
}

Set-Content $loadJs -Value "(async () => {await import(`"file:///$mainJs`")})()" -Encoding ASCII
Write-Host ("[✓] 注入目标: {0}（{1} 结构）" -f $patchTarget, $layout) -ForegroundColor Green

# ─────────────── 注入启动 ───────────────

$bootMain = Join-Path $NapcatDir 'NapCatWinBootMain.exe'
$hook = Join-Path $NapcatDir 'NapCatWinBootHook.dll'
if (-not (Test-Path $bootMain)) { Write-Host "[X] 缺 $bootMain" -ForegroundColor Red; exit 1 }

$env:NAPCAT_PATCH_PACKAGE = $patchTarget
$env:NAPCAT_LOAD_PATH = $loadJs
$env:NAPCAT_INJECT_PATH = $hook
$env:NAPCAT_MAIN_PATH = $mainJs

Write-Host "[▶] 注入启动: NapCatWinBootMain → QQ -q$Account" -ForegroundColor Cyan
& $bootMain $found.Path $hook "-q$Account"
