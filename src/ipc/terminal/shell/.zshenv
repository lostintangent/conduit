# Ensure this script is only sourced once
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

  __conduit_osc7() {
    printf '\e]7;file://%s%s\a' "${HOST}" "${PWD}"
  }

  # Register hooks to run before each prompt and on directory change
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd __conduit_osc7
  add-zsh-hook chpwd __conduit_osc7

  # Configure suffix aliases to open common file types in Conduit
  # when the "use Conduit as editor" setting is enabled
  if [[ -n "$CONDUIT_USE_EDITOR" ]]; then
    alias -s md='conduit editor-open'
    alias -s json='conduit editor-open'
    alias -s yaml='conduit editor-open'
    alias -s yml='conduit editor-open'
    alias -s html='conduit editor-open'
    alias -s css='conduit editor-open'
    alias -s js='conduit editor-open'
    alias -s ts='conduit editor-open'
  fi
fi
