/**
 * Minimalist Japanese Outdoor HUD Controller (GO OUT / Yuru Camp aesthetic).
 */
export class HUDManager {
  constructor() {
    this.el = {
      titleOverlay: document.getElementById('title-overlay'),
      loadingArea: document.getElementById('loading-area'),
      loadingBar: document.getElementById('loading-bar'),
      loadingText: document.getElementById('loading-text'),
      startBtn: document.getElementById('start-btn'),
      hud: document.getElementById('hud'),

      clock: document.getElementById('hud-clock'),
      phase: document.getElementById('hud-phase'),
      ambient: document.getElementById('hud-ambient'),
      wind: document.getElementById('hud-wind'),
      timeScale: document.getElementById('hud-timescale'),
      fps: document.getElementById('hud-fps'),
      solarAngle: document.getElementById('hud-solar-angle'),
      celestialOrb: document.getElementById('celestial-orb'),

      barWarmth: document.getElementById('bar-warmth'),
      valWarmth: document.getElementById('val-warmth'),
      barHunger: document.getElementById('bar-hunger'),
      valHunger: document.getElementById('val-hunger'),
      barCalm: document.getElementById('bar-calm'),
      valCalm: document.getElementById('val-calm'),

      reticle: document.getElementById('reticle'),
      prompt: document.getElementById('interact-prompt'),
      promptTitle: document.getElementById('prompt-title'),
      promptActions: document.getElementById('prompt-actions'),
      promptSub: document.getElementById('prompt-sub'),

      meter: document.getElementById('action-meter'),
      meterLabel: document.getElementById('action-meter-label'),
      meterFill: document.getElementById('action-meter-fill'),

      toast: document.getElementById('toast'),

      firePanel: document.getElementById('fire-telemetry'),
      fireBadge: document.getElementById('fire-state-badge'),
      fireTemp: document.getElementById('fire-temp'),
      fireO2: document.getElementById('fire-o2'),
      fireFuel: document.getElementById('fire-fuel'),

      heldName: document.getElementById('held-item-name'),
      heldHint: document.getElementById('held-hint'),

      guidePanel: document.getElementById('guide-panel'),
      questList: document.getElementById('quest-list'),
      shutterFlash: document.getElementById('shutter-flash'),
    };

    this._toastTimer = null;
    this.completedQuests = new Set();
  }

  setLoadingProgress(frac, label) {
    this.el.loadingBar.style.width = `${Math.round(frac * 100)}%`;
    this.el.loadingText.textContent = `加载 Blender 实景 PBR 资产: ${label} (${Math.round(frac * 100)}%)`;
  }

  showReady() {
    this.el.loadingArea.classList.add('hidden');
    this.el.startBtn.classList.remove('hidden');
  }

  enterGame() {
    this.el.titleOverlay.style.opacity = '0';
    setTimeout(() => this.el.titleOverlay.classList.add('hidden'), 650);
    this.el.hud.classList.remove('hidden');
  }

  showToast(msg, durationMs = 2800) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.el.toast.classList.add('hidden');
    }, durationMs);
  }

  completeQuest(key) {
    if (this.completedQuests.has(key)) return;
    this.completedQuests.add(key);
    const li = this.el.questList.querySelector(`li[data-quest="${key}"]`);
    if (li) {
      li.classList.add('done');
      li.textContent = li.textContent.replace('○', '✓');
    }
  }

  toggleGuide() {
    this.el.guidePanel.classList.toggle('hidden');
  }

  setPrompt(info) {
    if (!info) {
      this.el.reticle.classList.remove('active');
      this.el.prompt.classList.add('hidden');
      return;
    }
    this.el.reticle.classList.add('active');
    this.el.prompt.classList.remove('hidden');
    this.el.promptTitle.textContent = info.title;
    this.el.promptActions.innerHTML = info.actions
      .map((a) => `<span><kbd>${a.key}</kbd>${a.label}</span>`)
      .join('');
    this.el.promptSub.textContent = info.sub || '';
    this.el.promptSub.style.display = info.sub ? 'block' : 'none';
  }

  setActionMeter(label, progress01) {
    if (!label) {
      this.el.meter.classList.add('hidden');
      return;
    }
    this.el.meter.classList.remove('hidden');
    this.el.meterLabel.textContent = label;
    this.el.meterFill.style.width = `${Math.round(Math.min(1, Math.max(0, progress01)) * 100)}%`;
  }

  setHeldItem(name, hint = '') {
    this.el.heldName.textContent = name || '空手';
    this.el.heldHint.textContent = hint;
  }

  updateEnvironment(sky) {
    this.el.clock.textContent = sky.getClockString();
    this.el.phase.textContent = sky.getPhaseName();
    this.el.ambient.textContent = `气温 ${sky.ambientTempC.toFixed(1)}°C`;
    this.el.wind.textContent = `微风 ${sky.windSpeed.toFixed(1)} m/s`;
    this.el.timeScale.textContent = sky.timeScale === 0 ? '时间 暂停' : `时间 ×${sky.timeScale}`;

    if (this.el.solarAngle && this.el.celestialOrb) {
      const deg = sky.getSolarAngleDeg();
      const isNight = deg < -2.0;
      const sign = deg >= 0 ? '+' : '';
      this.el.solarAngle.textContent = isNight
        ? `🌙 太阳 ${sign}${deg.toFixed(1)}° · 星夜皓月`
        : `☀️ 太阳仰角 ${sign}${deg.toFixed(1)}°`;
      this.el.celestialOrb.textContent = isNight ? '🌙' : '☀️';
      const pct = ((sky.timeOfDay / 24.0) * 100).toFixed(1);
      this.el.celestialOrb.style.left = `${pct}%`;
    }
  }

  updateVitals(vitals) {
    // Warmth mapped 34.5°C .. 37.2°C
    const wPct = Math.min(100, Math.max(5, ((vitals.warmth - 34.5) / 2.7) * 100));
    this.el.barWarmth.style.width = `${wPct.toFixed(0)}%`;
    this.el.valWarmth.textContent = `${vitals.warmth.toFixed(1)}°`;

    this.el.barHunger.style.width = `${Math.round(vitals.hunger)}%`;
    this.el.valHunger.textContent = `${Math.round(vitals.hunger)}%`;

    this.el.barCalm.style.width = `${Math.round(vitals.calm)}%`;
    this.el.valCalm.textContent = `${Math.round(vitals.calm)}%`;
  }

  updateFireTelemetry(fire, distToFire) {
    if (distToFire < 5.5) {
      this.el.firePanel.classList.remove('hidden');
      this.el.fireBadge.textContent = fire.getStateLabel();
      this.el.fireTemp.textContent = `${Math.round(fire.temperature)}°C`;
      this.el.fireO2.textContent = `${Math.round(fire.oxygen * 100)}%`;
      this.el.fireFuel.textContent = `${fire.kindlingFuel.toFixed(1)} / ${fire.logFuel.toFixed(1)}`;
    } else {
      this.el.firePanel.classList.add('hidden');
    }
  }

  updateFps(fps) {
    if (this.el.fps) this.el.fps.textContent = `${fps} FPS`;
  }

  capturePhoto(renderer, sound, renderNow) {
    sound.playShutter();
    this.el.hud.classList.add('hidden');
    requestAnimationFrame(() => {
      if (renderNow) renderNow();
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `motosuko-camp-${Date.now()}.png`;
      a.click();

      this.el.hud.classList.remove('hidden');
      this.el.shutterFlash.classList.add('flash');
      setTimeout(() => this.el.shutterFlash.classList.remove('flash'), 60);
      this.showToast('📷 已保存本栖湖露营胶片明信片 (PNG)');
    });
  }
}
