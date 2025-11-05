import { describe, expect, it } from 'vitest';
import { parseGitHubRepo } from '../../../src/ipc/agent/git';

describe('parseGitHubRepo', () => {
  it('should parse HTTPS GitHub URL', () => {
    const result = parseGitHubRepo('https://github.com/owner/repo.git');
    expect(result).toEqual({
      owner: 'owner',
      name: 'repo',
    });
  });

  it('should parse HTTPS GitHub URL without .git', () => {
    const result = parseGitHubRepo('https://github.com/owner/repo');
    expect(result).toEqual({
      owner: 'owner',
      name: 'repo',
    });
  });

  it('should parse SSH GitHub URL', () => {
    const result = parseGitHubRepo('git@github.com:owner/repo.git');
    expect(result).toEqual({
      owner: 'owner',
      name: 'repo',
    });
  });

  it('should parse SSH GitHub URL without .git', () => {
    const result = parseGitHubRepo('git@github.com:owner/repo');
    expect(result).toEqual({
      owner: 'owner',
      name: 'repo',
    });
  });

  it('should return null for non-GitHub URLs', () => {
    const result = parseGitHubRepo('https://gitlab.com/owner/repo.git');
    expect(result).toBeNull();
  });

  it('should return null for invalid URLs', () => {
    const result = parseGitHubRepo('not-a-url');
    expect(result).toBeNull();
  });
});
