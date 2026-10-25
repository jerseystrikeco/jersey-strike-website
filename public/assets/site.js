// Jersey Strike Co. inquiry form (v3: one question at a time).
// - Each question (.q) appears once the one above it is answered (or skipped).
// - Services reveal their own sections; some answers reveal follow-ups (.js-when).
// - Hidden questions are disabled, so they are never required or submitted.
// - Multi-select checkboxes are joined into hidden fields ("; " between items).
// Without JavaScript the whole form simply shows at once.
(function () {
  document.querySelectorAll('form.js-inquiry').forEach(function (form) {
    var team = form.classList.contains('js-team'); // internal worksheet: everything visible, nothing enforced
    if (!team) form.classList.add('is-stepped');
    var groups = Array.prototype.map.call(form.querySelectorAll('input[type=hidden][name]'), function (i) { return i.name; })
      .filter(function (n) { return form.querySelector('input[type=checkbox][data-group="' + n + '"]'); });
    var sections = Array.prototype.slice.call(form.querySelectorAll('fieldset.form-section'));
    var firstService = form.querySelector('input[data-group="services"]');
    var docs = ['document_1', 'document_2', 'document_3', 'document_4', 'document_5', 'document_6']
      .map(function (n) { return form.querySelector('[name="' + n + '"]'); }).filter(Boolean);
    var docsLink = form.querySelector('[name="docs_link"]');
    var docsError = form.querySelector('.js-docs-error');
    var svcError = form.querySelector('.js-services-error');
    var submitBtn = form.querySelector('.js-submit');
    var touched = new WeakSet();

    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'q-skip';
    skip.textContent = 'Skip this question';
    skip.addEventListener('click', function () {
      var q = skip.closest('.q');
      if (q) touched.add(q);
      skip.remove();
      update(true);
    });

    function picked(g) {
      return Array.prototype.filter.call(form.querySelectorAll('input[type=checkbox][data-group="' + g + '"]'), function (b) { return b.checked; });
    }
    function fields(q) {
      return Array.prototype.filter.call(q.querySelectorAll('input, select, textarea'), function (el) {
        return el.type !== 'hidden' && el.type !== 'file' && !el.classList.contains('js-picker');
      });
    }
    function answered(q) {
      var f = fields(q);
      if (q.classList.contains('q-req')) {
        return f.some(function (el) { return el.type === 'checkbox' ? el.checked : false; });
      }
      var required = f.filter(function (el) { return el.required; });
      if (required.length) return required.every(function (el) { return el.value.trim() && el.checkValidity(); });
      if (touched.has(q)) return true;
      return f.some(function (el) { return el.type === 'checkbox' ? el.checked : !!el.value.trim(); });
    }
    function available(el) {
      for (var n = el.parentElement; n && n !== form; n = n.parentElement) {
        if (n.matches('fieldset') && (n.hidden || n.disabled)) return false;
      }
      return true;
    }

    function syncValues() {
      groups.forEach(function (g) {
        var values = picked(g).filter(function (b) { return !b.closest('fieldset[disabled]'); }).map(function (b) { return b.value; });
        form.querySelector('input[type=hidden][name="' + g + '"]').value = values.join('; ');
        var det = form.querySelector('input[data-group="' + g + '"]').closest('details');
        var summary = det && det.querySelector('summary');
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
      var src = form.querySelector('input[name=source_page]');
      if (src) src.value = location.pathname;
    }

    function branch() {
      // Sections for the chosen services.
      var keys = picked('services').map(function (b) { return b.getAttribute('data-key'); });
      sections.forEach(function (s) {
        var want = s.getAttribute('data-show-for');
        if (!want) return;
        var on = want.split(' ').some(function (k) { return keys.indexOf(k) !== -1; });
        s.hidden = !on; s.disabled = !on;
      });
      // Follow-ups that depend on an answer. Run twice so nested follow-ups settle.
      for (var pass = 0; pass < 2; pass++) {
        form.querySelectorAll('.js-when').forEach(function (fs) {
          var src = form.querySelector('[name="' + fs.getAttribute('data-when-field') + '"]');
          var on = !!src && available(src) && new RegExp(fs.getAttribute('data-when-match'), 'i').test(src.value.trim());
          fs.hidden = !on; fs.disabled = !on;
        });
      }
      // Over 24 ft: show the scissor-lift note under that height question.
      form.querySelectorAll('.js-lift-note').forEach(function (n) {
        var sel = n.parentNode.querySelector('select');
        n.hidden = !(sel && /^Over 24/.test(sel.value));
      });
      if (svcError && keys.length) svcError.hidden = true;
      if (firstService) firstService.setCustomValidity(keys.length ? '' : 'Pick at least one service.');
      var hasDoc = docs.some(function (d) { return d.files && d.files.length; }) || (docsLink && docsLink.value.trim());
      if (docs[0]) docs[0].setCustomValidity(team ? '' : !hasDoc ? 'Add your proposal or design deck, or paste a link to it.' : docs[0].dataset.tooBig ? 'Files are over 8 MB in total.' : '');
      if (docsError && hasDoc) docsError.hidden = true;
    }

    // Reveal questions in order: everything up to and including the first unanswered one.
    function step(animate) {
      var open = true, current = null;
      form.querySelectorAll('.q').forEach(function (q) {
        if (!available(q)) { q.classList.remove('q-later'); return; }
        var show = open;
        if (show && q.classList.contains('q-later') && animate) {
          q.classList.add('q-enter');
          setTimeout(function () { q.classList.remove('q-enter'); }, 400);
        }
        q.classList.toggle('q-later', !show);
        if (show && !q.classList.contains('q-free') && !answered(q)) { open = false; current = q; }
      });
      sections.forEach(function (s) {
        if (s.hidden) return;
        var any = Array.prototype.some.call(s.querySelectorAll('.q'), function (q) { return available(q) && !q.classList.contains('q-later'); });
        s.classList.toggle('q-later', !any);
      });
      if (submitBtn) submitBtn.classList.toggle('q-later', !open || !picked('services').length);
      // Offer "Skip" on the current question when it's optional.
      if (current && !current.classList.contains('q-req') && !fields(current).some(function (el) { return el.required; })) {
        if (skip.parentNode !== current) current.appendChild(skip);
      } else if (skip.parentNode) {
        skip.remove();
      }
    }

    function update(animate) {
      syncValues(); branch(); syncValues();
      if (team) { if (window.JSTeamPanel) window.JSTeamPanel(form); } else step(animate);
    }

    // A question counts as touched once the person leaves it (so optional ones can be passed by).
    form.addEventListener('focusout', function (e) {
      var q = e.target.closest && e.target.closest('.q');
      if (!q || (e.relatedTarget && q.contains(e.relatedTarget))) return;
      if (e.target.matches('select, input[type=date], input[type=time]') || e.target.value) touched.add(q);
      setTimeout(function () { update(true); }, 0);
    });
    form.addEventListener('toggle', function (e) {
      if (e.target.matches('details') && !e.target.open) {
        var q = e.target.closest('.q'); if (q) touched.add(q);
        update(true);
      }
    }, true);
    form.addEventListener('input', function () { update(true); });

    // "Leave all flowers in vessels" can't be combined with pulling or composting florals.
    var LEAVE = 'Leave all flowers in vessels, bring back whole', PULL = ['Pull florals from vessels + mechanics', 'Compost / dispose of florals'];
    form.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches && t.matches('input[data-group="breakdown"]') && t.checked) {
        form.querySelectorAll('input[data-group="breakdown"]').forEach(function (b) {
          if ((t.value === LEAVE && PULL.indexOf(b.value) !== -1) || (PULL.indexOf(t.value) !== -1 && b.value === LEAVE)) b.checked = false;
        });
      }
      update(true);
    });

    // Enter moves to the next question instead of sending the form early.
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.matches('input:not([type=checkbox]):not([type=file])')) return;
      e.preventDefault();
      var q = e.target.closest('.q'); if (q) touched.add(q);
      update(true);
      var all = Array.prototype.slice.call(form.querySelectorAll('input, select, textarea')).filter(function (el) {
        return el.type !== 'hidden' && el.offsetParent !== null && !el.disabled;
      });
      var next = all[all.indexOf(e.target) + 1];
      if (next) next.focus();
    });

    // One drop area for all files. Netlify takes one file per field, so the
    // chosen files are placed into document_1…document_6 behind the scenes.
    var zone = form.querySelector('.js-dropzone'), picker = form.querySelector('.js-picker'), slots = form.querySelector('.js-slots');
    var listEl = form.querySelector('.js-filelist'), fileErr = form.querySelector('.js-file-error');
    var MAX_FILES = docs.length, MAX_BYTES = 8 * 1024 * 1024, chosen = [];
    var canAssign = (function () { try { return !!new DataTransfer().items; } catch (e) { return false; } })();
    function mb(n) { return (n / 1048576).toFixed(n < 1048576 ? 2 : 1) + ' MB'; }
    function renderFiles() {
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
        rm.addEventListener('click', function () { chosen.splice(i, 1); renderFiles(); });
        li.appendChild(name); li.appendChild(rm); listEl.appendChild(li);
      });
      var total = chosen.reduce(function (t, f) { return t + f.size; }, 0);
      var msg = total > MAX_BYTES ? 'These files add up to ' + mb(total) + '. The limit is 8 MB, so remove the largest or share it as a link below.' : '';
      fileErr.textContent = msg; fileErr.hidden = !msg;
      if (docs[0]) docs[0].dataset.tooBig = msg ? '1' : '';
      update(false);
    }
    function addFiles(files) {
      var skipped = 0;
      Array.prototype.forEach.call(files, function (f) {
        if (chosen.length < MAX_FILES && !chosen.some(function (c) { return c.name === f.name && c.size === f.size; })) chosen.push(f);
        else if (chosen.length >= MAX_FILES) skipped++;
      });
      renderFiles();
      if (skipped) { fileErr.textContent = 'Up to 6 files. For more, share a folder link below.'; fileErr.hidden = false; }
    }
    if (zone && canAssign) {
      slots.style.display = 'none';
      zone.addEventListener('click', function () { picker.click(); });
      zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });
      picker.addEventListener('change', function (e) { e.stopPropagation(); addFiles(picker.files); picker.value = ''; });
      ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.style.background = '#FBF4E2'; }); });
      ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.style.background = '#FFFFFF'; }); });
      zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    } else if (zone) {
      zone.hidden = true; // very old browsers: plain file fields instead
    }

    form.addEventListener('invalid', function (e) {
      if (e.target === firstService && svcError) svcError.hidden = false;
      if (e.target === docs[0]) {
        if (!docs[0].dataset.tooBig && docsError) docsError.hidden = false;
        if (zone && !zone.hidden) zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, true);
    form.addEventListener('submit', function () {
      update(false);
      var btn = form.querySelector('button[type=submit]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    });
    update(false);
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

// Team worksheet: live "still missing" list, crew math and a follow-up email draft.
(function () {
  var panel = document.querySelector('.js-team-panel');
  if (!panel) return;
  var val = function (form, n) { var el = form.querySelector('[name="' + n + '"]'); return el && !el.disabled ? el.value.trim() : ''; };
  var on = function (form, key) { return !!form.querySelector('input[data-key="' + key + '"]:checked'); };
  var hasList = function (form, g) { return !!val(form, g); };
  var hrs = function (t) { var m = /^(\d+):(\d+)/.exec(t || ''); return m ? +m[1] + m[2] / 60 : null; };

  // [condition, check, how to ask the client]
  function gaps(form) {
    var any = function () { for (var i = 0; i < arguments.length; i++) if (on(form, arguments[i])) return true; return false; };
    var strike = any('strike', 'full'), install = any('install', 'full'), trucking = any('strike', 'install', 'trucking', 'full', 'holiday');
    var docs = form.querySelectorAll('input[name^="document_"]');
    var hasDoc = Array.prototype.some.call(docs, function (d) { return d.files && d.files.length; }) || val(form, 'docs_link');
    var count = parseInt(val(form, 'install_count'), 10);
    var list = [
      [true, val(form, 'email') || val(form, 'phone'), 'Best email and phone for the day-of contact'],
      [true, val(form, 'event_date'), 'Event date'],
      [true, val(form, 'venue'), 'Venue name and town'],
      [true, hasDoc, 'Your proposal or design deck'],
      [true, val(form, 'has_planner'), 'Planner or day-of coordinator name and phone, if there is one'],
      [true, form.querySelector('input[data-group="services"]:checked'), 'Which services you need from us'],
      [any('strike', 'install', 'full', 'rigging'), !isNaN(count), 'How many large installs (arches, tent-pole builds, ceiling pieces) there are'],
      [any('strike', 'install', 'full', 'rigging') && count > 0, val(form, 'install_height'), 'How tall the tallest install is'],
      [any('strike', 'install', 'full', 'rigging') && count > 0, hasList(form, 'install_attach'), 'How each install is attached (freestanding, tent poles, ceiling, hanging)'],
      [any('strike', 'install', 'full', 'rigging') && count > 0, val(form, 'tools_detail'), 'Which tools you’ll leave on site to take the installs apart'],
      [strike, val(form, 'strike_start') && val(form, 'hard_out'), 'When strike can start and the venue’s hard out'],
      [strike, hasList(form, 'breakdown'), 'What breakdown should include (flowers left in vessels or pulled, candles, mechanics, loading)'],
      [strike, val(form, 'linens'), 'What we should do with linens'],
      [strike && /^(?!Not our job)./.test(val(form, 'linens')), val(form, 'linen_dropoff'), 'Exactly where bagged linens go and what bags to use'],
      [strike, val(form, 'other_rentals'), 'Whether other vendors’ rentals (lamps, lanterns, tabletop) are on site and what happens to them'],
      [strike, val(form, 'client_staff'), 'How many of your staff will be on site with us'],
      [install, val(form, 'load_in') && val(form, 'ready_by'), 'Load-in start time and the time everything must be finished'],
      [install, val(form, 'flip'), 'Whether there’s a room flip, and the flip window'],
      [on(form, 'rigging'), val(form, 'rig_phase'), 'Whether you need us for install, strike or both'],
      [on(form, 'rigging'), val(form, 'rig_height'), 'The working height'],
      [on(form, 'rigging'), hasList(form, 'rig_points'), 'What the pieces hang from (rigging points, truss, tent poles, beams)'],
      [trucking, val(form, 'truck'), 'Whose truck we’re using, and its size'],
      [trucking, val(form, 'studio_address'), 'Studio pickup / return address'],
      [trucking, hasList(form, 'access'), 'Load-in access: loading dock, stairs, elevator, push distance, parking'],
      [trucking, val(form, 'load_size'), 'Your flower order list or inventory collect list'],
      [trucking, val(form, 'walkthrough_link'), 'A walkthrough video or photos of the venue load-in and your studio'],
      [on(form, 'holiday'), val(form, 'holiday_start') && val(form, 'holiday_end'), 'Install start and end dates'],
      [on(form, 'holiday'), hasList(form, 'holiday_scope'), 'What you’re installing at each site'],
      [on(form, 'fabrication'), val(form, 'fab_description'), 'What you’d like built: size, materials, a sketch or rendering'],
      [on(form, 'fabrication'), val(form, 'fab_needed_by'), 'The date you need the build by'],
      [on(form, 'rentals'), val(form, 'rental_items'), 'Which rental items you’re interested in'],
    ];
    return list.filter(function (g) { return g[0] && !g[1]; }).map(function (g) { return g[2]; });
  }

  window.JSTeamPanel = function (form) {
    var missing = gaps(form);
    var hidden = form.querySelector('input[name="missing"]');
    if (hidden) hidden.value = missing.join('; ');
    // Crew math: window from strike start → hard out when known.
    var winEl = form.querySelector('[name="est_window"]');
    var s = hrs(val(form, 'strike_start') || val(form, 'rig_strike_start')), e = hrs(val(form, 'hard_out') || val(form, 'rig_hard_out'));
    if (winEl && !winEl.dataset.edited && s != null && e != null) winEl.value = Math.round(((e - s + 24) % 24) * 4) / 4 || '';
    var ch = parseFloat(val(form, 'est_crew_hours')), w = parseFloat(winEl ? winEl.value : '');
    var crewMsg = ch > 0 && w > 0 ? Math.ceil(ch / w) + ' people to finish ' + ch + ' crew-hours in ' + w + (w === 1 ? ' hr' : ' hrs') : 'Enter crew-hours and the time window to see it.';

    panel.querySelector('.js-gap-count').textContent = missing.length ? missing.length + ' still missing' : 'Nothing missing';
    var ul = panel.querySelector('.js-gap-list');
    ul.innerHTML = '';
    missing.forEach(function (m) { var li = document.createElement('li'); li.textContent = m; ul.appendChild(li); });
    panel.querySelector('.js-crew').textContent = crewMsg;
    // Ladders decide the vehicle: MINIvan fits ladders up to 10 ft long; anything longer rides in VANessa (E350) or a 15ft box truck.
    // Working heights of 12 ft and up need ladders longer than 10 ft.
    var tall = ['install_height', 'rig_height', 'holiday_height'].map(function (n) { return val(form, n); })
      .filter(function (v) { return /^(12–15|15–24|Over 24)/.test(v); });
    var lift = tall.some(function (v) { return /^Over 24/.test(v); });
    var flag = tall.length
      ? 'VANessa (E350) or a 15ft box truck required: ' + tall[0].replace(/ \(.*/, '') + ' work needs ladders over 10 ft, which don’t fit in MINIvan.' + (lift ? ' Over 24 ft also needs a scissor lift rental (about $6,000).' : '')
      : '';
    var ladderBox = panel.querySelector('.js-ladder');
    ladderBox.textContent = flag; ladderBox.hidden = !flag;
    var vf = form.querySelector('input[name="vehicle_flag"]'); if (vf) vf.value = flag;

    var first = (val(form, 'contact_name') || '').split(' ')[0] || 'there';
    var when = val(form, 'event_date') ? new Date(val(form, 'event_date') + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'your event';
    var where = val(form, 'venue') ? ' at ' + val(form, 'venue') : '';
    var draft = missing.length
      ? 'Hi ' + first + ',\n\nThanks for reaching out about ' + when + where + '. So we can staff it right and give you an accurate quote, could you send over:\n\n' +
        missing.map(function (m) { return '• ' + m; }).join('\n') +
        '\n\nThe fastest way is our inquiry form, which walks through all of it: https://jerseystrike.com/inquire/\n\nWe quote from your documents rather than a description, so the more we see now, the fewer surprises on the day.\n\nThank you!'
      : '';
    var box = panel.querySelector('.js-draft');
    box.value = draft;
    panel.querySelector('.js-draft-wrap').hidden = !missing.length;
    var mail = panel.querySelector('.js-mailto');
    var to = val(form, 'email');
    mail.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent('A few details for your ' + when + ' quote') + '&body=' + encodeURIComponent(draft);
  };

  var form = document.querySelector('form.js-team');
  form.addEventListener('input', function (e) { if (e.target.name === 'est_window') e.target.dataset.edited = '1'; });
  panel.querySelector('.js-copy').addEventListener('click', function () {
    var box = panel.querySelector('.js-draft');
    var btn = this;
    (navigator.clipboard ? navigator.clipboard.writeText(box.value) : Promise.reject()).then(
      function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy email'; }, 1500); },
      function () { box.select(); document.execCommand('copy'); });
  });
  window.JSTeamPanel(form);
})();
