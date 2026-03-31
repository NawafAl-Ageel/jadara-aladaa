/* ============================================
   JADARA AL-ALDAA CONSULTING — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Intro Splash Screen ---------- */
  const intro = document.getElementById('intro');
  if (intro) {
    document.body.classList.add('intro-active');
    const logoWrap = intro.querySelector('.intro__logo-wrap');

    // Fade in logo
    requestAnimationFrame(() => {
      logoWrap.classList.add('visible');
    });

    // After hold, fade out logo then fade out overlay
    setTimeout(() => {
      logoWrap.classList.remove('visible');
      intro.classList.add('intro--leaving');

      intro.addEventListener('transitionend', () => {
        document.body.classList.remove('intro-active');
        intro.remove();
      }, { once: true });
    }, 2000);
  }

  /* ---------- Services Accordion ---------- */
  document.querySelectorAll('.services__list li').forEach(li => {
    li.addEventListener('click', (e) => {
      if (e.target.closest('.services__item-btn')) return;
      const wasOpen = li.classList.contains('is-open');
      li.closest('.services__list').querySelectorAll('li.is-open').forEach(open => {
        open.classList.remove('is-open');
      });
      if (!wasOpen) li.classList.add('is-open');
    });
  });

  /* ---------- Service Request Buttons ---------- */
  document.querySelectorAll('.services__item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const serviceName = btn.closest('li').dataset.service;
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
  AOS.init({
    duration: 700,
    easing: 'ease-out-cubic',
    once: true,
    offset: 80,
    disable: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  });

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

  /* ---------- Swiper Testimonials ---------- */
  new Swiper('.testimonials__swiper', {
    loop: true,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false,
    },
    pagination: {
      el: '.swiper-pagination',
      clickable: true,
    },
    effect: 'fade',
    fadeEffect: { crossFade: true },
    speed: 600,
  });

  /* ---------- Multi-Step Contact Form ---------- */
  const API_BASE = window.location.origin + '/api';

  const form = document.getElementById('contactForm');
  const step1 = document.getElementById('formStep1');
  const submitBtn = document.getElementById('submitBtn');
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
      const res = await fetch(`${API_BASE}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        form.hidden = true;
        successEl.classList.add('visible');
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'حدث خطأ');
      }
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

});
