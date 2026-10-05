/**
 * language.js — Eucon global språkväxlare
 *
 * Logik:
 * 1. Bestäm aktivt språk utifrån filnamnet (sv/en/tr).
 * 2. Spara till localStorage så valet följer med mellan sidor.
 * 3. Markera aktiv flagga med klassen "is-active".
 * 4. Uppdatera alla nav-länkar, CTA-knappar, logo-länkar och footer-länkar
 *    så de pekar till rätt språkversion av varje sida.
 * 5. Klick på en flagga sparar nytt språkval och navigerar dit.
 */

(function () {
  'use strict';

  /* ── Sidmappning per sektion ──────────────────────────────────────── */
  const PAGES = {
    index:   { sv: '/',      en: '/-en',      tr: '/-tr'      },
    om_oss:  { sv: 'om-oss',   en: 'om-oss-en',   tr: 'om-oss-tr'   },
    galleri: { sv: 'galleri',  en: 'galleri-en',  tr: 'galleri-tr'  },
    kontakt: { sv: 'kontakt',  en: 'kontakt-en',  tr: 'kontakt-tr'  },
  };

  /* Nav-texter per språk */
  const NAV_LABELS = {
    sv: { home: 'Hem',       about: 'Om oss',     gallery: 'Galleri', contact: 'Kontakt', cta: 'Kontakta oss', pages: 'Sidor' },
    en: { home: 'Home',      about: 'About us',   gallery: 'Gallery', contact: 'Contact', cta: 'Contact us',   pages: 'Pages' },
    tr: { home: 'Ana Sayfa', about: 'Hakkımızda', gallery: 'Galeri',  contact: 'İletişim', cta: 'Bize ulaşın', pages: 'Sayfalar' },
  };

  /* ── Bestäm nuvarande sida och språk ──────────────────────────────── */
  function detectSection(pathname) {
    if (/^(\/)?$/.test(pathname)) return 'index';
    if (/^(\/)?-en\/?$/.test(pathname)) return 'index';
    if (/^(\/)?-tr\/?$/.test(pathname)) return 'index';
    if (/om-oss/.test(pathname))                return 'om_oss';
    if (/galleri/.test(pathname))               return 'galleri';
    if (/kontakt/.test(pathname))               return 'kontakt';
    return 'index';
  }

  function detectLangFromFile(pathname) {
    if (/^(\/)?-en\/?$/.test(pathname)) return 'en';
    if (/^(\/)?-tr\/?$/.test(pathname)) return 'tr';
    if (/-en\/?$/.test(pathname)) return 'en';
    if (/-tr\/?$/.test(pathname)) return 'tr';
    return 'sv';
  }

  const currentPath    = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const currentSection = detectSection(currentPath);
  const fileLang       = detectLangFromFile(currentPath);

  /* Spara/läs från localStorage — filens språk vinner alltid */
  localStorage.setItem('eucon_lang', fileLang);
  const lang = fileLang;

  /* ── Uppdatera language-switcher-flaggor ─────────────────────────── */
  function updateFlags() {
    document.querySelectorAll('.language-switcher a.language-option').forEach(function (a) {
      const targetLang = a.getAttribute('data-lang');
      if (!targetLang) return;

      /* Sätt länken till rätt sida i rätt sektion */
      a.href = PAGES[currentSection][targetLang];

      /* Markera aktiv */
      if (targetLang === lang) {
        a.classList.add('is-active');
        a.setAttribute('aria-current', 'true');
      } else {
        a.classList.remove('is-active');
        a.removeAttribute('aria-current');
      }
    });
  }

  /* ── Uppdatera nav-länkar ────────────────────────────────────────── */
  function updateNav() {
    const p  = PAGES;
    const lb = NAV_LABELS[lang];

    function applyNav(nav) {
      if (!nav) return;
      const links = nav.querySelectorAll('a');
      links.forEach(function (a) {
        const cls = a.className || '';

        /* CTA-knapp (desktop eller mobile) */
        if (cls.includes('nav-cta')) {
          a.href        = p.kontakt[lang];
          a.textContent = lb.cta;
          return;
        }

        /* Bestäm vilken sida länken hör till via data-section */
        const section = a.getAttribute('data-section');
        if (!section) return;

        a.href        = p[section][lang];
        a.textContent = section === 'index'   ? lb.home    :
                        section === 'om_oss'  ? lb.about   :
                        section === 'galleri' ? lb.gallery :
                        section === 'kontakt' ? lb.contact : a.textContent;
      });
    }

    document.querySelectorAll('.nav-mid, .nav-links').forEach(applyNav);

    /* Logo / mark-länkar → startsidan på rätt språk */
    document.querySelectorAll('a.mark').forEach(function (a) {
      a.href = p.index[lang];
    });
  }

  /* ── Uppdatera footer-länkar ─────────────────────────────────────── */
  function updateFooter() {
    const p  = PAGES;
    const lb = NAV_LABELS[lang];

    document.querySelectorAll('footer .footer-col a').forEach(function (a) {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('http')) return;

      /* Matcha mot kända sidor (utan .html extension) */
      if (/^index(-en|-tr)?$/.test(href) || href === '' || href === '/') {
        a.href = PAGES.index[lang];
        a.textContent = NAV_LABELS[lang].home;
      } else if (/om-oss/.test(href)) {
        a.href = PAGES.om_oss[lang];
        a.textContent = NAV_LABELS[lang].about;
      } else if (/galleri/.test(href)) {
        a.href = PAGES.galleri[lang];
        a.textContent = NAV_LABELS[lang].gallery;
      } else if (/kontakt/.test(href)) {
        a.href = PAGES.kontakt[lang];
        /* Behåll e-posttext om det är info@... */
        if (!a.textContent.includes('@')) {
          a.textContent = NAV_LABELS[lang].contact;
        }
      }
    });

    /* Footer-rubrik "Sidor" / "Pages" / "Sayfalar" */
    document.querySelectorAll('footer .footer-col h4').forEach(function (h) {
      const t = (h.textContent || '').trim().toLowerCase();
      if (t === 'sidor' || t === 'pages' || t === 'sayfalar') {
        h.textContent = lb.pages;
      }
      if (t === 'kontakt' || t === 'contact' || t === 'iletişim') {
        h.textContent = lb.contact;
      }
    });
  }

  /* ── Flagg-klick: spara + navigera ──────────────────────────────── */
  function bindFlagClicks() {
    document.querySelectorAll('.language-switcher a.language-option').forEach(function (a) {
      a.addEventListener('click', function () {
        const newLang = a.getAttribute('data-lang');
        if (!newLang) return;
        localStorage.setItem('eucon_lang', newLang);
        /* navigering sker via href — inget preventDefault */
      });
    });
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    updateFlags();
    updateNav();
    updateFooter();
    bindFlagClicks();
  });

})();
