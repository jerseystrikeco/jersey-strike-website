// Jersey Strike Co. inquiry form helpers (v2: smart sections).
// - Multi-select checkboxes are joined into hidden fields so Netlify records one value each.
// - Picking a service reveals the questions that service needs; hidden sections are disabled
//   so they are neither required nor submitted.
(function () {
  document.querySelectorAll('form.js-inquiry').forEach(function (form) {
    var groups = Array.prototype.map.call(form.querySelectorAll('input[type=hidden][name]'), function (i) { return i.name; })
      .filter(function (n) { return form.querySelector('input[type=checkbox][data-group="' + n + '"]'); });
    var sections = form.querySelectorAll('[data-show-for]');
    var firstService = form.querySelector('input[data-group="services"]');
    var docs = ['document_1', 'document_2', 'document_3', 'document_4', 'document_5', 'document_6'].map(function (n) { return form.querySelector('[name="' + n + '"]'); }).filter(Boolean);
    var docsLink = form.querySelector('[name="docs_link"]');
    var docsError = form.querySelector('.js-docs-error');
    var svcError = form.querySelector('.js-services-error');

    function picked(g) {
      return Array.prototype.filter.call(form.querySelectorAll('input[type=checkbox][data-group="' + g + '"]'), function (b) { return b.checked; });
    }
    function sync() {
      groups.forEach(function (g) {
        var boxes = picked(g).filter(function (b) { return !b.closest('fieldset[disabled]'); });
        var values = boxes.map(function (b) { return b.value; });
        form.querySelector('input[type=hidden][name="' + g + '"]').value = values.join('; ');
        var summary = form.querySelector('input[data-group="' + g + '"]').closest('details');
        summary = summary && summary.querySelector('summary');
        if (summary) {
          var label = summary.querySelector('.dd-text');
          if (!label) {
            label = document.createElement('span');
            label.className = 'dd-text';
            summary.insertBefore(label, summary.firstChild);
            Array.prototype.forEach.call(summary.childNodes, function (n) { if (n.nodeType === 3) n.textContent = ''; });
          }
          label.textContent = values.length ? values.join(', ') : summary.getAttribute('data-placeholder');
          summary.classList.toggle('has-value', values.length > 0);
        }
      });
      // Reveal sections for the chosen services.
      var keys = picked('services').map(function (b) { return b.getAttribute('data-key'); });
      Array.prototype.forEach.call(sections, function (s) {
        var on = s.getAttribute('data-show-for').split(' ').some(function (k) { return keys.indexOf(k) !== -1; });
        s.hidden = !on;
        s.disabled = !on;
      });
      // Linen details only matter when we're handling linens.
      var linens = form.querySelector('[name="linens"]'), ld = form.querySelector('.js-linen-detail');
      if (linens && ld) { var on = !!linens.value && !/^Not our job/.test(linens.value) && !linens.disabled; ld.hidden = !on; ld.disabled = !on; }
      // Custom checks: at least one service; a document or link.
      if (firstService) firstService.setCustomValidity(keys.length ? '' : 'Pick at least one service.');
      if (svcError && keys.length) svcError.hidden = true;
      var hasDoc = docs.some(function (d) { return d.files && d.files.length; }) || (docsLink && docsLink.value.trim());
      if (docs[0]) docs[0].setCustomValidity(!hasDoc ? 'Add your proposal or design deck, or paste a link to it.' : docs[0].dataset.tooBig ? 'Files are over 8 MB in total.' : '');
      if (docsError && hasDoc) docsError.hidden = true;
      var src = form.querySelector('input[name=source_page]');
      if (src) src.value = location.pathname;
    }
    // "Leave all flowers in vessels" can't be combined with pulling or composting florals.
    var LEAVE = 'Leave all flowers in vessels, bring back whole', PULL = ['Pull florals from vessels + mechanics', 'Compost / dispose of florals'];
    form.addEventListener('change', function (e) {
      var t = e.target;
      if (!t.matches || !t.matches('input[data-group="breakdown"]') || !t.checked) return;
      form.querySelectorAll('input[data-group="breakdown"]').forEach(function (b) {
        if ((t.value === LEAVE && PULL.indexOf(b.value) !== -1) || (PULL.indexOf(t.value) !== -1 && b.value === LEAVE)) b.checked = false;
      });
    }, true);
    // One drop area for all files. Netlify takes one file per field, so the
    // chosen files are placed into document_1…document_6 behind the scenes.
    var zone = form.querySelector('.js-dropzone'), picker = form.querySelector('.js-picker'), slots = form.querySelector('.js-slots');
    var listEl = form.querySelector('.js-filelist'), fileErr = form.querySelector('.js-file-error');
    var MAX_FILES = docs.length, MAX_BYTES = 8 * 1024 * 1024, chosen = [];
    var canAssign = (function () { try { return !!new DataTransfer().items; } catch (e) { return false; } })();
    function mb(n) { return (n / 1048576).toFixed(n < 1048576 ? 2 : 1) + ' MB'; }
    function render() {
      docs.forEach(function (input, i) {
        var dt = new DataTransfer();
        if (chosen[i]) dt.items.add(chosen[i]);
        input.files = dt.files;
      });
      listEl.innerHTML = '';
      chosen.forEach(function (f, i) {
        var li = document.createElement('li');
        li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border:1px solid #D9CDB0;border-radius:8px;background:#FFFFFF;font-size:14px;font-weight:400';
        var name = document.createElement('span'); name.textContent = f.name + ' · ' + mb(f.size);
        name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        var rm = document.createElement('button'); rm.type = 'button'; rm.textContent = 'Remove';
        rm.style.cssText = 'border:0;background:none;color:#9A2738;font-size:13px;font-weight:600;cursor:pointer;flex:none';
        rm.addEventListener('click', function () { chosen.splice(i, 1); render(); });
        li.appendChild(name); li.appendChild(rm); listEl.appendChild(li);
      });
      var total = chosen.reduce(function (t, f) { return t + f.size; }, 0);
      var msg = total > MAX_BYTES ? 'These files add up to ' + mb(total) + '. The limit is 8 MB, so remove the largest or share it as a link below.' : '';
      fileErr.textContent = msg; fileErr.hidden = !msg;
      if (docs[0]) docs[0].dataset.tooBig = msg ? '1' : '';
      sync();
    }
    function add(files) {
      var skipped = 0;
      Array.prototype.forEach.call(files, function (f) {
        if (chosen.length < MAX_FILES && !chosen.some(function (c) { return c.name === f.name && c.size === f.size; })) chosen.push(f);
        else if (chosen.length >= MAX_FILES) skipped++;
      });
      render();
      if (skipped) { fileErr.textContent = 'Up to 6 files. For more, share a folder link below.'; fileErr.hidden = false; }
    }
    if (zone && canAssign) {
      slots.style.display = 'none';
      zone.addEventListener('click', function () { picker.click(); });
      zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });
      picker.addEventListener('change', function (e) { e.stopPropagation(); add(picker.files); picker.value = ''; });
      ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.style.background = '#FBF4E2'; }); });
      ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.style.background = '#FFFFFF'; }); });
      zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files); });
    } else if (zone) {
      zone.hidden = true; // very old browsers: plain file fields instead
    }

    form.addEventListener('change', sync);
    form.addEventListener('input', function (e) { if (e.target === docsLink) sync(); });
    form.addEventListener('invalid', function (e) {
      if (e.target === firstService && svcError) svcError.hidden = false;
      if (e.target === docs[0]) {
        if (!docs[0].dataset.tooBig && docsError) docsError.hidden = false;
        if (zone && !zone.hidden) zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, true);
    form.addEventListener('submit', function () {
      sync();
      var btn = form.querySelector('button[type=submit]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    });
    sync();
  });

  // Close open dropdowns when clicking elsewhere or pressing Escape.
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details[open]').forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('details[open]').forEach(function (d) { d.removeAttribute('open'); });
  });
})();

// Build library: open a spec sheet when a build card is clicked.
(function () {
  document.querySelectorAll('.build-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var d = document.getElementById('build-' + card.getAttribute('data-build'));
      if (d && d.showModal) d.showModal();
    });
  });
  document.querySelectorAll('.build-dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    d.querySelectorAll('.build-close').forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
  });
})();
