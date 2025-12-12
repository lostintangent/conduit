// Package git provides git operations using the git CLI.
package git

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"sandbox-conduit-server/types"
)

// Provider implements git operations using the git CLI.
type Provider struct {
	gitRoot string
	cwd     string
}

// NewProvider creates a new git provider.
// gitRoot is the repository root directory (contains .git/).
// cwd is the working directory for relative path resolution.
func NewProvider(gitRoot, cwd string) (*Provider, error) {
	absGitRoot, err := filepath.Abs(gitRoot)
	if err != nil {
		return nil, err
	}

	absCwd, err := filepath.Abs(cwd)
	if err != nil {
		return nil, err
	}

	// Verify this is a git repository
	if _, err := os.Stat(filepath.Join(absGitRoot, ".git")); err != nil {
		return nil, fmt.Errorf("not a git repository: %s", absGitRoot)
	}

	return &Provider{
		gitRoot: absGitRoot,
		cwd:     absCwd,
	}, nil
}

// GitRoot returns the git repository root.
func (p *Provider) GitRoot() string {
	return p.gitRoot
}

// CWD returns the working directory.
func (p *Provider) CWD() string {
	return p.cwd
}

// ============================================================================
// Git Command Execution
// ============================================================================

// runGit executes a git command and returns stdout.
func (p *Provider) runGit(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = p.gitRoot

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), stderr.String())
	}

	return stdout.String(), nil
}

// ============================================================================
// State Queries
// ============================================================================

// GetStatus returns the complete repository status.
func (p *Provider) GetStatus() (*types.GitStatus, error) {
	// Get porcelain status
	// --untracked-files=all ensures we list individual files in untracked directories
	// instead of just showing the directory with a trailing slash
	output, err := p.runGit("status", "--porcelain=v2", "--branch", "--untracked-files=all")
	if err != nil {
		return nil, err
	}

	status := &types.GitStatus{
		Files: make(map[string]types.GitFileStatus),
	}

	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()

		// Parse branch header lines
		if strings.HasPrefix(line, "# branch.head ") {
			status.Branch = strings.TrimPrefix(line, "# branch.head ")
		} else if strings.HasPrefix(line, "# branch.upstream ") {
			status.Upstream = strings.TrimPrefix(line, "# branch.upstream ")
		} else if strings.HasPrefix(line, "# branch.ab ") {
			// Format: # branch.ab +<ahead> -<behind>
			parts := strings.Fields(line)
			if len(parts) >= 4 {
				if ahead, err := strconv.Atoi(strings.TrimPrefix(parts[2], "+")); err == nil {
					status.Ahead = ahead
				}
				if behind, err := strconv.Atoi(strings.TrimPrefix(parts[3], "-")); err == nil {
					status.Behind = behind
				}
			}
		} else if strings.HasPrefix(line, "1 ") || strings.HasPrefix(line, "2 ") {
			// Ordinary or renamed/copied entry
			fileStatus := p.parseStatusLine(line)
			if fileStatus != nil {
				status.Files[fileStatus.Path] = *fileStatus
			}
		} else if strings.HasPrefix(line, "? ") {
			// Untracked file
			path := strings.TrimPrefix(line, "? ")
			status.Files[path] = types.GitFileStatus{
				Path:   path,
				Status: types.GitStatusUntracked,
				Staged: false,
			}
		} else if strings.HasPrefix(line, "! ") {
			// Ignored file (not usually in output unless --ignored)
			path := strings.TrimPrefix(line, "! ")
			status.Files[path] = types.GitFileStatus{
				Path:   path,
				Status: types.GitStatusIgnored,
				Staged: false,
			}
		} else if strings.HasPrefix(line, "u ") {
			// Unmerged entry
			parts := strings.Fields(line)
			if len(parts) >= 11 {
				path := parts[10]
				status.Files[path] = types.GitFileStatus{
					Path:   path,
					Status: types.GitStatusUnmerged,
					Staged: false,
				}
			}
		}
	}

	// Default branch if not found
	if status.Branch == "" {
		status.Branch = "HEAD"
	}

	return status, nil
}

// parseStatusLine parses a porcelain v2 ordinary or renamed entry.
func (p *Provider) parseStatusLine(line string) *types.GitFileStatus {
	parts := strings.Fields(line)
	if len(parts) < 9 {
		return nil
	}

	// Format: <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
	// For renamed: <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path> <origPath>
	xy := parts[1] // Index and worktree status

	var path string
	var originalPath string

	if parts[0] == "2" {
		// Renamed/copied entry
		if len(parts) >= 10 {
			path = parts[9]
			if len(parts) >= 11 {
				originalPath = parts[10]
			}
		}
	} else {
		// Ordinary entry
		path = parts[8]
	}

	if path == "" {
		return nil
	}

	// Determine status from XY codes
	// X = index status, Y = worktree status
	indexStatus := rune(xy[0])
	worktreeStatus := rune(xy[1])

	var statusCode types.GitFileStatusCode
	var staged bool

	// Prioritize staged status
	switch indexStatus {
	case 'A':
		statusCode = types.GitStatusAdded
		staged = true
	case 'M':
		statusCode = types.GitStatusModified
		staged = true
	case 'D':
		statusCode = types.GitStatusDeleted
		staged = true
	case 'R':
		statusCode = types.GitStatusRenamed
		staged = true
	case 'C':
		statusCode = types.GitStatusCopied
		staged = true
	default:
		// Check worktree status
		switch worktreeStatus {
		case 'M':
			statusCode = types.GitStatusModified
		case 'D':
			statusCode = types.GitStatusDeleted
		case 'A':
			statusCode = types.GitStatusAdded
		default:
			statusCode = types.GitStatusModified // Default
		}
	}

	return &types.GitFileStatus{
		Path:         path,
		Status:       statusCode,
		Staged:       staged,
		OriginalPath: originalPath,
	}
}

// GetFileStatus returns status for a specific file.
func (p *Provider) GetFileStatus(filePath string) (*types.GitFileStatus, error) {
	status, err := p.GetStatus()
	if err != nil {
		return nil, err
	}

	relativePath := p.toRelativePath(filePath)
	if fileStatus, ok := status.Files[relativePath]; ok {
		return &fileStatus, nil
	}

	return nil, nil // File is clean
}

// GetCurrentBranch returns the current branch name.
func (p *Provider) GetCurrentBranch() (string, error) {
	output, err := p.runGit("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(output), nil
}

// GetBranches returns all branches (local and remote).
func (p *Provider) GetBranches() ([]types.GitBranch, error) {
	output, err := p.runGit(
		"for-each-ref",
		"--sort=-committerdate",
		"--format=%(refname:short)|%(refname)|%(committerdate:unix)|%(objectname:short)|%(subject)|%(HEAD)",
		"refs/heads/",
		"refs/remotes/",
	)
	if err != nil {
		return nil, err
	}

	var branches []types.GitBranch
	scanner := bufio.NewScanner(strings.NewReader(output))

	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, "|")
		if len(parts) < 5 {
			continue
		}

		name := strings.TrimSpace(parts[0])
		fullRefname := strings.TrimSpace(parts[1])
		dateStr := strings.TrimSpace(parts[2])
		commit := strings.TrimSpace(parts[3])
		message := strings.TrimSpace(parts[4])
		isCurrentMarker := ""
		if len(parts) >= 6 {
			isCurrentMarker = strings.TrimSpace(parts[5])
		}

		if name == "" || name == "HEAD" || strings.Contains(name, "HEAD") {
			continue
		}

		isRemote := strings.HasPrefix(fullRefname, "refs/remotes/")
		isCurrent := isCurrentMarker == "*"

		var lastCommitDate int64
		if dateUnix, err := strconv.ParseInt(dateStr, 10, 64); err == nil {
			lastCommitDate = dateUnix * 1000 // Convert to ms
		}

		branches = append(branches, types.GitBranch{
			Name:              name,
			IsRemote:          isRemote,
			IsCurrent:         isCurrent,
			Commit:            commit,
			LastCommitDate:    lastCommitDate,
			LastCommitMessage: message,
		})
	}

	return branches, nil
}

// GetFileDiff returns the diff for a specific file.
func (p *Provider) GetFileDiff(filePath string, staged bool) (string, error) {
	relativePath := p.toRelativePath(filePath)

	var args []string
	if staged {
		args = []string{"diff", "--cached", "--", relativePath}
	} else {
		args = []string{"diff", "--", relativePath}
	}

	return p.runGit(args...)
}

// GetFileAtRef returns file content at a specific ref.
func (p *Provider) GetFileAtRef(filePath, ref string) (string, error) {
	relativePath := p.toRelativePath(filePath)
	return p.runGit("show", fmt.Sprintf("%s:%s", ref, relativePath))
}

// HasUncommittedChanges checks if there are uncommitted changes.
func (p *Provider) HasUncommittedChanges() (bool, error) {
	status, err := p.GetStatus()
	if err != nil {
		return false, err
	}
	return len(status.Files) > 0, nil
}

// HasUnpushedCommits checks if there are commits not pushed to upstream.
func (p *Provider) HasUnpushedCommits() (bool, error) {
	status, err := p.GetStatus()
	if err != nil {
		return false, err
	}
	return status.Ahead > 0, nil
}

// GetChangedFilesFromBranch returns files changed between HEAD and a base branch.
func (p *Provider) GetChangedFilesFromBranch(baseBranch string) ([]string, error) {
	// Get merge base
	mergeBase, err := p.runGit("merge-base", "HEAD", baseBranch)
	if err != nil {
		return nil, err
	}

	// Get files changed since merge base
	output, err := p.runGit("diff", "--name-only", strings.TrimSpace(mergeBase), "HEAD")
	if err != nil {
		return nil, err
	}

	var files []string
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		if line := strings.TrimSpace(scanner.Text()); line != "" {
			files = append(files, line)
		}
	}

	return files, nil
}

// GetStatusFromBranch returns status relative to a base branch.
func (p *Provider) GetStatusFromBranch(baseBranch string) (map[string]types.GitFileStatus, error) {
	statusMap := make(map[string]types.GitFileStatus)

	// Get merge base
	mergeBase, err := p.runGit("merge-base", "HEAD", baseBranch)
	if err != nil {
		return statusMap, nil // Return empty on error
	}

	// Get files changed with status
	output, err := p.runGit("diff", "--name-status", strings.TrimSpace(mergeBase), "HEAD")
	if err != nil {
		return statusMap, nil
	}

	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}

		statusCode := strings.TrimSpace(parts[0])
		filePath := strings.TrimSpace(parts[1])
		if len(parts) >= 3 {
			filePath = strings.TrimSpace(parts[2]) // For renames, use new path
		}

		if filePath == "" {
			continue
		}

		var status types.GitFileStatusCode
		switch {
		case strings.HasPrefix(statusCode, "A"):
			status = types.GitStatusAdded
		case strings.HasPrefix(statusCode, "D"):
			status = types.GitStatusDeleted
		case strings.HasPrefix(statusCode, "M"):
			status = types.GitStatusModified
		case strings.HasPrefix(statusCode, "R"):
			status = types.GitStatusRenamed
		case strings.HasPrefix(statusCode, "C"):
			status = types.GitStatusCopied
		default:
			status = types.GitStatusModified
		}

		statusMap[filePath] = types.GitFileStatus{
			Path:   filePath,
			Status: status,
			Staged: true, // Changes in commits are "staged"
		}
	}

	// Overlay working tree changes
	currentStatus, err := p.GetStatus()
	if err == nil {
		for path, fs := range currentStatus.Files {
			statusMap[path] = fs
		}
	}

	return statusMap, nil
}

// GetUncommittedDiffStats returns diff statistics for uncommitted changes.
func (p *Provider) GetUncommittedDiffStats() (*types.GitDiffStats, error) {
	output, err := p.runGit("diff", "--numstat", "HEAD")
	if err != nil {
		// May fail on empty repo, return zeros
		return &types.GitDiffStats{}, nil
	}

	stats := &types.GitDiffStats{}
	scanner := bufio.NewScanner(strings.NewReader(output))

	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}

		if parts[0] != "-" {
			if added, err := strconv.Atoi(parts[0]); err == nil {
				stats.Added += added
			}
		}
		if parts[1] != "-" {
			if removed, err := strconv.Atoi(parts[1]); err == nil {
				stats.Removed += removed
			}
		}
		stats.Files++
	}

	return stats, nil
}

// GetMostRecentDirtyFile returns the most recently modified dirty file.
func (p *Provider) GetMostRecentDirtyFile() (string, error) {
	status, err := p.GetStatus()
	if err != nil {
		return "", err
	}

	if len(status.Files) == 0 {
		return "", nil
	}

	var mostRecent string
	var mostRecentMtime time.Time

	for path := range status.Files {
		absPath := filepath.Join(p.gitRoot, path)
		info, err := os.Stat(absPath)
		if err != nil {
			continue // File might be deleted
		}
		if mostRecent == "" || info.ModTime().After(mostRecentMtime) {
			mostRecent = path
			mostRecentMtime = info.ModTime()
		}
	}

	return mostRecent, nil
}

// GetMostRecentCommittedFile returns the most recently modified file from commits.
func (p *Provider) GetMostRecentCommittedFile(commitLimit int) (string, error) {
	if commitLimit <= 0 {
		commitLimit = 10
	}

	// Get files from recent commits
	output, err := p.runGit("log", fmt.Sprintf("--max-count=%d", commitLimit), "--name-only", "--pretty=format:")
	if err != nil {
		return "", err
	}

	// Collect unique files
	filesSet := make(map[string]bool)
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		if line := strings.TrimSpace(scanner.Text()); line != "" {
			filesSet[line] = true
		}
	}

	if len(filesSet) == 0 {
		return "", nil
	}

	// Find most recently modified
	var mostRecent string
	var mostRecentMtime time.Time

	for path := range filesSet {
		absPath := filepath.Join(p.gitRoot, path)
		info, err := os.Stat(absPath)
		if err != nil {
			continue // File might not exist
		}
		if mostRecent == "" || info.ModTime().After(mostRecentMtime) {
			mostRecent = path
			mostRecentMtime = info.ModTime()
		}
	}

	return mostRecent, nil
}

// ============================================================================
// Operations
// ============================================================================

// Stage stages files for commit.
func (p *Provider) Stage(files []string) error {
	relativePaths := make([]string, len(files))
	for i, f := range files {
		relativePaths[i] = p.toRelativePath(f)
	}

	args := append([]string{"add", "--"}, relativePaths...)
	_, err := p.runGit(args...)
	return err
}

// Unstage unstages files (removes from index).
func (p *Provider) Unstage(files []string) error {
	relativePaths := make([]string, len(files))
	for i, f := range files {
		relativePaths[i] = p.toRelativePath(f)
	}

	args := append([]string{"reset", "HEAD", "--"}, relativePaths...)
	_, err := p.runGit(args...)
	return err
}

// Commit creates a commit.
func (p *Provider) Commit(message string, options *types.GitCommitOptions) (*types.GitCommit, error) {
	args := []string{"commit", "-m", message}

	if options != nil {
		if options.Amend {
			args = append(args, "--amend")
		}
		if options.Signoff {
			args = append(args, "--signoff")
		}
		if len(options.Files) > 0 {
			relativePaths := make([]string, len(options.Files))
			for i, f := range options.Files {
				relativePaths[i] = p.toRelativePath(f)
			}
			args = append(args, "--")
			args = append(args, relativePaths...)
		}
	}

	_, err := p.runGit(args...)
	if err != nil {
		return nil, err
	}

	// Get the created commit
	return p.getLatestCommit()
}

// getLatestCommit returns the most recent commit.
func (p *Provider) getLatestCommit() (*types.GitCommit, error) {
	output, err := p.runGit("log", "-1", "--format=%H|%h|%an|%ae|%at|%s")
	if err != nil {
		return nil, err
	}

	parts := strings.SplitN(strings.TrimSpace(output), "|", 6)
	if len(parts) < 6 {
		return nil, fmt.Errorf("invalid commit format")
	}

	dateUnix, _ := strconv.ParseInt(parts[4], 10, 64)

	return &types.GitCommit{
		Hash:      parts[0],
		ShortHash: parts[1],
		Author:    parts[2],
		Email:     parts[3],
		Date:      dateUnix * 1000, // Convert to ms
		Message:   parts[5],
		Parents:   []string{}, // Could parse with %P if needed
	}, nil
}

// Checkout checks out a branch or ref.
func (p *Provider) Checkout(ref string) error {
	_, err := p.runGit("checkout", ref)
	return err
}

// Revert discards local modifications to files.
func (p *Provider) Revert(files []string) error {
	relativePaths := make([]string, len(files))
	for i, f := range files {
		relativePaths[i] = p.toRelativePath(f)
	}

	// First unstage any staged changes
	unstageArgs := append([]string{"reset", "HEAD", "--"}, relativePaths...)
	p.runGit(unstageArgs...) // Ignore errors

	// Then checkout to discard working tree changes
	checkoutArgs := append([]string{"checkout", "--"}, relativePaths...)
	_, err := p.runGit(checkoutArgs...)
	return err
}

// ============================================================================
// Helpers
// ============================================================================

// toRelativePath converts an absolute path to a path relative to git root.
func (p *Provider) toRelativePath(absPath string) string {
	if filepath.IsAbs(absPath) {
		if rel, err := filepath.Rel(p.gitRoot, absPath); err == nil {
			return rel
		}
	}
	return absPath // Already relative
}

// FindGitRoot finds the git repository root from a given path.
func FindGitRoot(startPath string) (string, error) {
	absPath, err := filepath.Abs(startPath)
	if err != nil {
		return "", err
	}

	current := absPath
	for {
		gitDir := filepath.Join(current, ".git")
		if info, err := os.Stat(gitDir); err == nil && (info.IsDir() || info.Mode().IsRegular()) {
			return current, nil
		}

		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}

	return "", fmt.Errorf("not a git repository: %s", startPath)
}

// ============================================================================
// Patch Operations
// ============================================================================

// ApplyPatches applies staged, unstaged, and untracked patches atomically.
// Each patch is expected to be base64-encoded diff content.
// The operation preserves staging state: staged patches are applied and staged,
// unstaged patches remain in working tree only, untracked files stay untracked.
func (p *Provider) ApplyPatches(request *types.ApplyPatchesRequest) (*types.ApplyPatchesResult, error) {
	result := &types.ApplyPatchesResult{
		Success: false,
		Applied: []string{},
	}

	var totalFilesAffected int

	// Helper to write patch to temp file
	writePatch := func(name string, base64Content string) (string, error) {
		decoded, err := base64Decode(base64Content)
		if err != nil {
			return "", fmt.Errorf("failed to decode %s patch: %w", name, err)
		}
		
		tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("conduit-%s-%d.patch", name, time.Now().UnixNano()))
		if err := os.WriteFile(tmpFile, decoded, 0644); err != nil {
			return "", fmt.Errorf("failed to write %s patch: %w", name, err)
		}
		return tmpFile, nil
	}

	// Helper to count files in a patch using git apply --numstat
	countPatchFiles := func(patchPath string) (int, []string, error) {
		output, err := p.runGit("apply", "--numstat", patchPath)
		if err != nil {
			return 0, nil, nil // Not a fatal error, just can't count
		}
		
		var files []string
		scanner := bufio.NewScanner(strings.NewReader(output))
		for scanner.Scan() {
			parts := strings.Split(scanner.Text(), "\t")
			if len(parts) >= 3 {
				files = append(files, parts[2])
			}
		}
		return len(files), files, nil
	}

	// Helper to clean up temp files
	var tempFiles []string
	defer func() {
		for _, f := range tempFiles {
			os.Remove(f)
		}
	}()

	// Apply staged patch first (apply + stage affected files)
	if request.Staged != "" {
		patchPath, err := writePatch("staged", request.Staged)
		if err != nil {
			result.Error = err.Error()
			return result, nil
		}
		tempFiles = append(tempFiles, patchPath)

		// Get files that will be affected
		count, files, _ := countPatchFiles(patchPath)
		
		// Apply the patch
		if _, err := p.runGit("apply", patchPath); err != nil {
			result.Error = fmt.Sprintf("failed to apply staged patch: %v", err)
			return result, nil
		}

		// Stage the affected files
		if len(files) > 0 {
			args := append([]string{"add", "--"}, files...)
			if _, err := p.runGit(args...); err != nil {
				result.Error = fmt.Sprintf("failed to stage files after applying staged patch: %v", err)
				return result, nil
			}
		}

		result.Applied = append(result.Applied, "staged")
		totalFilesAffected += count
	}

	// Apply unstaged patch (working tree only, no staging)
	if request.Unstaged != "" {
		patchPath, err := writePatch("unstaged", request.Unstaged)
		if err != nil {
			result.Error = err.Error()
			return result, nil
		}
		tempFiles = append(tempFiles, patchPath)

		count, _, _ := countPatchFiles(patchPath)

		if _, err := p.runGit("apply", patchPath); err != nil {
			result.Error = fmt.Sprintf("failed to apply unstaged patch: %v", err)
			return result, nil
		}

		result.Applied = append(result.Applied, "unstaged")
		totalFilesAffected += count
	}

	// Apply untracked patch (new files, stay untracked)
	if request.Untracked != "" {
		patchPath, err := writePatch("untracked", request.Untracked)
		if err != nil {
			result.Error = err.Error()
			return result, nil
		}
		tempFiles = append(tempFiles, patchPath)

		count, _, _ := countPatchFiles(patchPath)

		if _, err := p.runGit("apply", patchPath); err != nil {
			result.Error = fmt.Sprintf("failed to apply untracked patch: %v", err)
			return result, nil
		}

		result.Applied = append(result.Applied, "untracked")
		totalFilesAffected += count
	}

	result.Success = true
	result.FilesAffected = totalFilesAffected
	return result, nil
}

// base64Decode decodes a base64 string to bytes.
// Supports both standard and URL-safe base64 encoding.
func base64Decode(s string) ([]byte, error) {
	// Try standard base64 first
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err == nil {
		return decoded, nil
	}
	// Try URL-safe base64
	return base64.URLEncoding.DecodeString(s)
}
