# Conduit shell integration for zsh
# This file is loaded when ZDOTDIR points to this directory

# Guard so we don't recurse
if [[ -z "$CONDUIT_ZSHENV_DONE" ]]; then
  export CONDUIT_ZSHENV_DONE=1

  # Restore the real ZDOTDIR so subsequent startup files come from there
  if [[ -n "$CONDUIT_ORIG_ZDOTDIR" ]]; then
    export ZDOTDIR=$CONDUIT_ORIG_ZDOTDIR
  else
    unset ZDOTDIR
  fi

  # Load user's real .zshenv if it exists
  if [[ -r ${ZDOTDIR:-$HOME}/.zshenv ]]; then
    . "${ZDOTDIR:-$HOME}/.zshenv"
  fi

  # Install OSC 7 hook for CWD reporting
  __conduit_osc7() {
    printf '\e]7;file://%s%s\a' "${HOST}" "${PWD}"
  }
  add-zsh-hook precmd __conduit_osc7
fi
