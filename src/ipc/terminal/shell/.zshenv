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

# Restore EDITOR/VISUAL after shell startup completes
# This ensures Conduit overrides any EDITOR set in user's .zshrc
if [[ -n "$CONDUIT_EDITOR" ]]; then
  __conduit_restore_editor() {
    export EDITOR="$CONDUIT_EDITOR"
    export VISUAL="$CONDUIT_EDITOR"
    # Remove this hook after first run (one-shot)
    add-zsh-hook -d precmd __conduit_restore_editor
  }
  add-zsh-hook precmd __conduit_restore_editor
fi

# Configure suffix aliases to open common file types in Conduit
# when the "use Conduit as editor" setting is enabled
if [[ -n "$CONDUIT_EDITOR" ]]; then
  alias -s {md,json,yaml,yml,html,css,js,ts}="$CONDUIT_EDITOR"
fi

# If the copilot command is not available, define a wrapper function
# that prompts the user to install GitHub Copilot CLI
if ! (( $+commands[copilot] )); then
  copilot() {
    local response
    print "The GitHub Copilot CLI is not installed."
    read -rp "Would you like to install it? (Y/n) " response
    if [[ -z $response || $response == (#i)y ]]; then
      if npm install -g @github/copilot; then
        unfunction copilot
        copilot "$@"
      fi
    fi
  }
fi
