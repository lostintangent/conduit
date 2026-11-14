# Source the user's .bashrc if it exists to preserve their environment
[[ -r ~/.bashrc ]] && . ~/.bashrc

# Restore EDITOR/VISUAL after user's .bashrc has run
# This ensures Conduit overrides any EDITOR set in user's config
if [[ -n "$CONDUIT_EDITOR" ]]; then
  export EDITOR="$CONDUIT_EDITOR"
  export VISUAL="$CONDUIT_EDITOR"
fi

# Report current working directory via OSC 7
__conduit_osc7() {
  local host=${HOSTNAME:-$(hostname 2>/dev/null || echo localhost)}
  printf '\033]7;file://%s%s\033\\' "$host" "$PWD"
}

# Reset title to shell name and report CWD after command completes
__conduit_precmd() {
  printf '\033]2;%s\033\\' "bash"
  __conduit_osc7
}

# Report command name before execution via OSC 2 (window title)
__conduit_preexec() {
  [[ "$BASH_COMMAND" == __conduit_* ]] && return
  printf '\033]2;%s\033\\' "$BASH_COMMAND"
}

# Register shell integration hooks
PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}__conduit_precmd"

# If the copilot command is not available, define a wrapper function
# that prompts the user to install GitHub Copilot CLI
if ! command -v copilot &>/dev/null; then
  copilot() {
    local response
    echo "The GitHub Copilot CLI is not installed."
    read -r -p "Would you like to install it? (Y/n) " response
    if [[ -z "$response" || "$response" == [Yy] ]]; then
      if npm install -g @github/copilot; then
        unset -f copilot
        copilot "$@"
      fi
    fi
  }
fi

# Use DEBUG trap to report command before execution
# (placed at end to avoid trapping commands during script initialization)
trap '__conduit_preexec' DEBUG
