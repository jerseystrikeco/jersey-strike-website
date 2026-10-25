// Jersey Strike Co. inquiry form helpers.
// Multi-select dropdowns: checked boxes are joined into hidden fields
// (services, team_needs, vehicles) so Netlify records them as one value each.
(function () {
  var groups = ['services', 'team_needs', 'vehicles'];
  var placeholders = { services: 'Choose services', team_needs: 'Choose team needs', vehicles: 'Choose vehicles' };

  document.querySelectorAll('form.js-inquiry').forEach(function (form) {
    function sync() {
      groups.forEach(function (g) {
        var picked = Array.prototype.map.call(
          form.querySelectorAll('input[type=checkbox][data-group="' + g + '"]:checked'),
          function (b) { return b.value; }
        );
        var hidden = form.querySelector('input[type=hidden][name="' + g + '"]');
        if (hidden) hidden.value = picked.join(', ');
        var box = form.querySelector('input[data-group="' + g + '"]');
        var summary = box && box.closest('details') && box.closest('details').querySelector('summary');
        if (summary) {
          var label = summary.querySelector('.dd-text');
          if (!label) {
            label = document.createElement('span');
            label.className = 'dd-text';
            summary.insertBefore(label, summary.firstChild);
            summary.childNodes.forEach(function (n) { if (n.nodeType === 3) n.textContent = ''; });
          }
          label.textContent = picked.length ? picked.join(', ') : placeholders[g];
          summary.classList.toggle('has-value', picked.length > 0);
        }
      });
      var src = form.querySelector('input[name=source_page]');
      if (src) src.value = location.pathname;
    }
    form.addEventListener('change', sync);
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
