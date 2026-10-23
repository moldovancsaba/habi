// CSS owns the breakpoint; this adapter selects behaviour without duplicating its width.
function habiMobileLayout(){return getComputedStyle(document.documentElement).getPropertyValue('--experience-layout').trim()==='mobile'}
function habiApplyShell(mobile=habiMobileLayout()){
 document.body.classList.toggle('habi2',mobile);
 document.body.dataset.layout=mobile?'mobile':'desktop';
 for(const id of ['h2-header','h2-dock','h2-status']){const el=document.getElementById(id);if(el)el.hidden=!mobile}
 const nav=document.getElementById('nav');if(nav)nav.hidden=mobile;
 const menu=document.getElementById('h2-menu');if(menu){if(!mobile&&menu.open)menu.close();menu.hidden=!mobile}
 document.getElementById('app')?.setAttribute('aria-live',mobile?'off':'polite');
 return mobile;
}
habiApplyShell();
