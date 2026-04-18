# GRE Chatbot

This project is a Next.js app for the Green Rural Economy dataset. It provides:

- a public search and chatbot experience grounded in the GRE solutions dataset
- an admin console for uploading fresh solution and trader Excel exports
- a Supabase schema and import workflow to store normalized records

## Stack

- Next.js App Router
- Supabase for Postgres and Auth
- OpenAI for grounded response generation
- Excel parsing with `xlsx`

## Pages

- `/` public chatbot and search
- `/admin` admin sign-in and Excel upload

## Environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ADMIN_EMAILS`

`ADMIN_EMAILS` should be a comma-separated list of email addresses allowed to import data.

## Supabase setup

1. Create a Supabase project.
2. Run the SQL in `supabase/migrations/001_init.sql`.
3. Enable email auth in Supabase Auth.
4. Add the site URL and redirect URL for `/admin`.

## Local run

```bash
npm install
npm run dev
```

## Import flow

1. Visit `/admin`.
2. Sign in with an approved admin email.
3. Upload the latest `solution_data...xlsx` and `trader_data...xlsx` files.
4. The API route normalizes the workbooks and upserts traders, solutions, and offerings.

## Notes

- The importer preserves the raw source payloads in JSON for auditability.
- Search is retrieval-first and the chat route only answers from matched records.
- The current implementation keeps multi-value fields such as tags, value chains, applications, and languages on the offering row for simpler querying.
