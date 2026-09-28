import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isRawCardEnvelope, rawCardToDsl, rawToDsl } from "../src/raw-to-dsl.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));
}

interface AnyDsl {
  schema?: string;
  config?: Record<string, unknown>;
  body?: Record<string, unknown>;
  header?: Record<string, unknown>;
}

function findElements(dsl: AnyDsl, predicate: (el: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  function walk(v: unknown) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const rec = v as Record<string, unknown>;
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
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
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
    expect(isRawCardEnvelope(env)).toBe(true);
  });

  it("rejects non-envelope payloads", () => {
    expect(isRawCardEnvelope(null)).toBe(false);
    expect(isRawCardEnvelope({})).toBe(false);
    expect(isRawCardEnvelope({ schema: "2.0", body: {} })).toBe(false);
    expect(isRawCardEnvelope("string")).toBe(false);
  });
});

describe("rawCardToDsl basic shape", () => {
  it("produces { schema, config, body, header }", () => {
    const dsl = rawCardToDsl(loadFixture("markdown-at.raw.json")) as AnyDsl;
    expect(dsl.schema).toBe("2.0");
    expect(dsl.config).toEqual({ update_multi: true });
    expect(dsl.body).toBeDefined();
    expect(dsl.header).toBeDefined();
  });

  it("returns the input unchanged when it isn't a raw envelope", () => {
    const arg = { schema: "2.0", body: { elements: [] } };
    expect(rawCardToDsl(arg)).toBe(arg);
  });
});

describe("padding / margin projection", () => {
  it("projects column padding from { type:pixels, value } objects to 'Tpx Rpx Bpx Lpx'", () => {
    const dsl = rawCardToDsl(loadFixture("grid-images.raw.json")) as AnyDsl;
    expect(dsl.body?.padding).toMatch(/^\d+px \d+px \d+px \d+px$/);
  });

  it("preserves a non-zero column padding when the column has a colored background_style", () => {
    // The motivating bug: user_card_content drops column.padding when bg is non-default.
    // raw_card_content keeps it; we verify our projection passes that 12px through.
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const colored = findElements(dsl, (el) =>
      el.tag === "column" && typeof el.background_style === "string" && el.background_style !== "default",
    );
    expect(colored.length).toBeGreaterThan(0);
    for (const col of colored) {
      expect(col.padding).toMatch(/^\d+px \d+px \d+px \d+px$/);
    }
  });
});

describe("img projection", () => {
  it("resolves imageID into img_key via the attachment table", () => {
    const dsl = rawCardToDsl(loadFixture("grid-images.raw.json")) as AnyDsl;
    const imgs = findElements(dsl, (el) => el.tag === "img");
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.img_key).toMatch(/^img_v3_/);
      expect(img).not.toHaveProperty("image_id");
    }
  });

  it("collapses width_height_pixels size_value into 'Wpx Hpx'", () => {
    const dsl = rawCardToDsl(loadFixture("grid-images.raw.json")) as AnyDsl;
    const sized = findElements(dsl, (el) => el.tag === "img" && typeof el.size === "string");
    expect(sized.length).toBeGreaterThan(0);
    for (const img of sized) {
      expect(img.size).toMatch(/^\d+px \d+px$/);
    }
  });
});

describe("markdown re-stitch", () => {
  it("renders <at id=all> for at_all child", () => {
    const dsl = rawCardToDsl(loadFixture("markdown-at.raw.json")) as AnyDsl;
    const md = findElements(dsl, (el) => el.tag === "markdown" && typeof el.content === "string" && /Hi/.test(el.content as string));
    expect(md.length).toBe(1);
    expect(md[0]?.content).toContain("<at id=all></at>");
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
    expect(md.length).toBe(1);
    expect(md[0]?.content).toBe(
      "<at id=ou_84cb0e9f50147ff0de98f2122705343f></at> 你好～",
    );
    expect(md[0]?.content).not.toContain("<at></at>");
    // Must not leak the numeric attachment user_id into the mention.
    expect(md[0]?.content).not.toContain("7441015090323947523");
  });

  it("collapses bold + color into inline markdown markers", () => {
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const md = findElements(dsl, (el) =>
      el.tag === "markdown" && typeof el.content === "string" && (el.content as string).includes("**"),
    );
    expect(md.length).toBeGreaterThan(0);
  });

  it("preserves heading children as '# '/'## '/'### ' inline", () => {
    const dsl = rawCardToDsl(loadFixture("person-input.raw.json")) as AnyDsl;
    const md = findElements(dsl, (el) =>
      el.tag === "markdown" && typeof el.content === "string" && /(^|\n)##? /.test(el.content as string),
    );
    expect(md.length).toBeGreaterThan(0);
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
    expect(contents.some((c) => c.includes("hello :OK: world :Fire:"))).toBe(true);
    // Inline within a list item (routes through childToMarkdown, not the
    // inline-segment path).
    expect(contents.some((c) => c.includes(":Blush:"))).toBe(true);
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
    expect(contents.some((c) =>
      c.includes("**销售顾问**") &&
      c.includes("<at id=on_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa></at>") &&
      c.includes("<person id='on_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' show_name=true show_avatar=true style='normal'></person>")
    )).toBe(true);

    // Standalone person chips (style=normal and style=capsule) both survive.
    expect(contents.some((c) =>
      c.includes("style='normal'") && c.includes("style='capsule'")
    )).toBe(true);

    // Editor-only pillShaped must not leak.
    expect(JSON.stringify(dsl)).not.toContain("pillShaped");
    expect(JSON.stringify(dsl)).not.toContain("pill_shaped");
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
    expect(contents.some((c) =>
      c.includes("<audio ") &&
      c.includes("file_key='file_v3_0014e_69d48a39-571c-4bb6-8974-70fdf73711bg'") &&
      c.includes("audio_id='4fbd222d-659a-43ad-b62c-e4cea7ae177c'") &&
      c.includes("show_time=true") &&
      c.includes("background_color='grey-200'") &&
      c.includes("fill_color='blue-800'") &&
      c.includes("fallback_url='https://open.feishu.cn/'") &&
      c.includes("</audio>")
    )).toBe(true);

    // Mixed with preceding plain_text + style=speak + fallback_text.
    expect(contents.some((c) =>
      c.includes("旁白：") &&
      c.includes("file_key='file_v3_0014e_a372dd32-d342-409d-b8d3-97d8277a6d8g'") &&
      c.includes("style='speak'") &&
      c.includes("fallback_text='[音频链接]'")
    )).toBe(true);

    // Must stay inside markdown content — not promoted to top-level audio.
    expect(findElements(dsl, (el) => el.tag === "audio")).toHaveLength(0);
    // Empty-content markdown shells must not remain for the audio blocks.
    expect(md.every((el) => typeof el.content === "string" && (el.content as string).length > 0)).toBe(true);
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
    expect(md.length).toBe(1);
    const content = md[0]?.content as string;
    // The bullet and the following bold paragraph must not share a line.
    expect(content).not.toContain("根因排查中\n**历史问题TOP");
    // They must be split by a blank line that closes the list block.
    expect(content).toContain("根因排查中\n\n**历史问题TOP");
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
    expect(md.length).toBe(1);
    const content = md[0]?.content as string;
    expect(content).toBe(
      "\n1. 进入开发阶段并分配任务\n    1. 前端模块：负责页面开发与接口联调\n        1. 完成页面原型设计\n        2. 与后端接口联调\n    2. 后端模块：负责接口开发\n        1. 数据库设计与实现\n        2. API 接口开发与优化\n2. 测试模块：编写用例并执行回归测试\n    1. 单元测试覆盖率 ≥ 80%\n    2. 集成测试与性能测试\n3. 发布上线并收集用户反馈\n    1. 灰度发布至 10% 用户\n    2. 收集首批用户反馈并整理报告\n\n",
    );
    // Must not use the old continuous+2space shape.
    expect(content).not.toContain("\n  2. 前端模块");
    expect(content).not.toContain("\n8. 测试模块");
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
    expect(md[0]?.content).toBe("\n1. 父一\n    1. 子一\n    2. 子二\n2. 父二\n\n");
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
    expect(block).toBeDefined();
    // The three raw line entries must come back as three separate lines.
    expect(block).toContain("```plain_text\nline one\nline two\nline three\n```");
  });

  it("normalizes the single-entry-with-newlines encoding to no trailing blank line", () => {
    const dsl = rawCardToDsl(loadFixture("code-block.raw.json")) as AnyDsl;
    const block = codeBlocks(dsl).find((c) => c.includes("npm run build"));
    expect(block).toBeDefined();
    // The raw explicit trailing "\n" must not stack with our closing-fence
    // newline into a blank line before ```.
    expect(block).toContain("```bash\nnpm run build\n```");
    expect(block).not.toContain("npm run build\n\n```");
  });
});

describe("button projection", () => {
  it("projects raw button.actions:[{type:open_url}] to behaviors[]", () => {
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const buttons = findElements(dsl, (el) => el.tag === "button");
    const withBehaviors = buttons.find((b) => Array.isArray(b.behaviors));
    expect(withBehaviors).toBeDefined();
    const behavior = (withBehaviors!.behaviors as unknown[])[0] as Record<string, unknown>;
    expect(behavior.type).toBe("open_url");
    expect(behavior.default_url).toMatch(/^https?:\/\//);
  });

  it("does not write empty pc_url / ios_url / android_url fields", () => {
    const dsl = rawCardToDsl(loadFixture("button-behaviors.raw.json")) as AnyDsl;
    const buttons = findElements(dsl, (el) => el.tag === "button");
    for (const b of buttons) {
      const behaviors = b.behaviors as unknown[] | undefined;
      if (!behaviors) continue;
      for (const beh of behaviors) {
        expect(beh).not.toHaveProperty("pc_url");
        expect(beh).not.toHaveProperty("ios_url");
        expect(beh).not.toHaveProperty("android_url");
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
    const btn = (dsl.body as { elements: Record<string, unknown>[] }).elements[0]!;
    const beh = (btn.behaviors as Record<string, unknown>[])[0]!;
    expect(beh).toEqual({
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
    const btn = (dsl.body as { elements: Record<string, unknown>[] }).elements[0]!;
    const beh = (btn.behaviors as Record<string, unknown>[])[0]!;
    expect(beh.default_url).toBe("https://example.com");
    expect(beh.pc_url).toBe(copy);
    expect(beh.ios_url).toBe(copy);
    expect(beh.android_url).toBe(copy);
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
    const btn = (dsl.body as { elements: Record<string, unknown>[] }).elements[0]!;
    expect(btn.behaviors).toBeUndefined();
    expect(btn.multi_url).toEqual({
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
    const box = (dsl.body as { elements: Record<string, unknown>[] }).elements[0]!;
    const beh = (box.behaviors as Record<string, unknown>[])[0]!;
    expect(beh).toEqual({
      type: "open_url",
      default_url: "https://example.com",
      pc_url: copy,
      ios_url: copy,
      android_url: copy,
    });
  });
});

describe("header projection", () => {
  it("flattens raw card_header to top-level header without tag", () => {
    const dsl = rawCardToDsl(loadFixture("header-icon.raw.json")) as AnyDsl;
    expect(dsl.header).toBeDefined();
    expect(dsl.header).not.toHaveProperty("tag");
    expect(dsl.header?.template).toBeDefined();
  });

  it("projects raw udIcon to header.icon as standard_icon", () => {
    const dsl = rawCardToDsl(loadFixture("header-icon.raw.json")) as AnyDsl;
    const icon = dsl.header?.icon as Record<string, unknown> | undefined;
    expect(icon).toBeDefined();
    expect(icon?.tag).toBe("standard_icon");
    expect(typeof icon?.token).toBe("string");
  });

  it("projects header subtitle originTag:lark_md to public { tag:'lark_md', content }", () => {
    const dsl = rawCardToDsl(loadFixture("header-lark-md.raw.json")) as AnyDsl;
    const title = dsl.header?.title as Record<string, unknown> | undefined;
    const subtitle = dsl.header?.subtitle as Record<string, unknown> | undefined;
    expect(title).toEqual({
      tag: "plain_text",
      content: "🛡️ OpenAI 越界入侵 Hugging Face：事件复盘与 5 大安全反思",
    });
    expect(subtitle?.tag).toBe("lark_md");
    expect(subtitle?.content).toBe("<at id=ou_113bce58203b98552a06a738827e95b7></at>");
    expect(subtitle).not.toHaveProperty("text_align");
    expect(subtitle).not.toHaveProperty("elements");
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
    expect(dsl.header).not.toHaveProperty("tag");
    expect(dsl.header?.title).toEqual({ tag: "plain_text", content: "事件复盘" });
    expect(dsl.header?.subtitle).toEqual({
      tag: "lark_md",
      content: "<at id=ou_abc></at>",
    });
    expect(dsl.header?.template).toBe("carmine");
  });
});

describe("chart projection", () => {
  it("preserves chart_spec internals as camelCase (vega is the engine)", () => {
    const dsl = rawCardToDsl(loadFixture("chart.raw.json")) as AnyDsl;
    const charts = findElements(dsl, (el) => el.tag === "chart");
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) {
      const spec = chart.chart_spec as Record<string, unknown> | undefined;
      expect(spec).toBeDefined();
      // canonical vega keys MUST stay camelCase
      const sampleKeys = Object.keys(spec!).join(",");
      // Any of these would be wrong:
      expect(sampleKeys).not.toContain("x_field");
      expect(sampleKeys).not.toContain("y_field");
      expect(sampleKeys).not.toContain("band_width");
      expect(sampleKeys).not.toContain("corner_radius");
    }
  });

  it("drops min_lib_version (raw editor metadata, public schema rejects it)", () => {
    const dsl = rawCardToDsl(loadFixture("chart.raw.json")) as AnyDsl;
    const charts = findElements(dsl, (el) => el.tag === "chart");
    for (const chart of charts) {
      expect(chart).not.toHaveProperty("min_lib_version");
      expect(chart).not.toHaveProperty("minLibVersion");
    }
  });
});

describe("table projection", () => {
  it("flattens columns to snake_case + width string (from widthValue echo)", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    expect(table).toBeDefined();
    const columns = table.columns as Array<Record<string, unknown>>;
    expect(columns.length).toBe(5);
    // camelCase raw fields must be projected to snake_case public fields
    const rank = columns[0]!;
    expect(rank.name).toBe("rank");
    expect(rank.display_name).toBe("排名");
    expect(rank.data_type).toBe("text");
    expect(rank.horizontal_align).toBe("center");
    expect(rank.width).toBe("80px"); // widthValue{pixels,80} -> "80px"
    expect(rank).not.toHaveProperty("displayName");
    expect(rank).not.toHaveProperty("widthValue");
    // builtin "auto" width keyword projected verbatim
    const brand = columns[1]!;
    expect(brand.width).toBe("auto");
    // number column keeps its format object
    const sales = columns[2]!;
    expect(sales.data_type).toBe("number");
    expect((sales.format as Record<string, unknown>).precision).toBe(1);
  });

  it("unwraps every cell from its { data } envelope to a bare value", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    const rows = table.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBe(5);
    const first = rows[0]!;
    // text / number cells become bare strings (NOT { data: ... })
    expect(first.brand).toBe("比亚迪汽车");
    expect(first.rank).toBe("1");
    expect(first.sales).toBe("195.8");
    expect(first.brand).not.toHaveProperty?.("data");
    // options cell becomes the bare [{ text, color }] array
    expect(first.status).toEqual([{ color: "green", text: "新能源" }]);
  });

  it("projects header_style / row_height / page_size from raw echoes", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    const hs = table.header_style as Record<string, unknown>;
    expect(hs.background_style).toBe("grey");
    expect(hs.bold).toBe(true);
    expect(hs.text_align).toBe("center");
    expect(hs.lines).toBe(1); // linesValue{int_number,1} -> lines:1
    expect(hs).not.toHaveProperty("linesValue");
    expect(hs).not.toHaveProperty("platformTextSize");
    expect(table.row_height).toBe("middle"); // rowHeightValue.value
    expect(table.page_size).toBe(5);
  });

  it("no camelCase / {data} leaks anywhere under the projected table", () => {
    const dsl = rawCardToDsl(loadFixture("table.raw.json")) as AnyDsl;
    const [table] = findElements(dsl, (el) => el.tag === "table");
    const leaks = collectKeys(table, (k) =>
      k === "widthValue" || k === "displayName" || k === "dataType" ||
      k === "horizontalAlign" || k === "rowHeightValue" || k === "pageSize" ||
      k === "freezeFirstColumn" || k === "linesValue",
    );
    expect(leaks).toEqual([]);
  });
});

describe("person projection", () => {
  it("projects userID to user_id and drops pillShaped", () => {
    const dsl = rawCardToDsl(loadFixture("person-input.raw.json")) as AnyDsl;
    const persons = findElements(dsl, (el) => el.tag === "person");
    expect(persons.length).toBeGreaterThan(0);
    for (const p of persons) {
      expect(p.user_id).toMatch(/^ou_/);
      expect(p).not.toHaveProperty("pill_shaped");
      expect(p).not.toHaveProperty("pillShaped");
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
    expect(JSON.stringify(dsl)).not.toContain("person_v1");
    const persons = findElements(dsl, (el) => el.tag === "person");
    expect(persons.length).toBeGreaterThan(0);
    for (const p of persons) {
      expect(p.user_id).toMatch(/^ou_/);
      expect(p).not.toHaveProperty("pillShaped");
      expect(p).not.toHaveProperty("pill_shaped");
      // margin {top,..} pixels projected to an "Npx ..." box string.
      if ("margin" in p) expect(typeof p.margin).toBe("string");
    }
  });

  it("projects person_list and strips schema-rejected fields", () => {
    const dsl = rawCardToDsl(loadFixture("person-list.raw.json")) as AnyDsl;
    const lists = findElements(dsl, (el) => el.tag === "person_list");
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) {
      // persons[i] must be { id } only — no editor-only `type`.
      expect(Array.isArray(list.persons)).toBe(true);
      for (const person of list.persons as Record<string, unknown>[]) {
        expect(person.id).toMatch(/^ou_/);
        expect(person).not.toHaveProperty("type");
        expect(Object.keys(person)).toEqual(["id"]);
      }
      // 官方公开字段 mode/style/count 可保留；仅丢弃编辑器私有 fallback
      expect(list).not.toHaveProperty("fallback");
    }
  });

  it("emits no person_list field the public schema rejects", () => {
    const dsl = rawCardToDsl(loadFixture("person-list.raw.json")) as AnyDsl;
    // persons[i].type 是编辑器私有；mode/count/style 已是官方公开字段，允许保留。
    const lists = findElements(dsl, (el) => el.tag === "person_list");
    for (const list of lists) {
      expect(collectKeys(list, (k) => k === "type")).toEqual([]);
    }
  });
});

describe("input projection", () => {
  it("strips editor-only fields (actions, autoResize, showCount, showIcon, disabled:false)", () => {
    const dsl = rawCardToDsl(loadFixture("person-input.raw.json")) as AnyDsl;
    const inputs = findElements(dsl, (el) => el.tag === "input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const inp of inputs) {
      expect(inp).not.toHaveProperty("actions");
      expect(inp).not.toHaveProperty("auto_resize");
      expect(inp).not.toHaveProperty("show_count");
      expect(inp).not.toHaveProperty("show_icon");
      expect(inp).not.toHaveProperty("disabled");
      expect(inp).not.toHaveProperty("required"); // false default is dropped
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
    expect(Array.isArray(dsl.body?.elements)).toBe(true);
    expect((dsl.body!.elements as unknown[]).length).toBe(3);
  });

  it("flattens v1 `div` section blocks to top-level markdown (schema 2.0 has no div)", () => {
    // Feishu rejects a div: "type of element is not supported tag: markdown,
    // path: ...div->text". The live payload wraps text in a v1 div; we promote
    // the single text child to a top-level markdown element.
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    const tags = (dsl.body!.elements as Array<Record<string, unknown>>).map((e) => e.tag);
    expect(tags).toEqual(["markdown", "img", "markdown"]);
    expect(findElements(dsl, (el) => el.tag === "div")).toEqual([]);
  });

  it("emits schema \"2.0\" even when the raw json_card omits it", () => {
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    expect(dsl.schema).toBe("2.0");
  });

  it("resolves img imageID -> img_key and drops v1-only custom_width", () => {
    // custom_width has no slot in v2 img sizing; Feishu rejects it next to
    // scale_type ("img mode is not supported" / "img size is not allowed").
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    const imgs = findElements(dsl, (el) => el.tag === "img");
    expect(imgs.length).toBe(1);
    expect(imgs[0]!.img_key).toMatch(/^img_/);
    expect(imgs[0]).not.toHaveProperty("image_id");
    expect(imgs[0]).not.toHaveProperty("custom_width");
  });

  it("does not leak v1-only i18n_* mirrors or `lines` that schema 2.0 rejects", () => {
    // Feishu rejected real sends over these: the v2 lint flags `i18n_elements`
    // and the API returns 200621 "unknown property: lines". Both are editor
    // mirrors raw emits on every text/img/header node; none have a 2.0 slot.
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json")) as AnyDsl;
    const leaks = collectKeys(dsl, (k) => k.startsWith("i18n") || k === "lines");
    expect(leaks).toEqual([]);
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
    expect(md).toContain(`**1.**${SP}`);
    expect(md).toContain(`**2.**${SP}`);
    expect(md).toContain(`**·**${SP}`);
    // Broken: space hugged the closing `**` -> CommonMark prints literal stars.
    expect(md).not.toContain(`**1.${SP}**`);
    expect(md).not.toContain(`**2.${SP}**`);
    expect(md).not.toContain(`**·${SP}**`);
  });

  it("matches the archived expected DSL exactly", () => {
    const dsl = rawCardToDsl(loadFixture("live-bare-body.raw.json"));
    const expected = loadFixture("live-bare-body.expected.json");
    expect(dsl).toEqual(expected);
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
      expect(leaks).toEqual([]);
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
    expect(videos).toHaveLength(1);
    expect(videos[0]!.file_key).toBe("file_v3_video_abc");
    expect(videos[0]!.cover).toEqual({ img_key: "img_v3_cover_abc" });
    expect(videos[0]).not.toHaveProperty("cover_image_id");
    expect(videos[0]).not.toHaveProperty("video_id");
    expect(collectKeys(dsl, (k) => k === "cover_image_id" || k === "video_id")).toEqual([]);
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
    expect(serialized).not.toMatch(/#d96b27ff/);
    expect(serialized).not.toMatch(/#6e737dff/);
    expect(serialized).toMatch(/cus-bg-0/);
    const style = (dsl.config as { style?: { color?: Record<string, unknown> } })?.style;
    expect(style?.color?.["cus-bg-0"]).toBeDefined();
    expect(style?.color?.["cus-accent"]).toBeDefined();

    const col = ((dsl.body as { elements: unknown[] }).elements[0] as { columns: unknown[] }).columns[0] as {
      elements: Record<string, unknown>[];
    };
    const heading = col.elements[0];
    const caption = col.elements[1];
    expect(heading).toMatchObject({
      content: "<font color='cus-accent'>**85%**</font>",
      text_size: "heading",
    });
    expect(heading).not.toHaveProperty("font_color");
    expect(caption?.content).toBe("<font color='cus-text-1'>欺骗差距闭合率</font>");
    expect(caption).not.toHaveProperty("font_color");
  });
});
