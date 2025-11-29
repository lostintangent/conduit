# Conduit shell integration for PowerShell
# This script emits OSC 7 sequences to report the current working directory

# Cache for deduping
$script:Conduit_LastPath = $null

function global:Write-Osc7Cwd {
    $p = $ExecutionContext.SessionState.Path.CurrentLocation
    if ($p.Provider.Name -ne 'FileSystem') { return }

    # Normalize path for the URI
    $providerPath = $p.ProviderPath -replace '\\','/'

    # Pick a hostname
    $hostName = $env:HOSTNAME
    if (-not $hostName) { $hostName = $env:COMPUTERNAME }
    if (-not $hostName) { $hostName = 'localhost' }

    # Only emit if path changed
    if ($providerPath -eq $script:Conduit_LastPath) { return }
    $script:Conduit_LastPath = $providerPath

    $esc = [char]27
    # ESC ] 7 ; file://host/path ESC \
    [Console]::Write("$esc]7;file://$hostName/$providerPath$esc\")
}

# Capture any existing prompt implementation
$script:Conduit_OldPrompt = $null
if (Test-Path Function:\prompt) {
    $script:Conduit_OldPrompt = (Get-Item Function:\prompt).ScriptBlock
}

function global:prompt {
    # Emit OSC 7 for the current CWD
    Write-Osc7Cwd

    if ($script:Conduit_OldPrompt) {
        # Call the old prompt so we don't break themes
        & $script:Conduit_OldPrompt
    } else {
        # Fallback to something close to the built-in prompt
        $p = $ExecutionContext.SessionState.Path.CurrentLocation
        "PS $p$('>' * ($nestedPromptLevel + 1)) "
    }
}
