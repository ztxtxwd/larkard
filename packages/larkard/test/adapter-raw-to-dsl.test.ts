import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isRawCardEnvelope,
  rawCardToDsl,
  rawToDsl,
  type RawToDslWarning,
} from "../src/adapter/raw-to-dsl.js";
import { dslToRaw } from "../src/adapter/dsl-to-raw.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "adapter");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));
}

interface AnyDsl {
  schema?: string;
  config?: Record<string, any>;
  body?: Record<string, any>;
  header?: Record<string, any>;
}

function findElements(dsl: AnyDsl, predicate: (el: Record<string, any>) => boolean): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  function walk(v: unknown) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const rec = v as Record<string, any>;
      if (predicate(rec)) out.push(rec);
      for (const val of Object.values(rec)) walk(val);
    }
  }
  walk(dsl);
  return out;
}

/** Collect every object key in the tree matching `predicate` (with its path). */
function collectKeys(dsl: unknown, predicate: (key: string) => boolean): string[] {
  const out: string[] = [];
  function walk(v: unknown, path: string) {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, any>)) {
        if (predicate(k)) out.push(`${path}.${k}`);
        walk(val, `${path}.${k}`);
      }
    }
  }
  walk(dsl, "root");
  return out;
}

describe("isRawCardEnvelope", () => {
  it("recognizes the editor-internal envelope", () => {
    const env = loadFixture("grid-images.raw.json");
    assert.equal(isRawCardEnvelope(env), true);
  });

  it("rejects non-envelope payloads", () => {
    assert.equal(isRawCardEnvelope(null), false);
    assert.equal(isRawCardEnvelope({}), false);
    assert.equal(isRawCardEnvelope({ schema: "2.0", body: {} }), false);
    assert.equal(isRawCardEnvelope("string"), false);
  });
});

describe("rawCardToDsl basic shape", () => {
  it("produces { schema, config, body, header }", () => {
    const dsl = rawCardToDsl(loadFixture("markdown-at.raw.json")) as AnyDsl;
    assert.equal(dsl.schema, "2.0");
    assert.deepEqual(dsl.config, { update_multi: true });
    assert.notEqual(dsl.body, undefined);
    assert.notEqual(dsl.header, undefined);
  });

  it("returns the input unchanged when it isn't a raw envelope", () => {
    const arg = { schema: "2.0", body: { elements: [] } };
    assert.equal(rawCardToDsl(arg), arg);
  });
});

describe("padding / margin projection", () => {
  it("projects column padding from { type:pixels, value } objects to 'Tpx Rpx Bpx Lpx'", () => {
    const dsl = rawCardToDsl(loadFixture("grid-images.raw.json")) as AnyDsl;
    assert.match(dsl.body?.padding, /^\d+px \d+px \d+px \d+px$/);
  });

  it("preserves a non-zero column padding when the column has a colored background_style", () => {
    // The motivating bug: user_card_content drops column.padding when bg is non-default.
    // raw_card_content keeps it; we verify our projection passes that 12px through.
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const colored = findElements(dsl, (el) =>
      el.tag === "column" && typeof el.background_style === "string" && el.background_style !== "default",
    );
    assert.ok(colored.length > 0);
    for (const col of colored) {
      assert.match(col.padding, /^\d+px \d+px \d+px \d+px$/);
    }
  });
});

describe("column width projection (widthValue is authoritative)", () => {
  function columnFrom(col: Record<string, any>): Record<string, any> {
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [{
            tag: "column_set",
            property: { flex_mode: "stretch", columns: [{ tag: "column", property: col }] },
          }],
        },
      },
    }) as AnyDsl;
    const set = ((dsl.body as { elements: Record<string, any>[] }).elements[0])!;
    return (set.columns as Record<string, any>[])[0]!;
  }

  it("projects column_width_weighted.value onto width + weight (keeps the device ratio)", () => {
    // Regression: RAW { width:'weighted', weight:1, widthValue.value:2 } used to
    // drop the echo and keep the stale weight, so the preview rendered 1:1 while
    // the device (which reads widthValue first, see client ao()) rendered 1:2.
    assert.partialDeepStrictEqual(columnFrom({
      width: "weighted",
      weight: 1,
      widthValue: { type: "column_width_weighted", value: 2 },
      elements: [],
    }), { width: "weighted", weight: 2 });
  });

  it("recovers width:'weighted' when the raw only carries the widthValue echo", () => {
    const col = columnFrom({
      widthValue: { type: "column_width_weighted", value: 3 },
      elements: [],
    });
    assert.partialDeepStrictEqual(col, { width: "weighted", weight: 3 });
    assert.ok(!Object.prototype.hasOwnProperty.call(col, "width_value"));
  });

  it("builtin_column_width auto wins over a stale width enum", () => {
    assert.partialDeepStrictEqual(columnFrom({
      width: "weighted",
      weight: 2,
      widthValue: { type: "builtin_column_width", value: "auto" },
      elements: [],
    }), { width: "auto" });
  });

  it("pixels echo wins over a stale enum", () => {
    assert.partialDeepStrictEqual(columnFrom({
      width: "auto",
      widthValue: { type: "pixels", value: 120 },
      elements: [],
    }), { width: "120px" });
  });

  it("keeps the legacy width + weight shape when there is no widthValue", () => {
    assert.partialDeepStrictEqual(columnFrom({ width: "weighted", weight: 2, elements: [] }), { width: "weighted", weight: 2 });
  });
});

describe("img projection", () => {
  it("resolves imageID into img_key via the attachment table", () => {
    const dsl = rawCardToDsl(loadFixture("grid-images.raw.json")) as AnyDsl;
    const imgs = findElements(dsl, (el) => el.tag === "img");
    assert.ok(imgs.length > 0);
    for (const img of imgs) {
      assert.match(img.img_key, /^img_v3_/);
      assert.ok(!Object.prototype.hasOwnProperty.call(img, "image_id"));
    }
  });

  it("collapses width_height_pixels size_value into 'Wpx Hpx'", () => {
    const dsl = rawCardToDsl(loadFixture("grid-images.raw.json")) as AnyDsl;
    const sized = findElements(dsl, (el) => el.tag === "img" && typeof el.size === "string");
    assert.ok(sized.length > 0);
    for (const img of sized) {
      assert.match(img.size, /^\d+px \d+px$/);
    }
  });
});

describe("markdown re-stitch", () => {
  it("renders <at id=all> for at_all child", () => {
    const dsl = rawCardToDsl(loadFixture("markdown-at.raw.json")) as AnyDsl;
    const md = findElements(dsl, (el) => el.tag === "markdown" && typeof el.content === "string" && /Hi/.test(el.content as string));
    assert.equal(md.length, 1);
    assert.ok((md[0]?.content).includes("<at id=all></at>"));
  });

  // Regression: real Feishu raw stamps `userID` (capital ID) on `at` children,
  // same casing as person chips. We previously only read `userId` / `user_id`,
  // so mentions collapsed to empty `<at></at>`. Prefer the open_id on the
  // element — not at_users[].user_id, which can be a numeric user_id.
  it("renders <at id=ou_...> from raw userID (not empty <at></at>)", () => {
    const dsl = rawCardToDsl(loadFixture("markdown-at-userid.raw.json")) as AnyDsl;
    const md = findElements(
      dsl,
      (el) => el.tag === "markdown" && typeof el.content === "string",
    );
    assert.equal(md.length, 1);
    assert.equal(md[0]?.content, "<at id=ou_84cb0e9f50147ff0de98f2122705343f></at> 你好～",);
    assert.ok(!(md[0]?.content).includes("<at></at>"));
    // Must not leak the numeric attachment user_id into the mention.
    assert.ok(!(md[0]?.content).includes("7441015090323947523"));
  });

  it("collapses bold + color into inline markdown markers", () => {
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const md = findElements(dsl, (el) =>
      el.tag === "markdown" && typeof el.content === "string" && (el.content as string).includes("**"),
    );
    assert.ok(md.length > 0);
  });

  it("preserves heading children as '# '/'## '/'### ' inline", () => {
    const dsl = rawCardToDsl(loadFixture("person-input.raw.json")) as AnyDsl;
    const md = findElements(dsl, (el) =>
      el.tag === "markdown" && typeof el.content === "string" && /(^|\n)##? /.test(el.content as string),
    );
    assert.ok(md.length > 0);
  });

  it("renders inline emoji children as :KEY: shortcodes", () => {
    // Regression: emoji segments used to fall through to the default case and
    // vanish (leaving a double space), so cards lost every emoji on round-trip.
    const dsl = rawCardToDsl(loadFixture("emoji.raw.json")) as AnyDsl;
    const contents = findElements(
      dsl,
      (el) => el.tag === "markdown" && typeof el.content === "string",
    ).map((el) => el.content as string);
    // Inline within a plain text run.
    assert.equal(contents.some((c) => c.includes("hello :OK: world :Fire:")), true);
    // Inline within a list item (routes through childToMarkdown, not the
    // inline-segment path).
    assert.equal(contents.some((c) => c.includes(":Blush:")), true);
  });

  it("renders inline person_v1 children as <person> tags (not dropped)", () => {
    // Regression: person_v1 / person as markdown children fell through to the
    // default case and vanished, so cards like「销售顾问 + @ + person chip」
    // lost the person chip on raw→DSL. Public syntax is the <person> tag.
    const dsl = rawCardToDsl(loadFixture("markdown-person.raw.json")) as AnyDsl;
    const contents = findElements(
      dsl,
      (el) => el.tag === "markdown" && typeof el.content === "string",
    ).map((el) => el.content as string);

    // Mixed with bold label + at mention.
    assert.equal(contents.some((c) =>
      c.includes("**销售顾问**") &&
      c.includes("<at id=on_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa></at>") &&
      c.includes("<person id='on_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' show_name=true show_avatar=true style='normal'></person>")
    ), true);

    // Standalone person chips (style=normal and style=capsule) both survive.
    assert.equal(contents.some((c) =>
      c.includes("style='normal'") && c.includes("style='capsule'")
    ), true);

    // Editor-only pillShaped must not leak.
    assert.ok(!(JSON.stringify(dsl)).includes("pillShaped"));
    assert.ok(!(JSON.stringify(dsl)).includes("pill_shaped"));
  });

  it("renders markdown_audio children as <audio> tags (not dropped)", () => {
    // Regression: markdown_audio fell through defaults and vanished, leaving
    // empty markdown shells (妙卡音视频卡). Public rich-text syntax is
    // <audio file_key='...' ...></audio> — not a top-level audio component.
    const dsl = rawCardToDsl(loadFixture("markdown-audio.raw.json")) as AnyDsl;
    const md = findElements(
      dsl,
      (el) => el.tag === "markdown" && typeof el.content === "string",
    );
    const contents = md.map((el) => el.content as string);

    // Solo markdown_audio → content is just the tag (plus attrs from raw).
    assert.equal(contents.some((c) =>
      c.includes("<audio ") &&
      c.includes("file_key='file_v3_0014e_69d48a39-571c-4bb6-8974-70fdf73711bg'") &&
      c.includes("audio_id='4fbd222d-659a-43ad-b62c-e4cea7ae177c'") &&
      c.includes("show_time=true") &&
      c.includes("background_color='grey-200'") &&
      c.includes("fill_color='blue-800'") &&
      c.includes("fallback_url='https://open.feishu.cn/'") &&
      c.includes("</audio>")
    ), true);

    // Mixed with preceding plain_text + style=speak + fallback_text.
    assert.equal(contents.some((c) =>
      c.includes("旁白：") &&
      c.includes("file_key='file_v3_0014e_a372dd32-d342-409d-b8d3-97d8277a6d8g'") &&
      c.includes("style='speak'") &&
      c.includes("fallback_text='[音频链接]'")
    ), true);

    // Must stay inside markdown content — not promoted to top-level audio.
    assert.equal((findElements(dsl, (el) => el.tag === "audio")).length, 0);
    // Empty-content markdown shells must not remain for the audio blocks.
    assert.equal(md.every((el) => typeof el.content === "string" && (el.content as string).length > 0), true);
  });
});

describe("list re-stitch", () => {
  // Regression: a `list` child followed by a sibling plain_text used to close
  // with a single "\n". In Feishu markdown that is not enough to terminate the
  // block, so the following text ("历史问题TOP：") got parsed as a continuation
  // of the last bullet and rendered glued onto the same line. The list must
  // close with a blank line (\n\n) so the trailing paragraph stands alone.
  it("separates a list from a trailing paragraph with a blank line", () => {
    const dsl = rawCardToDsl(loadFixture("list-then-text.raw.json")) as AnyDsl;
    const md = findElements(
      dsl,
      (el) => el.tag === "markdown" && typeof el.content === "string" && (el.content as string).includes("历史问题TOP"),
    );
    assert.equal(md.length, 1);
    const content = md[0]?.content as string;
    // The bullet and the following bold paragraph must not share a line.
    assert.ok(!(content).includes("根因排查中\n**历史问题TOP"));
    // They must be split by a blank line that closes the list block.
    assert.ok((content).includes("根因排查中\n\n**历史问题TOP"));
  });

  // Feishu preserves nested ol ONLY with 4-space indent + per-group numbers
  // (RAW `order`). 2-space indent and/or continuous 1..n both flatten on parse.
  it("projects nested ordered lists as restart+4space markdown from RAW order", () => {
    const dsl = rawCardToDsl(loadFixture("nested-ordered-list.raw.json")) as AnyDsl;
    const md = findElements(
      dsl,
      (el) =>
        el.tag === "markdown" &&
        typeof el.content === "string" &&
        (el.content as string).includes("进入开发阶段并分配任务"),
    );
    assert.equal(md.length, 1);
    const content = md[0]?.content as string;
    assert.equal(content, "\n1. 进入开发阶段并分配任务\n    1. 前端模块：负责页面开发与接口联调\n        1. 完成页面原型设计\n        2. 与后端接口联调\n    2. 后端模块：负责接口开发\n        1. 数据库设计与实现\n        2. API 接口开发与优化\n2. 测试模块：编写用例并执行回归测试\n    1. 单元测试覆盖率 ≥ 80%\n    2. 集成测试与性能测试\n3. 发布上线并收集用户反馈\n    1. 灰度发布至 10% 用户\n    2. 收集首批用户反馈并整理报告\n\n",);
    // Must not use the old continuous+2space shape.
    assert.ok(!(content).includes("\n  2. 前端模块"));
    assert.ok(!(content).includes("\n8. 测试模块"));
  });

  it("falls back to nesting-aware 4-space counters when ol items omit order", () => {
    const envelope = {
      json_card: JSON.stringify({
        schema: "2.0",
        body: {
          id: "_1",
          tag: "body",
          property: {
            elements: [
              {
                id: "_2",
                tag: "markdown",
                property: {
                  originTag: "markdown",
                  markdownElements: [],
                  elements: [
                    {
                      id: "_3",
                      tag: "list",
                      property: {
                        items: [
                          {
                            level: 0,
                            type: "ol",
                            elements: [{ id: "a", tag: "plain_text", property: { content: "父一" } }],
                          },
                          {
                            level: 1,
                            type: "ol",
                            elements: [{ id: "b", tag: "plain_text", property: { content: "子一" } }],
                          },
                          {
                            level: 1,
                            type: "ol",
                            elements: [{ id: "c", tag: "plain_text", property: { content: "子二" } }],
                          },
                          {
                            level: 0,
                            type: "ol",
                            elements: [{ id: "d", tag: "plain_text", property: { content: "父二" } }],
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
      json_attachment: {},
      card_schema: 2,
    };
    const dsl = rawCardToDsl(envelope) as AnyDsl;
    const md = findElements(dsl, (el) => el.tag === "markdown" && typeof el.content === "string");
    assert.equal(md[0]?.content, "\n1. 父一\n    1. 子一\n    2. 子二\n2. 父二\n\n");
  });
});

describe("code_block re-stitch", () => {
  function codeBlocks(dsl: AnyDsl): string[] {
    return findElements(
      dsl,
      (el) => el.tag === "markdown" && typeof el.content === "string" && (el.content as string).includes("```"),
    ).map((el) => el.content as string);
  }

  it("preserves line breaks across line-per-entry contents (regression: multi-line block collapsed to one line)", () => {
    const dsl = rawCardToDsl(loadFixture("code-block.raw.json")) as AnyDsl;
    const block = codeBlocks(dsl).find((c) => c.includes("line one"));
    assert.notEqual(block, undefined);
    // The three raw line entries must come back as three separate lines.
    assert.ok((block).includes("```plain_text\nline one\nline two\nline three\n```"));
  });

  it("normalizes the single-entry-with-newlines encoding to no trailing blank line", () => {
    const dsl = rawCardToDsl(loadFixture("code-block.raw.json")) as AnyDsl;
    const block = codeBlocks(dsl).find((c) => c.includes("npm run build"));
    assert.notEqual(block, undefined);
    // The raw explicit trailing "\n" must not stack with our closing-fence
    // newline into a blank line before ```.
    assert.ok((block).includes("```bash\nnpm run build\n```"));
    assert.ok(!(block).includes("npm run build\n\n```"));
  });
});

describe("markdown br after block", () => {
  // Regression: RAW `hr → br → link` (an explicit blank line under the rule).
  // Serializing the br as a bare "\n" appended to the hr's "\n\n" leaves only
  // block padding, which parseMarkdown ignores — the blank line disappeared
  // when the DSL was rendered. It must survive as the documented <br> tag.
  it("keeps an explicit br after hr as <br> in the DSL content", () => {
    const envelope = {
      json_card: JSON.stringify({
        schema: "2.0",
        body: {
          id: "_1",
          tag: "body",
          property: {
            elements: [
              {
                id: "_2",
                tag: "markdown",
                property: {
                  originTag: "markdown",
                  markdownElements: [],
                  elements: [
                    { id: "_3", tag: "hr", property: {} },
                    { id: "_4", tag: "br", property: {} },
                    {
                      id: "_5",
                      tag: "link",
                      property: { content: "124513254", url: { url: "https://a.com" } },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
      json_attachment: {},
      card_schema: 2,
    };
    const dsl = rawCardToDsl(envelope) as AnyDsl;
    const md = findElements(dsl, (el) => el.tag === "markdown" && typeof el.content === "string");
    assert.equal(md.length, 1);
    assert.ok((md[0]?.content as string).includes("---\n\n<br>\n[124513254](https://a.com)"));

    // DSL → RAW must restore the explicit br sibling (not just blank text).
    const raw = dslToRaw(dsl as never) as Record<string, any>;
    const roundTripped = findElements(
      { body: raw.body } as AnyDsl,
      (el) => el.tag === "markdown" && Array.isArray(el.property?.elements),
    )[0];
    const tags = (roundTripped?.property?.elements as Array<Record<string, any>>).map((el) => el.tag);
    assert.deepEqual(tags, ["hr", "br", "link"]);
  });
});

describe("button projection", () => {
  it("projects raw button.actions:[{type:open_url}] to behaviors[]", () => {
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const buttons = findElements(dsl, (el) => el.tag === "button");
    const withBehaviors = buttons.find((b) => Array.isArray(b.behaviors));
    assert.notEqual(withBehaviors, undefined);
    const behavior = (withBehaviors!.behaviors as unknown[])[0] as Record<string, any>;
    assert.equal(behavior.type, "open_url");
    assert.match(behavior.default_url, /^https?:\/\//);
  });

  it("does not write empty pc_url / ios_url / android_url fields", () => {
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const buttons = findElements(dsl, (el) => el.tag === "button");
    for (const b of buttons) {
      const behaviors = b.behaviors as unknown[] | undefined;
      if (!behaviors) continue;
      for (const beh of behaviors) {
        assert.ok(!Object.prototype.hasOwnProperty.call(beh, "pc_url"));
        assert.ok(!Object.prototype.hasOwnProperty.call(beh, "ios_url"));
        assert.ok(!Object.prototype.hasOwnProperty.call(beh, "android_url"));
      }
    }
  });

  it("preserves platform URLs on open_url actions (copy-button round-trip)", () => {
    const copy = "lark://client/core/copy?value=%2Fedit";
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              tag: "button",
              property: {
                actionType: "multi",
                text: { tag: "plain_text", property: { content: "复制指令" } },
                type: "default",
                actions: [
                  {
                    type: "open_url",
                    action: {
                      url: "https://miao.cards",
                      pcURL: copy,
                      iosURL: copy,
                      androidURL: copy,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    }) as AnyDsl;
    const btn = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    const beh = (btn.behaviors as Record<string, any>[])[0]!;
    assert.deepEqual(beh, {
      type: "open_url",
      default_url: "https://miao.cards",
      pc_url: copy,
      ios_url: copy,
      android_url: copy,
    });
  });

  it("preserves platform URLs when action.url is a LinkURL object", () => {
    const copy = "lark://client/core/copy?value=hello";
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              tag: "button",
              property: {
                actionType: "multi",
                text: { tag: "plain_text", property: { content: "复制" } },
                actions: [
                  {
                    type: "open_url",
                    action: {
                      url: {
                        url: "https://example.com",
                        pcURL: copy,
                        iosURL: copy,
                        androidURL: copy,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    }) as AnyDsl;
    const btn = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    const beh = (btn.behaviors as Record<string, any>[])[0]!;
    assert.equal(beh.default_url, "https://example.com");
    assert.equal(beh.pc_url, copy);
    assert.equal(beh.ios_url, copy);
    assert.equal(beh.android_url, copy);
  });

  it("projects actionType:link open_url with platforms to multi_url", () => {
    const copy = "lark://client/core/copy?value=x";
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              tag: "button",
              property: {
                actionType: "link",
                text: { tag: "plain_text", property: { content: "链" } },
                actions: [
                  {
                    type: "open_url",
                    action: {
                      url: "https://example.com",
                      pcURL: copy,
                      iosURL: "",
                      androidURL: copy,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    }) as AnyDsl;
    const btn = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.equal(btn.behaviors, undefined);
    assert.deepEqual(btn.multi_url, {
      url: "https://example.com",
      pc_url: copy,
      android_url: copy,
    });
  });

  it("preserves platform URLs on interactive_container open_url actions", () => {
    const copy = "lark://client/core/copy?value=pnpm%20i";
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              tag: "interactive_container",
              property: {
                backgroundStyle: "grey-50",
                actions: [
                  {
                    type: "open_url",
                    action: {
                      url: "https://example.com",
                      pcURL: copy,
                      iosURL: copy,
                      androidURL: copy,
                    },
                  },
                ],
                elements: [
                  {
                    tag: "markdown",
                    property: {
                      originTag: "markdown",
                      elements: [
                        {
                          tag: "plain_text",
                          property: { content: "pnpm i" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    }) as AnyDsl;
    const box = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    const beh = (box.behaviors as Record<string, any>[])[0]!;
    assert.deepEqual(beh, {
      type: "open_url",
      default_url: "https://example.com",
      pc_url: copy,
      ios_url: copy,
      android_url: copy,
    });
  });
});

/**
 * 服务端（im.message.get?raw_card_content）把回调存成
 * `{ type:'action_request', action:{ actionID, isValueObjectType, value:"" } }`，
 * 而编辑器 / 旧数据写 `callback`。此前只认 `callback`，真实服务器返回的
 * action_request 全部落进 return undefined，整条 action 消失。
 */
describe("callback / action_request projection", () => {
  const card = (property: Record<string, any>) => ({
    schema: "2.0",
    body: { tag: "body", property: { elements: [{ tag: "button", property }] } },
  });

  it("projects RAW action_request (server storage) to callback behaviors", () => {
    const dsl = rawToDsl(
      card({
        text: { tag: "plain_text", property: { content: "投票" } },
        actions: [
          {
            type: "action_request",
            action: { actionID: "act_v1_abc", isValueObjectType: true, value: "" },
          },
        ],
      }),
    ) as AnyDsl;
    const btn = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.deepEqual(btn.behaviors, [{ type: "callback", value: {} }]);
  });

  it("round-trips a callback object through dslToRaw → rawToDsl", () => {
    const dsl = {
      schema: "2.0",
      body: {
        elements: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "投票" },
            behaviors: [{ type: "callback", value: { vote: "A" } }],
          },
        ],
      },
    };
    const raw = dslToRaw(dsl) as Record<string, any>;
    // dslToRaw 输出服务端拼写
    const actions = (
      (raw.body as Record<string, any>).property as Record<string, any>
    ).elements as Array<Record<string, any>>;
    assert.deepEqual((actions[0]!.property as Record<string, any>).actions, [
      { type: "action_request", action: { value: { vote: "A" } } },
    ]);
    const back = rawToDsl(raw) as AnyDsl;
    const btn = (back.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.deepEqual(btn.behaviors, [{ type: "callback", value: { vote: "A" } }]);
  });

  it("keeps a string callback value (send API accepts string payloads)", () => {
    const dsl = rawToDsl(
      card({
        text: { tag: "plain_text", property: { content: "go" } },
        actions: [{ type: "action_request", action: { value: "str_value" } }],
      }),
    ) as AnyDsl;
    const btn = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.deepEqual(btn.behaviors, [{ type: "callback", value: "str_value" }]);
  });

  it("treats cleared object payload as {} and reports it through onWarn", () => {
    const warnings: RawToDslWarning[] = [];
    rawToDsl(
      card({
        text: { tag: "plain_text", property: { content: "go" } },
        actions: [
          { type: "action_request", action: { actionID: "act_v1_x", isValueObjectType: true, value: "" } },
        ],
      }),
      { onWarn: (w) => warnings.push(w) },
    );
    assert.ok((warnings.map((w) => w.code)).includes("callback_payload_cleared"));
  });

  it("projects interactive_container action_request to behaviors", () => {
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              tag: "interactive_container",
              property: {
                actions: [{ type: "action_request", action: { value: { k: "v" } } }],
                elements: [],
              },
            },
          ],
        },
      },
    }) as AnyDsl;
    const box = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.deepEqual(box.behaviors, [{ type: "callback", value: { k: "v" } }]);
  });

  it("keeps unknown action types verbatim instead of dropping them, and warns", () => {
    const warnings: RawToDslWarning[] = [];
    const dsl = rawToDsl(
      card({
        text: { tag: "plain_text", property: { content: "go" } },
        actions: [{ type: "open_app", action: { appID: "cli_x", extra: 1 } }],
      }),
      { onWarn: (w) => warnings.push(w) },
    ) as AnyDsl;
    const btn = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.deepEqual(btn.behaviors, [
      { type: "open_app", action: { app_id: "cli_x", extra: 1 } },
    ]);
    assert.ok((warnings.map((w) => w.code)).includes("unknown_action_type"));
  });

  it("warns when a column_set callback action cannot be represented in ColumnAction", () => {
    const warnings: RawToDslWarning[] = [];
    const dsl = rawToDsl(
      {
        schema: "2.0",
        body: {
          tag: "body",
          property: {
            elements: [
              {
                tag: "column_set",
                property: {
                  actions: [{ type: "action_request", action: { value: { a: 1 } } }],
                  columns: [{ tag: "column", property: { elements: [] } }],
                },
              },
            ],
          },
        },
      },
      { onWarn: (w) => warnings.push(w) },
    ) as AnyDsl;
    const host = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.equal(host.action, undefined);
    assert.ok((warnings.map((w) => w.code)).includes("unrepresentable_action"));
    // 只报一次（不叠加 unknown_action_type / callback_payload_cleared）
    assert.equal((warnings).length, 1);
  });

  it("keeps the open_url mapping but still reports a co-located callback on column_set", () => {
    const warnings: RawToDslWarning[] = [];
    const dsl = rawToDsl(
      {
        schema: "2.0",
        body: {
          tag: "body",
          property: {
            elements: [
              {
                tag: "column_set",
                property: {
                  actions: [
                    { type: "open_url", action: { url: "https://example.com" } },
                    { type: "action_request", action: { value: { a: 1 } } },
                  ],
                  columns: [{ tag: "column", property: { elements: [] } }],
                },
              },
            ],
          },
        },
      },
      { onWarn: (w) => warnings.push(w) },
    ) as AnyDsl;
    const host = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.deepEqual(host.action, { multi_url: { url: "https://example.com" } });
    assert.deepEqual(warnings.map((w) => w.code), ["unrepresentable_action"]);
  });

  it("does not warn for plain open_url actions", () => {
    const warnings: RawToDslWarning[] = [];
    rawToDsl(
      card({
        text: { tag: "plain_text", property: { content: "go" } },
        actions: [{ type: "open_url", action: { url: "https://example.com" } }],
      }),
      { onWarn: (w) => warnings.push(w) },
    );
    assert.deepEqual(warnings, []);
  });
});

describe("header projection", () => {
  it("flattens raw card_header to top-level header without tag", () => {
    const dsl = rawCardToDsl(loadFixture("header-icon.raw.json")) as AnyDsl;
    assert.notEqual(dsl.header, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(dsl.header, "tag"));
    assert.notEqual(dsl.header?.template, undefined);
  });

  it("projects raw udIcon to header.icon as standard_icon", () => {
    const dsl = rawCardToDsl(loadFixture("header-icon.raw.json")) as AnyDsl;
    const icon = dsl.header?.icon as Record<string, any> | undefined;
    assert.notEqual(icon, undefined);
    assert.equal(icon?.tag, "standard_icon");
    assert.equal(typeof icon?.token, "string");
  });

  it("projects header subtitle originTag:lark_md to public { tag:'lark_md', content }", () => {
    const dsl = rawCardToDsl(loadFixture("header-lark-md.raw.json")) as AnyDsl;
    const title = dsl.header?.title as Record<string, any> | undefined;
    const subtitle = dsl.header?.subtitle as Record<string, any> | undefined;
    assert.deepEqual(title, {
      tag: "plain_text",
      content: "🛡️ OpenAI 越界入侵 Hugging Face：事件复盘与 5 大安全反思",
    });
    assert.equal(subtitle?.tag, "lark_md");
    assert.equal(subtitle?.content, "<at id=ou_113bce58203b98552a06a738827e95b7></at>");
    assert.ok(!Object.prototype.hasOwnProperty.call(subtitle, "text_align"));
    assert.ok(!Object.prototype.hasOwnProperty.call(subtitle, "elements"));
  });

  it("re-projects already-flat header subtitle tag:markdown to lark_md", () => {
    const dsl = rawToDsl({
      schema: "2.0",
      header: {
        template: "carmine",
        title: { tag: "plain_text", content: "事件复盘" },
        subtitle: { tag: "markdown", content: "<at id=ou_abc></at>", text_align: "left" },
      },
      body: { elements: [] },
    }) as AnyDsl;
    assert.ok(!Object.prototype.hasOwnProperty.call(dsl.header, "tag"));
    assert.deepEqual(dsl.header?.title, { tag: "plain_text", content: "事件复盘" });
    assert.deepEqual(dsl.header?.subtitle, {
      tag: "lark_md",
      content: "<at id=ou_abc></at>",
    });
    assert.equal(dsl.header?.template, "carmine");
  });
});

describe("chart projection", () => {
  it("preserves chart_spec internals as camelCase (vega is the engine)", () => {
    const dsl = rawCardToDsl(loadFixture("chart.raw.json")) as AnyDsl;
    const charts = findElements(dsl, (el) => el.tag === "chart");
    assert.ok(charts.length > 0);
    for (const chart of charts) {
      const spec = chart.chart_spec as Record<string, any> | undefined;
      assert.notEqual(spec, undefined);
      // canonical vega keys MUST stay camelCase
      const sampleKeys = Object.keys(spec!).join(",");
      // Any of these would be wrong:
      assert.ok(!(sampleKeys).includes("x_field"));
      assert.ok(!(sampleKeys).includes("y_field"));
      assert.ok(!(sampleKeys).includes("band_width"));
      assert.ok(!(sampleKeys).includes("corner_radius"));
    }
  });

  it("drops min_lib_version (raw editor metadata, public schema rejects it)", () => {
    const dsl = rawCardToDsl(loadFixture("chart.raw.json")) as AnyDsl;
    const charts = findElements(dsl, (el) => el.tag === "chart");
    for (const chart of charts) {
      assert.ok(!Object.prototype.hasOwnProperty.call(chart, "min_lib_version"));
      assert.ok(!Object.prototype.hasOwnProperty.call(chart, "minLibVersion"));
    }
  });
});

describe("table projection", () => {
  it("flattens columns to snake_case + width string (from widthValue echo)", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    assert.notEqual(table, undefined);
    const columns = table.columns as Array<Record<string, any>>;
    assert.equal(columns.length, 5);
    // camelCase raw fields must be projected to snake_case public fields
    const rank = columns[0]!;
    assert.equal(rank.name, "rank");
    assert.equal(rank.display_name, "排名");
    assert.equal(rank.data_type, "text");
    assert.equal(rank.horizontal_align, "center");
    assert.equal(rank.width, "80px"); // widthValue{pixels,80} -> "80px"
    assert.ok(!Object.prototype.hasOwnProperty.call(rank, "displayName"));
    assert.ok(!Object.prototype.hasOwnProperty.call(rank, "widthValue"));
    // builtin "auto" width keyword projected verbatim
    const brand = columns[1]!;
    assert.equal(brand.width, "auto");
    // number column keeps its format object
    const sales = columns[2]!;
    assert.equal(sales.data_type, "number");
    assert.equal((sales.format as Record<string, any>).precision, 1);
  });

  it("unwraps every cell from its { data } envelope to a bare value", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    const rows = table.rows as Array<Record<string, any>>;
    assert.equal(rows.length, 5);
    const first = rows[0]!;
    // text / number cells become bare strings (NOT { data: ... })
    assert.equal(first.brand, "比亚迪汽车");
    assert.equal(first.rank, "1");
    assert.equal(first.sales, "195.8");
    assert.ok(!Object.prototype.hasOwnProperty.call(first.brand, "data"));
    // options cell becomes the bare [{ text, color }] array
    assert.deepEqual(first.status, [{ color: "green", text: "新能源" }]);
  });

  it("projects header_style / row_height / page_size from raw echoes", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    const hs = table.header_style as Record<string, any>;
    assert.equal(hs.background_style, "grey");
    assert.equal(hs.bold, true);
    assert.equal(hs.text_align, "center");
    assert.equal(hs.lines, 1); // linesValue{int_number,1} -> lines:1
    assert.ok(!Object.prototype.hasOwnProperty.call(hs, "linesValue"));
    assert.ok(!Object.prototype.hasOwnProperty.call(hs, "platformTextSize"));
    assert.equal(table.row_height, "middle"); // rowHeightValue.value
    assert.equal(table.page_size, 5);
  });

  it("projects vertical_align / date_format / row_max_height / margin", () => {
    const dsl = rawCardToDsl({
      json_card: JSON.stringify({
        body: {
          tag: "body",
          property: {
            elements: [{
              id: "t1",
              tag: "table",
              property: {
                margin: { top: { type: "pixels", value: 8 }, right: { type: "pixels", value: 12 }, bottom: { type: "pixels", value: 8 }, left: { type: "pixels", value: 12 } },
                pageSize: 5,
                rowHeightValue: { type: "builtin_table_row_height_extension", value: "auto" },
                rowMaxHeightValue: { type: "pixels", value: 200 },
                freezeFirstColumn: true,
                columns: [{
                  name: "d",
                  displayName: "日期",
                  dataType: "date",
                  dateFormat: "YYYY/MM/DD",
                  verticalAlign: "top",
                }],
                rows: [{ d: { data: { type: "timestamp", value: 1606101072000, format: "YYYY/MM/DD" } } }],
              },
            }],
          },
        },
      }),
      card_schema: 2,
    }) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    assert.equal(table.margin, "8px 12px 8px 12px");
    assert.equal(table.row_max_height, "200px");
    assert.equal(table.freeze_first_column, true);
    const [col] = table.columns as Record<string, any>[];
    assert.equal(col.vertical_align, "top");
    assert.equal(col.date_format, "YYYY/MM/DD");
  });

  it("no camelCase / {data} leaks anywhere under the projected table", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    const leaks = collectKeys(table, (k) =>
      k === "widthValue" || k === "displayName" || k === "dataType" ||
      k === "horizontalAlign" || k === "rowHeightValue" || k === "pageSize" ||
      k === "freezeFirstColumn" || k === "linesValue",
    );
    assert.deepEqual(leaks, []);
  });
});

describe("person projection", () => {
  it("projects userID to user_id and drops pillShaped", () => {
    const dsl = rawCardToDsl(loadFixture("person-input.raw.json")) as AnyDsl;
    const persons = findElements(dsl, (el) => el.tag === "person");
    assert.ok(persons.length > 0);
    for (const p of persons) {
      assert.match(p.user_id, /^ou_/);
      assert.ok(!Object.prototype.hasOwnProperty.call(p, "pill_shaped"));
      assert.ok(!Object.prototype.hasOwnProperty.call(p, "pillShaped"));
    }
  });
});

/**
 * Regression for the on-device PATCH failures (code 200621) on cards carrying
 * the editor's person components. The fixture is a real raw_card_content with
 * both a single `person_v1` and a `person_list`. Two distinct bugs:
 *
 *   1. The editor tags a single user `person_v1`, not the public `person`, so
 *      the unconverted tag leaked into the DSL -> "not support tag: person_v1".
 *   2. person_list wasn't handled at all: persons[i] kept its editor-only
 *      `type:'user'` -> "unknown property: type, path: ... persons -> [0]";
 *      and top-level style/mode/count + a sibling fallback node leaked too.
 */
describe("person_v1 / person_list projection (real card regression)", () => {
  it("renames person_v1 to the public person tag (no person_v1 leaks)", () => {
    const dsl = rawCardToDsl(loadFixture("person-list.raw.json")) as AnyDsl;
    assert.ok(!(JSON.stringify(dsl)).includes("person_v1"));
    const persons = findElements(dsl, (el) => el.tag === "person");
    assert.ok(persons.length > 0);
    for (const p of persons) {
      assert.match(p.user_id, /^ou_/);
      assert.ok(!Object.prototype.hasOwnProperty.call(p, "pillShaped"));
      assert.ok(!Object.prototype.hasOwnProperty.call(p, "pill_shaped"));
      // margin {top,..} pixels projected to an "Npx ..." box string.
      if ("margin" in p) assert.equal(typeof p.margin, "string");
    }
  });

  it("projects person_list and strips schema-rejected fields", () => {
    const dsl = rawCardToDsl(loadFixture("person-list.raw.json")) as AnyDsl;
    const lists = findElements(dsl, (el) => el.tag === "person_list");
    assert.ok(lists.length > 0);
    for (const list of lists) {
      // persons[i] must be { id } only — no editor-only `type`.
      assert.equal(Array.isArray(list.persons), true);
      for (const person of list.persons as Record<string, any>[]) {
        assert.match(person.id, /^ou_/);
        assert.ok(!Object.prototype.hasOwnProperty.call(person, "type"));
        assert.deepEqual(Object.keys(person), ["id"]);
      }
      // 官方公开字段 mode/style/count 可保留；仅丢弃编辑器私有 fallback
      assert.ok(!Object.prototype.hasOwnProperty.call(list, "fallback"));
    }
  });

  it("emits no person_list field the public schema rejects", () => {
    const dsl = rawCardToDsl(loadFixture("person-list.raw.json")) as AnyDsl;
    // persons[i].type 是编辑器私有；mode/count/style 已是官方公开字段，允许保留。
    const lists = findElements(dsl, (el) => el.tag === "person_list");
    for (const list of lists) {
      assert.deepEqual(collectKeys(list, (k) => k === "type"), []);
    }
  });
});

describe("input projection", () => {
  it("strips editor-only fields (actions, autoResize, showCount, showIcon, disabled:false)", () => {
    const dsl = rawCardToDsl(loadFixture("person-input.raw.json")) as AnyDsl;
    const inputs = findElements(dsl, (el) => el.tag === "input");
    assert.ok(inputs.length > 0);
    for (const inp of inputs) {
      assert.ok(!Object.prototype.hasOwnProperty.call(inp, "actions"));
      assert.ok(!Object.prototype.hasOwnProperty.call(inp, "auto_resize"));
      assert.ok(!Object.prototype.hasOwnProperty.call(inp, "show_count"));
      assert.ok(!Object.prototype.hasOwnProperty.call(inp, "show_icon"));
      assert.ok(!Object.prototype.hasOwnProperty.call(inp, "disabled"));
      assert.ok(!Object.prototype.hasOwnProperty.call(inp, "required")); // false default is dropped
    }
  });
});

/**
 * Offline regression for the two bugs a live im.message.get payload exposed
 * (live-bare-body fixture). The editor-saved fixtures above all wrap body as
 * { id, tag, property:{ elements } } and carry schema:"2.0" in json_card; this
 * live card does neither, which previously produced an empty body and a
 * missing schema. The fixture lets us guard both without API credentials.
 */
describe("live bare-body envelope (offline regression)", () => {
  it("does not drop the body when it has no `property` wrapper", () => {
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    assert.equal(Array.isArray(dsl.body?.elements), true);
    assert.equal((dsl.body!.elements as unknown[]).length, 3);
  });

  it("flattens v1 `div` section blocks to top-level markdown (schema 2.0 has no div)", () => {
    // Feishu rejects a div: "type of element is not supported tag: markdown,
    // path: ...div->text". The live payload wraps text in a v1 div; we promote
    // the single text child to a top-level markdown element.
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    const tags = (dsl.body!.elements as Array<Record<string, any>>).map((e) => e.tag);
    assert.deepEqual(tags, ["markdown", "img", "markdown"]);
    assert.deepEqual(findElements(dsl, (el) => el.tag === "div"), []);
  });

  it("keeps plain_text div textStyle (size / customColor) and margin", () => {
    // Regression: the plain_text div branch returned early with only content +
    // text_align, so a grey notation footnote came back as default-size black text.
    const px = (value: number) => ({ type: "pixels", value });
    const dsl = rawCardToDsl({
      json_card: JSON.stringify({
        schema: "2.0",
        body: {
          tag: "body",
          property: {
            elements: [
              {
                tag: "div",
                property: {
                  margin: { top: px(4), right: px(0), bottom: px(0), left: px(0) },
                  widthValue: { type: "builtin_div_width", value: "fill" },
                  text: {
                    tag: "plain_text",
                    property: {
                      content: "数据仅用于展示",
                      lines: 0,
                      textAlign: "left",
                      textStyle: {
                        attributes: [],
                        customColor: { lightMode: "#626c7bff", darkMode: "#b1b8c4ff" },
                        platformSize: { mobile: "notation", pc: "notation" },
                        size: "notation",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      }),
      json_attachment: { images: {} },
      card_schema: 2,
    }) as AnyDsl;

    const div = findElements(dsl, (el) => el.tag === "div")[0]!;
    assert.equal(div.margin, "4px 0px 0px 0px");
    const text = div.text as Record<string, any>;
    assert.equal(text.text_size, "notation");
    assert.match(text.text_color, /^cus-/);
    assert.ok(!Object.prototype.hasOwnProperty.call(text, "lines"));
    const colors = (dsl.config as { style?: { color?: Record<string, any> } }).style?.color;
    assert.deepEqual(colors?.[text.text_color as string], {
      light_mode: "rgba(98,108,123,1)",
      dark_mode: "rgba(177,184,196,1)",
    });
  });

  it("emits schema \"2.0\" even when the raw json_card omits it", () => {
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    assert.equal(dsl.schema, "2.0");
  });

  it("resolves img imageID -> img_key and drops v1-only custom_width", () => {
    // custom_width has no slot in v2 img sizing; Feishu rejects it next to
    // scale_type ("img mode is not supported" / "img size is not allowed").
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    const imgs = findElements(dsl, (el) => el.tag === "img");
    assert.equal(imgs.length, 1);
    assert.match(imgs[0]!.img_key, /^img_/);
    assert.ok(!Object.prototype.hasOwnProperty.call(imgs[0], "image_id"));
    assert.ok(!Object.prototype.hasOwnProperty.call(imgs[0], "custom_width"));
  });

  it("does not leak v1-only i18n_* mirrors or `lines` that schema 2.0 rejects", () => {
    // Feishu rejected real sends over these: the v2 lint flags `i18n_elements`
    // and the API returns 200621 "unknown property: lines". Both are editor
    // mirrors raw emits on every text/img/header node; none have a 2.0 slot.
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    const leaks = collectKeys(dsl, (k) => k.startsWith("i18n") || k === "lines");
    assert.deepEqual(leaks, []);
  });

  it("keeps bold markers off whitespace so `**` doesn't render literally", () => {
    // Raw stores bold segments with trailing spaces ("1. ", "· "). Wrapping
    // them verbatim yields `**1. **`, which CommonMark refuses to bold — the
    // asterisks print literally (the bug the user saw). The fix moves the
    // space outside: `**1.** `. Assert the concrete before/after substrings.
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    const md = findElements(dsl, (el) => el.tag === "markdown")
      .map((el) => el.content as string)
      .join("\n");
    // The editor separates these labels with a U+2004 space, not ASCII " ".
    const SP = "\u2004";
    // Fixed: space sits OUTSIDE the closing marker -> renders bold.
    assert.ok((md).includes(`**1.**${SP}`));
    assert.ok((md).includes(`**2.**${SP}`));
    assert.ok((md).includes(`**·**${SP}`));
    // Broken: space hugged the closing `**` -> CommonMark prints literal stars.
    assert.ok(!(md).includes(`**1.${SP}**`));
    assert.ok(!(md).includes(`**2.${SP}**`));
    assert.ok(!(md).includes(`**·${SP}**`));
  });

  it("matches the archived expected DSL exactly", () => {
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json"));
    const expected = loadFixture("live-bare-body.expected.json");
    assert.deepEqual(dsl, expected);
  });
});

/**
 * Class-wide guard: no fixture, regardless of element mix, may leak a v1-only
 * field schema 2.0 rejects. This catches the leak family the live agent tripped
 * over (i18n_elements, then lines) on any future fixture, not just the one card.
 */
describe("no v1-only field leaks (all fixtures)", () => {
  const RAW_FIXTURES = [
    "button-behaviors.raw.json",
    "chart.raw.json",
    "code-block.raw.json",
    "grid-images.raw.json",
    "header-icon.raw.json",
    "live-bare-body.raw.json",
    "markdown-at.raw.json",
    "markdown-audio.raw.json",
    "markdown-person.raw.json",
    "person-input.raw.json",
  ];
  for (const name of RAW_FIXTURES) {
    it(`${name} emits no i18n_* / lines residue`, () => {
      const dsl = rawCardToDsl(loadFixture(name));
      const leaks = collectKeys(dsl, (k) => k.startsWith("i18n") || k === "lines");
      assert.deepEqual(leaks, []);
    });
  }
});

describe("video cover_image_id → cover.img_key", () => {
  it("resolves coverImageId via attachment table and never leaks cover_image_id", () => {
    // Feishu rejects sends with flat cover_image_id (200621 unknown property).
    // Public schema wants cover: { img_key }.
    const envelope = {
      card_schema: 2,
      json_attachment: {
        images: {
          "42": { origin_key: "img_v3_cover_abc" },
        },
      },
      json_card: JSON.stringify({
        schema: "2.0",
        config: { enable_forward: false },
        body: {
          tag: "body",
          property: {
            elements: [
              {
                id: "v1",
                tag: "video",
                property: {
                  fileID: "file_v3_video_abc",
                  coverImageID: "42",
                  videoID: "editor-vid-1",
                  enableDownload: true,
                  showTime: true,
                },
              },
            ],
          },
        },
      }),
    };

    const dsl = rawCardToDsl(envelope) as AnyDsl;
    const videos = findElements(dsl, (el) => el.tag === "video");
    assert.equal((videos).length, 1);
    assert.equal(videos[0]!.file_key, "file_v3_video_abc");
    assert.deepEqual(videos[0]!.cover, { img_key: "img_v3_cover_abc" });
    assert.ok(!Object.prototype.hasOwnProperty.call(videos[0], "cover_image_id"));
    assert.ok(!Object.prototype.hasOwnProperty.call(videos[0], "video_id"));
    assert.deepEqual(collectKeys(dsl, (k) => k === "cover_image_id" || k === "video_id"), []);
  });
});

describe("custom colors (RAW customBackgroundStyle / textStyle.customColor)", () => {
  it("registers custom colors in config.style.color and uses <font color> instead of inline #hex", () => {
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              tag: "column_set",
              property: {
                columns: [
                  {
                    tag: "column",
                    property: {
                      customBackgroundStyle: {
                        lightMode: "#d96b2714",
                        darkMode: "#d96b2726",
                      },
                      elements: [
                        {
                          tag: "markdown",
                          property: {
                            textStyle: { size: "heading" },
                            elements: [
                              {
                                tag: "plain_text",
                                property: {
                                  content: "85%",
                                  textStyle: {
                                    attributes: ["bold"],
                                    customColor: {
                                      lightMode: "#d96b27ff",
                                      darkMode: "#f08c4bff",
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                        {
                          tag: "markdown",
                          property: {
                            textStyle: { size: "small" },
                            elements: [
                              {
                                tag: "plain_text",
                                property: {
                                  content: "欺骗差距闭合率",
                                  textStyle: {
                                    customColor: {
                                      lightMode: "#6e737dff",
                                      darkMode: "#a6a6a6ff",
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    }) as AnyDsl;

    const serialized = JSON.stringify(dsl);
    assert.doesNotMatch(serialized, /#d96b27ff/);
    assert.doesNotMatch(serialized, /#6e737dff/);
    assert.match(serialized, /cus-bg-0/);
    const style = (dsl.config as { style?: { color?: Record<string, any> } })?.style;
    assert.notEqual(style?.color?.["cus-bg-0"], undefined);
    assert.notEqual(style?.color?.["cus-accent"], undefined);

    const col = ((dsl.body as { elements: unknown[] }).elements[0] as { columns: unknown[] }).columns[0] as {
      elements: Record<string, any>[];
    };
    const heading = col.elements[0];
    const caption = col.elements[1];
    // 显式 customColor 保留为 cus-text-*，即使 RGB 与去 alpha 后的首背景相同
    assert.partialDeepStrictEqual(heading, {
      content: "<font color='cus-text-0'>**85%**</font>",
      text_size: "heading",
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(heading, "font_color"));
    assert.deepEqual(style?.color?.["cus-text-0"], {
      light_mode: "rgba(217,107,39,1)",
      dark_mode: "rgba(240,140,75,1)",
    });
    assert.equal(caption?.content, "<font color='cus-text-1'>欺骗差距闭合率</font>");
    assert.ok(!Object.prototype.hasOwnProperty.call(caption, "font_color"));
  });
});

describe("element_id (RAW id → DSL element_id)", () => {
  it("preserves custom ids on markdown / button / column_set", () => {
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              id: "md_intro",
              tag: "markdown",
              property: {
                originTag: "markdown",
                elements: [{ tag: "plain_text", property: { content: "hi" } }],
              },
            },
            {
              id: "btn_ok",
              tag: "button",
              property: {
                text: { tag: "plain_text", property: { content: "OK" } },
                actions: [{ type: "callback", action: { value: { a: 1 }, isValueObjectType: true } }],
              },
            },
            {
              id: "card_state",
              tag: "column_set",
              property: {
                columns: [
                  {
                    id: "col_main",
                    tag: "column",
                    property: { width: "auto", elements: [] },
                  },
                ],
              },
            },
          ],
        },
      },
    }) as AnyDsl;

    const els = (dsl.body as { elements: Record<string, any>[] }).elements;
    assert.partialDeepStrictEqual(els[0], { tag: "markdown", element_id: "md_intro", content: "hi" });
    assert.partialDeepStrictEqual(els[1], { tag: "button", element_id: "btn_ok" });
    assert.partialDeepStrictEqual(els[2], { tag: "column_set", element_id: "card_state" });
    const col = (els[2]!.columns as Record<string, any>[])[0]!;
    assert.partialDeepStrictEqual(col, { tag: "column", element_id: "col_main" });
  });

  it("drops Feishu auto-generated ids like _1 / _2_0", () => {
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              id: "_1",
              tag: "markdown",
              property: {
                originTag: "markdown",
                elements: [{ tag: "plain_text", property: { content: "x" } }],
              },
            },
            {
              id: "_2_0",
              tag: "button",
              property: {
                text: { tag: "plain_text", property: { content: "y" } },
              },
            },
          ],
        },
      },
    }) as AnyDsl;

    const els = (dsl.body as { elements: Record<string, any>[] }).elements;
    assert.ok(!Object.prototype.hasOwnProperty.call(els[0], "element_id"));
    assert.ok(!Object.prototype.hasOwnProperty.call(els[1], "element_id"));
    // 也不应把非法 id 泄漏为顶层 id
    assert.ok(!Object.prototype.hasOwnProperty.call(els[0], "id"));
    assert.ok(!Object.prototype.hasOwnProperty.call(els[1], "id"));
  });

  it("projects column_set open_url actions to action.multi_url (state host)", () => {
    const stateUrl = "lark://msgcard/unsupported_action#s1.abc";
    const dsl = rawToDsl({
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [
            {
              id: "card_state",
              tag: "column_set",
              property: {
                actions: [
                  {
                    type: "open_url",
                    action: {
                      url: stateUrl,
                      pcURL: stateUrl,
                      iosURL: stateUrl,
                      androidURL: stateUrl,
                    },
                  },
                ],
                columns: [
                  {
                    id: "_3",
                    tag: "column",
                    property: { width: "auto", elements: [] },
                  },
                ],
              },
            },
          ],
        },
      },
    }) as AnyDsl;

    const host = (dsl.body as { elements: Record<string, any>[] }).elements[0]!;
    assert.equal(host.element_id, "card_state");
    assert.equal(host.actions, undefined);
    assert.deepEqual(host.action, {
      multi_url: {
        url: stateUrl,
        pc_url: stateUrl,
        ios_url: stateUrl,
        android_url: stateUrl,
      },
    });
    // 自动列 id 丢弃
    const col = (host.columns as Record<string, any>[])[0]!;
    assert.ok(!Object.prototype.hasOwnProperty.call(col, "element_id"));
  });
});


describe("img_combination projection", () => {
  it("projects combinationMode / imgList / cornerRadiusValue / transparent", () => {
    const dsl = rawToDsl({
      json_card: {
        schema: "2.0",
        body: {
          elements: [
            {
              id: "_2",
              tag: "img_combination",
              property: {
                combinationMode: "double",
                imgList: [
                  { imageID: "10", index: 0, transparent: true },
                  { imageID: "11", index: 1 },
                ],
                cornerRadiusValue: { type: "pixels", value: 8 },
                transparent: false,
              },
            },
          ],
        },
      },
      json_attachment: {
        images: {
          "10": { origin_key: "img_v3_combination_a" },
          "11": { origin_key: "img_v3_combination_b" },
        },
      },
    }) as AnyDsl;

    const el = findElements(dsl, (e) => e.tag === "img_combination")[0]!;
    assert.partialDeepStrictEqual(el, {
      tag: "img_combination",
      combination_mode: "double",
      img_list: [
        { img_key: "img_v3_combination_a", transparent: true },
        { img_key: "img_v3_combination_b" },
      ],
      corner_radius: "8px",
      combination_transparent: false,
    });
    // 编辑器渲染态 index 不进公开 DSL。
    assert.ok(!(JSON.stringify(el)).includes("imageID"));
    assert.ok(!(JSON.stringify(el)).includes("index"));
  });

  it("keeps an already-public img_key item and falls back to img_id", () => {
    const dsl = rawToDsl({
      json_card: {
        body: {
          elements: [
            {
              tag: "img_combination",
              property: {
                combinationMode: "bisect",
                imgList: [{ img_key: "img_v3_public" }, { imageID: "42" }],
              },
            },
          ],
        },
      },
    }) as AnyDsl;

    const el = findElements(dsl, (e) => e.tag === "img_combination")[0]!;
    assert.deepEqual(el.img_list, [
      { img_key: "img_v3_public" },
      { img_id: "42" },
    ]);
  });
});

describe("select_img projection", () => {
  it("projects options (imageID → img_key), camelCase config and actions → behaviors", () => {
    const dsl = rawToDsl({
      json_card: {
        schema: "2.0",
        body: {
          elements: [
            {
              id: "_3",
              tag: "select_img",
              property: {
                options: [
                  {
                    imageID: "20",
                    value: "a",
                    disabled: true,
                    disabledTips: {
                      tag: "plain_text",
                      property: { content: "不可选" },
                    },
                    hoverTips: {
                      tag: "plain_text",
                      property: { content: "选项 A" },
                    },
                    transparent: true,
                  },
                  { imageID: "21", value: "b" },
                ],
                multiSelect: true,
                selectedValues: ["a"],
                layout: "trisect",
                style: "laser",
                aspectRatio: "1:1",
                canPreview: false,
                widthValue: { type: "pixels", value: 300 },
                disabledTips: {
                  tag: "plain_text",
                  property: { content: "整体禁用" },
                },
                actions: [{ type: "action_request", action: { value: { k: "v" } } }],
              },
            },
          ],
        },
      },
      json_attachment: {
        images: {
          "20": { origin_key: "img_v3_select_a" },
          "21": { origin_key: "img_v3_select_b" },
        },
      },
    }) as AnyDsl;

    const el = findElements(dsl, (e) => e.tag === "select_img")[0]!;
    assert.partialDeepStrictEqual(el, {
      tag: "select_img",
      multi_select: true,
      selected_values: ["a"],
      layout: "trisect",
      style: "laser",
      aspect_ratio: "1:1",
      can_preview: false,
      width: "300px",
      disabled_tips: { tag: "plain_text", content: "整体禁用" },
      behaviors: [{ type: "callback", value: { k: "v" } }],
    });
    assert.equal(el.actions, undefined);
    assert.deepEqual(el.options, [
      {
        img_key: "img_v3_select_a",
        value: "a",
        disabled: true,
        disabled_tips: { tag: "plain_text", content: "不可选" },
        hover_tips: { tag: "plain_text", content: "选项 A" },
        transparent: true,
      },
      { img_key: "img_v3_select_b", value: "b" },
    ]);
    // 自动编号（_3）不是合法公开 id，投影时丢弃。
    assert.equal(el.element_id, undefined);
  });
});

describe("collapsible_panel header projection", () => {
  // 官方 CollapsiblePanelHeader 的字段全集（additionalProperties: false）：
  // title / expanded_title / background_color / padding / width / vertical_align /
  // position / icon / icon_position / icon_expanded_angle。
  // 这些都是公开 DSL 字段，RAW→DSL 一个都不能丢，否则往返有损。
  it("keeps every documented header field (width / position / vertical_align)", () => {
    const raw = {
      schema: "2.0",
      body: {
        tag: "body",
        property: {
          elements: [{
            tag: "collapsible_panel",
            property: {
              expanded: false,
              header: {
                title: { tag: "plain_text", content: "展开详情" },
                expanded_title: { tag: "plain_text", content: "收起详情" },
                background_color: "blue-50",
                padding: "8px 12px 8px 12px",
                width: "auto_when_fold",
                vertical_align: "top",
                position: "bottom",
                icon: { tag: "standard_icon", token: "down_outlined" },
                icon_position: "follow_text",
                icon_expanded_angle: 180,
              },
              elements: [{ tag: "markdown", property: { content: "x" } }],
            },
          }],
        },
      },
    };
    const dsl = rawToDsl(raw as never) as AnyDsl;
    const el = findElements(dsl, (e) => e.tag === "collapsible_panel")[0]!;
    assert.partialDeepStrictEqual(el.header, {
      title: { tag: "plain_text", content: "展开详情" },
      expanded_title: { tag: "plain_text", content: "收起详情" },
      background_color: "blue-50",
      padding: "8px 12px 8px 12px",
      width: "auto_when_fold",
      vertical_align: "top",
      position: "bottom",
      icon_position: "follow_text",
      icon_expanded_angle: 180,
    });
  });

  it("round-trips header layout fields DSL → RAW → DSL", () => {
    const dsl = {
      schema: "2.0",
      body: {
        elements: [{
          tag: "collapsible_panel",
          expanded: true,
          direction: "horizontal",
          horizontal_spacing: "8px",
          vertical_spacing: "4px",
          horizontal_align: "center",
          vertical_align: "bottom",
          header: {
            title: { tag: "lark_md", content: "**展开**" },
            expanded_title: { tag: "lark_md", content: "**收起**" },
            width: "auto",
            vertical_align: "top",
            position: "bottom",
            background_color: "grey-100",
            icon_position: "left",
            icon_expanded_angle: -90,
          },
          elements: [{ tag: "markdown", content: "x" }],
        }],
      },
    };
    const back = rawToDsl(dslToRaw(dsl as never) as never) as AnyDsl;
    const el = findElements(back, (e) => e.tag === "collapsible_panel")[0]!;
    assert.partialDeepStrictEqual(el, {
      expanded: true,
      direction: "horizontal",
      horizontal_spacing: "8px",
      vertical_spacing: "4px",
      horizontal_align: "center",
      vertical_align: "bottom",
    });
    assert.partialDeepStrictEqual(el.header, {
      expanded_title: { tag: "lark_md", content: "**收起**" },
      width: "auto",
      vertical_align: "top",
      position: "bottom",
      background_color: "grey-100",
      icon_position: "left",
      icon_expanded_angle: -90,
    });
  });
});

describe("img.title", () => {
  it("RAW 文本元素 ↔ 公开 BaseText（plain_text / lark_md）保留样式字段", () => {
    const dsl = {
      schema: "2.0",
      body: {
        elements: [
          {
            tag: "img",
            img_key: "img_v3_a",
            title: {
              tag: "plain_text",
              content: "标题",
              text_size: "notation",
              text_color: "grey",
              lines: 2,
            },
          },
          {
            tag: "img",
            img_key: "img_v3_b",
            title: { tag: "lark_md", content: "**粗体**", text_align: "center" },
          },
        ],
      },
    };
    const raw = dslToRaw(dsl as never) as Record<string, any>;
    const back = rawToDsl(raw as never) as AnyDsl;
    const titles = findElements(back, (e) => e.tag === "img").map((e) => e.title);
    assert.deepEqual(titles, [
      { tag: "plain_text", content: "标题", text_size: "notation", text_color: "grey", lines: 2 },
      { tag: "lark_md", content: "**粗体**", text_align: "center" },
    ]);
    // 幂等：rawToDsl 对自己的输出再跑一遍不产生 diff
    assert.deepEqual(rawToDsl(back as never), back);
  });
});

describe("spacing default 回显", () => {
  // RAW 回读会给每一列都带 verticalSpacingValue(builtin default)，即使卡片从没设过
  // 间距；把 `default` 投到公开 DSL 上会被飞书整卡拒绝（11310 vertical spacing
  // invalid，ErrPath 指向父容器），所以公开 DSL 一律不写这个值。
  const raw = {
    schema: "2.0",
    body: {
      id: "_1",
      property: {
        verticalSpacing: "default",
        elements: [
          {
            id: "_2",
            tag: "column_set",
            property: {
              flexMode: "none",
              horizontalSpacing: "default",
              horizontalSpacingValue: {
                type: "builtin_column_set_horizontal_spacing",
                value: "default",
              },
              columns: [
                {
                  id: "_3",
                  tag: "column",
                  property: {
                    verticalSpacingValue: {
                      type: "builtin_column_vertical_spacing",
                      value: "default",
                    },
                    horizontalSpacingValue: {
                      type: "builtin_column_horizontal_spacing",
                      value: "default",
                    },
                    elements: [],
                  },
                },
                { id: "_4", tag: "column", property: { verticalSpacing: "default", elements: [] } },
                {
                  id: "_5",
                  tag: "column",
                  property: {
                    verticalSpacing: "default",
                    verticalSpacingValue: { type: "pixels", value: 8 },
                    elements: [],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    config: {},
  };

  it("builtin default 回显 / 枚举都落不到公开 DSL 上，像素回显照常折算", () => {
    const dsl = rawToDsl(raw as never) as AnyDsl;
    const body = dsl.body as Record<string, any>;
    assert.equal("vertical_spacing" in body, false);

    const set = findElements(dsl, (e) => e.tag === "column_set")[0]!;
    assert.equal("horizontal_spacing" in set, false);

    const columns = (set.columns as Record<string, any>[]) ?? [];
    assert.equal("vertical_spacing" in columns[0]!, false);
    assert.equal("horizontal_spacing" in columns[0]!, false);
    assert.equal("vertical_spacing" in columns[1]!, false);
    // 像素回显比粗粒度枚举更精确：default 被像素值覆盖，而不是被丢掉
    assert.equal(columns[2]!.vertical_spacing, "8px");
  });

  it("幂等：再跑一遍 rawToDsl 不产生 diff", () => {
    const once = rawToDsl(raw as never) as AnyDsl;
    assert.deepEqual(rawToDsl(once as never), once);
  });
});
