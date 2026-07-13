// Supabase Edge Function: read-receipt
// Nimmt ein Dokument (base64) entgegen, ruft Mindee "Financial Document" auf
// (erkennt Quittungen UND Rechnungen), gibt Typ + Betrag + Datum + Händler zurück.
// Der Mindee-API-Schlüssel bleibt geheim (Supabase Secret MINDEE_API_KEY) – nie im Browser.

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const MINDEE_KEY = Deno.env.get("MINDEE_API_KEY") ?? "";
const MINDEE_URL =
  "https://api.mindee.net/v1/products/mindee/financial_document/v1/predict";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!MINDEE_KEY) return json({ error: "MINDEE_API_KEY nicht gesetzt" }, 500);

  try {
    const { fileBase64, fileName } = await req.json();
    if (!fileBase64) return json({ error: "kein fileBase64" }, 400);

    // base64 -> Bytes
    const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("document", new Blob([bytes]), fileName || "beleg");

    const r = await fetch(MINDEE_URL, {
      method: "POST",
      headers: { Authorization: `Token ${MINDEE_KEY}` },
      body: form,
    });
    const data = await r.json();
    if (!r.ok) return json({ error: "Mindee-Fehler", detail: data }, 502);

    const p = data?.document?.inference?.prediction ?? {};
    return json({
      total: p.total_amount?.value ?? null,          // Gesamtbetrag
      date: p.date?.value ?? null,                    // Belegdatum
      supplier: p.supplier_name?.value ?? null,       // Händler/Aussteller
      category: p.category?.value ?? null,            // z.B. "food", "gasoline", "toll"
      doc_type: p.document_type?.value ?? null,       // "EXPENSE RECEIPT" | "INVOICE"
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
