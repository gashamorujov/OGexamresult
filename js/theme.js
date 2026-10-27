(function () {
  var THEMES = ['blue', 'green', 'yellow', 'red', 'dark', 'white', 'hacker'], KEY = 'imtahan-theme';
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(t) {
    if (THEMES.indexOf(t) < 0) t = 'blue';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    var btns = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-theme') === t;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  apply(read());
  document.addEventListener('DOMContentLoaded', function () {
    apply(document.documentElement.getAttribute('data-theme'));
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.theme-btn');
      if (b) apply(b.getAttribute('data-theme'));
    });
  });
})();
