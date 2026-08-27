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
  syncQuickbooksRates: () => request('/company-info/sync-quickbooks', { method: 'POST' }),

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

  listWorkOrders: (projectId) => request(`/projects/${projectId}/work-orders`),
  getWorkOrderDraft: (projectId) => request(`/projects/${projectId}/work-orders/draft`),
  createWorkOrderDraft: (projectId) =>
    request(`/projects/${projectId}/work-orders/draft`, { method: 'POST' }),
  getWorkOrder: (projectId, woId) => request(`/projects/${projectId}/work-orders/${woId}`),
  updateWorkOrder: (projectId, woId, payload) =>
    request(`/projects/${projectId}/work-orders/${woId}`, { method: 'PUT', body: payload }),
  addWorkOrderLineItem: (projectId, woId, payload) =>
    request(`/projects/${projectId}/work-orders/${woId}/line-items`, { method: 'POST', body: payload }),
  updateWorkOrderLineItem: (projectId, woId, itemId, payload) =>
    request(`/projects/${projectId}/work-orders/${woId}/line-items/${itemId}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteWorkOrderLineItem: (projectId, woId, itemId) =>
    request(`/projects/${projectId}/work-orders/${woId}/line-items/${itemId}`, { method: 'DELETE' }),
  finalizeWorkOrder: (projectId, woId) =>
    request(`/projects/${projectId}/work-orders/${woId}/finalize`, { method: 'POST' }),
  reviseWorkOrder: (projectId, woId) =>
    request(`/projects/${projectId}/work-orders/${woId}/revise`, { method: 'POST' }),
  getWorkOrderProfit: (projectId, woId) =>
    request(`/projects/${projectId}/work-orders/${woId}/profit`),

  listTasks: (projectId, woId) => request(`/projects/${projectId}/work-orders/${woId}/tasks`),
  createTask: (projectId, woId, payload) =>
    request(`/projects/${projectId}/work-orders/${woId}/tasks`, { method: 'POST', body: payload }),
  updateTask: (projectId, woId, taskId, payload) =>
    request(`/projects/${projectId}/work-orders/${woId}/tasks/${taskId}`, { method: 'PUT', body: payload }),
  deleteTask: (projectId, woId, taskId) =>
    request(`/projects/${projectId}/work-orders/${woId}/tasks/${taskId}`, { method: 'DELETE' }),
  addTaskDependency: (projectId, woId, taskId, dependsOnTaskId) =>
    request(`/projects/${projectId}/work-orders/${woId}/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: { dependsOnTaskId },
    }),
  deleteTaskDependency: (projectId, woId, taskId, depId) =>
    request(`/projects/${projectId}/work-orders/${woId}/tasks/${taskId}/dependencies/${depId}`, {
      method: 'DELETE',
    }),
  approveTaskList: (projectId, woId) =>
    request(`/projects/${projectId}/work-orders/${woId}/tasks/approve`, { method: 'POST' }),

  listUsers: () => request('/users'),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PUT', body: payload }),

  listMemoryProposals: () => request('/memory/proposals'),
  listActiveMemory: () => request('/memory/active'),
  listRetiredMemory: () => request('/memory/retired'),
  reviewMemoryEntry: (type, id, decision) =>
    request(`/memory/${type}/${id}/review`, { method: 'POST', body: { decision } }),

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
  // Direct Documents-tab upload -- same endpoint as chat attachment, but
  // tagged source=direct (no chat message posted) with an explicit type.
  uploadDocument: (projectId, file, type) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', 'direct');
    formData.append('type', type);
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
