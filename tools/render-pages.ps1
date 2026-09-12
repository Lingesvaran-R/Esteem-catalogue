param(
  [string]$PdfPath = "Esteem Multi System_Catlg_onlyCustomer compress.pdf",
  [string]$OutDir = "images",
  [double]$Scale = 2.5
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

Function Await($WinRtTask, $ResultType) {
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    $asTaskGeneric = $asTask.MakeGenericMethod($ResultType)
    $netTask = $asTaskGeneric.Invoke($null, @($WinRtTask))
    $netTask.Wait() | Out-Null
    return $netTask.Result
}

Function AwaitAction($WinRtAction) {
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
    $netTask = $asTask.Invoke($null, @($WinRtAction))
    $netTask.Wait() | Out-Null
}

[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.RandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null

$fullPdfPath = (Resolve-Path $PdfPath).Path
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$fullOutDir = (Resolve-Path $OutDir).Path

$storageFileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($fullPdfPath)
$storageFile = Await $storageFileOp ([Windows.Storage.StorageFile])

$pdfDocOp = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)
$pdfDoc = Await $pdfDocOp ([Windows.Data.Pdf.PdfDocument])

Write-Output "Total pages: $($pdfDoc.PageCount)"

for ($i = 0; $i -lt $pdfDoc.PageCount; $i++) {
    $page = $pdfDoc.GetPage([uint32]$i)
    $pageNum = $i + 1
    $numStr = "{0:D2}" -f $pageNum
    $outFile = Join-Path $fullOutDir "page-$numStr.png"

    $renderOptions = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $renderOptions.DestinationWidth = [uint32]([Math]::Round($page.Size.Width * $Scale))
    $renderOptions.DestinationHeight = [uint32]([Math]::Round($page.Size.Height * $Scale))

    $memStream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $renderOp = $page.RenderToStreamAsync($memStream, $renderOptions)
    AwaitAction $renderOp

    $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($memStream.GetInputStreamAt(0))
    $fileStream = [System.IO.File]::Create($outFile)
    $netStream.CopyTo($fileStream)
    $fileStream.Close()
    $netStream.Close()
    $memStream.Dispose()
    $page.Dispose()

    Write-Output "wrote $outFile"
}

Write-Output "DONE"
