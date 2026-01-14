# This script runs after the user's config.fish has been executed
# via fish's --init-command flag, so no need to source user config here.

# Restore EDITOR/VISUAL after user's config.fish has run
# This ensures Conduit overrides any EDITOR set in user's config
if set -q CONDUIT_DESIRED_EDITOR
    set -gx EDITOR "$CONDUIT_DESIRED_EDITOR"
    set -gx VISUAL "$CONDUIT_DESIRED_EDITOR"
end

# If the copilot command is not available, define a wrapper function
# that prompts the user to install GitHub Copilot CLI
if not type -q copilot
    function copilot
        printf "The GitHub Copilot CLI is not installed.\n"
        read -P "Would you like to install it? (Y/n) " response
        if test -z "$response"; or string match -qi 'y' -- "$response"
            if npm install -g @github/copilot
                functions -e copilot
                copilot $argv
            end
        end
    end
end
