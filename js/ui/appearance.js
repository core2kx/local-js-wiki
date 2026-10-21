/* LocalWiki — ui/appearance.js
   Applies the wiki's appearance (see model.js "appearance"): the color palette for the current
   light/dark theme, the name and icon in the top bar, the browser-tab icon (favicon) and the
   window title. The settings dialog calls it with unsaved choices for a live preview.

   Depends on: icon-library.js, palettes.js, model.js, state.js, ui/elements.js
   Provides:   LocalWiki.ui.applyAppearance, brandIconHtml */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {escapeHtml} = LW.text;
  const {t} = LW.i18n;
  const DEFAULT_GLYPH = '◫';

  const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  // appearance/logo default to the open wiki's; pass others to preview unsaved settings.
  function applyAppearance(appearance = state.wiki.appearance, logo = state.logo) {
    const colors = LW.palettes.byId(appearance.palette)[theme()];
    for (const [token, value] of Object.entries(colors)) document.documentElement.style.setProperty('--' + token, value);
    els.brandName.textContent = appearance.appName;
    els.brand.setAttribute('aria-label', t('top.brand_home', {name: appearance.appName}));
    fillBrandIcon(els.brandIcon, appearance, logo);
    document.title = state.wiki.name + ' — ' + appearance.appName;
    els.favicon.href = faviconUrl(appearance, logo, colors);
  }

  // The icon box: a picture, a bundled SVG icon, an emoji/symbol, or the default mark.
  function fillBrandIcon(element, appearance, logo) {
    element.classList.toggle('has-image', appearance.icon === 'image' && !!logo);
    element.innerHTML = brandIconHtml(appearance, logo);
  }
  function brandIconHtml(appearance, logo) {
    const icon = appearance.icon;
    if (icon === 'image' && logo) return '<img src="' + escapeHtml(logo) + '" alt="">';
    if (icon.startsWith('icon:') && LW.icons.has(icon.slice(5))) return LW.icons.svg(icon.slice(5));
    return escapeHtml(icon && icon !== 'image' && !icon.startsWith('icon:') ? icon : DEFAULT_GLYPH);
  }

  // The browser-tab icon: the picture itself, or a small SVG in the palette's accent color.
  function faviconUrl(appearance, logo, colors) {
    const icon = appearance.icon;
    if (icon === 'image' && logo) return logo;
    const box = `<rect width="64" height="64" rx="14" fill="${colors.accent}"/>`;
    let inner;
    if (icon.startsWith('icon:') && LW.icons.has(icon.slice(5))) {
      inner = `<g transform="translate(12 12) scale(1.667)" fill="none" stroke="${colors['on-accent']}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${LW.icons.art(icon.slice(5))}</g>`;
    } else if (icon && icon !== 'image') {
      inner = `<text x="32" y="45" font-size="36" text-anchor="middle" fill="${colors['on-accent']}" font-family="sans-serif">${escapeHtml(icon)}</text>`;
    } else {
      inner = `<path d="M16 16h25l7 7v25H16z" fill="none" stroke="${colors['on-accent']}" stroke-width="4"/><path d="M24 30h16M24 38h16" stroke="${colors['on-accent']}" stroke-width="4"/>`;
    }
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${box}${inner}</svg>`);
  }

  Object.assign(ui, {applyAppearance, brandIconHtml});
})();
