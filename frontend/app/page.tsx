'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

type Sender = 'user' | 'assistant' | 'system';

type ChatMessage = {
  id: string;
  sender: Sender;
  text: string;
  timestamp: string;
  status?: 'delivered' | 'read';
  reactions?: string[];
};

const initialMessages: ChatMessage[] = [];

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function createLocalReply(prompt: string) {
  return `You said: ${prompt}\n\nThis frontend is ready for the FastAPI bridge, persistent session manager, and SQLite history.`;
}

async function sendToBackend(prompt: string): Promise<{ queued: boolean; mockReply?: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const token = process.env.NEXT_PUBLIC_API_TOKEN;

  if (!token) {
    return { queued: false, mockReply: createLocalReply(prompt) };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: prompt }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const data = (await response.json()) as { status?: string };
  return { queued: data.status === 'queued' };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeUserToPush(registration: ServiceWorkerRegistration) {
  try {
    const vapidPublicKey = 'BHrtnJdnc5HhiMp7r1k-MtUZ1y9OSD52Jm-i18MSvESB_SyEG_pyFBNqiR85kfgm4mKzGghGy27nH2i-9NzmeF4';
    const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subscription }),
    });
    if (response.ok) {
      console.log('Successfully subscribed to Web Push');
    } else {
      console.error('Failed to save subscription on backend');
    }
  } catch (err) {
    console.error('Failed to subscribe user to Push notifications:', err);
  }
}


export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [statusText, setStatusText] = useState('Active now');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/history`);
      if (response.ok) {
        const data = await response.json() as { messages: any[] };
        if (data.messages) {
          const formatted = data.messages.map((m: any) => ({
            id: String(m.id),
            sender: m.sender,
            text: m.text,
            timestamp: m.timestamp ? new Intl.DateTimeFormat('en', {
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date(m.timestamp)) : 'Now',
            status: m.sender === 'user' ? ('read' as const) : undefined,
            reactions: m.reaction ? [m.reaction] : [],
          }));
          setMessages(formatted);
        }
      }
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  }

  async function handleClearChat() {
    const confirmClear = window.confirm("Are you sure you want to clear all chat history? This will restart the session.");
    if (!confirmClear) return;

    setIsClearing(true);
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    const token = process.env.NEXT_PUBLIC_API_TOKEN;
    if (!token) {
      setIsClearing(false);
      return;
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/history`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setMessages([]);
      } else {
        alert("Failed to clear chat on backend.");
      }
    } catch (err) {
      console.error('Clear chat failed:', err);
      alert("Error connecting to backend.");
    } finally {
      setIsClearing(false);
    }
  }


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  useEffect(() => {
    const statuses = [
      'Active now',
      'Online',
      'Last active 2m ago',
      'Last active 5m ago',
      'Last active 12m ago',
      'Last active 18m ago',
      'Last active 35m ago',
    ];
    setStatusText(statuses[Math.floor(Math.random() * statuses.length)]);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered:', reg);
          if (Notification.permission === 'granted') {
            subscribeUserToPush(reg);
          }
        })
        .catch((err) => console.error('Service Worker registration failed:', err));
    }

    async function loadHistory() {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const token = process.env.NEXT_PUBLIC_API_TOKEN;
      if (!token) return;
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/history`);
        if (response.ok) {
          const data = await response.json() as { messages: any[] };
          if (data.messages && data.messages.length > 0) {
            const formatted = data.messages.map((m: any) => ({
              id: String(m.id),
              sender: m.sender,
              text: m.text,
              timestamp: m.timestamp ? new Intl.DateTimeFormat('en', {
                hour: 'numeric',
                minute: '2-digit',
              }).format(new Date(m.timestamp)) : 'Now',
              status: m.sender === 'user' ? ('read' as const) : undefined,
              reactions: m.reaction ? [m.reaction] : [],
            }));
            setMessages(formatted);
          }
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    }
    loadHistory();
  }, []);

  const canSend = input.trim().length > 0 && !isTyping;

  const subtitle = useMemo(() => {
    const token = process.env.NEXT_PUBLIC_API_TOKEN;
    if (isTyping) return 'Claude is typing';
    if (!token) return 'Local mock mode (env not set)';
    return 'One persistent conversation';
  }, [isTyping]);

  function appendMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  function startPollingReply(currentLength: number) {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    let cycles = 0;
    const pollInterval = window.setInterval(async () => {
      cycles++;
      if (cycles > 90) { // 3 minutes timeout limit
        window.clearInterval(pollInterval);
        setIsTyping(false);
        appendMessage({
          id: createId(),
          sender: 'assistant',
          text: '⚠️ Response generation timed out (exceeded 3 minutes). Please try refreshing.',
          timestamp: formatTime(new Date()),
        });
        return;
      }

      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/history`);
        if (response.ok) {
          const data = await response.json() as { messages: any[] };
          if (data.messages && data.messages.length >= currentLength + 2) {
            window.clearInterval(pollInterval);

            // 1. Show the typing bubble now that response is generated
            setIsTyping(true);

            // 2. Delay the appearance of the message by 2.5 seconds to simulate typing
            window.setTimeout(() => {
              const formatted = data.messages.map((m: any) => ({
                id: String(m.id),
                sender: m.sender,
                text: m.text,
                timestamp: m.timestamp ? new Intl.DateTimeFormat('en', {
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(m.timestamp)) : 'Now',
                status: m.sender === 'user' ? ('read' as const) : undefined,
                reactions: m.reaction ? [m.reaction] : [],
              }));
              setMessages(formatted);
              setIsTyping(false);
            }, 2500);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isTyping) {
      return;
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((reg) => {
            subscribeUserToPush(reg);
          });
        }
      }).catch((err) => console.error('Notification permission blocked:', err));
    }

    const currentLength = messages.length;

    const userMessage: ChatMessage = {
      id: createId(),
      sender: 'user',
      text: trimmed,
      timestamp: formatTime(new Date()),
      status: 'delivered',
    };

    setInput('');
    appendMessage(userMessage);

    // Transition status from delivered to read after a random delay (between 1.5 and 5 seconds)
    const readDelay = Math.floor(Math.random() * 3500) + 1500;
    window.setTimeout(() => {
      // 1. Mark as Read
      setMessages((current) =>
        current.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'read' as const } : msg
        )
      );

      // 2. Call backend API for reply (queued asynchronously)
      (async () => {
        try {
          const res = await sendToBackend(trimmed);
          if (res.queued) {
            startPollingReply(currentLength);
          } else if (res.mockReply) {
            setIsTyping(true);
            window.setTimeout(() => {
              appendMessage({
                id: createId(),
                sender: 'assistant',
                text: res.mockReply!,
                timestamp: formatTime(new Date()),
              });
              setIsTyping(false);
            }, 2500);
          }
        } catch (error: any) {
          console.error('Chat error:', error);
          appendMessage({
            id: createId(),
            sender: 'assistant',
            text: `⚠️ Connection Error: ${error?.message || 'Failed to fetch reply from backend'}`,
            timestamp: formatTime(new Date()),
          });
          setIsTyping(false);
        }
      })();
    }, readDelay);
  }

  return (
    <main className="h-[100dvh] w-full flex flex-col overflow-hidden bg-[var(--background)]">
      <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden border-x border-[var(--border)] bg-[var(--card)] shadow-soft">
        <header className="flex-none border-b border-[var(--border)] px-4 py-3" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(20px)', paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
          <div className="relative flex items-center justify-between">
            <button
              onClick={handleClearChat}
              disabled={isClearing}
              className="flex h-10 w-10 items-center justify-center rounded-full text-red-500 hover:bg-red-50 active:bg-red-100 transition disabled:opacity-40"
              title="Clear Chat History"
            >
              {isClearing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              )}
            </button>

            <div className="flex flex-col items-center">
              <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)] leading-tight">Ex-Skill</h1>
              <span className="text-[11px] text-gray-500 font-normal">
                {isTyping ? 'typing...' : statusText}
              </span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--accent)] hover:bg-blue-50 active:bg-blue-100 transition disabled:opacity-40"
              title="Refresh Chat History"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </header>

        <section className="flex-1 space-y-3 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {messages.map((message) => {
            const isUser = message.sender === 'user';
            return (
              <article key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div
                    className="rounded-[1.5rem] px-4 py-3 text-[15px] leading-6 shadow-sm"
                    style={{
                      background: isUser ? 'var(--user-bubble)' : 'var(--assistant-bubble)',
                      color: isUser ? '#ffffff' : 'var(--foreground)',
                    }}
                  >
                    <div className="break-words">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          code: ({ className, children, ...props } : any) => {
                            const match = /language-(\w+)/.exec(className || '');
                            return match ? (
                              <pre className="my-2 overflow-x-auto rounded bg-black/10 p-2 text-xs font-mono">
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              </pre>
                            ) : (
                              <code className="rounded bg-black/10 px-1 py-0.5 text-xs font-mono" {...props}>
                                {children}
                              </code>
                            );
                          },
                          ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
                          li: ({ children }) => <li className="mb-0.5">{children}</li>,
                          h1: ({ children }) => <h1 className="mb-2 text-lg font-bold">{children}</h1>,
                          h2: ({ children }) => <h2 className="mb-2 text-base font-bold">{children}</h2>,
                          h3: ({ children }) => <h3 className="mb-1 text-sm font-bold">{children}</h3>,
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-1 text-[11px] ${isUser ? 'justify-end' : 'justify-start'}`} style={{ color: 'var(--foreground-secondary)' }}>
                    <span>{message.timestamp}</span>
                    {isUser && message.status ? <span className="capitalize">{message.status}</span> : null}
                    {message.reactions?.length ? <span>{message.reactions.join(' ')}</span> : null}
                  </div>
                </div>
              </article>
            );
          })}

          {isTyping ? (
            <article className="flex justify-start">
              <div className="rounded-[1.5rem] px-4 py-3 text-[15px] leading-6 shadow-sm" style={{ background: 'var(--assistant-bubble)', color: 'var(--foreground)' }}>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'rgba(0, 0, 0, 0.25)' }} />
                  <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'rgba(0, 0, 0, 0.25)', animationDelay: '120ms' }} />
                  <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'rgba(0, 0, 0, 0.25)', animationDelay: '240ms' }} />
                </span>
              </div>
            </article>
          ) : null}
          <div ref={bottomRef} />
        </section>

        <footer className="flex-none border-t border-[var(--border)] px-3 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <label className="sr-only" htmlFor="message">
              Message
            </label>
            <textarea
              id="message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="iMessage"
              rows={1}
              className="max-h-32 flex-1 resize-none rounded-[1.35rem] border border-[var(--border)] px-4 py-3 text-[16px] outline-none placeholder:text-[var(--foreground-secondary)]"
              style={{ background: 'var(--background)' }}
            />
            <button
              type="submit"
              disabled={!canSend}
              className="h-12 rounded-full px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              Send
            </button>
          </form>
        </footer>
      </div>
    </main>
  );
}
