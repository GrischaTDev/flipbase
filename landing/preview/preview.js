(() => {
  const motionButton = document.getElementById('motion-toggle');
  const profitScene = document.getElementById('profit-scene');
  const workflowScene = document.getElementById('workflow-scene');
  const tabList = document.querySelector('.workflow-tabs');
  const stepButtons = Array.from(tabList.querySelectorAll('[data-step]'));
  const panels = Array.from(document.querySelectorAll('.workflow-panel'));
  const replayButton = document.getElementById('workflow-replay');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileLayout = window.matchMedia('(max-width: 760px)');
  const toolScenes = Array.from(document.querySelectorAll('[data-animated-scene]'));
  const menuButton = document.getElementById('nav-menu-button');
  const header = document.querySelector('.site-header');
  const navigation = document.getElementById('landing-navigation');
  let isPaused = false;
  let hasSelectedStep = false;
  let activeStep = 0;
  let profitPhase = 3;

  function selectStep(index) {
    activeStep = index;
    stepButtons.forEach((button, buttonIndex) => {
      const isSelected = buttonIndex === index;
      button.setAttribute('aria-selected', String(isSelected));
      button.tabIndex = isSelected ? 0 : -1;
      panels[buttonIndex].hidden = !isSelected;
    });
  }

  function createCycle(element, advance, delay, canAdvance = () => true) {
    return { element, advance, delay, canAdvance, isVisible: false, timer: null };
  }

  const cycles = [
    createCycle(
      profitScene,
      () => {
        profitPhase = (profitPhase + 1) % 4;
        profitScene.dataset.phase = String(profitPhase);
      },
      1800,
    ),
    createCycle(
      workflowScene,
      () => selectStep((activeStep + 1) % panels.length),
      6500,
      () => !hasSelectedStep,
    ),
    ...toolScenes.map((scene) =>
      createCycle(
        scene,
        () => {
          scene.dataset.frame = String((Number(scene.dataset.frame) + 1) % 4);
        },
        2000,
      ),
    ),
  ];

  function syncMotion() {
    const canAnimate = !isPaused && !reducedMotion.matches && !document.hidden;
    document.documentElement.dataset.motion = canAnimate ? 'on' : 'off';
    motionButton.disabled = reducedMotion.matches;
    motionButton.setAttribute('aria-pressed', String(isPaused || reducedMotion.matches));
    motionButton.setAttribute(
      'aria-label',
      reducedMotion.matches
        ? 'Animationen durch Systemeinstellung reduziert'
        : isPaused
          ? 'Animationen fortsetzen'
          : 'Animationen pausieren',
    );
    motionButton.title = motionButton.getAttribute('aria-label');
    motionButton
      .querySelector('use')
      .setAttribute('href', isPaused || reducedMotion.matches ? '#icon-play' : '#icon-pause');

    if (reducedMotion.matches || isPaused) {
      profitPhase = 3;
      profitScene.dataset.phase = '3';
      toolScenes.forEach((scene) => {
        scene.dataset.frame = '3';
      });
    }

    cycles.forEach((cycle) => {
      const shouldRun = canAnimate && cycle.isVisible && cycle.canAdvance();
      if (!shouldRun && cycle.timer !== null) {
        window.clearInterval(cycle.timer);
        cycle.timer = null;
      } else if (shouldRun && cycle.timer === null) {
        cycle.timer = window.setInterval(cycle.advance, cycle.delay);
      }
    });
  }

  function selectManually(index) {
    hasSelectedStep = true;
    selectStep(index);
    syncMotion();
  }

  stepButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectManually(index));
    button.addEventListener('keydown', (event) => {
      let nextIndex = index;
      const nextKey = mobileLayout.matches ? 'ArrowRight' : 'ArrowDown';
      const previousKey = mobileLayout.matches ? 'ArrowLeft' : 'ArrowUp';
      if (event.key === nextKey) nextIndex = (index + 1) % stepButtons.length;
      else if (event.key === previousKey)
        nextIndex = (index + stepButtons.length - 1) % stepButtons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = stepButtons.length - 1;
      else return;
      event.preventDefault();
      selectManually(nextIndex);
      stepButtons[nextIndex].focus();
    });
  });

  // Kein automatischer Panelwechsel, während jemand mit dessen Inhalt arbeitet.
  workflowScene.addEventListener('focusin', () => {
    hasSelectedStep = true;
    syncMotion();
  });
  replayButton.addEventListener('click', () => {
    hasSelectedStep = false;
    selectStep(0);
    syncMotion();
  });
  motionButton.addEventListener('click', () => {
    isPaused = !isPaused;
    syncMotion();
  });
  document.addEventListener('visibilitychange', syncMotion);
  reducedMotion.addEventListener('change', syncMotion);
  function syncOrientation() {
    tabList.setAttribute('aria-orientation', mobileLayout.matches ? 'horizontal' : 'vertical');
  }
  mobileLayout.addEventListener('change', syncOrientation);

  function setNavigationOpen(isOpen, returnFocus = false) {
    header.classList.toggle('nav-open', isOpen);
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Menü schließen' : 'Menü öffnen');
    if (returnFocus) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    setNavigationOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  navigation.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setNavigationOpen(false));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menuButton.getAttribute('aria-expanded') !== 'true') return;
    event.preventDefault();
    setNavigationOpen(false, true);
  });
  document.addEventListener('click', (event) => {
    if (!header.contains(event.target)) setNavigationOpen(false);
  });
  header.addEventListener('focusout', (event) => {
    if (!header.contains(event.relatedTarget)) setNavigationOpen(false);
  });
  mobileLayout.addEventListener('change', () => setNavigationOpen(false));

  const cropControls = document.querySelector('.crop-controls');
  const cropButtons = Array.from(cropControls.querySelectorAll('[data-crop]'));
  cropButtons.forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById('crop-photo').dataset.ratio = button.dataset.crop;
      document.getElementById('crop-dimensions').textContent =
        button.dataset.crop === 'square' ? '1 : 1' : '4 : 5';
      cropButtons.forEach((candidate) =>
        candidate.setAttribute('aria-pressed', String(candidate === button)),
      );
    });
  });
  cropControls.hidden = false;
  menuButton.hidden = false;
  document.documentElement.dataset.enhanced = 'true';

  selectStep(0);
  syncOrientation();
  motionButton.hidden = false;
  tabList.hidden = false;
  replayButton.hidden = false;
  syncMotion();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const cycle = cycles.find((candidate) => candidate.element === entry.target);
          if (cycle) cycle.isVisible = entry.isIntersecting;
        });
        syncMotion();
      },
      { threshold: 0.25 },
    );
    cycles.forEach((cycle) => observer.observe(cycle.element));
  }
})();
