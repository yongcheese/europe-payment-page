const dinersMethods = ['diners', 'dinersCorporate', 'discoverDiners'];
const AUTH_USERS_KEY = 'orbis_demo_users_v1';
const AUTH_SESSION_KEY = 'orbis_demo_session_v1';
const TEST_CARD_NUMBER = '30569309025904';
const WEBAUTHN_CREDENTIALS_KEY = 'agentaislm_webauthn_credentials_v1';

const countryData = {
  DE: { name: 'Germany', currency: 'EUR', locale: 'de-DE', vat: 19, methods: dinersMethods },
  FR: { name: 'France', currency: 'EUR', locale: 'fr-FR', vat: 20, methods: dinersMethods },
  NL: { name: 'Netherlands', currency: 'EUR', locale: 'nl-NL', vat: 21, methods: dinersMethods },
  BE: { name: 'Belgium', currency: 'EUR', locale: 'nl-BE', vat: 21, methods: dinersMethods },
  PL: { name: 'Poland', currency: 'PLN', locale: 'pl-PL', vat: 23, methods: dinersMethods },
  AT: { name: 'Austria', currency: 'EUR', locale: 'de-AT', vat: 20, methods: dinersMethods },
  ES: { name: 'Spain', currency: 'EUR', locale: 'es-ES', vat: 21, methods: dinersMethods },
  IT: { name: 'Italy', currency: 'EUR', locale: 'it-IT', vat: 22, methods: dinersMethods },
  IE: { name: 'Ireland', currency: 'EUR', locale: 'en-IE', vat: 23, methods: dinersMethods },
  PT: { name: 'Portugal', currency: 'EUR', locale: 'pt-PT', vat: 23, methods: dinersMethods },
  SE: { name: 'Sweden', currency: 'SEK', locale: 'sv-SE', vat: 25, methods: dinersMethods },
  DK: { name: 'Denmark', currency: 'DKK', locale: 'da-DK', vat: 25, methods: dinersMethods },
  FI: { name: 'Finland', currency: 'EUR', locale: 'fi-FI', vat: 25.5, methods: dinersMethods },
  GB: { name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', vat: 20, methods: dinersMethods },
  CH: { name: 'Switzerland', currency: 'CHF', locale: 'de-CH', vat: 8.1, methods: dinersMethods }
};

const paymentMethods = {
  diners: {
    name: 'Diners Club International', icon: '<img src="diners-club.svg" alt="Diners Club International">', detail: 'Personal Diners Club card',
    description: 'The card is checked locally after platform device verification. No live payment gateway is connected.'
  },
  dinersCorporate: {
    name: 'Diners Club Corporate', icon: '<img src="diners-corporate.svg" alt="Diners Club Corporate">', detail: 'Corporate or business card',
    description: 'This option uses the same platform device verification flow and never sends card data to a live gateway.'
  },
  discoverDiners: {
    name: 'Discover / Diners Club Network', icon: '<img src="discover-diners.svg" alt="Discover Diners Club Network">', detail: 'Related network card',
    description: 'This network option is checked locally after the device verification step.'
  }
};

const planPricesEUR = { Free: 0, Go: 3, Plus: 5, Pro: 20 };
const conversion = { EUR: 1, GBP: 0.86, CHF: 0.96, PLN: 4.25, SEK: 11.1, DKK: 7.46 };

let selectedCountry = 'DE';
let selectedCycle = 'monthly';
let selectedPlan = 'Plus';
let selectedMethod = 'diners';
let pendingPlan = null;
let authMode = 'login';
let selectedBiometricMethod = 'platform';
let biometricTimer = null;
let platformAuthenticatorAvailable = false;
let lastVerificationLabel = 'Device verification';
const memoryStorage = new Map();

const countrySelect = document.getElementById('countrySelect');
const methodPreviewGrid = document.getElementById('methodPreviewGrid');
const paymentMethodList = document.getElementById('paymentMethodList');
const paymentFields = document.getElementById('paymentFields');
const modal = document.getElementById('checkoutModal');
const authModal = document.getElementById('authModal');
const successScreen = document.getElementById('successScreen');
const failureScreen = document.getElementById('failureScreen');
const biometricModal = document.getElementById('biometricModal');
const checkoutForm = document.getElementById('checkoutForm');
const authForm = document.getElementById('authForm');
const businessPurchase = document.getElementById('businessPurchase');
const vatField = document.getElementById('vatField');
const toast = document.getElementById('toast');
const signInButton = document.getElementById('signInButton');

function convertedPrice(eurValue, currency) {
  return eurValue * (conversion[currency] || 1);
}

function formatMoney(value, country = countryData[selectedCountry]) {
  return new Intl.NumberFormat(country.locale, {
    style: 'currency', currency: country.currency, minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);
}

function unitPrice(plan = selectedPlan) {
  const country = countryData[selectedCountry];
  const base = convertedPrice(planPricesEUR[plan], country.currency);
  return selectedCycle === 'annual' ? base * 0.8 : base;
}

function chargeSubtotal(plan = selectedPlan) {
  const perMonth = unitPrice(plan);
  return selectedCycle === 'annual' ? perMonth * 12 : perMonth;
}

function annualTotal(plan) {
  const country = countryData[selectedCountry];
  return convertedPrice(planPricesEUR[plan], country.currency) * 0.8 * 12;
}

function annualSaving(plan) {
  const country = countryData[selectedCountry];
  return convertedPrice(planPricesEUR[plan], country.currency) * 0.2 * 12;
}

function updateAnnualPriceNotes() {
  const country = countryData[selectedCountry];
  document.querySelectorAll('[data-annual-plan]').forEach((element) => {
    const plan = element.dataset.annualPlan;
    if (selectedCycle === 'annual') {
      const averageMonthly = annualTotal(plan) / 12;
      element.textContent = plan === 'Free'
        ? `Average ${formatMoney(averageMonthly, country)} / month`
        : `Average ${formatMoney(averageMonthly, country)} / month · save ${formatMoney(annualSaving(plan), country)}`;
    } else {
      element.textContent = `Annual: ${formatMoney(annualTotal(plan), country)} / year${plan === 'Free' ? '' : ' · save 20%'}`;
    }
  });
}

function getVatRate() {
  const country = countryData[selectedCountry];
  const vatNumber = document.getElementById('vatNumber').value.trim();
  return businessPurchase.checked && vatNumber ? 0 : country.vat;
}

function getTotal() {
  const subtotal = chargeSubtotal();
  return subtotal + subtotal * (getVatRate() / 100);
}

function updatePrices() {
  const country = countryData[selectedCountry];
  document.querySelectorAll('.price').forEach((element) => {
    const plan = element.closest('.plan-card').dataset.planCard;
    const displayedPrice = selectedCycle === 'annual' ? annualTotal(plan) : unitPrice(plan);
    element.textContent = formatMoney(displayedPrice, country).replace(/\.00|,00/, '');
  });
  document.querySelectorAll('.price-period').forEach((element) => {
    element.textContent = selectedCycle === 'annual' ? '/ year' : '/ month';
  });
  updateAnnualPriceNotes();
  document.getElementById('taxSummary').textContent = `Prices shown before estimated ${country.name} VAT (${country.vat}%).`;
  updateSummary();
}

function renderMethodPreview() {
  const country = countryData[selectedCountry];
  document.getElementById('localPaymentTitle').textContent = `Diners Club options in ${country.name}`;
  methodPreviewGrid.innerHTML = country.methods.map((key) => {
    const method = paymentMethods[key];
    return `<div class="payment-method-preview"><span class="method-icon">${method.icon}</span><div><strong>${method.name}</strong><span>${method.detail}</span></div></div>`;
  }).join('');
}

function renderPaymentMethods() {
  const country = countryData[selectedCountry];
  if (!country.methods.includes(selectedMethod)) selectedMethod = country.methods[0];

  paymentMethodList.innerHTML = country.methods.map((key, index) => {
    const method = paymentMethods[key];
    const checked = key === selectedMethod;
    return `<label class="payment-option ${checked ? 'selected' : ''}">
      <input type="radio" name="paymentMethod" value="${key}" ${checked ? 'checked' : ''} />
      <span class="method-icon">${method.icon}</span>
      <span><strong>${method.name}</strong><small>${method.detail}</small></span>
      ${index === 0 ? '<span class="recommended">Diners Club</span>' : ''}
    </label>`;
  }).join('');

  paymentMethodList.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', (event) => {
      selectedMethod = event.target.value;
      renderPaymentMethods();
      translateInterface();
    });
  });
  renderPaymentFields();
}

function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function renderPaymentFields() {
  const method = paymentMethods[selectedMethod];
  paymentFields.innerHTML = `
    <div class="card-fields">
      <label class="field"><span>Diners Club card number</span><input id="cardNumber" type="text" inputmode="numeric" autocomplete="off" placeholder="0000 0000 0000 00" maxlength="17" data-payment-required /><small class="error-message">Enter a 14-digit card number.</small></label>
      <label class="field"><span>Name on card</span><input id="cardName" type="text" autocomplete="off" placeholder="Cardholder name" data-payment-required /><small class="error-message">Required.</small></label>
      <div class="card-row">
        <label class="field"><span>Expiry</span><input id="cardExpiry" type="text" inputmode="numeric" autocomplete="off" placeholder="MM / YY" maxlength="7" data-payment-required /><small class="error-message">Use MM / YY.</small></label>
        <label class="field"><span>Security code</span><input id="cardSecurity" type="password" inputmode="numeric" autocomplete="off" placeholder="123" maxlength="4" data-payment-required /><small class="error-message">Enter 3–4 digits.</small></label>
      </div>
      <div class="method-info">${method.description}</div>
    </div>`;

  const cardNumber = document.getElementById('cardNumber');
  cardNumber.addEventListener('input', () => {
    cardNumber.value = formatCardNumber(cardNumber.value);
    const digits = cardNumber.value.replace(/\D/g, '');
    if (digits !== TEST_CARD_NUMBER) delete cardNumber.dataset.autofilled;
    autoFillTestPaymentData(digits);
  });
  document.getElementById('cardExpiry').addEventListener('input', (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
    event.target.value = digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
  });
  document.getElementById('cardSecurity').addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  });
}

function setInputValue(id, value, overwrite = false) {
  const input = document.getElementById(id);
  if (!input || (!overwrite && input.value.trim())) return;
  input.value = value;
  input.closest('.field')?.classList.remove('invalid');
}

function demoBillingProfile() {
  const profiles = {
    DE: { address: '1 Agent Strasse', postalCode: '10115', city: 'Berlin' },
    FR: { address: '1 Rue Agent', postalCode: '75001', city: 'Paris' },
    NL: { address: '1 Agentstraat', postalCode: '1012 JS', city: 'Amsterdam' },
    BE: { address: '1 Agentstraat', postalCode: '1000', city: 'Brussels' },
    PL: { address: '1 Ulica Agent', postalCode: '00-001', city: 'Warsaw' },
    AT: { address: '1 Agentgasse', postalCode: '1010', city: 'Vienna' },
    ES: { address: '1 Calle Agent', postalCode: '28001', city: 'Madrid' },
    IT: { address: '1 Via Agent', postalCode: '00100', city: 'Rome' },
    IE: { address: '1 Agent Street', postalCode: 'D01', city: 'Dublin' },
    PT: { address: '1 Rua Agent', postalCode: '1000-001', city: 'Lisbon' },
    SE: { address: '1 Agentgatan', postalCode: '111 20', city: 'Stockholm' },
    DK: { address: '1 Agentgade', postalCode: '1050', city: 'Copenhagen' },
    FI: { address: '1 Agentkatu', postalCode: '00100', city: 'Helsinki' },
    GB: { address: '1 Agent Street', postalCode: 'SW1A 1AA', city: 'London' },
    CH: { address: '1 Agentstrasse', postalCode: '8001', city: 'Zurich' }
  };
  return profiles[selectedCountry] || profiles.DE;
}

function autoFillTestPaymentData(digits) {
  const cardNumber = document.getElementById('cardNumber');
  if (!cardNumber || digits !== TEST_CARD_NUMBER || cardNumber.dataset.autofilled === 'true') return;

  cardNumber.dataset.autofilled = 'true';
  const session = getSession();
  const displayName = (session?.name || 'Agent Demo').trim();
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const profile = demoBillingProfile();

  setInputValue('cardName', 'AGENTAISLM TEST', true);
  setInputValue('cardExpiry', '12 / 34', true);
  setInputValue('cardSecurity', '123', true);
  setInputValue('email', session?.email || 'demo@agentaislm.local');
  setInputValue('firstName', nameParts[0] || 'Agent');
  setInputValue('lastName', nameParts.slice(1).join(' ') || 'Demo');
  setInputValue('address', profile.address);
  setInputValue('postalCode', profile.postalCode);
  setInputValue('city', profile.city);
  document.getElementById('termsConsent').checked = true;
  document.getElementById('formError').classList.remove('visible');
  showToast('Test payment details generated automatically.');
}

function updateSummary() {
  const country = countryData[selectedCountry];
  const subtotal = chargeSubtotal();
  const vatRate = getVatRate();
  const tax = subtotal * (vatRate / 100);
  const total = subtotal + tax;

  document.getElementById('checkoutCountryText').textContent = `Billing in ${country.name} · ${country.currency} · Diners Club only`;
  document.getElementById('summaryPlanName').textContent = selectedPlan;
  document.getElementById('summaryCycle').textContent = selectedCycle === 'annual' ? 'Annual subscription' : 'Monthly subscription';
  document.getElementById('summaryBasePrice').textContent = formatMoney(subtotal);
  document.getElementById('summarySubtotal').textContent = formatMoney(subtotal);
  document.getElementById('summaryTaxLabel').textContent = vatRate === 0 ? 'VAT (demo reverse charge)' : `Estimated VAT (${country.vat}%)`;
  document.getElementById('summaryTax').textContent = formatMoney(tax);
  document.getElementById('summaryTotal').textContent = formatMoney(total);
  document.getElementById('payButtonAmount').textContent = formatMoney(total);
  document.getElementById('renewalText').textContent = selectedCycle === 'annual'
    ? `Demo yearly amount: ${formatMoney(subtotal)} before applicable tax. No real charge occurs.`
    : `Demo monthly amount: ${formatMoney(subtotal)} before applicable tax. No real charge occurs.`;
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return memoryStorage.get(key) || null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { memoryStorage.set(key, value); }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { memoryStorage.delete(key); }
}

function readUsers() {
  try { return JSON.parse(storageGet(AUTH_USERS_KEY)) || []; } catch { return []; }
}

function writeUsers(users) {
  storageSet(AUTH_USERS_KEY, JSON.stringify(users));
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getSession() {
  try { return JSON.parse(storageGet(AUTH_SESSION_KEY)); } catch { return null; }
}

function setSession(user) {
  storageSet(AUTH_SESSION_KEY, JSON.stringify({ email: user.email, name: user.name }));
  updateAuthUI();
}

function clearSession() {
  storageRemove(AUTH_SESSION_KEY);
  updateAuthUI();
}

function updateAuthUI() {
  const session = getSession();
  if (session) {
    signInButton.textContent = session.name || session.email.split('@')[0];
    signInButton.classList.add('signed-in');
    document.getElementById('accountName').textContent = session.name || 'AgentAISLM user';
    document.getElementById('accountEmail').textContent = session.email;
    document.getElementById('accountAvatar').textContent = (session.name || session.email).trim().charAt(0).toUpperCase();
  } else {
    signInButton.textContent = 'Log in';
    signInButton.classList.remove('signed-in');
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === 'register';
  document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authMode === mode));
  document.getElementById('authNameField').classList.toggle('hidden', !register);
  document.getElementById('authConfirmField').classList.toggle('hidden', !register);
  document.getElementById('authTitle').textContent = register ? 'Create your local account' : 'Welcome back';
  document.getElementById('authIntro').textContent = register
    ? 'Registration is simulated and stored only in this browser.'
    : 'Log in with an account stored only in this browser.';
  document.getElementById('authSubmitButton').textContent = register ? 'Create account' : 'Log in';
  document.getElementById('authPassword').autocomplete = register ? 'new-password' : 'current-password';
  document.getElementById('authError').textContent = '';
  authForm.querySelectorAll('.invalid').forEach((field) => field.classList.remove('invalid'));
}

function openAuth(showAccount = false) {
  const session = getSession();
  document.getElementById('authFormsView').classList.toggle('hidden', Boolean(session && showAccount));
  document.getElementById('accountView').classList.toggle('hidden', !session || !showAccount);
  if (!session || !showAccount) setAuthMode(authMode);
  authModal.classList.add('open');
  authModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const target = session && showAccount ? document.getElementById('continueAccount') : document.getElementById('authEmail');
    target.focus();
  }, 120);
}

function closeAuth() {
  authModal.classList.remove('open');
  authModal.setAttribute('aria-hidden', 'true');
  if (![modal, successScreen, failureScreen, biometricModal].some((element) => element.classList.contains('open'))) document.body.style.overflow = '';
}

function validateAuthForm() {
  const email = document.getElementById('authEmail');
  const password = document.getElementById('authPassword');
  const name = document.getElementById('authName');
  const confirm = document.getElementById('authConfirmPassword');
  let valid = true;

  const checks = [
    [email, email.checkValidity() && email.value.trim() !== ''],
    [password, password.value.length >= 6]
  ];
  if (authMode === 'register') {
    checks.push([name, name.value.trim().length >= 2]);
    checks.push([confirm, confirm.value === password.value && confirm.value !== '']);
  }
  checks.forEach(([input, ok]) => {
    input.closest('.field').classList.toggle('invalid', !ok);
    if (!ok) valid = false;
  });
  return valid;
}

function finishAuth(user, message) {
  setSession(user);
  authForm.reset();
  closeAuth();
  showToast(message);
  if (pendingPlan) {
    const plan = pendingPlan;
    pendingPlan = null;
    openCheckout(plan);
  }
}

function openCheckout(plan) {
  selectedPlan = plan;
  if (plan === 'Free') {
    showToast('Free plan selected — no payment details are needed.');
    return;
  }
  const session = getSession();
  if (!session) {
    pendingPlan = plan;
    authMode = 'login';
    openAuth(false);
    return;
  }
  renderPaymentMethods();
  updateSummary();
  document.getElementById('email').value = session.email;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('firstName').focus(), 150);
}

function closeCheckout() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (![successScreen, failureScreen, biometricModal, authModal].some((element) => element.classList.contains('open'))) document.body.style.overflow = '';
}

function validateForm() {
  let valid = true;
  checkoutForm.querySelectorAll('input[required]').forEach((input) => {
    const field = input.closest('.field');
    const isValid = input.type === 'checkbox' ? input.checked : input.checkValidity() && input.value.trim() !== '';
    if (field) field.classList.toggle('invalid', !isValid);
    if (!isValid) valid = false;
  });

  const cardNumber = document.getElementById('cardNumber');
  const cardName = document.getElementById('cardName');
  const cardExpiry = document.getElementById('cardExpiry');
  const cardSecurity = document.getElementById('cardSecurity');
  const paymentChecks = [
    [cardNumber, cardNumber.value.replace(/\D/g, '').length === 14],
    [cardName, cardName.value.trim() !== ''],
    [cardExpiry, /^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/.test(cardExpiry.value.trim())],
    [cardSecurity, /^\d{3,4}$/.test(cardSecurity.value)]
  ];
  paymentChecks.forEach(([input, ok]) => {
    input.closest('.field').classList.toggle('invalid', !ok);
    if (!ok) valid = false;
  });

  document.getElementById('formError').classList.toggle('visible', !valid);
  return valid;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function deviceVerificationLabel() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'Face ID / Touch ID';
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'Touch ID / device password';
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'Windows Hello';
  if (/Android/i.test(ua)) return 'Android biometrics / screen lock';
  return 'Platform device verification';
}

function biometricMethodLabel() {
  return lastVerificationLabel || deviceVerificationLabel();
}

function resultReference() {
  return `LOCAL-${Date.now().toString(36).slice(-7).toUpperCase()}`;
}

function generateYichuangApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `yc_api_${token}`;
}

async function copyYichuangApiKey() {
  const keyElement = document.getElementById('successApiKey');
  const label = document.getElementById('copyApiKeyText');
  if (!keyElement) return;
  try {
    await navigator.clipboard.writeText(keyElement.textContent.trim());
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(keyElement);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    selection.removeAllRanges();
  }
  if (label) {
    label.textContent = 'Copied';
    window.setTimeout(() => { label.textContent = 'Copy'; }, 1600);
  }
  showToast('API Key copied.');
}

function showSuccess(method = biometricMethodLabel()) {
  successScreen.classList.add('open');
  successScreen.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  translateInterface();
  document.getElementById('successPlan').textContent = `${selectedPlan} · ${translated(selectedCycle === 'annual' ? 'Annual' : 'Monthly')}`;
  document.getElementById('successAmount').textContent = formatMoney(getTotal());
  document.getElementById('successBiometric').textContent = method;
  document.getElementById('successReference').textContent = resultReference();
  const apiKeyElement = document.getElementById('successApiKey');
  if (apiKeyElement) apiKeyElement.textContent = generateYichuangApiKey();
  const copyLabel = document.getElementById('copyApiKeyText');
  if (copyLabel) copyLabel.textContent = 'Copy';
}

function showFailure(method = biometricMethodLabel(), reason = 'Device verification was cancelled or the card was not approved for this local test payment.', status = 'Not completed') {
  failureScreen.classList.add('open');
  failureScreen.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  translateInterface();
  document.getElementById('failurePlan').textContent = `${selectedPlan} · ${translated(selectedCycle === 'annual' ? 'Annual' : 'Monthly')}`;
  document.getElementById('failureAmount').textContent = formatMoney(getTotal());
  document.getElementById('failureBiometric').textContent = method;
  document.getElementById('failureReason').textContent = translated(reason);
  document.getElementById('failureStatus').textContent = translated(status);
}

function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function readWebAuthnCredentials() {
  try { return JSON.parse(storageGet(WEBAUTHN_CREDENTIALS_KEY)) || {}; }
  catch { return {}; }
}

function writeWebAuthnCredentials(value) {
  storageSet(WEBAUTHN_CREDENTIALS_KEY, JSON.stringify(value));
}

function credentialKeyForSession() {
  return (getSession()?.email || 'local-user').toLowerCase();
}

function storedWebAuthnCredential() {
  return readWebAuthnCredentials()[credentialKeyForSession()] || null;
}

function saveWebAuthnCredential(credential, userId) {
  const store = readWebAuthnCredentials();
  store[credentialKeyForSession()] = {
    id: bytesToBase64Url(new Uint8Array(credential.rawId)),
    userId: bytesToBase64Url(userId),
    createdAt: new Date().toISOString()
  };
  writeWebAuthnCredentials(store);
}

function removeWebAuthnCredential() {
  const store = readWebAuthnCredentials();
  delete store[credentialKeyForSession()];
  writeWebAuthnCredentials(store);
}

function webAuthnEnvironmentReady() {
  return Boolean(window.PublicKeyCredential && navigator.credentials && window.crypto?.getRandomValues && window.isSecureContext && location.protocol !== 'file:');
}

async function detectPlatformAuthenticator() {
  const state = document.getElementById('deviceAuthState');
  const detail = document.getElementById('deviceAuthDetail');
  const warning = document.getElementById('secureContextWarning');
  const startButton = document.getElementById('startBiometric');
  lastVerificationLabel = deviceVerificationLabel();
  document.getElementById('deviceAuthName').textContent = lastVerificationLabel;
  detail.textContent = 'The operating system chooses the available biometric or device-password method.';

  if (!webAuthnEnvironmentReady()) {
    platformAuthenticatorAvailable = false;
    state.textContent = 'HTTPS / localhost required';
    state.className = 'device-auth-state unavailable';
    warning.classList.remove('hidden');
    startButton.disabled = true;
    document.getElementById('biometricStatus').textContent = 'WebAuthn is unavailable in this page context.';
    return;
  }

  warning.classList.add('hidden');
  state.textContent = 'Checking…';
  state.className = 'device-auth-state';
  startButton.disabled = true;
  try {
    platformAuthenticatorAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    platformAuthenticatorAvailable = false;
  }
  state.textContent = platformAuthenticatorAvailable ? 'Available' : 'Not detected';
  state.className = `device-auth-state ${platformAuthenticatorAvailable ? 'available' : 'unavailable'}`;
  startButton.disabled = !platformAuthenticatorAvailable;
  document.getElementById('biometricStatus').textContent = platformAuthenticatorAvailable
    ? 'Ready to open the system verification prompt.'
    : 'No platform authenticator was detected on this browser or device.';
}

async function createPlatformCredential() {
  const session = getSession() || { email: 'local-user@agentaislm.local', name: 'AgentAISLM user' };
  const userId = randomBytes(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'AgentAISLM' },
      user: {
        id: userId,
        name: session.email,
        displayName: session.name || session.email
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: 'required'
      },
      timeout: 60000,
      attestation: 'none'
    }
  });
  if (!credential) throw new Error('The system did not return a platform credential.');
  saveWebAuthnCredential(credential, userId);
  return credential;
}

async function getPlatformAssertion(stored) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: base64UrlToBytes(stored.id) }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  if (!assertion) throw new Error('The system did not return a verification assertion.');
  return assertion;
}

function webAuthnErrorMessage(error) {
  if (error?.name === 'NotAllowedError') return 'Device verification was cancelled, timed out, or was not approved.';
  if (error?.name === 'SecurityError') return 'This page is not running from a valid HTTPS or localhost origin for WebAuthn.';
  if (error?.name === 'InvalidStateError') return 'A device credential already exists. Clear the local device registration and try again.';
  if (error?.name === 'NotSupportedError') return 'This browser or device does not support the requested platform authenticator.';
  return error?.message || 'Device verification could not be completed.';
}

function openBiometric() {
  clearTimeout(biometricTimer);
  const scanner = document.getElementById('biometricScanner');
  scanner.classList.remove('scanning', 'approved', 'rejected');
  biometricModal.classList.add('open');
  biometricModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  translateInterface();
  detectPlatformAuthenticator();
  setTimeout(() => document.getElementById('startBiometric').focus(), 100);
}

function closeBiometric() {
  clearTimeout(biometricTimer);
  const scanner = document.getElementById('biometricScanner');
  scanner.classList.remove('scanning', 'approved', 'rejected');
  biometricModal.classList.remove('open');
  biometricModal.setAttribute('aria-hidden', 'true');
  if (![modal, authModal, successScreen, failureScreen].some((element) => element.classList.contains('open'))) document.body.style.overflow = '';
}

async function runPlatformVerification() {
  const scanner = document.getElementById('biometricScanner');
  const startButton = document.getElementById('startBiometric');
  const status = document.getElementById('biometricStatus');

  if (!platformAuthenticatorAvailable) {
    status.textContent = 'No usable platform authenticator is available.';
    return;
  }

  startButton.disabled = true;
  scanner.classList.remove('approved', 'rejected');
  scanner.classList.add('scanning');
  status.textContent = 'Waiting for the system verification prompt…';

  try {
    const stored = storedWebAuthnCredential();
    if (stored) await getPlatformAssertion(stored);
    else await createPlatformCredential();

    scanner.classList.remove('scanning');
    scanner.classList.add('approved');
    status.textContent = 'Device verification completed.';
    lastVerificationLabel = deviceVerificationLabel();

    const cardDigits = document.getElementById('cardNumber').value.replace(/\D/g, '');
    const approvedCard = cardDigits === TEST_CARD_NUMBER;
    biometricTimer = setTimeout(() => {
      closeBiometric();
      closeCheckout();
      if (approvedCard) {
        showSuccess(lastVerificationLabel);
      } else {
        showFailure(lastVerificationLabel, 'Device verification succeeded, but this card is not approved for the local test payment.', 'Card not approved');
      }
    }, 600);
  } catch (error) {
    scanner.classList.remove('scanning');
    scanner.classList.add('rejected');
    const message = webAuthnErrorMessage(error);
    status.textContent = message;
    biometricTimer = setTimeout(() => {
      closeBiometric();
      closeCheckout();
      showFailure(deviceVerificationLabel(), message, 'Device verification failed');
    }, 850);
  } finally {
    startButton.disabled = false;
  }
}

countrySelect.addEventListener('change', (event) => {
  selectedCountry = event.target.value;
  selectedMethod = 'diners';
  updatePrices();
  renderMethodPreview();
  renderPaymentMethods();
  translateInterface();
});

document.querySelectorAll('.toggle-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectedCycle = button.dataset.cycle;
    document.querySelectorAll('.toggle-option').forEach((item) => item.classList.toggle('active', item === button));
    updatePrices();
    translateInterface();
  });
});

document.querySelectorAll('[data-plan]').forEach((button) => {
  button.addEventListener('click', () => openCheckout(button.dataset.plan));
});

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode));
});

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const error = document.getElementById('authError');
  error.textContent = '';
  if (!validateAuthForm()) return;

  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const passwordHash = simpleHash(document.getElementById('authPassword').value);
  const users = readUsers();

  if (authMode === 'register') {
    if (users.some((user) => user.email === email)) {
      error.textContent = 'An account with this email already exists in this browser.';
      return;
    }
    const user = { email, name: document.getElementById('authName').value.trim(), passwordHash };
    users.push(user);
    writeUsers(users);
    finishAuth(user, 'Local demo account created and signed in.');
    return;
  }

  const user = users.find((item) => item.email === email && item.passwordHash === passwordHash);
  if (!user) {
    error.textContent = 'Email or password does not match a local demo account.';
    return;
  }
  finishAuth(user, 'Logged in to the local demo account.');
});

signInButton.addEventListener('click', () => openAuth(Boolean(getSession())));
document.getElementById('closeAuth').addEventListener('click', closeAuth);
authModal.addEventListener('click', (event) => { if (event.target === authModal) closeAuth(); });
document.getElementById('continueAccount').addEventListener('click', closeAuth);
document.getElementById('logoutButton').addEventListener('click', () => {
  clearSession();
  document.getElementById('accountView').classList.add('hidden');
  document.getElementById('authFormsView').classList.remove('hidden');
  setAuthMode('login');
  showToast('Logged out from this browser.');
});

document.getElementById('closeCheckout').addEventListener('click', closeCheckout);
modal.addEventListener('click', (event) => { if (event.target === modal) closeCheckout(); });

businessPurchase.addEventListener('change', () => {
  vatField.classList.toggle('hidden', !businessPurchase.checked);
  updateSummary();
});
document.getElementById('vatNumber').addEventListener('input', updateSummary);

checkoutForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateForm()) return;
  openBiometric();
});

document.getElementById('startBiometric').addEventListener('click', runPlatformVerification);
document.getElementById('resetDeviceCredential').addEventListener('click', () => {
  removeWebAuthnCredential();
  showToast('Local device registration cleared. The next verification will register this device again.');
  detectPlatformAuthenticator();
});
document.getElementById('closeBiometric').addEventListener('click', closeBiometric);
biometricModal.addEventListener('click', (event) => { if (event.target === biometricModal) closeBiometric(); });

document.getElementById('copyApiKey')?.addEventListener('click', copyYichuangApiKey);

document.getElementById('closeSuccess').addEventListener('click', () => {
  successScreen.classList.remove('open');
  successScreen.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
});
document.getElementById('successAgain').addEventListener('click', () => {
  successScreen.classList.remove('open');
  successScreen.setAttribute('aria-hidden', 'true');
  openCheckout(selectedPlan);
});
document.getElementById('closeFailure').addEventListener('click', () => {
  failureScreen.classList.remove('open');
  failureScreen.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
});
document.getElementById('retryPayment').addEventListener('click', () => {
  failureScreen.classList.remove('open');
  failureScreen.setAttribute('aria-hidden', 'true');
  openCheckout(selectedPlan);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (successScreen.classList.contains('open')) document.getElementById('closeSuccess').click();
  else if (failureScreen.classList.contains('open')) document.getElementById('closeFailure').click();
  else if (biometricModal.classList.contains('open')) closeBiometric();
  else if (modal.classList.contains('open')) closeCheckout();
  else if (authModal.classList.contains('open')) closeAuth();
});

updateAuthUI();
updatePrices();
renderMethodPreview();
renderPaymentMethods();


// ---------- Browser-only settings and multilingual interface ----------
const SETTINGS_KEY = 'orbis_ui_settings_v1';
const defaultSettings = {
  language: 'en',
  theme: 'system',
  fontSize: 'normal',
  density: 'comfortable',
  highContrast: false,
  reduceMotion: false
};
let uiSettings = { ...defaultSettings };
const sourceTextNodes = new WeakMap();
const attributeSources = new WeakMap();

const translations = {
  'zh-CN': {
    'Plans':'方案','Payments':'付款','Settings':'设置','Log in':'登录','Get started':'开始使用','Open settings':'打开设置','Close settings':'关闭设置',
    'Built for Europe':'专为欧洲打造','Choose a plan.':'选择一个方案。','Pay with Diners Club.':'使用大来卡付款。',
    'Clear European pricing, country-aware VAT and a Diners Club-only checkout — presented as a safe front-end demonstration with no live payment connection.':'清晰的欧洲定价、按国家计算的增值税，以及仅限大来卡的结账流程——这是安全的纯前端演示，不连接真实金流。',
    'Billing country':'账单国家','Monthly':'按月','Annual':'按年','Save 20%':'节省 20%','Individual plans':'个人方案','Simple pricing, no hidden platform fees.':'简单定价，无隐藏平台费用。',
    'Free':'免费','For exploring the essentials.':'适合体验基础功能。','/ month':'/ 月','Start free':'免费开始','Essential AI conversations':'基础 AI 对话','Limited file uploads':'有限文件上传','Standard response speed':'标准响应速度','Community support':'社区支持',
    'For everyday study and personal projects.':'适合日常学习与个人项目。','Choose Go':'选择 Go','Everything in Free':'包含免费版全部功能','More messages and uploads':'更多消息与上传额度','Faster image generation':'更快的图像生成','Longer conversation history':'更长的对话记录',
    'Most popular':'最受欢迎','For advanced work, learning and creation.':'适合进阶工作、学习与创作。','Choose Plus':'选择 Plus','Everything in Go':'包含 Go 全部功能','Advanced reasoning models':'高级推理模型','Expanded research tools':'更多研究工具','Projects and scheduled tasks':'项目与计划任务','Priority response speed':'优先响应速度',
    'For demanding research and development.':'适合高强度研究与开发。','Choose Pro':'选择 Pro','Everything in Plus':'包含 Plus 全部功能','Highest usage allowance':'最高使用额度','Maximum research capacity':'最大研究能力','Priority access to new tools':'优先体验新工具','Enhanced workspace controls':'增强工作区控制',
    'Diners Club checkout':'大来卡结账','One European flow, Diners Club only.':'统一的欧洲流程，仅限大来卡。','Every country uses the same Diners Club-related card options. The country selection only changes currency and estimated VAT. No information is sent to a payment provider: only the clearly marked demo card can complete the local simulation, while every other card number is declined.':'所有国家都使用相同的大来卡相关选项。国家选择只会改变币种与预估增值税。不会向支付服务商发送任何信息；只有明确标示的演示卡能完成本地模拟，其他卡号都会失败。','Preview checkout':'预览结账','Secure checkout':'安全结账','Diners Club only':'仅限大来卡','VAT estimate':'增值税预估','No gateway connected':'未连接金流',
    'Designed for clarity':'清晰设计','What this European checkout includes':'此欧洲结账页面包含的功能','Local currencies':'本地币种','EUR across the EEA, with GBP and CHF shown for the United Kingdom and Switzerland.':'欧洲经济区使用欧元，英国与瑞士分别显示英镑和瑞士法郎。','VAT details':'增值税详情','Country-based estimated tax, optional business VAT ID and invoice-ready billing fields.':'按国家预估税额，可选企业增值税编号与开票资料。','Diners Club network':'大来卡网络','Only Diners Club International, Diners Club Corporate and related Discover network cards are shown.':'仅显示 Diners Club International、Diners Club Corporate 与相关 Discover 网络卡。','Authentication':'验证','Only the built-in demo Diners Club card can complete the simulation. Every other card number is declined.':'只有内建的大来卡演示卡可以完成模拟，其他卡号全部失败。',
    'Front-end prototype only. Accounts stay in this browser, no gateway is connected, and only the displayed demo card can simulate success.':'仅为前端原型。账号保存在此浏览器中，不连接金流，只有页面显示的演示卡能模拟成功。',
    'Browser-only account':'仅浏览器账号','Welcome back':'欢迎回来','Log in with an account stored only in this browser.':'使用仅保存在此浏览器中的账号登录。','Create account':'创建账号','Display name':'显示名称','Your name':'你的名字','Enter at least 2 characters.':'至少输入 2 个字符。','Email address':'电子邮箱','Enter a valid email address.':'请输入有效邮箱。','Password':'密码','At least 6 characters':'至少 6 个字符','Use at least 6 characters.':'请至少使用 6 个字符。','Confirm password':'确认密码','Repeat your password':'再次输入密码','Passwords must match.':'两次密码必须一致。','Simulation only. Account data is kept in this browser\'s localStorage. Do not reuse a real password.':'仅供模拟。账号数据保存在浏览器 localStorage 中，请勿使用真实密码。','Signed in locally':'已在本地登录','Continue':'继续','Log out':'退出登录','This session exists only in this browser and is not connected to a server.':'此会话仅存在于当前浏览器，不连接服务器。',
    'Plan':'方案','Details':'资料','Confirm':'确认','Complete your subscription':'完成订阅','Contact':'联系资料','1 of 3':'第 1 / 3 步','Billing details':'账单资料','2 of 3':'第 2 / 3 步','First name':'名字','Last name':'姓氏','Required.':'必填。','Address':'地址','Street and number':'街道与门牌','Postal code':'邮政编码','City':'城市','This is a business purchase':'这是企业购买','EU / UK VAT number':'欧盟／英国增值税编号','Demo field — no live VIES validation is performed.':'演示字段——不会进行实时 VIES 验证。','Diners Club payment method':'大来卡付款方式','3 of 3':'第 3 / 3 步','I agree to the subscription terms and recurring billing.':'我同意订阅条款与定期扣款说明。','Please complete the highlighted fields.':'请完成标示的字段。','Attempt Diners Club payment':'尝试大来卡付款','Demo only: do not enter real card details. No gateway is connected. Only the displayed test card can complete this local simulation.':'仅供演示：请勿输入真实卡片资料。未连接金流，只有页面显示的测试卡能完成本地模拟。',
    'Order summary':'订单摘要','Monthly subscription':'月订阅','Annual subscription':'年订阅','Subtotal':'小计','Total today':'今日总计','Renewal':'续订','✓ Diners Club-only interface':'✓ 仅限大来卡界面','✓ No payment gateway connected':'✓ 未连接支付网关','✓ One local demo card can succeed':'✓ 一张本地演示卡可成功',
    'Demo payment approved':'演示付款已通过','Subscription activated locally.':'订阅已在本地启用。','The built-in Diners Club test card matched. No real payment occurred, no card data was transmitted, and this result exists only in your browser.':'内建大来卡测试卡匹配成功。没有发生真实付款，也没有传送卡片资料，此结果仅存在于你的浏览器。','Return to pricing':'返回定价','Payment declined':'付款失败','This card was not accepted.':'此卡未被接受。','Only the displayed demo Diners Club card can complete this local simulation. No money was charged and no card information was transmitted.':'只有页面显示的大来卡演示卡能完成本地模拟。没有扣款，也没有传送卡片资料。','Return to checkout':'返回结账',
    'Personal preferences':'个人偏好','Language and appearance choices are stored only in this browser.':'语言与外观设置只保存在此浏览器中。','Language':'语言','Translate the complete interface.':'翻译整个界面。','Appearance':'外观','Choose light, dark, or follow your device.':'选择浅色、深色或跟随设备。','System':'跟随系统','Light':'浅色','Dark':'深色','Text size':'文字大小','Adjust readability across the interface.':'调整整个界面的可读性。','Small':'小','Default':'默认','Large':'大','Interface density':'界面密度','Control spacing in cards and forms.':'调整卡片与表单间距。','Comfortable':'舒适','Compact':'紧凑','High contrast':'高对比度','Increase borders and text contrast.':'增强边框与文字对比。','Reduce motion':'减少动画','Disable most interface animations.':'关闭大部分界面动画。','Reset settings':'重置设置','Done':'完成','These preferences use localStorage and are never sent to a server.':'这些偏好使用 localStorage 保存，绝不会发送到服务器。',
    'Diners Club International':'Diners Club International','Personal Diners Club card':'个人大来卡','Diners Club Corporate':'Diners Club Corporate','Corporate or business card':'企业或商务卡','Discover / Diners Club Network':'Discover／大来卡网络','Related network card':'相关网络卡','Only successful test card':'唯一可成功的测试卡','Expiry 12 / 34 · Security code 123 · Name ORBIS DEMO':'有效期 12 / 34 · 安全码 123 · 姓名 ORBIS DEMO','Fill demo card':'填入演示卡','Local simulation only.':'仅限本地模拟。','Never enter a real card. Only the test number above can succeed inside this page.':'请勿输入真实卡片。只有上方测试号码能在本页面成功。','Diners Club card number':'大来卡卡号','Enter a 14-digit demo card number.':'请输入 14 位演示卡号。','Name on card':'持卡人姓名','Expiry':'有效期','Use MM / YY.':'使用 MM / YY。','Security code':'安全码','Enter 3–4 digits.':'请输入 3–4 位数字。','Diners Club':'大来卡'
  },
  'fr': {
    'Plans':'Offres','Payments':'Paiements','Settings':'Paramètres','Log in':'Se connecter','Get started':'Commencer','Open settings':'Ouvrir les paramètres','Close settings':'Fermer les paramètres','Built for Europe':'Conçu pour l’Europe','Choose a plan.':'Choisissez une offre.','Pay with Diners Club.':'Payez avec Diners Club.','Clear European pricing, country-aware VAT and a Diners Club-only checkout — presented as a safe front-end demonstration with no live payment connection.':'Des tarifs européens clairs, une TVA adaptée au pays et un paiement réservé à Diners Club, dans une démonstration front-end sécurisée sans connexion de paiement réelle.','Billing country':'Pays de facturation','Monthly':'Mensuel','Annual':'Annuel','Save 20%':'Économisez 20 %','Individual plans':'Offres individuelles','Simple pricing, no hidden platform fees.':'Tarifs simples, sans frais cachés.','Free':'Gratuit','For exploring the essentials.':'Pour découvrir l’essentiel.','/ month':'/ mois','Start free':'Commencer gratuitement','For everyday study and personal projects.':'Pour les études et projets personnels.','Choose Go':'Choisir Go','Most popular':'Le plus populaire','For advanced work, learning and creation.':'Pour le travail, l’apprentissage et la création avancés.','Choose Plus':'Choisir Plus','For demanding research and development.':'Pour la recherche et le développement exigeants.','Choose Pro':'Choisir Pro','Diners Club checkout':'Paiement Diners Club','One European flow, Diners Club only.':'Un parcours européen, Diners Club uniquement.','Preview checkout':'Aperçu du paiement','Secure checkout':'Paiement sécurisé','Diners Club only':'Diners Club uniquement','VAT estimate':'Estimation de TVA','No gateway connected':'Aucune passerelle connectée','Designed for clarity':'Pensé pour la clarté','What this European checkout includes':'Ce que comprend ce paiement européen','Local currencies':'Devises locales','VAT details':'Détails de TVA','Diners Club network':'Réseau Diners Club','Authentication':'Authentification','Browser-only account':'Compte local au navigateur','Welcome back':'Bon retour','Create account':'Créer un compte','Display name':'Nom affiché','Email address':'Adresse e-mail','Password':'Mot de passe','Confirm password':'Confirmer le mot de passe','Continue':'Continuer','Log out':'Se déconnecter','Plan':'Offre','Details':'Coordonnées','Confirm':'Confirmer','Complete your subscription':'Finalisez votre abonnement','Contact':'Contact','Billing details':'Coordonnées de facturation','First name':'Prénom','Last name':'Nom','Required.':'Obligatoire.','Address':'Adresse','Postal code':'Code postal','City':'Ville','This is a business purchase':'Achat professionnel','EU / UK VAT number':'Numéro de TVA UE / Royaume-Uni','Diners Club payment method':'Mode de paiement Diners Club','I agree to the subscription terms and recurring billing.':'J’accepte les conditions d’abonnement et la facturation récurrente.','Please complete the highlighted fields.':'Veuillez remplir les champs indiqués.','Attempt Diners Club payment':'Tenter le paiement Diners Club','Order summary':'Récapitulatif','Monthly subscription':'Abonnement mensuel','Annual subscription':'Abonnement annuel','Subtotal':'Sous-total','Total today':'Total aujourd’hui','Renewal':'Renouvellement','Demo payment approved':'Paiement démo approuvé','Subscription activated locally.':'Abonnement activé localement.','Return to pricing':'Retour aux tarifs','Payment declined':'Paiement refusé','This card was not accepted.':'Cette carte n’a pas été acceptée.','Return to checkout':'Retour au paiement','Personal preferences':'Préférences personnelles','Language and appearance choices are stored only in this browser.':'Les choix de langue et d’apparence sont stockés uniquement dans ce navigateur.','Language':'Langue','Translate the complete interface.':'Traduire toute l’interface.','Appearance':'Apparence','Choose light, dark, or follow your device.':'Choisissez clair, sombre ou le réglage de l’appareil.','System':'Système','Light':'Clair','Dark':'Sombre','Text size':'Taille du texte','Adjust readability across the interface.':'Ajustez la lisibilité de l’interface.','Small':'Petite','Default':'Par défaut','Large':'Grande','Interface density':'Densité de l’interface','Control spacing in cards and forms.':'Réglez l’espacement des cartes et formulaires.','Comfortable':'Confortable','Compact':'Compacte','High contrast':'Contraste élevé','Increase borders and text contrast.':'Renforce les bordures et le contraste du texte.','Reduce motion':'Réduire les animations','Disable most interface animations.':'Désactive la plupart des animations.','Reset settings':'Réinitialiser','Done':'Terminé','These preferences use localStorage and are never sent to a server.':'Ces préférences utilisent localStorage et ne sont jamais envoyées à un serveur.','Only successful test card':'Seule carte de test acceptée','Fill demo card':'Remplir la carte démo','Local simulation only.':'Simulation locale uniquement.','Diners Club card number':'Numéro de carte Diners Club','Name on card':'Nom sur la carte','Expiry':'Expiration','Security code':'Code de sécurité','Diners Club':'Diners Club'
  },
  'pt': {
    'Plans':'Planos','Payments':'Pagamentos','Settings':'Definições','Log in':'Iniciar sessão','Get started':'Começar','Open settings':'Abrir definições','Close settings':'Fechar definições','Built for Europe':'Criado para a Europa','Choose a plan.':'Escolha um plano.','Pay with Diners Club.':'Pague com Diners Club.','Clear European pricing, country-aware VAT and a Diners Club-only checkout — presented as a safe front-end demonstration with no live payment connection.':'Preços europeus claros, IVA adaptado ao país e checkout exclusivo para Diners Club, numa demonstração front-end segura sem ligação a pagamentos reais.','Billing country':'País de faturação','Monthly':'Mensal','Annual':'Anual','Save 20%':'Poupe 20%','Individual plans':'Planos individuais','Simple pricing, no hidden platform fees.':'Preços simples, sem taxas ocultas.','Free':'Grátis','For exploring the essentials.':'Para explorar o essencial.','/ month':'/ mês','Start free':'Começar grátis','For everyday study and personal projects.':'Para estudo diário e projetos pessoais.','Choose Go':'Escolher Go','Most popular':'Mais popular','For advanced work, learning and creation.':'Para trabalho, aprendizagem e criação avançados.','Choose Plus':'Escolher Plus','For demanding research and development.':'Para investigação e desenvolvimento exigentes.','Choose Pro':'Escolher Pro','Diners Club checkout':'Checkout Diners Club','One European flow, Diners Club only.':'Um fluxo europeu, apenas Diners Club.','Preview checkout':'Pré-visualizar checkout','Secure checkout':'Checkout seguro','Diners Club only':'Apenas Diners Club','VAT estimate':'Estimativa de IVA','No gateway connected':'Sem gateway ligado','Designed for clarity':'Concebido para clareza','What this European checkout includes':'O que inclui este checkout europeu','Local currencies':'Moedas locais','VAT details':'Detalhes do IVA','Diners Club network':'Rede Diners Club','Authentication':'Autenticação','Browser-only account':'Conta apenas no navegador','Welcome back':'Bem-vindo de volta','Create account':'Criar conta','Display name':'Nome de apresentação','Email address':'Endereço de e-mail','Password':'Palavra-passe','Confirm password':'Confirmar palavra-passe','Continue':'Continuar','Log out':'Terminar sessão','Plan':'Plano','Details':'Dados','Confirm':'Confirmar','Complete your subscription':'Conclua a subscrição','Contact':'Contacto','Billing details':'Dados de faturação','First name':'Nome','Last name':'Apelido','Required.':'Obrigatório.','Address':'Morada','Postal code':'Código postal','City':'Cidade','This is a business purchase':'Esta é uma compra empresarial','EU / UK VAT number':'Número de IVA UE / Reino Unido','Diners Club payment method':'Método de pagamento Diners Club','I agree to the subscription terms and recurring billing.':'Concordo com os termos da subscrição e faturação recorrente.','Please complete the highlighted fields.':'Preencha os campos destacados.','Attempt Diners Club payment':'Tentar pagamento Diners Club','Order summary':'Resumo da encomenda','Monthly subscription':'Subscrição mensal','Annual subscription':'Subscrição anual','Subtotal':'Subtotal','Total today':'Total de hoje','Renewal':'Renovação','Demo payment approved':'Pagamento de demonstração aprovado','Subscription activated locally.':'Subscrição ativada localmente.','Return to pricing':'Voltar aos preços','Payment declined':'Pagamento recusado','This card was not accepted.':'Este cartão não foi aceite.','Return to checkout':'Voltar ao checkout','Personal preferences':'Preferências pessoais','Language and appearance choices are stored only in this browser.':'As opções de idioma e aparência são guardadas apenas neste navegador.','Language':'Idioma','Translate the complete interface.':'Traduzir toda a interface.','Appearance':'Aparência','Choose light, dark, or follow your device.':'Escolha claro, escuro ou siga o dispositivo.','System':'Sistema','Light':'Claro','Dark':'Escuro','Text size':'Tamanho do texto','Adjust readability across the interface.':'Ajuste a legibilidade da interface.','Small':'Pequeno','Default':'Predefinido','Large':'Grande','Interface density':'Densidade da interface','Control spacing in cards and forms.':'Controle o espaçamento em cartões e formulários.','Comfortable':'Confortável','Compact':'Compacto','High contrast':'Alto contraste','Increase borders and text contrast.':'Aumente o contraste das margens e do texto.','Reduce motion':'Reduzir movimento','Disable most interface animations.':'Desative a maioria das animações.','Reset settings':'Repor definições','Done':'Concluído','These preferences use localStorage and are never sent to a server.':'Estas preferências usam localStorage e nunca são enviadas para um servidor.','Only successful test card':'Único cartão de teste aceite','Fill demo card':'Preencher cartão demo','Local simulation only.':'Apenas simulação local.','Diners Club card number':'Número do cartão Diners Club','Name on card':'Nome no cartão','Expiry':'Validade','Security code':'Código de segurança','Diners Club':'Diners Club'
  },
  'de': {
    'Plans':'Tarife','Payments':'Zahlungen','Settings':'Einstellungen','Log in':'Anmelden','Get started':'Loslegen','Open settings':'Einstellungen öffnen','Close settings':'Einstellungen schließen','Built for Europe':'Für Europa entwickelt','Choose a plan.':'Wähle einen Tarif.','Pay with Diners Club.':'Bezahle mit Diners Club.','Clear European pricing, country-aware VAT and a Diners Club-only checkout — presented as a safe front-end demonstration with no live payment connection.':'Klare europäische Preise, länderspezifische Mehrwertsteuer und ein Checkout nur für Diners Club – als sichere Frontend-Demo ohne echte Zahlungsanbindung.','Billing country':'Rechnungsland','Monthly':'Monatlich','Annual':'Jährlich','Save 20%':'20 % sparen','Individual plans':'Tarife für Einzelpersonen','Simple pricing, no hidden platform fees.':'Einfache Preise ohne versteckte Plattformgebühren.','Free':'Kostenlos','For exploring the essentials.':'Zum Kennenlernen der Grundlagen.','/ month':'/ Monat','Start free':'Kostenlos starten','For everyday study and personal projects.':'Für Alltag, Studium und persönliche Projekte.','Choose Go':'Go wählen','Most popular':'Am beliebtesten','For advanced work, learning and creation.':'Für anspruchsvolle Arbeit, Lernen und Kreativität.','Choose Plus':'Plus wählen','For demanding research and development.':'Für intensive Forschung und Entwicklung.','Choose Pro':'Pro wählen','Diners Club checkout':'Diners-Club-Checkout','One European flow, Diners Club only.':'Ein europäischer Ablauf, nur Diners Club.','Preview checkout':'Checkout ansehen','Secure checkout':'Sicherer Checkout','Diners Club only':'Nur Diners Club','VAT estimate':'MwSt.-Schätzung','No gateway connected':'Kein Gateway verbunden','Designed for clarity':'Auf Klarheit ausgelegt','What this European checkout includes':'Was dieser europäische Checkout enthält','Local currencies':'Lokale Währungen','VAT details':'MwSt.-Details','Diners Club network':'Diners-Club-Netzwerk','Authentication':'Authentifizierung','Browser-only account':'Konto nur im Browser','Welcome back':'Willkommen zurück','Create account':'Konto erstellen','Display name':'Anzeigename','Email address':'E-Mail-Adresse','Password':'Passwort','Confirm password':'Passwort bestätigen','Continue':'Weiter','Log out':'Abmelden','Plan':'Tarif','Details':'Angaben','Confirm':'Bestätigen','Complete your subscription':'Abonnement abschließen','Contact':'Kontakt','Billing details':'Rechnungsdaten','First name':'Vorname','Last name':'Nachname','Required.':'Erforderlich.','Address':'Adresse','Postal code':'Postleitzahl','City':'Stadt','This is a business purchase':'Dies ist ein geschäftlicher Kauf','EU / UK VAT number':'EU-/UK-USt-IdNr.','Diners Club payment method':'Diners-Club-Zahlungsart','I agree to the subscription terms and recurring billing.':'Ich stimme den Abonnementbedingungen und der wiederkehrenden Abrechnung zu.','Please complete the highlighted fields.':'Bitte fülle die markierten Felder aus.','Attempt Diners Club payment':'Diners-Club-Zahlung versuchen','Order summary':'Bestellübersicht','Monthly subscription':'Monatliches Abonnement','Annual subscription':'Jährliches Abonnement','Subtotal':'Zwischensumme','Total today':'Gesamt heute','Renewal':'Verlängerung','Demo payment approved':'Demo-Zahlung genehmigt','Subscription activated locally.':'Abonnement lokal aktiviert.','Return to pricing':'Zurück zu den Tarifen','Payment declined':'Zahlung abgelehnt','This card was not accepted.':'Diese Karte wurde nicht akzeptiert.','Return to checkout':'Zurück zum Checkout','Personal preferences':'Persönliche Einstellungen','Language and appearance choices are stored only in this browser.':'Sprach- und Darstellungsoptionen werden nur in diesem Browser gespeichert.','Language':'Sprache','Translate the complete interface.':'Die gesamte Oberfläche übersetzen.','Appearance':'Darstellung','Choose light, dark, or follow your device.':'Hell, dunkel oder Systemeinstellung wählen.','System':'System','Light':'Hell','Dark':'Dunkel','Text size':'Textgröße','Adjust readability across the interface.':'Lesbarkeit der Oberfläche anpassen.','Small':'Klein','Default':'Standard','Large':'Groß','Interface density':'Oberflächendichte','Abstände in Karten und Formularen steuern.':'Abstände in Karten und Formularen steuern.','Control spacing in cards and forms.':'Abstände in Karten und Formularen steuern.','Comfortable':'Bequem','Compact':'Kompakt','High contrast':'Hoher Kontrast','Increase borders and text contrast.':'Rahmen- und Textkontrast erhöhen.','Reduce motion':'Bewegung reduzieren','Disable most interface animations.':'Die meisten Animationen deaktivieren.','Reset settings':'Einstellungen zurücksetzen','Done':'Fertig','These preferences use localStorage and are never sent to a server.':'Diese Einstellungen verwenden localStorage und werden nie an einen Server gesendet.','Only successful test card':'Einzige erfolgreiche Testkarte','Fill demo card':'Demo-Karte ausfüllen','Local simulation only.':'Nur lokale Simulation.','Diners Club card number':'Diners-Club-Kartennummer','Name on card':'Name auf der Karte','Expiry':'Gültig bis','Security code':'Sicherheitscode','Diners Club':'Diners Club'
  }
};



const agentTokenTranslationExtension = {
  'zh-CN': {
    'Top up AgentAISLM.':'为 AgentAISLM 储值。',
    'Choose your token plan.':'选择适合你的 Token 方案。',
    'Access AgentAISLM’s AI features with flexible token plans. Choose a package based on your usage, then complete checkout with country-aware VAT. Diners Club is the supported payment method.':'通过灵活的 Token 方案使用 AgentAISLM 的 AI 功能。根据使用需求选择方案，并按所在国家计算增值税完成结账。大来卡是此页面支持的付款方式。',
    'Token plans':'Token 方案',
    'Flexible token packages for every workload.':'适合不同使用需求的灵活 Token 套餐。',
    'Supported payment':'支持的付款方式',
    'Secure checkout for your token top-up.':'安全完成 Token 储值。',
    'AgentAISLM uses this checkout for token purchases. Your country selection changes currency and estimated VAT, while Diners Club remains the supported payment network. Device verification uses the browser’s platform WebAuthn prompt.':'AgentAISLM 使用此流程购买 Token。国家选择会改变币种与预估增值税，大来卡则是此页面支持的付款网络。设备验证会使用浏览器的 WebAuthn 系统提示。',
    'Supported Diners Club cards':'支持的大来卡',
    'Diners Club supported':'支持大来卡',
    'What your token checkout includes':'Token 结账包含的功能',
    'Diners Club support':'大来卡支持',
    'Diners Club is the supported payment method for token purchases, including International, Corporate and related Discover network cards.':'Token 购买支持大来卡，包括 International、Corporate 与相关 Discover 网络卡。',
    'Payment method':'付款方式',
    'Continue to verification':'继续验证',
    '✓ Diners Club supported checkout':'✓ 支持大来卡结账'
  },
  fr: {
    'Top up AgentAISLM.':'Rechargez AgentAISLM.',
    'Choose your token plan.':'Choisissez votre offre de jetons.',
    'Access AgentAISLM’s AI features with flexible token plans. Choose a package based on your usage, then complete checkout with country-aware VAT. Diners Club is the supported payment method.':'Accédez aux fonctions IA d’AgentAISLM grâce à des offres de jetons flexibles. Choisissez une formule selon votre usage, puis payez avec une TVA adaptée au pays. Diners Club est le moyen de paiement pris en charge.',
    'Token plans':'Offres de jetons',
    'Flexible token packages for every workload.':'Des formules de jetons adaptées à chaque usage.',
    'Supported payment':'Paiement pris en charge',
    'Secure checkout for your token top-up.':'Paiement sécurisé pour recharger vos jetons.',
    'AgentAISLM uses this checkout for token purchases. Your country selection changes currency and estimated VAT, while Diners Club remains the supported payment network. Device verification uses the browser’s platform WebAuthn prompt.':'AgentAISLM utilise ce paiement pour l’achat de jetons. Le pays sélectionné modifie la devise et la TVA estimée, tandis que Diners Club reste le réseau de paiement pris en charge. La vérification de l’appareil utilise WebAuthn.',
    'Supported Diners Club cards':'Cartes Diners Club prises en charge',
    'Diners Club supported':'Diners Club pris en charge',
    'What your token checkout includes':'Ce que comprend le paiement des jetons',
    'Diners Club support':'Prise en charge de Diners Club',
    'Diners Club is the supported payment method for token purchases, including International, Corporate and related Discover network cards.':'L’achat de jetons accepte Diners Club International, Corporate et les cartes associées au réseau Discover.',
    'Payment method':'Mode de paiement',
    'Continue to verification':'Continuer vers la vérification',
    '✓ Diners Club supported checkout':'✓ Paiement Diners Club pris en charge'
  },
  pt: {
    'Top up AgentAISLM.':'Recarregue o AgentAISLM.',
    'Choose your token plan.':'Escolha o seu plano de tokens.',
    'Access AgentAISLM’s AI features with flexible token plans. Choose a package based on your usage, then complete checkout with country-aware VAT. Diners Club is the supported payment method.':'Aceda às funcionalidades de IA do AgentAISLM com planos de tokens flexíveis. Escolha um pacote de acordo com a utilização e conclua o pagamento com IVA adaptado ao país. Diners Club é o método de pagamento suportado.',
    'Token plans':'Planos de tokens',
    'Flexible token packages for every workload.':'Pacotes de tokens flexíveis para cada utilização.',
    'Supported payment':'Pagamento suportado',
    'Secure checkout for your token top-up.':'Pagamento seguro para recarregar tokens.',
    'AgentAISLM uses this checkout for token purchases. Your country selection changes currency and estimated VAT, while Diners Club remains the supported payment network. Device verification uses the browser’s platform WebAuthn prompt.':'O AgentAISLM utiliza este checkout para compras de tokens. O país altera a moeda e o IVA estimado, enquanto Diners Club permanece a rede de pagamento suportada. A verificação utiliza o WebAuthn do navegador.',
    'Supported Diners Club cards':'Cartões Diners Club suportados',
    'Diners Club supported':'Diners Club suportado',
    'What your token checkout includes':'O que inclui o checkout de tokens',
    'Diners Club support':'Suporte Diners Club',
    'Diners Club is the supported payment method for token purchases, including International, Corporate and related Discover network cards.':'As compras de tokens suportam Diners Club International, Corporate e cartões relacionados com a rede Discover.',
    'Payment method':'Método de pagamento',
    'Continue to verification':'Continuar para verificação',
    '✓ Diners Club supported checkout':'✓ Checkout com Diners Club'
  },
  de: {
    'Top up AgentAISLM.':'AgentAISLM aufladen.',
    'Choose your token plan.':'Wähle deinen Token-Tarif.',
    'Access AgentAISLM’s AI features with flexible token plans. Choose a package based on your usage, then complete checkout with country-aware VAT. Diners Club is the supported payment method.':'Nutze die KI-Funktionen von AgentAISLM mit flexiblen Token-Tarifen. Wähle ein Paket passend zu deiner Nutzung und schließe den Kauf mit länderspezifischer Mehrwertsteuer ab. Diners Club ist die unterstützte Zahlungsart.',
    'Token plans':'Token-Tarife',
    'Flexible token packages for every workload.':'Flexible Token-Pakete für jeden Bedarf.',
    'Supported payment':'Unterstützte Zahlung',
    'Secure checkout for your token top-up.':'Sicherer Checkout für deine Token-Aufladung.',
    'AgentAISLM uses this checkout for token purchases. Your country selection changes currency and estimated VAT, while Diners Club remains the supported payment network. Device verification uses the browser’s platform WebAuthn prompt.':'AgentAISLM verwendet diesen Checkout für Token-Käufe. Das gewählte Land ändert Währung und geschätzte Mehrwertsteuer; Diners Club bleibt das unterstützte Zahlungsnetzwerk. Die Geräteprüfung erfolgt über WebAuthn.',
    'Supported Diners Club cards':'Unterstützte Diners-Club-Karten',
    'Diners Club supported':'Diners Club unterstützt',
    'What your token checkout includes':'Was der Token-Checkout enthält',
    'Diners Club support':'Diners-Club-Unterstützung',
    'Diners Club is the supported payment method for token purchases, including International, Corporate and related Discover network cards.':'Token-Käufe unterstützen Diners Club International, Corporate und zugehörige Discover-Netzwerkkarten.',
    'Payment method':'Zahlungsart',
    'Continue to verification':'Weiter zur Verifizierung',
    '✓ Diners Club supported checkout':'✓ Diners-Club-Checkout unterstützt'
  }
};
Object.entries(agentTokenTranslationExtension).forEach(([language, entries]) => {
  Object.assign(translations[language] || (translations[language] = {}), entries);
});

const biometricTranslationExtension = {
  'zh-CN': {
    'Close biometric verification':'关闭生物识别验证','Identity verification':'身份验证','Confirm with biometrics':'使用生物识别确认','Choose a simulated verification method. This demonstration never reads or stores real biometric data.':'选择一种模拟验证方式。本演示不会读取或保存真实生物识别数据。','Ready for a demo scan.':'已准备进行模拟扫描。','Biometric method':'生物识别方式','Face ID':'面容识别','Facial recognition demo':'面部识别演示','Fingerprint':'指纹','Touch verification demo':'触摸验证演示','Windows Hello':'Windows Hello','Device verification demo':'设备验证演示','Demo result':'模拟结果','Choose the result you want to preview.':'选择要预览的结果。','Success':'成功','Failure':'失败','Start demo scan':'开始模拟扫描','Front-end simulation only. No camera, fingerprint sensor, secure enclave, or Windows Hello API is accessed.':'仅为前端模拟，不会访问摄像头、指纹传感器、安全隔区或 Windows Hello API。','Scanning… Keep still.':'正在扫描，请保持不动。','Identity verified.':'身份验证成功。','Verification failed.':'验证失败。','Payment successful':'付款成功','Payment completed':'付款已完成','Your subscription is ready.':'你的订阅已准备完成。','The biometric and payment steps were simulated locally. No real money was charged and no biometric or card data was transmitted.':'生物识别与付款步骤均为本地模拟，没有真实扣款，也未传送生物识别或卡片资料。','Amount':'金额','Verified with':'验证方式','Reference':'参考编号','Run another test':'再次测试','Payment unsuccessful':'付款失败','Payment not completed':'付款未完成','We could not finish this test payment.':'无法完成这次测试付款。','The simulated biometric verification was rejected. No money was charged and no card or biometric data was transmitted.':'模拟生物识别验证被拒绝，没有扣款，也未传送卡片或生物识别资料。','Attempted with':'尝试方式','Status':'状态','Declined in demo':'演示中被拒绝','Try again':'重试'
  },
  fr: {
    'Close biometric verification':'Fermer la vérification biométrique','Identity verification':'Vérification d’identité','Confirm with biometrics':'Confirmer par biométrie','Choose a simulated verification method. This demonstration never reads or stores real biometric data.':'Choisissez une méthode simulée. Cette démonstration ne lit ni ne stocke de données biométriques réelles.','Ready for a demo scan.':'Prêt pour une analyse de démonstration.','Biometric method':'Méthode biométrique','Face ID':'Face ID','Facial recognition demo':'Démo de reconnaissance faciale','Fingerprint':'Empreinte digitale','Touch verification demo':'Démo de vérification tactile','Windows Hello':'Windows Hello','Device verification demo':'Démo de vérification de l’appareil','Demo result':'Résultat de la démo','Choose the result you want to preview.':'Choisissez le résultat à prévisualiser.','Success':'Succès','Failure':'Échec','Start demo scan':'Démarrer l’analyse de démo','Front-end simulation only. No camera, fingerprint sensor, secure enclave, or Windows Hello API is accessed.':'Simulation front-end uniquement. Aucun appareil photo, capteur d’empreintes ou API Windows Hello n’est utilisé.','Scanning… Keep still.':'Analyse en cours… Restez immobile.','Identity verified.':'Identité vérifiée.','Verification failed.':'Échec de la vérification.','Payment successful':'Paiement réussi','Payment completed':'Paiement terminé','Your subscription is ready.':'Votre abonnement est prêt.','The biometric and payment steps were simulated locally. No real money was charged and no biometric or card data was transmitted.':'Les étapes biométriques et de paiement ont été simulées localement. Aucun débit réel ni transmission de données.','Amount':'Montant','Verified with':'Vérifié avec','Reference':'Référence','Run another test':'Relancer un test','Payment unsuccessful':'Paiement échoué','Payment not completed':'Paiement non terminé','We could not finish this test payment.':'Impossible de terminer ce paiement test.','The simulated biometric verification was rejected. No money was charged and no card or biometric data was transmitted.':'La vérification biométrique simulée a été refusée. Aucun débit ni transmission de données.','Attempted with':'Tentative avec','Status':'Statut','Declined in demo':'Refusé dans la démo','Try again':'Réessayer'
  },
  pt: {
    'Close biometric verification':'Fechar verificação biométrica','Identity verification':'Verificação de identidade','Confirm with biometrics':'Confirmar com biometria','Choose a simulated verification method. This demonstration never reads or stores real biometric data.':'Escolha um método simulado. Esta demonstração não lê nem guarda dados biométricos reais.','Ready for a demo scan.':'Pronto para uma leitura de demonstração.','Biometric method':'Método biométrico','Face ID':'Face ID','Facial recognition demo':'Demonstração de reconhecimento facial','Fingerprint':'Impressão digital','Touch verification demo':'Demonstração de verificação por toque','Windows Hello':'Windows Hello','Device verification demo':'Demonstração de verificação do dispositivo','Demo result':'Resultado da demonstração','Choose the result you want to preview.':'Escolha o resultado a pré-visualizar.','Success':'Sucesso','Failure':'Falha','Start demo scan':'Iniciar leitura de demonstração','Front-end simulation only. No camera, fingerprint sensor, secure enclave, or Windows Hello API is accessed.':'Apenas simulação front-end. Não é acedida nenhuma câmara, sensor de impressão digital ou API Windows Hello.','Scanning… Keep still.':'A analisar… Mantenha-se imóvel.','Identity verified.':'Identidade verificada.','Verification failed.':'Falha na verificação.','Payment successful':'Pagamento bem-sucedido','Payment completed':'Pagamento concluído','Your subscription is ready.':'A sua subscrição está pronta.','The biometric and payment steps were simulated locally. No real money was charged and no biometric or card data was transmitted.':'As etapas biométrica e de pagamento foram simuladas localmente. Não houve cobrança nem transmissão de dados.','Amount':'Montante','Verified with':'Verificado com','Reference':'Referência','Run another test':'Executar outro teste','Payment unsuccessful':'Pagamento sem sucesso','Payment not completed':'Pagamento não concluído','We could not finish this test payment.':'Não foi possível concluir este pagamento de teste.','The simulated biometric verification was rejected. No money was charged and no card or biometric data was transmitted.':'A verificação biométrica simulada foi rejeitada. Não houve cobrança nem transmissão de dados.','Attempted with':'Tentativa com','Status':'Estado','Declined in demo':'Recusado na demonstração','Try again':'Tentar novamente'
  },
  de: {
    'Close biometric verification':'Biometrische Prüfung schließen','Identity verification':'Identitätsprüfung','Confirm with biometrics':'Mit Biometrie bestätigen','Choose a simulated verification method. This demonstration never reads or stores real biometric data.':'Wähle eine simulierte Methode. Diese Demo liest oder speichert keine echten biometrischen Daten.','Ready for a demo scan.':'Bereit für einen Demo-Scan.','Biometric method':'Biometrische Methode','Face ID':'Face ID','Facial recognition demo':'Demo der Gesichtserkennung','Fingerprint':'Fingerabdruck','Touch verification demo':'Demo der Berührungsprüfung','Windows Hello':'Windows Hello','Device verification demo':'Demo der Geräteprüfung','Demo result':'Demo-Ergebnis','Choose the result you want to preview.':'Wähle das Ergebnis für die Vorschau.','Success':'Erfolg','Failure':'Fehler','Start demo scan':'Demo-Scan starten','Front-end simulation only. No camera, fingerprint sensor, secure enclave, or Windows Hello API is accessed.':'Nur Frontend-Simulation. Kamera, Fingerabdrucksensor und Windows-Hello-API werden nicht verwendet.','Scanning… Keep still.':'Scan läuft… Bitte stillhalten.','Identity verified.':'Identität bestätigt.','Verification failed.':'Verifizierung fehlgeschlagen.','Payment successful':'Zahlung erfolgreich','Payment completed':'Zahlung abgeschlossen','Your subscription is ready.':'Dein Abonnement ist bereit.','The biometric and payment steps were simulated locally. No real money was charged and no biometric or card data was transmitted.':'Biometrie und Zahlung wurden lokal simuliert. Es gab keine echte Belastung oder Datenübertragung.','Amount':'Betrag','Verified with':'Verifiziert mit','Reference':'Referenz','Run another test':'Weiteren Test starten','Payment unsuccessful':'Zahlung fehlgeschlagen','Payment not completed':'Zahlung nicht abgeschlossen','We could not finish this test payment.':'Diese Testzahlung konnte nicht abgeschlossen werden.','The simulated biometric verification was rejected. No money was charged and no card or biometric data was transmitted.':'Die simulierte biometrische Prüfung wurde abgelehnt. Es gab keine Belastung oder Datenübertragung.','Attempted with':'Versucht mit','Status':'Status','Declined in demo':'In Demo abgelehnt','Try again':'Erneut versuchen'
  }
};
Object.entries(biometricTranslationExtension).forEach(([language, entries]) => {
  Object.assign(translations[language] || (translations[language] = {}), entries);
});


const paymentFlowTranslationExtension = {
  'zh-CN': {
    'Every country uses the same Diners Club-related card options. The country selection only changes currency and estimated VAT. No information is sent to a payment provider; the success and failure outcomes are selectable simulations.':'所有国家使用相同的大来卡相关选项。国家选择只会改变币种和预估增值税，不会向支付服务商发送资料；成功与失败结果均为可选择的模拟。',
    'Both successful and unsuccessful payment outcomes can be previewed without a live gateway.':'无需连接真实金流，即可预览付款成功和付款失败结果。',
    'Front-end prototype only. Accounts stay in this browser, no gateway is connected, and payment or biometric results are simulated locally.':'仅为前端原型。账号保存在此浏览器中，不连接金流，付款与生物识别结果均在本地模拟。',
    'No live gateway is connected. The result is selected in the biometric demo.':'未连接真实金流，结果由生物识别演示页面选择。',
    'This option is visual only. No details are transmitted or stored, and the result is simulated.':'此选项仅用于视觉演示，不会传送或保存资料，结果为模拟。',
    'This option is displayed for UI preview only. Success and failure are simulated locally.':'此选项仅供界面预览，成功与失败均在本地模拟。',
    'This prototype never sends card data to a payment provider. Choose a success or failure result in the biometric test screen.':'此原型不会向支付服务商发送卡片资料。请在生物识别测试页面选择成功或失败结果。'
  },
  fr: {
    'Every country uses the same Diners Club-related card options. The country selection only changes currency and estimated VAT. No information is sent to a payment provider; the success and failure outcomes are selectable simulations.':'Tous les pays utilisent les mêmes options Diners Club. Le pays modifie uniquement la devise et la TVA estimée. Aucune donnée n’est envoyée ; les résultats sont simulés.',
    'Both successful and unsuccessful payment outcomes can be previewed without a live gateway.':'Les résultats de paiement réussi et échoué peuvent être prévisualisés sans passerelle réelle.',
    'Front-end prototype only. Accounts stay in this browser, no gateway is connected, and payment or biometric results are simulated locally.':'Prototype front-end uniquement. Les comptes restent dans ce navigateur et les résultats sont simulés localement.',
    'No live gateway is connected. The result is selected in the biometric demo.':'Aucune passerelle réelle n’est connectée. Le résultat est choisi dans la démo biométrique.',
    'This option is visual only. No details are transmitted or stored, and the result is simulated.':'Cette option est uniquement visuelle. Aucune donnée n’est transmise ou stockée et le résultat est simulé.',
    'This option is displayed for UI preview only. Success and failure are simulated locally.':'Cette option sert uniquement à prévisualiser l’interface. Succès et échec sont simulés localement.',
    'This prototype never sends card data to a payment provider. Choose a success or failure result in the biometric test screen.':'Ce prototype n’envoie jamais les données de carte. Choisissez un résultat dans l’écran de test biométrique.'
  },
  pt: {
    'Every country uses the same Diners Club-related card options. The country selection only changes currency and estimated VAT. No information is sent to a payment provider; the success and failure outcomes are selectable simulations.':'Todos os países usam as mesmas opções Diners Club. O país altera apenas a moeda e o IVA estimado. Nenhum dado é enviado; os resultados são simulações selecionáveis.',
    'Both successful and unsuccessful payment outcomes can be previewed without a live gateway.':'É possível pré-visualizar resultados de pagamento com sucesso e falha sem um gateway real.',
    'Front-end prototype only. Accounts stay in this browser, no gateway is connected, and payment or biometric results are simulated locally.':'Apenas protótipo front-end. As contas ficam neste navegador e os resultados são simulados localmente.',
    'No live gateway is connected. The result is selected in the biometric demo.':'Não existe gateway real ligado. O resultado é selecionado na demonstração biométrica.',
    'This option is visual only. No details are transmitted or stored, and the result is simulated.':'Esta opção é apenas visual. Nenhum dado é transmitido ou guardado e o resultado é simulado.',
    'This option is displayed for UI preview only. Success and failure are simulated locally.':'Esta opção serve apenas para pré-visualizar a interface. Sucesso e falha são simulados localmente.',
    'This prototype never sends card data to a payment provider. Choose a success or failure result in the biometric test screen.':'Este protótipo nunca envia dados do cartão. Escolha sucesso ou falha no ecrã de teste biométrico.'
  },
  de: {
    'Every country uses the same Diners Club-related card options. The country selection only changes currency and estimated VAT. No information is sent to a payment provider; the success and failure outcomes are selectable simulations.':'Alle Länder verwenden dieselben Diners-Club-Optionen. Das Land ändert nur Währung und geschätzte Mehrwertsteuer. Es werden keine Daten gesendet; Erfolg und Fehler sind wählbare Simulationen.',
    'Both successful and unsuccessful payment outcomes can be previewed without a live gateway.':'Erfolgreiche und fehlgeschlagene Zahlungen können ohne echtes Gateway angezeigt werden.',
    'Front-end prototype only. Accounts stay in this browser, no gateway is connected, and payment or biometric results are simulated locally.':'Nur Frontend-Prototyp. Konten bleiben im Browser und Zahlungs- oder Biometrieergebnisse werden lokal simuliert.',
    'No live gateway is connected. The result is selected in the biometric demo.':'Es ist kein echtes Gateway verbunden. Das Ergebnis wird in der Biometrie-Demo gewählt.',
    'This option is visual only. No details are transmitted or stored, and the result is simulated.':'Diese Option ist nur visuell. Es werden keine Daten übertragen oder gespeichert und das Ergebnis wird simuliert.',
    'This option is displayed for UI preview only. Success and failure are simulated locally.':'Diese Option dient nur der UI-Vorschau. Erfolg und Fehler werden lokal simuliert.',
    'This prototype never sends card data to a payment provider. Choose a success or failure result in the biometric test screen.':'Dieser Prototyp sendet keine Kartendaten. Wähle Erfolg oder Fehler im biometrischen Testbildschirm.'
  }
};
Object.entries(paymentFlowTranslationExtension).forEach(([language, entries]) => {
  Object.assign(translations[language] || (translations[language] = {}), entries);
});

const webAuthnTranslationExtension = {
  'zh-CN': {
    'Close device verification':'关闭设备验证','System identity verification':'系统身份验证','Confirm on this device':'在此设备上确认','The browser will open your device’s official platform authenticator, such as Touch ID, Face ID, Windows Hello, Android biometrics, or the device passcode.':'浏览器会打开设备的正式平台验证器，例如 Touch ID、Face ID、Windows Hello、Android 生物识别或设备密码。','Checking platform authenticator support…':'正在检查平台验证器支持…','Device verification':'设备验证','Touch ID, Face ID, Windows Hello, Android biometrics, or device passcode':'Touch ID、Face ID、Windows Hello、Android 生物识别或设备密码','Checking…':'检查中…','Open this project through HTTPS or localhost. WebAuthn cannot run from a normal file:// page.':'请通过 HTTPS 或 localhost 打开此项目。WebAuthn 无法在普通 file:// 页面运行。','Use device verification':'使用设备验证','Register this device again':'重新注册此设备','Your operating system handles the biometric or device-password check. This page receives only a signed WebAuthn credential response and never receives a fingerprint image, face scan, or biometric template. Because this project has no backend, the response is accepted locally for demonstration and is not production-grade payment authorization.':'生物识别或设备密码由操作系统处理。本页面只会收到签名后的 WebAuthn 凭证响应，不会收到指纹图像、脸部扫描或生物特征模板。由于项目没有后端，此响应仅在本地演示中接受，并非生产级付款授权。','Test checkout only.':'仅限测试结账。','Enter the designated Diners Club test number. When it is complete, the remaining required payment and billing fields are generated automatically.':'输入指定的大来卡测试卡号。输入完成后，其余必填付款与账单资料会自动生成。','Use only the designated test card. No gateway is connected and no live payment is processed.':'仅使用指定测试卡。未连接金流，也不会处理真实付款。','Try another payment':'再次测试付款','We could not finish this payment.':'无法完成这次付款。'
  },
  fr: {
    'System identity verification':'Vérification système de l’identité','Confirm on this device':'Confirmer sur cet appareil','Use device verification':'Utiliser la vérification de l’appareil','Register this device again':'Réenregistrer cet appareil','Test checkout only.':'Paiement de test uniquement.','Try another payment':'Essayer un autre paiement','We could not finish this payment.':'Nous n’avons pas pu terminer ce paiement.'
  },
  pt: {
    'System identity verification':'Verificação de identidade do sistema','Confirm on this device':'Confirmar neste dispositivo','Use device verification':'Usar verificação do dispositivo','Register this device again':'Registar novamente este dispositivo','Test checkout only.':'Checkout apenas para teste.','Try another payment':'Tentar outro pagamento','We could not finish this payment.':'Não foi possível concluir este pagamento.'
  },
  de: {
    'System identity verification':'System-Identitätsprüfung','Confirm on this device':'Auf diesem Gerät bestätigen','Use device verification':'Geräteprüfung verwenden','Register this device again':'Dieses Gerät erneut registrieren','Test checkout only.':'Nur Test-Checkout.','Try another payment':'Andere Zahlung versuchen','We could not finish this payment.':'Diese Zahlung konnte nicht abgeschlossen werden.'
  }
};
Object.entries(webAuthnTranslationExtension).forEach(([language, entries]) => {
  Object.assign(translations[language] || (translations[language] = {}), entries);
});

function loadUISettings() {
  try { uiSettings = { ...defaultSettings, ...(JSON.parse(storageGet(SETTINGS_KEY)) || {}) }; }
  catch { uiSettings = { ...defaultSettings }; }
}

function saveUISettings() { storageSet(SETTINGS_KEY, JSON.stringify(uiSettings)); }
function currentDictionary() { return translations[uiSettings.language] || {}; }
function translated(source) { return currentDictionary()[source] || source; }

function translateTextNode(node) {
  if (!node.nodeValue || !node.nodeValue.trim()) return;
  const parent = node.parentElement;
  if (!parent || ['SCRIPT','STYLE','TEXTAREA'].includes(parent.tagName)) return;
  if (!sourceTextNodes.has(node)) sourceTextNodes.set(node, node.nodeValue.trim());
  const source = sourceTextNodes.get(node);
  const target = translated(source);
  const lead = node.nodeValue.match(/^\s*/)?.[0] || '';
  const tail = node.nodeValue.match(/\s*$/)?.[0] || '';
  const next = `${lead}${target}${tail}`;
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateAttributes() {
  document.querySelectorAll('[placeholder], [aria-label], [title]').forEach((element) => {
    if (!attributeSources.has(element)) attributeSources.set(element, {});
    const sources = attributeSources.get(element);
    ['placeholder','aria-label','title'].forEach((name) => {
      if (!element.hasAttribute(name)) return;
      if (!sources[name]) sources[name] = element.getAttribute(name);
      const target = translated(sources[name]);
      if (element.getAttribute(name) !== target) element.setAttribute(name, target);
    });
  });
}

function localeForLanguage() {
  return { 'zh-CN':'zh-CN', fr:'fr-FR', en:'en-GB', pt:'pt-PT', de:'de-DE' }[uiSettings.language] || 'en-GB';
}
function localizedCountryName(code) {
  try { return new Intl.DisplayNames([localeForLanguage()], { type:'region' }).of(code); }
  catch { return countryData[code].name; }
}
function dyn(key, vars={}) {
  const table = {
    en: {
      tax:'Prices shown before estimated {country} VAT ({rate}%).', methods:'Diners Club options in {country}', billing:'Billing in {country} · {currency} · Diners Club only', vat:'Estimated VAT ({rate}%)', reverse:'VAT (demo reverse charge)', yearly:'Demo yearly amount: {amount} before applicable tax. No real charge occurs.', monthly:'Demo monthly amount: {amount} before applicable tax. No real charge occurs.', annualPeriod:'/ year', annualOffer:'Annual: {amount} / year · save 20%', annualFree:'Annual: {amount} / year', annualAverage:'Average {monthly} / month · save {saving}', annualAverageFree:'Average {monthly} / month'
    },
    'zh-CN': { tax:'价格未包含预估的{country}增值税（{rate}%）。',methods:'{country}的大来卡选项',billing:'账单国家：{country} · {currency} · 仅限大来卡',vat:'预估增值税（{rate}%）',reverse:'增值税（演示反向征收）',yearly:'演示年付金额：{amount}，未含适用税费。不会真实扣款。',monthly:'演示月付金额：{amount}，未含适用税费。不会真实扣款。',annualPeriod:'/ 年', annualOffer:'年付：{amount}／年 · 节省 20%', annualFree:'年付：{amount}／年', annualAverage:'平均每月 {monthly} · 节省 {saving}', annualAverageFree:'平均每月 {monthly}' },
    fr: { tax:'Prix affichés avant la TVA estimée en {country} ({rate} %).',methods:'Options Diners Club en {country}',billing:'Facturation en {country} · {currency} · Diners Club uniquement',vat:'TVA estimée ({rate} %)',reverse:'TVA (autoliquidation démo)',yearly:'Montant annuel démo : {amount} avant taxes applicables. Aucun débit réel.',monthly:'Montant mensuel démo : {amount} avant taxes applicables. Aucun débit réel.',annualPeriod:'/ an', annualOffer:'Annuel : {amount} / an · économisez 20 %', annualFree:'Annuel : {amount} / an', annualAverage:'Moyenne {monthly} / mois · économie de {saving}', annualAverageFree:'Moyenne {monthly} / mois' },
    pt: { tax:'Preços apresentados antes do IVA estimado em {country} ({rate}%).',methods:'Opções Diners Club em {country}',billing:'Faturação em {country} · {currency} · apenas Diners Club',vat:'IVA estimado ({rate}%)',reverse:'IVA (autoliquidação de demonstração)',yearly:'Valor anual de demonstração: {amount} antes dos impostos aplicáveis. Não ocorre cobrança real.',monthly:'Valor mensal de demonstração: {amount} antes dos impostos aplicáveis. Não ocorre cobrança real.',annualPeriod:'/ ano', annualOffer:'Anual: {amount} / ano · poupe 20%', annualFree:'Anual: {amount} / ano', annualAverage:'Média de {monthly} / mês · poupe {saving}', annualAverageFree:'Média de {monthly} / mês' },
    de: { tax:'Preise vor geschätzter Mehrwertsteuer in {country} ({rate} %).',methods:'Diners-Club-Optionen in {country}',billing:'Abrechnung in {country} · {currency} · nur Diners Club',vat:'Geschätzte MwSt. ({rate} %)',reverse:'MwSt. (Demo-Umkehrung)',yearly:'Demo-Jahresbetrag: {amount} vor anwendbaren Steuern. Es erfolgt keine echte Belastung.',monthly:'Demo-Monatsbetrag: {amount} vor anwendbaren Steuern. Es erfolgt keine echte Belastung.',annualPeriod:'/ Jahr', annualOffer:'Jährlich: {amount} / Jahr · 20 % sparen', annualFree:'Jährlich: {amount} / Jahr', annualAverage:'Durchschnittlich {monthly} / Monat · {saving} sparen', annualAverageFree:'Durchschnittlich {monthly} / Monat' }
  };
  let text = (table[uiSettings.language] || table.en)[key] || '';
  Object.entries(vars).forEach(([k,v]) => { text = text.replaceAll(`{${k}}`, v); });
  return text;
}

function applyDynamicTranslations() {
  const country = countryData[selectedCountry];
  const countryName = localizedCountryName(selectedCountry);
  document.documentElement.lang = uiSettings.language;
  document.querySelectorAll('#countrySelect option').forEach((option) => {
    const nextName = localizedCountryName(option.value);
    if (option.textContent !== nextName) option.textContent = nextName;
  });
  const period = selectedCycle === 'annual' ? dyn('annualPeriod') : translated('/ month');
  document.querySelectorAll('.price-period').forEach((el) => { if (el.textContent !== period) el.textContent = period; });
  document.querySelectorAll('[data-annual-plan]').forEach((el) => {
    const plan = el.dataset.annualPlan;
    const text = selectedCycle === 'annual'
      ? dyn(plan === 'Free' ? 'annualAverageFree' : 'annualAverage', {
          monthly: formatMoney(annualTotal(plan) / 12),
          saving: formatMoney(annualSaving(plan))
        })
      : dyn(plan === 'Free' ? 'annualFree' : 'annualOffer', { amount: formatMoney(annualTotal(plan)) });
    if (el.textContent !== text) el.textContent = text;
  });
  const taxSummaryEl = document.getElementById('taxSummary');
  if (taxSummaryEl) taxSummaryEl.textContent = dyn('tax', { country: countryName, rate: country.vat });
  const localTitle = document.getElementById('localPaymentTitle');
  if (localTitle) localTitle.textContent = dyn('methods', { country: countryName });
  const checkoutCountry = document.getElementById('checkoutCountryText');
  if (checkoutCountry) checkoutCountry.textContent = dyn('billing', { country: countryName, currency: country.currency });
  const cycle = document.getElementById('summaryCycle');
  if (cycle) cycle.textContent = translated(selectedCycle === 'annual' ? 'Annual subscription' : 'Monthly subscription');
  const taxLabel = document.getElementById('summaryTaxLabel');
  if (taxLabel) taxLabel.textContent = getVatRate() === 0 ? dyn('reverse') : dyn('vat', { rate: country.vat });
  const renewal = document.getElementById('renewalText');
  if (renewal) renewal.textContent = dyn(selectedCycle === 'annual' ? 'yearly' : 'monthly', { amount: formatMoney(chargeSubtotal()) });
  const successPlanEl = document.getElementById('successPlan');
  if (successPlanEl) successPlanEl.textContent = `${selectedPlan} · ${translated(selectedCycle === 'annual' ? 'Annual' : 'Monthly')}`;
}

let translationQueued = false;
let isTranslating = false;
let translationObserverActive = false;

function startTranslationObserver() {
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  translationObserverActive = true;
}

function translateInterface() {
  if (isTranslating) return;
  isTranslating = true;

  // Translation changes text nodes itself. Temporarily disconnecting the observer
  // prevents those changes from scheduling another translation forever.
  if (translationObserverActive) mutationObserver.disconnect();

  try {
    document.querySelectorAll('body *').forEach((element) => {
      Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .forEach(translateTextNode);
    });
    translateAttributes();
    applyDynamicTranslations();
  } finally {
    if (translationObserverActive) startTranslationObserver();
    isTranslating = false;
  }
}

function queueTranslation() {
  if (translationQueued || isTranslating) return;
  translationQueued = true;
  requestAnimationFrame(() => {
    translationQueued = false;
    translateInterface();
  });
}

function resolveTheme() {
  const dark = uiSettings.theme === 'dark' || (uiSettings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.resolvedTheme = dark ? 'dark' : 'light';
}
function applyUISettings({ persist=true } = {}) {
  document.documentElement.dataset.fontSize = uiSettings.fontSize;
  document.documentElement.dataset.density = uiSettings.density;
  document.documentElement.dataset.highContrast = String(uiSettings.highContrast);
  document.documentElement.dataset.reduceMotion = String(uiSettings.reduceMotion);
  resolveTheme();
  if (persist) saveUISettings();
  queueTranslation();
}
function syncSettingsControls() {
  document.getElementById('languageSetting').value = uiSettings.language;
  document.getElementById('themeSetting').value = uiSettings.theme;
  document.getElementById('fontSizeSetting').value = uiSettings.fontSize;
  document.getElementById('densitySetting').value = uiSettings.density;
  document.getElementById('contrastSetting').checked = uiSettings.highContrast;
  document.getElementById('motionSetting').checked = uiSettings.reduceMotion;
}
function openSettings() {
  syncSettingsControls();
  settingsModal.classList.add('open');
  settingsModal.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('languageSetting').focus(), 100);
}
function closeSettings() {
  settingsModal.classList.remove('open');
  settingsModal.setAttribute('aria-hidden','true');
  if (![modal, authModal, successScreen, failureScreen, biometricModal].some((el) => el.classList.contains('open'))) document.body.style.overflow = '';
}

const settingsModal = document.getElementById('settingsModal');
document.getElementById('settingsButton').addEventListener('click', openSettings);
document.getElementById('closeSettings').addEventListener('click', closeSettings);
document.getElementById('doneSettings').addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) closeSettings(); });
[
  ['languageSetting','language'], ['themeSetting','theme'], ['fontSizeSetting','fontSize'], ['densitySetting','density']
].forEach(([id,key]) => document.getElementById(id).addEventListener('change', (event) => { uiSettings[key] = event.target.value; applyUISettings(); }));
document.getElementById('contrastSetting').addEventListener('change', (event) => { uiSettings.highContrast = event.target.checked; applyUISettings(); });
document.getElementById('motionSetting').addEventListener('change', (event) => { uiSettings.reduceMotion = event.target.checked; applyUISettings(); });
document.getElementById('resetSettings').addEventListener('click', () => {
  uiSettings = { ...defaultSettings };
  syncSettingsControls();
  applyUISettings();
  showToast(translated('Settings reset.'));
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (uiSettings.theme === 'system') resolveTheme(); });

const mutationObserver = new MutationObserver((mutations) => {
  if (isTranslating) return;

  // Only translate newly inserted interface elements. Character-data observation
  // caused translated country names to be repeatedly restored and translated again.
  const hasNewContent = mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some((node) =>
      node.nodeType === Node.ELEMENT_NODE ||
      (node.nodeType === Node.TEXT_NODE && Boolean(node.nodeValue?.trim()))
    )
  );
  if (hasNewContent) queueTranslation();
});
startTranslationObserver();
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && settingsModal.classList.contains('open')) closeSettings(); }, true);

loadUISettings();
syncSettingsControls();
applyUISettings({ persist:false });
translateInterface();
