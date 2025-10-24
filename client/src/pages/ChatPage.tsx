import React from 'react';
import ChatDesktopView from '../features/chat/components/ChatDesktopView';
import { useChatController } from '../features/chat/hooks/useChatController';

const ChatPage: React.FC = () => {
  const controller = useChatController();

  return <ChatDesktopView controller={controller} />;
};

export default ChatPage;
