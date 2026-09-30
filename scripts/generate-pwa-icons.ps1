# Generates the PWA icon set in public/ from the Nusantara brand mark (icon.svg
# at the repo root — an emerald diamond/gem on a #0f6e56 rounded square).
#
# icon.svg is simple geometry, so we redraw it with GDI+ at each target size
# (no SVG rasterizer dependency). Geometry mirrors icon.svg (viewBox 0 0 200 200):
#   rect 0,0,200,200 rx=38  fill #0f6e56
#   top facet    (100,35)(165,72)(100,109)(35,72)     white 100%
#   left facet   (35,72)(100,109)(100,165)(35,128)    white 60%
#   right facet  (165,72)(100,109)(100,165)(165,128)  white 82%
#
# Output:
#   public/icon-192.png            192  purpose "any"   (rounded tile)
#   public/icon-512.png            512  purpose "any"
#   public/icon-maskable-512.png   512  purpose "maskable" (full-bleed square)
#   public/apple-touch-icon.png    180  iOS homescreen (full-bleed)
#   public/logo-nusantara-sq.png   512  in-app logo (sidebar/login/favicon/og:image)
#
# Run: powershell -ExecutionPolicy Bypass -File scripts/generate-pwa-icons.ps1

Add-Type -AssemblyName System.Drawing

$pub = Join-Path $PSScriptRoot '..\public'

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Poly([int]$size, $pts) {
  $s = $size / 200.0
  $arr = New-Object 'System.Drawing.PointF[]' ($pts.Count)
  for ($i = 0; $i -lt $pts.Count; $i++) {
    $arr[$i] = New-Object System.Drawing.PointF([float]($pts[$i][0] * $s), [float]($pts[$i][1] * $s))
  }
  return $arr
}

function Write-LogoIcon([int]$size, [string]$outFile, [bool]$rounded) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Emerald rounded-square tile (#0f6e56). rx=38 in a 200 box -> 0.19 * size.
  $tile = [System.Drawing.Color]::FromArgb(255, 15, 110, 86)
  $brushTile = New-Object System.Drawing.SolidBrush($tile)
  if ($rounded) {
    $r = [float]($size * 0.19)
    $path = New-RoundedRectPath 0 0 $size $size $r
    $g.FillPath($brushTile, $path)
    $path.Dispose()
  } else {
    $g.FillRectangle($brushTile, 0, 0, $size, $size)
  }
  $brushTile.Dispose()

  # Diamond facets.
  $top = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
  $left = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(153, 255, 255, 255))
  $right = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(209, 255, 255, 255))

  $g.FillPolygon($top, (New-Poly $size @(@(100, 35), @(165, 72), @(100, 109), @(35, 72))))
  $g.FillPolygon($left, (New-Poly $size @(@(35, 72), @(100, 109), @(100, 165), @(35, 128))))
  $g.FillPolygon($right, (New-Poly $size @(@(165, 72), @(100, 109), @(100, 165), @(165, 128))))

  $top.Dispose(); $left.Dispose(); $right.Dispose()
  $g.Dispose()
  $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $outFile"
}

Write-LogoIcon 192 (Join-Path $pub 'icon-192.png')          $true
Write-LogoIcon 512 (Join-Path $pub 'icon-512.png')          $true
Write-LogoIcon 512 (Join-Path $pub 'icon-maskable-512.png') $false
Write-LogoIcon 180 (Join-Path $pub 'apple-touch-icon.png')  $false
Write-LogoIcon 512 (Join-Path $pub 'logo-nusantara-sq.png') $false
