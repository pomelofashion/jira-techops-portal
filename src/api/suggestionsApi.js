// src/api/suggestionsApi.js
// Suggestions board persistence (server/routes/suggestions.js). Used by the
// suggestionsStore's background sync — components talk to the store, not to
// this module. Every function returns { data, error }.

import { api, wrap } from './client.js';

export const listSuggestions = () => wrap(async () => (await api.get('/api/suggestions')).data);

export const createSuggestionApi = payload =>
  wrap(async () => (await api.post('/api/suggestions', payload)).data);

export const voteSuggestionApi = (id, dir) =>
  wrap(async () => (await api.post(`/api/suggestions/${id}/vote`, { dir })).data);

export const setSuggestionStatusApi = (id, status) =>
  wrap(async () => (await api.patch(`/api/suggestions/${id}/status`, { status })).data);

export const deleteSuggestionApi = id =>
  wrap(async () => (await api.delete(`/api/suggestions/${id}`)).data);

export const addSuggestionCommentApi = (id, comment) =>
  wrap(async () => (await api.post(`/api/suggestions/${id}/comments`, comment)).data);

export const deleteSuggestionCommentApi = (id, commentId) =>
  wrap(async () => (await api.delete(`/api/suggestions/${id}/comments/${commentId}`)).data);
