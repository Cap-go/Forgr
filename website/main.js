(() => {
  const video = document.getElementById('demo-video');
  if (!video) return;
  const screen = video.parentElement;
  const hide = () => screen.classList.add('no-video');

  // Fall back to the gradient frame if the demo video is missing or fails.
  video.addEventListener('error', hide, true);
  const source = video.currentSrc || video.src;
  if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) hide();
  fetch(source, { method: 'HEAD' }).then((r) => { if (!r.ok) hide(); }).catch(hide);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.removeAttribute('autoplay');
    video.pause();
    video.controls = true;
  }

  // "Watch the demo" scrolls to the phone and restarts the video.
  document.getElementById('watch-demo')?.addEventListener('click', () => {
    if (screen.classList.contains('no-video')) return;
    video.currentTime = 0;
    video.play().catch(() => {});
  });
})();
