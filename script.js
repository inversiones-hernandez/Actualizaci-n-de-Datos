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
   7. Construcción del mensaje de WhatsApp
   8. Envío del formulario
   9. Overlays (loader, éxito, aviso, modal de imagen de ejemplo)
   10. Inicialización
   ========================================================================== */

(() => {
  'use strict';

  /* ===== 1. CONFIGURACIÓN Y ESTADO ===== */
const TOTAL_STEPS = 5;
const STORAGE_KEY = 'ih-actualizacion-datos';

const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwUPIOr05G-XfOMHkdw6mHoLxdAXazK-4-r-fdfTcEsOzj0yOIUuotj66l1acPplWoQ/exec';

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
      return input.value.trim().length > 0;
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
    fechaNacimiento: Validators.fechaNacimiento
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
        if (!el) return;
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

  /* ===== 7. MENSAJE DE WHATSAPP ===== */
  function buildWhatsappMessage() {
    const d = new FormData(form);
    const g = (name) => d.get(name) || '—';
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-DO');
    const hora = ahora.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    const linea = '━━━━━━━━━━━━━━━━━━━━━━';

    return [
      linea,
      '🏦 INVERSIONES HERNÁNDEZ RD',
      'ACTUALIZACIÓN DE DATOS',
      linea,
      '👤 DATOS PERSONALES',
      `Nombres: ${g('nombres')}`,
      `Apellidos: ${g('apellidos')}`,
      `WhatsApp: ${g('whatsapp')}`,
      `Apodo: ${g('apodo')}`,
      `Documento: ${g('documento')}`,
      `Nacionalidad: ${g('nacionalidad')}`,
      `Fecha nacimiento: ${g('fechaNacimiento')}`,
      `Sexo: ${g('sexo')}`,
      `Estado civil: ${g('estadoCivil')}`,
      linea,
      '📞 CONTACTO',
      `Teléfono principal: ${g('telefonoPrincipal')}`,
      `Otro teléfono: ${g('otroTelefono')}`,
      `Correo: ${g('correo')}`,
      `Dirección: ${g('direccion')}`,
      `Provincia: ${g('provincia')}`,
      `Municipio: ${g('municipio')}`,
      `Sector: ${g('sector')}`,
      linea,
      '💼 INFORMACIÓN LABORAL',
      `Lugar de trabajo: ${g('lugarTrabajo')}`,
      `Dirección de trabajo: ${g('direccionTrabajo')}`,
      `Ocupación: ${g('ocupacion')}`,
      `Ingresos: RD$ ${g('ingresos')}`,
      `Situación laboral: ${g('situacionLaboral')}`,
      linea,
      '📸 DOCUMENTOS (enviar como fotos adjuntas en este chat)',
      '1. Foto de perfil, sosteniendo el documento de identidad.',
      '2. Foto del documento de identidad (frontal).',
      '3. Foto del documento de identidad (reverso).',
      linea,
      `Fecha de envío: ${fecha}`,
      `Hora: ${hora}`,
      '',
      'Enviado desde la Plataforma Oficial de Inversiones Hernández.'
    ].join('\n');
  }

  /* ===== 8. ENVÍO DEL FORMULARIO ===== */
  function handleSubmit(e) {
    e.preventDefault();
    if (!validateStep(5)) return;

    showLoader();

    let progress = 0;
    const bar = $('#loaderBarFill');
    const interval = setInterval(() => {
      progress = Math.min(progress + 18, 100);
      bar.style.width = progress + '%';
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(finishSubmit, 300);
      }
    }, 180);
  }

async function finishSubmit() {

  // Tomamos todos los datos del formulario
  const datos = new FormData(form);

  try {

    // Enviar datos directamente a Google Apps Script
    await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: new URLSearchParams(datos)
    });

    // Mostrar confirmación
    hideLoader();
    showSuccess();
    clearStorage();

    setTimeout(() => {
      hideSuccess();
      resetFormCompletely();
    }, 1800);

  } catch (error) {

    console.error('Error enviando los datos:', error);

    hideLoader();

    showToast(
      'No pudimos enviar la información. Inténtalo nuevamente.',
      true
    );
  }
}

  function resetFormCompletely() {
    form.reset();

    // Limpiar estados de validación visual
    $$('.field.invalid', form).forEach((el) => el.classList.remove('invalid'));
    $('#consentError').style.display = 'none';

    clearStorage();
    goToStep(1);
  }

  /* ===== 9. OVERLAYS ===== */
  function showLoader() { $('#loaderBarFill').style.width = '0%'; $('#loaderOverlay').hidden = false; }
  function hideLoader() { $('#loaderOverlay').hidden = true; }
  function showSuccess() { $('#successOverlay').hidden = false; }
  function hideSuccess() { $('#successOverlay').hidden = true; }
  function showWhatsappNotice() { $('#whatsappNotice').hidden = false; }
  function hideWhatsappNotice() { $('#whatsappNotice').hidden = true; }
  function showImageModal() { $('#imageModal').hidden = false; }
  function hideImageModal() { $('#imageModal').hidden = true; }

  /* ===== 10. INICIALIZACIÓN ===== */
  function bindLiveValidation() {
    $$('input, select', form).forEach((el) => {
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

    $('#viewExampleBtn').addEventListener('click', showImageModal);
    const exPhoto = $('.example-photo');
    if (exPhoto) exPhoto.addEventListener('click', showImageModal);
    $('#closeImageModal').addEventListener('click', hideImageModal);
    $('#closeWhatsappNotice').addEventListener('click', hideWhatsappNotice);

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
