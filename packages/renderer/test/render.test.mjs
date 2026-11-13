/**
 * 基础冒烟测试（node --test）。针对构建产物 dist/index.js。
 *   npm run build && npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderCardToString, renderCardToStringAsync, fetchCardMessage, mergeMentionsIntoPersons,
  arrayBufferToBase64, registerComponent, h, renderDslToString, ALL_CSS,
  feishuAudioHydrateJs, AUDIO_PAUSE_ICON_SVG,
} from '../dist/index.js';

const card = {
  json_card: {
    schema: '2.0',
    header: { tag: 'card_header', property: { template: 'green',
      title: { tag: 'plain_text', property: { content: '标题' } } } },
    body: { tag: 'body', property: { elements: [
      { tag: 'markdown', property: { textAlign: 'center', elements: [
        { tag: 'plain_text', property: { content: '正文', textStyle: { attributes: ['bold'], color: 'green' } } },
      ] } },
      { tag: 'hr', property: {} },
    ] } },
  },
};

test('renders header with template color', () => {
  const html = renderCardToString(card);
  assert.match(html, /universal-card-header--green/);
  assert.match(html, /#d0f5ce/); // green header bg
  assert.match(html, /标题/);
});

test('header subtitle lark_md / markdown：渲染 @ 提及，不漏字面 <at>', () => {
  const html = renderCardToString({
    json_card: {
      schema: '2.0',
      header: {
        tag: 'card_header',
        property: {
          template: 'carmine',
          title: { tag: 'plain_text', property: { content: '事件复盘' } },
          subtitle: {
            tag: 'markdown',
            property: {
              originTag: 'lark_md',
              elements: [{ tag: 'at', property: { userID: 'ou_113' } }],
            },
          },
        },
      },
      body: { tag: 'body', property: { elements: [] } },
    },
  }, { persons: { ou_113: { content: '赵天雄' } } });
  assert.match(html, /事件复盘/);
  assert.match(html, /universal-card-header__text-subtitle/);
  assert.match(html, /@赵天雄/);
  assert.doesNotMatch(html, /&lt;at/);
  assert.doesNotMatch(html, /<at id=/);
});

test('named color green = var(--G600), bold class, center align', () => {
  const html = renderCardToString(card);
  assert.match(html, /var\(--G600\)/);
  assert.match(html, /universal-card-text--green/);
  assert.match(html, /universal-card-text--bold/);
  assert.match(html, /text-align:center/);
});

test('named color orange = var(--O400)（引擎特例，非 O600）', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'plain_text',
            property: {
              content: '▲ +4s',
              textStyle: { attributes: ['bold'], color: 'orange' },
            },
          }],
        },
      },
    },
  });
  assert.match(html, /universal-card-text--orange/);
  assert.match(html, /universal-card-text--bold/);
  assert.match(html, /color:var\(--O400\)/);
  assert.doesNotMatch(html, /#a44904/i);
  assert.doesNotMatch(html, /font-weight/);
});

test('named color white = var(--N00)（引擎 static-white，紫底白字）', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'plain_text',
            property: {
              content: '直达投票页面',
              textStyle: { attributes: ['bold'], color: 'white' },
            },
          }],
        },
      },
    },
  });
  assert.match(html, /universal-card-text--white/);
  assert.match(html, /color:var\(--N00\)/);
});

test('DSL <font color=\'white\'> 渲染为白字', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "<font color='white'>**🚀 直达投票页面 · 支持妙卡**</font>",
        text_align: 'center',
      }],
    },
  });
  assert.match(html, /universal-card-text--white/);
  assert.match(html, /color:var\(--N00\)/);
});

test('hr renders', () => {
  const html = renderCardToString(card);
  assert.match(html, /universal-card-hr/);
});

// video / audio：无 resolveMedia 时出封面壳 / 播放条；有 src 时 video 走原生 controls。
test('video: 无 src 时渲染封面壳 + 播放钮', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'video',
            property: {
              fileID: 'file_v3_demo',
              coverImageID: 'img_v3_cover',
              showTime: true,
              enableDownload: true,
            },
          }],
        },
      },
    },
  }, {
    resolveImage: (p) => (p.imageID === 'img_v3_cover' ? 'https://example.com/cover.jpg' : null),
  });
  assert.match(html, /universal-card-video/);
  assert.match(html, /universal-card-video__cover/);
  assert.match(html, /universal-card-video__play-btn/);
  assert.match(html, /https:\/\/example\.com\/cover\.jpg/);
  assert.match(html, /universal-card-video__duration/);
  assert.doesNotMatch(html, /<video[\s>]/);
});

test('video: resolveMedia 有 src 时渲染原生 <video controls>', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'video',
            property: { fileID: 'file_v3_demo', enableDownload: false },
          }],
        },
      },
    },
  }, {
    resolveMedia: (p, kind) => (kind === 'video' && p.fileID === 'file_v3_demo'
      ? 'https://example.com/a.mp4' : null),
  });
  assert.match(html, /<video[^>]*class="universal-card-video"/);
  assert.match(html, /src="https:\/\/example\.com\/a\.mp4"/);
  assert.match(html, /controls=/);
  assert.match(html, /controlslist="nodownload"/);
});

test('audio: 渲染播放条壳 + fill 宽度', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'audio',
            property: {
              fileID: 'file_v3_audio',
              audioID: 'a1',
              showProgressBar: true,
              showTime: true,
              style: 'normal',
              widthValue: { type: 'builtin_width', value: 'fill' },
            },
          }],
        },
      },
    },
  }, {
    resolveMedia: (p) => (p.fileID === 'file_v3_audio' ? 'https://example.com/a.opus' : null),
  });
  assert.match(html, /universal-card-audio__wrapper/);
  assert.match(html, /universal-card-audio__wrapper--show-time/);
  assert.match(html, /width:100%/);
  assert.match(html, /universal-card-audio__slider/);
  assert.match(html, /universal-card-audio__time/);
  assert.match(html, /PlayRoundFilled/);
  assert.match(html, /<audio[^>]*src="https:\/\/example\.com\/a\.opus"/);
});

// 真机 RAW：音频常嵌在 markdown.elements 里，tag 为 markdown_audio（非顶层 audio）。
// 与块级 audio 共用组件，但走 --inline 胶囊：扁平图标、无进度条（未显式声明时）、随父字号缩放。
test('markdown_audio: inline 胶囊样式，且不误用降级 url', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'markdown',
            property: {
              // 对齐样本 size=notation → 12px → cn 后 icon/time 均为 12
              textStyle: { size: 'notation' },
              elements: [{
                tag: 'markdown_audio',
                property: {
                  audioID: 'a-md',
                  fileID: 'file_v3_md_audio',
                  backgroundColor: 'grey-200',
                  fillColor: 'blue-800',
                  showTime: true,
                  url: { url: 'https://open.feishu.cn/' },
                },
              }],
            },
          }],
        },
      },
    },
  }, {
    resolveMedia: (p, kind) => (
      kind === 'audio' && p.fileID === 'file_v3_md_audio' ? 'https://example.com/md.opus' : null
    ),
  });
  assert.match(html, /universal-card-audio__wrapper--inline/);
  assert.match(html, /<audio[^>]*src="https:\/\/example\.com\/md\.opus"/);
  assert.doesNotMatch(html, /src="https:\/\/open\.feishu\.cn\//);
  assert.doesNotMatch(html, /universal-card-audio__slider/); // 未声明 showProgressBar → 无进度条
  assert.match(html, /data-icon="PlayFilled"/); // 扁平图标，非 Round
  assert.match(html, /data-icon="PauseFilled"/);
  assert.doesNotMatch(html, /PlayRoundFilled/);
  assert.match(html, /--universal-card-audio-bg:#eff0f1/); // grey-200
  assert.match(html, /--universal-card-audio-fill-color:#002f9e/); // blue-800
  assert.match(html, /--universal-card-audio-icon-size:12px/);
  assert.match(html, /--universal-card-audio-time-font-size:12px/);
});

test('video: DSL cover.img_key → poster / 封面图', () => {
  const dsl = {
    schema: '2.0',
    body: {
      elements: [{
        tag: 'video',
        file_key: 'file_v3_cover',
        cover: { img_key: 'img_v3_cover' },
        show_time: true,
      }],
    },
  };
  const imageOptions = {
    resolveImage: (p) => (p.imageID === 'img_v3_cover' ? 'https://cdn/cover.jpg' : null),
  };

  // 有媒体源 → 原生 poster
  const playable = renderDslToString(dsl, {
    ...imageOptions,
    resolveMedia: (p, kind) => (kind === 'video' && p.fileID === 'file_v3_cover'
      ? 'https://cdn/v.mp4' : null),
  });
  assert.match(playable, /<video[^>]*poster="https:\/\/cdn\/cover\.jpg"/);

  // 无媒体源 → 封面壳显示封面图，而不是默认封面
  const shell = renderDslToString(dsl, imageOptions);
  assert.match(shell, /universal-card-video__host-image[^>]*src="https:\/\/cdn\/cover\.jpg"/);
  assert.doesNotMatch(shell, /universal-card-video__default-cover/);
});

test('video: RAW 嵌套 cover 也能取封面', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'video',
            property: { fileID: 'file_v3_raw', cover: { imageID: 'img_v3_raw_cover' } },
          }],
        },
      },
    },
  }, {
    resolveImage: (p) => (p.imageID === 'img_v3_raw_cover' ? 'https://cdn/raw-cover.jpg' : null),
  });
  assert.match(html, /universal-card-video__host-image[^>]*src="https:\/\/cdn\/raw-cover\.jpg"/);
});

test('DSL audio/video → RAW 字段映射后可渲染', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'video',
          file_key: 'file_v3_v',
          image_key: 'img_v3_c',
          show_time: true,
        },
        {
          tag: 'audio',
          file_key: 'file_v3_a',
          audio_id: '1',
          width: 'fill',
          show_progress_bar: true,
          show_time: true,
        },
      ],
    },
  }, {
    resolveMedia: (p, kind) => {
      if (kind === 'video' && p.fileID === 'file_v3_v') return 'https://cdn/v.mp4';
      if (kind === 'audio' && p.fileID === 'file_v3_a') return 'https://cdn/a.opus';
      return null;
    },
    resolveImage: (p) => (p.imageID === 'img_v3_c' ? 'https://cdn/c.jpg' : null),
  });
  assert.match(html, /<video[^>]*src="https:\/\/cdn\/v\.mp4"/);
  assert.match(html, /poster="https:\/\/cdn\/c\.jpg"/);
  assert.match(html, /universal-card-audio__wrapper/);
  assert.match(html, /src="https:\/\/cdn\/a\.opus"/);
});

test('audio: 双图标输出 + hydrate 切换 --playing 类', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'audio',
            property: { fileID: 'file_v3_a', showTime: true },
          }],
        },
      },
    },
  }, { resolveMedia: () => 'https://example.com/a.opus' });
  assert.match(html, /universal-card-audio__icon--play/);
  assert.match(html, /universal-card-audio__icon--pause/);
  assert.match(html, /PlayRoundFilled/);
  assert.match(html, /PauseRoundFilled/);
  assert.match(html, /ZM7\.5 9a1\.5 1\.5/); // 飞书网页版 PauseRoundFilled path
  const js = feishuAudioHydrateJs();
  assert.match(js, /wrapper--playing/);
  assert.match(js, /audio\.play/);
  assert.match(js, /audio\.pause/);
  // 回归：多音频时 click 闭包不能共用循环 var（否则全绑到最后一个）
  assert.match(js, /function bindOne\(/);
  assert.match(AUDIO_PAUSE_ICON_SVG, /PauseRoundFilled/);
  assert.match(AUDIO_PAUSE_ICON_SVG, /ZM7\.5 9a1\.5 1\.5/);
});

// 真机 RAW：DSL text_size 被归一进 textStyle.size / platformSize，不再保留 text_size 字段。
// 回归：notation 必须落到 12px，不能回退成正文 14px。
test('RAW markdown textStyle.size=notation → 12px', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'markdown',
            property: {
              elements: [{
                tag: 'plain_text',
                property: {
                  content: '还差 18,800 步即可达成本周目标，加油！',
                  textStyle: { color: 'grey' },
                },
              }],
              textAlign: 'left',
              textStyle: {
                attributes: [],
                platformSize: { mobile: 'notation', pc: 'notation' },
                size: 'notation',
              },
            },
          }],
        },
      },
    },
  });
  assert.match(html, /还差 18,800 步即可达成本周目标，加油！/);
  assert.match(html, /font-size:12px/);
  assert.match(html, /line-height:20px/);
});

test('DSL text_size=notation 与 RAW textStyle.size 字号一致', () => {
  const dslHtml = renderDslToString({
    schema: '2.0',
    body: {
      direction: 'vertical',
      elements: [{
        tag: 'markdown',
        content: "<font color='grey'>还差 18,800 步即可达成本周目标，加油！</font>",
        text_align: 'left',
        text_size: 'notation',
      }],
    },
  });
  const rawHtml = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'markdown',
            property: {
              elements: [{
                tag: 'plain_text',
                property: {
                  content: '还差 18,800 步即可达成本周目标，加油！',
                  textStyle: { color: 'grey' },
                },
              }],
              textStyle: { size: 'notation', platformSize: { pc: 'notation', mobile: 'notation' } },
            },
          }],
        },
      },
    },
  });
  assert.match(dslHtml, /font-size:12px/);
  assert.match(rawHtml, /font-size:12px/);
});

test('header bg image injected as base64', () => {
  const html = renderCardToString(card);
  assert.match(html, /data:image\/png;base64,/);
});

test('unknown tag is skipped gracefully', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [{ tag: 'totally_unknown', property: {} }],
  } } } });
  assert.match(html, /universal-card-body/);
});

test('custom component can be registered', () => {
  registerComponent('my_badge', (el) => h('span', { className: 'badge' }, el.property?.content || ''));
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [{ tag: 'my_badge', property: { content: 'NEW' } }],
  } } } });
  assert.match(html, /class="badge">NEW</);
});

test('img with resolveImage returning null does not crash (renders placeholder)', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [{ tag: 'img', property: { imageID: '33', alt: '' } }],
  } } } }, { resolveImage: () => null });
  assert.match(html, /universal-card-body/);
  assert.match(html, /universal-card-image__placeholder/);
});

test('button: RAW widthValue.fill → block（撑满列）', () => {
  // 真机 RAW 按钮用 widthValue:{type:'builtin_width',value:'fill'}，不是扁平 width:"fill"
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: {
      type: 'primary_filled',
      widthValue: { type: 'builtin_width', value: 'fill' },
      actions: [{ type: 'open_url', action: { url: 'https://open.feishu.cn' } }],
      text: { tag: 'plain_text', property: { content: '全量发布' } },
    } },
    { tag: 'button', property: {
      type: 'default',
      widthValue: { type: 'builtin_width', value: 'fill' },
      actions: [{ type: 'open_url', action: { url: 'https://open.feishu.cn' } }],
      text: { tag: 'plain_text', property: { content: '继续观察' } },
    } },
  ] } } } });
  assert.match(html, /universal-card-button--primary_filled universal-card-button--block/);
  assert.match(html, /universal-card-button--default universal-card-button--block/);
  assert.match(html, /全量发布/);
  assert.match(html, /继续观察/);
});

test('button: DSL width=fill（含 text 系）→ block', () => {
  const filled = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: {
      type: 'primary', width: 'fill',
      text: { tag: 'plain_text', property: { content: 'A' } },
    } },
  ] } } } });
  assert.match(filled, /universal-card-button--block/);

  const textBtn = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: {
      type: 'primary_text',
      widthValue: { type: 'builtin_width', value: 'fill' },
      text: { tag: 'plain_text', property: { content: 'B' } },
    } },
  ] } } } });
  assert.match(textBtn, /universal-card-button--primary_text universal-card-button--block/);
});

test('button: markdown text flattened to plain text (no rich formatting / no <br>)', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: {
      type: 'default',
      actions: [{ type: 'open_url', action: { url: 'https://x.com/a' } }],
      text: { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '🍲 火锅 ' } },
        // text_tag 徽章：只取内层文字
        { tag: 'text_tag', property: { color: 'green', text: { tag: 'plain_text', property: { content: '⭐ 推荐' } } } },
        { tag: 'br', property: {} },
        { tag: 'plain_text', property: { content: '热闹', textStyle: { attributes: ['bold'], color: 'grey' } } },
      ] } },
    } },
  ] } } } });
  // 全部文字平铺成一行纯文本，无换行/格式标签
  assert.match(html, /🍲 火锅 ⭐ 推荐 热闹/);
  assert.match(html, /href="https:\/\/x\.com\/a"/);  // open_url 链接保留
  // 按钮内不应出现富文本结构：无 markdown 容器、无 <br>、无 text_tag、无加粗
  const btn = html.match(/<a class="universal-card-button[\s\S]*?<\/a>/)[0];
  assert.doesNotMatch(btn, /universal-card-markdown/);
  assert.doesNotMatch(btn, /<br>/);
  assert.doesNotMatch(btn, /text-tag/);
  assert.doesNotMatch(btn, /font-weight/);
});

test('button: non-link action (no url) renders as static, non-clickable span', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    // form_submit / action_request：无 URL，预览里不可交互
    { tag: 'button', property: { type: 'primary', actionType: 'form_submit',
      actions: [{ type: 'action_request', action: { actionID: 'act_x' } }],
      text: { tag: 'plain_text', property: { content: '提交' } } } },
  ] } } } });
  // 保留按钮外观但不可点：是 span.--static，不是 <a>/<button>
  assert.match(html, /<span[^>]*universal-card-button--static[^>]*>提交<\/span>/);
  assert.doesNotMatch(html, /<a[^>]*universal-card-button/);
  assert.doesNotMatch(html, /<button[^>]*universal-card-button/);
});

test('form: passthrough container renders inner elements (button inside is not dropped)', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'form', property: { name: 'f1', elements: [
      { tag: 'input', property: { placeholder: '请输入餐厅' } },
      { tag: 'button', property: { type: 'primary', actionType: 'form_submit',
        actions: [{ type: 'action_request', action: { actionID: 'a' } }],
        text: { tag: 'plain_text', property: { content: '提交' } } } },
    ] } },
  ] } } } });
  // 表单内的输入框 + 提交按钮都要在（之前整块被跳过而丢失）
  assert.match(html, /universal-card-input--static/);
  assert.match(html, /请输入餐厅/);
  assert.match(html, /<span[^>]*universal-card-button--static[^>]*>提交<\/span>/);
});

test('button: open_url action stays a clickable <a> link', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: { type: 'default', actionType: 'multi',
      actions: [{ type: 'open_url', action: { url: 'https://example.com/submit/custom' } }],
      text: { tag: 'plain_text', property: { content: '提交' } } } },
  ] } } } });
  assert.match(html, /<a[^>]*universal-card-button[^>]*href="https:\/\/example\.com\/submit\/custom"/);
  assert.doesNotMatch(html, /button--static/);
});

test('RAW: body without tag still renders (tag defaulted to "body")', () => {
  // 真实 RAW 卡片的 body 常无 tag，直接 { elements: [...] }；
  // 之前 renderElement 因 !el.tag 直接丢弃整个 body，只剩标题。
  const html = renderCardToString({ json_card: {
    header: { tag: 'card_header', property: { template: 'green',
      title: { tag: 'plain_text', property: { content: '标题' } } } },
    body: { elements: [
      { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '正文还在' } },
      ] } },
    ] },
  } });
  assert.match(html, /universal-card-body/);
  assert.match(html, /正文还在/);
});

test('RAW: body padding 0 overrides CSS default 12px (no white ring)', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    padding: { top: { value: 0 }, right: { value: 0 }, bottom: { value: 0 }, left: { value: 0 } },
    elements: [{
      tag: 'interactive_container',
      property: {
        customBackgroundStyle: { lightMode: '#f5f4ef', darkMode: '#f5f4ef' },
        padding: { top: { value: 20 }, right: { value: 20 }, bottom: { value: 20 }, left: { value: 20 } },
        elements: [{ tag: 'markdown', property: { elements: [
          { tag: 'plain_text', property: { content: '内文' } },
        ] } }],
      },
    }],
  } } } });
  assert.match(html, /universal-card-body[^>]*style="padding:0px 0px 0px 0px"/);
  assert.doesNotMatch(html, /universal-card-root[^>]*border:\s*1px/);
});

test('RAW: interactive_container verticalSpacingValue → row-gap', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'interactive_container',
    property: {
      verticalSpacingValue: { type: 'pixels', value: 10 },
      elements: [
        { tag: 'markdown', property: { elements: [{ tag: 'plain_text', property: { content: 'a' } }] } },
        { tag: 'markdown', property: { elements: [{ tag: 'plain_text', property: { content: 'b' } }] } },
      ],
    },
  }] } } } });
  assert.match(html, /universal-card-interactive-container[^>]*row-gap:10px/);
});

test('interactive_container：未声明 corner_radius 时无默认圆角（对齐真机）', () => {
  assert.doesNotMatch(
    ALL_CSS,
    /\.universal-card-interactive-container\s*\{[^}]*border-radius\s*:/,
  );
  const bare = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'interactive_container',
        background_style: 'grey-50',
        elements: [{ tag: 'markdown', content: '页尾' }],
      }],
    },
  });
  const open = bare.match(/<div class="universal-card-interactive-container"[^>]*>/)?.[0] || '';
  assert.ok(open.includes('background'), open);
  assert.doesNotMatch(open, /border-radius/);

  const withRadius = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'interactive_container',
        background_style: 'grey-50',
        corner_radius: '10px',
        elements: [{ tag: 'markdown', content: '圆角块' }],
      }],
    },
  });
  assert.match(withRadius, /universal-card-interactive-container[^>]*border-radius:10px/);
});

test('RAW: interactive_container width/height pixels + margin calc', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'interactive_container',
    property: {
      widthValue: { type: 'pixels', value: 48 },
      heightValue: { type: 'pixels', value: 48 },
      margin: {
        top: { value: 8 }, right: { value: 20 }, bottom: { value: 0 }, left: { value: 20 },
      },
      customBackgroundStyle: { lightMode: 'rgba(236,249,254,1)', darkMode: 'rgba(236,249,254,1)' },
      elements: [],
    },
  }, {
    tag: 'interactive_container',
    property: {
      width: 'fill',
      margin: {
        top: { value: 8 }, right: { value: 20 }, bottom: { value: 0 }, left: { value: 20 },
      },
      elements: [],
    },
  }] } } } });
  // 定宽图标框：保持 48px，不因 margin 改成 calc
  assert.match(html, /width:48px/);
  assert.match(html, /height:48px/);
  assert.match(html, /margin:8px 20px 0px 20px/);
  // fill + 水平 margin → calc(100% - 40px)
  assert.match(html, /width:calc\(100% - 40px\)/);
});

test('RAW: img size 24px 24px → fixed wrapper', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'img',
    property: {
      imageKey: 'img_test',
      size: '24px 24px',
      scaleType: 'crop_center',
      alt: { tag: 'plain_text', property: { content: 'icon' } },
    },
  }] } } } });
  assert.match(html, /universal-card-image__wrapper[^>]*width:24px/);
  assert.match(html, /universal-card-image__wrapper[^>]*height:24px/);
});

// 真机正文图常带 margin:8px 20px；原先 img 未 applyOuterMargin，左右贴边。
test('RAW: img fit_horizontal + horizontal margin → calc width', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'img',
    property: {
      imageKey: 'img_test',
      scaleType: 'fit_horizontal',
      margin: {
        top: { type: 'pixels', value: 8 },
        right: { type: 'pixels', value: 20 },
        bottom: { type: 'pixels', value: 0 },
        left: { type: 'pixels', value: 20 },
      },
      alt: { tag: 'plain_text', property: { content: '' } },
    },
  }] } } } });
  assert.match(html, /class="universal-card-image"[^>]*margin:8px 20px 0px 20px/);
  assert.match(html, /class="universal-card-image"[^>]*width:calc\(100% - 40px\)/);
});

// 真机 img 标题：title 文本元素渲染在图片上方（.universal-card-image__title，CSS 给 8px 间距）。
// 历史实现只把 alt 写进 <img alt>，title 完全不渲染，真机上图文标题就丢了。
test('RAW: img title → 图片上方的标题文本', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'img',
    property: {
      src: 'https://cdn.example.com/pic.png',
      scaleType: 'fit_horizontal',
      alt: { tag: 'plain_text', property: { content: '配图' } },
      title: { tag: 'plain_text', property: { content: '图片标题文案' } },
    },
  }] } } } });
  assert.match(html, /class="universal-card-image__title"[^>]*><span class="universal-card-text">图片标题文案<\/span>/);
  // 标题在图片之前（真机标题在上方）
  assert.ok(html.indexOf('图片标题文案') < html.indexOf('universal-card-image__host'), html);
});

test('RAW: img 无 title 时不渲染标题壳（不留空白）', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'img', property: { src: 'https://cdn.example.com/pic.png', alt: { tag: 'plain_text', property: { content: '' } } },
  }] } } } });
  assert.doesNotMatch(html, /universal-card-image__title/);
  assert.match(html, /class="universal-card-image"[^>]*><div class="universal-card-image__wrapper"/);
});

// RAW 标题的样式走 textStyle（真机形态）：plain_text 按 size 出字号/修饰类，markdown 子树自带对齐。
test('RAW: img title 的 textStyle / lines 落到标题文本', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'img',
    property: {
      src: 'https://cdn.example.com/pic.png',
      alt: { tag: 'plain_text', property: { content: '' } },
      title: {
        tag: 'plain_text',
        property: {
          content: '灰色小字标题',
          textStyle: { size: 'notation', color: 'grey' },
          lines: 1,
        },
      },
    },
  }] } } } });
  assert.match(html, /universal-card-text universal-card-text--grey" style="[^"]*font-size:12px/);
  assert.match(html, /-webkit-line-clamp:1/);
});

// 负水平外边距＝出血（顶层大图 margin:-20px 顶到卡片边）。真机那个盒子 width:auto，
// 负 margin 让它同时往两侧撑宽；渲染器盒子写死 width:100%，光加负 margin 只会整体左移、
// 右边留一条空白，所以宽度要改成 calc(100% + |L+R|)，并放开 max-width（否则被夹回容器宽）。
test('RAW: img 负水平外边距 → 出血到容器两边（calc(100% + 40px) + max-width:none）', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'img',
    property: {
      imageKey: 'img_test',
      scaleType: 'fit_horizontal',
      margin: {
        top: { type: 'pixels', value: -20 },
        right: { type: 'pixels', value: -20 },
        bottom: { type: 'pixels', value: 0 },
        left: { type: 'pixels', value: -20 },
      },
      alt: { tag: 'plain_text', property: { content: '' } },
    },
  }] } } } });
  assert.match(html, /class="universal-card-image"[^>]*margin:-20px -20px 0px -20px/);
  assert.match(html, /class="universal-card-image"[^>]*width:calc\(100% \+ 40px\)/);
  assert.match(html, /class="universal-card-image"[^>]*max-width:none/);
});

// 真机网页版 .universal-card-image__host{border-radius:0}：不写 corner_radius 就是直角，
// 圆角只由 corner_radius 内联给出。之前 CSS 写死 4px，导致图片四角被圆掉，与真机不符。
test('img 圆角：未声明 corner_radius 时不加圆角（对齐真机 border-radius:0）', () => {
  assert.match(ALL_CSS, /\.universal-card-image__host\s*\{[^}]*border-radius:\s*0/);

  const bare = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'img',
      img_key: 'img_test',
      scale_type: 'fit_horizontal',
      alt: { tag: 'plain_text', content: '图' },
    }] },
  });
  const img = bare.match(/class="universal-card-image__(?:host|placeholder)"[^>]*>/)?.[0] || '';
  assert.ok(img, bare);
  assert.doesNotMatch(img, /border-radius/);

  const rounded = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'img',
      img_key: 'img_test',
      scale_type: 'fit_horizontal',
      corner_radius: '8px',
      alt: { tag: 'plain_text', content: '图' },
    }] },
  });
  assert.match(rounded, /universal-card-image__(?:host|placeholder)[^>]*border-radius:8px/);
});

// 图片标题与盒子规则对齐真机 dump：
//   .universal-card-image__title{margin-bottom:8px}（标题在图片上方）
//   .universal-card-image__wrapper{...;overflow:hidden} / __host{width:100%;border-radius:0}
test('img 样式对齐真机：标题 8px 间距 + wrapper/host 规则', () => {
  assert.match(ALL_CSS, /\.universal-card-image__title\s*\{[^}]*margin-bottom:\s*8px/);
  assert.match(ALL_CSS, /\.universal-card-image__wrapper\s*\{[^}]*overflow:\s*hidden/);
  assert.match(ALL_CSS, /\.universal-card-image__wrapper\s*\{[^}]*align-items:\s*center/);
  assert.match(ALL_CSS, /\.universal-card-image__host\s*\{[^}]*width:\s*100%/);
});

// 真机 video / fill 按钮常带左右 20px；原先未 applyOuterMargin，左右贴边。
test('RAW: video + horizontal margin → calc width', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'video',
    property: {
      fileID: 'file_v3_demo',
      coverImageID: 'img_v3_cover',
      margin: {
        top: { type: 'pixels', value: 8 },
        right: { type: 'pixels', value: 20 },
        bottom: { type: 'pixels', value: 0 },
        left: { type: 'pixels', value: 20 },
      },
    },
  }] } } } });
  assert.match(html, /universal-card-video[^>]*margin:8px 20px 0px 20px/);
  assert.match(html, /universal-card-video[^>]*width:calc\(100% - 40px\)/);
});

test('RAW: button fill + horizontal margin → calc width', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'button',
    property: {
      type: 'primary_filled',
      widthValue: { type: 'builtin_width', value: 'fill' },
      margin: {
        top: { type: 'pixels', value: 12 },
        right: { type: 'pixels', value: 20 },
        bottom: { type: 'pixels', value: 0 },
        left: { type: 'pixels', value: 20 },
      },
      actions: [{ type: 'open_url', action: { url: 'https://open.feishu.cn' } }],
      text: { tag: 'plain_text', property: { content: '为妙卡投上关键一票' } },
    },
  }] } } } });
  assert.match(html, /universal-card-button--block[^>]*margin:12px 20px 0px 20px/);
  assert.match(html, /universal-card-button--block[^>]*width:calc\(100% - 40px\)/);
});

test('RAW: collapsible_panel follow_text + no default border + margin', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'collapsible_panel',
    property: {
      expanded: false,
      backgroundColor: 'grey-50',
      margin: {
        top: { value: 4 }, right: { value: 20 }, bottom: { value: 0 }, left: { value: 20 },
      },
      header: {
        title: { tag: 'plain_text', property: { content: '展开说明（3 项）' } },
        icon_position: 'follow_text',
        icon: { tag: 'standard_icon', property: { token: 'down_outlined', color: 'grey' } },
      },
      elements: [],
    },
  }] } } } });
  assert.match(html, /universal-card-collapsible-panel__header--icon-follow/);
  assert.match(html, /margin:4px 20px 0px 20px/);
  assert.match(html, /width:calc\(100% - 40px\)/);
  // 未指定 border 对象时不描边
  assert.doesNotMatch(html, /universal-card-collapsible-panel"[^>]*border:1px solid/);
  assert.match(html, /background:#f5f6f7/);
});

test('styles: collapsible_panel header 用 caption 色（N600），不是正文近黑', async () => {
  const { ALL_CSS } = await import('../dist/index.js');
  // 真机 --text-caption → N600；标题不再写死 #1f2329
  assert.match(ALL_CSS, /\.universal-card-collapsible-panel__header\s*\{[^}]*color:\s*var\(--N600\)/);
  assert.doesNotMatch(ALL_CSS, /\.universal-card-collapsible-panel__title\s*\{[^}]*color:\s*#1f2329/);
});

test('RAW: display-only interactive_container has no --action (no pointer cursor)', () => {
  const display = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'interactive_container',
    property: { actions: [], disabled: false, elements: [
      { tag: 'markdown', property: { elements: [{ tag: 'plain_text', property: { content: '纯展示' } }] } },
    ] },
  }] } } } });
  assert.doesNotMatch(display, /universal-card-interactive-container--action/);

  const linked = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [{
    tag: 'interactive_container',
    property: {
      actions: [{ action: { url: 'https://example.com' } }],
      elements: [{ tag: 'markdown', property: { elements: [{ tag: 'plain_text', property: { content: '可点' } }] } }],
    },
  }] } } } });
  assert.match(linked, /universal-card-interactive-container--action/);
  assert.match(linked, /data-url="https:\/\/example.com"/);
});

test('RAW: div renders single content from property.text (markdown)', () => {
  // 真实 RAW 的 div 把内容挂在 property.text（单个 markdown），而非 property.elements。
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'div', property: { text: { tag: 'markdown', property: { elements: [
      { tag: 'plain_text', property: { content: 'div 内的文字' } },
    ] } } } },
  ] } } } });
  assert.match(html, /universal-card-div/);
  assert.match(html, /div 内的文字/);
});

// ---- 异步渲染（自动拉图）：用注入的 mock fetch，无需联网 ----

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG 魔数
const PNG_B64 = arrayBufferToBase64(PNG_BYTES.buffer);

/** 造一个 mock fetch：消息接口返回带 json_card+json_attachment 的 content；资源接口返回 PNG 字节 */
function makeMockFetch({ onResource } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/resources/')) {
      if (onResource) onResource(url);
      return {
        ok: true,
        headers: { get: (h2) => (h2.toLowerCase() === 'content-type' ? 'image/png' : null) },
        arrayBuffer: async () => PNG_BYTES.buffer,
      };
    }
    // 消息接口：json_card 是双重编码的字符串
    const jsonCard = JSON.stringify({
      schema: '2.0',
      body: { tag: 'body', property: { elements: [
        { tag: 'img', property: { imageID: '19', alt: '' } },
      ] } },
    });
    const content = JSON.stringify({
      json_card: jsonCard,
      json_attachment: { images: { 19: { origin_key: 'img_v3_fake' } } },
    });
    return {
      ok: true,
      json: async () => ({ code: 0, data: { items: [{ message_id: 'om_test', body: { content } }] } }),
    };
  };
  return { fetchImpl, calls };
}

test('async: messageId + token fetches message and inlines image as data URI', async () => {
  const { fetchImpl } = makeMockFetch();
  const html = await renderCardToStringAsync('om_test', { accessToken: 't-xxx', fetch: fetchImpl });
  assert.match(html, /universal-card-body/);
  assert.match(html, new RegExp(`<img[^>]+src="data:image/png;base64,${PNG_B64}"`));
  assert.doesNotMatch(html, /universal-card-image__placeholder/);
});

test('async: card object + token + json_attachment inlines image', async () => {
  const { fetchImpl } = makeMockFetch();
  const input = {
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'img', property: { imageID: '19', alt: '' } },
    ] } } },
    json_attachment: { images: { 19: { origin_key: 'img_v3_fake' } } },
    messageId: 'om_test',
  };
  const html = await renderCardToStringAsync(input, { accessToken: 't-xxx', fetch: fetchImpl });
  assert.match(html, /src="data:image\/png;base64,/);
});

test('async: card object WITHOUT token renders placeholder (no fetch)', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, arrayBuffer: async () => PNG_BYTES.buffer, headers: { get: () => 'image/png' } }; };
  const input = {
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'img', property: { imageID: '19', alt: '' } },
    ] } } },
    json_attachment: { images: { 19: { origin_key: 'img_v3_fake' } } },
  };
  const html = await renderCardToStringAsync(input, { fetch: fetchImpl }); // 无 accessToken
  assert.match(html, /universal-card-image__placeholder/);
  assert.equal(called, false, '无 token 时不应发起任何图片请求');
});

test('async: messageId WITHOUT token throws', async () => {
  await assert.rejects(
    () => fetchCardMessage('om_test', {}),
    /accessToken/,
  );
});

test('fetchCardMessage: requests user_id_type=open_id and merges mentions into persons', async () => {
  let requestedUrl = '';
  const fetchImpl = async (url) => {
    requestedUrl = url;
    const jsonCard = JSON.stringify({
      schema: '2.0',
      body: { tag: 'body', property: { elements: [
        { tag: 'at', property: { userID: 'ou_ztx' } },
        { tag: 'at', property: { userID: '@_user_1' } },
      ] } },
    });
    const content = JSON.stringify({
      json_card: jsonCard,
      json_attachment: {
        at_users: {
          ou_from_att: { content: '附件用户', key: '@_user_2' },
        },
      },
    });
    return {
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          items: [{
            message_id: 'om_at',
            mentions: [{
              id: 'ou_ztx',
              id_type: 'open_id',
              key: '@_user_1',
              name: '赵天雄',
              tenant_key: 'tk',
            }],
            body: { content },
          }],
        },
      }),
    };
  };

  const msg = await fetchCardMessage('om_at', { accessToken: 't-xxx', fetch: fetchImpl });
  assert.match(requestedUrl, /card_msg_content_type=raw_card_content/);
  assert.match(requestedUrl, /user_id_type=open_id/);
  assert.equal(msg.mentions?.[0]?.name, '赵天雄');
  assert.equal(msg.json_attachment?.persons?.ou_ztx?.content, '赵天雄');
  assert.equal(msg.json_attachment?.persons?.['@_user_1']?.content, '赵天雄');
  assert.equal(msg.json_attachment?.persons?.ou_from_att?.content, '附件用户');
  assert.equal(msg.json_attachment?.persons?.['@_user_2']?.content, '附件用户');

  // 不传额外 persons，异步渲染应出真名而非 @张三
  const html = await renderCardToStringAsync('om_at', { accessToken: 't-xxx', fetch: fetchImpl });
  assert.match(html, /@赵天雄/);
  assert.doesNotMatch(html, /@张三/);
});

test('mergeMentionsIntoPersons: does not wipe richer existing persons', () => {
  const merged = mergeMentionsIntoPersons(
    {
      persons: { ou_a: { content: '已有名', avatar_key: 'v3_keep' } },
      at_users: { ou_a: { name: '较空名' } },
    },
    [{ id: 'ou_a', name: '' }],
  );
  assert.equal(merged.persons.ou_a.content, '已有名');
  assert.equal(merged.persons.ou_a.avatar_key, 'v3_keep');
});

test('async: only references images actually used by img elements (skips orphan attachment keys)', async () => {
  const resourceUrls = [];
  const { fetchImpl } = makeMockFetch({ onResource: (u) => resourceUrls.push(u) });
  // 卡片只引用 imageID 19；附件表里还有个废弃的 38，不应被拉取
  const input = {
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'img', property: { imageID: '19', alt: '' } },
    ] } } },
    json_attachment: { images: { 19: { origin_key: 'img_v3_used' }, 38: { origin_key: 'img_v3_orphan' } } },
    messageId: 'om_test',
  };
  await renderCardToStringAsync(input, { accessToken: 't-xxx', fetch: fetchImpl });
  assert.equal(resourceUrls.length, 1, '应只拉取被引用的那张图');
  assert.match(resourceUrls[0], /img_v3_used/);
});

test('a component returning a node with null props does not crash the tree', () => {
  // Regression: a node whose `props` is null (built as a literal, not via h())
  // must not throw Object.keys(null) and take down the whole render.
  registerComponent('bad_props', () => ({ tag: 'span', props: null, children: ['x'] }));
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [
      { tag: 'bad_props', property: {} },
      { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '正文还在' } },
      ] } },
    ],
  } } } });
  assert.match(html, /<span>x<\/span>/);
  assert.match(html, /正文还在/);
});

// ---- 图标 standard_icon / ud_icon ----

const iconCard = (property) => ({
  json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'standard_icon', property },
  ] } } },
});

test('icon: renders <i> with ud-icon_<token> class and size/color', () => {
  const html = renderCardToString(iconCard({ token: 'warning_outlined', color: 'red', size: 'large2' }));
  assert.match(html, /class="universal-card-icon ud-icon_warning_outlined"/);
  assert.match(html, /font-size:18px/); // large2 -> 18
  assert.match(html, /color:#e22e28/);  // red
});

test('icon: ud_icon tag shares the same renderer', () => {
  const html = renderCardToString({
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'ud_icon', property: { token: 'info_outlined', color: 'blue' } },
    ] } } },
  });
  assert.match(html, /ud-icon_info_outlined/);
  assert.match(html, /color:#336df4/); // blue
});

test('icon: default size 16px when size missing/unknown', () => {
  const html = renderCardToString(iconCard({ token: 'add_outlined' }));
  assert.match(html, /font-size:16px/);
});

test('icon: _colorful token does NOT get a color override', () => {
  const html = renderCardToString(iconCard({ token: 'activity_colorful', color: 'red' }));
  assert.match(html, /ud-icon_activity_colorful/);
  assert.doesNotMatch(html, /color:#e22e28/); // 彩色图标自带色，不覆盖
});

test('icon: no/unknown named color → no color (inherits currentColor)', () => {
  const html = renderCardToString(iconCard({ token: 'add_outlined' }));
  assert.doesNotMatch(html, /color:#/);
});

test('icon: direct hex color passes through', () => {
  const html = renderCardToString(iconCard({ token: 'add_outlined', color: '#123456' }));
  assert.match(html, /color:#123456/);
});

test('icon: missing token → skipped, no crash', () => {
  const html = renderCardToString(iconCard({ color: 'red' }));
  assert.doesNotMatch(html, /ud-icon_/);
});

test('icon: ICON_CODEPOINTS maps warning_outlined to fa0c', async () => {
  const { ICON_CODEPOINTS } = await import('../dist/index.js');
  assert.equal(ICON_CODEPOINTS.warning_outlined, 'fa0c');
});

test('icon: ud_icon color/size nested under property.style is honored', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'ud_icon', property: { token: 'warning_outlined', style: { color: 'red', size: 'large3' } } },
  ] } } } });
  assert.match(html, /ud-icon_warning_outlined/);
  assert.match(html, /font-size:20px/); // large3 -> 20
  assert.match(html, /color:#e22e28/);  // red（取自 style.color）
});

test('div: leading icon (property.udIcon || icon) renders once with text', () => {
  // RAW 真实形态：div 把前置图标挂在 property.icon(standard_icon) + property.udIcon(ud_icon)，
  // 二者同一图标，引擎取 udIcon || icon 只渲一次；文本在 property.text。
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'div', property: {
      icon: { tag: 'standard_icon', property: { token: 'warning_outlined', color: 'red' } },
      udIcon: { tag: 'ud_icon', property: { token: 'warning_outlined', style: { color: 'red' } } },
      text: { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '风险提示' } },
      ] } },
    } },
  ] } } } });
  assert.match(html, /universal-card-div--with-icon/);
  assert.match(html, /universal-card-div__icon_wrapper/);
  assert.match(html, /风险提示/);
  // 同一图标只渲染一次（udIcon 优先，icon 不再重复出图）
  assert.equal((html.match(/ud-icon_warning_outlined/g) || []).length, 1);
});

test('div: icon-less div still renders normally', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'div', property: { text: { tag: 'markdown', property: { elements: [
      { tag: 'plain_text', property: { content: '普通 div' } },
    ] } } } },
  ] } } } });
  assert.match(html, /universal-card-div/);
  assert.doesNotMatch(html, /div--with-icon/);
  assert.match(html, /普通 div/);
});

// ---- 人员 person_v1 / person_list ----

// person 元素只带 ID；姓名/头像 key 在 json_attachment.persons（按 open_id 索引）。
const personCard = (elements) => ({
  json_card: { body: { tag: 'body', property: { elements } } },
  json_attachment: { persons: {
    ou_a: { content: '刘广宇', avatar_key: 'v3_00ig_abc' },
    ou_b: { content: '徐明洋', avatar_key: 'v3_00te_def' },
    ou_noavatar: { content: '李于冬' }, // 有名字无头像 key
  } },
});

test('person_v1: renders avatar (public key) + name from json_attachment.persons', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true, showName: true, size: 'small' } },
  ]));
  assert.match(html, /universal-card-person\b/);
  assert.match(html, /universal-card-person__content/);
  assert.match(html, /刘广宇/);
  // 头像走公开 static-resource；类名对齐真机 internal-avatar
  assert.match(html, /<img[^>]+universal-card-person__internal-avatar[^>]+src="[^"]*v3_00ig_abc[^"]*"/);
  assert.match(html, /static-resource\/v1\//);
});

test('person_v1: avatar size — small normal=24px；capsule=20px（lineHeight-4）', () => {
  const normal = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', size: 'small', showAvatar: true, showName: true } },
  ]));
  assert.match(normal, /width:24px/);
  assert.match(normal, /height:24px/);

  const capsule = renderCardToString(personCard([
    { tag: 'person_v1', property: {
      userID: 'ou_a', size: 'small', showAvatar: true, showName: true, pillShaped: true,
    } },
  ]));
  assert.match(capsule, /universal-card-person--capsule/);
  assert.match(capsule, /width:20px/);
  assert.match(capsule, /height:20px/);
});

test('person_v1: name with no avatar_key → initial placeholder circle (no <img>)', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_noavatar', showAvatar: true, showName: true } },
  ]));
  assert.match(html, /universal-card-person__avatar--placeholder/);
  assert.match(html, /李于冬/);
  // 占位首字「李」，不应有头像 <img>
  assert.doesNotMatch(html, /<img[^>]+person__internal-avatar/);
});

test('person_v1: only ID available (persons map missing) → fallback avatar + 赵天雄', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'person_v1', property: { userID: 'ou_fee541fd4a7377392026510149c17ad1', showAvatar: true, showName: true } },
  ] } } } }); // 无 json_attachment.persons
  assert.match(html, /universal-card-person\b/);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
  assert.doesNotMatch(html, /universal-card-person__avatar--placeholder/);
});

test('person_v1: showName=false hides name; showAvatar=false hides avatar', () => {
  const noName = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true, showName: false } },
  ]));
  assert.doesNotMatch(noName, /universal-card-person__name/);
  assert.match(noName, /person__internal-avatar|person__avatar-wrapper/);

  const noAvatar = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: false, showName: true } },
  ]));
  assert.doesNotMatch(noAvatar, /person__internal-avatar|person__avatar-wrapper/);
  assert.match(noAvatar, /刘广宇/);
});

test('person_list: combine 模式每人一组 avatar-name', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_list', property: { showAvatar: true, showName: true, size: 'small',
      persons: [ { id: 'ou_a', type: 'user' }, { id: 'ou_b', type: 'user' } ] } },
  ]));
  assert.match(html, /universal-card-person-list/);
  assert.match(html, /person-list__content--combine/);
  assert.match(html, /刘广宇/);
  assert.match(html, /徐明洋/);
  assert.equal((html.match(/person-list__avatar-name/g) || []).length, 2);
});

test('person_list: no person resolvable → avatar-name 降级为 赵天雄（忽略纯文本 fallback）', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'person_list', fallback: { tag: 'markdown', property: { elements: [
      { tag: 'plain_text', property: { content: '徐明洋, 李于冬, 刘青磊, 任传喜' } },
    ] } },
    property: { showAvatar: true, showName: true, persons: [ { id: 'ou_x' }, { id: 'ou_y' } ] } },
  ] } } } }); // 无 persons 表；即使有 fallback 也走列表降级
  assert.match(html, /universal-card-person-list/);
  assert.equal((html.match(/person-list__avatar-name/g) || []).length, 2);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
  assert.doesNotMatch(html, /徐明洋, 李于冬/);
});

test('person_list: no person resolvable and no element fallback → 赵天雄', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'person_list', property: { showAvatar: true, showName: true, size: 'small',
      persons: [ { id: 'ou_x' }, { id: 'ou_y' } ] } },
  ] } } } });
  assert.match(html, /universal-card-person-list/);
  assert.equal((html.match(/person-list__avatar-name/g) || []).length, 2);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
});

test('person_list: 仅名字模式为蓝色姓名 + 全角逗号；葫芦串带 hollow mask', () => {
  const names = renderCardToString(personCard([
    { tag: 'person_list', property: {
      showAvatar: false, showName: true, size: 'medium',
      persons: [ { id: 'ou_a' }, { id: 'ou_b' } ],
    } },
  ]));
  assert.match(names, /reaction-user--blue/);
  assert.match(names, /reaction-user__comma/);
  assert.match(names, /，/);
  assert.doesNotMatch(names, /person-list__avatar-name/);

  const group = renderCardToString(personCard([
    { tag: 'person_list', property: {
      showAvatar: true, showName: false, size: 'medium',
      persons: [ { id: 'ou_a' }, { id: 'ou_b' } ],
    } },
  ]));
  assert.match(group, /person-list__avatar-group/);
  assert.match(group, /data:image\/svg\+xml/);
});
test('person: custom resolvePersonAvatar + avatarBaseURL override the URL', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true } },
  ]), { resolvePersonAvatar: (p) => `https://cdn.example.com/${p.avatar_key}.png` });
  assert.match(html, /src="https:\/\/cdn\.example\.com\/v3_00ig_abc\.png"/);
});

test('markdown inline <person>: renders person chip (fallback when no persons map)', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "**销售顾问** <person id='on_28a68b6129e9b170b2cd14c2b8ff3cda' show_name=true show_avatar=true style='normal'></person>",
      }],
    },
  });
  assert.match(html, /销售顾问/);
  assert.match(html, /universal-card-person\b/);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
  assert.doesNotMatch(html, /&lt;person/);
});

test('markdown inline <person>: 跟随正文字号（14px / 头像 18px），不是独立组件 medium', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "<person id='ou_a' show_name=true show_avatar=true></person>",
      }],
    },
  });
  // 跟正文 14：字号 14、行高跟父级、头像 18（PERSON_FOLLOW_FONT）
  assert.match(html, /font-size:14px/);
  assert.match(html, /line-height:inherit/);
  assert.match(html, /width:18px/);
  assert.match(html, /height:18px/);
  // 不应落到独立 person 的 medium（字号 20 / 头像 30）
  assert.doesNotMatch(html, /font-size:20px/);
  assert.doesNotMatch(html, /width:30px/);
});

test('markdown inline <person> 仅姓名：行高跟正文 inherit，不带 --avatar', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "这些场景都 <person id='ou_a' show_name=true show_avatar=false></person>",
      }],
    },
  });
  assert.match(html, /这些场景都/);
  assert.match(html, /universal-card-person--name/);
  assert.doesNotMatch(html, /universal-card-person--avatar/);
  assert.match(html, /line-height:inherit/);
  assert.doesNotMatch(html, /person__internal-avatar|person__avatar-wrapper/);
});

test('markdown heading 内联 <person> 跟随标题字号（h1=17px / 头像 22px）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "# 负责人 <person id='ou_a' show_name=true show_avatar=true></person>",
      }],
    },
  });
  assert.match(html, /markdown-heading/);
  assert.match(html, /font-size:17px/);
  assert.match(html, /width:22px/);
  assert.match(html, /height:22px/);
});

test('standalone person_v1 无 size 仍为 medium（不受 markdown 跟随影响）', () => {
  const html = renderCardToString({
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true, showName: true } },
    ] } } },
    json_attachment: { persons: { ou_a: { content: '刘广宇', avatar_key: 'v3_x' } } },
  });
  assert.match(html, /font-size:20px/);
  assert.match(html, /width:30px/);
});

test('markdown inline <at>: no persons map → @张三 (not @open_id)', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "请 <at id=on_28a68b6129e9b170b2cd14c2b8ff3cda></at> 确认",
      }],
    },
  });
  assert.match(html, /universal-card-markdown-at/);
  assert.match(html, /@张三/);
  assert.doesNotMatch(html, /@on_28a68b/);
});

test('markdown inline <at>: resolves name from persons map when available', () => {
  const html = renderCardToString({
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'at', property: { userID: 'ou_a' } },
    ] } } },
    json_attachment: { persons: { ou_a: { content: '刘广宇', avatar_key: 'v3_x' } } },
  });
  assert.match(html, /@刘广宇/);
  assert.doesNotMatch(html, /@张三/);
});

// ---- 预览与真机一致性（header 底色 / 控件宽度分档） ----

test('header: default 模板白底 + __bg--no-template（真机不设背景色）', () => {
  const html = renderCardToString({ json_card: {
    header: { tag: 'card_header', property: {
      template: 'default',
      title: { tag: 'plain_text', property: { content: '添加信息源' } },
    } },
    body: { tag: 'body', property: { elements: [] } },
  } });
  // 真机 default/disabled 模板的 bg_color 是空串，透出卡根 --bg-float(#ffffff)
  assert.match(html, /background-color:#ffffff/);
  assert.doesNotMatch(html, /background-color:#f5f6f7/);
  // 无模板 → header 底部不留额外内边距
  assert.match(html, /universal-card-header__bg--no-template/);
});

test('header: 彩色模板仍上色，且不挂 --no-template', () => {
  const html = renderCardToString({ json_card: {
    header: { tag: 'card_header', property: {
      template: 'blue',
      title: { tag: 'plain_text', property: { content: '标题' } },
    } },
    body: { tag: 'body', property: { elements: [] } },
  } });
  assert.match(html, /universal-card-header--blue/);
  assert.doesNotMatch(html, /universal-card-header__bg--no-template/);
});

test('input: 默认 100% 但上限 282px；width=fill 解除上限', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'input', property: { name: 'q', placeholder: '搜索' } },
    { tag: 'input', property: { name: 'q2', placeholder: '搜索', width: 'fill' } },
  ] } } } });
  assert.match(html, /style="width:100%;max-width:282px"/);
  assert.match(html, /style="width:100%;max-width:none"/);
});

test('select: 默认定宽 282px；type=text 自适应无边框；width=fill 撑满', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'select_static', property: { name: 'c', placeholder: '按分类浏览' } },
    { tag: 'select_static', property: { name: 'c2', placeholder: '浏览', type: 'text' } },
    { tag: 'select_static', property: { name: 'c3', placeholder: '浏览', width: 'fill' } },
  ] } } } });
  assert.match(html, /style="width:282px;max-width:100%"/);
  assert.match(html, /universal-card-input--text" style="width:auto;max-width:100%"/);
  assert.match(html, /style="width:100%;max-width:none"/);
});

test('button: 未写 width → --auto（宽屏自适应、窄屏撑满）；text 族恒 --block', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: {
      type: 'primary',
      text: { tag: 'plain_text', property: { content: '搜索' } },
    } },
    { tag: 'button', property: {
      type: 'primary_text',
      text: { tag: 'plain_text', property: { content: '查看' } },
    } },
  ] } } } });
  assert.match(html, /universal-card-button--primary universal-card-button--auto/);
  assert.match(html, /universal-card-button--primary_text universal-card-button--block/);
});

test('styles: 控件宽度相关规则与真机一致', () => {
  // 表单容器的纵向间距 12px（真机 schema 2.0）
  assert.match(ALL_CSS, /\.universal-card-form\s*\{[^}]*row-gap:\s*12px/);
  // 卡片根是容器查询的参照物，阈值 320px 即真机的 isWide 判定
  assert.match(ALL_CSS, /\.universal-card-root\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(ALL_CSS, /@container universal-card \(max-width:\s*320px\)\s*\{\s*\.universal-card-button--auto\s*\{\s*width:\s*100%/);
  // 自适应按钮不被父级拉伸
  assert.match(ALL_CSS, /\.universal-card-button\s*\{[^}]*align-self:\s*flex-start/);
  assert.match(ALL_CSS, /\.universal-card-button--auto\s*\{\s*width:\s*auto/);
  // 按钮不参与 body/form 的「子元素撑满」
  assert.match(ALL_CSS, /\.universal-card-body > \*:not\(\.universal-card-button\)/);
  assert.match(ALL_CSS, /\.universal-card-form > \*:not\(\.universal-card-button\)/);
  // input 默认上限 282px
  assert.match(ALL_CSS, /\.universal-card-input,\s*\.universal-card-input--static\s*\{[^}]*max-width:\s*282px/);
});

test('img_combination 渲染 double 布局与解析后的图片', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        elements: [{
          tag: 'img_combination',
          property: {
            combinationMode: 'double',
            imgList: [{ imageID: 'img_one' }, { imageID: 'img_two' }],
            cornerRadiusValue: { type: 'pixels', value: 8 },
          },
        }],
      },
    },
  }, { imageBaseURL: 'https://img.example/' });
  assert.match(html, /universal-card-img-combination--double/);
  assert.match(html, /universal-card-img-combination__item/);
  assert.match(html, /https:\/\/img\.example\/img_one/);
  assert.match(html, /https:\/\/img\.example\/img_two/);
  assert.match(html, /border-radius:8px/);
});

test('img_combination triple 渲染左大图 + 右列', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        elements: [{
          tag: 'img_combination',
          property: {
            combinationMode: 'triple',
            imgList: [{ imageID: 'a' }, { imageID: 'b' }, { imageID: 'c' }],
          },
        }],
      },
    },
  }, { imageBaseURL: 'https://img.example/' });
  assert.match(html, /universal-card-img-combination__left/);
  assert.match(html, /universal-card-img-combination__right/);
  assert.equal((html.match(/universal-card-img-combination__item/g) || []).length, 3);
});

test('select_img 渲染网格、选中/禁用态与表单内 checkbox', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        elements: [{
          tag: 'form',
          property: {
            elements: [{
              tag: 'select_img',
              property: {
                options: [
                  { imageID: 'img_one', value: 'a' },
                  { imageID: 'img_two', value: 'b', disabled: true },
                ],
                value: ['a'],
                multiSelect: true,
                layout: 'trisect',
                aspectRatio: '1:1',
              },
            }],
          },
        }],
      },
    },
  }, { imageBaseURL: 'https://img.example/' });
  assert.match(html, /universal-card-select-img--trisect/);
  assert.match(html, /universal-card-select-img__item-wrapper--selected/);
  assert.match(html, /universal-card-select-img__item-wrapper--disabled/);
  assert.match(html, /universal-card-select-img__checkbox-box--square/);
  assert.match(html, /universal-card-select-img__checkbox-box--checked/);
  assert.match(html, /aspect-ratio:1\/1/);
});

test('select_img 表单外不渲染 checkbox（仅用描边表达选中）', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        elements: [{
          tag: 'select_img',
          property: {
            options: [{ imageID: 'img_one', value: 'a' }],
            value: ['a'],
          },
        }],
      },
    },
  }, { imageBaseURL: 'https://img.example/' });
  assert.match(html, /item-wrapper--selected/);
  assert.doesNotMatch(html, /universal-card-select-img__checkbox/);
});

test('renderDslToString 支持 img_combination / select_img 公开 DSL', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'img_combination',
          combination_mode: 'bisect',
          img_list: [{ img_key: 'img_a' }, { img_key: 'img_b' }],
        },
        {
          tag: 'select_img',
          style: 'default',
          layout: 'bisect',
          options: [{ img_key: 'img_a', value: 'a' }],
          selected_values: ['a'],
        },
      ],
    },
  }, { imageBaseURL: 'https://img.example/' });
  assert.match(html, /universal-card-img-combination--bisect/);
  assert.match(html, /https:\/\/img\.example\/img_a/);
  assert.match(html, /universal-card-select-img--bisect/);
  assert.match(html, /universal-card-select-img__item-wrapper--selected/);
});

test('img_combination: 数值型 cornerRadiusValue 也转为圆角', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        elements: [{
          tag: 'img_combination',
          property: {
            combinationMode: 'bisect',
            imgList: [{ imageID: 'img_one' }],
            cornerRadiusValue: 6,
          },
        }],
      },
    },
  }, { imageBaseURL: 'https://img.example/' });
  assert.match(html, /border-radius:6px/);
});

// ---- collapsible_panel ----

test('collapsible_panel: 折叠态默认收起（expanded 缺省），展开才带 open', () => {
  const closed = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'collapsible_panel', header: { title: { tag: 'plain_text', content: '详情' } }, elements: [] }] },
  });
  assert.doesNotMatch(closed, /<details[^>]*\sopen/);
  const opened = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'collapsible_panel', expanded: true, header: { title: { tag: 'plain_text', content: '详情' } }, elements: [] }] },
  });
  assert.match(opened, /<details[^>]*\sopen/);
});

test('collapsible_panel: expanded_title 与 title 同时渲染，靠 details[open] 切换', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'collapsible_panel',
      expanded: false,
      header: {
        title: { tag: 'plain_text', content: '展开详情' },
        expanded_title: { tag: 'plain_text', content: '收起详情' },
      },
      elements: [{ tag: 'markdown', content: '内容' }],
    }] },
  });
  assert.match(html, /collapsible-panel__title--has-expanded/);
  assert.match(html, /collapsible-panel__title-text--expanded/);
  assert.match(html, /展开详情/);
  assert.match(html, /收起详情/);
  // 没有 expanded_title 时不挂 --has-expanded，避免展开后标题消失
  const plain = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'collapsible_panel', header: { title: { tag: 'plain_text', content: '只有标题' } }, elements: [] }] },
  });
  assert.doesNotMatch(plain, /title--has-expanded/);
  assert.match(plain, /只有标题/);
});

test('collapsible_panel: header.background_color / width / vertical_align 落到 summary', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'collapsible_panel',
      header: {
        title: { tag: 'plain_text', content: '标题' },
        background_color: 'grey-100',
        width: 'auto_when_fold',
        vertical_align: 'top',
      },
      elements: [],
    }] },
  });
  assert.match(html, /--w-auto-when-fold/);
  assert.match(html, /--valign-top/);
  // grey-100 = #f2f3f5
  assert.match(html, /background:#f2f3f5/);
});

test('collapsible_panel: header.position=bottom 标题落到内容下方（flex order）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'collapsible_panel',
      expanded: true,
      header: { title: { tag: 'plain_text', content: '标题' }, position: 'bottom' },
      elements: [{ tag: 'markdown', content: '内容' }],
    }] },
  });
  assert.match(html, /flex-direction:column/);
  assert.match(html, /order:2/); // summary 在下
  assert.match(html, /order:1/); // 内容在上
});

test('collapsible_panel: direction / spacing / align 落到内容区', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'collapsible_panel',
      expanded: true,
      direction: 'horizontal',
      horizontal_spacing: '12px',
      vertical_spacing: '4px',
      horizontal_align: 'center',
      vertical_align: 'top',
      header: { title: { tag: 'plain_text', content: '标题' } },
      elements: [{ tag: 'markdown', content: 'a' }, { tag: 'markdown', content: 'b' }],
    }] },
  });
  assert.match(html, /collapsible-panel__content[^"]*"[^>]*style="[^"]*display:flex/);
  assert.match(html, /flex-direction:row/);
  assert.match(html, /column-gap:12px/);
  assert.match(html, /row-gap:4px/);
  assert.match(html, /justify-content:center/);
  assert.match(html, /align-items:flex-start/);
});

test('collapsible_panel: 兼容 RAW 里 header.title 包一层 property 的形态', () => {
  const html = renderCardToString({
    json_card: {
      schema: '2.0',
      body: { tag: 'body', property: { elements: [{
        tag: 'collapsible_panel',
        property: {
          expanded: true,
          header: {
            title: { tag: 'plain_text', property: { content: '包裹形态' } },
          },
          elements: [{ tag: 'markdown', property: { content: 'x' } }],
        },
      }] } },
    },
  });
  assert.match(html, /包裹形态/);
});

/* ---- RAW: column.widthValue 三种 echo（对齐真机 Kn()）---- */

function rawColumnStyle(property) {
  const html = renderCardToString({
    json_card: {
      schema: '2.0',
      body: { tag: 'body', property: { elements: [{
        tag: 'column_set',
        property: { columns: [{ tag: 'column', property }] },
      }] } },
    },
  });
  const m = html.match(/class="universal-card-column"[^>]*style="([^"]*)"/);
  assert.ok(m, 'column 应输出内联 style');
  return m[1];
}

test('RAW column: widthValue.pixels → width:Npx，且允许被整行压缩', () => {
  const style = rawColumnStyle({ widthValue: { type: 'pixels', value: 120 } });
  assert.match(style, /width:120px/);
  // 真机整行超宽时按 px 比例压缩（600px 行在 576px 内容区里缩到 576），
  // flex-shrink:0 会定死宽度并溢出卡片。
  assert.match(style, /flex-shrink:1/);
});

test('RAW column: 越界 px（<16 / >600）按 auto 渲染（真机忽略该值）', () => {
  assert.match(rawColumnStyle({ widthValue: { type: 'pixels', value: 10 } }), /width:auto/);
  assert.match(rawColumnStyle({ widthValue: { type: 'pixels', value: 800 } }), /width:auto/);
  assert.match(rawColumnStyle({ widthValue: { type: 'pixels', value: 16 } }), /width:16px/);
  assert.match(rawColumnStyle({ widthValue: { type: 'pixels', value: 600 } }), /width:600px/);
});

test('column_set stretch：挂模式类，窄屏由容器查询堆叠（宽屏列宽照常）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'column_set',
      flex_mode: 'stretch',
      columns: [
        { tag: 'column', width: 'weighted', weight: 1, elements: [{ tag: 'markdown', content: 'a' }] },
        { tag: 'column', width: '16px', elements: [{ tag: 'markdown', content: 'b' }] },
      ],
    }] },
  });
  // 真机 isWide（容器 > 320px）时 flexMode 当 none，所以内联样式必须保留列自己的宽度。
  assert.match(html, /universal-card-column-set universal-card-column-set--stretch/);
  const styles = [...html.matchAll(/class="universal-card-column(?!-)[^"]*" style="([^"]*)"/g)].map(
    (m) => m[1],
  );
  assert.equal(styles.length, 2);
  assert.match(styles[0], /flex-basis:0/);
  assert.match(styles[1], /width:16px/);
  // 窄屏覆盖在样式表里，不能再用 flex-shrink:0（否则 100% 列把兄弟压成 0）。
  assert.match(ALL_CSS, /@container universal-card \(max-width: 320px\)/);
  assert.match(ALL_CSS, /universal-card-column-set--stretch > \.universal-card-column/);
  assert.match(ALL_CSS, /flex-wrap: wrap/);
});

test('column_set flow：挂 --flow 类；窄屏才变 auto，宽屏保留 px / weighted', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'column_set',
      flex_mode: 'flow',
      columns: [
        { tag: 'column', width: '120px', elements: [{ tag: 'markdown', content: '120' }] },
        { tag: 'column', width: 'weighted', weight: 3, elements: [{ tag: 'markdown', content: 'w3' }] },
      ],
    }] },
  });
  assert.match(html, /universal-card-column-set--flow/);
  const styles = [...html.matchAll(/class="universal-card-column(?!-)[^"]*" style="([^"]*)"/g)].map(
    (m) => m[1],
  );
  assert.equal(styles.length, 2);
  assert.match(styles[0], /width:120px/);
  assert.match(styles[1], /flex-grow:3/);
  assert.match(ALL_CSS, /universal-card-column-set--flow > \.universal-card-column/);
  assert.match(ALL_CSS, /width: auto !important/);
});

test('RAW column: widthValue.column_width_weighted → flex-grow 用 value', () => {
  const style = rawColumnStyle({ widthValue: { type: 'column_width_weighted', value: 3 } });
  assert.match(style, /flex-basis:0/);
  assert.match(style, /flex-grow:3/);
});

test('RAW column: widthValue.builtin_column_width=auto → width:auto', () => {
  const style = rawColumnStyle({ widthValue: { type: 'builtin_column_width', value: 'auto' } });
  assert.match(style, /width:auto/);
  assert.equal(/flex-grow/.test(style), false);
});

test('RAW column: 无任何 width 时不输出宽度（默认贴内容宽）', () => {
  const style = rawColumnStyle({ elements: [] });
  assert.equal(/width:/.test(style), false);
  assert.equal(/flex-grow/.test(style), false);
});
