export async function onRequestPost(context) {
  const corsHeaders = {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
  };

  try {
    // =========================================================
    // 1. LEER DATOS DEL FORMULARIO
    // =========================================================

    const body = await context.request.json();

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const type = String(body?.type || "").trim();
    const message = String(body?.message || "").trim();
    const turnstileToken = String(body?.turnstileToken || "").trim();

    // =========================================================
    // 2. VALIDAR CAMPOS OBLIGATORIOS
    // =========================================================

    if (!name || !email || !message || !turnstileToken) {
      return new Response(
        JSON.stringify({
          error: "Faltan datos obligatorios.",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // =========================================================
    // 3. VALIDAR LONGITUDES
    // =========================================================

    if (
      name.length > 100 ||
      email.length > 254 ||
      message.length > 5000
    ) {
      return new Response(
        JSON.stringify({
          error: "El mensaje excede el tamaño permitido.",
        }),
        {
          status: 413,
          headers: corsHeaders,
        }
      );
    }

    // =========================================================
    // 4. VALIDAR FORMATO DEL CORREO
    // =========================================================

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!emailOk) {
      return new Response(
        JSON.stringify({
          error: "Correo electrónico no válido.",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // =========================================================
    // 5. VALIDAR TURNSTILE
    // =========================================================

    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },

        body: new URLSearchParams({
          secret: context.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip:
            context.request.headers.get("CF-Connecting-IP") || "",
        }),
      }
    );

    const verify = await verifyResponse.json();

    if (!verify.success) {
      return new Response(
        JSON.stringify({
          error: "No se pudo validar la verificación de seguridad.",
        }),
        {
          status: 403,
          headers: corsHeaders,
        }
      );
    }

    // =========================================================
    // 6. OBTENER VARIABLES DE CLOUDFLARE
    // =========================================================

    const to = context.env.CONTACT_TO_EMAIL;
    const resendKey = context.env.RESEND_API_KEY;

    if (!to || !resendKey) {
      return new Response(
        JSON.stringify({
          error: "El servicio de correo no está configurado.",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // =========================================================
    // 7. ASUNTO
    // =========================================================

    const subject =
      `[SQL Toolkit Pro] ${type || "Contacto"}`;

    // =========================================================
    // 8. PROTEGER CONTENIDO HTML
    // =========================================================

    const safe = (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // =========================================================
    // 9. CREAR CUERPO DEL CORREO
    // =========================================================

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          max-width: 700px;
          margin: auto;
        "
      >

        <h2 style="margin-bottom: 20px;">
          SQL Toolkit Pro — ${safe(type || "Contacto")}
        </h2>

        <p>
          <strong>Nombre:</strong>
          ${safe(name)}
        </p>

        <p>
          <strong>Correo:</strong>
          ${safe(email)}
        </p>

        <p>
          <strong>Motivo:</strong>
          ${safe(type || "Contacto")}
        </p>

        <p>
          <strong>Mensaje:</strong>
        </p>

        <div
          style="
            white-space: pre-wrap;
            border-left: 3px solid #45d9c3;
            padding-left: 12px;
            margin-bottom: 20px;
          "
        >
          ${safe(message)}
        </div>

        <hr>

        <small>
          SQL Toolkit Pro · Created by Alequin
        </small>

      </div>
    `;

    // =========================================================
    // 10. ENVIAR CORREO MEDIANTE RESEND
    // =========================================================

    const resendResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          // Remitente autorizado temporal de Resend
          from: "SQL Toolkit Pro <onboarding@resend.dev>",

          // Tu correo de destino
          to: [to],

          // IMPORTANTE:
          // El correo que escribió el visitante.
          // Cuando presiones "Responder" en Gmail,
          // responderás directamente al visitante.
          reply_to: email,

          subject: subject,

          html: html,
        }),
      }
    );

    // =========================================================
    // 11. LEER RESPUESTA DE RESEND
    // =========================================================

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(
        JSON.stringify({
          error:
            "El servicio de correo no pudo entregar el mensaje.",
          detail:
            resendData?.message ||
            resendData?.error ||
            "Error de proveedor",
        }),
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    // =========================================================
    // 12. TODO CORRECTO
    // =========================================================

    return new Response(
      JSON.stringify({
        ok: true,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );

  } catch (error) {

    // =========================================================
    // 13. ERROR GENERAL
    // =========================================================

    return new Response(
      JSON.stringify({
        error: "Solicitud inválida.",
      }),
      {
        status: 400,
        headers: corsHeaders,
      }
    );
  }
}
