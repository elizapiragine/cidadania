import test from 'node:test';
import assert from 'node:assert/strict';
import {classify} from '../../extension/classify.mjs';
const page = {url:'https://prenotami.esteri.it/Services/Booking/5967', text:'Prenotazione Singola AVANTI', fields:['select', 'text']};
test('expected form only', () => {
  assert.equal(classify(page, '5967'), 'form_available');
  assert.equal(classify(page, '4705'), 'unknown');
});
test('security restriction overrides form', () => {
  assert.equal(classify({...page, text:page.text + ' Accesso temporaneamente limitato'}, '5967'), 'blocked');
});
test('identity redirect requires intervention', () => {
  assert.equal(classify({...page, url:'https://iam.esteri.it/signin/'}, '5967'), 'login_required');
});
test('login field never means available', () => {
  assert.equal(classify({...page, fields:['password']}, '5967'), 'login_required');
});
test('unavailability modal overrides underlying form', () => {
  assert.equal(classify({...page, text:page.text + ' Al momento non ci sono date disponibili'}, '5967'), 'unavailable');
});
test('observed English popup on services list means unavailable', () => {
  const modal = {url:'https://prenotami.esteri.it/Services',
    text:'Reservar All appointments for this service are currently booked. OK', fields:[]};
  assert.equal(classify(modal, '4705'), 'unavailable');
  assert.equal(classify({...modal, text:'ALL APPOINTMENTS FOR THIS SERVICE\n ARE CURRENTLY BOOKED.'}, '5967'), 'unavailable');
});
test('unknown is not silently unavailable', () => {
  assert.equal(classify({...page, text:'Not Found'}, '5967'), 'unknown');
});
test('challenge domain pauses', () => {
  assert.equal(classify({...page, url:'https://validate.perfdrive.com/check'}, '5967'), 'blocked');
});
