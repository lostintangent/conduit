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
  if [[ "$VISUAL" == "conduit" ]]; then
    alias -s {md,json,yaml,yml,html,css,js,ts}=conduit
  fi

  # If the copilot command is not available, define a wrapper function
  # that prompts the user to install GitHub Copilot CLI
  if ! (( $+commands[copilot] )); then
    copilot() {
      local response
      echo "The GitHub Copilot CLI is not installed."
      echo -n "Would you like to install it? (Y/n) "
      read -r response
      # Match 'Y', 'y', or empty string (Enter key)
      if [[ -z "$response" || "$response" == [Yy] ]]; then
        if ! (( $+commands[npm] )); then
          echo "npm is required to install GitHub Copilot CLI but was not found in PATH." >&2
          return 1
        fi
        echo "Installing GitHub Copilot CLI..."
        if npm install -g @github/copilot; then
          echo "GitHub Copilot CLI installed successfully."
          # Remove this wrapper function so the real copilot takes precedence
          unfunction copilot
          # Refresh the command hash table so zsh finds the newly installed command
          rehash
          # Run the real copilot command with any arguments that were passed
          copilot "$@"
        else
          echo "Failed to install GitHub Copilot CLI." >&2
          return 1
        fi
      else
        echo "Installation cancelled."
        return 0
      fi
    }
  fi
fi
