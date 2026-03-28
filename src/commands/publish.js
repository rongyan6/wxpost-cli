'use strict';

const { publishDraft } = require('../api');

async function cmdPublish(mediaId, opts = {}) {
  if (!mediaId) {
    console.error('请提供草稿的 media_id');
    process.exit(1);
  }

  try {
    const result = await publishDraft(mediaId, opts.account);
    console.log(`发布成功`);
    console.log(`publish_id:  ${result.publish_id}`);
    if (result.msg_data_id) {
      console.log(`msg_data_id: ${result.msg_data_id}`);
    }
  } catch (e) {
    console.error(`发布失败: ${e.message}`);
    process.exit(1);
  }
}

module.exports = cmdPublish;
