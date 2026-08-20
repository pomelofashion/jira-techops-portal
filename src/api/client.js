// src/api/client.js
// Shared HTTP client for all API modules. In production, always talks to the
// real backend — mock/localStorage mode is dev-only.

import axios from 'axios';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
export const API_ENABLED = true;
export const USE_MOCK = false;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// The backend's error envelope is { error: string } (legacy shapes used
// message); fall through so real server messages reach the user instead of
// axios's generic "Request failed with status code N".
export const errorMessage = err => {
  const data = err?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  if (err?.message) return err.message;
  return 'An unexpected error occurred. Please try again.';
};

// Wraps an async operation into the { data, error } result shape every
// call-site consumes. error is a user-presentable string or null.
export const wrap = async fn => {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: errorMessage(err) };
  }
};

// Keeps mock mode honest about latency so loading states stay exercised.
export const simulateDelay = (ms = 400) => new Promise(r => setTimeout(r, ms));
