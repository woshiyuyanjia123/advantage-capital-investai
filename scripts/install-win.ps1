param([string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'), [switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$pluginRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'plugin'))
if (!(Test-Path (Join-Path $pluginRoot 'package.json'))) { $pluginRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app-src')) }
$pluginId = '@local/investai-desktop'
$spec = 'link:' + ($pluginRoot -replace '\\', '/')
$enc = New-Object Text.UTF8Encoding($false)

foreach ($prof in @('desktop', 'web')) {
  $pDir = Join-Path $DshHome ("profiles\$prof")
  $pkgPath = Join-Path $pDir 'package.json'
  if (!(Test-Path $pkgPath)) { continue }
  $bak = Join-Path $pDir ('.nb-fde-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $bak -Force | Out-Null
  Copy-Item -LiteralPath $pkgPath -Destination $bak -Force
  $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
  if (!$pkg.dependencies) { $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) }
  $linkPath = Join-Path $pDir 'node_modules\@local\investai-desktop'
  if (Test-Path -LiteralPath $linkPath) {
    $it = Get-Item -LiteralPath $linkPath
    if ($it.LinkType) { [IO.Directory]::Delete($linkPath) }
  }
  if ($Uninstall) {
    $pkg.dependencies.PSObject.Properties.Remove($pluginId)
    if ($pkg.dsh.profile.bundles) { $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles | Where-Object { $_ -ne $pluginId }) }
  } else {
    New-Item -ItemType Directory -Path (Split-Path $linkPath) -Force | Out-Null
    New-Item -ItemType Junction -Path $linkPath -Target $pluginRoot | Out-Null
    $pkg.dependencies | Add-Member -NotePropertyName $pluginId -NotePropertyValue $spec -Force
    if ($pkg.dsh.profile.bundles -and ($pluginId -notin $pkg.dsh.profile.bundles)) {
      $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) + $pluginId
    }
  }
  [IO.File]::WriteAllText($pkgPath, ($pkg | ConvertTo-Json -Depth 100) + "`n", $enc)
  Write-Host "[OK] DSH profile '$prof' updated (backup: $bak)"
}
