'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AgentPanel from '@/components/AgentPanel';
import ChatMessage from '@/components/ChatMessage';
import { AgentConfig, ConversationMessage } from '@/types';

export default function Home() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [topic, setTopic] = useState('');
  const [userInput, setUserInput] = useState('');
  const [maxTurns, setMaxTurns] = useState(8);
  const [currentTurn, setCurrentTurn] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingUserMsg = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(setAgents).catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleAgent = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const getAgentColor = (agentId: string) =>
    agents.find(a => a.id === agentId)?.color ?? 'gray';

  const streamTurn = async (
    agentId: string,
    history: ConversationMessage[],
    signal: AbortSignal
  ): Promise<string> => {
    const agent = agents.find(a => a.id === agentId)!;
    const msgId = crypto.randomUUID();

    setMessages(prev => [
      ...prev,
      {
        id: msgId,
        agentId,
        agentName: agent.name,
        model: agent.model,
        content: '',
        timestamp: new Date().toISOString(),
      },
    ]);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, history }),
      signal,
    });

    if (!res.ok || !res.body) throw new Error('Chat request failed');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, content: full } : m))
      );
    }

    return full;
  };

  const startConversation = async () => {
    if (selectedIds.length === 0) return;

    setIsRunning(true);
    setCurrentTurn(0);
    pendingUserMsg.current = null;

    const controller = new AbortController();
    abortRef.current = controller;

    let history: ConversationMessage[] = [];

    if (topic.trim()) {
      const topicMsg: ConversationMessage = {
        id: 'topic',
        agentId: 'user',
        agentName: 'Topic',
        model: 'user',
        content: topic.trim(),
        timestamp: new Date().toISOString(),
      };
      history = [topicMsg];
      setMessages([topicMsg]);
    } else {
      setMessages([]);
    }

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        if (controller.signal.aborted) break;

        // Inject any pending user message before this agent turn
        if (pendingUserMsg.current) {
          const injection: ConversationMessage = {
            id: crypto.randomUUID(),
            agentId: 'user',
            agentName: 'You',
            model: 'user',
            content: pendingUserMsg.current,
            timestamp: new Date().toISOString(),
          };
          pendingUserMsg.current = null;
          history = [...history, injection];
          setMessages(prev => [...prev, injection]);
        }

        const agentId = selectedIds[turn % selectedIds.length];
        setCurrentTurn(turn + 1);

        const content = await streamTurn(agentId, history, controller.signal);

        const agent = agents.find(a => a.id === agentId)!;
        history = [
          ...history,
          {
            id: crypto.randomUUID(),
            agentId,
            agentName: agent.name,
            model: agent.model,
            content,
            timestamp: new Date().toISOString(),
          },
        ];
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const stopConversation = () => abortRef.current?.abort();

  const clearConversation = () => {
    setMessages([]);
    setCurrentTurn(0);
  };

  const submitUserMessage = () => {
    const msg = userInput.trim();
    if (!msg) return;
    setUserInput('');

    if (isRunning) {
      // Queue for injection at the next turn boundary
      pendingUserMsg.current = msg;
    } else {
      // Append directly to the conversation
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          agentId: 'user',
          agentName: 'You',
          model: 'user',
          content: msg,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const turnOrder =
    selectedIds.length > 1
      ? selectedIds.map(id => agents.find(a => a.id === id)?.name ?? id).join(' → ')
      : null;

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <AgentPanel agents={agents} selectedIds={selectedIds} onToggle={toggleAgent} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b px-6 py-3 flex items-center justify-between bg-white shrink-0">
          <div>
            <h1 className="font-bold text-gray-900 text-lg">Multi-Agent Chatbox</h1>
            <p className="text-xs text-gray-500">
              {selectedIds.length === 0
                ? 'Select agents to begin'
                : `${selectedIds.length} agent${selectedIds.length !== 1 ? 's' : ''} selected`}
              {isRunning && ` · Turn ${currentTurn} / ${maxTurns}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500" htmlFor="max-turns">
              Max turns
            </label>
            <input
              id="max-turns"
              type="number"
              min={1}
              max={50}
              value={maxTurns}
              onChange={e => setMaxTurns(Number(e.target.value))}
              disabled={isRunning}
              className="w-14 text-sm border rounded px-2 py-1 text-center disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="max-w-sm">
                <div className="text-5xl mb-4">💬</div>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Select agents from the sidebar, set an optional topic, then click{' '}
                  <strong className="text-gray-600">Start</strong>.
                  <br />
                  You can inject messages mid-conversation using the{' '}
                  <strong className="text-gray-600">Send</strong> button below.
                </p>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <ChatMessage
                key={msg.id}
                message={msg}
                color={getAgentColor(msg.agentId)}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        <div className="border-t px-6 py-4 bg-gray-50 shrink-0 space-y-2">
          {/* Start / stop row with topic */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Opening topic or prompt (optional)…"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              disabled={isRunning}
              onKeyDown={e => e.key === 'Enter' && !isRunning && startConversation()}
              className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400"
            />
            {!isRunning ? (
              <button
                onClick={startConversation}
                disabled={selectedIds.length === 0}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Start
              </button>
            ) : (
              <button
                onClick={stopConversation}
                className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Stop
              </button>
            )}
            {messages.length > 0 && !isRunning && (
              <button
                onClick={clearConversation}
                className="px-4 py-2 border text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* User injection row */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={
                isRunning
                  ? 'Inject a message — delivered at the next turn boundary…'
                  : 'Add your own message to the conversation…'
              }
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitUserMessage()}
              className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              onClick={submitUserMessage}
              disabled={!userInput.trim()}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>

          {turnOrder && (
            <p className="text-xs text-gray-400">
              Turn order: {turnOrder} → repeat
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
