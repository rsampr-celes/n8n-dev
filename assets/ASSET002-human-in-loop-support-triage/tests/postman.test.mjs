import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const collection = JSON.parse(fs.readFileSync(
  path.join(testDirectory, '..', 'postman', 'ASSET002-support-triage.postman_collection.json'),
  'utf8',
));

function requestBody(index) {
  return JSON.parse(collection.item[index].request.body.raw);
}

test('Postman collection covers six support-event scenarios and one Chatwoot end-to-end folder', () => {
  assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.equal(collection.item.length, 7);
  assert.deepEqual(collection.item.map((item) => item.name), [
    '01 - Standard Incoming Customer Message',
    '02 - Exact Duplicate Replay',
    '03 - Sensitive Security Request',
    '04 - Invalid Incoming Event',
    '05 - Public Agent Response Delivery',
    '06 - Private Chatwoot Note Ignored',
    '07 - Chatwoot End-to-End',
  ]);
});

test('direct event requests target the production webhook with JSON bodies', () => {
  for (const item of collection.item.slice(0, 6)) {
    assert.equal(item.request.method, 'POST');
    assert.equal(item.request.url.raw, '{{baseUrl}}/{{webhookPath}}');
    assert.equal(item.request.header[0].value, 'application/json');
    assert.equal(item.request.body.mode, 'raw');
    assert.doesNotThrow(() => JSON.parse(item.request.body.raw));
  }
});

test('Chatwoot end-to-end folder uses the Website widget API for incoming messages', () => {
  const folder = collection.item[6];
  assert.deepEqual(folder.item.map((item) => item.name), [
    '01 - Initialize Website Widget Session',
    '02 - Create Website Conversation',
    '03 - Send Incoming Chatwoot Message',
  ]);

  const [contact, conversation, message] = folder.item;
  assert.equal(contact.request.url.raw, '{{chatwootBaseUrl}}/api/v1/widget/config');
  assert.equal(conversation.request.url.raw, '{{chatwootBaseUrl}}/api/v1/widget/conversations');
  assert.equal(message.request.url.raw, '{{chatwootBaseUrl}}/api/v1/widget/messages');

  for (const item of folder.item) {
    assert.equal(item.request.method, 'POST');
    assert.equal(item.request.header[0].value, 'application/json');
    assert.equal(item.request.body.mode, 'raw');
    const substitutedBody = item.request.body.raw
      .replace(/{{\$timestamp}}/g, '1')
      .replace(/{{[^}]+}}/g, '1');
    assert.doesNotThrow(() => JSON.parse(substitutedBody));
  }

  for (const item of [conversation, message]) {
    assert.deepEqual(item.request.header[1], {
      key: 'X-Auth-Token',
      value: '{{chatwootWidgetAuthToken}}',
      type: 'text',
    });
  }

  assert.match(contact.event[1].script.exec.join('\n'), /chatwootContactId/);
  assert.match(contact.event[1].script.exec.join('\n'), /chatwootWidgetAuthToken/);
  assert.match(conversation.event[1].script.exec.join('\n'), /chatwootConversationId/);
  assert.match(message.event[1].script.exec.join('\n'), /chatwootMessageId/);

  const messageBody = JSON.parse(message.request.body.raw.replace(/{{\$timestamp}}/g, '1'));
  assert.equal(messageBody.message.content, 'Where can I download a copy of my latest invoice?');
  assert.match(messageBody.message.echo_id, /^postman-/);
});

test('duplicate replay uses the same canonical business identifiers', () => {
  const initial = requestBody(0);
  const duplicate = requestBody(1);
  assert.equal(duplicate.id, initial.id);
  assert.equal(duplicate.account.id, initial.account.id);
  assert.equal(duplicate.conversation.id, initial.conversation.id);
  assert.equal(duplicate.content, initial.content);
});

test('negative, delivery, and loop-prevention events have the intended shapes', () => {
  const sensitive = requestBody(2);
  const invalid = requestBody(3);
  const delivery = requestBody(4);
  const privateNote = requestBody(5);

  assert.match(sensitive.content, /compromised|personal information/i);
  assert.equal(Object.hasOwn(invalid, 'content'), false);
  assert.equal(Object.hasOwn(invalid, 'account'), false);
  assert.equal(delivery.message_type, 'outgoing');
  assert.equal(delivery.private, false);
  assert.equal(privateNote.message_type, 'outgoing');
  assert.equal(privateNote.private, true);
});

test('collection contains only synthetic example.com identities and no secret values', () => {
  const serialized = JSON.stringify(collection);
  const websiteTokenVariable = collection.variable.find((variable) => variable.key === 'chatwootWebsiteToken');
  const widgetAuthTokenVariable = collection.variable.find((variable) => variable.key === 'chatwootWidgetAuthToken');
  assert.equal(websiteTokenVariable.value, '');
  assert.equal(widgetAuthTokenVariable.value, '');
  assert.doesNotMatch(serialized, /authorization|bearer|CHATWOOT_API_ACCESS_TOKEN/i);
  assert.doesNotMatch(serialized, /api_access_token|chatwootApiToken/);
  assert.doesNotMatch(serialized, /@(?!example\.com)/i);
});
