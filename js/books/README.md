# Livro Schema

Use `js/books/book-config.js` as the source of truth for every new book.

## Required fields

- `id`
- `title`
- `pdf`
- `order`
- `category`
- `pillar`

## Recommended fields

- `slug`
- `subtitle`
- `shortDescription`
- `longDescription`
- `cover`
- `status`
- `progress`
- `atmosphere`
- `theme`
- `tags`
- `featured`
- `available`
- `createdAt`
- `updatedAt`

## Notes

- The PDF is the only source of page content.
- Covers can come from the registry, but they never replace PDF pages.
- `createBook()` normalizes legacy fields like `summary`, `caption`, `readerSubtitle`, `act`, and `pageCount` into the official schema.
- `validateBook()` returns `{ valid, errors }` so bad entries can be caught before the registry is consumed.
- `buildBookRegistry()` normalizes the full registry and is the preferred entry point for future books.
- `window.PSEU_DEV_MODE = true` enables internal diagnostics and console validation.
- `js/books/book-diagnostics.js` validates required fields, duplicate ids/slugs, and asset availability without changing the reader.
- Available books must always have `pdf` and `cover`. Books marked as `em breve` can remain without final assets, but will be reported as warnings.

## Example

```js
const book = PSEU_BOOK_CONFIG.createBook({
  id: "novo-livro",
  title: "Novo Livro",
  category: "Iniciação / Tema",
  pillar: "Ato I · Limiar",
  shortDescription: "Resumo curto.",
  longDescription: "Descrição longa.",
  cover: "livros/capas/novo-livro.png",
  pdf: "livros/novo-livro/novo-livro.pdf",
  order: 3,
  progress: 0,
  atmosphere: {
    mood: "stoic",
    primaryColor: "#D4AF37",
    secondaryColor: "#2B1D4F",
    glow: "soft",
    particles: "minimal",
    background: "dark-stone",
    intensity: "low",
  },
  theme: {
    name: "stoic",
    tone: "calm",
    accent: "gold",
    surface: "stone",
  },
  tags: ["estoicismo", "disciplina"],
  featured: false,
  available: true,
});
```

## Diagnostics flow

When `PSEU_DEV_MODE` is enabled, the portal checks:

- book schema completeness
- duplicate ids and slugs
- PDF and cover availability
- cover load
- first page load
- initial spread load
- navigation and progress save events

Console examples:

- `[PSEU CHECK] Livro OK: Manual do Despertar`
- `[PSEU WARNING] Capa nao encontrada: Manual do Lider Estoico`
- `[PSEU ERROR] PDF ausente: Nome do Livro`
