package fs

import (
	"sync"
	"time"

	"sandbox-conduit-server/types"
)

const (
	// VerifyCacheCooldownMs is the minimum time between cache verifications for the same directory
	VerifyCacheCooldownMs = 2000
)

// CacheVerifier handles periodic verification of cached directory contents
type CacheVerifier struct {
	provider     *Provider
	cache        *DirectoryCache
	lastVerify   sync.Map // map[string]time.Time - last verification time per path
	onCacheStale func(path string, entries []types.DirectoryEntry) // Callback when cache is stale
}

// NewCacheVerifier creates a new cache verifier
func NewCacheVerifier(provider *Provider, cache *DirectoryCache) *CacheVerifier {
	return &CacheVerifier{
		provider: provider,
		cache:    cache,
	}
}

// SetStaleCallback sets the callback to invoke when cache becomes stale
func (v *CacheVerifier) SetStaleCallback(cb func(path string, entries []types.DirectoryEntry)) {
	v.onCacheStale = cb
}

// ScheduleVerify schedules a cache verification for the given path
// Respects the cooldown period to avoid excessive verification
func (v *CacheVerifier) ScheduleVerify(path string) {
	// Check cooldown
	if lastTime, ok := v.lastVerify.Load(path); ok {
		elapsed := time.Since(lastTime.(time.Time)).Milliseconds()
		if elapsed < VerifyCacheCooldownMs {
			// Still in cooldown, schedule for later
			remaining := time.Duration(VerifyCacheCooldownMs-elapsed) * time.Millisecond
			time.AfterFunc(remaining, func() {
				v.Verify(path)
			})
			return
		}
	}

	// Run verification in background
	go v.Verify(path)
}

// Verify checks if the cached directory contents match the actual filesystem
// If there's a mismatch, it updates the cache and invokes the stale callback
func (v *CacheVerifier) Verify(path string) {
	// Update last verify time
	v.lastVerify.Store(path, time.Now())

	// Get cached entries
	cached := v.cache.Get(path)
	if cached == nil {
		// Nothing to verify
		return
	}

	// Read fresh entries from filesystem
	freshEntries, err := v.provider.ReadDirectory(path)
	if err != nil {
		// Can't verify if we can't read - invalidate cache to be safe
		v.cache.Invalidate(path)
		return
	}

	// Compare entries
	if v.entriesMatch(cached.Entries, freshEntries) {
		// Cache is still valid
		return
	}

	// Cache is stale - update it
	v.cache.Set(path, freshEntries)

	// Notify callback
	if v.onCacheStale != nil {
		v.onCacheStale(path, freshEntries)
	}
}

// entriesMatch checks if two sets of directory entries are equivalent
func (v *CacheVerifier) entriesMatch(cached, fresh []types.DirectoryEntry) bool {
	if len(cached) != len(fresh) {
		return false
	}

	// Create a map of cached entries for comparison
	cachedMap := make(map[string]types.DirectoryEntry, len(cached))
	for _, entry := range cached {
		cachedMap[entry.Name] = entry
	}

	// Check each fresh entry against cached
	for _, freshEntry := range fresh {
		cachedEntry, ok := cachedMap[freshEntry.Name]
		if !ok {
			return false
		}

		// Compare type (file vs directory)
		if cachedEntry.Type != freshEntry.Type {
			return false
		}
	}

	return true
}

// ClearCooldown clears the cooldown for a specific path (useful for testing)
func (v *CacheVerifier) ClearCooldown(path string) {
	v.lastVerify.Delete(path)
}
