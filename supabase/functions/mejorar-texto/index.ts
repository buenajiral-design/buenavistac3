// ============================================================
//  Edge Function: mejorar-texto
//  Recibe el texto que escribió un estudiante y usa la IA para
//  sugerir una versión mejorada (ortografía, orden, un título).
//  La llave de la IA vive aquí, en el servidor — nunca en el navegador.
//
//  DESPLIEGUE (una sola vez, desde tu computadora):
//    1) Instala la CLI de Supabase si no la tienes:
//         npm install -g supabase
//    2) Inicia sesión y enlaza tu proyecto:
//         supabase login
//         supabase link --project-ref TU_PROJECT_REF   (lo ves en la URL de tu proyecto)
//    3) Guarda tu llave de Anthropic como secreto (NO la pongas en el código):
//         supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
//    4) Despliega esta función:
//         supabase functions deploy mejorar-texto
//
//  Después de desplegarla, el botón "✨ Mejorar con IA" del sitio
//  funcionará automáticamente (usa supabase-js, ya conectado).
// ============================================================

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-5"; // revisa docs.claude.com/en/docs/about-claude/models si quieres usar otro modelo

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "Falta configurar ANTHROPIC_API_KEY en los secretos de Supabase." }, 500);
    }

    const { texto, seccion } = await req.json();
    if (!texto || typeof texto !== "string" || !texto.trim()) {
      return json({ error: "Falta el texto a mejorar." }, 400);
    }
    // Límite razonable para no gastar de más ni recibir textos enormes.
    const textoRecortado = texto.slice(0, 4000);

    const systemPrompt = `Eres un asistente de escritura para estudiantes de escuela (8vo y 9no grado) en Panamá
que están construyendo, en equipo, una página web sobre su corregimiento (Buena Vista, C.E.B.G. El Jiral).
Tu trabajo es MEJORAR lo que el estudiante ya escribió, no inventar información nueva ni datos que no dio.

Reglas:
- Corrige ortografía y gramática en español.
- Organiza el texto en párrafos claros y bien conectados.
- Mantén todos los hechos, nombres y datos que el estudiante mencionó, tal como los dio (no los cambies ni los inventes).
- Usa un nivel de lenguaje apropiado para un estudiante de esa edad, sencillo y claro, no rebuscado.
- Sugiere un título corto (menos de 8 palabras) para la publicación, si el texto lo permite.
- No agregues secciones, encabezados ni información que el estudiante no haya mencionado.
- Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin marcadores de código, con esta forma exacta:
{"titulo_sugerido": "...", "texto_mejorado": "..."}`;

    const userPrompt = `Sección de la página: ${seccion || "(sin especificar)"}

Texto del estudiante:
"""
${textoRecortado}
"""`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const detalle = await resp.text();
      return json({ error: `La IA no respondió correctamente (${resp.status}).`, detalle }, 502);
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find((b: any) => b.type === "text");
    const raw = textBlock ? textBlock.text : "";

    let parsed;
    try {
      // Por si el modelo agrega texto alrededor del JSON, se extrae el primer bloque { ... }.
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      return json({ error: "No se pudo interpretar la respuesta de la IA." }, 502);
    }

    return json({
      titulo_sugerido: parsed.titulo_sugerido || "",
      texto_mejorado: parsed.texto_mejorado || raw,
    });
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
