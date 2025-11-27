import React, { createContext, useReducer, ReactNode, useEffect } from 'react';
import { AppState, Action } from '../types';
import { INITIAL_STATE } from '../constants';
// FIX: Removed v9 'onAuthStateChanged' import for v8 compatibility.
import { auth } from '../services/firebase';

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> }>({
  state: INITIAL_STATE,
  dispatch: () => null,
});

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_USER':
      return { 
        ...state, 
        user: action.payload, 
        isAuthenticated: !!action.payload,
        isLoading: false 
      };
    default:
      return state;
  }
};

const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);

  useEffect(() => {
    // FIX: Used v8 auth.onAuthStateChanged method.
    const unsubscribe = auth.onAuthStateChanged(user => {
      dispatch({ type: 'SET_USER', payload: user });
    });
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export { AppContext, AppProvider };