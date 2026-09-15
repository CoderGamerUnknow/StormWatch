/**
 * config.example.js — TEMPLATE for config.local.js (LOCKED SECRETS FILE)
 * ======================================================================
 * 1. Copy this file:            cp config.example.js config.local.js
 * 2. Fill in your real keys below.
 * 3. config.local.js is gitignored — it will NEVER be committed or pushed.
 *
 * index.html loads ./config.local.js in a <script> tag BEFORE the main app
 * script. Whatever you assign to window.STORMWATCH_CONFIG here is merged over
 * CONFIG_DEFAULTS by loadAppConfig(). Precedence per setting:
 *
 *     config.local.js value  >  previously-saved localStorage value  >  null
 *
 * Leaving a key as null simply disables that integration — the app runs
 * 100% key-less (zero-backend defaults) without this file at all.
 *
 * SECURITY NOTES
 * - These values ship to the browser: the EmailJS public key and the Supabase
 *   anon key are DESIGNED to be public. Protect them with domain allow-lists
 *   (EmailJS) and Row Level Security (Supabase) — see README "Locking up your
 *   keys".
 * - NEVER put a private/secret key in this file. There is no server here to
 *   hide one in.
 */
window.STORMWATCH_CONFIG = {

  // ---- EmailJS (hazard alert email delivery) -----------------------------
  // From https://dashboard.emailjs.com → Email Services / Templates / Account.
  // Template variables available: {{to_email}} {{subject}} {{message}}
  // {{location}} {{hazard_status}}. Add an "allowed domain" for your site in
  // the EmailJS dashboard so only YOUR deployment can use the key.
  emailjs: {
    serviceId: null,   // e.g. 'service_xxxxxxx'
    templateId: null,  // e.g. 'template_xxxxxxx'
    publicKey: null,   // e.g. 'xxxxxxxxxxxxx' (Account → API keys)
  },

  // ---- Supabase (community hazard reports cloud feed) --------------------
  // Project Settings → API. Run the table SQL from README "Community hazard
  // reports" first, with RLS enabled and public read/insert policies.
  supabase: {
    url: null,      // e.g. 'https://yourproject.supabase.co'
    anonKey: null,  // e.g. 'eyJhbGciOi…'  (anon/public key ONLY)
    table: 'stormwatch_reports',
  },
};
