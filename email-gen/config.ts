const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const OPENAI_API_KEY = required('OPENAI_API_KEY');
export const RESEND_API_KEY = required('RESEND_API_KEY');
