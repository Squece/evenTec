export interface Env {
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  CODES: KVNamespace;
  RESEND_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM?: string;
}
