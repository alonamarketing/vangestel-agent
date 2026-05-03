# Van Gestel AI Lead Agent

AI-gestuurde lead-kwalificatie agent voor **Van Gestel Installaties**, gebouwd door **Alona Marketing**.

De agent spreekt websitebezoekers aan, verzamelt contactgegevens en projectinformatie, en slaat gekwalificeerde leads automatisch op in HighLevel CRM.

## Technologie

| Laag | Technologie |
|------|-------------|
| AI | [Anthropic Claude](https://anthropic.com) via `@anthropic-ai/sdk` |
| API | Vercel Serverless Functions (TypeScript) |
| Sessieopslag | Vercel KV (Redis) |
| CRM | HighLevel |
| Widget | Vanilla JavaScript (embed op elke website) |

## Projectstructuur

```
vangestel-agent/
├── api/
│   └── chat.ts          # Vercel serverless function — verwerkt chatberichten
├── widget/
│   └── widget.js        # Embed-widget voor de website van Van Gestel
├── .env.example         # Vereiste omgevingsvariabelen
├── package.json
└── tsconfig.json
```

## Aan de slag

### 1. Installeer dependencies

```bash
npm install
```

### 2. Maak een `.env.local` aan

```bash
cp .env.example .env.local
# Vul de waarden in
```

### 3. Start de development server

```bash
npx vercel dev
```

### 4. Widget insluiten

Voeg onderstaand script toe aan de website van Van Gestel, vlak voor `</body>`:

```html
<script
  src="https://jouw-vercel-domein.vercel.app/widget/widget.js"
  data-api-url="https://jouw-vercel-domein.vercel.app/api/chat"
  data-color="#1a56db"
  defer
></script>
```

## Omgevingsvariabelen

Zie `.env.example` voor een volledig overzicht. Stel deze in via het Vercel dashboard voor productie.

---

*Gebouwd door [Alona Marketing](https://alonamedia.nl)*
