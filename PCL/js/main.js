document.addEventListener('DOMContentLoaded',()=>{
  const enter = document.getElementById('enterBtn');
  const overlay = document.getElementById('portalOverlay');
  const close = document.getElementById('closeOverlay');
  const scene = document.querySelector('.scene');

  enter.addEventListener('click',()=>{
    // Visual portal open animation (demo only)
    overlay.classList.remove('hidden');
    overlay.querySelector('.portal-ring').classList.add('active');
  });

  close.addEventListener('click',()=>{
    overlay.classList.add('hidden');
  });

  // Subtle parallax for depth
  let lastMove=0;
  window.addEventListener('mousemove',(e)=>{
    const now = Date.now();
    if(now-lastMove<16) return; lastMove=now;
    const cx = window.innerWidth/2;
    const cy = window.innerHeight/2;
    const dx = (e.clientX-cx)/cx;
    const dy = (e.clientY-cy)/cy;
    const bg = document.querySelector('.bg');
    bg.style.transform = `translate(${dx*6}px, ${dy*6}px) scale(1.02)`;
    scene.setAttribute('data-move','true');
  });
});
