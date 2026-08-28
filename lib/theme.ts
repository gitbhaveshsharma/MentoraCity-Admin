export const THEME_STORAGE_KEY = "mentoracity-theme";

/** Inline in <head> to avoid light flash before hydration. Default is dark. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.dataset.theme=t;r.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;
