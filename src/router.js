/**
 * Minimal HTTP router — matches method + path with named params
 */

export class Router {
  constructor() {
    this._routes = [];
  }

  add(method, pattern, handler) {
    // Convert /v1/nodes/:node_id to regex
    const paramNames = [];
    const re = new RegExp(
      '^' +
      pattern.replace(/:([a-zA-Z_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      }) +
      '$'
    );
    this._routes.push({ method: method.toUpperCase(), re, paramNames, handler });
  }

  get(p, h)    { this.add('GET',    p, h); }
  post(p, h)   { this.add('POST',   p, h); }
  patch(p, h)  { this.add('PATCH',  p, h); }
  delete(p, h) { this.add('DELETE', p, h); }

  match(method, pathname) {
    for (const route of this._routes) {
      if (route.method !== method.toUpperCase()) continue;
      const m = route.re.exec(pathname);
      if (!m) continue;
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = m[i + 1]; });
      return { handler: route.handler, params };
    }
    return null;
  }
}
