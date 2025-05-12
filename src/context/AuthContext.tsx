/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { AuthState } from '../types';
import axiosInstance from '../axios.config';

// Create a context for authentication
interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (name: string, email: string, password: string) => Promise<void>;
  checkToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initial auth state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

// Mock user data for demo purposes
// const MOCK_USERS: User[] = [
//   { id: '1', name: 'Test User', email: 'test@example.com' },
// ];

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState)

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const response = await axiosInstance.get('api/v1/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setState({
            user: response.data.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('authToken');
          setState({ ...initialState, isLoading: false });
        }
      } else {
        setState({ ...initialState, isLoading: false });
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    setState({ ...state, isLoading: true, error: null });

    try {
      // Make API call to login endpoint
      const response = await axiosInstance.post('api/v1/auth/login', { email, password });

      // Assuming the API responds with a token and user details
      const { token, user } = response.data;

      // Save token to localStorage or cookies (optional)
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify(user));


      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // Handle API errors
      const errorMessage =
        error.response?.status === 401
          ? 'Invalid email or password'
          : 'Failed to login. Please try again.';

      setState({
        ...state,
        isLoading: false,
        error: errorMessage,
      });
    }
  };


  // Mock registration function
  const register = async (name: string, email: string, password: string): Promise<void> => {
    setState({ ...state, isLoading: true, error: null });

    try {
      // Make API call to register endpoint
      const response = await axiosInstance.post('api/v1/auth/register', { name, email, password });

      // Assuming the API responds with a token and user details
      const { token, user } = response.data;

      // Save token to localStorage or cookies (optional)
      localStorage.setItem('authToken', token);

      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // Handle API errors
      const errorMessage =
        error.response?.status === 409
          ? 'Email already exists'
          : 'Failed to register. Please try again.';

      setState({
        ...state,
        isLoading: false,
        error: errorMessage,
      });
    }
  };

  // Logout function
  const logout = (): void => {
    setState(initialState);
    localStorage.removeItem('authToken'); // Clear token from localStorage
  };

  // Check for token on initial load
  const checkToken = async (token: string): Promise<void> => {
    setState({ ...state, isLoading: true, error: null });

    try {
      // Validate token and fetch user details
      const response = await axiosInstance.get('api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status !== 200) {
        throw new Error('Token validation failed');
      }else {
        const user = response.data.user;
        localStorage.setItem('user', JSON.stringify(user));
      }

      setState({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to validate token:', error);
      localStorage.removeItem('authToken'); // Clear invalid token
      setState({ ...initialState, isLoading: false });
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, register, checkToken }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};