'use strict';

const fs = require('fs');
const path = require('path');
const { uploadMaterial, uploadContentImage, addDraft } = require('../api');
const { getMdflowConfig, loadConfig } = require('../config');

// ── mdflow 配置 ───────────────────────────────────────────────────────────────

const PRIMARY_COLORS = ['blue', 'green', 'orange', 'yellow', 'purple', 'sky', 'rosegold', 'olive', 'black', 'gray', 'pink'];
const HEADING_STYLES = ['default', 'color', 'bottom', 'left'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMdflowOptions(cfg) {
  const opts = {
    theme: 'default',
    fontFamily: 'serif',
    fontSize: '推荐',
    primaryColor: cfg.primary_color || pickRandom(PRIMARY_COLORS),
    heading1: 'default',
    heading2: cfg.heading_2 || pickRandom(HEADING_STYLES),
    heading3: 'default',
    codeTheme: 'github-dark',
    legend: 'none',
    macCodeBlock: true,
    codeLineNumbers: false,
    citeStatus: false,
    useIndent: false,
    useJustify: false,
  };
  if (cfg.asset_dir) opts.assetDir = cfg.asset_dir;
  return opts;
}

// ── 图片校验 & 压缩 ──────────────────────────────────────────────────────────

// 内容图（正文内联）：仅支持 JPG/PNG，上限 1MB
const CONTENT_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png']);
const CONTENT_IMAGE_LIMIT = 1 * 1024 * 1024;

// 永久素材（封面图 / newspic 图片列表）：支持 JPG/PNG/BMP/GIF，上限 10MB
const MATERIAL_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.gif']);
const MATERIAL_IMAGE_LIMIT = 10 * 1024 * 1024;

// BMP/GIF 没有可用的无损压缩器，超限时直接报错
const COMPRESSIBLE_EXTS = new Set(['.jpg', '.jpeg', '.png']);

function validateImageFormat(buffer, filename, allowedExts) {
  const ext = path.extname(filename).toLowerCase();
  if (!allowedExts.has(ext)) {
    const list = [...allowedExts].map((e) => e.slice(1).toUpperCase()).join(' / ');
    throw new Error(`不支持的图片格式 "${ext}"，仅支持 ${list}`);
  }
  if (buffer.length < 4) {
    throw new Error(`"${filename}" 文件内容为空或过短，不是有效的图片`);
  }
  if (ext === '.png') {
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
      throw new Error(`"${filename}" 扩展名为 .png 但文件头不是有效的 PNG`);
    }
  } else if (ext === '.bmp') {
    if (buffer[0] !== 0x42 || buffer[1] !== 0x4D) {
      throw new Error(`"${filename}" 扩展名为 .bmp 但文件头不是有效的 BMP`);
    }
  } else if (ext === '.gif') {
    if (buffer[0] !== 0x47 || buffer[1] !== 0x49 || buffer[2] !== 0x46 || buffer[3] !== 0x38) {
      throw new Error(`"${filename}" 扩展名为 .gif 但文件头不是有效的 GIF`);
    }
  } else {
    if (buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
      throw new Error(`"${filename}" 扩展名为 ${ext} 但文件头不是有效的 JPEG`);
    }
  }
}

/**
 * 校验图片格式，并在超过 sizeLimit 时尝试无损压缩（仅 JPG/PNG 支持）。
 * BMP/GIF 不可压缩，超限直接报错。
 * 压缩后若仍超过 hardLimit 则报错。
 */
async function maybeCompress(buffer, filename, sizeLimit, hardLimit, allowedExts) {
  validateImageFormat(buffer, filename, allowedExts);
  if (buffer.length <= sizeLimit) return buffer;

  const ext = path.extname(filename).toLowerCase();

  if (!COMPRESSIBLE_EXTS.has(ext)) {
    throw new Error(
      `"${filename}" 超过限制（${(buffer.length / 1024 / 1024).toFixed(1)}MB / 限 ${(hardLimit / 1024 / 1024).toFixed(0)}MB），${ext.slice(1).toUpperCase()} 格式不支持自动压缩，请手动处理`
    );
  }

  const { default: imagemin } = await import('imagemin');
  let plugin;
  if (ext === '.png') {
    const { default: imageminOptipng } = await import('imagemin-optipng');
    plugin = imageminOptipng();
  } else {
    const { default: imageminJpegtran } = await import('imagemin-jpegtran');
    plugin = imageminJpegtran();
  }
  const compressed = Buffer.from(await imagemin.buffer(buffer, { plugins: [plugin] }));

  if (compressed.length >= hardLimit) {
    throw new Error(
      `"${filename}" 压缩后仍超过限制（${(compressed.length / 1024 / 1024).toFixed(1)}MB / 限 ${(hardLimit / 1024 / 1024).toFixed(0)}MB）`
    );
  }
  return compressed;
}

/**
 * 扫描 wxhtml 中所有本地 <img src> 路径，压缩后上传为内容图，并替换 URL。
 * @param {string} wxhtml
 * @param {string} mdDir  Markdown 文件所在目录，用于解析相对路径
 * @param {string|undefined} appid
 * @returns {Promise<string>} 替换后的 HTML
 */
async function uploadContentImages(wxhtml, mdDir, appid) {
  const IMG_RE = /(<img\b[^>]*?\ssrc=")([^"]+)(")/gi;

  // 收集所有唯一的本地 src
  const localSrcs = new Set();
  for (const m of wxhtml.matchAll(IMG_RE)) {
    const src = m[2];
    if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
      localSrcs.add(src);
    }
  }
  if (localSrcs.size === 0) return wxhtml;

  // 逐一上传，建立 src → wx_url 映射
  const urlMap = new Map();
  for (const src of localSrcs) {
    const absPath = path.isAbsolute(src) ? src : path.resolve(mdDir, src);
    if (!fs.existsSync(absPath)) {
      throw new Error(`内容图不存在: ${absPath}`);
    }
    const raw = fs.readFileSync(absPath);
    const filename = path.basename(absPath);

    let buffer;
    try {
      buffer = await maybeCompress(raw, filename, CONTENT_IMAGE_LIMIT, CONTENT_IMAGE_LIMIT, CONTENT_IMAGE_EXTS);
    } catch (e) {
      throw new Error(`内容图处理失败 (${filename}): ${e.message}`);
    }
    if (buffer.length < raw.length) {
      process.stdout.write(`  压缩内容图: ${filename} ${(raw.length / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB\n`);
    }

    process.stdout.write(`  上传内容图: ${filename} ...`);
    const wxUrl = await uploadContentImage(buffer, filename, appid);
    process.stdout.write(` ${wxUrl}\n`);
    urlMap.set(src, wxUrl);
  }

  // 替换 HTML 中的 src
  return wxhtml.replace(IMG_RE, (_, pre, src, post) => {
    return pre + (urlMap.get(src) ?? src) + post;
  });
}

// ── Front matter 解析 ────────────────────────────────────────────────────────

/**
 * 解析 Markdown 文件头部的 YAML front matter。
 * 支持字符串、数字值；image_list 支持多行列表（- 路径）。
 * @returns {{ meta: object, body: string }}
 */
function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const rawMeta = match[1];
  const body = match[2];
  const meta = {};
  const lines = rawMeta.split(/\r?\n/);

  // 已知文件扩展名：结尾匹配则视为文件路径，整段原样保留（仅剥离两端引号）
  const FILE_EXT_RE = /\.(jpe?g|png|gif|bmp|webp|tiff?|avif|heic|mp4|mp3|wav|amr|wma|m4a)$/i;

  const parseVal = (raw) => {
    const s = raw.trim();
    if (!s) return null;
    // 剥离两端匹配的单引号或双引号
    const unquoted = s.replace(/^(['"])(.*)\1$/, '$2').trim();
    if (!unquoted) return null;
    // 以已知文件扩展名结尾 → 文件路径，原样返回（含空格、特殊字符）
    if (FILE_EXT_RE.test(unquoted)) return unquoted;
    // 普通值
    return unquoted;
  };

  let currentKey = null;
  for (const line of lines) {
    // 列表项：  - value（尽可能抓取整行，兼容路径中的空格与特殊字符）
    const listMatch = line.match(/^\s+-\s+([\s\S]+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      const v = parseVal(listMatch[1]);
      if (v !== null) meta[currentKey].push(v);
      continue;
    }
    // key: value（value 部分贪婪匹配整行剩余，确保含空格的路径不被截断）
    const kvMatch = line.match(/^(\w+)\s*:\s*([\s\S]*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      meta[currentKey] = parseVal(kvMatch[2]);
    }
  }

  return { meta, body };
}

// ── 上传封面图，返回 media_id ─────────────────────────────────────────────────

/**
 * 读取本地图片 → 压缩（如需）→ 上传永久素材，返回 media_id。
 * @param {string} imagePath  本地路径（绝对路径直接使用；相对路径相对 baseDir 解析）
 * @param {string} baseDir    Markdown 文件所在目录，用于解析相对路径
 * @param {string} label      日志前缀，如 "封面图" / "图片[1/3]"
 * @param {string|undefined} appid
 */
async function uploadLocalImageAsMaterial(imagePath, baseDir, label, appid) {
  const clean = imagePath.trim();
  const absPath = path.isAbsolute(clean) ? clean : path.resolve(baseDir, clean);
  if (!fs.existsSync(absPath)) {
    throw new Error(`${label}不存在: ${absPath}`);
  }
  const raw = fs.readFileSync(absPath);
  const filename = path.basename(absPath);

  let buffer;
  try {
    buffer = await maybeCompress(raw, filename, MATERIAL_IMAGE_LIMIT, MATERIAL_IMAGE_LIMIT, MATERIAL_IMAGE_EXTS);
  } catch (e) {
    throw new Error(`${label}处理失败: ${e.message}`);
  }
  if (buffer.length < raw.length) {
    process.stdout.write(`  压缩${label}: ${filename} ${(raw.length / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB\n`);
  }

  process.stdout.write(`  上传${label}: ${filename} ...`);
  const result = await uploadMaterial(buffer, filename, appid);
  process.stdout.write(` media_id=${result.media_id}\n`);
  return result.media_id;
}

async function renderToWxhtml(body) {
  const mdflowOpts = buildMdflowOptions(getMdflowConfig());
  process.stdout.write(`  转换 Markdown → 微信富文本（主题色=${mdflowOpts.primaryColor} 二级标题=${mdflowOpts.heading2}）...`);
  try {
    const { renderMarkdown } = await import('@rongyan/mdflow-cli');
    const rendered = await renderMarkdown(body, mdflowOpts);
    process.stdout.write(' 完成\n');
    return rendered.wxhtml;
  } catch (e) {
    process.stdout.write('\n');
    throw new Error(`Markdown 转换失败: ${e.message}`);
  }
}

// ── 主命令 ───────────────────────────────────────────────────────────────────

async function cmdAddDraft(filePath, opts = {}) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`文件不存在: ${absPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absPath, 'utf-8');
  const { meta, body } = parseFrontMatter(content);

  // ── 校验公共必填字段
  const title = meta.title;
  if (!title) {
    console.error('front matter 缺少 title');
    process.exit(1);
  }
  if (title.length > 64) title = title.slice(0, 64);

  const articleType = meta.article_type || 'news';
  const cfg = loadConfig();
  let article;

  if (articleType === 'newspic') {
    // ── 图片消息
    const imageList = Array.isArray(meta.image_list) ? meta.image_list : [];
    if (imageList.length === 0) {
      console.error('newspic 类型 front matter 缺少 image_list');
      process.exit(1);
    }
    if (imageList.length > 20) {
      console.error(`image_list 最多 20 张，当前 ${imageList.length} 张`);
      process.exit(1);
    }

    // 上传每张图片为永久素材 → 收集 media_id
    const mdDir = path.dirname(absPath);
    const imageMediaIds = [];
    for (let i = 0; i < imageList.length; i++) {
      try {
        const mediaId = await uploadLocalImageAsMaterial(
          imageList[i], mdDir, `图片[${i + 1}/${imageList.length}]`, opts.account
        );
        imageMediaIds.push(mediaId);
      } catch (e) {
        console.error(`图片上传失败: ${e.message}`);
        process.exit(1);
      }
    }

    article = {
      article_type: 'newspic',
      title,
      content: body.trim(),
      need_open_comment: cfg.need_open_comment ?? 1,
      only_fans_can_comment: cfg.only_fans_can_comment ?? 0,
      image_info: {
        image_list: imageMediaIds.map((id) => ({ image_media_id: id })),
      },
    };
  } else {
    // ── 图文消息
    if (!meta.cover) {
      console.error('front matter 缺少 cover（封面图路径）');
      process.exit(1);
    }
    if (!body.trim()) {
      console.error('正文内容不能为空');
      process.exit(1);
    }

    // 上传封面图 → thumb_media_id
    let thumbMediaId;
    try {
      thumbMediaId = await uploadLocalImageAsMaterial(
        meta.cover, path.dirname(absPath), '封面图', opts.account
      );
    } catch (e) {
      console.error(`封面图上传失败: ${e.message}`);
      process.exit(1);
    }

    // 正文 Markdown → 微信富文本
    let wxhtml;
    try {
      wxhtml = await renderToWxhtml(body);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }

    // 上传正文内联图片
    try {
      wxhtml = await uploadContentImages(wxhtml, path.dirname(absPath), opts.account);
    } catch (e) {
      console.error(`内容图上传失败: ${e.message}`);
      process.exit(1);
    }

    const digest = meta.digest
      || wxhtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);

    article = {
      article_type: 'news',
      title,
      ...(meta.author && { author: meta.author }),
      digest,
      content: wxhtml,
      thumb_media_id: thumbMediaId,
      need_open_comment: cfg.need_open_comment ?? 1,
      only_fans_can_comment: cfg.only_fans_can_comment ?? 0,
    };
  }

  // ── 创建草稿
  try {
    const result = await addDraft([article], opts.account);
    console.log(`草稿创建成功`);
    console.log(`media_id: ${result.media_id}`);
  } catch (e) {
    console.error(`创建草稿失败: ${e.message}`);
    process.exit(1);
  }
}

module.exports = cmdAddDraft;
