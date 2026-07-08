# 5️⃣ How the Summary Works

*(How a day of raw interactions becomes the reorder list, the lost-sales breakdown, and the revenue number.)*

The listening and extraction work you saw in docs #1–3 produces a stream of **interaction records** — one per customer request. Each looks like:

```json
{
  "id": "abc123",
  "ts": "2026-07-08T10:32:15.234Z",
  "product": "Sugar",
  "outcome": "lost_expensive_here",
  "price": 45,
  "reason": "My price too high",
  "snippet": "..."
}
```

By itself, that's just data. The **Summary tab** is where the app turns hundreds of these into decisions you can act on.

---

## The five numbers at the top

At the top of the Summary tab are four "metric cards":

| Card | What it is | How it's calculated |
|---|---|---|
| **Total Interactions** | Every recognized customer request today | `count of interactions on this day` |
| **Sales Made** | Products successfully sold | `count where outcome == 'sold'` |
| **Revenue** | Money captured | `sum of prices where outcome == 'sold'` |
| **Lost Sales** | Products the customer refused | `count where outcome starts with 'lost_'` |
| **Out of Stock Asks** | Products you didn't have | `count where outcome == 'oos'` |

The corresponding JavaScript is very simple:

```javascript
const sold = items.filter(i => i.outcome === 'sold');
const lost = items.filter(i => i.outcome.startsWith('lost_'));
const oos = items.filter(i => i.outcome === 'oos');
const revenue = sold.reduce((s, i) => s + (Number(i.price) || 0), 0);
```

That's the whole summary math — just filtering and adding.

---

## The reorder list — "What did I run out of?"

This is arguably **the most useful section for a shopkeeper**. It answers: *"Which items did customers ask for that I didn't have, so I remember to order them?"*

The logic:

1. Filter to only interactions where `outcome == 'oos'` (out of stock).
2. Group them by product name.
3. Count how many times each was asked.
4. Sort descending by count.

```javascript
const reorderCounts = {};
oos.forEach(i => {
  reorderCounts[i.product] = (reorderCounts[i.product] || 0) + 1;
});
const reorderEntries = Object.entries(reorderCounts).sort((a, b) => b[1] - a[1]);
```

The output looks like:

```
🧾 To Reorder — Products asked but not in stock

Dettol Soap         5× asked
Amul Butter         3× asked
Maggi               2× asked
Frooti / Maaza      1× asked
```

Now you know: when you place your next wholesaler order, definitely restock Dettol Soap first — you lost 5 customers to it today. Amul Butter next. Frooti was asked once — maybe not urgent.

**Why counting matters**: if 3 customers asked for the same product, that's a stronger reorder signal than 3 different one-off requests.

---

## The lost-sales breakdown — "Why did I lose sales?"

The three lost-sale outcomes are shown as chips:

```
💰 My price too high            🏪 Cheaper elsewhere          🤷 Other reason
    3                                7                              2
```

Each number is a simple `.filter().length`:

```javascript
const breakdown = {
  lost_expensive_here:      lost.filter(i => i.outcome === 'lost_expensive_here').length,
  lost_cheaper_elsewhere:   lost.filter(i => i.outcome === 'lost_cheaper_elsewhere').length,
  lost_other:               lost.filter(i => i.outcome === 'lost_other').length,
};
```

### Reading the breakdown

The relative sizes of these three numbers tell you where your problem is:

- **"My price too high" is highest** → Your prices might be above what your customers accept. Consider negotiating better rates with wholesalers or advertising discounts.
- **"Cheaper elsewhere" is highest** → A competitor is undercutting you on specific items. Take note of which — the list below the chips shows product-by-product.
- **"Other reason" is highest** → Customers were just browsing / not committed. Less actionable, but worth watching over time.

Below the chips is a detailed list of every lost sale:

```
Dettol Soap    · Cheaper elsewhere    · 10:32 AM   · ₹45
Amul Butter    · My price too high    · 11:15 AM   · ₹52
Maggi          · Cheaper elsewhere    · 11:44 AM
...
```

Each row is one lost customer. Tap any of them to open the edit modal and correct the outcome if needed.

---

## The sold list — "What did I actually sell?"

Same idea, filtered to `outcome == 'sold'`:

```
✅ Successful Sales

Sugar (₹45)          · 10:14 AM
Maggi (₹15)          · 10:22 AM
Amul Milk (₹30)      · 10:31 AM
...
```

Sum of all the prices = the **Revenue** metric card at the top.

---

## The date picker — "Show me yesterday's summary"

The Summary tab has a date field at the top. When you change it:

```javascript
document.getElementById('summary-date').addEventListener('change', renderSummary);
```

… the entire summary is recomputed with `items = interactions.filter(i => dayOf(i.ts) === chosenDate)`. Everything above updates automatically.

That means you can look back at any past day (as long as you haven't cleared your storage). Great for weekly reviews.

---

## Export — turning the summary into a spreadsheet

The **Export CSV** button dumps every interaction for the selected date to a CSV file. Import it into Google Sheets or Excel and you can:

- Build your own pivot tables.
- Compare weeks / months.
- Spot patterns (e.g. "Wednesday evenings have more soap requests than any other time").
- Share with a business partner.

The CSV has these columns:

```
ts, date, time, product, outcome, price, reason, notes, snippet, source
```

The `source` column tells you whether the record came from `rules`, `ai`, or `manual` — useful to know how reliable each row is.

---

## The Log tab — the raw feed

The **📒 Log tab** is different from the Summary. Where the Summary is grouped and totaled, the Log is a flat list of every interaction sorted by time, most recent first.

You can filter it by:

- **Date** — pick any day.
- **Outcome** — All / Sold / Lost / Out of stock / Unclear.

This is where you go to **correct mistakes**. Tap any row, and the edit modal opens where you can:

- Change the product name (if the app got it wrong).
- Change the outcome.
- Add a price.
- Add notes.
- Delete the interaction if it was garbage.

Every correction updates the storage immediately, and the Summary tab refreshes to reflect it the next time you visit.

---

## The mental model to keep

```
                Every interaction ever
                         │
    ┌────────────────────┼────────────────────┐
    ↓                    ↓                    ↓
Filter by day     Group by outcome     Group by product
(the date picker)  (sold / lost /       (for reorder counts)
                    oos / unclear)
    ↓                    ↓                    ↓
    └──────────────── Metric cards ──────────┘
                    Reorder list
                    Lost breakdown
                    Sold list
```

That's the whole Summary tab. Just filtering, grouping, and counting — no fancy statistics.

The design philosophy is: **give the shopkeeper concrete, actionable numbers, not fluff**. There is nothing here that requires a math background to interpret.

---

**Next:** [6️⃣ How Hosting Works →](06-how-hosting-works.md)
