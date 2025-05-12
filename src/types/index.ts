// User-related types
export interface User {
  id: string;
  username: string;
  email: string;
}

// Authentication-related types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Session-related types
export interface Session {
  id: string;
  createdBy: string;
  participants: string[];
  createdAt: Date;
}

// Media-related types
export interface MediaState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
}

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// WebRTC connection status
export interface CallState {
  sessionId: string | null;
  session?: {
    id: string;
    name: string;
    description: string;
  };
  connectionState: ConnectionState;
  error: string | null;
  participants: User[];
}