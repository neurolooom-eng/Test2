// Windchill connection test from the desktop app: one read-only GET of the configured host's service root
// (https, a path under /Windchill/), signed in with the Windows single sign-on of Chromium's network stack.
// Returns the status and the names of the services the server lists; nothing is written.
function windchillUrl(request) {
  if (!request || typeof request.host !== 'string' || typeof request.servicePath !== 'string') throw new Error('Enter the Windchill host first.')
  const host = new URL(request.host)
  if (host.protocol !== 'https:' || host.username || host.password || host.pathname !== '/' || host.search || host.hash) throw new Error('The Windchill host must be an https address with no path.')
  if (!/^\/Windchill\/[\w./-]*$/i.test(request.servicePath) || request.servicePath.includes('..')) throw new Error('The service path must start with /Windchill/.')
  return new URL(request.servicePath, host.origin)
}

async function testWindchill(request, fetch) {
  const url = windchillUrl(request)
  let response
  try { response = await fetch(url.href, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'manual' }) }
  catch (error) { return { ok: false, status: 0, message: `Could not reach ${url.host}: ${error instanceof Error ? error.message : 'network error'}. Check the host name, VPN and proxy.`, services: [] } }
  if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, message: 'Windchill refused the single sign-on (status ' + response.status + '). The server may require another login method.', services: [] }
  if (response.status >= 300 && response.status < 400) return { ok: false, status: response.status, message: 'Windchill redirected to another page (status ' + response.status + '), probably a sign-in page. Single sign-on from the app may not be supported for this server.', services: [] }
  if (!response.ok) return { ok: false, status: response.status, message: `Windchill answered with status ${response.status}. Check the service path (e.g. /Windchill/servlet/odata).`, services: [] }
  let body
  try { body = await response.json() } catch { return { ok: false, status: response.status, message: 'Windchill answered, but not with JSON: the service path may not be the REST (OData) service root.', services: [] } }
  const services = Array.isArray(body?.value) ? body.value.map((entry) => entry?.name ?? entry?.url).filter((name) => typeof name === 'string').slice(0, 100) : []
  return { ok: true, status: response.status, message: services.length ? `Connected: ${services.length} services listed.` : 'Connected, but no services were listed.', services }
}

module.exports = { windchillUrl, testWindchill }
