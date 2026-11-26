/* Shared UI behaviour for all pages */
(function () {
  'use strict';

  /* ---------- toast ---------- */
  window.showToast = function (message) {
    var toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 2800);
  };

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') nav.classList.remove('open');
    });
  }

  /* ---------- announcement close ---------- */
  var announceClose = document.querySelector('.announce-close');
  if (announceClose) {
    announceClose.addEventListener('click', function () {
      announceClose.closest('.announce').remove();
    });
  }

  /* ---------- reveal on scroll ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ---------- tabs ---------- */
  document.querySelectorAll('.tabs').forEach(function (group) {
    var tabs = group.querySelectorAll('.tab');
    var panels = group.parentElement.querySelectorAll('.tab-panel');
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        if (panels[index]) panels[index].classList.add('active');
      });
    });
  });

  /* ---------- accordion ---------- */
  document.querySelectorAll('.acc-q').forEach(function (question) {
    question.addEventListener('click', function () {
      var item = question.closest('.acc-item');
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.acc-item').forEach(function (i) { i.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });

  /* ---------- copy code buttons ---------- */
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.closest('.code-card').querySelector('code');
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        var old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = old; }, 1500);
      }).catch(function () { showToast('Copy failed — select the code manually.'); });
    });
  });

  /* ---------- before/after hero slider ---------- */
  var range = document.getElementById('compareRange');
  if (range) {
    var after = document.getElementById('compareAfter');
    var handle = document.getElementById('compareHandle');
    var update = function () {
      var pct = Number(range.value);
      after.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      handle.style.left = pct + '%';
    };
    range.addEventListener('input', update);
    update();
  }

  /* ---------- newsletter / contact forms (demo) ---------- */
  document.querySelectorAll('form[data-demo-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.querySelector('input[type=email]');
      showToast(email ? 'Thanks! ' + email.value + ' has been added (demo).' : 'Thanks for your message (demo).');
      form.reset();
    });
  });

  /* ---------- active nav highlighting ---------- */
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach(function (link) {
    var target = link.getAttribute('href');
    if (target && (target === here || (here === '' && target === 'index.html'))) {
      link.classList.add('active');
    }
  });
})();
