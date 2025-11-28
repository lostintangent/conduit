# Conduit shell integration for bash
# This script emits OSC 7 sequences to report the current working directory

# Source user's bashrc first to preserve their settings
[[ -f ~/.bashrc ]] && source ~/.bashrc

__conduit_osc7() {
  printf '\e]7;file://%s%s\a' "${HOSTNAME}" "${PWD}"
}

PROMPT_COMMAND="__conduit_osc7${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
