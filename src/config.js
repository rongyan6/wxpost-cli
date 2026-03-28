'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.@rongyan');
const CONFIG_PATH = path.join(CONFIG_DIR, 'env-cli.json');

const TEMPLATE = {
  server_url: 'http://localhost:3000',
  api_key: '__YOUR_API_KEY__',
  need_open_comment: 1,
  only_fans_can_comment: 0,
  mdflow: {
    primary_color: null,
    heading_2: null,
    asset_dir: null,
  },
};

function ensureConfig() {
  if (fs.existsSync(CONFIG_PATH)) return false;

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(TEMPLATE, null, 2) + '\n', 'utf-8');
  return true;
}

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;

  const created = ensureConfig();
  if (created) {
    console.error([
      '',
      '  配置文件已创建：' + CONFIG_PATH,
      '  请编辑该文件，填入 wxpost-server 地址和 API Key，然后重新运行。',
      '',
      '  格式说明：',
      '    server_url          — wxpost-server 地址，例如 http://localhost:3000',
      '    api_key             — 与 wxpost-server 配置中一致的 API Key',
      '    mdflow.primary_color — 主题色（可选，留 null 则每次随机）',
      '    mdflow.heading_2     — 二级标题样式（可选，留 null 则每次随机）',
      '    mdflow.asset_dir     — Mermaid PNG 输出目录（可选）',
      '',
    ].join('\n'));
    process.exit(1);
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  try {
    _cache = JSON.parse(raw);
  } catch (e) {
    console.error(`配置文件 JSON 格式错误 (${CONFIG_PATH}): ${e.message}`);
    process.exit(1);
  }

  // 补全旧版配置文件缺失的字段
  let patched = false;
  if (_cache.need_open_comment === undefined) { _cache.need_open_comment = TEMPLATE.need_open_comment; patched = true; }
  if (_cache.only_fans_can_comment === undefined) { _cache.only_fans_can_comment = TEMPLATE.only_fans_can_comment; patched = true; }
  if (!_cache.mdflow) { _cache.mdflow = { ...TEMPLATE.mdflow }; patched = true; }
  if (patched) fs.writeFileSync(CONFIG_PATH, JSON.stringify(_cache, null, 2) + '\n', 'utf-8');

  return _cache;
}

function getCliConfig() {
  const config = loadConfig();
  const serverUrl = (config.server_url || 'http://localhost:3000').replace(/\/$/, '');
  const apiKey = config.api_key || '';

  if (!apiKey || apiKey === '__YOUR_API_KEY__') {
    console.error([
      '',
      '  API Key 未配置。',
      `  请编辑 ${CONFIG_PATH}，将 api_key 替换为真实值。`,
      '',
    ].join('\n'));
    process.exit(1);
  }

  return { serverUrl, apiKey };
}

function getMdflowConfig() {
  return loadConfig().mdflow || {};
}

module.exports = { loadConfig, getCliConfig, getMdflowConfig, CONFIG_PATH };
