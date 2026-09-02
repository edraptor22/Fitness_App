# Regenerates the PWA icons. Run from the repo root:  powershell -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\icons'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

function New-Icon {
  param([int]$Size, [string]$Path, [double]$Inset = 1.0)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(11, 13, 16))
  $g.FillRectangle($bg, 0, 0, $Size, $Size)

  $fg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(91, 141, 255))
  $s = $Size * $Inset
  $o = ($Size - $s) / 2.0

  # A barbell: bar, two inner plates, two outer plates. Units are fractions
  # of the drawable square so every size comes out identical.
  $rects = @(
    @(0.200, 0.470, 0.600, 0.060),   # bar
    @(0.260, 0.330, 0.075, 0.340),   # inner plate, left
    @(0.665, 0.330, 0.075, 0.340),   # inner plate, right
    @(0.155, 0.395, 0.065, 0.210),   # outer plate, left
    @(0.780, 0.395, 0.065, 0.210)    # outer plate, right
  )
  foreach ($r in $rects) {
    $g.FillRectangle($fg,
      [single]($o + $s * $r[0]), [single]($o + $s * $r[1]),
      [single]($s * $r[2]),      [single]($s * $r[3]))
  }

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $bg.Dispose(); $fg.Dispose()
  Write-Host "wrote $Path"
}

New-Icon -Size 192 -Path (Join-Path $out 'icon-192.png')
New-Icon -Size 512 -Path (Join-Path $out 'icon-512.png')
New-Icon -Size 512 -Path (Join-Path $out 'icon-512-maskable.png') -Inset 0.62
New-Icon -Size 180 -Path (Join-Path $out 'apple-touch-icon.png')
