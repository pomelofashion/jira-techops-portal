// src/api/usersApi.js
// User management against the BFF (server/routes/users.js). Backend mode only —
// mock mode keeps using the MOCK_USERS store owned by the app shell, branched
// at the call-site via API_ENABLED. Every function returns { data, error }.

import { api, wrap } from './client.js';

// → { users: [...] } (requires users.edit)
export const listUsers = () => wrap(async () => (await api.get('/api/users')).data);

// payload: { name, email, password, roleId, department? } (requires users.create)
export const createUser = payload => wrap(async () => (await api.post('/api/users', payload)).data);

// updates: { name?, email?, department?, roleId?, active? } — the server
// enforces the per-field capability (users.edit / roles.assign / users.delete).
export const updateUser = (id, updates) =>
  wrap(async () => (await api.patch(`/api/users/${id}`, updates)).data);

// Self-service: set (data-URL) or clear (null) the caller's own avatar.
export const setMyAvatar = avatarUrl =>
  wrap(async () => (await api.put('/api/users/me/avatar', { avatarUrl })).data);
