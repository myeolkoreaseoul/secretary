# activity_tracker.ps1 — Windows PowerShell activity logger
# Captures active window title every minute and sends to Supabase.
#
# Setup: Create a Windows Task Scheduler task:
#   Trigger: At logon, repeat every 1 minute
#   Action: powershell.exe -ExecutionPolicy Bypass -File "C:\path\to\activity_tracker.ps1"
#
# Environment variables required (set in system env or .env file):
#   SUPABASE_URL, SUPABASE_SERVICE_KEY

param(
    [int]$IntervalSeconds = 60,
    [switch]$SingleRun
)

$ErrorActionPreference = "Continue"

# Load config
$SUPABASE_URL = $env:SUPABASE_URL
$SUPABASE_KEY = $env:SUPABASE_SERVICE_KEY

if (-not $SUPABASE_URL -or -not $SUPABASE_KEY) {
    Write-Error "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"
    exit 1
}

$REST_URL = "$SUPABASE_URL/rest/v1/activity_logs"
$HEADERS = @{
    "apikey"        = $SUPABASE_KEY
    "Authorization" = "Bearer $SUPABASE_KEY"
    "Content-Type"  = "application/json; charset=utf-8"
    "Prefer"        = "return=minimal"
}

# Win32 API to get foreground window title
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError=true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

function Get-ActiveWindow {
    $hwnd = [WinAPI]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) { return $null }

    $sb = New-Object System.Text.StringBuilder 512
    [void][WinAPI]::GetWindowText($hwnd, $sb, 512)
    $title = $sb.ToString()

    $processId = 0
    [void][WinAPI]::GetWindowThreadProcessId($hwnd, [ref]$processId)

    $appName = ""
    try {
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($proc) { $appName = $proc.ProcessName }
    } catch {}

    return @{
        Title   = $title
        AppName = $appName
    }
}

function Send-Activity($title, $appName) {
    $body = @{
        window_title = $title
        app_name     = $appName
    } | ConvertTo-Json -Compress

    try {
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
        Invoke-RestMethod -Uri $REST_URL -Method Post -Headers $HEADERS -Body $bodyBytes | Out-Null
    } catch {
        Write-Warning "Failed to send: $_"
    }
}

# Main loop
Write-Host "Activity tracker started (interval: ${IntervalSeconds}s)"

do {
    $window = Get-ActiveWindow
    if ($window -and $window.Title) {
        Send-Activity $window.Title $window.AppName
        Write-Host "$(Get-Date -Format 'HH:mm:ss') [$($window.AppName)] $($window.Title.Substring(0, [Math]::Min(60, $window.Title.Length)))"
    }

    if (-not $SingleRun) {
        Start-Sleep -Seconds $IntervalSeconds
    }
} while (-not $SingleRun)
