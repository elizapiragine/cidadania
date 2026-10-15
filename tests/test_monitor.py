import unittest
from unittest.mock import patch
from monitor import classify, notify

URL = 'https://prenotami.esteri.it/Services/Booking/5967'


class ClassificationTests(unittest.TestCase):
    def test_form(self):
        self.assertEqual(classify(URL, 200, 'Prenotazione Singola AVANTI', {'select', 'file'}), 'form_available')

    def test_login_is_not_availability(self):
        self.assertEqual(classify(URL, 200, 'Login', {'password'}), 'login_required')

    def test_redirect(self):
        self.assertEqual(classify('https://prenotami.esteri.it/Home/Login', 200, '', set()), 'login_required')

    def test_unavailable(self):
        self.assertEqual(classify(URL, 200, 'Al momento non ci sono date disponibili', set()), 'unavailable')

    def test_protection(self):
        self.assertEqual(classify(URL, 200, 'Just a moment', set()), 'blocked')
        self.assertEqual(classify(URL, 429, '', set()), 'blocked')

    def test_generic_success_is_unknown(self):
        self.assertEqual(classify(URL, 200, 'Home', set()), 'unknown')

    def test_server_failure(self):
        self.assertEqual(classify(URL, 503, '', set()), 'error')

    def test_unavailability_overrides_form_in_background(self):
        self.assertEqual(classify(URL, 200, 'Prenotazione Singola AVANTI Non sono disponibili appuntamenti', {'text'}), 'unavailable')

    @patch.dict('os.environ', {'TELEGRAM_BOT_TOKEN': 'private-test-token', 'TELEGRAM_CHAT_ID': '123'})
    @patch('urllib.request.urlopen', side_effect=Exception('private-test-token'))
    def test_notification_error_does_not_disclose_token(self, request):
        with self.assertRaisesRegex(RuntimeError, '^Falha ao enviar aviso ao Telegram.$'):
            notify('teste')
