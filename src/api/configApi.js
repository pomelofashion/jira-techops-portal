// src/api/configApi.js
// Global app config (server/routes/config.js). Every function returns
// { data, error }.

import { api, wrap } from './client.js';

export const getTicketFieldConfig = () =>
  wrap(async () => (await api.get('/api/config/ticket-fields')).data);

export const setTicketFieldConfig = fields =>
  wrap(async () => (await api.put('/api/config/ticket-fields', { fields })).data);
