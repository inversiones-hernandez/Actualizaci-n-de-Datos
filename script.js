/* =========================================================
   INVERSIONES HERNÁNDEZ RD
   Portal de clientes — script.js actualizado
   ========================================================= */

(() => {
  "use strict";

  function iniciarPortal() {
    const root = document.documentElement;
    const theme = document.getElementById("theme");
    const toggle = document.getElementById("menu-toggle");
    const navigation = document.getElementById("navigation");
    const year = document.getElementById("year");

    function aplicarTema(oscuro) {
      root.dataset.theme = oscuro ? "dark" : "light";

      if (theme) {
        theme.setAttribute("aria-pressed", String(oscuro));
        theme.setAttribute(
          "aria-label",
          oscuro ? "Activar modo claro" : "Activar modo oscuro"
        );
      }
    }

    try {
      aplicarTema(
        localStorage.getItem("ih-portal-theme") === "dark"
      );
    } catch {
      aplicarTema(false);
    }

    if (theme) {
      theme.addEventListener("click", () => {
        const oscuro = root.dataset.theme !== "dark";

        aplicarTema(oscuro);

        try {
          localStorage.setItem(
            "ih-portal-theme",
            oscuro ? "dark" : "light"
          );
        } catch {}
      });
    }

    if (toggle && navigation) {
      function cerrarMenu() {
        navigation.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menú");
      }

      toggle.addEventListener("click", () => {
        const abierto =
          toggle.getAttribute("aria-expanded") !== "true";

        navigation.classList.toggle("open", abierto);

        toggle.setAttribute(
          "aria-expanded",
          String(abierto)
        );

        toggle.setAttribute(
          "aria-label",
          abierto ? "Cerrar menú" : "Abrir menú"
        );
      });

      navigation.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", cerrarMenu);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        const abierto =
          toggle.getAttribute("aria-expanded") === "true";

        cerrarMenu();

        if (abierto) toggle.focus();
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > 980) cerrarMenu();
      });
    }

    if (year) {
      year.textContent = new Date().getFullYear();
    }

    iniciarFormulario();
  }

  function iniciarFormulario() {
    const $ = (selector, context = document) =>
      context.querySelector(selector);

    const $$ = (selector, context = document) =>
      Array.from(context.querySelectorAll(selector));

    const form = $("#updateForm");

    if (!form) return;

    /* CONFIGURACIÓN */

    const GOOGLE_SHEETS_URL =
      "https://script.google.com/macros/s/AKfycbzb8OjrfWKerZ2TxamzaIDaBGsVlvtSUUEWFYjwc40Z4gNGaxUQIy7cY1Vp-7a1HfiyxQ/exec";

    const TOTAL_STEPS = 5;
    const STORAGE_KEY = "ih-actualizacion-datos";
    const PENDING_KEY = "ih-envio-pendiente";

    const FILE_FIELD_IDS = [
      "fotoPerfil",
      "fotoDocFrente",
      "fotoDocReverso"
    ];

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;

    const UBICACION_INICIAL = [18.4861, -69.9312];

    let currentStep = 1;
    let mapa = null;
    let marcador = null;
    let signatureCanvas = null;
    let signatureContext = null;
    let uploadingSignature = false;

    /* UTILIDADES */

    function showToast(message, isError = false) {
      const toast = $("#toast");

      if (!toast) {
        console.error(message);
        return;
      }

      toast.textContent = message;
      toast.classList.toggle("toast-error", isError);
      toast.hidden = false;

      clearTimeout(showToast.timer);

      showToast.timer = setTimeout(() => {
        toast.hidden = true;
      }, isError ? 12000 : 4000);
    }

    function onlyDigits(value) {
      return String(value || "").replace(/\D/g, "");
    }

    function escapeHtml(value) {
      const element = document.createElement("div");
      element.textContent = String(value);
      return element.innerHTML;
    }

    function debounce(callback, wait) {
      let timer;

      return (...args) => {
        clearTimeout(timer);

        timer = setTimeout(() => {
          callback(...args);
        }, wait);
      };
    }

    function setVisibleError(selector, visible) {
      const element = $(selector);

      if (element) {
        element.style.display = visible ? "block" : "none";
      }
    }

    /* VALIDACIÓN */

    const Validators = {
      required(input) {
        if (input.type === "checkbox") {
          return input.checked;
        }

        if (input.type === "file") {
          return Boolean(input.files && input.files.length);
        }

        return input.value.trim().length > 0;
      },

      imageFile(input) {
        if (!input.files || !input.files.length) return true;

        const file = input.files[0];

        return (
          ["image/jpeg", "image/png"].includes(file.type) &&
          file.size <= MAX_FILE_SIZE
        );
      },

      email(input) {
        if (!input.value) return true;

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          input.value.trim()
        );
      },

      dominicanPhone(input) {
        if (!input.value) return true;

        const digits = onlyDigits(input.value).replace(
          /^1(?=\d{10}$)/,
          ""
        );

        return /^(809|829|849)\d{7}$/.test(digits);
      },

      cedula(input) {
        if (!input.value) return true;

        return /^\d{11}$/.test(
          onlyDigits(input.value)
        );
      },

      fechaNacimiento(input) {
        if (!input.value) return true;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
          return false;
        }

        const [year, month, day] = input.value
          .split("-")
          .map(Number);

        const date = new Date(year, month - 1, day);
        const today = new Date();

        if (
          date.getFullYear() !== year ||
          date.getMonth() !== month - 1 ||
          date.getDate() !== day ||
          date > today
        ) {
          return false;
        }

        let age = today.getFullYear() - year;
        const monthDifference = today.getMonth() - (month - 1);

        if (
          monthDifference < 0 ||
          (
            monthDifference === 0 &&
            today.getDate() < day
          )
        ) {
          age--;
        }

        return age >= 18 && age <= 100;
      }
    };

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

      rnc(input) {
        return (
          !input.value ||
          /^(?:\d{9}|\d{11})$/.test(
            onlyDigits(input.value)
          )
        );
      }
    };

    function validateField(input) {
      const field = input.closest(".field");

      let valid =
        !input.required || Validators.required(input);

      if (
        valid &&
        input.type !== "file" &&
        input.type !== "hidden"
      ) {
        valid = input.checkValidity();
      }

      if (valid && FIELD_VALIDATORS[input.id]) {
        valid = FIELD_VALIDATORS[input.id](input);
      }

      if (field) {
        field.classList.toggle("invalid", !valid);
      }

      return valid;
    }

    function validateStep(stepNumber) {
      const step = $(
        `.step[data-step="${stepNumber}"]`
      );

      if (!step) return true;

      let valid = true;

      $$(
        "input:not([type=hidden]):not([type=file]), " +
        "select, textarea, input[required][type=file]",
        step
      ).forEach((input) => {
        if (!validateField(input)) valid = false;
      });

      if (stepNumber === 4) {
        const latitude = $("#latitud");
        const longitude = $("#longitud");

        const coordinatesValid = Boolean(
          latitude &&
          longitude &&
          latitude.value !== "" &&
          longitude.value !== "" &&
          latitude.checkValidity() &&
          longitude.checkValidity()
        );

        setVisibleError(
          "#mapaError",
          !coordinatesValid
        );

        const mapElement = $("#mapaUbicacion");

        if (mapElement) {
          mapElement.classList.toggle(
            "invalid",
            !coordinatesValid
          );
        }

        if (!coordinatesValid) valid = false;

        const signature = $("#firmaBase64");

        const signed = Boolean(
          signature &&
          signature.value &&
          !uploadingSignature
        );

        setVisibleError("#firmaError", !signed);

        if (!signed) valid = false;
      }

      if (stepNumber === 5) {
        const consent = $("#consentimiento");

        const accepted = Boolean(
          consent && consent.checked
        );

        setVisibleError("#consentError", !accepted);

        if (!accepted) valid = false;
      }

      if (!valid) {
        showToast(
          "Revisa los campos marcados antes de continuar.",
          true
        );
      }

      return valid;
    }

    /* BORRADOR LOCAL */

    function saveToStorage() {
      try {
        const data = {};

        $$("input, select, textarea", form).forEach((input) => {
          if (
            !input.name ||
            input.type === "file" ||
            input.type === "checkbox" ||
            input.id === "firmaBase64"
          ) {
            return;
          }

          data[input.name] = input.value;
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(data)
        );
      } catch {}
    }

    function restoreFromStorage() {
      try {
        const data = JSON.parse(
          localStorage.getItem(STORAGE_KEY) || "null"
        );

        if (!data) return;

        Object.keys(data).forEach((name) => {
          const input = form.elements[name];

          if (
            !input ||
            input.type === "file" ||
            input.type === "checkbox" ||
            input.id === "firmaBase64"
          ) {
            return;
          }

          input.value = data[name];
        });
      } catch {}
    }

    function clearStorage() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }

    /* PASOS DEL FORMULARIO */

    function goToStep(stepNumber) {
      if (
        stepNumber < 1 ||
        stepNumber > TOTAL_STEPS
      ) {
        return;
      }

      currentStep = stepNumber;

      $$(".step").forEach((step) => {
        step.classList.toggle(
          "active",
          Number(step.dataset.step) === stepNumber
        );
      });

      $$(".progress-step").forEach((step) => {
        const number = Number(step.dataset.step);

        step.classList.toggle(
          "active",
          number === stepNumber
        );

        step.classList.toggle(
          "done",
          number < stepNumber
        );
      });

      $("#progressFill").style.width =
        `${(stepNumber / TOTAL_STEPS) * 100}%`;

      $("#stepCurrent").textContent = stepNumber;
      $("#prevBtn").disabled = stepNumber === 1;
      $("#nextBtn").hidden = stepNumber === TOTAL_STEPS;

      $("#submitBtn").style.display =
        stepNumber === TOTAL_STEPS
          ? "inline-flex"
          : "none";

      $("#nextBtnLabel").textContent =
        stepNumber === TOTAL_STEPS - 1
          ? "Paso final"
          : "Siguiente";

      if (stepNumber === TOTAL_STEPS) {
        renderSummary();
      }

      if (stepNumber === 4) {
        setTimeout(initMapa, 50);
      }

      $("#formulario").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    function nextStep() {
      if (!validateStep(currentStep)) return;

      saveToStorage();
      goToStep(currentStep + 1);
    }

    function prevStep() {
      goToStep(currentStep - 1);
    }

    /* MAPA Y COORDENADAS */

    function initMapa() {
      if (!$("#mapaUbicacion")) return;

      if (typeof L === "undefined") {
        $("#mapCoordsPreview").textContent =
          "El mapa no está disponible. Escribe las " +
          "coordenadas o utiliza tu ubicación actual.";

        return;
      }

      if (!mapa) {
        mapa = L.map("mapaUbicacion", {
          zoomControl: true
        }).setView(UBICACION_INICIAL, 8);

        L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">' +
              "OpenStreetMap</a>",
            maxZoom: 19
          }
        ).addTo(mapa);

        marcador = L.marker(
          UBICACION_INICIAL,
          { draggable: true }
        ).addTo(mapa);

        marcador.on(
          "dragend",
          actualizarCoordenadas
        );

        mapa.on("click", (event) => {
          marcador.setLatLng(event.latlng);
          actualizarCoordenadas();
        });
      }

      syncCoordinates();

      setTimeout(() => {
        mapa.invalidateSize();
      }, 60);
    }

    function actualizarCoordenadas() {
      if (!marcador) return;

      const position = marcador.getLatLng();

      $("#latitud").value =
        position.lat.toFixed(6);

      $("#longitud").value =
        position.lng.toFixed(6);

      syncCoordinates();
      saveToStorage();
    }

    function syncCoordinates() {
      const latitude = $("#latitud");
      const longitude = $("#longitud");

      if (
        !latitude ||
        !longitude ||
        latitude.value === "" ||
        longitude.value === "" ||
        !latitude.checkValidity() ||
        !longitude.checkValidity()
      ) {
        return;
      }

      const point = [
        Number(latitude.value),
        Number(longitude.value)
      ];

      if (mapa && marcador) {
        marcador.setLatLng(point);
        mapa.panTo(point);
      }

      $("#mapCoordsPreview").textContent =
        `Ubicación seleccionada: ${point[0]}, ${point[1]}`;

      setVisibleError("#mapaError", false);

      $("#mapaUbicacion").classList.remove("invalid");
    }

    function locateClient() {
      if (!navigator.geolocation) {
        showToast(
          "Este navegador no permite obtener la ubicación. " +
          "Escribe las coordenadas.",
          true
        );

        return;
      }

      const button = $("#locateBtn");
      button.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          button.disabled = false;

          $("#latitud").value =
            position.coords.latitude.toFixed(6);

          $("#longitud").value =
            position.coords.longitude.toFixed(6);

          syncCoordinates();

          if (mapa) mapa.setZoom(16);

          saveToStorage();
        },
        () => {
          button.disabled = false;

          showToast(
            "No se pudo obtener la ubicación. Puedes " +
            "marcarla en el mapa o escribir las coordenadas.",
            true
          );
        },
        {
          timeout: 10000,
          maximumAge: 0
        }
      );
    }

    /* RESUMEN */

    function renderSummary() {
      const data = new FormData(form);

      const fields = [
        ["Apodo", "apodo"],
        ["WhatsApp", "whatsapp"],
        ["Documento", "documento"],
        ["Nacionalidad", "nacionalidad"],
        ["Fecha de nacimiento", "fechaNacimiento"],
        ["Sexo", "sexo"],
        ["Estado civil", "estadoCivil"],
        ["Teléfono principal", "telefonoPrincipal"],
        ["Otro teléfono", "otroTelefono"],
        ["Correo", "correo"],
        ["RNC", "rnc"],
        ["Provincia", "provincia"],
        ["Municipio", "municipio"],
        ["Sector", "sector"],
        ["Dirección", "direccion"],
        ["Ruta de cobro / entrega", "rutaCobro"],
        ["Lugar de trabajo", "lugarTrabajo"],
        ["Dirección del trabajo", "direccionTrabajo"],
        ["Ocupación", "ocupacion"],
        ["Ingresos mensuales (RD$)", "ingresos"],
        ["Situación laboral", "situacionLaboral"],
        ["Vivienda", "vivienda"],
        ["Dependientes", "dependientes"],
        ["Latitud", "latitud"],
        ["Longitud", "longitud"]
      ];

      const rows = [
        [
          "Nombre completo",
          `${data.get("nombres") || ""} ` +
          `${data.get("apellidos") || ""}`
        ],
        ...fields.map(([label, name]) => [
          label,
          data.get(name)
        ]),
        [
          "Firma del cliente",
          data.get("firmaBase64")
            ? "Agregada"
            : "Pendiente"
        ]
      ];

      $("#summaryBox").innerHTML = rows
        .map(([label, value]) => {
          const display =
            value === null || value === ""
              ? "—"
              : value;

          return (
            "<div><strong>" +
            escapeHtml(label) +
            ":</strong> " +
            escapeHtml(display) +
            "</div>"
          );
        })
        .join("");
    }

    /* ENVÍO AL APPS SCRIPT */

    function handleSubmit(event) {
      event.preventDefault();

      if ($("#submitBtn").disabled) return;

      if (!validateStep(5)) return;

      for (let step = 1; step < TOTAL_STEPS; step++) {
        if (!validateStep(step)) {
          goToStep(step);
          return;
        }
      }

      const honeypot = $("#sitioWeb");

      if (honeypot && honeypot.value) {
        showToast(
          "No se pudo procesar el formulario.",
          true
        );

        return;
      }

      $("#submitBtn").disabled = true;

      showLoader();
      submitToGoogleSheets();
    }

    async function submitToGoogleSheets() {
      let progress = 0;

      const bar = $("#loaderBarFill");

      const progressTimer = setInterval(() => {
        progress = Math.min(progress + 2, 85);
        bar.style.width = progress + "%";
      }, 350);

      const controller = new AbortController();

      try {
        if (
          !window.crypto ||
          !crypto.subtle ||
          !crypto.randomUUID
        ) {
          throw new Error(
            "Abre el portal con HTTPS y utiliza " +
            "un navegador actualizado."
          );
        }

        const params =
          await convertirFormularioAParametros();

        params.set(
          "tipoFormulario",
          "actualizacion"
        );

        /*
         * La huella identifica los mismos datos y archivos.
         * Un reintento conserva la referencia para evitar
         * crear otra fila por el mismo envío.
         */
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            params.toString()
          )
        );

        const fingerprint = Array.from(
          new Uint8Array(digest),
          (byte) =>
            byte.toString(16).padStart(2, "0")
        ).join("");

        let pending = null;

        try {
          pending = JSON.parse(
            sessionStorage.getItem(PENDING_KEY) ||
            "null"
          );
        } catch {}

        const validPending =
          pending &&
          pending.fingerprint === fingerprint &&
          /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
            pending.envioId
          ) &&
          /^[a-f0-9]{64}$/.test(
            pending.envioToken
          );

        if (!validPending) {
          pending = {
            fingerprint,
            envioId: crypto.randomUUID(),
            envioToken: (
              crypto.randomUUID() +
              crypto.randomUUID()
            ).replace(/-/g, "")
          };

          try {
            sessionStorage.setItem(
              PENDING_KEY,
              JSON.stringify(pending)
            );
          } catch {}
        }

        params.set(
          "envioId",
          pending.envioId
        );

        params.set(
          "envioToken",
          pending.envioToken
        );

        /*
         * No se interpreta el POST como confirmación:
         * no-cors devuelve una respuesta opaca.
         * Se consulta el estado real después de enviarlo.
         */
        fetch(GOOGLE_SHEETS_URL, {
          method: "POST",
          mode: "no-cors",
          body: params,
          signal: controller.signal
        }).catch(() => {});

        const deadline = Date.now() + 180000;

        while (Date.now() < deadline) {
          await new Promise((resolve) => {
            setTimeout(resolve, 2200);
          });

          let status;

          try {
            status = await consultarEstado(pending);
          } catch {
            continue;
          }

          if (!status) continue;

          if (status.estado === "ERROR") {
            throw new Error(
              status.mensaje ||
              "Revisa los datos e intenta nuevamente."
            );
          }

          if (
            status.exito === true &&
            status.estado === "GUARDADO"
          ) {
            clearInterval(progressTimer);

            bar.style.width = "100%";

            const overlay = $("#successOverlay");

            const title =
              overlay.querySelector("h3");

            const description =
              overlay.querySelector("p");

            if (title) {
              title.textContent =
                "¡Información guardada!";
            }

            if (description) {
              description.textContent =
                "Tus datos, fotos y firma quedaron " +
                "registrados. Referencia: " +
                pending.envioId;
            }

            try {
              sessionStorage.removeItem(
                PENDING_KEY
              );
            } catch {}

            finishSubmit();
            return;
          }
        }

        throw new Error(
          "No pudimos confirmar el guardado. " +
          "Conserva esta página y vuelve a intentar " +
          "sin cambiar los datos. Usaremos la misma " +
          "referencia para evitar duplicados."
        );
      } catch (error) {
        hideLoader();

        $("#submitBtn").disabled = false;

        showToast(
          error.message ||
          "No se pudo confirmar el registro. " +
          "Intenta nuevamente.",
          true
        );
      } finally {
        clearInterval(progressTimer);
        controller.abort();
      }
    }

    function consultarEstado(pending) {
      return new Promise((resolve, reject) => {
        const callback =
          "ihEstado_" +
          pending.envioId.replace(/-/g, "") +
          "_" +
          crypto.randomUUID()
            .replace(/-/g, "")
            .slice(0, 8);

        const script =
          document.createElement("script");

        let timer;
        let completed = false;

        function cleanup() {
          clearTimeout(timer);
          script.remove();

          /*
           * Ignora una respuesta que llegue tarde
           * después de haber agotado el tiempo.
           */
          window[callback] = () => {};

          setTimeout(() => {
            delete window[callback];
          }, 60000);
        }

        window[callback] = (value) => {
          if (completed) return;

          completed = true;
          cleanup();
          resolve(value);
        };

        script.onerror = () => {
          if (completed) return;

          completed = true;
          cleanup();

          reject(
            new Error("Estado no disponible.")
          );
        };

        timer = setTimeout(() => {
          if (completed) return;

          completed = true;
          cleanup();

          reject(
            new Error("Estado no disponible.")
          );
        }, 7000);

        const url =
          new URL(GOOGLE_SHEETS_URL);

        url.search = new URLSearchParams({
          action: "estado",
          envioId: pending.envioId,
          envioToken: pending.envioToken,
          callback,
          _: String(Date.now())
        }).toString();

        script.src = url.toString();

        document.head.appendChild(script);
      });
    }

    function convertirFormularioAParametros() {
      const params = new URLSearchParams();
      const data = new FormData(form);

      for (const [key, value] of data.entries()) {
        const input = form.elements[key];

        if (input && input.type === "file") {
          continue;
        }

        params.append(key, value);
      }

      const readings = FILE_FIELD_IDS.map(
        (fieldId) => {
          const input = $("#" + fieldId);

          if (
            !input ||
            !input.files ||
            !input.files[0]
          ) {
            return Promise.resolve();
          }

          const file = input.files[0];

          return leerArchivoComoBase64(file)
            .then((base64) => {
              params.append(
                fieldId + "Base64",
                base64
              );

              params.append(
                fieldId + "Nombre",
                file.name
              );

              params.append(
                fieldId + "Tipo",
                file.type || "image/jpeg"
              );
            });
        }
      );

      return Promise.all(readings)
        .then(() => params);
    }

    function leerArchivoComoBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve(
            String(reader.result)
              .split(",")[1] || ""
          );
        };

        reader.onerror = () => {
          reject(
            new Error(
              "No se pudo leer el archivo " +
              file.name
            )
          );
        };

        reader.readAsDataURL(file);
      });
    }

    /* RESULTADO Y LIMPIEZA */

    function finishSubmit() {
      hideLoader();
      showSuccess();
      clearStorage();
    }

    function resetFormCompletely() {
      form.reset();
      clearSignature();

      $$(".field.invalid", form)
        .forEach((field) => {
          field.classList.remove("invalid");
        });

      setVisibleError("#consentError", false);
      setVisibleError("#firmaError", false);
      setVisibleError("#mapaError", false);

      $("#mapaUbicacion")
        .classList.remove("invalid");

      $("#mapCoordsPreview").textContent =
        "Aún no has colocado el marcador.";

      if (mapa && marcador) {
        marcador.setLatLng(
          UBICACION_INICIAL
        );

        mapa.setView(
          UBICACION_INICIAL,
          8
        );
      }

      FILE_FIELD_IDS.forEach((id) => {
        const input = $("#" + id);

        if (input) {
          updateFileNamePreview(input);
        }
      });

      clearStorage();

      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {}

      $("#submitBtn").disabled = false;

      goToStep(1);
    }

    /* VENTANAS */

    function showLoader() {
      $("#loaderBarFill").style.width = "0%";
      $("#loaderOverlay").hidden = false;
    }

    function hideLoader() {
      $("#loaderOverlay").hidden = true;
    }

    function showSuccess() {
      $("#successOverlay").hidden = false;
    }

    function hideSuccess() {
      $("#successOverlay").hidden = true;
    }

    function showImageModal() {
      const modal = $("#imageModal");
      if (modal) modal.hidden = false;
    }

    function hideImageModal() {
      const modal = $("#imageModal");
      if (modal) modal.hidden = true;
    }

    /* FIRMA */

    function clearSignature() {
      if (
        signatureCanvas &&
        signatureContext
      ) {
        signatureContext.clearRect(
          0,
          0,
          signatureCanvas.width,
          signatureCanvas.height
        );
      }

      const signature = $("#firmaBase64");
      const image = $("#firmaImagen");
      const status = $("#firmaStatus");

      if (signature) signature.value = "";
      if (image) image.value = "";

      if (status) {
        status.textContent =
          "Aún no has agregado una firma.";
      }
    }

    function saveSignature() {
      $("#firmaBase64").value =
        signatureCanvas
          .toDataURL("image/png")
          .split(",")[1];

      setVisibleError(
        "#firmaError",
        false
      );

      $("#firmaStatus").textContent =
        "Firma agregada.";
    }

    function initSignature() {
      signatureCanvas =
        $("#firmaCanvas");

      if (!signatureCanvas) return;

      signatureCanvas.width = 1000;
      signatureCanvas.height = 350;

      signatureCanvas.style.touchAction =
        "none";

      signatureContext =
        signatureCanvas.getContext("2d");

      signatureContext.lineWidth = 3;
      signatureContext.lineCap = "round";
      signatureContext.strokeStyle =
        "#061449";

      let activePointer = null;
      let uploadVersion = 0;

      function point(event) {
        const rect =
          signatureCanvas.getBoundingClientRect();

        return [
          (
            (event.clientX - rect.left) *
            signatureCanvas.width
          ) / rect.width,

          (
            (event.clientY - rect.top) *
            signatureCanvas.height
          ) / rect.height
        ];
      }

      signatureCanvas.addEventListener(
        "pointerdown",
        (event) => {
          if (activePointer !== null) return;
          if (event.button !== 0) return;

          event.preventDefault();

          uploadVersion++;
          uploadingSignature = false;
          activePointer = event.pointerId;

          signatureCanvas.setPointerCapture(
            event.pointerId
          );

          $("#firmaImagen").value = "";

          const [x, y] = point(event);

          signatureContext.beginPath();
          signatureContext.moveTo(x, y);
          signatureContext.lineTo(
            x + 0.1,
            y + 0.1
          );

          signatureContext.stroke();
          saveSignature();
        }
      );

      signatureCanvas.addEventListener(
        "pointermove",
        (event) => {
          if (
            activePointer !== event.pointerId
          ) {
            return;
          }

          event.preventDefault();

          signatureContext.lineTo(
            ...point(event)
          );

          signatureContext.stroke();
        }
      );

      function finishDrawing(event) {
        if (
          activePointer !== event.pointerId
        ) {
          return;
        }

        activePointer = null;
        saveSignature();
      }

      [
        "pointerup",
        "pointercancel",
        "lostpointercapture"
      ].forEach((eventName) => {
        signatureCanvas.addEventListener(
          eventName,
          finishDrawing
        );
      });

      $("#clearSignature").addEventListener(
        "click",
        () => {
          uploadVersion++;
          uploadingSignature = false;
          activePointer = null;
          clearSignature();
        }
      );

      $("#firmaImagen").addEventListener(
        "change",
        (event) => {
          const file =
            event.target.files[0];

          if (!file) return;

          if (
            ![
              "image/jpeg",
              "image/png"
            ].includes(file.type) ||
            file.size > MAX_SIGNATURE_SIZE
          ) {
            event.target.value = "";

            showToast(
              "La firma debe ser JPG o PNG " +
              "de hasta 2 MB.",
              true
            );

            return;
          }

          const version = ++uploadVersion;

          uploadingSignature = true;

          const reader =
            new FileReader();

          reader.onerror = () => {
            if (version !== uploadVersion) return;

            uploadingSignature = false;

            showToast(
              "No se pudo abrir la firma.",
              true
            );
          };

          reader.onload = () => {
            if (version !== uploadVersion) return;

            const image = new Image();

            image.onerror = () => {
              if (version !== uploadVersion) return;

              uploadingSignature = false;

              showToast(
                "La imagen de firma no es válida.",
                true
              );
            };

            image.onload = () => {
              if (version !== uploadVersion) return;

              signatureContext.clearRect(
                0,
                0,
                1000,
                350
              );

              const scale = Math.min(
                1000 / image.width,
                350 / image.height
              );

              const width =
                image.width * scale;

              const height =
                image.height * scale;

              signatureContext.drawImage(
                image,
                (1000 - width) / 2,
                (350 - height) / 2,
                width,
                height
              );

              uploadingSignature = false;
              saveSignature();
            };

            image.src = reader.result;
          };

          reader.readAsDataURL(file);
        }
      );
    }

    /* ARCHIVOS */

    function updateFileNamePreview(input) {
      const nameElement = $(
        "#" + input.id + "Name"
      );

      const field =
        input.closest(".field-file");

      const hasFile = Boolean(
        input.files &&
        input.files.length
      );

      if (nameElement) {
        nameElement.textContent = hasFile
          ? input.files[0].name
          : "Ningún archivo seleccionado";
      }

      if (field) {
        field.classList.toggle(
          "has-file",
          hasFile
        );
      }
    }

    /* VALIDACIÓN AL ESCRIBIR */

    function bindLiveValidation() {
      $$(
        "input, select, textarea",
        form
      ).forEach((input) => {
        if (
          input.type === "checkbox" ||
          input.type === "hidden"
        ) {
          return;
        }

        if (input.type === "file") {
          input.addEventListener(
            "change",
            () => {
              updateFileNamePreview(input);
              validateField(input);
            }
          );

          return;
        }

        input.addEventListener(
          "blur",
          () => validateField(input)
        );

        input.addEventListener(
          "input",
          () => {
            if (
              input.closest(".field.invalid")
            ) {
              validateField(input);
            }
          }
        );
      });
    }

    /* INICIALIZACIÓN */

    restoreFromStorage();
    bindLiveValidation();
    initSignature();

    const startButton = $("#startBtn");

    if (startButton) {
      startButton.addEventListener(
        "click",
        () => {
          $("#formulario").scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      );
    }

    $("#nextBtn").addEventListener(
      "click",
      nextStep
    );

    $("#prevBtn").addEventListener(
      "click",
      prevStep
    );

    form.addEventListener(
      "submit",
      handleSubmit
    );

    const exampleButton =
      $("#viewExampleBtn");

    const examplePhoto =
      $(".example-photo");

    const closeExample =
      $("#closeImageModal");

    if (exampleButton) {
      exampleButton.addEventListener(
        "click",
        showImageModal
      );
    }

    if (examplePhoto) {
      examplePhoto.addEventListener(
        "click",
        showImageModal
      );
    }

    if (closeExample) {
      closeExample.addEventListener(
        "click",
        hideImageModal
      );
    }

    form.addEventListener(
      "input",
      debounce(saveToStorage, 500)
    );

    $("#latitud").addEventListener(
      "input",
      syncCoordinates
    );

    $("#longitud").addEventListener(
      "input",
      syncCoordinates
    );

    $("#locateBtn").addEventListener(
      "click",
      locateClient
    );

    $("#closeSuccess").addEventListener(
      "click",
      () => {
        hideSuccess();
        resetFormCompletely();
      }
    );

    goToStep(1);
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      iniciarPortal
    );
  } else {
    iniciarPortal();
  }

   // Evitar conflictos con las celdas combinadas.
sheet.setFrozenColumns(0);
sheet.setFrozenRows(0);

try {
  sheet.setFrozenRows(headerRow);
} catch (error) {
  console.warn(
    'Se continúa sin inmovilizar filas porque hay celdas combinadas.'
  );
}
})();
