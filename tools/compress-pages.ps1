param(
  [string]$InDir = "images",
  [int]$MaxWidth = 1600,
  [int]$JpegQuality = 78
)

Add-Type -AssemblyName System.Drawing

$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$qualityParam = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$JpegQuality)
$encoderParams.Param[0] = $qualityParam
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

$files = Get-ChildItem -Path $InDir -Filter "page-*.png" | Sort-Object Name
foreach ($f in $files) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $ratio = $MaxWidth / $img.Width
    if ($ratio -gt 1) { $ratio = 1 }
    $newW = [int]($img.Width * $ratio)
    $newH = [int]($img.Height * $ratio)

    $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, $newW, $newH)

    $outPath = Join-Path $InDir ($f.BaseName + ".jpg")
    $bmp.Save($outPath, $jpegCodec, $encoderParams)

    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    Remove-Item $f.FullName -Force

    Write-Output "compressed $outPath"
}
Write-Output "DONE"
