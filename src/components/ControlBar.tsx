import React from 'react';
import { 
  Mic, MicOff, Video, VideoOff, ScreenShare, 
  MessageSquare, Users, PhoneOff, MoreVertical,
  Hand, Shield, Settings, BarChart3, HelpCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ControlBarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isPollsOpen: boolean;
  isQAOpen: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleHandRaise: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onTogglePolls: () => void;
  onToggleQA: () => void;
  onLeave: () => void;
  onEndMeeting?: () => void;
  participantCount: number;
  isAdmin?: boolean;
  isApprovedSpeaker?: boolean;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isMuted, isCameraOff, isScreenSharing, isHandRaised,
  isChatOpen, isParticipantsOpen, isPollsOpen, isQAOpen,
  onToggleMic, onToggleCamera, onToggleScreenShare, onToggleHandRaise,
  onToggleChat, onToggleParticipants, onTogglePolls, onToggleQA, onLeave,
  onEndMeeting, participantCount, isAdmin, isApprovedSpeaker
}) => {
  const canStream = isAdmin || isApprovedSpeaker;

  return (
    <div className="h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-6 shrink-0">
      {/* Left Info */}
      <div className="hidden md:flex items-center gap-4 w-1/4">
        <span className="text-white font-medium">Meeting details</span>
      </div>

      {/* Center Controls */}
      <div className="flex items-center gap-3">
        {canStream && (
          <>
            <button 
              onClick={onToggleMic}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90",
                isMuted ? "bg-red-500 hover:bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"
              )}
            >
              {isMuted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
            </button>

            <button 
              onClick={onToggleCamera}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90",
                isCameraOff ? "bg-red-500 hover:bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"
              )}
            >
              {isCameraOff ? <VideoOff className="w-5 h-5 text-white" /> : <Video className="w-5 h-5 text-white" />}
            </button>

            <div className="w-px h-6 bg-zinc-800 mx-1" />

            <button 
              onClick={onToggleScreenShare}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all bg-zinc-800 hover:bg-zinc-700 active:scale-90",
                isScreenSharing && "text-orange-400"
              )}
            >
              <ScreenShare className="w-5 h-5 text-white" />
            </button>
          </>
        )}
        <button 
          onClick={onToggleHandRaise}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90",
            isHandRaised ? "bg-orange-500 hover:bg-orange-600" : "bg-zinc-800 hover:bg-zinc-700"
          )}
        >
          <Hand className={cn("w-5 h-5", isHandRaised ? "text-zinc-950" : "text-white")} />
        </button>

        <button className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-zinc-800 hover:bg-zinc-700">
          <MoreVertical className="w-5 h-5 text-white" />
        </button>

        {isAdmin ? (
          <button 
            onClick={onEndMeeting}
            className="px-4 h-10 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all ml-2 gap-2 active:scale-95 shadow-lg shadow-red-500/20"
            title="End meeting for everyone"
          >
            <PhoneOff className="w-5 h-5 text-white" />
            <span className="text-xs font-bold text-white hidden sm:inline">End Meeting</span>
          </button>
        ) : (
          <button 
            onClick={onLeave}
            className="w-12 h-10 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all ml-2 active:scale-95 shadow-lg shadow-red-500/20"
            title="Leave meeting"
          >
            <PhoneOff className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 w-1/4 justify-end">
        <button 
          onClick={onTogglePolls}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-zinc-800",
            isPollsOpen ? "text-orange-400 bg-orange-500/10" : "text-zinc-400"
          )}
          title="Polls"
        >
          <BarChart3 className="w-5 h-5" />
        </button>

        <button 
          onClick={onToggleQA}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-zinc-800",
            isQAOpen ? "text-orange-400 bg-orange-500/10" : "text-zinc-400"
          )}
          title="Q&A"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-zinc-800 mx-1" />

        <button 
          onClick={onToggleParticipants}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-zinc-800 relative",
            isParticipantsOpen ? "text-orange-400 bg-orange-500/10" : "text-zinc-400"
          )}
          title="Participants"
        >
          <Users className="w-5 h-5" />
          {participantCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-zinc-900">
              {participantCount}
            </span>
          )}
        </button>

        <button 
          onClick={onToggleChat}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-zinc-800",
            isChatOpen ? "text-orange-400 bg-orange-500/10" : "text-zinc-400"
          )}
          title="Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
