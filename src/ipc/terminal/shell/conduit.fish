# This script runs after the user's config.fish has been executed
# via fish's --init-command flag, so no need to source user config here.

# If the copilot command is not available, define a wrapper function
# that prompts the user to install GitHub Copilot CLI
if not type -q copilot
    function copilot
        printf "The GitHub Copilot CLI is not installed.\n"
        read -l -P "Would you like to install it? (Y/n) " response
        # Match 'Y', 'y', or empty string (Enter key)
        if test -z "$response" -o "$response" = Y -o "$response" = y
            if npm install -g @github/copilot
                # Remove this wrapper function so the real copilot takes precedence
                functions -e copilot
                # Run the real copilot command with any arguments that were passed
                copilot $argv
            end
        end
    end
end
