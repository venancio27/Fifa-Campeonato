// Capa da tela de cadastro: as faíscas subindo no canvas. Fica fora do HTML
// gerado por ui.js porque render() troca o innerHTML inteiro a cada jogador
// adicionado — se a animação vivesse lá, ela reiniciaria do zero toda vez.
// Aqui as partículas ficam guardadas no módulo e só o canvas (o elemento) é
// reconectado. O pombo é estático: brilho, sem movimento.

const EMBER_COLORS = ['255, 207, 77', '255, 90, 31'];

let particles = [];
let rafId = null;
let canvasEl = null;
let width = 0;
let height = 0;
let dpr = 1;
let observer = null;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resize() {
  if (!canvasEl) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = canvasEl.offsetWidth;
  height = canvasEl.offsetHeight;
  canvasEl.width = Math.round(width * dpr);
  canvasEl.height = Math.round(height * dpr);
}

function desiredCount() {
  return Math.max(10, Math.min(34, Math.floor(width / 32)));
}

// Distribui as faíscas por toda a altura logo de cara. O site da igreja solta
// todas de baixo da tela, o que funciona lá porque a capa monta uma vez só;
// aqui a capa remonta a cada cadastro e um "vazio" de 15s toda vez apareceria.
function seed() {
  particles = Array.from({ length: desiredCount() }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 1 + Math.random() * 2.2,
    speed: 0.25 + Math.random() * 0.6,
    drift: (Math.random() - 0.5) * 0.4,
    alpha: 0.15 + Math.random() * 0.5,
    color: EMBER_COLORS[Math.random() > 0.5 ? 0 : 1],
  }));
}

function frame() {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  for (const p of particles) {
    p.y -= p.speed;
    p.x += p.drift;
    if (p.y < -10) {
      p.y = height + 10;
      p.x = Math.random() * width;
    }
    ctx.beginPath();
    ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  rafId = requestAnimationFrame(frame);
}

export function stopHero() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (observer) observer.disconnect();
  observer = null;
  canvasEl = null;
}

// Chamada depois de todo render(). Se a capa não está na tela (outra fase do
// campeonato, modo telão), desliga tudo.
export function mountHero(root) {
  const canvas = root.querySelector('.hero-embers');
  if (!canvas) {
    stopHero();
    return;
  }

  if (reducedMotion()) return;

  const wasRunning = rafId !== null;
  canvasEl = canvas;
  resize();
  if (!particles.length || particles.length !== desiredCount()) seed();

  // A capa muda de altura depois do primeiro layout (o PNG do pombo ainda
  // estava carregando, a janela mudou de tamanho). Sem isso o backing store
  // fica com a altura antiga e as faíscas saem esticadas.
  if (observer) observer.disconnect();
  observer = new ResizeObserver(() => {
    resize();
    if (particles.length !== desiredCount()) seed();
  });
  observer.observe(canvas);

  if (!wasRunning) frame();
}
