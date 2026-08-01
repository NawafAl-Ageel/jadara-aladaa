/* ============================================
   JADARA AL-ALDAA CONSULTING — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Supabase Client ---------- */
  function getMeta(name) {
    return (document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '').trim();
  }
  function getSupabase() {
    const url = getMeta('supabase-url');
    const anonKey = getMeta('supabase-anon-key');
    // eslint-disable-next-line no-undef
    if (!url || !anonKey || !window.supabase) return null;
    // eslint-disable-next-line no-undef
    return window.supabase.createClient(url, anonKey);
  }
  const supabase = getSupabase();

  /* ---------- Dynamic Content (stats / services / client logos) ----------
     Reads from Supabase and overrides the built-in markup below.
     If the fetch fails or returns nothing, the hardcoded content stays as-is. */
  (async function loadDynamicContent() {
    if (!supabase) return;

    try {
      const { data: stats } = await supabase.from('site_stats').select('key,value');
      if (stats && stats.length) {
        stats.forEach(s => {
          const item = document.querySelector(`.stats__item[data-stat-key="${s.key}"]`);
          const number = item?.querySelector('.stats__number');
          if (number) number.dataset.target = s.value;
        });
      }
    } catch { /* keep hardcoded stats */ }

    try {
      const { data: services } = await supabase.from('services').select('service_key,description');
      if (services && services.length) {
        services.forEach(svc => {
          const card = document.querySelector(`.services__card[data-service="${CSS.escape(svc.service_key)}"]`);
          const desc = card?.querySelector('.services__item-desc');
          if (desc && svc.description) desc.textContent = svc.description;
        });
      }
    } catch { /* keep hardcoded descriptions */ }

    try {
      const { data: logos } = await supabase.from('client_logos').select('name,image_url,sort_order').order('sort_order');
      const grid = document.querySelector('.clients__grid');
      if (grid && logos && logos.length) {
        grid.innerHTML = logos.map(l => `
          <div class="clients__card" data-aos="fade-up">
            <img src="${l.image_url}" alt="${l.name}" loading="lazy">
          </div>
        `).join('');
        if (typeof AOS !== 'undefined') AOS.refreshHard();
      }
    } catch { /* keep hardcoded logos */ }
  })();

  /* ---------- Intro Splash Screen ---------- */
  const intro = document.getElementById('intro');
  const logoWrap = intro?.querySelector('.intro__logo-wrap');
  const skipIntro = new URLSearchParams(window.location.search).has('skip-intro');

  if (intro && skipIntro) {
    intro.remove();
    document.body.classList.add('page-enter');
    const url = new URL(window.location.href);
    url.searchParams.delete('skip-intro');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } else if (intro && logoWrap) {
    document.body.classList.add('intro-active');

    requestAnimationFrame(() => {
      logoWrap.classList.add('visible');
    });

    setTimeout(() => {
      logoWrap.classList.remove('visible');
      intro.classList.add('intro--leaving');

      intro.addEventListener('transitionend', () => {
        document.body.classList.remove('intro-active');
        intro.remove();
      }, { once: true });
    }, 2000);
  } else if (intro) {
    intro.remove();
  }

  /* ---------- Services Accordion (card grid) ---------- */
  document.querySelectorAll('.services__cards-grid').forEach(grid => {
    grid.querySelectorAll('.services__card').forEach(card => {
      const trigger = card.querySelector('.services__card-trigger');
      if (!trigger) return;
      trigger.addEventListener('click', (e) => {
        if (e.target.closest('.services__item-btn')) return;
        const wasOpen = card.classList.contains('is-open');
        grid.querySelectorAll('.services__card.is-open').forEach(c => {
          c.classList.remove('is-open');
          c.querySelector('.services__card-trigger')?.setAttribute('aria-expanded', 'false');
        });
        if (!wasOpen) {
          card.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });
  });

  /* ---------- Service Request Buttons ---------- */
  document.querySelectorAll('.services__item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const card = btn.closest('.services__card');
      const serviceName = card?.dataset.service;
      const select = document.getElementById('service_select');
      if (select && serviceName) {
        select.value = serviceName;
      }
      document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ---------- Phone Country Code Dropdown ---------- */
  const countries = [
    { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
    { code: '+971', flag: '🇦🇪', name: 'UAE' },
    { code: '+965', flag: '🇰🇼', name: 'Kuwait' },
    { code: '+974', flag: '🇶🇦', name: 'Qatar' },
    { code: '+973', flag: '🇧🇭', name: 'Bahrain' },
    { code: '+968', flag: '🇴🇲', name: 'Oman' },
    { code: '+962', flag: '🇯🇴', name: 'Jordan' },
    { code: '+20',  flag: '🇪🇬', name: 'Egypt' },
    { code: '+961', flag: '🇱🇧', name: 'Lebanon' },
    { code: '+964', flag: '🇮🇶', name: 'Iraq' },
    { code: '+212', flag: '🇲🇦', name: 'Morocco' },
    { code: '+216', flag: '🇹🇳', name: 'Tunisia' },
    { code: '+213', flag: '🇩🇿', name: 'Algeria' },
    { code: '+249', flag: '🇸🇩', name: 'Sudan' },
    { code: '+967', flag: '🇾🇪', name: 'Yemen' },
    { code: '+90',  flag: '🇹🇷', name: 'Turkey' },
    { code: '+44',  flag: '🇬🇧', name: 'United Kingdom' },
    { code: '+1',   flag: '🇺🇸', name: 'United States' },
    { code: '+33',  flag: '🇫🇷', name: 'France' },
    { code: '+49',  flag: '🇩🇪', name: 'Germany' },
    { code: '+91',  flag: '🇮🇳', name: 'India' },
    { code: '+86',  flag: '🇨🇳', name: 'China' },
    { code: '+82',  flag: '🇰🇷', name: 'South Korea' },
    { code: '+81',  flag: '🇯🇵', name: 'Japan' },
    { code: '+61',  flag: '🇦🇺', name: 'Australia' },
    { code: '+55',  flag: '🇧🇷', name: 'Brazil' },
    { code: '+92',  flag: '🇵🇰', name: 'Pakistan' },
    { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
    { code: '+27',  flag: '🇿🇦', name: 'South Africa' },
    { code: '+60',  flag: '🇲🇾', name: 'Malaysia' },
  ];

  const phoneToggle = document.getElementById('phoneToggle');
  const phoneDropdown = document.getElementById('phoneDropdown');
  const phoneList = document.getElementById('phoneList');
  const phoneSearch = document.getElementById('phoneSearch');
  const phoneFlag = document.getElementById('phoneFlag');
  const phoneCodeEl = document.getElementById('phoneCode');
  const phoneInput = document.querySelector('.phone-input');
  let selectedCode = '+966';

  function renderCountries(filter = '') {
    const q = filter.toLowerCase();
    phoneList.innerHTML = '';
    countries.filter(c => !q || c.name.toLowerCase().includes(q) || c.code.includes(q))
      .forEach(c => {
        const li = document.createElement('li');
        if (c.code === selectedCode) li.classList.add('is-selected');
        li.innerHTML = `<span class="flag">${c.flag}</span><span class="code">${c.code}</span><span class="name">${c.name}</span>`;
        li.addEventListener('click', () => {
          selectedCode = c.code;
          phoneFlag.textContent = c.flag;
          phoneCodeEl.textContent = c.code;
          closePhoneDropdown();
        });
        phoneList.appendChild(li);
      });
  }

  function openPhoneDropdown() {
    phoneDropdown.classList.add('is-visible');
    phoneInput.classList.add('is-open');
    phoneSearch.value = '';
    renderCountries();
    phoneSearch.focus();
  }

  function closePhoneDropdown() {
    phoneDropdown.classList.remove('is-visible');
    phoneInput.classList.remove('is-open');
  }

  if (phoneToggle) {
    phoneToggle.addEventListener('click', () => {
      phoneDropdown.classList.contains('is-visible') ? closePhoneDropdown() : openPhoneDropdown();
    });
  }

  if (phoneSearch) {
    phoneSearch.addEventListener('input', () => renderCountries(phoneSearch.value));
  }

  document.addEventListener('click', (e) => {
    if (phoneInput && !phoneInput.contains(e.target)) closePhoneDropdown();
  });

  /* ---------- AOS Init ---------- */
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 700,
      easing: 'ease-out-cubic',
      once: true,
      offset: 80,
      disable: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    });
  }

  /* ---------- Navbar Scroll ---------- */
  const navbar = document.getElementById('navbar');
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile Menu ---------- */
  const burger = document.getElementById('navBurger');
  const navMenu = document.getElementById('navMenu');

  burger.addEventListener('click', () => {
    const isOpen = burger.classList.toggle('active');
    navMenu.classList.toggle('active');
    burger.setAttribute('aria-expanded', isOpen);
  });

  navMenu.querySelectorAll('.navbar__link').forEach(link => {
    link.addEventListener('click', () => {
      burger.classList.remove('active');
      navMenu.classList.remove('active');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Smooth Scroll for anchor links ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  /* ---------- Stats Counter Animation ---------- */
  const statsSection = document.getElementById('stats');
  const counters = document.querySelectorAll('.stats__number[data-target]');
  let statsCounted = false;

  const countUp = (el) => {
    const target = parseInt(el.dataset.target, 10);
    const duration = 2000;
    const startTime = performance.now();

    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target;
      }
    };

    requestAnimationFrame(update);
  };

  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !statsCounted) {
        statsCounted = true;
        counters.forEach(counter => countUp(counter));
        statsObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  if (statsSection) statsObserver.observe(statsSection);

  /* ---------- Multi-Step Contact Form ---------- */
  const form = document.getElementById('contactForm');
  const step1 = document.getElementById('formStep1');
  const submitBtn = document.getElementById('submitBtn');
  if (!form || !step1 || !submitBtn) return;

  const btnText = submitBtn.querySelector('.btn__text');
  const btnSpinner = submitBtn.querySelector('.btn__spinner');
  const successEl = document.getElementById('formSuccess');

  function validateStep1() {
    const fields = step1.querySelectorAll('[required]');
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm();
  });

  async function submitForm() {
    if (!validateStep1()) {
      return;
    }

    btnText.hidden = true;
    btnSpinner.hidden = false;
    submitBtn.disabled = true;

    const phoneVal = document.getElementById('phone').value.trim();
    const fullPhone = selectedCode + ' ' + phoneVal;
    const payload = {
      name: document.getElementById('name').value.trim(),
      company: document.getElementById('company').value.trim() || undefined,
      job_title: document.getElementById('job_title').value.trim() || undefined,
      service: document.getElementById('service_select').value || undefined,
      email: document.getElementById('email').value.trim(),
      phone: fullPhone,
      message: document.getElementById('message').value.trim()
    };

    try {
      if (!supabase) throw new Error('الإرسال غير متاح حالياً');
      const { error } = await supabase.from('leads').insert([payload]);
      if (error) throw error;
      form.hidden = true;
      successEl.classList.add('visible');
    } catch (error) {
      console.error('Form submission error:', error);
      btnText.textContent = error.message || 'حدث خطأ، حاول مجدداً';
      btnText.hidden = false;
      btnSpinner.hidden = true;
      submitBtn.disabled = false;

      setTimeout(() => {
        btnText.textContent = 'أرسل طلبك';
      }, 3000);
    }
  }

  /* ---------- Active Nav Link on Scroll ---------- */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.navbar__link');

  const activeLinkObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('active',
            link.getAttribute('href') === `#${id}`
          );
        });
      }
    });
  }, {
    rootMargin: '-40% 0px -60% 0px'
  });

  sections.forEach(section => activeLinkObserver.observe(section));

  /* ---------- Methodology banners: mobile arrows (no horizontal scroll) ---------- */
  (function initMethodBannerCarousels() {
    const mq = window.matchMedia('(max-width: 991px)');

    document.querySelectorAll('.method-banner__shell').forEach((shell) => {
      const steps = shell.querySelectorAll('.method-banner__step');
      const prevBtn = shell.querySelector('.method-banner__arrow--prev');
      const nextBtn = shell.querySelector('.method-banner__arrow--next');
      if (!steps.length || !prevBtn || !nextBtn) return;

      let index = 0;

      function applyMobile() {
        index = Math.max(0, Math.min(steps.length - 1, index));
        steps.forEach((el, j) => el.classList.toggle('is-active', j === index));
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === steps.length - 1;
      }

      function applyDesktop() {
        steps.forEach((el) => el.classList.remove('is-active'));
      }

      function sync() {
        if (mq.matches) {
          applyMobile();
        } else {
          applyDesktop();
        }
      }

      prevBtn.addEventListener('click', () => {
        if (!mq.matches) return;
        index -= 1;
        applyMobile();
      });

      nextBtn.addEventListener('click', () => {
        if (!mq.matches) return;
        index += 1;
        applyMobile();
      });

      mq.addEventListener('change', () => {
        if (mq.matches) index = 0;
        sync();
      });

      sync();
    });
  })();

});
