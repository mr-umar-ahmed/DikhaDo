# Taking DikhaDo to a second country

Weak connectivity, informal skilled labour and low literacy describe much of the world, not one country. Nothing in DikhaDo's code assumes India. Moving to Nairobi, Dhaka or Lima is a **data change in five places**; no screen, no model code and no database function is touched.

| # | What changes | Where | Example for Kenya |
|---|---|---|---|
| 1 | The service catalog and price ranges | `mobile/src/data/catalog.ts` and the `categories` / `rate_cards` rows in `supabase/seed.sql` | add *boda-boda repair*, *water tank cleaning*, *solar panel and battery*; prices in KES |
| 2 | Languages | `mobile/src/i18n/strings.ts` (one object per language — the TypeScript type refuses an incomplete one) and one line per script in `mobile/src/theme/type.ts` | English + Swahili; Latin script needs no new font |
| 3 | What people say | `mobile/src/ai/intent.ts` | `'bomba'`, `'mfereji'` → `tap_leak`; `'stima'`, `'waya'` → electrical |
| 4 | Where public problems go | the `civic_route` function in `supabase/migrations/0004` (a five-row table) | *Garbage → County environment office, 24 h* |
| 5 | How people pay and call | the UPI deep link in `mobile/src/app/job/[id].tsx` | swap `upi://pay` for the M-Pesa deep link or a till number shown as text; `tel:` and WhatsApp links are universal |

Everything else carries over as it is:

- **The vision model.** The stock model knows objects, not countries. A local fine-tune is `ml/train.py` on locally shot photos — folder names are the routing, so new classes need no app change.
- **On-device speech.** The app asks Android for the offline pack of the chosen locale (`sw-KE`) and offers to download it; where no pack exists the same button records a voice note.
- **Matching, the job state machine, presence, offline queue, Proof of Fix, the console** — all language- and country-neutral.
- **Currency** is a display string (`₹`) used in a handful of templates; a `currency` constant next to the catalog replaces it.

Rough effort for a second country with two languages: two to three days, most of it translation review and shooting a few hundred local photos.
