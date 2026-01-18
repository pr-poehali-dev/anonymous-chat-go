import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import Icon from '@/components/ui/icon';

const API_CHATS = 'https://functions.poehali.dev/f0e36f84-8530-4379-bdaa-3ca508a964d3';
const API_MESSAGES = 'https://functions.poehali.dev/7bb6449d-2a34-4d2f-aae3-df9fd11ba4b2';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'other';
  timestamp: string;
  encrypted: boolean;
}

interface Chat {
  id: number;
  chat_code?: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  avatar: string;
  online: boolean;
}

interface User {
  id: number;
  anonymous_id: string;
  display_name: string;
  avatar_code: string;
}

const Index = () => {
  const [activeSection, setActiveSection] = useState<'chats' | 'history' | 'settings' | 'profile' | 'notifications'>('chats');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatCode, setNewChatCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    initUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadChats();
      const interval = setInterval(loadChats, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedChat && currentUser) {
      loadMessages(selectedChat.id);
      const interval = setInterval(() => loadMessages(selectedChat.id), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedChat, currentUser]);

  const initUser = async () => {
    const user = localStorage.getItem('chat_user');
    if (user) {
      setCurrentUser(JSON.parse(user));
      return;
    }

    try {
      const response = await fetch(API_CHATS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_user' })
      });
      const data = await response.json();
      setCurrentUser(data);
      localStorage.setItem('chat_user', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to create user:', error);
      toast({ title: 'Ошибка', description: 'Не удалось создать пользователя', variant: 'destructive' });
    }
  };

  const loadChats = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${API_CHATS}?user_id=${currentUser.id}`);
      const data = await response.json();
      setChats(data);
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  };

  const loadMessages = async (chatId: number) => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${API_MESSAGES}?chat_id=${chatId}&user_id=${currentUser.id}`);
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || !currentUser) return;
    
    try {
      const response = await fetch(API_MESSAGES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: selectedChat.id,
          user_id: currentUser.id,
          content: newMessage
        })
      });
      
      if (response.ok) {
        setNewMessage('');
        loadMessages(selectedChat.id);
        loadChats();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({ title: 'Ошибка', description: 'Не удалось отправить сообщение', variant: 'destructive' });
    }
  };

  const handleCreateChat = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    
    try {
      const response = await fetch(API_CHATS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_chat',
          user_id: currentUser.id
        })
      });
      
      const data = await response.json();
      setNewChatCode(data.chat_code);
      toast({ 
        title: 'Чат создан!', 
        description: `Код для приглашения: ${data.chat_code}. Отправьте его собеседнику.` 
      });
      loadChats();
    } catch (error) {
      console.error('Failed to create chat:', error);
      toast({ title: 'Ошибка', description: 'Не удалось создать чат', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinChat = async () => {
    if (!currentUser || !newChatCode.trim()) return;
    setIsLoading(true);
    
    try {
      const response = await fetch(API_CHATS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join_chat',
          user_id: currentUser.id,
          chat_code: newChatCode.trim()
        })
      });
      
      if (response.ok) {
        toast({ title: 'Успешно!', description: 'Вы присоединились к чату' });
        setShowNewChatDialog(false);
        setNewChatCode('');
        loadChats();
      } else {
        toast({ title: 'Ошибка', description: 'Чат не найден', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Failed to join chat:', error);
      toast({ title: 'Ошибка', description: 'Не удалось присоединиться к чату', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen flex bg-background dark">
      <div className={`${sidebarOpen ? 'w-80' : 'w-20'} bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col`}>
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Icon name="Lock" size={20} className="text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-sidebar-foreground">SecureChat</h1>
                <p className="text-xs text-muted-foreground">
                  {currentUser ? currentUser.display_name : 'Загрузка...'}
                </p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-sidebar-foreground"
          >
            <Icon name={sidebarOpen ? 'PanelLeftClose' : 'PanelLeftOpen'} size={20} />
          </Button>
        </div>

        {sidebarOpen && (
          <div className="flex flex-col gap-1 p-2">
            {[
              { key: 'chats', icon: 'MessageSquare', label: 'Чаты' },
              { key: 'history', icon: 'Clock', label: 'История' },
              { key: 'settings', icon: 'Settings', label: 'Настройки' },
              { key: 'profile', icon: 'User', label: 'Профиль' },
              { key: 'notifications', icon: 'Bell', label: 'Уведомления' },
            ].map((section) => (
              <Button
                key={section.key}
                variant={activeSection === section.key ? 'secondary' : 'ghost'}
                className="justify-start text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => setActiveSection(section.key as any)}
              >
                <Icon name={section.icon} size={18} className="mr-3" />
                {section.label}
              </Button>
            ))}
          </div>
        )}

        {!sidebarOpen && (
          <div className="flex flex-col gap-2 p-2 items-center">
            {[
              { key: 'chats', icon: 'MessageSquare' },
              { key: 'history', icon: 'Clock' },
              { key: 'settings', icon: 'Settings' },
              { key: 'profile', icon: 'User' },
              { key: 'notifications', icon: 'Bell' },
            ].map((section) => (
              <Button
                key={section.key}
                variant={activeSection === section.key ? 'secondary' : 'ghost'}
                size="icon"
                className="text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => setActiveSection(section.key as any)}
              >
                <Icon name={section.icon} size={18} />
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="w-96 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-card-foreground">Чаты</h2>
            <Button 
              size="icon" 
              variant="ghost" 
              className="text-muted-foreground hover:text-primary"
              onClick={() => setShowNewChatDialog(true)}
            >
              <Icon name="Plus" size={20} />
            </Button>
          </div>
          <div className="relative">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск чатов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-input"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredChats.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Icon name="MessageSquare" size={40} className="mx-auto mb-2 opacity-50" />
                <p>Нет активных чатов</p>
                <p className="text-sm">Создайте новый чат</p>
              </div>
            )}
            {filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-3 rounded-lg cursor-pointer transition-colors mb-1 ${
                  selectedChat?.id === chat.id
                    ? 'bg-secondary'
                    : 'hover:bg-secondary/50'
                }`}
              >
                <div className="flex gap-3">
                  <div className="relative">
                    <Avatar>
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {chat.avatar}
                      </AvatarFallback>
                    </Avatar>
                    {chat.online && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-card-foreground text-sm truncate">
                        {chat.name}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {formatTime(chat.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground truncate">
                        {chat.lastMessage}
                      </p>
                      {chat.unread > 0 && (
                        <Badge className="ml-2 bg-primary text-primary-foreground px-2 py-0.5 text-xs">
                          {chat.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            <div className="p-4 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {selectedChat.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-card-foreground">{selectedChat.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Icon name="Lock" size={12} />
                      <span>Сквозное шифрование активно</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <Icon name="Phone" size={18} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <Icon name="Video" size={18} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <Icon name="MoreVertical" size={18} />
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="bg-secondary/50 px-3 py-1 rounded-full text-xs text-muted-foreground flex items-center gap-1">
                    <Icon name="Shield" size={12} />
                    <span>Сообщения защищены сквозным шифрованием</span>
                  </div>
                </div>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-2xl ${
                        message.sender === 'me'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                      <div className="flex items-center gap-1 mt-1 justify-end">
                        <span className="text-xs opacity-70">
                          {formatTime(message.timestamp)}
                        </span>
                        {message.encrypted && (
                          <Icon name="Lock" size={10} className="opacity-70" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border bg-card">
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <Icon name="Paperclip" size={20} />
                </Button>
                <Input
                  placeholder="Введите сообщение..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 bg-background border-input"
                />
                <Button onClick={handleSendMessage} className="bg-primary text-primary-foreground">
                  <Icon name="Send" size={20} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Icon name="MessageSquare" size={40} className="text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Выберите чат</h3>
              <p className="text-muted-foreground">Начните анонимное общение с полным шифрованием</p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent className="bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Создать или присоединиться к чату</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Создайте новый чат и получите код для приглашения или введите код существующего чата
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Button 
              onClick={handleCreateChat} 
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground"
            >
              <Icon name="Plus" size={18} className="mr-2" />
              Создать новый чат
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">или</span>
              </div>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Введите код чата"
                value={newChatCode}
                onChange={(e) => setNewChatCode(e.target.value)}
                className="bg-background border-input"
              />
              <Button 
                onClick={handleJoinChat} 
                disabled={isLoading || !newChatCode.trim()}
                variant="outline"
                className="w-full"
              >
                <Icon name="LogIn" size={18} className="mr-2" />
                Присоединиться к чату
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
