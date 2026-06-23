(function () {
  window.FUNNEL_PAGE_1_CANVA_REFERENCE = "https://canva.link/siiaup5v9gvotuz";
  window.FUNNEL_PAGE_2_CANVA_REFERENCE = "https://canva.link/cj5yod10y9cd6tq";
  window.FUNNEL_PAGE_3_CANVA_REFERENCE = "https://canva.link/6ws253y8cqhuc57";

  window.VSL_PRINCIPAL_URL = "0509 vsl 1 de cima Pseu.mp4";
  window.VSL_OFERTA_URL = "IMG_6166.MOV";

  window.POSTER_VSL_PRINCIPAL = "PCL/assets/images/visuals/vsl-main-16x9.svg";
  window.POSTER_VSL_PRINCIPAL_MOBILE = "PCL/assets/images/visuals/vsl-main-9x16.svg";
  window.POSTER_VSL_OFERTA = "PCL/assets/images/visuals/vsl-offer-16x9.svg";
  window.POSTER_VSL_OFERTA_MOBILE = "PCL/assets/images/visuals/vsl-offer-9x16.svg";
  window.POSTER_PREPORTAL_CALL = "PCL/assets/images/visuals/portal-entry-16x9.svg";
  window.POSTER_PREPORTAL_CALL_MOBILE = "PCL/assets/images/visuals/portal-entry-9x16.svg";

  // Stable slots keep future official asset swaps isolated from the funnel logic.
  window.PSEU_ASSET_SLOTS = {
    preportal: {
      call: {
        desktop: window.POSTER_PREPORTAL_CALL,
        mobile: window.POSTER_PREPORTAL_CALL_MOBILE,
      },
    },
    vsl: {
      main: {
        desktop: window.POSTER_VSL_PRINCIPAL,
        mobile: window.POSTER_VSL_PRINCIPAL_MOBILE,
      },
      offer: {
        desktop: window.POSTER_VSL_OFERTA,
        mobile: window.POSTER_VSL_OFERTA_MOBILE,
      },
    },
  };

  window.PSEU_PREPORTAL_CONFIG = {
    pageReferences: {
      call: window.FUNNEL_PAGE_1_CANVA_REFERENCE,
      library: window.FUNNEL_PAGE_2_CANVA_REFERENCE,
      travessia: window.FUNNEL_PAGE_3_CANVA_REFERENCE,
    },
    vsl: {
      main: {
        url: window.VSL_PRINCIPAL_URL,
        posterDesktop: window.PSEU_ASSET_SLOTS.vsl.main.desktop,
        posterMobile: window.PSEU_ASSET_SLOTS.vsl.main.mobile,
      },
      offer: {
        url: window.VSL_OFERTA_URL,
        posterDesktop: window.PSEU_ASSET_SLOTS.vsl.offer.desktop,
        posterMobile: window.PSEU_ASSET_SLOTS.vsl.offer.mobile,
      },
    },
    call: {
      posterDesktop: window.PSEU_ASSET_SLOTS.preportal.call.desktop,
      posterMobile: window.PSEU_ASSET_SLOTS.preportal.call.mobile,
    },
  };

  window.PSEU_FUNNEL_CONFIG = window.PSEU_PREPORTAL_CONFIG;
})();
