# Conduit shell integration for PowerShell
# This script emits OSC 7 sequences to report the current working directory

function __conduit_osc7 {
  $host.UI.Write([char]27 + "]7;file://$env:COMPUTERNAME$((Get-Location).Path)" + [char]7)
}

# Save original prompt function if it exists
if (Test-Path Function:\prompt) {
  $script:originalPrompt = Get-Content Function:\prompt
}

function global:prompt {
  __conduit_osc7
  if ($script:originalPrompt) {
    & $script:originalPrompt
  } else {
    "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
  }
}
