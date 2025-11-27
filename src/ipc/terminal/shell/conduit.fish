# Conduit shell integration for fish
# This script emits OSC 7 sequences to report the current working directory

function __conduit_osc7 --on-event fish_prompt
  printf '\e]7;file://%s%s\a' (hostname) (pwd)
end
