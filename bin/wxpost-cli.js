#!/usr/bin/env node

'use strict';

const cmdAddDraft = require('../src/commands/add-draft');
const cmdListDraft = require('../src/commands/list-draft');
const cmdPublish = require('../src/commands/publish');

const HELP = `
熔岩微信公众号发布客户端

用法:
  wxpost <命令> [参数] [选项]

命令:
  add_draft <file.md>      从 Markdown 文件创建草稿
  list_draft               获取草稿列表
  publish <media_id>       发布草稿

add_draft 选项:
  --account <appid>        指定公众号账号（默认使用配置中的 defaultAccount）

  Markdown 文件需包含 front matter，图文消息（news）示例：

    ---
    title: 文章标题
    author: 作者名
    digest: 自定义摘要（可选，不填则自动截取正文前 100 字）
    cover: ./images/cover.jpg
    ---
    正文内容...

  图片消息（newspic）示例：

    ---
    title: 相册标题
    article_type: newspic
    image_list:
      - ./photos/01.jpg
      - ./photos/02.jpg
    ---
    图片说明文字...

list_draft 选项:
  --offset <n>             起始偏移，默认 0
  --count <n>              返回数量 1-20，默认 20
  --account <appid>        指定公众号账号

publish 选项:
  --account <appid>        指定公众号账号

配置文件: ~/.@rongyan/env-cli.json
  server_url               wxpost-server 地址，默认 http://localhost:3000
  api_key                  API Key（与 wxpost-server 配置一致）
  need_open_comment        是否开启评论，默认 1
  only_fans_can_comment    仅粉丝可评论，默认 0
  mdflow.primary_color     主题色（留 null 每次随机）
  mdflow.heading_2         二级标题样式（留 null 每次随机）
  mdflow.asset_dir         Mermaid PNG 输出目录（可选）

示例:
  wxpost add_draft article.md
  wxpost add_draft article.md --account wx84671d15576a9880
  wxpost list_draft
  wxpost list_draft --offset 20 --count 10
  wxpost publish <media_id>
`;

function parseArgs(argv) {
  const args = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        // camelCase 转换：--thumb-media-id => thumbMediaId
        const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        opts[camel] = next;
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      args.push(a);
    }
  }
  return { args, opts };
}

async function main() {
  const { args, opts } = parseArgs(process.argv.slice(2));
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP);
    process.exit(0);
  }

  if (cmd === 'add_draft') {
    const file = args[1];
    if (!file) {
      console.error('用法: wxpost add_draft <file.md>');
      process.exit(1);
    }
    await cmdAddDraft(file, opts);
  } else if (cmd === 'list_draft') {
    await cmdListDraft(opts);
  } else if (cmd === 'publish') {
    const mediaId = args[1];
    await cmdPublish(mediaId, opts);
  } else {
    console.error(`未知命令: ${cmd}\n运行 wxpost --help 查看帮助`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`意外错误: ${e.message}`);
  process.exit(1);
});
