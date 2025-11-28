# Conduit shell integration for zsh
# This script emits OSC 7 sequences to report the current working directory

# Save original ZDOTDIR and restore it, then source user's zshrc
# This ensures user configs are loaded from their real home directory
local _conduit_orig_zdotdir="${ZDOTDIR:-}"
ZDOTDIR="$HOME"
if [[ -f "${ZDOTDIR}/.zshrc" ]]; then
  source "${ZDOTDIR}/.zshrc"
fi
[[ -n "$_conduit_orig_zdotdir" ]] && ZDOTDIR="$_conduit_orig_zdotdir" || unset ZDOTDIR

__conduit_osc7() {
  printf '\e]7;file://%s%s\a' "${HOST}" "${PWD}"
}

add-zsh-hook precmd __conduit_osc7
