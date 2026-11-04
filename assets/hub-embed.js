// The team quote worksheet inside the hub (hub.jerseystrike.com > Team quote entry): hides the site header and
// footer, fills "Entered by" with the signed-in teammate, and tells the hub the page height so it fits with no
// second scrollbar. Does nothing when the page is opened on its own.
(function () {
  if (window.self === window.top) return;
  var HUB = 'https://hub.jerseystrike.com';
  document.documentElement.classList.add('in-hub');
  var st = document.createElement('style');
  st.textContent = '.in-hub header, .in-hub footer { display: none !important; }';
  document.head.appendChild(st);
  var by = new URLSearchParams(location.search).get('by');
  var send = function (msg) { try { window.parent.postMessage(msg, HUB); } catch (e) { /* not in the hub */ } };
  var size = function () { send({ type: 'jsq-height', height: document.documentElement.scrollHeight }); };
  var ready = function () {
    var f = document.querySelector('input[name="entered_by"]');
    if (by && f && !f.value) f.value = by.slice(0, 60);
    size();
    if (/\/team-quote\/saved/.test(location.pathname)) send({ type: 'jsq-saved' });
    if (window.ResizeObserver) new ResizeObserver(size).observe(document.body);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  window.addEventListener('load', size);
})();
