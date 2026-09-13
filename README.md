# Durga Pujo Bhog — Backend

A small self-contained backend for your bhog-booking site. It:

- accepts orders (name, phone, email, plate count) from the storefront
- stores every order with a unique Order ID
- generates the UPI payment link/QR the customer pays with
- optionally emails you the moment a new order comes in
- gives you a password-protected dashboard to see every order, mark
  orders as paid, and export everything to CSV/Excel

It's a plain Node.js + Express app, so you can run it on your laptop,
a cheap VPS, or a free host like Render or Railway.

## What's in this folder

```
server.js          the API (order creation, admin endpoints)
email.js           optional email notification on new orders
public/index.html  the customer-facing storefront
public/admin.html  your seller dashboard
.env.example        configuration template — copy to .env
db.json             created automatically the first time you run it
```

Orders are stored in `db.json`, a plain JSON file next to `server.js`.
That's enough for a single pujo committee's order volume and needs no
database setup. (See "A note on data storage" below for the one thing
to watch out for when you deploy.)

## 1. Run it on your own computer first

You'll need [Node.js](https://nodejs.org) installed (version 18 or newer).

```bash
cd bhog-backend
npm install
cp .env.example .env
```

Open `.env` in any text editor and set:

- `ADMIN_API_KEY` — make up a long random password. This is what protects
  your dashboard, so don't reuse a password from elsewhere.
- (Optional) `SELLER_EMAIL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` — fill
  these in if you want an email every time someone places an order. The
  template is pre-filled for Gmail: turn on 2-Step Verification on your
  Google account, then create an "App password" and use that as
  `SMTP_PASS` (your normal Gmail password won't work here).

Then start the server:

```bash
npm start
```

Visit **http://localhost:3000** — that's your storefront.
Visit **http://localhost:3000/admin.html** — that's your dashboard;
log in with the `ADMIN_API_KEY` you set above.

The first thing to do in the dashboard is enter your real UPI ID and
your committee's display name, and save it — that's what gets embedded
in every customer's payment link and QR code.

## 2. Put it online

Any host that can run a Node.js app works. Two easy, free-tier-friendly
options:

### Render.com
1. Push this folder to a GitHub repository.
2. On Render, choose **New → Web Service**, connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Under **Environment**, add the same variables from your `.env` file
   (`ADMIN_API_KEY`, and the email ones if you want them).
5. Deploy. Render gives you a public URL like `https://your-app.onrender.com`
   — that's the link you share with devotees, and
   `https://your-app.onrender.com/admin.html` is your dashboard.

### Railway.app
Same idea: connect the repo, set the environment variables in the
project's **Variables** tab, and Railway builds and runs it automatically.

## A note on data storage

`db.json` lives on the server's own disk. That's fine on a VPS or your
own machine — the file just sits there and grows. On some free hosting
tiers (including Render's free web service) the disk is wiped on every
redeploy or restart, which would erase your orders. If you plan to run
this for a real pujo:

- on Render, attach a small **persistent disk** to the service (a paid
  add-on) and point it at the app's folder, or
- run it on a $5/month VPS (DigitalOcean, a basic Railway/Render paid
  plan, etc.) where the disk persists normally, or
- export to CSV regularly from the dashboard as a simple backup habit.

For a single pujo season's worth of orders this is a very safe, simple
setup — it's only worth upgrading to a real database (Postgres, etc.)
if you expect thousands of orders or need multiple people editing at once.

## Security notes

- Treat `ADMIN_API_KEY` like a password — anyone who has it can see every
  customer's name, phone, and email, and mark orders paid.
- Never commit your real `.env` file to a public GitHub repo — only
  `.env.example` should be shared.
- This app accepts payment *information* only; the actual money movement
  happens inside the customer's own UPI app (Google Pay, PhonePe, Paytm,
  etc.) when they scan the QR or tap the pay button. Because of that,
  orders start as "pending" and you confirm them as "paid" yourself in
  the dashboard once you see the money land in your UPI account — match
  it using the Order ID, which is sent as the payment note/reference.
