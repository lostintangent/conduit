# Source the user's .bashrc if it exists to preserve their environment
[[ -r ~/.bashrc ]] && . ~/.bashrc

__conduit_osc7() {
  # Keep symlinks by using $PWD, not $(pwd -P)
  local host=${HOSTNAME:-$(hostname 2>/dev/null || echo localhost)}
  printf '\033]7;file://%s%s\033\\' "$host" "$PWD"
}

# Append to PROMPT_COMMAND if present, otherwise set it.
PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}__conduit_osc7"

# If the copilot command is not available, define a wrapper function
# that prompts the user to install GitHub Copilot CLI
if ! command -v copilot &>/dev/null; then
  copilot() {
    local response
    echo "The GitHub Copilot CLI is not installed."
    read -r -p "Would you like to install it? (Y/n) " response
    # Match 'Y', 'y', or empty string (Enter key)
    if [[ -z "$response" || "$response" == [Yy] ]]; then
      if npm install -g @github/copilot; then
        # Remove this wrapper function so the real copilot takes precedence
        unset -f copilot
        # Run the real copilot command with any arguments that were passed
        copilot "$@"
      fi
    fi
  }
fi
