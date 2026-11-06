import { afterEach, describe, it, expect, vi } from "vitest";
import { getDocumentPage, getObject } from "./object-pages.api";
afterEach(() => vi.unstubAllGlobals());
describe("bounded document reads", () => {
  it("requests one cursor page and sends filters and cancellation to server", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [], nextCursor: "next" })),
      );
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const result = await getDocumentPage(
      "project",
      {
        kind: "document",
        q: "architecture",
        tag: "review",
        status: "ready",
        archived: false,
      },
      "cursor",
      signal,
    );
    expect(result.nextCursor).toBe("next");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    const parsed = new URL(url, "http://localhost");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      kind: "document",
      q: "architecture",
      tag: "review",
      status: "ready",
      archived: "false",
      limit: "30",
      cursor: "cursor",
    });
    expect(options.signal).toBe(signal);
  });
});
it('omits empty optional filters so default documentation remains visible',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[],nextCursor:null})));vi.stubGlobal('fetch',fetch);
 await getDocumentPage('project',{kind:'document',q:'',tag:'',status:'',archived:false},null);
 const query=new URL(fetch.mock.calls[0]![0],'http://localhost').searchParams;
 expect(query.has('tag')).toBe(false);expect(query.has('status')).toBe(false);expect(query.has('q')).toBe(false);
});
