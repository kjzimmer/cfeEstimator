const TOKEN_KEY = 'cfe_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, headers = {}, isFormData = false } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (res.status === 401) {
    setToken(null);
    window.location.assign('/login');
    throw new Error('Session expired');
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),

  listCompanyInfo: () => request('/company-info'),
  getCompanyInfoSection: (key) => request(`/company-info/${key}`),
  updateCompanyInfoSection: (key, content) =>
    request(`/company-info/${key}`, { method: 'PUT', body: { content } }),

  getIdentity: () => request('/company-info/identity'),
  updateIdentity: (payload) => request('/company-info/identity', { method: 'PUT', body: payload }),

  listRateCardItems: (sectionKey) => request(`/company-info/${sectionKey}/items`),
  createRateCardItem: (sectionKey, payload) =>
    request(`/company-info/${sectionKey}/items`, { method: 'POST', body: payload }),
  updateRateCardItem: (sectionKey, itemId, payload) =>
    request(`/company-info/${sectionKey}/items/${itemId}`, { method: 'PUT', body: payload }),
  deleteRateCardItem: (sectionKey, itemId) =>
    request(`/company-info/${sectionKey}/items/${itemId}`, { method: 'DELETE' }),

  listCustomers: () => request('/customers'),
  getCustomer: (id) => request(`/customers/${id}`),
  createCustomer: (payload) => request('/customers', { method: 'POST', body: payload }),
  updateCustomer: (id, payload) => request(`/customers/${id}`, { method: 'PUT', body: payload }),
  listCustomerProjects: (id) => request(`/customers/${id}/projects`),

  listProjects: (historical) =>
    request(`/projects${historical === undefined ? '' : `?historical=${historical}`}`),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (payload) => request('/projects', { method: 'POST', body: payload }),
  updateDefinitionComponent: (projectId, componentKey, content) =>
    request(`/projects/${projectId}/definition/${componentKey}`, {
      method: 'PUT',
      body: { content },
    }),

  listUsers: () => request('/users'),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PUT', body: payload }),

  listMessages: (projectId) => request(`/projects/${projectId}/messages`),
  sendMessage: (projectId, content, type = 'text') =>
    request(`/projects/${projectId}/messages`, { method: 'POST', body: { content, type } }),

  listFiles: (projectId) => request(`/projects/${projectId}/files`),
  uploadFile: (projectId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/projects/${projectId}/files`, {
      method: 'POST',
      body: formData,
      isFormData: true,
    });
  },
  // Files are served behind requireAuth, so <img src> can't hit them
  // directly -- fetch as a blob (with the auth header) and hand back an
  // object URL the caller is responsible for revoking. Content-Type comes
  // from the response header, same value the server stored as mime_type.
  fetchFileBlobUrl: async (projectId, fileId) => {
    const token = getToken();
    const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Failed to load file');
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), mimeType };
  },
};
