import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeGuestWorkspace, CANVAS_STORAGE_KEY } from "@/hooks/useCanvasPersistence";

const MERGE_FLAG_KEY = "open-hikmah-guest-merged";

function setCanvas(data: unknown) {
  localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(data));
}

describe("mergeGuestWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("skips when merge flag already exists", async () => {
    localStorage.setItem(MERGE_FLAG_KEY, "1");
    setCanvas({ v: 1, nodes: [{ id: "1" }] });

    const spy = vi.spyOn(globalThis, "fetch");

    await mergeGuestWorkspace("tok_abc");

    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when no canvas in localStorage", async () => {
    const spy = vi.spyOn(globalThis, "fetch");

    await mergeGuestWorkspace("tok_abc");

    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when canvas has no nodes", async () => {
    setCanvas({ v: 1, nodes: [] });
    const spy = vi.spyOn(globalThis, "fetch");

    await mergeGuestWorkspace("tok_abc");

    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when canvas version is not 1", async () => {
    setCanvas({ v: 2, nodes: [{ id: "1" }] });
    const spy = vi.spyOn(globalThis, "fetch");

    await mergeGuestWorkspace("tok_abc");

    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when canvas data is malformed JSON", async () => {
    localStorage.setItem(CANVAS_STORAGE_KEY, "not-json");
    const spy = vi.spyOn(globalThis, "fetch");

    await mergeGuestWorkspace("tok_abc");

    expect(spy).not.toHaveBeenCalled();
  });

  it("posts to /api/workspace and sets merge flag on success", async () => {
    setCanvas({ v: 1, nodes: [{ id: "1" }, { id: "2" }] });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
    } as Response);

    await mergeGuestWorkspace("tok_xyz");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/workspace");
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer tok_xyz",
      }),
    });

    const body = JSON.parse(init!.body as string);
    expect(body.name).toMatch(/2 verses/);
    expect(body.nodeCount).toBe(2);
    expect(body.data.v).toBe(1);

    expect(localStorage.getItem(MERGE_FLAG_KEY)).toBe("1");
  });

  it("does not set merge flag when response is not ok", async () => {
    setCanvas({ v: 1, nodes: [{ id: "1" }] });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await mergeGuestWorkspace("tok_xyz");

    expect(localStorage.getItem(MERGE_FLAG_KEY)).toBeNull();
  });

  it("does not throw when fetch fails", async () => {
    setCanvas({ v: 1, nodes: [{ id: "1" }] });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    await expect(mergeGuestWorkspace("tok_xyz")).resolves.toBeUndefined();
  });

  it("sends singular name for single node", async () => {
    setCanvas({ v: 1, nodes: [{ id: "1" }] });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);

    await mergeGuestWorkspace("tok_abc");

    const body = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.spyOn>).mock.calls[0][1]!
        .body as string,
    );
    expect(body.name).toMatch(/1 verse\b/);
    expect(body.nodeCount).toBe(1);
  });
});
