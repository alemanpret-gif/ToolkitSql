export async function onRequestPost(context) {
  const corsHeaders = {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
  };

  try {
    const body = await context.request.json();

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const type = String(body?.type || "").trim();
    const message = String(body?.message || "").trim();
    const turnstileToken = String(body?.turnstileToken || "").trim();

    if (!name || !email || !message || !turnstileToken) {
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios." }), {
        status: 400, headers: corsHeaders
      });
    }

    if (name.length > 100 || email.length > 254 || message.length > 5000) {
      return new Response(JSON.stringify({ error: "El mensaje excede el tamaño permitido." }), {
        status: 413, headers: corsHeaders
      });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return new Response(JSON.stringify({ error: "Correo electrónico no válido." }), {
        status: 400, headers: corsHeaders
      });
    }

    // Server-side Turnstile validation is mandatory.
    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: context.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: context.request.headers.get("CF-Connecting-IP") || "",
        }),
      }
    );

    const verify = await verifyResponse.json();

    if (!verify.success) {
      return new Response(JSON.stringify({ error: "No se pudo validar la verificación de seguridad." }), {
        status: 403, headers: corsHeaders
      });
    }

    // Keep the destination private: it exists only in the Function environment.
    const to = context.env.CONTACT_TO_EMAIL;
    const resendKey = context.env.RESEND_API_KEY;

    if (!to || !resendKey) {
      return new Response(JSON.stringify({ error: "El servicio de correo no está configurado." }), {
        status: 500, headers: corsHeaders
      });
    }

    const subject = `[SQL Toolkit Pro] ${type || "Contacto"}`;

    const safe = (value) =>
      value.replace(/&/g, "&amp;")
           .replace(/</g, "&lt;")
           .replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;")
           .replace(/'/g, "&#039;");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>SQL Toolkit Pro — ${safe(type || "Contacto")}</h2>
        <p><strong>Nombre:</strong> ${safe(name)}</p>
        <p><strong>Correo:</strong> ${safe(email)}</p>
        <p><strong>Motivo:</strong> ${safe(type || "Contacto")}</p>
        <p><strong>Mensaje:</strong></p>
        <div style="white-space:pre-wrap;border-left:3px solid #45d9c3;padding-left:12px">
          ${safe(message)}
        </div>
        <hr>
        <small>SQL Toolkit Pro · Created by Alequin</small>
      </div>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: context.env.EMAIL_FROM,
        to: [to],
        reply_to: email,
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({
        error: "El servicio de correo no pudo entregar el mensaje.",
        detail: resendData?.message || resendData?.error || "Error de proveedor"
      }), {
        status: 502, headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: corsHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Solicitud inválida." }), {
      status: 400, headers: corsHeaders
    });
  }
}
