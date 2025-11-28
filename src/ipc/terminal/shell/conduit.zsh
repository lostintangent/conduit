# Conduit shell integration for zsh
# This script emits OSC 7 sequences to report the current working directory

# Restore original ZDOTDIR (saved by pty.ts before overriding) and source user's zshrc
# CONDUIT_ORIG_ZDOTDIR contains the user's original ZDOTDIR if it was set
local _user_zdotdir="${CONDUIT_ORIG_ZDOTDIR:-$HOME}"
ZDOTDIR="$_user_zdotdir"
unset CONDUIT_ORIG_ZDOTDIR
if [[ -f "${ZDOTDIR}/.zshrc" ]]; then
  source "${ZDOTDIR}/.zshrc"
fi

__conduit_osc7() {
  printf '\e]7;file://%s%s\a' "${HOST}" "${PWD}"
}

add-zsh-hook precmd __conduit_osc7
