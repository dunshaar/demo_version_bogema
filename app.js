const dialogs = [...document.querySelectorAll('dialog')];
const triggers = new WeakMap();
function openDialog(dialog, trigger) {
  if (!dialog || dialog.open) return;
  triggers.set(dialog, trigger || document.activeElement);
  dialog.showModal();
  document.body.classList.add('modal-open');
}
for (const dialog of dialogs) {
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (!dialogs.some(item => item.open)) document.body.classList.remove('modal-open');
    const trigger = triggers.get(dialog);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });
}
// No header on the homepage; keep room above anchor targets.
document.body.style.setProperty('--b-navigation-inset', '24px');
// Section links use one bounded animation; reduced motion is immediate.
document.documentElement.style.scrollBehavior = 'auto';
let navigationFrame = 0;
function cancelSectionNavigation() {
  cancelAnimationFrame(navigationFrame);
  navigationFrame = 0;
}
function navigateToSection(target, hash) {
  cancelSectionNavigation();
  dispatchEvent(new Event('bogema:navigate'));
  const start = window.scrollY;
  const inset = 24;
  const end = hash === '#top' ? 0 : Math.max(0, Math.min(start + target.getBoundingClientRect().top - inset, document.documentElement.scrollHeight - innerHeight));
  const finish = () => {
    navigationFrame = 0;
    if (location.hash !== hash) history.pushState(null, '', hash);
    const focusTarget = hash === '#top' ? document.querySelector('#hero-title') : target;
    if (!focusTarget.hasAttribute('tabindex') && !focusTarget.matches('a[href]')) focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({preventScroll:true});
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(end - start) < 2) {
    window.scrollTo(0, end);
    finish();
    return;
  }
  const duration = Math.min(1000, 600 + Math.abs(end - start) / 12);
  let previousFrame, elapsed = 0;
  const step = now => {
    if (previousFrame !== undefined) elapsed += Math.min(50, Math.max(0, now - previousFrame));
    previousFrame = now;
    const progress = Math.min(1, elapsed / duration);
    window.scrollTo(0, start + (end - start) * (1 - Math.cos(Math.PI * progress)) / 2);
    if (progress < 1) navigationFrame = requestAnimationFrame(step);
    else finish();
  };
  navigationFrame = requestAnimationFrame(step);
}
document.querySelectorAll('.hero-mobile-request, .footer-up').forEach(link => link.addEventListener('click', event => {
  // Preserve browser handling of separate tabs, copied URLs and cross-page links.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
  if (link.origin !== location.origin || link.pathname !== location.pathname || link.search !== location.search || !link.hash) {
    return;
  }
  const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
  if (!target) return;
  event.preventDefault();
  navigateToSection(target, link.hash);
}));
for (const type of ['wheel', 'touchstart', 'pointerdown']) addEventListener(type, cancelSectionNavigation, {passive:true});
document.addEventListener('keydown', event => {
  if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) cancelSectionNavigation();
});

const videoDialog = document.querySelector('#video-dialog');
const video = videoDialog.querySelector('video');
const error = document.querySelector('#video-error');
const videoTitle = document.querySelector('#video-title');
const fallback = error.querySelector('.video-fallback');
const playerStatus = document.querySelector('.bp-status');
const videos = {
  promo: { title: 'Промо 2026', src: 'assets/promo.mp4', poster: 'assets/poster-promo-20261014.jpg' },
  'live-2025': { title: 'LIVE 2025 · Группа Богема', src: 'assets/live-2025.mp4', poster: 'assets/poster-live-2025.jpg' },
  'trio-live': { title: 'Live-запись · Богема', src: 'assets/trio-live.mp4', poster: 'assets/poster-trio-live.jpg' },
  'summer-rain': { title: 'Вокалист-гитарист · Летний дождь', src: 'assets/summer-rain.mp4', poster: 'assets/poster-summer-rain.jpg' },
};
let videoRequest = 0;
document.querySelectorAll('[data-video]').forEach(button => button.addEventListener('click', () => {
  const item = videos[button.dataset.video];
  if (!item) return;
  const request = ++videoRequest;
  video.pause();
  error.hidden = true;
  videoTitle.textContent = item.title;
  video.poster = item.poster;
  video.src = item.src;
  fallback.href = item.src;
  openDialog(videoDialog, button);
  video.play().catch(cause => {
    if (request !== videoRequest || !videoDialog.open || cause?.name === 'AbortError') return;
    if (video.error) error.hidden = false;
    else playerStatus.textContent = 'Нажмите кнопку воспроизведения, чтобы начать видео';
  });
}));
video.addEventListener('error', () => { if (videoDialog.open) error.hidden = false; });
video.addEventListener('playing', () => { error.hidden = true; });
fallback.addEventListener('click', () => video.pause());
videoDialog.addEventListener('close', () => {
  videoRequest++;
  if (document.fullscreenElement === video.closest('.bp-player')) document.exitFullscreen().catch(() => {});
  video.pause();
  video.removeAttribute('src');
  video.load();
  error.hidden = true;
});
