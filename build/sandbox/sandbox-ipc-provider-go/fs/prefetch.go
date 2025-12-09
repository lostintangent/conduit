package fs

import (
	"path/filepath"
	"sync"
	"sync/atomic"

	"sandbox-ipc-provider-go/types"
)

const (
	// MaxConcurrentPrefetch limits simultaneous prefetch operations
	MaxConcurrentPrefetch = 10
)

// Prefetcher handles background prefetching of directory contents
type Prefetcher struct {
	provider    *Provider
	cache       *DirectoryCache
	semaphore   chan struct{} // Limits concurrent prefetches
	inProgress  sync.Map      // Tracks directories being prefetched
	prefetching atomic.Int32  // Count of active prefetch operations
}

// NewPrefetcher creates a new prefetcher
func NewPrefetcher(provider *Provider, cache *DirectoryCache) *Prefetcher {
	return &Prefetcher{
		provider:  provider,
		cache:     cache,
		semaphore: make(chan struct{}, MaxConcurrentPrefetch),
	}
}

// PrefetchChildren prefetches child directories of the given path
// This is called after a successful readDirectory to preemptively cache
// child directories for faster navigation
func (p *Prefetcher) PrefetchChildren(parentPath string, entries []types.DirectoryEntry) {
	// Collect directories to prefetch
	var dirsToFetch []string

	for _, entry := range entries {
		// Only prefetch directories
		if entry.Type != "directory" {
			continue
		}

		// Build child path
		childPath := filepath.Join(parentPath, entry.Name)

		// Skip if already cached
		if p.cache.Get(childPath) != nil {
			continue
		}

		// Skip if already being prefetched
		if _, loaded := p.inProgress.LoadOrStore(childPath, true); loaded {
			continue
		}

		dirsToFetch = append(dirsToFetch, childPath)
	}

	// Prefetch each directory in background
	for _, dirPath := range dirsToFetch {
		go p.prefetchDirectory(dirPath)
	}
}

// prefetchDirectory fetches a single directory in the background
func (p *Prefetcher) prefetchDirectory(path string) {
	// Acquire semaphore slot
	p.semaphore <- struct{}{}
	p.prefetching.Add(1)

	defer func() {
		p.prefetching.Add(-1)
		<-p.semaphore                // Release semaphore slot
		p.inProgress.Delete(path)    // Remove from in-progress
	}()

	// Read the directory
	entries, err := p.provider.ReadDirectory(path)
	if err != nil {
		// Silently ignore errors for prefetch - it's best-effort
		return
	}

	// Cache the result
	p.cache.Set(path, entries)
}

// ActiveCount returns the number of active prefetch operations
func (p *Prefetcher) ActiveCount() int32 {
	return p.prefetching.Load()
}
