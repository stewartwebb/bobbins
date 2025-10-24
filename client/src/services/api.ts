import axios, { InternalAxiosRequestConfig } from 'axios';
import {
  LoginRequest,
  RegisterRequest,
  User,
  Server,
  Channel,
  AuthResponse,
  RegisterResponse,
  VerifyEmailResponse,
  CreateServerRequest,
  CreateServerResponse,
  CreateInviteResponse,
  InviteLookupResponse,
  AcceptInviteResponse,
  CreateChannelRequest,
  CreateChannelResponse,
  CreateMessageRequest,
  CreateMessageResponse,
  CreateAttachmentUploadRequest,
  CreateAttachmentUploadResponse,
  GetMessagesParams,
  GetMessagesResponse,
  JoinWebRTCResponse,
} from '../types/index';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token to requests if available
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  register: async (userData: RegisterRequest): Promise<RegisterResponse> => {
    const response = await api.post<RegisterResponse>('/auth/register', userData);
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  verifyEmail: async (token: string): Promise<VerifyEmailResponse> => {
    const response = await api.get<VerifyEmailResponse>('/auth/verify-email', {
      params: { token },
    });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<{ data: { user: User } }>('/users/me');
    return response.data.data.user;
  },
};

// Servers API
export const serversAPI = {
  getServers: async (): Promise<{ servers: Server[] }> => {
    const response = await api.get<{ data: { servers: Server[] } }>('/servers');
    return response.data.data;
  },

  createServer: async (payload: CreateServerRequest): Promise<CreateServerResponse> => {
    const response = await api.post<CreateServerResponse>('/servers', payload);
    return response.data;
  },

  getServer: async (serverId: number): Promise<Server> => {
    const response = await api.get(`/servers/${serverId}`);
    return response.data;
  },
};

export const invitesAPI = {
  getInvite: async (code: string): Promise<InviteLookupResponse> => {
    const response = await api.get<InviteLookupResponse>(`/invites/${code}`);
    return response.data;
  },
  createInvite: async (
    serverId: number,
    payload: { expires_in_hours?: number; max_uses?: number; emails?: string[]; message?: string }
  ): Promise<CreateInviteResponse> => {
    const response = await api.post<CreateInviteResponse>(`/servers/${serverId}/invites`, payload);
    return response.data;
  },
  acceptInvite: async (code: string): Promise<AcceptInviteResponse> => {
    const response = await api.post<AcceptInviteResponse>(`/invites/${code}/accept`);
    return response.data;
  },
};

// Channels API
export const channelsAPI = {
  getChannels: async (serverId: number): Promise<Channel[]> => {
    const response = await api.get<{ data: { channels: Channel[] } }>(`/servers/${serverId}/channels`);
    return response.data.data.channels;
  },

  createChannel: async (payload: CreateChannelRequest): Promise<CreateChannelResponse> => {
    const response = await api.post<CreateChannelResponse>('/channels', payload);
    return response.data;
  },

  getMessages: async (channelId: number, params?: GetMessagesParams): Promise<GetMessagesResponse> => {
    const response = await api.get<{ data: GetMessagesResponse }>(`/channels/${channelId}/messages`, {
      params,
    });
    return response.data.data;
  },

  createMessage: async (channelId: number, payload: CreateMessageRequest): Promise<CreateMessageResponse> => {
    const response = await api.post<CreateMessageResponse>(`/channels/${channelId}/messages`, payload);
    return response.data;
  },

  sendTypingIndicator: async (channelId: number, active = true): Promise<void> => {
    await api.post(`/channels/${channelId}/typing`, { active });
  },

  joinWebRTC: async (channelId: number): Promise<JoinWebRTCResponse> => {
    const response = await api.post<{ data: JoinWebRTCResponse }>(`/channels/${channelId}/webrtc/join`);
    return response.data.data;
  },

  leaveWebRTC: async (channelId: number, sessionToken: string): Promise<void> => {
    await api.post(`/channels/${channelId}/webrtc/leave`, { session_token: sessionToken });
  },
};

export const uploadsAPI = {
  createPresignedUpload: async (
    channelId: number,
    payload: CreateAttachmentUploadRequest
  ): Promise<CreateAttachmentUploadResponse> => {
    const response = await api.post<{ data: CreateAttachmentUploadResponse }>(
      `/channels/${channelId}/attachments/presign`,
      payload
    );
    return response.data.data;
  },

  uploadAttachmentMessage: async (
    channelId: number,
    file: File,
    content?: string
  ): Promise<CreateMessageResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (content && content.trim().length > 0) {
      formData.append('content', content);
    }

    const response = await api.post<CreateMessageResponse>(
      `/channels/${channelId}/messages/attachments`,
      formData
    );
    return response.data;
  },
};

export const buildWebSocketURL = (token: string): string => {
  const explicit = process.env.REACT_APP_WS_URL;
  try {
    if (explicit) {
      const parsed = new URL(explicit);
      parsed.searchParams.set('token', token);
      return parsed.toString();
    }

    const base = new URL(API_BASE_URL);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';

    let path = base.pathname;
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    if (path === '' || path === '/') {
      base.pathname = '/ws';
    } else if (path.endsWith('/api/v1')) {
      base.pathname = path.replace(/\/api\/v1$/, '/ws');
    } else {
      base.pathname = `${path}/ws`;
    }

    base.search = '';
    base.searchParams.set('token', token);

    return base.toString();
  } catch (error) {
    console.warn('Failed to build websocket URL, falling back to default.', error);
    return `ws://localhost:8080/ws?token=${encodeURIComponent(token)}`;
  }
};

export default api;