# PowerShell script to register or update the daily backup task in Windows Task Scheduler
$TaskName = "QuestionGen_Daily_Backup"
$PythonW = "d:\question-generation-system\venv\Scripts\pythonw.exe"
$BackupScript = "d:\question-generation-system\scripts\daily_backup.py"
$WorkingDir = "d:\question-generation-system"
$Time = "17:45"

Write-Host "Configuring Windows Task Scheduler for $TaskName at $Time daily..."

$Action = New-ScheduledTaskAction -Execute $PythonW -Argument $BackupScript -WorkingDirectory $WorkingDir
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Daily automated backup of Neon PostgreSQL database for QuestionGen" -Force

Write-Host "Task '$TaskName' registered successfully!"
