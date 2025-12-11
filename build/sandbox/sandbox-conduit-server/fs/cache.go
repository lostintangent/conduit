package fs

import (
	"container/list"
	"sync"
	"time"

	"sandbox-ipc-provider-go/types"
)

// CacheEntry holds cached directory entries with metadata.
type CacheEntry struct {
	Entries   []types.DirectoryEntry
	Version   int
	Timestamp time.Time
}

// DirectoryCache is an LRU cache for directory listings.
type DirectoryCache struct {
	maxSize int
	cache   map[string]*list.Element
	lru     *list.List
	mu      sync.RWMutex

	// Change listeners
	listeners   []func(path string, entry *CacheEntry)
	listenersMu sync.RWMutex
}

type cacheItem struct {
	path  string
	entry *CacheEntry
}

// NewDirectoryCache creates a new directory cache with the given max size.
func NewDirectoryCache(maxSize int) *DirectoryCache {
	return &DirectoryCache{
		maxSize:   maxSize,
		cache:     make(map[string]*list.Element),
		lru:       list.New(),
		listeners: make([]func(path string, entry *CacheEntry), 0),
	}
}

// Get retrieves a cached entry.
func (c *DirectoryCache) Get(dirPath string) *CacheEntry {
	c.mu.Lock()
	defer c.mu.Unlock()

	if elem, ok := c.cache[dirPath]; ok {
		// Move to front (most recently used)
		c.lru.MoveToFront(elem)
		return elem.Value.(*cacheItem).entry
	}

	return nil
}

// Set stores or updates a cache entry.
func (c *DirectoryCache) Set(dirPath string, entries []types.DirectoryEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var entry *CacheEntry

	if elem, ok := c.cache[dirPath]; ok {
		// Update existing entry
		item := elem.Value.(*cacheItem)
		item.entry.Entries = entries
		item.entry.Version++
		item.entry.Timestamp = time.Now()
		entry = item.entry
		c.lru.MoveToFront(elem)
	} else {
		// Evict if at capacity
		if c.lru.Len() >= c.maxSize {
			c.evictLRU()
		}

		// Add new entry
		entry = &CacheEntry{
			Entries:   entries,
			Version:   1,
			Timestamp: time.Now(),
		}
		elem := c.lru.PushFront(&cacheItem{
			path:  dirPath,
			entry: entry,
		})
		c.cache[dirPath] = elem
	}

	// Notify listeners (outside lock to avoid deadlock)
	c.notifyListeners(dirPath, entry)
}

// Has checks if a path is in the cache.
func (c *DirectoryCache) Has(dirPath string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.cache[dirPath]
	return ok
}

// GetVersion returns the version of a cached entry.
func (c *DirectoryCache) GetVersion(dirPath string) int {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if elem, ok := c.cache[dirPath]; ok {
		return elem.Value.(*cacheItem).entry.Version
	}
	return 0
}

// AddEntry adds a single entry to a cached directory.
func (c *DirectoryCache) AddEntry(dirPath string, entry types.DirectoryEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, ok := c.cache[dirPath]
	if !ok {
		return
	}

	item := elem.Value.(*cacheItem)
	cached := item.entry

	// Remove existing entry with same name
	entries := make([]types.DirectoryEntry, 0, len(cached.Entries)+1)
	for _, e := range cached.Entries {
		if e.Name != entry.Name {
			entries = append(entries, e)
		}
	}
	entries = append(entries, entry)

	// Sort: directories first, then alphabetically
	sortEntries(entries)

	cached.Entries = entries
	cached.Version++
	cached.Timestamp = time.Now()

	c.notifyListeners(dirPath, cached)
}

// RemoveEntry removes a single entry from a cached directory.
func (c *DirectoryCache) RemoveEntry(dirPath, entryName string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, ok := c.cache[dirPath]
	if !ok {
		return
	}

	item := elem.Value.(*cacheItem)
	cached := item.entry

	entries := make([]types.DirectoryEntry, 0, len(cached.Entries))
	removed := false
	for _, e := range cached.Entries {
		if e.Name != entryName {
			entries = append(entries, e)
		} else {
			removed = true
		}
	}

	if removed {
		cached.Entries = entries
		cached.Version++
		cached.Timestamp = time.Now()
		c.notifyListeners(dirPath, cached)
	}
}

// Invalidate increments the version without changing entries.
func (c *DirectoryCache) Invalidate(dirPath string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if elem, ok := c.cache[dirPath]; ok {
		item := elem.Value.(*cacheItem)
		item.entry.Version++
		item.entry.Timestamp = time.Now()
		c.notifyListeners(dirPath, item.entry)
	}
}

// Delete removes an entry from the cache.
func (c *DirectoryCache) Delete(dirPath string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if elem, ok := c.cache[dirPath]; ok {
		c.lru.Remove(elem)
		delete(c.cache, dirPath)
		c.notifyListeners(dirPath, nil)
	}
}

// Clear removes all entries from the cache.
func (c *DirectoryCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	paths := make([]string, 0, len(c.cache))
	for path := range c.cache {
		paths = append(paths, path)
	}

	c.cache = make(map[string]*list.Element)
	c.lru = list.New()

	for _, path := range paths {
		c.notifyListeners(path, nil)
	}
}

// Size returns the number of entries in the cache.
func (c *DirectoryCache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lru.Len()
}

// Subscribe adds a listener for cache changes.
func (c *DirectoryCache) Subscribe(listener func(path string, entry *CacheEntry)) func() {
	c.listenersMu.Lock()
	c.listeners = append(c.listeners, listener)
	index := len(c.listeners) - 1
	c.listenersMu.Unlock()

	// Return unsubscribe function
	return func() {
		c.listenersMu.Lock()
		defer c.listenersMu.Unlock()
		// Set to nil instead of removing to preserve indices
		if index < len(c.listeners) {
			c.listeners[index] = nil
		}
	}
}

func (c *DirectoryCache) evictLRU() {
	elem := c.lru.Back()
	if elem == nil {
		return
	}

	item := elem.Value.(*cacheItem)
	c.lru.Remove(elem)
	delete(c.cache, item.path)
}

func (c *DirectoryCache) notifyListeners(path string, entry *CacheEntry) {
	c.listenersMu.RLock()
	defer c.listenersMu.RUnlock()

	for _, listener := range c.listeners {
		if listener != nil {
			listener(path, entry)
		}
	}
}

func sortEntries(entries []types.DirectoryEntry) {
	// Simple bubble sort for small arrays
	n := len(entries)
	for i := 0; i < n-1; i++ {
		for j := 0; j < n-i-1; j++ {
			if shouldSwap(entries[j], entries[j+1]) {
				entries[j], entries[j+1] = entries[j+1], entries[j]
			}
		}
	}
}

func shouldSwap(a, b types.DirectoryEntry) bool {
	// Directories before files
	if a.Type != b.Type {
		return a.Type == "file" // swap if a is file and b is directory
	}
	// Alphabetical (case-insensitive)
	return a.Name > b.Name
}
