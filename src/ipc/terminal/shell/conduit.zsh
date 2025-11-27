# Conduit shell integration for zsh
# This script emits OSC 7 sequences to report the current working directory

__conduit_osc7() {
  printf '\e]7;file://%s%s\a' "${HOST}" "${PWD}"
}

precmd_functions+=(__conduit_osc7)
