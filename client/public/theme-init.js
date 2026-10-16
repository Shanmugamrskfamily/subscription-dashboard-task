// Runs before the app renders so the saved theme shows from the first frame (no flash).
(function () {
  try {
    var saved = localStorage.getItem('planpilot-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = saved === 'dark' || ((saved === null || saved === 'system') && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    /* storage blocked: fall back to light */
  }
})();
