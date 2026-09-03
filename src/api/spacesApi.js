// src/api/spacesApi.js
// Spaces + boards + membership service layer. Mirrors the requestTypesApi
// pattern: every call returns { data, error } via wrap(). Spaces contain
// boards; membership is granted per space (all its boards) or per board
// (account-level grant). Server routes live in server/routes/spaces.js.

import { api, wrap } from './client.js';

export const listSpaces = (params = {}) =>
  wrap(async () => (await api.get('/api/spaces', { params })).data);

export const createSpace = payload =>
  wrap(async () => (await api.post('/api/spaces', payload)).data);

export const updateSpace = (id, updates) =>
  wrap(async () => (await api.patch(`/api/spaces/${id}`, updates)).data);

export const createBoard = (spaceId, payload) =>
  wrap(async () => (await api.post(`/api/spaces/${spaceId}/boards`, payload)).data);

export const updateBoard = (spaceId, boardId, updates) =>
  wrap(async () => (await api.patch(`/api/spaces/${spaceId}/boards/${boardId}`, updates)).data);

export const listSpaceMembers = spaceId =>
  wrap(async () => (await api.get(`/api/spaces/${spaceId}/members`)).data);

export const setSpaceMember = (spaceId, userId, role) =>
  wrap(async () => (await api.put(`/api/spaces/${spaceId}/members/${userId}`, { role })).data);

export const removeSpaceMember = (spaceId, userId) =>
  wrap(async () => (await api.delete(`/api/spaces/${spaceId}/members/${userId}`)).data);

export const listBoardMembers = (spaceId, boardId) =>
  wrap(async () => (await api.get(`/api/spaces/${spaceId}/boards/${boardId}/members`)).data);

export const setBoardMember = (spaceId, boardId, userId, role) =>
  wrap(
    async () =>
      (await api.put(`/api/spaces/${spaceId}/boards/${boardId}/members/${userId}`, { role })).data
  );

export const removeBoardMember = (spaceId, boardId, userId) =>
  wrap(
    async () =>
      (await api.delete(`/api/spaces/${spaceId}/boards/${boardId}/members/${userId}`)).data
  );

// Superadmin only. Space must contain no boards.
export const deleteSpace = spaceId =>
  wrap(async () => (await api.delete(`/api/spaces/${spaceId}`)).data);

// Superadmin only. The board's tickets move to the default board (PESD1).
export const deleteBoard = (spaceId, boardId) =>
  wrap(async () => (await api.delete(`/api/spaces/${spaceId}/boards/${boardId}`)).data);
