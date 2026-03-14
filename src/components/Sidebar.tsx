import React, { useState } from 'react';
import { X, Send, UserMinus, MicOff, ShieldCheck, Plus, ThumbsUp, CheckCircle2, Hand, VideoOff } from 'lucide-react';
import { Participant, ChatMessage, Poll, Question } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface SidebarProps {
  currentUserId: string;
  isOpen: boolean;
  type: 'chat' | 'participants' | 'polls' | 'qa';
  onClose: () => void;
  participants: Participant[];
  messages: ChatMessage[];
  polls: Poll[];
  questions: Question[];
  onSendMessage: (text: string) => void;
  onMuteParticipant: (id: string) => void;
  onMuteAll: () => void;
  onLowerAllHands: () => void;
  onRemoveParticipant: (id: string) => void;
  onCreatePoll: (question: string, options: string[]) => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onAskQuestion: (text: string) => void;
  onUpvoteQuestion: (id: string) => void;
  onApproveSpeaker: (id: string) => void;
  isHost: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUserId, isOpen, type, onClose, participants, messages, polls, questions,
  onSendMessage, onMuteParticipant, onMuteAll, onLowerAllHands, onRemoveParticipant,
  onCreatePoll, onVotePoll, onAskQuestion, onUpvoteQuestion, onApproveSpeaker, isHost
}) => {
  const [inputText, setInputText] = useState('');
  const [newPollQuestion, setNewPollQuestion] = useState('');
  const [newPollOptions, setNewPollOptions] = useState(['', '']);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);

  const handleSend = () => {
    if (inputText.trim()) {
      if (type === 'chat') onSendMessage(inputText);
      if (type === 'qa') onAskQuestion(inputText);
      setInputText('');
    }
  };

  const handleCreatePoll = () => {
    const filteredOptions = newPollOptions.filter(o => o.trim() !== '');
    if (newPollQuestion.trim() && filteredOptions.length >= 2) {
      onCreatePoll(newPollQuestion, filteredOptions);
      setNewPollQuestion('');
      setNewPollOptions(['', '']);
      setIsCreatingPoll(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full shrink-0"
        >
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white capitalize tracking-tight">{type}</h2>
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            {type === 'chat' && (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-zinc-300">{msg.sender}</span>
                      <span className="text-[10px] text-zinc-500">{msg.timestamp}</span>
                    </div>
                    <p className="text-sm text-zinc-300 bg-zinc-800/50 p-3 rounded-2xl rounded-tl-none border border-zinc-800 shadow-sm">
                      {msg.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {type === 'participants' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4 px-1">
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    In call ({participants.length})
                  </div>
                  {isHost && (
                    <div className="flex gap-2">
                      <button 
                        onClick={onMuteAll}
                        title="Mute All"
                        className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
                      >
                        <MicOff className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={onLowerAllHands}
                        title="Lower All Hands"
                        className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
                      >
                        <Hand className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center justify-between group p-2 hover:bg-zinc-800/50 rounded-xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={cn(
                          "w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border transition-all duration-300",
                          p.isSpeaking ? "border-orange-500 bg-orange-500/20 scale-105 shadow-[0_0_10px_rgba(249,115,22,0.2)]" : "border-zinc-800"
                        )}>
                          <span className="text-xs font-bold text-orange-500">{p.name[0]}</span>
                        </div>
                        {p.isHandRaised && (
                          <div className="absolute -top-1 -right-1 bg-orange-500 text-white p-0.5 rounded-md shadow-sm">
                            <Hand className="w-2.5 h-2.5 fill-current" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-zinc-100">
                            {p.name} {p.isLocal && "(You)"}
                          </span>
                          <div className="flex items-center gap-1">
                            {p.isMuted && <MicOff className="w-3 h-3 text-red-500" />}
                          </div>
                        </div>
                        {p.isHost && (
                          <span className="text-[10px] text-orange-500 font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Meeting host
                          </span>
                        )}
                        {p.isApprovedSpeaker && !p.isHost && (
                          <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Approved Speaker
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {isHost && !p.isLocal && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!p.isApprovedSpeaker && (
                          <button 
                            onClick={() => onApproveSpeaker(p.id)}
                            title="Approve to Speak"
                            className="p-2 hover:bg-emerald-500/10 rounded-lg text-emerald-500 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => onMuteParticipant(p.id)}
                          title="Mute"
                          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
                        >
                          <MicOff className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => onRemoveParticipant(p.id)}
                          title="Remove"
                          className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 transition-colors"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {type === 'polls' && (
              <div className="space-y-6">
                {isHost && !isCreatingPoll && (
                  <button 
                    onClick={() => setIsCreatingPoll(true)}
                    className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20"
                  >
                    <Plus className="w-4 h-4" /> Create New Poll
                  </button>
                )}

                {isCreatingPoll && (
                  <div className="bg-zinc-800/50 p-4 rounded-2xl border border-zinc-800 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Question</label>
                      <input 
                        type="text" 
                        value={newPollQuestion}
                        onChange={(e) => setNewPollQuestion(e.target.value)}
                        placeholder="What do you think?"
                        className="w-full bg-zinc-900 border-zinc-700 rounded-xl text-sm p-3 focus:ring-2 focus:ring-orange-500 outline-none text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Options</label>
                      {newPollOptions.map((opt, idx) => (
                        <input 
                          key={idx}
                          type="text" 
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...newPollOptions];
                            newOpts[idx] = e.target.value;
                            setNewPollOptions(newOpts);
                          }}
                          placeholder={`Option ${idx + 1}`}
                          className="w-full bg-zinc-900 border-zinc-700 rounded-xl text-sm p-3 focus:ring-2 focus:ring-orange-500 outline-none text-white"
                        />
                      ))}
                      <button 
                        onClick={() => setNewPollOptions([...newPollOptions, ''])}
                        className="text-xs font-bold text-orange-500 hover:text-orange-400 p-1"
                      >
                        + Add Option
                      </button>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={() => setIsCreatingPoll(false)}
                        className="flex-1 py-2 text-xs font-bold text-zinc-400 hover:bg-zinc-800 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleCreatePoll}
                        className="flex-1 py-2 text-xs font-bold bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors"
                      >
                        Launch
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {polls.map(poll => {
                    const hasVoted = poll.votedBy?.includes(currentUserId);
                    return (
                    <div key={poll.id} className="bg-zinc-800/50 border border-zinc-800 p-4 rounded-2xl shadow-sm space-y-3">
                      <h3 className="text-sm font-bold text-white">{poll.question}</h3>
                      <div className="space-y-2">
                        {poll.options.map(opt => {
                          const totalVotes = poll.options.reduce((acc, curr) => acc + curr.votes, 0);
                          const percentage = totalVotes === 0 ? 0 : Math.round((opt.votes / totalVotes) * 100);
                          return (
                            <button 
                              key={opt.id}
                              disabled={hasVoted}
                              onClick={() => { if (!hasVoted) onVotePoll(poll.id, opt.id); }}
                              className={cn(
                                "w-full relative h-10 rounded-xl border overflow-hidden transition-all",
                                hasVoted ? "border-zinc-700 cursor-not-allowed opacity-80" : "border-zinc-800 group hover:border-orange-500/50"
                              )}
                            >
                              <div 
                                className="absolute inset-y-0 left-0 bg-orange-500/10 transition-all duration-500" 
                                style={{ width: `${percentage}%` }}
                              />
                              <div className="absolute inset-0 px-3 flex items-center justify-between text-xs">
                                <span className={cn("font-bold text-zinc-300", hasVoted && "text-zinc-400")}>{opt.text}</span>
                                <span className="text-zinc-500 font-black">{percentage}%</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            )}

            {type === 'qa' && (
              <div className="space-y-6">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">
                  Questions ({questions.length})
                </div>
                <div className="space-y-4">
                  {questions.map(q => {
                    const hasUpvoted = q.upvotedBy?.includes(currentUserId);
                    return (
                    <div key={q.id} className="bg-zinc-800/50 border border-zinc-800 p-4 rounded-2xl shadow-sm space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{q.sender}</span>
                          <p className="text-sm text-zinc-300 font-medium leading-relaxed">{q.text}</p>
                        </div>
                        <button 
                          disabled={hasUpvoted}
                          onClick={() => { if (!hasUpvoted) onUpvoteQuestion(q.id); }}
                          className={cn(
                            "flex flex-col items-center gap-1 p-2 rounded-xl transition-colors group",
                            hasUpvoted ? "opacity-50 cursor-not-allowed" : "hover:bg-zinc-800"
                          )}
                        >
                          <ThumbsUp className={cn("w-4 h-4", hasUpvoted ? "text-orange-500" : "text-zinc-500 group-hover:text-orange-500")} />
                          <span className={cn("text-[10px] font-black", hasUpvoted ? "text-orange-500" : "text-zinc-500 group-hover:text-orange-500")}>{q.upvotes}</span>
                        </button>
                      </div>
                      {q.isAnswered && (
                        <div className="flex items-center gap-1.5 text-orange-500 text-[10px] font-black uppercase tracking-widest bg-orange-500/10 px-2 py-1 rounded-lg w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Answered
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            )}
          </div>

          {(type === 'chat' || type === 'qa') && (
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2 bg-zinc-800 rounded-2xl px-4 py-2 border border-zinc-700 shadow-sm focus-within:ring-2 focus-within:ring-orange-500 transition-all">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={type === 'chat' ? "Send a message..." : "Ask a question..."}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-zinc-100 placeholder-zinc-500"
                />
                <button 
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="text-orange-500 disabled:text-zinc-700 transition-colors p-1"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
