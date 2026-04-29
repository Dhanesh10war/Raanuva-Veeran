import React, { useState } from 'react';
import { Video, Keyboard, Plus, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardProps {
  onJoin: (code: string, name: string) => void;
  onCreate: (secret: string, name: string) => void;
  initialRoomCode?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ onJoin, onCreate, initialRoomCode }) => {
  const [meetingCode, setMeetingCode] = useState(initialRoomCode || '');
  const [adminSecret, setAdminSecret] = useState('');
  const [userName, setUserName] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isJoiningViaLink, setIsJoiningViaLink] = useState(!!initialRoomCode);

  // Update meeting code if initialRoomCode changes
  React.useEffect(() => {
    if (initialRoomCode) {
      setMeetingCode(initialRoomCode);
      setIsJoiningViaLink(true);
    }
  }, [initialRoomCode]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col text-zinc-100">
      {/* Header */}
      <header className="p-6 flex justify-between items-center border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Video className="text-zinc-950 w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">Raanuva Veeran</span>
        </div>
        <div className="flex items-center gap-6 text-zinc-500 text-sm font-medium">
          <span className="hidden sm:inline">Spoken Hindi Academy</span>
          <button 
            onClick={() => setShowAdminLogin(!showAdminLogin)}
            className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-900 transition-colors"
          >
            Admin Portal
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center px-6 lg:px-24 gap-12 lg:gap-24 py-12">
        <div className="max-w-xl text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 text-xs font-bold uppercase tracking-wider mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            Jai Hind • Virtual Classroom
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl lg:text-7xl font-bold text-white leading-[1.1] mb-8 tracking-tight"
          >
            Elite Live <br />
            <span className="text-orange-500">Hindi Stream.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-zinc-400 mb-12 leading-relaxed max-w-lg"
          >
            Join the live broadcast from Raanuva Veeran Academy. Watch the teacher, chat in real-time, and participate in interactive polls and Q&A.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {isJoiningViaLink && !showAdminLogin ? (
              <div className="p-8 rounded-3xl bg-zinc-900 border border-orange-500/30 space-y-6 max-w-md shadow-2xl shadow-orange-500/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Join Live Stream</h3>
                  <p className="text-zinc-500 text-sm">You're joining room <span className="text-orange-500 font-mono">{meetingCode}</span> as a viewer.</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Your Name</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    autoFocus
                    className="w-full px-4 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-white placeholder-zinc-700"
                  />
                </div>

                <button 
                  onClick={() => onJoin(meetingCode, userName)}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-zinc-950 font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 group"
                >
                  Join Stream
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                
                <button 
                  onClick={() => {
                    setMeetingCode('');
                    setIsJoiningViaLink(false);
                  }}
                  className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs font-medium"
                >
                  Join a different room instead
                </button>
              </div>
            ) : showAdminLogin ? (
              <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4 max-w-md">
                <h3 className="text-lg font-semibold text-white">Admin Meeting Creation</h3>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Admin Secret Key</label>
                  <input
                    type="password"
                    value={adminSecret}
                    onChange={(e) => setAdminSecret(e.target.value)}
                    placeholder="Enter secret key"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-white"
                  />
                </div>
                <button 
                  onClick={() => onCreate(adminSecret, userName)}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-zinc-950 font-bold rounded-xl transition-all shadow-lg shadow-orange-500/20"
                >
                  Create Secure Meeting
                </button>
                <button 
                  onClick={() => setShowAdminLogin(false)}
                  className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm font-medium"
                >
                  Back to Join
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative w-full sm:w-80 group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Keyboard className="h-5 w-5 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                  </div>
                  <input
                    type="text"
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value)}
                    placeholder="Enter meeting code"
                    className="block w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl leading-5 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>

                <button 
                  disabled={!meetingCode}
                  onClick={() => onJoin(meetingCode, userName)}
                  className="w-full sm:w-auto px-8 py-4 bg-zinc-100 hover:bg-white text-zinc-950 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Meeting
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </motion.div>
        </div>

        {/* Visual Element */}
        <div className="hidden lg:block w-full max-w-lg">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-orange-500/20 blur-[60px] rounded-full" />
            <div className="relative bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 overflow-hidden shadow-2xl">
              <img 
                src="https://images.unsplash.com/photo-1532375810709-75b1da00537c?auto=format&fit=crop&w=800&q=80" 
                alt="Academy Illustration" 
                className="w-full aspect-video rounded-3xl object-cover mb-8 opacity-90 transition-all duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <Plus className="text-orange-500 w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Interactive Learning</h3>
                    <p className="text-zinc-500 text-sm">Real-time Hindi conversation practice with experts.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};
