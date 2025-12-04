# Source the user's .bashrc if it exists to preserve their environment
[[ -r ~/.bashrc ]] && . ~/.bashrc

__conduit_osc7() {
  # Keep symlinks by using $PWD, not $(pwd -P)
  local host=${HOSTNAME:-$(hostname 2>/dev/null || echo localhost)}
  printf '\033]7;file://%s%s\033\\' "$host" "$PWD"
}

# Append to PROMPT_COMMAND if present, otherwise set it.
PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}__conduit_osc7"
