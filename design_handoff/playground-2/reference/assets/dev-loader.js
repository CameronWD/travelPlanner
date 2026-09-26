/* Dev loader: compiles the component .jsx files in the browser (no build step) and exposes them on window.TeepeeDS.
   Usage: <script src="…/assets/dev-loader.js" data-root="../../"></script> then TeepeeDS.ready.then(() => …).
   Requires React, ReactDOM and @babel/standalone to be loaded first. */
(function () {
  var s = document.currentScript; var root = (s && s.getAttribute('data-root')) || './';
  var DS = window.TeepeeDS = window.TeepeeDS || {};
  window.exports = DS; window.module = { exports: DS };
  window.require = function (n) { return n === 'react' ? window.React : n === 'react-dom' ? window.ReactDOM : DS; };
  var files = ['core/Logo','core/Icon','core/Button','core/IconButton','core/Chip','core/Badge','core/Card','core/ProgressBar','core/StatCard','core/Avatar','core/AvatarStack',
    'forms/Input','forms/Select','forms/Stepper','forms/Toggle','forms/Checkbox','forms/Segmented',
    'navigation/TabBar','navigation/Dock','navigation/TopBar','navigation/ListRow',
    'feedback/Sheet','feedback/Toast','feedback/Tooltip','feedback/EmptyState'];
  var extra = (s && s.getAttribute('data-extra')) ? s.getAttribute('data-extra').split(',') : [];
  function get(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); }); }
  function run(url, code) {
    var out = Babel.transform(code, { presets: ['react', 'env'], filename: url }).code;
    (new Function('exports', 'module', 'require', 'React', out))(DS, window.module, window.require, window.React);
  }
  var lucide = new Promise(function (res) { if (window.lucide) return res(); var l = document.createElement('script'); l.src = 'https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js'; l.onload = res; l.onerror = res; document.head.appendChild(l); });
  /* Fetch everything in parallel, then evaluate in declared order (later files depend on earlier exports). */
  var urls = files.map(function (f) { return root + 'components/' + f + '.jsx'; }).concat(extra);
  var codes = Promise.all(urls.map(get));
  DS.ready = Promise.all([lucide, codes]).then(function (r) {
    r[1].forEach(function (code, i) { run(urls[i], code); });
    return DS;
  });
})();
