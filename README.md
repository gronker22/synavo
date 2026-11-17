# Synavo: never get stuck when your bank goes down

**Live MVP:** https://marko698.pythonanywhere.com
**Course:** Fintech: Technology Transforming Financial Services (IE University), Prof. Manoel Gadi
**Team:** Megan, Markos, Nyan, Pranjal

Synavo is a lightweight overlay app for students and young people. It connects the bank accounts and payment apps they already have and:

1. **Smart Reroute:** when a bank or app crashes, times out or wrongly blocks a payment, Synavo pays through another account that works. Card payments and direct debits.
2. **Subscriptions & bills:** tracks subscriptions, free trials, rent and utility bills, and money friends owe you, with reminders, so nothing is forgotten or paid late.

No login is needed. The app opens with demo data, and everything a tester changes is saved in their own browser. There are no real bank connections.

---

## 1. Assigned risk: operational risk

Banks and payment apps fail internally (outages, slow systems, false security blocks), but it's the user who can't pay. Young people often depend on a single bank or app, so when it fails they have no fallback.

Our interviews with 4 young people found:

* A **tuition payment** blocked for 3 days (4 phone calls to fix), a **concert ticket** and a **limited clothing drop** lost because a payment was blocked and there was no backup.
* **Forgotten subscriptions** were the top source of stress for 3 of 4: a gym membership after switching gyms, a Duolingo free trial that renewed for a year, and a €5/month Amazon plan.
* Everyone asked for **security and transparency** before trusting an app with payments.

## 2. What already works (user journeys)

| Journey | What the user does | What they get |
|---|---|---|
| Reroute a blocked payment (core journey) | Opens **Reroute**, taps a what-if (€950 tuition with a Santander outage, €65 concert ticket with Revolut blocked, €650 rent direct debit with Santander down) or types their own payment, then **Continue securely** | The app calls `POST /api/reroute`. It shows each attempt step by step (original account failed and why, backup checked), asks for approval above the user's limit (**Approve and resend**), pays from a working account, updates the balance and logs the payment as *Rerouted* |
| Simulate an outage | On **Home**, taps an account's status pill (All good → Outage → Running slow → Payments blocked) | The status is used in every reroute, and bills due from an account with an outage get a warning |
| Set rules | Auto-reroute on/off, "ask me above" approval limit, safety buffer | The engine follows them on every payment. The backup order is shown on the Reroute page |
| Track subscriptions & bills | **Money** tab: adds a subscription or bill, cancels or removes one | Monthly subscription total, payments due soon, potential yearly savings, "trial ends" and "unused 30+ days" alerts, and the yearly saving shown when cancelling |
| Collect money owed | Adds who owes what, taps **Nudge** or **Mark paid** | Nudge opens WhatsApp with a friendly reminder message. Paid IOUs are logged as received |
| Activity log | **Activity** tab | Every payment, reroute, cancellation and repayment |
| Reset | **Reset demo** | Back to the demo data. Everything else is saved in the browser (localStorage) |

If the API can't be reached (for example in the v0 preview), the app falls back to a simplified local copy of the rules so the demo still works.

## 3. Still to complete

* Real bank connections through PSD2 open banking APIs (with user consent) instead of demo accounts
* Real push/email reminders for bills and trials (now shown inside the app only)
* Editing existing items, choosing the account and payment method for new items, and changing the backup order by dragging
* Automatic "last used" detection for subscriptions (now demo dates)
* A working help screen and activity filters
* User accounts so data syncs across devices (now stored per browser)
* Automatic detection of outages from bank status feeds
* Use the missed-payment risk model inside the app (it runs today as a separate API, see below)
* Security review, terms and regulatory checks (PSD2 payment initiation licence or partner)

## 4. Project structure

```
├── flask_app.py          # Flask app: serves the front end + all API routes
├── synavo_engine.py      # Smart Reroute engine (decides which account pays)
├── risk_model/           # Missed-payment ML model from the ML assignment
│   ├── fintech.py        #   generates synthetic data and trains the model
│   ├── fintech.xlsx      #   synthetic dataset
│   └── fintech.joblib    #   trained logistic regression
├── templates/model.html  # risk model page (/model)
├── static/css/model.css
├── frontend/             # Next.js + Tailwind front end (made with v0)
│   ├── components/synavo-app.tsx   # the whole app UI
│   └── out/              #   static build served by Flask (committed)
├── tests/test_app.py     # API checks (local or against the live site)
├── requirements.txt
└── README.md
```

## 5. API

### `POST /api/reroute`

Decides which of the user's own accounts should make a payment. Synavo never holds money: it only picks the account.

**Example request:** €950 tuition while Santander is down

```bash
curl -X POST https://marko698.pythonanywhere.com/api/reroute \
  -H "Content-Type: application/json" \
  -d '{
    "payment": {"payee": "IE University tuition", "amount": 950, "type": "card"},
    "primary_account_id": "santander",
    "accounts": [
      {"id": "santander", "name": "Santander", "balance": 1240, "status": "down", "allow_reroute": true, "priority": 1},
      {"id": "revolut",   "name": "Revolut",   "balance": 1380, "status": "up",   "allow_reroute": true, "priority": 2},
      {"id": "n26",       "name": "N26",       "balance": 210,  "status": "up",   "allow_reroute": true, "priority": 3}
    ],
    "rules": {"auto_reroute": true, "confirm_above": 200, "keep_buffer": 50},
    "confirmed": false
  }'
```

**Response:** the amount is above the €200 approval limit, so Synavo asks first

```json
{
  "status": "needs_confirmation",
  "proposed_account_id": "revolut",
  "paid_from_account_id": null,
  "paid_from": null,
  "fee": 0,
  "message": "Santander failed. Pay €950.00 from Revolut instead? This is above your €200 approval limit.",
  "payment": {"payee": "IE University tuition", "amount": 950.0, "type": "card"},
  "attempts": [
    {"account_id": "santander", "account": "Santander", "role": "original", "result": "failed", "reason": "Santander is down (bank outage)"},
    {"account_id": "revolut", "account": "Revolut", "role": "backup", "result": "available", "reason": "Revolut is up and has enough money"}
  ]
}
```

Send the same request with `"confirmed": true` and the status becomes `rerouted`, with `paid_from_account_id: "revolut"` and a `rebalance` suggestion.

| Field | Values |
|---|---|
| `payment.type` | `card`, `direct_debit`, `transfer` |
| `accounts[].status` | `up`, `slow` (times out), `blocked` (security block), `down` (outage) |
| `rules.confirm_above` | ask the user before rerouting more than this amount |
| `rules.keep_buffer` | never leave a backup account with less than this |
| `status` (response) | `paid`, `rerouted`, `needs_confirmation`, `failed` |

Invalid input returns `400` with `{"error": "Invalid input", "details": {...}}`.

### Missed-payment risk model

From the ML assignment: a logistic regression trained on 5,000 synthetic users (test accuracy about 0.73). It predicts whether a user will miss a bill or subscription payment next month.

```
GET https://marko698.pythonanywhere.com/api/predict?months_as_user=6&avg_monthly_balance=450&active_subscriptions=9
```

Also available at `/probmissedpayment`, `/probmissedpaymentfixed`, `POST /api/predict` (JSON), and as a form at `/model`.

### Other

`GET /api/health`, `GET /api` (list of endpoints).

## 6. Run locally

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..   # builds frontend/out
python3 flask_app.py                                    # http://127.0.0.1:5000
python3 tests/test_app.py                               # API checks
```

## 7. Deploy on PythonAnywhere

1. In a Bash console: `git clone https://github.com/gronker22/synavo.git` (the built front end in `frontend/out` is included, so no Node.js is needed on the server).
2. Retrain the model with the web app's Python version: `cd synavo/risk_model && python3.13 fintech.py`
3. Web tab: set **Source code** and **Working directory** to `/home/USERNAME/synavo`.
4. WSGI file:
   ```python
   import sys
   path = '/home/USERNAME/synavo'
   if path not in sys.path:
       sys.path.insert(0, path)

   from flask_app import app as application
   ```
5. Reload, then test: `python3 tests/test_app.py https://USERNAME.pythonanywhere.com`
