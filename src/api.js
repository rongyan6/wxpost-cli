'use strict';

const http = require('http');
const https = require('https');
const { getCliConfig } = require('./config');

function request(pathname, body) {
  const { serverUrl, apiKey } = getCliConfig();
  const url = new URL(pathname, serverUrl);
  const isHttps = url.protocol === 'https:';
  const driver = isHttps ? https : http;

  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = driver.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            return reject(new Error(`服务器响应解析失败: ${raw}`));
          }
          if (!data.ok) {
            return reject(new Error(data.error || '请求失败'));
          }
          resolve(data);
        });
      }
    );
    req.on('error', (e) => reject(new Error(`连接服务器失败: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

/**
 * 上传本地图片为永久素材，返回 { media_id, url }。
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string|null} appid
 */
function uploadMaterial(buffer, filename, appid) {
  const { serverUrl, apiKey } = getCliConfig();
  const qs = appid ? `?appid=${appid}` : '';
  const url = new URL(`/upload-material${qs}`, serverUrl);
  const isHttps = url.protocol === 'https:';
  const driver = isHttps ? https : http;

  const boundary = `----CliUploadBoundary${Date.now()}`;
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = { png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  const mimeType = mimeTypes[ext] || 'image/jpeg';
  const safeFilename = filename.split(/[\\/]/).pop() || 'image';

  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="${safeFilename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, tail]);

  return new Promise((resolve, reject) => {
    const req = driver.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          'Authorization': `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            return reject(new Error(`服务器响应解析失败: ${raw}`));
          }
          if (!data.ok) return reject(new Error(data.error || '上传失败'));
          resolve(data);
        });
      }
    );
    req.on('error', (e) => reject(new Error(`连接服务器失败: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

/**
 * 上传内容图（用于图文正文），返回微信 CDN url。
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string|null} appid
 */
function uploadContentImage(buffer, filename, appid) {
  const { serverUrl, apiKey } = getCliConfig();
  const qs = appid ? `?appid=${appid}` : '';
  const url = new URL(`/upload-image${qs}`, serverUrl);
  const isHttps = url.protocol === 'https:';
  const driver = isHttps ? https : http;

  const boundary = `----CliUploadBoundary${Date.now()}`;
  const ext = filename.split('.').pop().toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const safeFilename = filename.split(/[\\/]/).pop() || 'image';

  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="${safeFilename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, tail]);

  return new Promise((resolve, reject) => {
    const req = driver.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          'Authorization': `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            return reject(new Error(`服务器响应解析失败: ${raw}`));
          }
          if (!data.ok) return reject(new Error(data.error || '上传失败'));
          resolve(data.url);
        });
      }
    );
    req.on('error', (e) => reject(new Error(`连接服务器失败: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

function addDraft(articles, appid) {
  const path = appid ? `/draft/add?appid=${appid}` : '/draft/add';
  return request(path, { articles });
}

function listDraft({ offset = 0, count = 20, no_content = 0 } = {}, appid) {
  const path = appid ? `/draft/list?appid=${appid}` : '/draft/list';
  return request(path, { offset, count, no_content });
}

function publishDraft(mediaId, appid) {
  const path = appid ? `/draft/publish?appid=${appid}` : '/draft/publish';
  return request(path, { media_id: mediaId });
}

module.exports = { uploadMaterial, uploadContentImage, addDraft, listDraft, publishDraft };
