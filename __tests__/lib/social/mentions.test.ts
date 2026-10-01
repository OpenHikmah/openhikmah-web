import { describe, it, expect, vi, beforeEach } from "vitest";

function makeSelectChain(resolveWith: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolveWith).then(res, rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import {
  MAX_MENTIONS_PER_NOTE,
  parseMentionedUsernames,
  resolveFriendMentions,
} from "@/lib/social/mentions";

describe("parseMentionedUsernames", () => {
  it("extracts a single @username", () => {
    expect(parseMentionedUsernames("Hey @bob check this out")).toEqual(["bob"]);
  });

  it("extracts multiple distinct usernames, lowercased", () => {
    expect(parseMentionedUsernames("@Bob and @Carol and @bob again")).toEqual(["bob", "carol"]);
  });

  it("returns [] when there are no mentions", () => {
    expect(parseMentionedUsernames("just a plain reflection")).toEqual([]);
  });

  it("stops a mention token at punctuation", () => {
    expect(parseMentionedUsernames("thanks @alice, this helped")).toEqual(["alice"]);
  });

  it("ignores a bare @ with no following word characters", () => {
    expect(parseMentionedUsernames("email me at me @ home")).toEqual([]);
  });

  it("does not treat an email address as a mention", () => {
    expect(parseMentionedUsernames("reach me at a@bob.com or alice@example.org")).toEqual([]);
  });

  it("still matches a mention that follows punctuation or starts the text", () => {
    expect(parseMentionedUsernames('@alice (cc @bob), "@carol"')).toEqual([
      "alice",
      "bob",
      "carol",
    ]);
  });

  it("rejects a doubled @", () => {
    expect(parseMentionedUsernames("@@bob")).toEqual([]);
  });

  it("ignores tokens outside the 3-20 character username format", () => {
    expect(
      parseMentionedUsernames("@ab and @" + "a".repeat(21) + " and @" + "b".repeat(20))
    ).toEqual(["b".repeat(20)]);
  });

  it("truncates to MAX_MENTIONS_PER_NOTE distinct mentions, keeping the first ones", () => {
    const text = Array.from({ length: 50 }, (_, i) => `@user${i}`).join(" ");
    const result = parseMentionedUsernames(text);
    expect(result).toHaveLength(MAX_MENTIONS_PER_NOTE);
    expect(result[0]).toBe("user0");
    expect(result[MAX_MENTIONS_PER_NOTE - 1]).toBe(`user${MAX_MENTIONS_PER_NOTE - 1}`);
  });
});

describe("resolveFriendMentions", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it("returns [] without querying the db when there are no usernames", async () => {
    const out = await resolveFriendMentions(1, []);
    expect(out).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns [] when none of the parsed usernames match a real user", async () => {
    mockSelect.mockReturnValueOnce(makeSelectChain([]));
    const out = await resolveFriendMentions(1, ["nobody"]);
    expect(out).toEqual([]);
  });

  it("excludes a matched user who isn't an accepted friend of the mentioning user", async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 2, username: "carol" }]))
      .mockReturnValueOnce(makeSelectChain([])); // no accepted friendship row
    const out = await resolveFriendMentions(1, ["carol"]);
    expect(out).toEqual([]);
  });

  it("includes a matched user who is an accepted friend (mentioning user as requester)", async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 2, username: "bob" }]))
      .mockReturnValueOnce(makeSelectChain([{ requesterId: 1, addresseeId: 2 }]));
    const out = await resolveFriendMentions(1, ["bob"]);
    expect(out).toEqual([{ id: 2, username: "bob" }]);
  });

  it("includes a matched user who is an accepted friend (mentioning user as addressee)", async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 2, username: "bob" }]))
      .mockReturnValueOnce(makeSelectChain([{ requesterId: 2, addresseeId: 1 }]));
    const out = await resolveFriendMentions(1, ["bob"]);
    expect(out).toEqual([{ id: 2, username: "bob" }]);
  });
});
