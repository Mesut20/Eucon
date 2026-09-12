/* Eucon — interactions
   Built with Motion (motion.dev) for scroll-linked and gesture animations. */
import { animate, scroll, stagger } from "https://cdn.jsdelivr.net/npm/motion@latest/+esm";

document.addEventListener("DOMContentLoaded", function () {

  /* ---------------------------------------------------------------
     1. Scroll-hide header — hides on scroll down, reveals on scroll up
  ------------------------------------------------------------------ */
  var header = document.querySelector(".site-header");
  if (header) {
    var hero = document.querySelector("main .hero-xl");
    /* Elementet märkt [data-header-light] är brytpunkten: när dess
       överkant når headern blir navigeringen vit — och förblir så hela
       vägen ner, eftersom rect.top då bara blir mer negativ. */
    var lightFrom = document.querySelector("[data-header-light]");
    /* mörk sida utan markerad brytpunkt — behåll ljus nav hela vägen */
    var darkFlow = !!document.querySelector("main .story");

    /* headerhöjden ändras inte under scroll, så läs den bara vid resize */
    var headerH = header.offsetHeight;

    function updateHeaderTone() {
      /* Brytpunkten går först — den gäller lika för start- och undersidor. */
      if (lightFrom) {
        header.classList.toggle("header-on-light",
          lightFrom.getBoundingClientRect().top - headerH <= 0);
        return;
      }
      /* Undersida utan markerad brytpunkt: innehållet är ljust hela vägen,
         så en genomskinlig header skulle bli vit text mot vit botten. */
      if (document.body.classList.contains("inner-page")) {
        header.classList.add("header-on-light");
        return;
      }
      if (darkFlow) {
        header.classList.remove("header-on-light");
        return;
      }
      if (hero) {
        var shouldUseLightHeader = window.scrollY >= Math.max(hero.offsetHeight - headerH - 40, 0);
        header.classList.toggle("header-on-light", shouldUseLightHeader);
      }
    }
    updateHeaderTone();
    window.addEventListener("scroll", updateHeaderTone, { passive: true });
    window.addEventListener("resize", function () {
      headerH = header.offsetHeight;
      updateHeaderTone();
    });

    var lastY = window.scrollY;
    var headerHidden = false;
    var hideThreshold = 160;
    scroll(function (progress, info) {
      var y = info.y.current;
      var goingDown = y > lastY;
      lastY = y;
      if (y > hideThreshold && goingDown && !headerHidden) {
        headerHidden = true;
        animate(header, { y: "-110%" }, { duration: 0.6, easing: [0.22, 1, 0.36, 1] });
      } else if ((!goingDown || y <= hideThreshold) && headerHidden) {
        headerHidden = false;
        animate(header, { y: "0%" }, { duration: 0.6, easing: [0.22, 1, 0.36, 1] });
      }
    });
  }

  /* ---------------------------------------------------------------
     2. Dots-morph button + sidebar menu (open / close)
  ------------------------------------------------------------------ */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  var backdrop = document.querySelector(".sidebar-backdrop");
  var dots = toggle ? toggle.querySelectorAll(".dot") : [];

  function openSidebar() {
    animate(links, { x: "0%" }, { duration: 0.45, easing: [0.22, 1, 0.36, 1] });
    if (backdrop) { animate(backdrop, { opacity: 1 }, { duration: 0.3 }); backdrop.classList.add("open"); }
    if (dots.length === 3) {
      animate(dots[0], { y: 0, rotate: 45 }, { duration: 0.3 });
      animate(dots[1], { opacity: 0, scale: 0 }, { duration: 0.2 });
      animate(dots[2], { y: -7, rotate: -45 }, { duration: 0.3 });
    }
    toggle.setAttribute("aria-expanded", "true");
    links.classList.add("open");
  }

  function closeSidebar() {
    animate(links, { x: "100%" }, { duration: 0.4, easing: [0.22, 1, 0.36, 1] });
    if (backdrop) { animate(backdrop, { opacity: 0 }, { duration: 0.25 }); backdrop.classList.remove("open"); }
    if (dots.length === 3) {
      animate(dots[0], { y: -7, rotate: 0 }, { duration: 0.3 });
      animate(dots[1], { opacity: 1, scale: 1 }, { duration: 0.3 });
      animate(dots[2], { y: 7, rotate: 0 }, { duration: 0.3 });
    }
    toggle.setAttribute("aria-expanded", "false");
    links.classList.remove("open");
  }

  var isMobile = window.matchMedia("(max-width:900px)");

  if (toggle && links) {
    if (isMobile.matches) animate(links, { x: "100%" }, { duration: 0 });
    toggle.addEventListener("click", function () {
      var isOpen = links.classList.contains("open");
      isOpen ? closeSidebar() : openSidebar();
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeSidebar);
    });
    if (backdrop) backdrop.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("open")) closeSidebar();
    });
  }

  /* ---------------------------------------------------------------
     3. Scroll-velocity-linked offset — "Senaste"-cards on the home
        page drift at different rates as the row scrolls by
  ------------------------------------------------------------------ */
  var updatesRow = document.querySelector(".updates-row");
  if (updatesRow) {
    var updateThumbs = updatesRow.querySelectorAll(".thumb img");
    var rates = [-9, 7, -6, 9];
    updateThumbs.forEach(function (img, i) {
      var rate = rates[i % rates.length];
      scroll(
        animate(img, { y: [rate + "%", -rate + "%"] }),
        { target: updatesRow, offset: ["start end", "end start"] }
      );
    });
  }

  /* ---------------------------------------------------------------
     5. Oversized statement — scales and brightens into focus as it
        centres in the viewport
  ------------------------------------------------------------------ */
  document.querySelectorAll(".statement .stmt-text").forEach(function (el) {
    scroll(
      animate(el, { scale: [0.86, 1], opacity: [0.35, 1] }),
      { target: el.closest(".statement"), offset: ["start 0.85", "start 0.35"] }
    );
  });

    /* ---------------------------------------------------------------
      6. Reveal-on-scroll — content fades in and out as it enters
        and leaves the viewport
    ------------------------------------------------------------------ */
  var revealEls = document.querySelectorAll(
    ".feature-block, .tile, .update-card, .lede-block, .section-head, .stat-strip, .partner-list, .timeline, .pull, .contact-grid"
  );
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animate(
              entry.target,
              { opacity: [0, 1], y: [26, 0] },
              { duration: 0.6, easing: [0.22, 1, 0.36, 1] }
            );
          } else {
            animate(
              entry.target,
              { opacity: 0, y: 26 },
              { duration: 0.45, easing: "ease" }
            );
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach(function (el) {
      el.style.opacity = "0";
      io.observe(el);
    });
  }

  /* ---------------------------------------------------------------
     7. Instagram-flöde

     Två lägen, samma behållare:

     a) Länkläge (standard, kräver ingenting av er)
        instagram-feed.json innehåller länkar till inlägg. De renderas
        med Instagrams egen inbäddning — blockquote + embed.js — som
        fungerar utan token och utan konto. Innehållet i varje inlägg
        hämtas live från Instagram; det är bara *listan* som är manuell.

     b) API-läge (om servern har INSTAGRAM_ACCESS_TOKEN)
        Då kommer färdiga inläggsobjekt med bild, text och likes, och
        flödet uppdateras av sig självt.

     Inbäddningen laddar Metas skript, som sätter kakor. Därför laddas
     det först när sektionen kommer i vy — inte vid varje sidladdning.
  ------------------------------------------------------------------ */
  var instagramGallery = document.querySelector("#instagram-gallery");
  if (instagramGallery) {

    var IG_PROFIL = "https://www.instagram.com/euconab";

    function igTomt(text) {
      instagramGallery.innerHTML =
        '<div class="instagram-empty">' +
        '<p>' + text + '</p>' +
        '<a href="' + IG_PROFIL + '" target="_blank" rel="noopener noreferrer">Se inläggen på Instagram</a>' +
        '</div>';
    }

    /* ---------- a) länkläge: Instagrams egen inbäddning ---------- */
    var igSkriptLaddat = false;
    function igLaddaSkript() {
      if (igSkriptLaddat) {
        if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process();
        return;
      }
      igSkriptLaddat = true;
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://www.instagram.com/embed.js";
      s.onload = function () {
        if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process();
      };
      document.body.appendChild(s);
    }

    function igRenderaLankar(lankar) {
      instagramGallery.classList.add("instagram-embeds");
      instagramGallery.innerHTML = lankar.map(function (url) {
        return '<blockquote class="instagram-media"' +
               ' data-instgrm-permalink="' + url + '"' +
               ' data-instgrm-version="14"></blockquote>';
      }).join("");

      /* vänta tills sektionen syns innan Metas skript hämtas */
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            io.disconnect();
            igLaddaSkript();
          });
        }, { rootMargin: "300px 0px" });
        io.observe(instagramGallery);
      } else {
        igLaddaSkript();
      }
    }

    /* ---------- b) API-läge: färdiga inläggsobjekt ---------- */
    function igKort(post) {
      var imageUrl = post.image || post.media_url || "images/gallery-06.jpg";
      var caption = post.caption || "";
      var permalink = post.permalink || IG_PROFIL;
      var username = post.username || "euconab";
      /* API:et utelämnar like_count om kontot döljer gilla-markeringar */
      var likes = (post.likes === null || post.likes === undefined) ? null : Number(post.likes);

      var altText = caption ? caption.replace(/"/g, "&quot;").slice(0, 120) : "Instagram-inlägg";

      /* Rutan öppnar lightboxen i stället för att lämna sidan. Samma
         data-full-krok som galleriets bilder använder, plus likes och
         permalänk så att lightboxen kan visa dem vid sidan av bilden. */
      return [
        '<article class="instagram-post">',
        '  <div class="instagram-media-wrap" data-full="' + imageUrl + '"' +
             ' data-alt="' + altText + '"' +
             ' data-likes="' + (likes === null ? '' : likes) + '"' +
             ' data-permalink="' + permalink + '"' +
             ' tabindex="0" role="button" aria-label="Visa i större format">',
        '    <img src="' + imageUrl + '" alt="' + altText + '" loading="lazy">',
        '  </div>',
        '  <div class="instagram-post-body">',
        '    <div class="instagram-post-header">',
        '      <div class="instagram-post-user">',
        '        <span class="instagram-avatar">E</span>',
        '        <span class="instagram-handle">' + username + '</span>',
        '      </div>',
        '      <a class="instagram-link" href="' + permalink + '" target="_blank" rel="noopener noreferrer" aria-label="Öppna inlägget i Instagram">',
        '        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
        '      </a>',
        '    </div>',
        likes === null ? '' :
        '    <div class="instagram-stats">' +
        '      <span class="instagram-likes"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.13 6.13 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z"/></svg>' + likes.toLocaleString('sv-SE') + '</span>' +
        '    </div>',
        '    <div class="instagram-caption">' + (caption ? caption.replace(/\n/g, '<br>') : 'Nytt inlägg från Instagram.') + '</div>',
        '  </div>',
        '</article>'
      ].join('');
    }

    function igRendera(poster) {
      if (!poster || poster.length === 0) {
        igTomt("Inga inlägg att visa just nu.");
        return;
      }
      /* en sträng = en länk till ett inlägg; ett objekt = färdig data */
      var lankar = poster
        .map(function (p) { return typeof p === "string" ? p : (p && !p.image && p.permalink ? p.permalink : null); })
        .filter(Boolean);

      if (lankar.length === poster.length) igRenderaLankar(lankar);
      else instagramGallery.innerHTML = poster.map(igKort).join('');
    }

    function igHamta() {
      fetch('/api/instagram', { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('Instagram fetch failed');
          return r.json();
        })
        .then(function (data) { igRendera(data.posts || []); })
        .catch(function () { igTomt("Flödet kunde inte hämtas just nu."); });
    }

    igHamta();
    /* API-läget uppdaterar sig självt; länkläget behöver ingen omhämtning */
    window.setInterval(function () {
      if (!instagramGallery.classList.contains("instagram-embeds")) igHamta();
    }, 300000);
  }

  /* ---------------------------------------------------------------
     8. Gallery lightbox
  ------------------------------------------------------------------ */
  var lightbox = document.querySelector(".lightbox");
  if (lightbox) {
    var lbImg = lightbox.querySelector("img");
    var closeBtn = lightbox.querySelector(".lightbox-close");
    var lbMeta = lightbox.querySelector(".lightbox-meta");
    var lbLikes = lightbox.querySelector(".lightbox-likes-count");
    var lbLink = lightbox.querySelector(".lightbox-ig-link");
    var lbOpener = null;

    function openLb(fig) {
      lbOpener = fig;
      lbImg.src = fig.getAttribute("data-full");
      lbImg.alt = fig.getAttribute("data-alt") || "";

      /* Instagram-inlägg bär likes och permalänk; galleribilderna gör
         det inte, och då hålls hela sidopanelen dold. */
      if (lbMeta) {
        var likes = fig.getAttribute("data-likes");
        var permalink = fig.getAttribute("data-permalink");
        var harMeta = !!permalink;

        lbMeta.hidden = !harMeta;
        if (harMeta) {
          var harLikes = likes !== null && likes !== "";
          if (lbLikes) {
            lbLikes.parentElement.hidden = !harLikes;
            if (harLikes) lbLikes.textContent = Number(likes).toLocaleString("sv-SE");
          }
          if (lbLink) lbLink.href = permalink;
        }
      }

      lightbox.classList.add("open");
      if (closeBtn) closeBtn.focus();
      animate(lbImg, { opacity: [0, 1], scale: [0.96, 1] }, { duration: 0.3 });
    }

    /* Delegerat: Instagram-korten skapas efter att den här koden kört. */
    function lbTraff(e) {
      var fig = e.target.closest ? e.target.closest("[data-full]") : null;
      return fig && lightbox.contains(fig) === false ? fig : null;
    }
    document.addEventListener("click", function (e) {
      var fig = lbTraff(e);
      if (fig) openLb(fig);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      var fig = lbTraff(e);
      if (!fig) return;
      e.preventDefault();
      openLb(fig);
    });
    function closeLb() {
      lightbox.classList.remove("open");
      lbImg.src = "";
      if (lbMeta) lbMeta.hidden = true;
      /* lämna tillbaka fokus till rutan man kom ifrån */
      if (lbOpener && lbOpener.focus) lbOpener.focus();
      lbOpener = null;
    }
    closeBtn.addEventListener("click", closeLb);
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLb();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLb();
    });
  }

  /* ---------------------------------------------------------------
     9. Vertikal scroll-story — startsidan

     Scrollen ger ett MÅL-index; det som ritas följer efter med
     tidskompenserad interpolering. Det gör rörelsen mjuk även när
     inmatningen är hackig (hjulsteg är typiskt 100 px i klump), och
     bakgrunden följer med eftersom allt härleds ur samma värde.

     Två faser per kapitel:
       • rörelse (första 45 % av segmentet) — kolumnen glider uppåt
       • stopp   (resterande 55 %)          — bilden står stilla medan
                                              rubrik och text tonar in
  ------------------------------------------------------------------ */
  var story = document.querySelector(".story");
  if (story) {
    var stTrack  = story.querySelector(".story-track");
    var stStage  = story.querySelector(".story-stage");
    var stColumn = story.querySelector(".story-column");
    var stGlobe  = story.querySelector(".story-globe");
    var stCity   = story.querySelector(".glb-city");
    var stRoute  = story.querySelector(".glb-route");
    var stStars  = story.querySelector(".story-stars");
    var stDawn   = story.querySelector(".story-horizon");
    var stCards  = Array.prototype.slice.call(story.querySelectorAll(".story-card"));
    var stPanels = Array.prototype.slice.call(story.querySelectorAll(".story-panel"));
    var stAtmos  = Array.prototype.slice.call(story.querySelectorAll(".story-atmos"));
    var stCount  = Math.min(stCards.length, stPanels.length);
    var stReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var ST_TRAVEL = 0.52;   /* andel av segmentet som är rörelse, resten stopp */
    var ST_EASE   = 0.14;   /* hur snabbt det ritade värdet hinner ikapp målet */
    var ST_WINDOW = 0.72;   /* hur brett texten tonar in och ut                 */
    var ST_DRIFT  = 1;      /* konstant medglidning, se --st-drift              */

    if (stTrack && stStage && stColumn && stCount && !stReduce) {
      story.classList.add("is-live");
      story.style.setProperty("--st-count", stCount);
      stCards.forEach(function (card, i) { card.style.setProperty("--st-i", i); });
      stPanels.slice(stCount).forEach(function (p) { p.style.setProperty("--st-p", 0); });

      /* scenerna fördelas jämnt över kapitlen, oavsett hur många det är */
      var stScenes = stAtmos.length;
      var stStep   = stScenes > 1 ? (stCount - 1) / (stScenes - 1) : 0;
      var stHalf   = stStep * 1.5 || 1;
      var stLast   = stCount - 1;

      function stClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
      function stSmooth(t) { return t * t * (3 - 2 * t); }
      function stEaseSeg(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
      function stRamp(v, a, b) { return stSmooth(stClamp((v - a) / (b - a), 0, 1)); }

      /* Skriv bara custom properties som faktiskt ändrats. */
      var stCache = {};
      function stSet(el, name, value, key) {
        var s = value.toFixed(3);
        if (stCache[key] === s) return;
        stCache[key] = s;
        el.style.setProperty(name, s);
      }

      /* Spannet beror bara på vh-enheter, så det mäts om vid resize i
         stället för varje frame — annars tvingas layout fram i onödan. */
      var stSpan = 0;
      function stMeasure() { stSpan = stTrack.offsetHeight - stStage.offsetHeight; }

      /* Den råa scrollpositionen sparas vid sidan av det kapitelbundna
         indexet. Kapitlen ska stanna — men bilden och himlen ska aldrig
         frysa helt, så de får en långsam medglidning ur det råa värdet. */
      var stTargetP = 0;
      function stTargetAct() {
        if (stSpan <= 0) return null;
        var p = stClamp(-stTrack.getBoundingClientRect().top / stSpan, 0, 1);
        stTargetP = p;
        var u = p * stCount;
        var seg = Math.min(Math.floor(u), stCount - 1);
        var t = stClamp(u - seg, 0, 1);
        return seg - 1 + (t < ST_TRAVEL ? stEaseSeg(t / ST_TRAVEL) : 1);
      }

      function stApply(act, prog) {
        stSet(stColumn, "--st-act", act, "act");

        /* Medglidning inom kapitlet. u - act - 1 löper från -(1-TRAVEL)
           till 0 under stoppet och tillbaka under rörelsen — och möts i
           samma värde vid varje skarv, så det finns inget hopp. Normerad
           till 0–1 blir den ett mjukt "andetag" per kapitel: bilden står
           still men slutar aldrig röra sig. */
        var local = stClamp((prog * stCount - act - 1 + 0.5) * 2, 0, 1);
        stSet(stColumn, "--st-drift", local, "drift");

        for (var i = 0; i < stCount; i++) {
          var d = i - act;
          var ad = d < 0 ? -d : d;

          stSet(stCards[i], "--st-d", ad > 4 ? 4 : ad, "d" + i);

          var pr = stSmooth(stClamp(1 - ad / ST_WINDOW, 0, 1));
          var panel = stPanels[i];
          stSet(panel, "--st-p", pr, "p" + i);
          stSet(panel, "--st-dir", d < 0 ? -1 : 1, "dir" + i);

          var live = pr > 0.5;
          if (panel.classList.contains("is-current") !== live) {
            panel.classList.toggle("is-current", live);
          }
        }

        /* ---- bakgrunden: scenerna tonar över i varandra ---- */
        var a = stClamp(act, 0, stLast);
        for (var s = 0; s < stScenes; s++) {
          stSet(stAtmos[s], "--st-on", stSmooth(stClamp(1 - Math.abs(a - s * stStep) / stHalf, 0, 1)), "on" + s);
        }

        /* ---- jorden: stjärnor → klot → städer → rutter → gryning ----
           Sätts på respektive lager, inte på <section>, så att bara det
           lagret behöver räknas om. Gränserna är andelar av kapitel-
           antalet och följer alltså med om kapitlen blir fler eller färre. */
        var N = stCount;
        if (stGlobe) {
          stSet(stGlobe, "--st-prog", prog, "prog");
          stSet(stGlobe, "--st-globe",
                stRamp(act, 0.2, N * 0.22) * stClamp(1 - Math.max(0, act - (N - 1.4)) / 1.6, 0.4, 1), "globe");
        }
        if (stStars) stSet(stStars, "--st-stars",  stClamp(1 - Math.max(0, act - N * 0.12) / (N * 0.42), 0, 1), "stars");
        if (stCity)  stSet(stCity,  "--st-cities", stRamp(act, N * 0.3,  N * 0.52), "cities");
        if (stRoute) stSet(stRoute, "--st-routes", stRamp(act, N * 0.55, N * 0.78), "routes");
        if (stDawn)  stSet(stDawn,  "--st-dawn",   stRamp(act, N * 0.72, N - 0.1),  "dawn");

        var started = act > -0.96;
        if (story.classList.contains("is-started") !== started) {
          story.classList.toggle("is-started", started);
        }
      }

      /* ---- interpolerad loop ---- */
      var stCur = null, stCurP = 0, stRaf = 0, stPrev = 0;

      function stTick(now) {
        stRaf = 0;
        var target = stTargetAct();
        if (target === null) { stPrev = 0; return; }
        var targetP = stTargetP;

        if (stCur === null) {
          stCur = target;                       /* första bildrutan: hoppa dit */
          stCurP = targetP;
        } else {
          var dt = stPrev ? Math.min(now - stPrev, 64) : 16.6667;
          /* tidskompenserat, så farten är densamma på 60 och 120 Hz */
          var k = 1 - Math.pow(1 - ST_EASE, dt / 16.6667);
          stCur  += (target  - stCur)  * k;
          stCurP += (targetP - stCurP) * k;
          if (Math.abs(target - stCur) < 0.0004)    stCur = target;
          if (Math.abs(targetP - stCurP) < 0.00008) stCurP = targetP;
        }
        stPrev = now;

        stApply(stCur, stCurP);

        if (stCur !== target || stCurP !== targetP) stRaf = requestAnimationFrame(stTick);
        else stPrev = 0;
      }

      function stKick() { if (!stRaf) { stPrev = 0; stRaf = requestAnimationFrame(stTick); } }
      function stReset() { stMeasure(); stCache = {}; stCur = null; stCurP = 0; stKick(); }

      window.addEventListener("scroll", stKick, { passive: true });
      window.addEventListener("resize", stReset);
      window.addEventListener("load", stReset);
      stReset();
    }
  }

  /* ---------------------------------------------------------------
     10. Radbrytnings- och orduppdelning för rubriker
         [data-split="lines"] → varje rad maskas och glider upp
         [data-split="words"] → varje ord glider upp efter varandra
  ------------------------------------------------------------------ */
  var motionOff = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function wrapWordsIn(node, out) {
    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (child) {
      if (child.nodeType === 3) {
        var parts = child.textContent.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          var w = document.createElement("span");
          w.className = "split-word";
          var inner = document.createElement("span");
          inner.className = "split-inner";
          inner.textContent = part;
          w.appendChild(inner);
          frag.appendChild(w);
          out.push(inner);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        wrapWordsIn(child, out);
      }
    });
  }

  function splitHeading(el) {
    if (motionOff) return;
    var mode = el.getAttribute("data-split");

    if (mode === "lines" && !el.querySelector("*")) {
      /* dela i ord, mät var raderna bryts, bygg om till radmasker */
      var words = el.textContent.trim().split(/\s+/);
      el.textContent = "";
      var probes = words.map(function (w, i) {
        var s = document.createElement("span");
        s.textContent = w;
        el.appendChild(s);
        if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
        return s;
      });
      var lines = [], top = null;
      probes.forEach(function (s) {
        var y = s.offsetTop;
        if (top === null || Math.abs(y - top) > 4) { lines.push([]); top = y; }
        lines[lines.length - 1].push(s.textContent);
      });
      el.textContent = "";
      lines.forEach(function (words, i) {
        var line = document.createElement("span");
        line.className = "split-line";
        var inner = document.createElement("span");
        inner.className = "split-inner";
        inner.textContent = words.join(" ");
        inner.style.setProperty("--split-delay", (i * 90) + "ms");
        line.appendChild(inner);
        el.appendChild(line);
      });
    } else {
      var inners = [];
      wrapWordsIn(el, inners);
      inners.forEach(function (inner, i) {
        inner.style.setProperty("--split-delay", (i * 45) + "ms");
      });
    }
    el.classList.add("split-ready");
  }

  /* ---------------------------------------------------------------
     11. Avslöjning vid scroll — en gång, aldrig tillbaka
  ------------------------------------------------------------------ */
  function startReveal() {
  /* Uppdelningen ändrar radbrytningen och därmed sidans höjd. Har man
     kommit hit via ett ankare från en annan sida har webbläsaren redan
     hoppat — och hamnar då fel. Notera var vi står innan. */
  var beforeY = window.scrollY;

  document.querySelectorAll("[data-split]").forEach(splitHeading);

  /* Gå till ankaret igen, men bara om besökaren inte hunnit skrolla själv. */
  if (location.hash && Math.abs(window.scrollY - beforeY) < 4) {
    var anchor = null;
    try { anchor = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
    if (anchor) {
      var behavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      anchor.scrollIntoView();
      document.documentElement.style.scrollBehavior = behavior;
    }
  }

  var inView = document.querySelectorAll("[data-reveal], [data-split]");
  if (inView.length) {
    if (motionOff || !("IntersectionObserver" in window)) {
      inView.forEach(function (el) { el.classList.add("is-in"); });
    } else {
      inView.forEach(function (el) {
        var d = el.getAttribute("data-reveal-delay");
        if (d) el.style.setProperty("--reveal-delay", d + "ms");
      });
      var revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealIO.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
      inView.forEach(function (el) { revealIO.observe(el); });
    }
  }
  }

  /* Fonterna påverkar var raderna bryts, så vänta in dem — men inte
     hur länge som helst. */
  if (document.fonts && document.fonts.ready) {
    var started = false;
    var go = function () { if (!started) { started = true; startReveal(); } };
    document.fonts.ready.then(go);
    setTimeout(go, 1200);
  } else {
    startReveal();
  }

  /* ---------------------------------------------------------------
     12. Räknare — siffrorna tickar upp när de kommer in i vyn
  ------------------------------------------------------------------ */
  var counters = document.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        countIO.unobserve(el);

        var target = parseFloat(el.getAttribute("data-count")) || 0;
        var suffix = el.getAttribute("data-suffix") || "";
        /* årtal räknas från strax under, annars från noll */
        var from = target > 1000 ? target - 24 : 0;

        if (motionOff) { el.textContent = target + suffix; return; }

        var dur = 1500, t0 = 0;
        function step(now) {
          if (!t0) t0 = now;
          var t = Math.min((now - t0) / dur, 1);
          var eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(from + (target - from) * eased) + suffix;
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { countIO.observe(el); });
  }

  /* ---------------------------------------------------------------
     13. Bildband — två rader som glider åt var sitt håll

     Drivs av rAF i stället för en CSS-animation. Vid hover ska farten
     glida ned mjukt, och animation-duration går inte att övergångs-
     animera: byter man värde hoppar tidräkningen. Här interpoleras
     farten i stället, så bandet blir "segare" utan att tvärstanna.
  ------------------------------------------------------------------ */
  document.querySelectorAll(".reel-row").forEach(function (row) {
    var lane = row.querySelector(".reel-lane");
    if (!lane) return;

    /* dubblera innehållet så att varvningen blir sömlös */
    Array.prototype.slice.call(lane.children).forEach(function (item) {
      var copy = item.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      lane.appendChild(copy);
    });

    if (motionOff) return;

    var REEL_SPEED = 46;    /* px per sekund i vila            */
    var REEL_SLOW  = 0.26;  /* andel av farten vid hover       */
    var REEL_EASE  = 0.004; /* kvar av avvikelsen efter 1 sek  */

    var dir   = row.getAttribute("data-reel-dir") === "-1" ? -1 : 1;
    var half  = 0;
    var x     = 0;
    var speed = REEL_SPEED;
    var want  = REEL_SPEED;
    var raf = 0, prev = 0, visible = false;

    function measure() {
      var w = lane.scrollWidth / 2;
      if (w > 0 && w !== half) {
        half = w;
        if (x < -half) x = -half;
      }
    }
    measure();
    if (dir < 0) x = -half;

    /* bara riktiga pekare — annars bromsar bandet vid varje tryckning */
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      row.addEventListener("pointerenter", function () { want = REEL_SPEED * REEL_SLOW; });
      row.addEventListener("pointerleave", function () { want = REEL_SPEED; });
    }

    function tick(now) {
      raf = 0;
      var dt = prev ? Math.min((now - prev) / 1000, 0.064) : 0.016;
      prev = now;

      /* tidskompenserat, så inbromsningen tar lika lång tid oavsett Hz */
      speed += (want - speed) * (1 - Math.pow(REEL_EASE, dt));
      x -= speed * dt * dir;

      if (half > 0) {
        if (x <= -half) x += half;
        else if (x > 0) x -= half;
      }
      lane.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";

      if (visible) raf = requestAnimationFrame(tick);
      else prev = 0;
    }

    function start() { if (!raf) { prev = 0; raf = requestAnimationFrame(tick); } }

    /* rulla bara medan raden syns — annars bränner den bildrutor i onödan */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) start();
        });
      }, { rootMargin: "150px 0px" }).observe(row);
    } else {
      visible = true;
      start();
    }

    window.addEventListener("resize", measure);
  });

  /* ---------------------------------------------------------------
     14. Dragspel i tjänstelistorna — Om oss

     Höjden animeras med grid-template-rows 0fr → 1fr i CSS, så här
     behöver vi bara växla klassen och hålla aria-expanded i takt.
  ------------------------------------------------------------------ */
  document.querySelectorAll(".chapter-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".chapter-item");
      if (!item) return;
      var open = !item.classList.contains("is-open");
      item.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  /* ---------------------------------------------------------------
     15. Porträtt med reserv — kontaktsidan

     Saknas bildfilen skulle webbläsaren rita en trasig bildikon. Ta
     bort <img> i stället, så syns initialerna som ligger under.
  ------------------------------------------------------------------ */
  document.querySelectorAll(".vd-avatar img").forEach(function (img) {
    function fallBack() { if (img.parentNode) img.parentNode.removeChild(img); }
    img.addEventListener("error", fallBack);
    /* redan färdigladdad men trasig när skriptet hinner hit */
    if (img.complete && img.naturalWidth === 0) fallBack();
  });

  /* ---------------------------------------------------------------
     18. Mappen "Galleri bilder" — modal med alla galleribilder

     Bilderna ligger i en dold modal. Lightboxen (modul 8) lyssnar
     delegerat pa document, sa den fungerar aven for rutor som visas
     forst har — och dess metapanel forblir dold eftersom galleri-
     rutorna saknar data-permalink.
  ------------------------------------------------------------------ */
  var folderBtn = document.querySelector(".folder-btn");
  var vault = document.getElementById("galleryVault");

  if (folderBtn && vault) {
    var vaultClose = vault.querySelector(".vault-close");
    var vaultOpener = null;
    var folderArrows = folderBtn.querySelector(".folder-arrows");

    /* ---- pilarna: ett varv fram vid hover, ett varv tillbaka vid utgang ----
       Fargbytet skoter CSS sjalv via :hover. Rotationen behover JS, for
       med enbart :hover finns inget lage att spela det bakatgaende varvet
       i — regeln slutar galla i samma ogonblick musen lamnar. */
    function spela(klass) {
      folderBtn.classList.remove("is-spin", "is-rewind");
      /* framtvinga omflode, annars raknas klassbytet som ingen andring
         och animationen startar inte om vid snabba in- och utrorelser */
      void folderBtn.offsetWidth;
      folderBtn.classList.add(klass);
    }

    if (folderArrows) {
      folderBtn.addEventListener("mouseenter", function () { spela("is-spin"); });
      folderBtn.addEventListener("mouseleave", function () { spela("is-rewind"); });
      folderBtn.addEventListener("focus", function () { spela("is-spin"); });
      folderBtn.addEventListener("blur", function () { spela("is-rewind"); });

      /* stada bort klassen nar varvet ar klart, sa nasta hover borjar rent */
      folderArrows.addEventListener("animationend", function () {
        folderBtn.classList.remove("is-spin", "is-rewind");
      });
    }

    /* ---- modalen ---- */
    function openVault() {
      vaultOpener = document.activeElement;
      vault.hidden = false;
      /* Framtvinga omflode i stallet for requestAnimationFrame: rAF kan
         hoppas over i en bakgrundsflik, och da hade modalen blivit
         liggande pa opacity 0 — oppen men osynlig. */
      void vault.offsetWidth;
      vault.classList.add("open");
      folderBtn.setAttribute("aria-expanded", "true");
      document.body.classList.add("vault-open");
      if (vaultClose) vaultClose.focus();
    }

    function closeVault() {
      vault.classList.remove("open");
      folderBtn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("vault-open");
      window.setTimeout(function () {
        if (!vault.classList.contains("open")) vault.hidden = true;
      }, 300);
      if (vaultOpener && vaultOpener.focus) vaultOpener.focus();
      vaultOpener = null;
    }

    folderBtn.addEventListener("click", openVault);
    if (vaultClose) vaultClose.addEventListener("click", closeVault);
    vault.addEventListener("click", function (e) {
      if (e.target === vault) closeVault();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || vault.hidden) return;
      /* ligger lightboxen over ska Escape stanga den forst */
      var lb = document.querySelector(".lightbox.open");
      if (!lb) closeVault();
    });
  }

  /* ---------------------------------------------------------------
     17. Hero-video — avkoda bara när den syns

     <video loop> fortsätter avkoda varje bildruta även när sektionen
     skrollats förbi. Vid 1080p+ konkurrerar det med scroll-animationen
     om GPU:n hela vägen ner. Här pausas den så fort den lämnar vyn.
  ------------------------------------------------------------------ */
  var heroVideo = document.querySelector(".hero-xl video");
  if (heroVideo && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var p = heroVideo.play();
          if (p && p.catch) p.catch(function () {});
        } else if (!heroVideo.paused) {
          heroVideo.pause();
        }
      });
    }, { threshold: 0 }).observe(heroVideo);

    /* Samma sak när fliken går i bakgrunden. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) heroVideo.pause();
    });
  }

  /* ---------------------------------------------------------------
     16. Inladdning + magnetiska knappar
  ------------------------------------------------------------------ */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { document.body.classList.add("is-ready"); });
  });

  if (!motionOff && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    /* Knappar som ska sta stilla. Hero-knapparna pa startsidan gor det
       redan — inladdningsregeln .is-ready .hero-xl-content .hero-cta > *
       satter transform:none och slar ut forflyttningen. Avslutsbanden
       ligger utanfor heron, sa dar maste de valjas bort har. */
    document.querySelectorAll(".btn").forEach(function (btn) {
      if (btn.closest(".page-cta-band") || btn.closest(".hero-xl-content")) return;
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var mx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
        var my = (e.clientY - r.top - r.height / 2) / (r.height / 2);
        btn.style.setProperty("--mx", (mx * 6).toFixed(1) + "px");
        btn.style.setProperty("--my", (my * 4).toFixed(1) + "px");
      });
      btn.addEventListener("pointerleave", function () {
        btn.style.setProperty("--mx", "0px");
        btn.style.setProperty("--my", "0px");
      });
    });
  }
});
