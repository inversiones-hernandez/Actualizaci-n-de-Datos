/* ==========================================================================
   INVERSIONES HERNÁNDEZ — Actualización de Datos
   script.js — JavaScript modular, sin frameworks
   ==========================================================================
   Módulos:
   1. Configuración y estado
   2. Utilidades (DOM, toast)
   3. Validadores
   4. Persistencia (localStorage)
   5. Navegación entre pasos
   6. Resumen de confirmación
   7. Envío del formulario (Google Sheets vía Apps Script)
   8. Overlays (loader, éxito, modal de imagen de ejemplo)
   9. Inicialización
   ========================================================================== */

(() => {
  'use strict';

  /* ===== 1. CONFIGURACIÓN Y ESTADO ===== */
  const TOTAL_STEPS = 5;
  const STORAGE_KEY = 'ih-actualizacion-datos';

  const GOOGLE_SHEETS_URL =
    'https://script.google.com/macros/s/AKfycby4uj5ImizniWM07vKTBwVLFwa3gppgXwkFBoEeB0Gow4EqfmZmI0D-3LSC5y154242/exec';

  const FILE_FIELD_IDS = ['fotoPerfil', 'fotoDocFrente', 'fotoDocReverso'];
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB por foto

  let currentStep = 1;

  /* ===== 2. UTILIDADES ===== */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const form = $('#updateForm');

  function showToast(message, isError = false) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('toast-error', isError);
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 3800);
  }

  function onlyDigits(str) {
    return (str || '').replace(/\D/g, '');
  }

  /* ===== 3. VALIDADORES ===== */
  const Validators = {
    required(input) {
      if (input.type === 'checkbox') return input.checked;
      if (input.type === 'file') return input.files && input.files.length > 0;
      return input.value.trim().length > 0;
    },
    imageFile(input) {
      if (!input.files || input.files.length === 0) return true; // "required" ya cubre obligatoriedad
      const file = input.files[0];
      if (!file.type.startsWith('image/')) return false;
      if (file.size > MAX_FILE_SIZE) return false;
      return true;
    },
    email(input) {
      if (!input.value) return true; // el "required" ya cubre obligatoriedad
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
    fechaNacimiento(input) {
      if (!input.value) return true;
      const fecha = new Date(input.value + 'T00:00:00');
      if (isNaN(fecha.getTime())) return false;
      const hoy = new Date();
      if (fecha > hoy) return false;
      let edad = hoy.getFullYear() - fecha.getFullYear();
      const m = hoy.getMonth() - fecha.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < fecha.getDate())) edad--;
      return edad >= 18 && edad <= 100;
    }
  };

  // Mapa de validadores adicionales por id de campo (más allá del "required" nativo)
  const FIELD_VALIDATORS = {
    correo: Validators.email,
    whatsapp: Validators.dominicanPhone,
    telefonoPrincipal: Validators.dominicanPhone,
    otroTelefono: Validators.dominicanPhone,
    documento: Validators.cedula,
    fechaNacimiento: Validators.fechaNacimiento,
    fotoPerfil: Validators.imageFile,
    fotoDocFrente: Validators.imageFile,
    fotoDocReverso: Validators.imageFile
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

    $$('input[required], select[required]', stepEl).forEach((input) => {
      if (!validateField(input)) allValid = false;
    });

    // Checkbox de consentimiento (paso 5)
    if (stepNumber === 5) {
      const consent = $('#consentimiento');
      const ok = consent.checked;
      $('#consentError').style.display = ok ? 'none' : 'block';
      if (!ok) allValid = false;
    }

    if (!allValid) showToast('Revisa los campos marcados antes de continuar.', true);
    return allValid;
  }

  /* ===== 4. PERSISTENCIA (localStorage) ===== */
  function saveToStorage() {
    try {
      const data = {};
      $$('input, select', form).forEach((el) => {
        if (el.type === 'file') return; // los archivos no se pueden guardar en localStorage
        if (el.type === 'checkbox') { data[el.name] = el.checked; return; }
        data[el.name] = el.value;
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* almacenamiento no disponible; continuar sin autoguardado */ }
  }

  function restoreFromStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.keys(data).forEach((name) => {
        const el = form.elements[name];
        if (!el || el.type === 'file') return; // los archivos no se restauran
        if (el.type === 'checkbox') { el.checked = !!data[name]; }
        else { el.value = data[name]; }
      });
    } catch (e) { /* datos corruptos o no disponibles; ignorar */ }
  }

  function clearStorage() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  /* ===== 5. NAVEGACIÓN ENTRE PASOS ===== */
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

  function prevStep() {
    goToStep(currentStep - 1);
  }

  /* ===== 6. RESUMEN DE CONFIRMACIÓN ===== */
  function renderSummary() {
    const data = new FormData(form);
    const rows = [
      ['Nombre completo', `${data.get('nombres')} ${data.get('apellidos')}`],
      ['Documento', data.get('documento')],
      ['WhatsApp', data.get('whatsapp')],
      ['Correo', data.get('correo')],
      ['Dirección', `${data.get('direccion')}, ${data.get('sector')}, ${data.get('municipio')}, ${data.get('provincia')}`],
      ['Ocupación', data.get('ocupacion')],
      ['Situación laboral', data.get('situacionLaboral')]
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

  /* ===== 7. ENVÍO DEL FORMULARIO ===== */
  function handleSubmit(e) {
    e.preventDefault();
    if (!validateStep(5)) return;

    showLoader();
    submitToGoogleSheets();
  }

  function submitToGoogleSheets() {
    // FormData se envía tal cual (multipart/form-data) para incluir las 3 fotos como archivos reales.
    const formData = new FormData(form);

    // Animación de la barra de progreso mientras se envía la solicitud
    let progress = 0;
    const bar = $('#loaderBarFill');
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + 5, 90); // se detiene en 90% hasta confirmar el envío
      bar.style.width = progress + '%';
    }, 200);

    fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script no permite leer la respuesta entre dominios;
      body: formData    // el envío en sí se confirma porque la petición se completa sin error
    })
      .then(() => {
        clearInterval(progressTimer);
        bar.style.width = '100%';
        setTimeout(finishSubmit, 300);
      })
      .catch((error) => {
        clearInterval(progressTimer);
        console.error('Error al enviar el formulario:', error);
        hideLoader();
        showToast('No se pudo enviar tu información. Verifica tu conexión e intenta de nuevo.', true);
      });
  }

  function finishSubmit() {
    hideLoader();
    showSuccess();
    clearStorage(); // se borra el borrador guardado — ya no hace falta conservarlo

    setTimeout(() => {
      hideSuccess();
      resetFormCompletely();
    }, 2200);
  }

  function resetFormCompletely() {
    form.reset();

    // Limpiar estados de validación visual
    $$('.field.invalid', form).forEach((el) => el.classList.remove('invalid'));
    $('#consentError').style.display = 'none';

    // Limpiar la vista previa de los nombres de archivo
    FILE_FIELD_IDS.forEach((id) => {
      const input = $(`#${id}`);
      if (input) updateFileNamePreview(input);
    });

    clearStorage();
    goToStep(1);
  }

  /* ===== 8. OVERLAYS ===== */
  function showLoader() { $('#loaderBarFill').style.width = '0%'; $('#loaderOverlay').hidden = false; }
  function hideLoader() { $('#loaderOverlay').hidden = true; }
  function showSuccess() { $('#successOverlay').hidden = false; }
  function hideSuccess() { $('#successOverlay').hidden = true; }
  function showImageModal() { $('#imageModal').hidden = false; }
  function hideImageModal() { $('#imageModal').hidden = true; }

  /* ===== 9. INICIALIZACIÓN ===== */
  function bindLiveValidation() {
    $$('input, select', form).forEach((el) => {
      if (el.type === 'checkbox') return;
      if (el.type === 'file') {
        el.addEventListener('change', () => {
          updateFileNamePreview(el);
          validateField(el);
        });
        return;
      }
      el.addEventListener('blur', () => validateField(el));
      el.addEventListener('input', () => {
        if (el.closest('.field.invalid')) validateField(el);
      });
    });
  }

  function updateFileNamePreview(input) {
    const nameEl = $(`#${input.id}Name`);
    const fieldEl = input.closest('.field-file');
    if (input.files && input.files.length > 0) {
      if (nameEl) nameEl.textContent = input.files[0].name;
      if (fieldEl) fieldEl.classList.add('has-file');
    } else {
      if (nameEl) nameEl.textContent = 'Ningún archivo seleccionado';
      if (fieldEl) fieldEl.classList.remove('has-file');
    }
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

    $('#viewExampleBtn').addEventListener('click', showImageModal);
    const exPhoto = $('.example-photo');
    if (exPhoto) exPhoto.addEventListener('click', showImageModal);
    $('#closeImageModal').addEventListener('click', hideImageModal);

    // Autoguardado periódico mientras el usuario escribe
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
