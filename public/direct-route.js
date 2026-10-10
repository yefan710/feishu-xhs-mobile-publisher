/* SPDX-License-Identifier: Apache-2.0
 * Protocol payload adapted from Aixuangit/Lumi, lumi/xhs_qr_preview.html
 * Source blob: 3d5f0c1e1a87c92f82b9037875333cc72af38d7f
 * Modified for this experimental image-only test page, 2026-10-09.
 * Added explicit Android package launch transport, 2026-10-10.
 * See vendor/lumi-NOTICE.txt and vendor/lumi-LICENSE.txt.
 */
'use strict';
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XhsDirectRoute = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  function detectPlatform(ua, platform = '', touchPoints = 0) {
    if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1)) return 'ios';
    if (/Android|Adr/i.test(ua)) return 'android';
    return null;
  }
  function topics(text) {
    return text.replace(/(^|\s)#([^\s#\[\]，。！？,!?]+)/g, (all, prefix, name, offset, whole) =>
      whole.slice(offset + all.length, offset + all.length + 5) === '[话题]#' ? all : `${prefix}#${name}[话题]#`);
  }
  function build(note, mode) {
    if (!['ios', 'android'].includes(mode)) throw new Error('请选择 iPhone 或安卓平台。');
    if (note.type !== 'normal' || !note.images?.length) throw new Error('请准备图文测试内容。');
    for (const value of note.images) {
      let url;
      try { url = new URL(value); } catch { throw new Error('图片必须使用 HTTPS 地址。'); }
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('图片必须使用不包含账号密码的 HTTPS 地址。');
    }
    if (mode === 'ios') {
      const text = topics(note.content);
      const attach = { note_title: note.title, note_text: text, note_text_v2: { content: text },
        now_edit_info: { tti_open_keyboard: false }, images: note.images,
        image_resources: note.images.map(url => ({ image_url: url, url, imageUrl: url, uri: url })) };
      const query = 'attach=' + encodeURIComponent(JSON.stringify(attach)) +
        '&page=' + encodeURIComponent(JSON.stringify({ page_type: 'photo_publish' })) +
        '&source=' + encodeURIComponent(JSON.stringify({ type: 'system_album_other', externalSource: 'rednote_publish_direct', extraInfo: { subType: 'external_app' } }));
      return 'https://oia.xiaohongshu.com/oia?deeplink=' + encodeURIComponent('xhsdiscover://post_new_note?' + query);
    }
    const timestamp = Date.now();
    const data = { note_info: { title: { value: note.title }, content: { value: note.content }, image_info: note.images.map(url => ({ uri: null, url })) },
      share_type: 'note', sdk_version: '1.0.0', third_app_package: 'system_album_other', third_app_version: '1.0.0',
      share_session_id: String(timestamp) + Math.random().toString(36).slice(2), did: '', start_share_timestamp: timestamp, fromJsSdk: false };
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const base64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    return 'xhsdiscover://share_sdk?data=' + encodeURIComponent(base64);
  }
  function buildLaunch(note, mode) {
    if (mode === 'android_scheme') return build(note, 'android');
    const uri = build(note, mode);
    if (mode !== 'android') return uri;
    // Explicit package routing; no automatic store, download or fallback navigation.
    return uri.replace(/^xhsdiscover:/, 'intent:') + '#Intent;scheme=xhsdiscover;package=com.xingin.xhs;end';
  }
  return { build, buildLaunch, detectPlatform };
});
