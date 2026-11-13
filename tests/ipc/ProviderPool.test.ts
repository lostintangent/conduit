import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderPool } from "../../src/ipc/ProviderPool";

// The ref-counted pool behind FileSystemProviderService and GitProviderService.
// The service tests cover only what each service adds on top.
describe("ProviderPool", () => {
  const hooks = { dispose: vi.fn(), onIdle: vi.fn(), onRevive: vi.fn() };
  const create = vi.fn(async (key: string) => ({ key }));
  let pool: ProviderPool<{ key: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pool = new ProviderPool("TestPool", hooks);
  });

  afterEach(() => {
    pool.disposeAll();
    vi.useRealTimers();
  });

  it("creates one provider per path and shares it", async () => {
    const first = await pool.acquire("/test/project", create);
    const second = await pool.acquire("/test/project", create);
    const other = await pool.acquire("/test/other", create);

    expect(second).toBe(first);
    expect(other).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("shares one creation between concurrent acquires, each holding a reference", async () => {
    const [first, second] = await Promise.all([
      pool.acquire("/test/project", create),
      pool.acquire("/test/project", create),
    ]);
    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);

    pool.release("/test/project");
    await vi.advanceTimersByTimeAsync(5000);
    expect(hooks.dispose).not.toHaveBeenCalled();
  });

  it("doesn't keep a failed creation", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("ENOENT"));

    await expect(pool.acquire("/test/project", failing)).rejects.toThrow(
      "ENOENT",
    );
    await expect(pool.acquire("/test/project", create)).resolves.toEqual({
      key: "/test/project",
    });
  });

  it("treats equivalent paths as one key, ignoring case", async () => {
    const value = await pool.acquire("/Test/Project", create);

    expect(create).toHaveBeenCalledWith("/test/project");
    for (const alias of [
      "/test/project/",
      "/test//project",
      "/test/other/../project",
      "/TEST/PROJECT",
    ]) {
      expect(pool.get(alias)).toBe(value);
    }
  });

  it("disposes a provider 5s after its last reference is released", async () => {
    const value = await pool.acquire("/test/project", create);
    await pool.acquire("/test/project", create);

    pool.release("/test/project");
    expect(hooks.onIdle).not.toHaveBeenCalled();

    pool.release("/test/project");
    expect(hooks.onIdle).toHaveBeenCalledWith(value);

    await vi.advanceTimersByTimeAsync(4999);
    expect(hooks.dispose).not.toHaveBeenCalled();
    expect(pool.get("/test/project")).toBe(value);

    await vi.advanceTimersByTimeAsync(1);
    expect(hooks.dispose).toHaveBeenCalledWith(value);
    expect(pool.get("/test/project")).toBeUndefined();
  });

  it("keeps a provider re-acquired during the grace period", async () => {
    const value = await pool.acquire("/test/project", create);
    pool.release("/test/project");
    await vi.advanceTimersByTimeAsync(3000);

    await expect(pool.acquire("/test/project", create)).resolves.toBe(value);
    expect(hooks.onRevive).toHaveBeenCalledWith(value, "/test/project");
    await vi.advanceTimersByTimeAsync(5000);
    expect(hooks.dispose).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);

    // The revived reference is the only one.
    pool.release("/test/project");
    await vi.advanceTimersByTimeAsync(5000);
    expect(hooks.dispose).toHaveBeenCalledTimes(1);
  });

  it("warns when releasing an unknown path", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    pool.release("/unknown/path");

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempted to release unknown provider"),
    );
    warn.mockRestore();
  });

  it("disposeAll disposes every provider once and cancels grace periods", async () => {
    const first = await pool.acquire("/test/first", create);
    const second = await pool.acquire("/test/second", create);
    // A double release leaves an earlier grace timer that disposeAll can't see.
    pool.release("/test/first");
    pool.release("/test/first");

    pool.disposeAll();
    await vi.advanceTimersByTimeAsync(10000);

    expect(hooks.dispose).toHaveBeenCalledTimes(2);
    expect(hooks.dispose).toHaveBeenCalledWith(first);
    expect(hooks.dispose).toHaveBeenCalledWith(second);
    expect(pool.get("/test/first")).toBeUndefined();
  });

  it("disposeAll logs a failing dispose and still disposes the rest", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.dispose
      .mockImplementationOnce(() => {
        throw new Error("sync failure");
      })
      .mockImplementationOnce(() => Promise.reject(new Error("async failure")));
    await pool.acquire("/test/first", create);
    await pool.acquire("/test/second", create);
    await pool.acquire("/test/third", create);

    expect(() => pool.disposeAll()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);

    expect(hooks.dispose).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
