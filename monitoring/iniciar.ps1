# Sobe o Prometheus com a configuração deste projeto.
#
# O executável não faz parte do repositório: baixe em prometheus.io/download
# (windows-amd64) e descompacte onde preferir. O script procura nos lugares
# comuns; se o seu estiver em outro caminho, informe antes de rodar:
#
#   $env:PROMETHEUS_BIN = "D:\ferramentas\prometheus\prometheus.exe"
#
# Uso:  npm run monitor      (ou)  powershell -File monitoring\iniciar.ps1

$ErrorActionPreference = "Stop"

# A configuração é lida a partir desta pasta: prometheus.yml referencia
# alertas.yml por caminho relativo ao diretório de trabalho.
$pastaConfig = $PSScriptRoot

function Encontrar-Prometheus {
    if ($env:PROMETHEUS_BIN -and (Test-Path $env:PROMETHEUS_BIN)) {
        return $env:PROMETHEUS_BIN
    }
    $naPath = Get-Command prometheus.exe -ErrorAction SilentlyContinue
    if ($naPath) { return $naPath.Source }

    $procurar = @(
        (Join-Path $env:USERPROFILE "Downloads"),
        (Join-Path $env:LOCALAPPDATA "Programs"),
        "C:\prometheus"
    )
    foreach ($raiz in $procurar) {
        if (-not (Test-Path $raiz)) { continue }
        $achado = Get-ChildItem -Path $raiz -Filter prometheus.exe -Recurse `
            -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($achado) { return $achado.FullName }
    }
    return $null
}

$exe = Encontrar-Prometheus
if (-not $exe) {
    Write-Host "Prometheus nao encontrado." -ForegroundColor Red
    Write-Host "Baixe em https://prometheus.io/download (windows-amd64) e descompacte,"
    Write-Host "ou aponte o caminho:  `$env:PROMETHEUS_BIN = 'C:\caminho\prometheus.exe'"
    exit 1
}

# Uma instancia antiga segura a porta 9090 e faz a nova morrer em silencio.
$emUso = Get-NetTCPConnection -LocalPort 9090 -State Listen -ErrorAction SilentlyContinue
if ($emUso) {
    Write-Host "Encerrando instancia anterior na porta 9090..." -ForegroundColor Yellow
    $emUso | Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

Write-Host "Prometheus: $exe"
Write-Host "Configuracao: $pastaConfig\prometheus.yml"
Write-Host "Painel: http://localhost:9090  (alvos em /targets, alertas em /alerts)"
Write-Host "A aplicacao e raspada em localhost:3000; 'npm run dev' sobe as duas juntas."
Write-Host ""

# Entra na pasta da configuração: tanto prometheus.yml quanto o alertas.yml que
# ele referencia são resolvidos a partir do diretório de trabalho.
Push-Location $pastaConfig
try {
    & $exe --config.file=prometheus.yml
}
finally {
    Pop-Location
}
