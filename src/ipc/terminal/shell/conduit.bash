# Conduit shell integration for bash
# This script emits OSC 7 sequences to report the current working directory

# Disable POSIX mode so bash behaves normally again
set +o posix

# Decide if this is a login shell
shopt -q login_shell && __conduit_is_login=1 || __conduit_is_login=0

# Source the standard bash startup files (from man bash: /etc/profile, ~/.bash_profile, ~/.bashrc, etc.)
if (( __conduit_is_login )); then
  for f in /etc/profile ~/.bash_profile ~/.bash_login ~/.profile; do
    [[ -r $f ]] && . "$f"
    # bash stops after the first readable user file in that list
    [[ $f == ~/.bash_profile || $f == ~/.bash_login || $f == ~/.profile ]] && break
  done
else
  [[ -r ~/.bashrc ]] && . ~/.bashrc
fi

__conduit_osc7() {
  # keep symlinks by using $PWD, not $(pwd -P)
  local host=${HOSTNAME:-$(hostname 2>/dev/null || echo localhost)}
  printf '\033]7;file://%s%s\033\\' "$host" "$PWD"
}

__conduit_prompt_command() {
  if [[ "$PWD" != "${__CONDUIT_LAST_PWD-}" ]]; then
    __conduit_osc7
    __CONDUIT_LAST_PWD=$PWD
  fi
}

# Append to PROMPT_COMMAND without clobbering user config.
# Need to handle string and array forms like vte.sh does.
if declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare \-a'; then
  PROMPT_COMMAND+=(__conduit_prompt_command)
elif [[ -n "${PROMPT_COMMAND-}" ]]; then
  PROMPT_COMMAND="__conduit_prompt_command;${PROMPT_COMMAND}"
else
  PROMPT_COMMAND=__conduit_prompt_command
fi
