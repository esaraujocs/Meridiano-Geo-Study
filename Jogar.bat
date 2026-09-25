@echo off
rem Meridiano: um clique para jogar. Gera a versao mais recente, sobe o servidor local e abre o navegador.
rem So ASCII de proposito: acento em .bat vira lixo dependendo da pagina de codigo do cmd.
setlocal
title Meridiano
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias - so na primeira vez...
  call npm install
  if errorlevel 1 goto :erro
)

echo Gerando a versao mais recente do jogo...
call npm run build
if errorlevel 1 (
  if exist dist\index.html (
    echo.
    echo Nao consegui gerar a versao nova. Vou abrir a ultima que funcionou.
  ) else (
    goto :erro
  )
)

rem Ja tem servidor na porta 5000 (por exemplo o do link externo)? Entao so abre o navegador.
netstat -ano | findstr /R /C:":5000 .*LISTENING" >nul
if not errorlevel 1 (
  echo Ja existe um servidor na porta 5000. So vou abrir o navegador.
  start "" "http://localhost:5000"
  goto :fim
)

echo.
echo Meridiano em http://localhost:5000
echo Deixe esta janela aberta enquanto joga. Feche a janela para desligar.
echo O progresso fica salvo neste navegador, neste endereco exato (localhost:5000).
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5000"
call npm run preview
goto :fim

:erro
echo.
echo Algo deu errado. Tire um print desta janela e mande pro Claude.

:fim
pause
