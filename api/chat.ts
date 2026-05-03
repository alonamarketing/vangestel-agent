import path from "path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";
import { Resend } from "resend";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1024;
const SESSION_TTL = 60 * 60 * 24;
const MAX_HISTORY_MESSAGES = 40;
const HIGHLEVEL_BASE = "https://services.leadconnectorhq.com";

const ISDE_2026: Record<string, { tarief: number; label: string; uWaarde: string; minOppervlak: number }> = {
  "hr++": { tarief: 36, label: "HR++ glas", uWaarde: "≤ 1,2 W/m²K", minOppervlak: 6 },
  triple: { tarief: 60, label: "Triple glas", uWaarde: "≤ 0,7 W/m²K", minOppervlak: 6 },
};

function buildSystemPrompt(): string {
  const tz = "Europe/Amsterdam";
  const dateFmt = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz,
  });
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  const vandaag = dateFmt.format(now);
  const over30dagen = dateFmt.format(in30);

  return `Je bent Alona, de vriendelijke AI-assistent van Van Gestel Kozijnen & Installaties (vangestelkozijnen.nl / vangestelinstallaties.nl). Je helpt websitebezoekers met vragen over kozijnen, ramen, deuren en installaties.

Huidige datum: ${vandaag}.

## Gespreksstructuur
Voer een gestructureerd gesprek en werk onderstaande stappen in volgorde af. Stel MAXIMAAL ÉÉN vraag per bericht. Geef tussendoor kort nuttige informatie (subsidie, prijsindicatie) zodra die relevant is.

Stap 1 — Behoefte: Wat zoekt de klant precies? (kozijnen, deuren, schuifpui, of iets anders)
Stap 2 — Materiaal: Kunststof of Aluminium?
Stap 3 — Omvang: Hoeveel ramen/deuren gaat het ongeveer om?
Stap 4 — Situatie: Renovatie van een bestaande woning of nieuwbouw?
Stap 5 — Contact: Vraag naam én telefoonnummer voor een gratis opmeetafspraak.
Stap 6 — Adres: Vraag na het bevestigen van de afspraak het bezoekadres van de klant (straat + huisnummer, postcode, plaats). Sla dit op via save_lead.

Sla een stap over als de klant die informatie al eerder gaf. Ga nooit terug naar een stap die al beantwoord is.

## Kennisbank

ISDE subsidie 2026:
- HR++ glas: €36 per m² (U-waarde ≤ 1,2 W/m²K), minimaal 6 m² subsidiabel oppervlak
- Triple glas: €60 per m² (U-waarde ≤ 0,7 W/m²K), minimaal 6 m² subsidiabel oppervlak
- Subsidie aanvragen via RVO.nl, geldig voor eigenaar-bewoners in Nederland

Prijsindicaties (inclusief BTW en plaatsing):
- Kunststof kozijn: €400–700 per m²
- Aluminium kozijn: €600–1.000 per m²
- Kunststof voordeur: €1.800–3.500 per stuk
- Aluminium voordeur: €2.500–5.000 per stuk
- Kunststof schuifpui: €2.000–4.500 per meter breedte
- Aluminium schuifpui: €3.000–6.000 per meter breedte

## Regels
- Antwoord ALTIJD in het Nederlands.
- Zeg ALTIJD "Kunststof" — nooit "PVC".
- Stel nooit twee vragen tegelijk.
- Wees vriendelijk en bondig; geen lange lappen tekst.
- Geef prijsindicaties altijd als richtprijs; exacte offerte volgt na de gratis opmeetafspraak.
- Zodra je naam én telefoonnummer hebt: sla de lead op (save_lead) en stel een afspraak voor.
- Na het bevestigen van de afspraak vraag je het bezoekadres (straat + huisnummer, postcode, plaats) en sla je dat op via save_lead (opnieuw aanroepen met het adres).
- Bij een hot lead of expliciete afspraakwens: plan direct in via schedule_appointment.
- Verwijs bij complexe technische vragen naar een vakkundige adviseur van Van Gestel.
- Gebruik NOOIT markdown-opmaak: geen **, geen *, geen #, geen _, geen backticks. Schrijf altijd gewone platte tekst.
- Roep ALTIJD eerst get_available_slots aan voordat je een afspraaktijd voorstelt. Stel uitsluitend tijdslots voor die in het resultaat van die tool staan.
- Plan afspraken ALTIJD binnen de komende 30 dagen (${vandaag} t/m ${over30dagen}). Stel nooit een datum voor die al geweest is.

## Keuze-opties (suggest_options tool)
Roep suggest_options VERPLICHT aan bij elke vraag uit de gespreksstructuur. Geen uitzonderingen. Gebruik exact de onderstaande opties per stap:
- Stap 1 — product: ["Kozijnen/ramen", "Deuren", "Schuifpui", "Meerdere producten"]
- Stap 2 — materiaal: ["Kunststof", "Aluminium", "Weet ik nog niet"]
- Stap 3 — aantal: ["1-2 ramen", "3-5 ramen", "6 of meer", "Weet ik nog niet"]
- Stap 4 — situatie: ["Renovatie", "Nieuwbouw", "Weet ik nog niet"]
- Stap 5 / urgentie: ["Zo snel mogelijk", "Binnen 3 maanden", "Alleen oriënteren"]`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "save_lead",
    description: "Sla contactgegevens en leadinformatie op in HighLevel CRM. Gebruik dit zodra je naam, e-mail of telefoonnummer van de bezoeker hebt.",
    input_schema: {
      type: "object" as const,
      properties: {
        firstName: { type: "string", description: "Voornaam van de lead" },
        lastName: { type: "string", description: "Achternaam van de lead" },
        email: { type: "string", description: "E-mailadres van de lead" },
        phone: { type: "string", description: "Telefoonnummer van de lead (optioneel)" },
        interesse: { type: "string", description: "Korte omschrijving van het project of de interesse (bijv. 'PVC kozijnen woonkamer, 4 ramen')" },
        kwalificatie: { type: "string", enum: ["hot", "warm", "cold"], description: "Leadkwalificatie op basis van urgentie en koopintentie" },
        adres: { type: "string", description: "Volledig bezoekadres: straat + huisnummer, postcode, plaats (optioneel, invullen zodra bekend)" },
        notities: { type: "string", description: "Aanvullende notities over de lead of het gesprek (optioneel)" },
      },
      required: ["firstName", "kwalificatie"],
    },
  },
  {
    name: "schedule_appointment",
    description: "Plan een gratis opmeetafspraak in via HighLevel CRM voor de bezoeker.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "HighLevel contact ID (verkregen na save_lead)" },
        firstName: { type: "string", description: "Voornaam van de contactpersoon" },
        email: { type: "string", description: "E-mailadres van de contactpersoon" },
        phone: { type: "string", description: "Telefoonnummer van de contactpersoon" },
        startTime: { type: "string", description: "Gewenste datum en tijd voor de afspraak in ISO 8601 formaat (bijv. 2026-06-15T10:00:00+02:00)" },
        notities: { type: "string", description: "Notities voor de afspraak (optioneel)" },
      },
      required: ["firstName", "email", "startTime"],
    },
  },
  {
    name: "calculate_isde_subsidy",
    description: "Bereken het ISDE subsidiebedrag 2026 op basis van glastype en oppervlak.",
    input_schema: {
      type: "object" as const,
      properties: {
        glasType: { type: "string", enum: ["hr++", "triple"], description: "Type isolatieglas: hr++ of triple" },
        oppervlakM2: { type: "number", description: "Totaal te vervangen glasoppervlak in m²" },
      },
      required: ["glasType", "oppervlakM2"],
    },
  },
  {
    name: "calculate_price_estimate",
    description: "Bereken een richtprijs voor kozijnen, deuren of schuifpuien inclusief BTW en plaatsing.",
    input_schema: {
      type: "object" as const,
      properties: {
        productType: {
          type: "string",
          enum: ["kozijn_kunststof", "kozijn_aluminium", "voordeur_kunststof", "voordeur_aluminium", "schuifpui_kunststof", "schuifpui_aluminium"],
          description: "Type product",
        },
        maat: {
          type: "number",
          description: "Maat in m² (voor kozijnen), stuks (voor deuren) of meters breedte (voor schuifpuien)",
        },
        aantal: { type: "number", description: "Aantal stuks (standaard 1)" },
      },
      required: ["productType", "maat"],
    },
  },
  {
    name: "get_available_slots",
    description: "Haal beschikbare tijdslots op uit de HighLevel kalender voor de komende 14 dagen. Roep deze tool ALTIJD aan voordat je een afspraaktijd voorstelt aan de klant.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "suggest_options",
    description: "Toon de gebruiker maximaal 4 klikbare keuze-knoppen als vervolgactie na je antwoord. Gebruik dit alleen op zinvolle beslismomenten (materiaaltype, glastype, urgentie, aantal ramen).",
    input_schema: {
      type: "object" as const,
      properties: {
        options: {
          type: "array",
          items: { type: "string" },
          description: "Array van maximaal 4 korte keuze-strings",
        },
      },
      required: ["options"],
    },
  },
];

interface LeadInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  interesse?: string;
  kwalificatie: "hot" | "warm" | "cold";
  adres?: string;
  notities?: string;
}

interface AppointmentInput {
  contactId?: string;
  firstName: string;
  email: string;
  phone?: string;
  startTime: string;
  notities?: string;
}

interface IsdeInput {
  glasType: "hr++" | "triple";
  oppervlakM2: number;
}

interface PriceInput {
  productType: string;
  maat: number;
  aantal?: number;
}

async function hlHeaders() {
  return {
    Authorization: `Bearer ${process.env.HIGHLEVEL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

async function sendLeadEmail(input: LeadInput, contactId: string): Promise<void> {
  const naam = [input.firstName, input.lastName].filter(Boolean).join(" ");
  const { error } = await resend.emails.send({
    from: "Alona <onboarding@resend.dev>",
    to: "thijsvandenhaak@gmail.com",
    subject: `Nieuwe lead Van Gestel: ${naam}`,
    html: `
      <h2>Nieuwe lead via de website chat</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td><strong>Naam</strong></td><td>${naam}</td></tr>
        ${input.phone ? `<tr><td><strong>Telefoon</strong></td><td>${input.phone}</td></tr>` : ""}
        ${input.email ? `<tr><td><strong>E-mail</strong></td><td>${input.email}</td></tr>` : ""}
        <tr><td><strong>Kwalificatie</strong></td><td>${input.kwalificatie.toUpperCase()}</td></tr>
        ${input.adres ? `<tr><td><strong>Adres</strong></td><td>${input.adres}</td></tr>` : ""}
        ${input.interesse ? `<tr><td><strong>Interesse</strong></td><td>${input.interesse}</td></tr>` : ""}
        ${input.notities ? `<tr><td><strong>Notities</strong></td><td>${input.notities}</td></tr>` : ""}
        <tr><td><strong>CRM contact ID</strong></td><td>${contactId}</td></tr>
      </table>
    `,
  });
  if (error) {
    console.error("Resend fout bij versturen lead e-mail:", error);
  }
}

async function saveLead(input: LeadInput): Promise<string> {
  const body: Record<string, unknown> = {
    firstName: input.firstName,
    locationId: process.env.HIGHLEVEL_LOCATION_ID,
    tags: ["website-chat", `lead-${input.kwalificatie}`],
    customFields: [
      { id: "interesse", value: input.interesse ?? "" },
      { id: "kwalificatie", value: input.kwalificatie },
    ],
  };
  if (input.lastName) body.lastName = input.lastName;
  if (input.email) body.email = input.email;
  if (input.phone) body.phone = input.phone;
  if (input.adres) body.address1 = input.adres;
  if (input.notities) body.notes = input.notities;

  const res = await fetch(`${HIGHLEVEL_BASE}/contacts/`, {
    method: "POST",
    headers: await hlHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return `Fout bij opslaan lead: ${res.status} — ${err}`;
  }

  const data = (await res.json()) as { contact?: { id?: string } };
  const contactId = data?.contact?.id ?? "onbekend";

  // Fire-and-forget: don't let email errors block the chat response.
  sendLeadEmail(input, contactId).catch((e) =>
    console.error("sendLeadEmail onverwachte fout:", e)
  );

  return `Lead opgeslagen in CRM. Contact ID: ${contactId}. Kwalificatie: ${input.kwalificatie}.`;
}

async function getAvailableSlots(): Promise<string> {
  const calendarId = process.env.HIGHLEVEL_CALENDAR_ID;
  if (!calendarId) return "HIGHLEVEL_CALENDAR_ID is niet geconfigureerd.";

  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  // HighLevel accepts both millisecond timestamps and YYYY-MM-DD strings.
  // Log both so we can verify the format in Vercel logs.
  const startMs = now.getTime();
  const endMs = in30.getTime();
  const startISO = now.toISOString().split("T")[0];
  const endISO = in30.toISOString().split("T")[0];

  const url =
    `${HIGHLEVEL_BASE}/calendars/${calendarId}/free-slots` +
    `?startDate=${startMs}&endDate=${endMs}` +
    `&timezone=${encodeURIComponent("Europe/Amsterdam")}`;

  console.log("[free-slots] URL:", url);
  console.log("[free-slots] startDate ms:", startMs, "ISO:", startISO);
  console.log("[free-slots] endDate ms:", endMs, "ISO:", endISO);

  const res = await fetch(url, { headers: await hlHeaders() });

  if (!res.ok) {
    const err = await res.text();
    console.error("[free-slots] HTTP fout:", res.status, err);
    return `Fout bij ophalen beschikbare tijdslots: ${res.status}`;
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[free-slots] raw response:", JSON.stringify(data));

  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    // Keys are ISO dates "YYYY-MM-DD"; skip metadata fields
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;

    let slots: string[] = [];
    if (Array.isArray(value)) {
      slots = value
        .map((s: unknown) => {
          if (typeof s === "string") return s;
          if (typeof s === "object" && s !== null) {
            const obj = s as Record<string, unknown>;
            return typeof obj.time === "string" ? obj.time : null;
          }
          return null;
        })
        .filter((s): s is string => s !== null)
        .slice(0, 6);
    }

    if (slots.length === 0) continue;

    const [y, m, d] = key.split("-").map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString("nl-NL", {
      weekday: "long", day: "numeric", month: "long",
    });
    lines.push(`${label}: ${slots.join(", ")}`);
  }

  if (lines.length === 0) {
    return "Geen beschikbare tijdslots gevonden voor de komende 30 dagen.";
  }

  return "Beschikbare tijdslots:\n" + lines.join("\n");
}

async function scheduleAppointment(input: AppointmentInput): Promise<string> {
  const calendarId = process.env.HIGHLEVEL_CALENDAR_ID;
  if (!calendarId) return "HIGHLEVEL_CALENDAR_ID is niet geconfigureerd.";

  const body: Record<string, unknown> = {
    calendarId,
    locationId: process.env.HIGHLEVEL_LOCATION_ID,
    contactId: input.contactId,
    startTime: input.startTime,
    title: `Gratis opmeetafspraak — ${input.firstName}`,
    appointmentStatus: "new",
  };
  if (input.email) body.email = input.email;
  if (input.phone) body.phone = input.phone;
  if (input.notities) body.notes = input.notities;

  const res = await fetch(`${HIGHLEVEL_BASE}/calendars/events/appointments`, {
    method: "POST",
    headers: await hlHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return `Fout bij inplannen afspraak: ${res.status} — ${err}`;
  }

  const data = (await res.json()) as { id?: string };
  return `Afspraak ingepland op ${input.startTime}. Afspraak ID: ${data?.id ?? "onbekend"}.`;
}

function calculateIsdeSubsidy(input: IsdeInput): string {
  const glasInfo = ISDE_2026[input.glasType];
  if (!glasInfo) return "Ongeldig glastype. Kies hr++ of triple.";

  if (input.oppervlakM2 < glasInfo.minOppervlak) {
    return `Helaas kom je niet in aanmerking voor ISDE subsidie: het minimale subsidiabele oppervlak is ${glasInfo.minOppervlak} m², maar je opgegeven oppervlak is ${input.oppervlakM2} m².`;
  }

  const bedrag = Math.round(glasInfo.tarief * input.oppervlakM2);
  return `ISDE subsidie berekening 2026:
- Glastype: ${glasInfo.label} (U-waarde ${glasInfo.uWaarde})
- Oppervlak: ${input.oppervlakM2} m²
- Subsidietarief: €${glasInfo.tarief} per m²
- Totaal subsidiebedrag: €${bedrag}
- Aanvragen via: RVO.nl (geldig voor eigenaar-bewoners)`;
}

function calculatePriceEstimate(input: PriceInput): string {
  const aantal = input.aantal ?? 1;

  const ranges: Record<string, { min: number; max: number; eenheid: string }> = {
    kozijn_kunststof: { min: 400, max: 700, eenheid: "m²" },
    kozijn_aluminium: { min: 600, max: 1000, eenheid: "m²" },
    voordeur_kunststof: { min: 1800, max: 3500, eenheid: "stuk" },
    voordeur_aluminium: { min: 2500, max: 5000, eenheid: "stuk" },
    schuifpui_kunststof: { min: 2000, max: 4500, eenheid: "meter breedte" },
    schuifpui_aluminium: { min: 3000, max: 6000, eenheid: "meter breedte" },
  };

  const range = ranges[input.productType];
  if (!range) return "Onbekend producttype.";

  const labelMap: Record<string, string> = {
    kozijn_kunststof: "Kunststof kozijn",
    kozijn_aluminium: "Aluminium kozijn",
    voordeur_kunststof: "Kunststof voordeur",
    voordeur_aluminium: "Aluminium voordeur",
    schuifpui_kunststof: "Kunststof schuifpui",
    schuifpui_aluminium: "Aluminium schuifpui",
  };

  const totaalMin = Math.round(range.min * input.maat * aantal);
  const totaalMax = Math.round(range.max * input.maat * aantal);

  return `Richtprijs indicatie (incl. BTW en plaatsing):
- Product: ${labelMap[input.productType]}
- Maat: ${input.maat} ${range.eenheid}${aantal > 1 ? ` × ${aantal} stuks` : ""}
- Richtprijs: €${totaalMin.toLocaleString("nl-NL")} – €${totaalMax.toLocaleString("nl-NL")}
- Dit is een indicatie; een exacte offerte volgt na een gratis opmeetafspraak bij u thuis.`;
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "save_lead":
      return saveLead(input as unknown as LeadInput);
    case "get_available_slots":
      return getAvailableSlots();
    case "schedule_appointment":
      return scheduleAppointment(input as unknown as AppointmentInput);
    case "calculate_isde_subsidy":
      return calculateIsdeSubsidy(input as unknown as IsdeInput);
    case "calculate_price_estimate":
      return calculatePriceEstimate(input as unknown as PriceInput);
    case "suggest_options":
      return "Opties worden getoond aan de gebruiker.";
    default:
      return `Onbekende tool: ${name}`;
  }
}

type MessageParam = Anthropic.MessageParam;

async function loadHistory(sessionId: string): Promise<MessageParam[]> {
  try {
    const raw = await redis.get<MessageParam[]>(`session:${sessionId}`);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function saveHistory(sessionId: string, messages: MessageParam[]): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  await redis.set(`session:${sessionId}`, trimmed, { ex: SESSION_TTL });
}

function setCors(res: VercelResponse): void {
  // Restrict to Van Gestel domains in production
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, sessionId } = req.body as { message?: string; sessionId?: string };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Bericht ontbreekt." });
  }

  const sid = sessionId && typeof sessionId === "string" ? sessionId : crypto.randomUUID();

  const history = await loadHistory(sid);
  const messages: MessageParam[] = [
    ...history,
    { role: "user", content: message.trim() },
  ];

  let reply = "";
  let options: string[] = [];

  try {
    // Agentic loop
    while (true) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      // Always capture text from the current response, whatever the stop reason.
      const currentText = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (currentText?.text) reply = currentText.text;

      if (response.stop_reason === "end_turn") {
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        // Capture options from suggest_options calls.
        for (const block of toolUseBlocks) {
          if (block.name === "suggest_options") {
            const raw = (block.input as { options?: unknown }).options;
            if (Array.isArray(raw)) {
              options = raw.filter((o): o is string => typeof o === "string").slice(0, 4);
            }
          }
        }

        // Build tool_results for EVERY tool_use block — the Anthropic API requires a
        // tool_result for each tool_use, otherwise the history is invalid on the next request.
        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const result = await executeTool(block.name, block.input as Record<string, unknown>);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: result,
            };
          })
        );

        const onlySuggestOptions = toolUseBlocks.every((b) => b.name === "suggest_options");
        if (onlySuggestOptions) {
          // We already have the reply text; no need for another Claude round-trip.
          // Replace the assistant message with a text-only version so the saved history
          // stays valid (no unresolved tool_use blocks) for the next request.
          messages[messages.length - 1] = { role: "assistant", content: reply };
          break;
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // max_tokens or other stop reason — stop with whatever text we have.
      if (!reply) reply = "Er is iets misgegaan. Probeer het opnieuw.";
      break;
    }

    await saveHistory(sid, messages);

    return res.status(200).json({ reply, options, sessionId: sid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("Chat handler fout:", { message, stack, sessionId: sid });
    return res.status(500).json({ error: "Interne serverfout. Probeer het later opnieuw." });
  }
}
