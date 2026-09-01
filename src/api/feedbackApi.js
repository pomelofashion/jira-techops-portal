// src/api/feedbackApi.js
// Platform feedback (the floating bubble) against server/routes/feedback.js.
// Every function returns { data, error }.

import { api, wrap } from './client.js';

// payload: { title, body, page, pageLabel }
export const submitFeedback = payload =>
  wrap(async () => (await api.post('/api/feedback', payload)).data);

// → { feedback: [...] } (requires feedback.view)
export const listFeedback = () => wrap(async () => (await api.get('/api/feedback')).data);

export const setFeedbackStatus = (id, status) =>
  wrap(async () => (await api.patch(`/api/feedback/${id}`, { status })).data);

export const deleteFeedback = id =>
  wrap(async () => (await api.delete(`/api/feedback/${id}`)).data);
