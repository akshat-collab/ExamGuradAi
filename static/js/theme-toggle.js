(function () {
  var KEY = 'examguard-theme';

  function setTheme(mode) {
    var m = mode === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', m);
    try {
      localStorage.setItem(KEY, m);
    } catch (e) { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent('examguard-theme', { detail: { theme: m } }));
    } catch (e) { /* noop */ }
    document.querySelectorAll('.theme-toggle-input').forEach(function (inp) {
      inp.checked = m === 'light';
    });
  }

  function bindToggles() {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    document.querySelectorAll('.theme-toggle-input').forEach(function (inp) {
      inp.checked = cur === 'light';
      inp.addEventListener('change', function () {
        setTheme(this.checked ? 'light' : 'dark');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggles);
  } else {
    bindToggles();
  }

  window.examguardSetTheme = setTheme;
  window.examguardToggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(cur === 'light' ? 'dark' : 'light');
  };
})();
