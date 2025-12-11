package fs

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// GitIgnorer handles gitignore pattern matching.
type GitIgnorer struct {
	gitRoot  string
	patterns []ignorePattern
}

type ignorePattern struct {
	pattern  string
	negation bool
	dirOnly  bool
}

// NewGitIgnorer creates a new gitignore handler for the given git root.
func NewGitIgnorer(gitRoot string) (*GitIgnorer, error) {
	g := &GitIgnorer{
		gitRoot:  gitRoot,
		patterns: make([]ignorePattern, 0),
	}

	// Load .gitignore from git root
	gitignorePath := filepath.Join(gitRoot, ".gitignore")
	if err := g.loadPatterns(gitignorePath); err != nil {
		// Not an error if .gitignore doesn't exist
		if !os.IsNotExist(err) {
			return nil, err
		}
	}

	return g, nil
}

func (g *GitIgnorer) loadPatterns(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		pattern := ignorePattern{}

		// Handle negation
		if strings.HasPrefix(line, "!") {
			pattern.negation = true
			line = line[1:]
		}

		// Handle directory-only patterns
		if strings.HasSuffix(line, "/") {
			pattern.dirOnly = true
			line = strings.TrimSuffix(line, "/")
		}

		pattern.pattern = line
		g.patterns = append(g.patterns, pattern)
	}

	return scanner.Err()
}

// IsIgnored checks if a path should be ignored based on gitignore patterns.
func (g *GitIgnorer) IsIgnored(relPath string, isDir bool) bool {
	if len(g.patterns) == 0 {
		return false
	}

	// Normalize path separators
	relPath = filepath.ToSlash(relPath)
	name := filepath.Base(relPath)

	ignored := false

	for _, p := range g.patterns {
		// Skip directory-only patterns for files
		if p.dirOnly && !isDir {
			continue
		}

		matched := false

		// Check various matching strategies
		if strings.Contains(p.pattern, "/") {
			// Pattern with path separator - match against full path
			matched = matchGlob(p.pattern, relPath)
		} else {
			// Simple pattern - match against name or any path component
			matched = matchGlob(p.pattern, name)
			if !matched {
				// Also try matching against path components
				parts := strings.Split(relPath, "/")
				for _, part := range parts {
					if matchGlob(p.pattern, part) {
						matched = true
						break
					}
				}
			}
		}

		if matched {
			ignored = !p.negation
		}
	}

	return ignored
}

// matchGlob performs simple glob matching.
func matchGlob(pattern, name string) bool {
	// Handle ** pattern (matches everything)
	if pattern == "**" {
		return true
	}

	// Handle **/name pattern
	if strings.HasPrefix(pattern, "**/") {
		suffix := pattern[3:]
		return matchGlob(suffix, name) || strings.HasSuffix(name, "/"+suffix)
	}

	// Handle *.ext pattern
	if strings.HasPrefix(pattern, "*.") {
		ext := pattern[1:] // includes the dot
		return strings.HasSuffix(name, ext)
	}

	// Handle simple * wildcard
	if strings.Contains(pattern, "*") {
		parts := strings.Split(pattern, "*")
		if len(parts) == 2 {
			return strings.HasPrefix(name, parts[0]) && strings.HasSuffix(name, parts[1])
		}
	}

	// Exact match
	return pattern == name
}
