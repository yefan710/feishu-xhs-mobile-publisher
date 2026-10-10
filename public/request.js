'use strict';
(function (root) {
  // Older mobile browsers lack AbortSignal.timeout. Also bound response decoding.
  async function json(url, options = {}, timeoutMs = 20000) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutError = new Error('请求等待超时，请重试。');
    timeoutError.name = 'TimeoutError';
    let timedOut = false, timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(timeoutError);
        if (controller) controller.abort();
      }, timeoutMs);
    });
    try {
      const request = (async () => {
        const response = await fetch(url, {...options, ...(controller ? {signal: controller.signal} : {})});
        const payload = await response.json();
        return {response, payload};
      })();
      return await Promise.race([request, timeout]);
    } catch (error) {
      throw timedOut ? timeoutError : error;
    } finally {
      clearTimeout(timer);
    }
  }
  root.XhsRequest = {json};
})(typeof window !== 'undefined' ? window : globalThis);
