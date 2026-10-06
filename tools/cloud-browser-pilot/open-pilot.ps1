param([string]$Server = 'root@168.119.246.33')
$ErrorActionPreference = 'Stop'
if (Get-NetTCPConnection -LocalPort 6088 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 6088 ist bereits belegt. Vorhandenen Tunnel prüfen.'
}
$sshPath = (Get-Command ssh.exe).Source
$tunnel = Start-Process -FilePath $sshPath -ArgumentList @(
    '-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30', '-L', '127.0.0.1:6088:127.0.0.1:6088', $Server
) -WindowStyle Hidden -PassThru
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($tunnel.HasExited) { throw 'Der SSH-Tunnel konnte nicht geöffnet werden.' }
    if (Get-NetTCPConnection -LocalPort 6088 -State Listen -ErrorAction SilentlyContinue) {
        Write-Output "Tunnel bereit. Prozess-ID: $($tunnel.Id)."
        Write-Output 'http://127.0.0.1:6088/vnc.html?autoconnect=1&resize=scale'
        exit 0
    }
    Start-Sleep -Milliseconds 250
}
Stop-Process -Id $tunnel.Id
throw 'Der SSH-Tunnel ist nicht rechtzeitig bereit geworden.'
