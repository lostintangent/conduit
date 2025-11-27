# Conduit shell integration for bash
# This script emits OSC 7 sequences to report the current working directory

__conduit_osc7() {
  printf '\e]7;file://%s%s\a' "${HOSTNAME}" "${PWD}"
}

PROMPT_COMMAND="__conduit_osc7${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
