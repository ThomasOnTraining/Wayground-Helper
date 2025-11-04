# Wayground-Helper
a tampermonkey script for wayground.com
  actualy using groq api for answers

copie o launch
  javascript:fetch('link-aqui').then(r=>r.text()).then(t=>{const s=document.createElement('script');s.textContent=t;document.body.appendChild(s).remove();}).catch(e=>{console.error('Falha ao carregar script:',e);alert('Falha ao carregar script.');});
