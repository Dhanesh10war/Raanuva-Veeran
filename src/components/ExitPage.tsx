import React from 'react';
import { LogOut } from 'lucide-react';

interface ExitPageProps {
  reason: string;
  onHome: () => void;
}

export const ExitPage: React.FC<ExitPageProps> = ({ reason, onHome }) => {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
          <LogOut className="w-8 h-8 text-red-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">Meeting Ended</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {reason || 'The meeting has concluded. Thank you for attending.'}
          </p>
        </div>
        <button 
          onClick={onHome}
          className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};
