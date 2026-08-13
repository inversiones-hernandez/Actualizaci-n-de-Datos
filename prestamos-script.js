/* ==========================================================================
   INVERSIONES HERNÁNDEZ — Solicitud de Préstamo
   prestamos-script.js
   ========================================================================== */

(() => {
  'use strict';

  const TOTAL_STEPS = 3;
  const STORAGE_KEY = 'ih-solicitud-prestamo';

  // Misma URL de Apps Script que usa el formulario de actualización de datos.
  // El campo oculto "tipoFormulario" (agregado abajo al enviar) le dice al
  // script del lado del servidor a qué hoja y con qué correo debe procesar esto.
  const GOOGLE_SHEETS_URL =
    'https://script.google.com/macros/s/AKfycbzvRV8T7L-MaPk2UMhagckjDh2LUZ_ILWpxFRe9W-bDMUE7P8geBEmiExNQgs8Upgt8/exec';

  let currentStep = 1;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const form = $('#loanForm');

  function showToast(message, isError = false) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('toast-error', isError);
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 3800);
  }

  function onlyDigits(str) { return (str || '').replace(/\D/g, ''); }

  const Validators = {
    required(input) {
      if (input.type === 'checkbox') return input.checked;
      return input.value.trim().length > 0;
    },
    email(input) {
      if (!input.value) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    },
    dominicanPhone(input) {
      if (!input.value) return true;
      const digits = onlyDigits(input.value);
      return /^(809|829|849)\d{7}$/.test(digits);
    },
    cedula(input) {
      if (!input.value) return true;
      const digits = onlyDigits(input.value);
      return digits.length === 11;
    },
    positiveNumber(input) {
      if (!input.value) return true;
      return Number(input.value) > 0;
    }
  };

  const FIELD_VALIDATORS = {
    correo: Validators.email,
    whatsapp: Validators.dominicanPhone,
    referenciaTelefono: Validators.dominicanPhone,
    documento: Validators.cedula,
    ingresoMensual: Validators.positiveNumber,
    montoSolicitado: Validators.positiveNumber,
    plazoMeses: Validators.positiveNumber,
    cuotaPago: Validators.positiveNumber
  };

  function validateField(input) {
    const fieldEl = input.closest('.field');
    let valid = Validators.required(input);
    if (valid && FIELD_VALIDATORS[input.id]) {
      valid = FIELD_VALIDATORS[input.id](input);
    }
    if (fieldEl) fieldEl.classList.toggle('invalid', !valid);
    return valid;
  }

  function validateStep(stepNumber) {
    const stepEl = $(`.step[data-step="${stepNumber}"]`);
    if (!stepEl) return true;
    let allValid = true;

    $$('input[required], select[required], textarea[required]', stepEl).forEach((input) => {
      if (!validateField(input)) allValid = false;
    });

    if (stepNumber === 3) {
      const consent = $('#consentimiento');
      const ok = consent.checked;
      $('#consentError').style.display = ok ? 'none' : 'block';
      if (!ok) allValid = false;
    }

    if (!allValid) showToast('Revisa los campos marcados antes de continuar.', true);
    return allValid;
  }

  function saveToStorage() {
    try {
      const data = {};
      $$('input, select, textarea', form).forEach((el) => {
        if (el.type === 'checkbox') { data[el.name] = el.checked; return; }
        data[el.name] = el.value;
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function restoreFromStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.keys(data).forEach((name) => {
        const el = form.elements[name];
        if (!el) return;
        if (el.type === 'checkbox') { el.checked = !!data[name]; }
        else { el.value = data[name]; }
      });
    } catch (e) {}
  }

  function clearStorage() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    currentStep = step;

    $$('.step').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) === step));
    $$('.progress-step').forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.toggle('active', n === step);
      el.classList.toggle('done', n < step);
    });

    $('#progressFill').style.width = `${(step / TOTAL_STEPS) * 100}%`;
    $('#stepCurrent').textContent = step;
    $('#prevBtn').disabled = step === 1;
    $('#nextBtn').hidden = step === TOTAL_STEPS;
    $('#submitBtn').style.display = step === TOTAL_STEPS ? 'inline-flex' : 'none';
    $('#nextBtnLabel').textContent = step === TOTAL_STEPS - 1 ? 'Paso final' : 'Siguiente';

    if (step === TOTAL_STEPS) renderSummary();

    $('#formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function nextStep() {
    if (!validateStep(currentStep)) return;
    saveToStorage();
    goToStep(currentStep + 1);
  }

  function prevStep() { goToStep(currentStep - 1); }

  function renderSummary() {
    const data = new FormData(form);
    const rows = [
      ['Nombre completo', `${data.get('nombres')} ${data.get('apellidos')}`],
      ['Cédula', data.get('documento')],
      ['WhatsApp', data.get('whatsapp')],
      ['Monto solicitado', `RD$ ${data.get('montoSolicitado') || '—'}`],
      ['Plazo', `${data.get('plazoMeses') || '—'} meses`],
      ['Cuota mensual', `RD$ ${data.get('cuotaPago') || '—'}`],
      ['Motivo', data.get('motivo')]
    ];
    $('#summaryBox').innerHTML = rows
      .map(([label, value]) => `<div><strong>${label}:</strong> ${escapeHtml(String(value || '—'))}</div>`)
      .join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validateStep(3)) return;
    if ($('#submitBtn').disabled) return; // evita doble envío por doble clic

    $('#submitBtn').disabled = true;
    showLoader();
    submitToGoogleSheets();
  }

  function submitToGoogleSheets() {
    const formData = new FormData(form);
    const params = new URLSearchParams();
    formData.forEach((value, key) => params.append(key, value));
    params.append('tipoFormulario', 'prestamo'); // le indica a Apps Script qué flujo usar

    let progress = 0;
    const bar = $('#loaderBarFill');
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + 8, 90);
      bar.style.width = progress + '%';
    }, 150);

    fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: params
    })
      .then(() => {
        clearInterval(progressTimer);
        bar.style.width = '100%';
        setTimeout(finishSubmit, 300);
      })
      .catch((error) => {
        clearInterval(progressTimer);
        console.error('Error al enviar la solicitud:', error);
        hideLoader();
        $('#submitBtn').disabled = false; // reactivar para que pueda reintentar
        showToast('No se pudo enviar tu solicitud. Verifica tu conexión e intenta de nuevo.', true);
      });
  }

  function finishSubmit() {
    hideLoader();
    showSuccess();
    clearStorage();
    setTimeout(() => {
      hideSuccess();
      resetFormCompletely();
    }, 2200);
  }

  function resetFormCompletely() {
    form.reset();
    $$('.field.invalid', form).forEach((el) => el.classList.remove('invalid'));
    $('#consentError').style.display = 'none';
    clearStorage();
    $('#submitBtn').disabled = false; // reactivar para una posible próxima solicitud
    goToStep(1);
  }

  function showLoader() { $('#loaderBarFill').style.width = '0%'; $('#loaderOverlay').hidden = false; }
  function hideLoader() { $('#loaderOverlay').hidden = true; }
  function showSuccess() { $('#successOverlay').hidden = false; }
  function hideSuccess() { $('#successOverlay').hidden = true; }

  function bindLiveValidation() {
    $$('input, select, textarea', form).forEach((el) => {
      if (el.type === 'checkbox') return;
      el.addEventListener('blur', () => validateField(el));
      el.addEventListener('input', () => {
        if (el.closest('.field.invalid')) validateField(el);
      });
    });
  }

  function init() {
    restoreFromStorage();
    bindLiveValidation();

    $('#startBtn').addEventListener('click', () => {
      $('#formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#nextBtn').addEventListener('click', nextStep);
    $('#prevBtn').addEventListener('click', prevStep);
    form.addEventListener('submit', handleSubmit);

    form.addEventListener('input', debounce(saveToStorage, 500));

    goToStep(1);
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
