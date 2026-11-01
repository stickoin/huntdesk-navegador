# Mede a memória e a CPU do Zen (ou de outro navegador) a cada 10 s, na mesma planilha do P0, para comparar.
# Uso: abra o Zen só com as duas contas do jogo e rode o medir-zen.bat. Para parar: feche a janela ou Ctrl+C.
# Mede o navegador inteiro (todos os processos dele), então deixe só as abas do jogo abertas.
param(
  [string]$Processo = 'zen',
  [int]$Intervalo = 10,
  [int]$Minutos = 0 # 0 = mede até fechar a janela
)

$pasta = Join-Path (Split-Path $PSScriptRoot -Parent) 'medicoes'
New-Item -ItemType Directory -Force $pasta | Out-Null
$arquivo = Join-Path $pasta ("p0-{0}-{1}.csv" -f (Get-Date -Format 'yyyy-MM-dd_HHmm'), $Processo)
$cabecalho = 'data_hora,minuto,linha,visivel,freio,visibilidade,fps,relogios_por_s,ram_mb,privada_mb,cpu_pct,heap_js_mb,estado,nota'
[System.IO.File]::WriteAllText($arquivo, [char]0xFEFF + $cabecalho + "`n")

$nucleos = [Environment]::ProcessorCount
$inicio = Get-Date
$cpuAntes = $null
$cult = [Globalization.CultureInfo]::InvariantCulture
Write-Host "Medindo '$Processo' a cada $Intervalo s em $arquivo"
Write-Host 'Para parar: Ctrl+C ou feche esta janela.'

while ($Minutos -eq 0 -or ((Get-Date) - $inicio).TotalMinutes -lt $Minutos) {
  $procs = @(Get-Process -Name $Processo -ErrorAction SilentlyContinue)
  $agora = Get-Date
  $minuto = ($agora - $inicio).TotalMinutes
  if ($procs.Count -eq 0) {
    $linha = '{0},{1},{2},,,,,,,,,,nao encontrado,' -f $agora.ToString('yyyy-MM-dd HH:mm:ss'), $minuto.ToString('0.00', $cult), $Processo
  } else {
    $ram = ($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB
    $privada = ($procs | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB
    $cpuAgora = ($procs | ForEach-Object { if ($_.TotalProcessorTime) { $_.TotalProcessorTime.TotalSeconds } else { 0 } } | Measure-Object -Sum).Sum
    $cpu = ''
    if ($null -ne $cpuAntes) {
      $pct = [Math]::Max(0, ($cpuAgora - $cpuAntes) / $Intervalo / $nucleos * 100)
      $cpu = $pct.ToString('0.0', $cult)
    }
    $cpuAntes = $cpuAgora
    $linha = '{0},{1},{2},,,,,,{3},{4},{5},,{6} processos,' -f $agora.ToString('yyyy-MM-dd HH:mm:ss'), $minuto.ToString('0.00', $cult), $Processo,
      $ram.ToString('0.0', $cult), $privada.ToString('0.0', $cult), $cpu, $procs.Count
    Write-Host ('{0}  {1:0} MB  CPU {2}%' -f $agora.ToString('HH:mm:ss'), $ram, $cpu)
  }
  [System.IO.File]::AppendAllText($arquivo, $linha + "`n")
  Start-Sleep -Seconds $Intervalo
}
