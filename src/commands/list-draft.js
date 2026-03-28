'use strict';

const { listDraft } = require('../api');

async function cmdListDraft(opts = {}) {
  const offset = parseInt(opts.offset ?? 0, 10);
  const count = parseInt(opts.count ?? 20, 10);

  try {
    const result = await listDraft({ offset, count, no_content: 1 }, opts.account);
    const items = result.item || [];

    console.log(`草稿总数: ${result.total_count}  本次返回: ${result.item_count}`);
    console.log('');

    if (items.length === 0) {
      console.log('暂无草稿');
      return;
    }

    items.forEach((item, i) => {
      const articles = item.content?.news_item || [];
      const first = articles[0] || {};
      const updateTime = item.update_time
        ? new Date(item.update_time * 1000).toLocaleString('zh-CN')
        : '-';
      const extra = articles.length > 1 ? `  共 ${articles.length} 篇` : '';

      console.log(`[${offset + i + 1}] ${first.title || '(无标题)'}${extra}`);
      console.log(`    media_id:   ${item.media_id}`);
      console.log(`    更新时间:   ${updateTime}`);
      if (first.author) console.log(`    作者:       ${first.author}`);
      console.log('');
    });
  } catch (e) {
    console.error(`获取草稿列表失败: ${e.message}`);
    process.exit(1);
  }
}

module.exports = cmdListDraft;
