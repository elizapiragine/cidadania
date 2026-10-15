export function classify({url, text, fields}, service) {
  const body = text.toLowerCase().replace(/\s+/g, ' ');
  const parsed = new URL(url);
  if (parsed.hostname === 'validate.perfdrive.com' || [
    'accesso temporaneamente limitato', 'traffico verso questo servizio',
    'verify you are human', 'verifica di essere umano', 'just a moment',
    'checking your browser', 'attention required', 'too many requests'
  ].some(s => body.includes(s))) return 'blocked';
  if (parsed.hostname === 'iam.esteri.it' || fields.includes('password') ||
      /\/login\/?$/i.test(parsed.pathname)) return 'login_required';
  if (['al momento non ci sono date', 'nessuna disponibilità',
    'non ci sono appuntamenti', 'non sono disponibili',
    'non ci sono disponibilità', 'no appointments available'
  ].some(s => body.includes(s))) return 'unavailable';
  if (parsed.hostname === 'prenotami.esteri.it' &&
      parsed.pathname.replace(/\/$/, '') === `/Services/Booking/${service}` &&
      body.includes('avanti') && body.includes('prenotazione singola') &&
      fields.some(f => ['text', 'file', 'select'].includes(f))) return 'form_available';
  return 'unknown';
}
