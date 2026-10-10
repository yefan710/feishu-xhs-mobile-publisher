'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const target = path.join(__dirname, '../public/direct-route.js');
const context = vm.createContext({ URL, TextEncoder, btoa });
if (fs.existsSync(target)) vm.runInContext(fs.readFileSync(target, 'utf8'), context);
const routes = context.XhsDirectRoute || {};
const note = { type: 'normal', title: '中文🌟测试', content: '第一行\n第二行 #旅行 #已有[话题]#',
  images: ['https://example.com/1.jpg?name=%E4%B8%AD&n=1', 'https://example.com/2.jpg', 'https://example.com/3.jpg'] };
function build(mode) {
  assert.equal(typeof routes.build, 'function', 'missing direct handoff route builder');
  return routes.build(note, mode);
}
test('iOS nested route preserves ordered media, Unicode, newline and existing topics', () => {
  const outer = new URL(build('ios'));
  assert.equal(outer.origin, 'https://oia.xiaohongshu.com');
  const inner = new URL(outer.searchParams.get('deeplink'));
  assert.equal(inner.hostname, 'post_new_note');
  const attach = JSON.parse(inner.searchParams.get('attach'));
  assert.equal(attach.note_title, note.title);
  assert.equal(attach.note_text, '第一行\n第二行 #旅行[话题]# #已有[话题]#');
  assert.deepEqual(attach.images, note.images);
  assert.deepEqual(attach.image_resources.map(image => image.image_url), note.images);
});
test('Android UTF-8 Base64 roundtrip preserves ordered URLs and all text', () => {
  const uri = new URL(build('android'));
  assert.equal(uri.hostname, 'share_sdk');
  const data = JSON.parse(Buffer.from(uri.searchParams.get('data'), 'base64').toString('utf8'));
  assert.equal(data.note_info.title.value, note.title);
  assert.equal(data.note_info.content.value, note.content);
  assert.deepEqual(data.note_info.image_info.map(image => image.url), note.images);
});

test('Android browser launch explicitly targets Xiaohongshu and retains the original payload', () => {
  assert.equal(typeof routes.buildLaunch, 'function');
  const intent = routes.buildLaunch(note, 'android');
  assert.match(intent, /^intent:\/\/share_sdk\?data=/);
  assert.ok(intent.endsWith('#Intent;scheme=xhsdiscover;package=com.xingin.xhs;end'));
  assert.doesNotMatch(intent, /browser_fallback_url|\.apk|lumi/i);
  const uri = new URL(intent.split('#Intent;')[0].replace('intent:', 'xhsdiscover:'));
  const payload = JSON.parse(Buffer.from(uri.searchParams.get('data'), 'base64').toString('utf8'));
  assert.equal(payload.note_info.title.value, note.title);
  assert.equal(payload.note_info.content.value, note.content);
  assert.deepEqual(payload.note_info.image_info.map(image => image.url), note.images);
});

test('browser launch preserves iOS and offers the original Android scheme as a manual alternative', () => {
  assert.equal(typeof routes.buildLaunch, 'function');
  assert.equal(routes.buildLaunch(note, 'ios'), build('ios'));
  assert.match(routes.buildLaunch(note, 'android_scheme'), /^xhsdiscover:\/\/share_sdk\?data=/);
  assert.throws(() => routes.buildLaunch(note, 'unknown'), /平台/);
});
test('platform detection handles Android, iPhone, iPad desktop UA and unsupported desktop', () => {
  assert.equal(typeof routes.detectPlatform, 'function', 'missing platform detection');
  assert.equal(routes.detectPlatform('Android'), 'android');
  assert.equal(routes.detectPlatform('iPhone'), 'ios');
  assert.equal(routes.detectPlatform('Macintosh', 'MacIntel', 5), 'ios');
  assert.equal(routes.detectPlatform('Windows', 'Win32', 0), null);
});
test('route refuses unsafe URLs and unsupported platforms before launch', () => {
  assert.equal(typeof routes.build, 'function', 'missing direct handoff route builder');
  for (const url of ['http://example.com/1.jpg', 'javascript:alert(1)', 'https://user:pass@example.com/1.jpg']) {
    assert.throws(() => routes.build({ ...note, images: [url] }, 'ios'), /HTTPS/);
  }
  assert.throws(() => routes.build(note, 'windows'), /平台/);
});
