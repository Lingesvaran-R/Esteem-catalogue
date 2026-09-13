param(
  [string]$Source = "assets/img/logo.png",
  [string]$OutDir = "assets/img"
)

Add-Type -AssemblyName System.Drawing

$srcPath = (Resolve-Path $Source).Path
$outFull = (Resolve-Path $OutDir).Path

$src = New-Object System.Drawing.Bitmap([System.Drawing.Image]::FromFile($srcPath))
$w = $src.Width; $h = $src.Height

# The source mark is a gold ellipse with near-black letterforms on transparency.
# Luminance is inverted into alpha so the wordmark can be tinted for dark grounds.
function New-TintedMark([System.Drawing.Bitmap]$bmp, [int]$tr, [int]$tg, [int]$tb, [int]$threshold) {
  $out = New-Object System.Drawing.Bitmap($bmp.Width, $bmp.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      $p = $bmp.GetPixel($x, $y)
      if ($p.A -eq 0) {
        $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $tr, $tg, $tb))
        continue
      }
      $lum = (0.299 * $p.R) + (0.587 * $p.G) + (0.114 * $p.B)
      $a = [int](((($threshold - $lum) / $threshold) * 255) * ($p.A / 255))
      if ($a -lt 0) { $a = 0 }
      if ($a -gt 255) { $a = 255 }
      $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $tr, $tg, $tb))
    }
  }
  return $out
}

$light = New-TintedMark $src 243 238 228 150
$light.Save((Join-Path $outFull "logo-light.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "wrote logo-light.png"

$gold = New-TintedMark $src 214 167 60 150
$gold.Save((Join-Path $outFull "logo-gold.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "wrote logo-gold.png"

$green = New-TintedMark $src 9 138 70 150
$green.Save((Join-Path $outFull "logo-green.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$green.Dispose()
Write-Output "wrote logo-green.png"

# Touch icon: the full wordmark, gold on a deep green rounded tile.
$size = 180
$fav = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($fav)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$radius = 38
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
$path.AddArc($size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
$path.AddArc($size - $radius * 2, $size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
$path.AddArc(0, $size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
$path.CloseFigure()
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 12, 43, 34))
$g.FillPath($brush, $path)

$pad = 18
$targetW = $size - ($pad * 2)
$scale = $targetW / $gold.Width
$targetH = [int]($gold.Height * $scale)
$g.DrawImage($gold, $pad, [int](($size - $targetH) / 2), $targetW, $targetH)

$fav.Save((Join-Path (Split-Path $outFull -Parent | Split-Path -Parent) "apple-touch-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "wrote apple-touch-icon.png"

$g.Dispose(); $fav.Dispose(); $gold.Dispose(); $light.Dispose(); $src.Dispose()
Write-Output "DONE"
