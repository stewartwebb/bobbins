export interface User {
  id: number;
  username: string;
  email: string;
  avatar?: string;
  email_verified_at?: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  owner_id: number;
  owner?: Partial<User> | null;
  current_member_role?: 'owner' | 'member';
  channels?: Channel[];
  members?: User[];
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: number;
  name: string;
  description?: string;
  type: 'text' | 'audio';
  server_id: number;
  server?: Server;
  messages?: Message[];
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  content: string;
  user_id: number;
  user?: Partial<User> | null;
  channel_id: number;
  channel?: Channel;
  type: 'text' | 'image' | 'file';
  edited_at?: string;
  created_at: string;
  updated_at: string;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  id: number;
  object_key: string;
  url: string;
  file_name: string;
  content_type: string;
  file_size: number;
  width?: number;
  height?: number;
  preview_url?: string;
  preview_object_key?: string;
  preview_width?: number;
  preview_height?: number;
  created_at: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  data: {
    token: string;
    expires_at: string;
    user: User;
  };
}

export interface RegisterResponse {
  message: string;
  data: {
    user: User;
  };
}

export interface VerifyEmailResponse {
  message: string;
  data: {
    user: User;
  };
}

export interface CreateServerRequest {
  name: string;
  description?: string;
  icon?: string;
}

export interface ServerInvite {
  id: number;
  code: string;
  server_id: number;
  inviter_id: number;
  max_uses: number;
  uses: number;
  expires_at?: string;
  invite_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateServerResponse {
  message: string;
  data: {
    server: Server;
    default_invite?: ServerInvite;
  };
}

export interface CreateInviteResponse {
  message: string;
  data: {
    invite: ServerInvite;
  };
}

export interface InviteLookupResponse {
  data: {
    invite: ServerInvite;
    server: Server;
  };
}

export interface AcceptInviteResponse {
  message: string;
  data: {
    invite: ServerInvite;
    server: Server;
  };
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
  type: 'text' | 'audio';
  server_id: number;
  position?: number;
}

export interface CreateChannelResponse {
  message: string;
  data: {
    channel: Channel;
  };
}

export interface CreateMessageRequest {
  content: string;
  type?: 'text' | 'file';
  attachments?: MessageAttachmentInput[];
}

export interface MessageAttachmentInput {
  object_key: string;
  url: string;
  file_name: string;
  content_type: string;
  file_size: number;
}

export interface CreateAttachmentUploadRequest {
  file_name: string;
  content_type: string;
  file_size: number;
}

export interface CreateAttachmentUploadResponse {
  upload_url: string;
  method: string;
  headers: Record<string, string>;
  object_key: string;
  file_url: string;
  expires_at: string;
}

export interface CreateMessageResponse {
  message: string;
  data: {
    message: Message;
  };
}

export interface GetMessagesParams {
  limit?: number;
  before?: string;
}

export interface GetMessagesResponse {
  messages: Message[];
  has_more: boolean;
  next_cursor?: string;
}

export interface WebSocketMessage {
  type: string;
  data: unknown;
  user_id?: string;
  channel_id?: string;
  timestamp: string;
}

export interface WebRTCMediaState {
  mic: string;
  camera: string;
  screen: string;
}

export interface WebRTCParticipant {
  user_id: number;
  display_name: string;
  role?: string;
  session_id?: string;
  channel_id?: number;
  media_state?: WebRTCMediaState;
  last_seen?: string;
  username?: string;
  avatar?: string;
}

export interface ChannelParticipantsMap {
  [channelId: string]: WebRTCParticipant[];
}

export interface JoinWebRTCResponse {
  session_token: string;
  expires_at: string;
  channel: {
    id: number;
    name: string;
    type: string;
  };
  participant: WebRTCParticipant;
  participants: WebRTCParticipant[];
  iceservers: unknown;
  sfu: unknown;
}
