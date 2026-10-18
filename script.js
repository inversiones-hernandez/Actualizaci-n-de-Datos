(() => {
 const root=document.documentElement,theme=document.getElementById('theme');
 const apply=dark=>{root.dataset.theme=dark?'dark':'light';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'Activar modo claro':'Activar modo oscuro');};
 try{apply(localStorage.getItem('ih-portal-theme')==='dark');}catch{apply(false);}
 theme.addEventListener('click',()=>{const dark=root.dataset.theme!=='dark';apply(dark);try{localStorage.setItem('ih-portal-theme',dark?'dark':'light');}catch{}});
 const toggle=document.getElementById('menu-toggle'),nav=document.getElementById('navigation');
 const close=()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menú');};
 toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';nav.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');});
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=toggle.getAttribute('aria-expanded')==='true';close();if(open)toggle.focus();}});
 window.addEventListener('resize',()=>{if(window.innerWidth>980)close();});
 document.getElementById('year').textContent=new Date().getFullYear();
})();

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
    'https://script.google.com/macros/s/AKfycbzb8OjrfWKerZ2TxamzaIDaBGsVlvtSUUEWFYjwc40Z4gNGaxUQIy7cY1Vp-7a1HfiyxQ/exec';

  const FILE_FIELD_IDS = ['fotoPerfil', 'fotoDocFrente', 'fotoDocReverso'];
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB por foto

  let currentStep = 1;
  let mapa = null;
  let marcador = null;
  const UBICACION_INICIAL = [18.4861, -69.9312]; // Santo Domingo, RD (centro por defecto)

  /* ===== 2. UTILIDADES ===== */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const form = $('#updateForm');
  if (!form) return;

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
    fotoDocReverso: Validators.imageFile,
    rnc: input => !input.value || /^(?:[0-9]{9}|[0-9]{11})$/.test(onlyDigits(input.value))
  };

  function validateField(input) {
    const fieldEl = input.closest('.field');
    let valid = !input.required || Validators.required(input);
    if (valid && input.type !== 'file' && input.type !== 'hidden') valid = input.checkValidity();
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

    $$('input:not([type=hidden]):not([type=file]), select, input[required][type=file]', stepEl).forEach((input) => {
      if (!validateField(input)) allValid = false;
    });

    // Checkbox de consentimiento (paso 5)
    if (stepNumber === 5) {
      const consent = $('#consentimiento');
      const ok = consent.checked;
      $('#consentError').style.display = ok ? 'none' : 'block';
      if (!ok) allValid = false;
    }

    // Mapa de ubicación (paso 2)
    if (stepNumber === 4) {
      const tieneCoordenadas = $('#latitud').value !== '' && $('#longitud').value !== '' && $('#latitud').checkValidity() && $('#longitud').checkValidity();
      $('#mapaError').style.display = tieneCoordenadas ? 'none' : 'block';
      $('#mapaUbicacion').classList.toggle('invalid', !tieneCoordenadas);
      if (!tieneCoordenadas) allValid = false;
    }

    if (stepNumber === 4) {
      const signed = !!$('#firmaBase64').value;
      $('#firmaError').style.display = signed ? 'none' : 'block';
      if (!signed) allValid = false;
    }
    if (!allValid) showToast('Revisa los campos marcados antes de continuar.', true);
    return allValid;
  }

  /* ===== 4. PERSISTENCIA (localStorage) ===== */
  function saveToStorage() {
    try {
      const data = {};
      $$('input, select', form).forEach((el) => {
        if (el.type === 'file' || el.id === 'firmaBase64' || el.type === 'checkbox' || !el.name) return;
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
        if (!el || el.type === 'file' || el.id === 'firmaBase64' || el.type === 'checkbox') return;
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
    if (step === 4) setTimeout(initMapa, 50); // dar tiempo a que el paso sea visible antes de dibujar el mapa

    $('#formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ===== MAPA DE UBICACIÓN ===== */
  function initMapa() {
    if (typeof L === 'undefined') { $('#mapCoordsPreview').textContent = 'El mapa no está disponible. Puedes escribir las coordenadas o usar tu ubicación actual.'; return; }
    if (!mapa) {
      mapa = L.map('mapaUbicacion', { zoomControl: true }).setView(UBICACION_INICIAL, 8);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(mapa);

      marcador = L.marker(UBICACION_INICIAL, { draggable: true }).addTo(mapa);

      marcador.on('dragend', actualizarCoordenadas);
      mapa.on('click', (e) => {
        marcador.setLatLng(e.latlng);
        actualizarCoordenadas();
      });


    }

    syncCoordinates();
    setTimeout(() => mapa.invalidateSize(), 60); // corrige el render si el mapa estaba oculto
  }

  function actualizarCoordenadas() {
    const pos = marcador.getLatLng();
    $('#latitud').value = pos.lat.toFixed(6);
    $('#longitud').value = pos.lng.toFixed(6);

    $('#mapaError').style.display = 'none';
    $('#mapaUbicacion').classList.remove('invalid');

    const preview = $('#mapCoordsPreview');
    preview.textContent = `📍 Ubicación seleccionada: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
    preview.classList.add('has-coords');
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
      ["Nombre completo",`${data.get('nombres')} ${data.get('apellidos')}`],
      ["Apodo",data.get('apodo')],
      ["WhatsApp",data.get('whatsapp')],
      ["Documento",data.get('documento')],
      ["Nacionalidad",data.get('nacionalidad')],
      ["Fecha de nacimiento",data.get('fechaNacimiento')],
      ["Sexo",data.get('sexo')],
      ["Estado civil",data.get('estadoCivil')],
      ["Teléfono principal",data.get('telefonoPrincipal')],
      ["Otro teléfono",data.get('otroTelefono')],
      ["Correo",data.get('correo')],
      ["RNC",data.get('rnc')],
      ["Dirección",`${data.get('direccion')}, ${data.get('sector')}, ${data.get('municipio')}, ${data.get('provincia')}`],
      ["Ruta de cobro / entrega",data.get('rutaCobro')],
      ["Lugar de trabajo",data.get('lugarTrabajo')],
      ["Dirección del trabajo",data.get('direccionTrabajo')],
      ["Ocupación",data.get('ocupacion')],
      ["Ingresos mensuales (RD$)",data.get('ingresos')],
      ["Situación laboral",data.get('situacionLaboral')],
      ["Vivienda",data.get('vivienda')],
      ["Dependientes",data.get('dependientes')],
      ["Latitud",data.get('latitud')],
      ["Longitud",data.get('longitud')],
      ["Firma del cliente",data.get('firmaBase64') ? 'Agregada' : 'Pendiente']
    ];
    $('#summaryBox').innerHTML = rows
      .map(([label, value]) => `<div><strong>${label}:</strong> ${escapeHtml(String(value === null || value === '' ? '—' : value))}</div>`)
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
    for (let n=1; n<5; n++) { if (!validateStep(n)) { goToStep(n); return; } }
    if ($('#sitioWeb').value) { showToast('No se pudo procesar el formulario.', true); return; }
    if ($('#submitBtn').disabled) return; // evita doble envío por doble clic

    $('#submitBtn').disabled = true;
    showLoader();
    submitToGoogleSheets();
  }

  function submitToGoogleSheets() {
    // Animación de la barra de progreso mientras se preparan y envían los datos
    let progress = 0;
    const bar = $('#loaderBarFill');
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + 4, 85); // se detiene en 85% hasta confirmar el envío
      bar.style.width = progress + '%';
    }, 200);

    convertirFormularioAParametros()
      .then((params) => {
        return fetch(GOOGLE_SHEETS_URL, {
          method: 'POST',
          mode: 'no-cors', // Apps Script no permite leer la respuesta entre dominios;
          body: params      // respuesta opaca: la recepción y el guardado deben confirmarse en el servidor
        });
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
        $('#submitBtn').disabled = false; // reactivar para que pueda reintentar
        showToast('No se pudo enviar tu información. Verifica tu conexión e intenta de nuevo.', true);
      });
  }

  // Convierte todos los campos del formulario a un URLSearchParams de texto plano.
  // Las 3 fotos se leen como base64 y se envían como texto (campo + "Base64",
  // + "Nombre", + "Tipo"), porque Apps Script no procesa de forma confiable
  // archivos reales enviados como multipart/form-data desde fetch con no-cors.
  function convertirFormularioAParametros() {
    const params = new URLSearchParams();
    const formData = new FormData(form);

    for (const [key, value] of formData.entries()) {
      const el = form.elements[key];
      if (el && el.type === 'file') continue; // los archivos se agregan aparte, como base64
      params.append(key, value);
    }

    const lecturas = FILE_FIELD_IDS.map((fieldId) => {
      const input = $(`#${fieldId}`);
      if (!input || !input.files || !input.files[0]) return Promise.resolve();
      return leerArchivoComoBase64(input.files[0]).then((base64) => {
        params.append(fieldId + 'Base64', base64);
        params.append(fieldId + 'Nombre', input.files[0].name);
        params.append(fieldId + 'Tipo', input.files[0].type || 'image/jpeg');
      });
    });

    return Promise.all(lecturas).then(() => params);
  }

  function leerArchivoComoBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const resultado = reader.result; // "data:image/png;base64,AAAA..."
        resolve(String(resultado).split(',')[1] || '');
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  function finishSubmit() {
    hideLoader();
    showSuccess();
    clearStorage(); // se borra el borrador guardado — ya no hace falta conservarlo


  }

  function resetFormCompletely() {
    form.reset();
    clearSignature();

    // Limpiar estados de validación visual
    $$('.field.invalid', form).forEach((el) => el.classList.remove('invalid'));
    $('#consentError').style.display = 'none';

    // Limpiar la vista previa de los nombres de archivo
    FILE_FIELD_IDS.forEach((id) => {
      const input = $(`#${id}`);
      if (input) updateFileNamePreview(input);
    });

    clearStorage();
    $('#submitBtn').disabled = false; // reactivar para una posible próxima solicitud
    goToStep(1);
  }

  /* ===== 8. OVERLAYS ===== */
  function showLoader() { $('#loaderBarFill').style.width = '0%'; $('#loaderOverlay').hidden = false; }
  function hideLoader() { $('#loaderOverlay').hidden = true; }
  function showSuccess() { $('#successOverlay').hidden = false; }
  function hideSuccess() { $('#successOverlay').hidden = true; }
  function showImageModal() { $('#imageModal').hidden = false; }
  function hideImageModal() { $('#imageModal').hidden = true; }


  function syncCoordinates() {
    const lat=$('#latitud'),lng=$('#longitud');
    if (lat.value==='' || lng.value==='' || !lat.checkValidity() || !lng.checkValidity()) return;
    const point=[Number(lat.value),Number(lng.value)];
    if (mapa && marcador) { marcador.setLatLng(point); mapa.panTo(point); }
    $('#mapCoordsPreview').textContent=`Ubicación seleccionada: ${point[0]}, ${point[1]}`;
    $('#mapaError').style.display='none';
    $('#mapaUbicacion').classList.remove('invalid');
  }
  function locateClient() {
    if (!navigator.geolocation) { showToast('Este navegador no permite obtener la ubicación. Escribe las coordenadas.',true); return; }
    const button=$('#locateBtn');button.disabled=true;
    navigator.geolocation.getCurrentPosition(pos=>{
      button.disabled=false;
      $('#latitud').value=pos.coords.latitude.toFixed(6);
      $('#longitud').value=pos.coords.longitude.toFixed(6);
      syncCoordinates();if(mapa)mapa.setZoom(16);saveToStorage();
    },()=>{button.disabled=false;showToast('No se pudo obtener la ubicación. Puedes marcarla en el mapa o escribirla.',true);},{timeout:10000,maximumAge:0});
  }
  let signatureCanvas, signatureContext;
  function clearSignature() {
    signatureContext.clearRect(0,0,signatureCanvas.width,signatureCanvas.height);
    $('#firmaBase64').value='';$('#firmaImagen').value='';
    $('#firmaStatus').textContent='Aún no has agregado una firma.';
  }
  function saveSignature() {
    $('#firmaBase64').value=signatureCanvas.toDataURL('image/png').split(',')[1];
    $('#firmaError').style.display='none';$('#firmaStatus').textContent='Firma agregada.';
  }
  function initSignature() {
    signatureCanvas=$('#firmaCanvas');signatureCanvas.width=1000;signatureCanvas.height=350;
    signatureContext=signatureCanvas.getContext('2d');
    signatureContext.lineWidth=3;signatureContext.lineCap='round';signatureContext.strokeStyle='#061449';
    let active=null;
    const point=e=>{const r=signatureCanvas.getBoundingClientRect();return [(e.clientX-r.left)*1000/r.width,(e.clientY-r.top)*350/r.height];};
    signatureCanvas.addEventListener('pointerdown',e=>{if(active!==null)return;e.preventDefault();active=e.pointerId;signatureCanvas.setPointerCapture(e.pointerId);$('#firmaImagen').value='';const [x,y]=point(e);signatureContext.beginPath();signatureContext.moveTo(x,y);signatureContext.lineTo(x+.1,y+.1);signatureContext.stroke();saveSignature();});
    signatureCanvas.addEventListener('pointermove',e=>{if(active!==e.pointerId)return;e.preventDefault();signatureContext.lineTo(...point(e));signatureContext.stroke();});
    const finish=e=>{if(active!==e.pointerId)return;active=null;saveSignature();};
    signatureCanvas.addEventListener('pointerup',finish);signatureCanvas.addEventListener('pointercancel',finish);signatureCanvas.addEventListener('lostpointercapture',finish);
    $('#clearSignature').addEventListener('click',clearSignature);
    $('#firmaImagen').addEventListener('change',e=>{
      const file=e.target.files[0];if(!file)return;
      if(!['image/jpeg','image/png'].includes(file.type)||file.size>2*1024*1024){e.target.value='';showToast('La firma debe ser JPG o PNG de hasta 2 MB.',true);return;}
      const reader=new FileReader();reader.onerror=()=>showToast('No se pudo abrir la firma.',true);
      reader.onload=()=>{const img=new Image();img.onerror=()=>showToast('La imagen de firma no es válida.',true);img.onload=()=>{signatureContext.clearRect(0,0,1000,350);const scale=Math.min(1000/img.width,350/img.height);const w=img.width*scale,h=img.height*scale;signatureContext.drawImage(img,(1000-w)/2,(350-h)/2,w,h);saveSignature();};img.src=reader.result;};reader.readAsDataURL(file);
    });
  }

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

    initSignature();
    $('#latitud').addEventListener('input', syncCoordinates);
    $('#longitud').addEventListener('input', syncCoordinates);
    $('#locateBtn').addEventListener('click', locateClient);
    $('#closeSuccess').addEventListener('click', () => { hideSuccess(); resetFormCompletely(); });
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

