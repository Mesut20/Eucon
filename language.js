/**
 * language.js — Eucon språkväxlare
 *
 * Logik:
 * 1. Bestäm aktivt språk utifrån filnamnet (sv/en/tr).
 * 2. Spara till localStorage så valet följer med mellan sidor.
 * 3. Markera aktiv flagga med klassen "is-active".
 * 4. Uppdatera alla nav-länkar (nav-mid, nav-links) och CTA-knappar
 *    så de pekar till rätt språkversion av varje sida.
 * 5. Klick på en flagga sparar nytt språkval och navigerar dit.
 */

(function () {
  'use strict';

  /* ── Sidmappning per sektion ──────────────────────────────────────── */
  const PAGES = {
    index:   { sv: 'index.html',    en: 'index-en.html',    tr: 'index-tr.html'    },
    om_oss:  { sv: 'om-oss.html',   en: 'om-oss-en.html',   tr: 'om-oss-tr.html'   },
    galleri: { sv: 'galleri.html',  en: 'galleri-en.html',  tr: 'galleri-tr.html'  },
    kontakt: { sv: 'kontakt.html',  en: 'kontakt-en.html',  tr: 'kontakt-tr.html'  },
  };

  /* Nav-texter per språk */
  const NAV_LABELS = {
    sv: { home: 'Hem',       about: 'Om oss',     gallery: 'Galleri', contact: 'Kontakt', cta: 'Kontakta oss' },
    en: { home: 'Home',      about: 'About us',   gallery: 'Gallery', contact: 'Contact', cta: 'Contact us'   },
    tr: { home: 'Ana Sayfa', about: 'Hakkımızda', gallery: 'Galeri',  contact: 'İletişim', cta: 'Bize ulaşın' },
  };

  /* ── Bestäm nuvarande sida och språk ──────────────────────────────── */
  function detectSection(filename) {
    if (/^index(-en|-tr)?\.html/.test(filename)) return 'index';
    if (/^om-oss/.test(filename))                return 'om_oss';
    if (/^galleri/.test(filename))               return 'galleri';
    if (/^kontakt/.test(filename))               return 'kontakt';
    return 'index';
  }

  function detectLangFromFile(filename) {
    if (/-en\.html/.test(filename)) return 'en';
    if (/-tr\.html/.test(filename)) return 'tr';
    return 'sv';
  }

  const currentFile    = window.location.pathname.split('/').pop() || 'index.html';
  const currentSection = detectSection(currentFile);
  const fileLang       = detectLangFromFile(currentFile);

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

    /* Funktion som uppdaterar ett nav-element */
    function applyNav(nav) {
      if (!nav) return;
      const links = nav.querySelectorAll('a');
      links.forEach(function (a) {
        const cls = a.className;

        /* CTA-knapp */
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
  }

  /* ── Flagg-klick: spara + navigera ──────────────────────────────── */
  function bindFlagClicks() {
    document.querySelectorAll('.language-switcher a.language-option').forEach(function (a) {
      a.addEventListener('click', function (e) {
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
    bindFlagClicks();
  });

})();
