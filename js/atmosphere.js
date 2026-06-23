(function () {
  const THEME_VARIABLES = {
    call: {
      "--ambient-a": "rgba(104, 130, 164, 0.17)",
      "--ambient-b": "rgba(65, 86, 122, 0.1)",
      "--ambient-c": "rgba(9, 12, 20, 0.88)",
      "--ambient-gold": "rgba(211, 167, 90, 0.03)",
      "--ambient-fog-opacity": "0.42",
      "--ambient-particles-opacity": "0.04",
      "--ambient-presence-opacity": "0.055",
      "--ambient-beam-opacity": "0.055",
    },
    library: {
      "--ambient-a": "rgba(88, 64, 112, 0.16)",
      "--ambient-b": "rgba(211, 167, 90, 0.12)",
      "--ambient-c": "rgba(7, 6, 11, 0.9)",
      "--ambient-gold": "rgba(211, 167, 90, 0.12)",
      "--ambient-fog-opacity": "0.36",
      "--ambient-particles-opacity": "0.095",
      "--ambient-presence-opacity": "0.07",
      "--ambient-beam-opacity": "0.075",
    },
    travessia: {
      "--ambient-a": "rgba(89, 54, 155, 0.2)",
      "--ambient-b": "rgba(49, 36, 82, 0.14)",
      "--ambient-c": "rgba(4, 3, 8, 0.94)",
      "--ambient-gold": "rgba(211, 167, 90, 0.045)",
      "--ambient-fog-opacity": "0.46",
      "--ambient-particles-opacity": "0.055",
      "--ambient-presence-opacity": "0.085",
      "--ambient-beam-opacity": "0.07",
    },
    offer: {
      "--ambient-a": "rgba(111, 76, 77, 0.16)",
      "--ambient-b": "rgba(211, 167, 90, 0.18)",
      "--ambient-c": "rgba(8, 6, 7, 0.92)",
      "--ambient-gold": "rgba(211, 167, 90, 0.17)",
      "--ambient-fog-opacity": "0.38",
      "--ambient-particles-opacity": "0.07",
      "--ambient-presence-opacity": "0.065",
      "--ambient-beam-opacity": "0.105",
    },
    portal: {
      "--ambient-a": "rgba(74, 111, 124, 0.15)",
      "--ambient-b": "rgba(99, 72, 137, 0.13)",
      "--ambient-c": "rgba(5, 6, 10, 0.92)",
      "--ambient-gold": "rgba(211, 167, 90, 0.07)",
      "--ambient-fog-opacity": "0.33",
      "--ambient-particles-opacity": "0.06",
      "--ambient-presence-opacity": "0.06",
      "--ambient-beam-opacity": "0.065",
    },
  };
  const state = {
    context: "call",
    quality: "full",
    activeVideo: "",
    frame: 0,
    sectionRatios: new Map(),
    layers: {
      bookId: "",
      chapterId: "",
      emotion: "",
    },
  };

  function getQuality() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compact = window.matchMedia("(max-width: 800px)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const saveData = Boolean(navigator.connection?.saveData);
    if (reducedMotion || saveData) return "minimal";
    if (compact || coarsePointer) return "reduced";
    return "full";
  }

  function applyTheme(context, options = {}) {
    const theme = THEME_VARIABLES[context] || THEME_VARIABLES.call;
    state.context = THEME_VARIABLES[context] ? context : "call";
    state.quality = getQuality();
    Object.entries(theme).forEach(([property, value]) => {
      document.body.style.setProperty(property, value);
    });
    document.body.dataset.atmosphere = state.context;
    document.body.dataset.atmosphereQuality = state.quality;
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent("pseu:atmosphere-change", {
        detail: {
          context: state.context,
          quality: state.quality,
          layers: { ...state.layers },
        },
      }));
    }
  }

  function registerTheme(name, variables) {
    if (!name || !variables || typeof variables !== "object") return false;
    THEME_VARIABLES[String(name)] = { ...variables };
    return true;
  }

  function setLayerContext(layers = {}) {
    state.layers = {
      ...state.layers,
      ...layers,
    };
    document.body.dataset.atmosphereBook = state.layers.bookId || "";
    document.body.dataset.atmosphereChapter = state.layers.chapterId || "";
    document.body.dataset.atmosphereEmotion = state.layers.emotion || "";
    applyTheme(state.context);
  }

  function chooseVisibleContext() {
    if (state.activeVideo === "offer") return "offer";
    if (state.activeVideo === "main") return "travessia";
    const ranked = [
      ["portal-interno", "portal"],
      ["funil-oferta", "offer"],
      ["funil-travessia", "travessia"],
      ["funil-biblioteca", "library"],
      ["funil-chamado", "call"],
    ].sort((a, b) => (state.sectionRatios.get(b[0]) || 0) - (state.sectionRatios.get(a[0]) || 0));
    return (state.sectionRatios.get(ranked[0][0]) || 0) > 0 ? ranked[0][1] : state.context;
  }

  function refreshContext() {
    const nextContext = chooseVisibleContext();
    if (nextContext !== state.context) applyTheme(nextContext);
  }

  function observeSections() {
    const ids = ["funil-chamado", "funil-biblioteca", "funil-travessia", "funil-oferta", "portal-interno"];
    if (!("IntersectionObserver" in window)) {
      applyTheme("call");
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        state.sectionRatios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
      });
      refreshContext();
    }, { threshold: [0, 0.18, 0.36, 0.58, 0.82] });
    ids.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  function observeVideos() {
    document.querySelectorAll("[data-funnel-video]").forEach((video) => {
      const videoId = video.dataset.funnelVideo;
      video.addEventListener("play", () => {
        state.activeVideo = videoId;
        applyTheme(videoId === "offer" ? "offer" : "travessia");
      });
      const releaseVideoTheme = () => {
        if (state.activeVideo !== videoId) return;
        state.activeVideo = "";
        refreshContext();
      };
      video.addEventListener("pause", releaseVideoTheme);
      video.addEventListener("ended", releaseVideoTheme);
    });
  }

  function updateParallax(event) {
    if (state.quality !== "full" || state.frame) return;
    state.frame = window.requestAnimationFrame(() => {
      const x = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      const y = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
      const shiftX = x * 8;
      const shiftY = y * 5;
      document.body.style.setProperty("--ambient-shift-x", `${shiftX.toFixed(2)}px`);
      document.body.style.setProperty("--ambient-shift-y", `${shiftY.toFixed(2)}px`);
      document.body.style.setProperty("--ambient-shift-x-reverse", `${(shiftX * -0.62).toFixed(2)}px`);
      document.body.style.setProperty("--ambient-shift-y-reverse", `${(shiftY * -0.62).toFixed(2)}px`);
      state.frame = 0;
    });
  }

  function refreshQuality() {
    const quality = getQuality();
    if (quality === state.quality) return;
    state.quality = quality;
    document.body.dataset.atmosphereQuality = quality;
  }

  function init() {
    applyTheme("call", { silent: true });
    observeSections();
    observeVideos();
    window.addEventListener("pointermove", updateParallax, { passive: true });
    window.addEventListener("resize", refreshQuality, { passive: true });
    window.addEventListener("orientationchange", refreshQuality);
  }

  window.PSEU_ATMOSPHERE = {
    themes: THEME_VARIABLES,
    get state() {
      return {
        ...state,
        sectionRatios: Object.fromEntries(state.sectionRatios),
        layers: { ...state.layers },
      };
    },
    applyTheme,
    registerTheme,
    setLayerContext,
    refreshContext,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
