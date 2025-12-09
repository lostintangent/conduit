// Package fs provides filesystem operations with caching and gitignore support.
package fs

import (
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"sandbox-ipc-provider-go/types"
)

// AlwaysHidden contains names that are always filtered from directory listings.
var AlwaysHidden = map[string]bool{
	".git":         true,
	"node_modules": true,
}

// Provider implements filesystem operations.
type Provider struct {
	cwd          string
	gitRoot      string
	gitRootFound bool
	ignorer      *GitIgnorer
}

// NewProvider creates a new filesystem provider.
func NewProvider(cwd string) (*Provider, error) {
	absPath, err := filepath.Abs(cwd)
	if err != nil {
		return nil, err
	}

	p := &Provider{
		cwd: absPath,
	}

	// Find git root and initialize ignorer
	gitRoot, err := findGitRoot(absPath)
	if err == nil && gitRoot != "" {
		p.gitRoot = gitRoot
		p.gitRootFound = true
		p.ignorer, _ = NewGitIgnorer(gitRoot)
	}

	return p, nil
}

// CWD returns the working directory.
func (p *Provider) CWD() string {
	return p.cwd
}

// Stat returns metadata for a file or directory.
func (p *Provider) Stat(path string) (*types.FileStat, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	fileType := "file"
	if info.IsDir() {
		fileType = "directory"
	}

	return &types.FileStat{
		Type:     fileType,
		Size:     info.Size(),
		Mtime:    info.ModTime().UnixMilli(),
		Ctime:    info.ModTime().UnixMilli(), // Go doesn't expose ctime on all platforms
		Readonly: info.Mode().Perm()&0200 == 0,
	}, nil
}

// ReadDirectory lists contents of a directory.
func (p *Provider) ReadDirectory(dirPath string) ([]types.DirectoryEntry, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	result := make([]types.DirectoryEntry, 0, len(entries))

	for _, entry := range entries {
		name := entry.Name()

		// Filter always-hidden entries
		if AlwaysHidden[name] {
			continue
		}

		// Filter gitignored entries
		if p.ignorer != nil {
			fullPath := filepath.Join(dirPath, name)
			relPath, err := filepath.Rel(p.gitRoot, fullPath)
			if err == nil && !strings.HasPrefix(relPath, "..") {
				if p.ignorer.IsIgnored(relPath, entry.IsDir()) {
					continue
				}
			}
		}

		entryType := "file"
		if entry.IsDir() {
			entryType = "directory"
		}

		result = append(result, types.DirectoryEntry{
			Name: name,
			Type: entryType,
		})
	}

	// Sort: directories first, then alphabetically
	sort.Slice(result, func(i, j int) bool {
		if result[i].Type != result[j].Type {
			return result[i].Type == "directory"
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})

	return result, nil
}

// ReadFile reads the complete contents of a file.
func (p *Provider) ReadFile(filePath string) ([]byte, error) {
	return os.ReadFile(filePath)
}

// WriteFile writes content to a file, creating parent directories if needed.
func (p *Provider) WriteFile(filePath string, content []byte) error {
	// Ensure parent directory exists
	parentDir := filepath.Dir(filePath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return err
	}

	return os.WriteFile(filePath, content, 0644)
}

// Delete removes a file or directory.
func (p *Provider) Delete(path string, opts *types.DeleteOptions) error {
	if opts != nil && opts.Recursive {
		return os.RemoveAll(path)
	}
	return os.Remove(path)
}

// Rename moves or renames a file or directory.
func (p *Provider) Rename(oldPath, newPath string) error {
	// Ensure parent directory of new path exists
	newParentDir := filepath.Dir(newPath)
	if err := os.MkdirAll(newParentDir, 0755); err != nil {
		return err
	}

	return os.Rename(oldPath, newPath)
}

// CreateDirectory creates a directory and any necessary parents.
func (p *Provider) CreateDirectory(dirPath string) error {
	return os.MkdirAll(dirPath, 0755)
}

// Exists checks if a path exists.
func (p *Provider) Exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// CopyFile copies a file from src to dst.
func (p *Provider) CopyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

// findGitRoot finds the git repository root for the given path.
func findGitRoot(path string) (string, error) {
	current := path
	for {
		gitDir := filepath.Join(current, ".git")
		if info, err := os.Stat(gitDir); err == nil && info.IsDir() {
			return current, nil
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached filesystem root
			return "", nil
		}
		current = parent
	}
}
