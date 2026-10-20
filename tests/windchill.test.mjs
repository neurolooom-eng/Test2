import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { normalizeWindchillHost, normalizeServicePath, normalizeWindchillSettings, windchillServiceUrl } from '../src/windchill.ts'
const { windchillUrl, testWindchill } = createRequire(import.meta.url)('../electron/windchill.cjs')

test('Windchill host and service path are normalised; https only, no credentials, path under /Windchill/', () => {
  assert.equal(normalizeWindchillHost('plm.example.com'), 'https://plm.example.com')
  assert.equal(normalizeWindchillHost(' https://plm.example.com/Windchill/app/ '), 'https://plm.example.com')
  assert.throws(() => normalizeWindchillHost('http://plm.example.com'), /https/)
  assert.throws(() => normalizeWindchillHost('https://me:pw@plm.example.com'), /password/)
  assert.equal(normalizeServicePath('Windchill/servlet/odata/'), '/Windchill/servlet/odata')
  assert.throws(() => normalizeServicePath('/other/api'), /Windchill/)
  assert.throws(() => normalizeServicePath('/Windchill/../admin'), /Windchill/)
  const settings = normalizeWindchillSettings({ host: 'plm.example.com', servicePath: '', objectType: ' DocMgmt/Documents ', login: 'basic' })
  assert.deepEqual(settings, { host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata', login: 'sso', objectType: 'DocMgmt/Documents', filter: '', fields: '' })
  assert.equal(windchillServiceUrl(settings), 'https://plm.example.com/Windchill/servlet/odata')
  assert.equal(normalizeWindchillSettings(null).host, '')
})

test('desktop connection test: one GET to the service root; clear messages for refused sign-on and redirects', async () => {
  assert.throws(() => windchillUrl({ host: 'http://plm.example.com', servicePath: '/Windchill/servlet/odata' }), /https/)
  assert.throws(() => windchillUrl({ host: 'https://plm.example.com/x', servicePath: '/Windchill/servlet/odata' }), /no path/)
  assert.throws(() => windchillUrl({ host: 'https://plm.example.com', servicePath: '/api' }), /Windchill/)
  const calls = []
  const ok = await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async (url, options) => { calls.push([url, options.method]); return Response.json({ value: [{ name: 'ProdMgmt' }, { name: 'DocMgmt' }] }) })
  assert.deepEqual(calls, [['https://plm.example.com/Windchill/servlet/odata', 'GET']])
  assert.deepEqual([ok.ok, ok.services], [true, ['ProdMgmt', 'DocMgmt']])
  assert.match((await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async () => new Response('', { status: 401 }))).message, /single sign-on/)
  assert.match((await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async () => new Response(null, { status: 302 }))).message, /sign-in page/)
  assert.match((await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async () => { throw new Error('ENOTFOUND') })).message, /Could not reach/)
})
