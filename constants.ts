import { AppState } from './types';

export const INITIAL_STATE: AppState = {
  isLoading: true,
  isAuthenticated: false,
  user: null,
};