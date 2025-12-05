# Source the user's config.fish if it exists to preserve their environment
if test -r ~/.config/fish/config.fish
    source ~/.config/fish/config.fish
end

# If the copilot command is not available, define a wrapper function
# that prompts the user to install GitHub Copilot CLI
if not type -q copilot
    function copilot
        echo "The GitHub Copilot CLI is not installed."
        echo -n "Would you like to install it? (Y/n) "
        read -l response
        # Match 'Y', 'y', or empty string (Enter key)
        if test -z "$response" -o "$response" = Y -o "$response" = y
            if not type -q npm
                echo "npm is required to install GitHub Copilot CLI but was not found in PATH." >&2
                return 1
            end
            if npm install -g @github/copilot
                # Remove this wrapper function so the real copilot takes precedence
                functions -e copilot
                # Run the real copilot command with any arguments that were passed
                copilot $argv
            end
        end
    end
end
