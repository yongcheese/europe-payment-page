# AgentAISLM — European token top-up prototype

A pure front-end pricing, authentication and checkout prototype inspired by modern AI pricing pages.

## What it includes

- Responsive European pricing page
- Country, currency and estimated VAT switching
- AgentAISLM token plans with Diners Club checkout support
- Pure front-end registration and login simulation
- Browser `localStorage` for demo users, active session and interface preferences
- No server, backend, database or payment gateway
- Public payment attempts do not complete a real payment
- Simplified Chinese, French, English, Portuguese and German interface languages
- System, light and dark appearance modes
- Text size, interface density, high contrast and reduced-motion settings

## Pricing

Monthly prices:

- Free: €0
- Go: €3
- Plus: €5
- Pro: €20

Annual billing uses a 20% discount. When **Annual** is selected, the large price is the full yearly charge:

- Free: €0 per year
- Go: €28.80 per year
- Plus: €48 per year
- Pro: €192 per year

The smaller line beneath each yearly total shows the average monthly cost and the amount saved.

## Demo login

Create an account from the **Log in** button and switch to **Create account**. The account exists only in the current browser.

Do not reuse a real password. This is a UI prototype, not a secure authentication system.

## Run

Open `index.html` directly in a browser.

## Stability fix

The country and language controls use a guarded translation observer. Translation-generated DOM changes no longer trigger an endless retranslation loop, and country/cycle updates are applied synchronously to prevent text flashing.


## Biometric and payment result demo

- Payment submission opens a simulated biometric verification page.
- Face ID, fingerprint, and Windows Hello are visual simulations only.
- The user can choose a success or failure test outcome.
- Both outcomes open full-screen result pages.
- No camera, fingerprint sensor, WebAuthn, payment gateway, or backend is accessed.
- Browser-tab icons use favicon.ico, favicon-32.png, and apple-touch-icon.png with cache-busting version parameters.


## System biometric / device verification

This build uses the browser WebAuthn API with a platform authenticator. On supported Apple devices the operating system may present Touch ID, Face ID, or the device passcode. On Windows it may present Windows Hello; on Android it may present biometrics or the screen lock.

WebAuthn must be opened from HTTPS or localhost. It will not work when `index.html` is opened directly as a normal `file://` page. Run:

```bash
python3 serve.py
```

Then open `http://localhost:8080`.

This project still has no backend. The device prompt is real, but the signed assertion is accepted locally and is not suitable as production payment authorization without server-side challenge storage and signature verification.

The designated test card automatically fills the remaining card and billing fields after the complete card number is entered. Because the project is pure front-end, the test-card rule can be discovered by inspecting the JavaScript and cannot be treated as a secret.
