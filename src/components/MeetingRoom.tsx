import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ControlBar } from './ControlBar';
import { ParticipantTile } from './ParticipantTile';
import { Sidebar } from './Sidebar';
import { useWebRTC } from '../hooks/useWebRTC';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Share2, Users, MessageSquare, Hand, ShieldCheck, Video, Mic } from 'lucide-react';

const HiddenAudioPlayer = ({ participant }: { participant: any }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    if (audioRef.current && participant.stream) {
       if (audioRef.current.srcObject !== participant.stream) {
         audioRef.current.srcObject = participant.stream;
         audioRef.current.play().catch(e => console.warn('Audio play failed', e));
       }
    }
  }, [participant.stream]);
  
  return <audio ref={audioRef} autoPlay playsInline muted={participant.isLocal} className="hidden" />;
};

interface MeetingRoomProps {
  roomCode: string;
  userName: string;
  isAdmin: boolean;
  onLeave: (reason?: string) => void;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ roomCode, userName, isAdmin, onLeave }) => {
  const [sidebarType, setSidebarType] = useState<'chat' | 'participants' | 'polls' | 'qa' | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    currentUserId,
    participants,
    messages,
    polls,
    questions,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isHandRaised,
    isHost,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    toggleHandRaise,
    muteParticipant,
    stopVideo,
    muteAll,
    lowerAllHands,
    sendMessage,
    createPoll,
    votePoll,
    askQuestion,
    upvoteQuestion,
    approveSpeaker,
    revokeSpeaker,
    removeParticipant,
    endMeeting,
    micAccessGranted,
    availableCameras,
    activeCameraId,
    dismissMicNotification,
    switchCamera,
  } = useWebRTC(roomCode, userName, isAdmin, onLeave);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Scalability: If more than 6 participants, switch to a more optimized view
  const isLargeMeeting = participants.length > 6;

  // Grid layout optimization
  const getTileStyles = (count: number) => {
    if (count === 1) return "w-full max-w-5xl aspect-video";
    if (count === 2) return "w-full md:w-[calc(50%-12px)] aspect-video";
    if (count <= 4) return "w-[calc(50%-12px)] aspect-video";
    if (count <= 6) return "w-[calc(50%-12px)] md:w-[calc(33.333%-12px)] aspect-video";
    if (count <= 9) return "w-[calc(33.333%-12px)] aspect-video";
    return "w-[calc(33.333%-12px)] lg:w-[calc(25%-12px)] aspect-video";
  };

  const activeSpeaker = useMemo(() =>
    participants.find(p => p.isScreenSharing) ||
    participants.find(p => p.isHandRaised) ||
    participants.find(p => p.isHost) ||
    participants[0],
    [participants]);

  // Visibility Rules:
  // - Admin (isHost) sees themselves (center) + all students who have their camera ON.
  // - Student sees the Admin (center) + their own video (self). Students NEVER see other students.
  const displayParticipants = useMemo(() => {
    if (isAdmin) {
      // Admin sees themselves and anyone with a camera on or screen sharing
      return participants.filter(p => p.isLocal || (!p.isCameraOff || p.isScreenSharing));
    } else {
      // Student sees Admin and themselves
      return participants.filter(p => p.isHost || p.isLocal);
    }
  }, [participants, isAdmin]);

  const otherParticipants = useMemo(() =>
    displayParticipants.filter(p => p.id !== activeSpeaker?.id),
    [displayParticipants, activeSpeaker]);

  const hiddenParticipants = useMemo(() => {
    return participants.filter(p => !displayParticipants.includes(p) && !p.isLocal);
  }, [participants, displayParticipants]);

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden text-zinc-100">
      {/* Mic Access Granted Notification — shown only to approved students */}
      {micAccessGranted && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-emerald-500 text-zinc-950 rounded-2xl shadow-2xl shadow-emerald-500/30 animate-bounce"
          style={{ animationIterationCount: 3 }}
        >
          <Mic className="w-5 h-5 shrink-0" />
          <span className="text-sm font-black">You can now speak! Press the mic button below.</span>
          <button
            onClick={dismissMicNotification}
            className="ml-2 text-zinc-800 hover:text-zinc-950 font-bold text-xs"
          >✕</button>
        </div>
      )}
      {/* Header Info */}
      <div className="absolute top-4 left-6 z-20 flex items-center gap-3">
        <div className="bg-zinc-900/80 backdrop-blur-xl px-4 py-2 rounded-2xl border border-zinc-800 flex items-center gap-4 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-sm font-bold tracking-tight">Live Stream</span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-bold uppercase tracking-widest">{roomCode}</span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2 text-zinc-400">
            <Users className="w-4 h-4" />
            <span className="text-xs font-bold">{participants.length}</span>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-tighter">
              Host
            </div>
          )}
        </div>

        <button
          onClick={handleShare}
          className="bg-zinc-900/80 backdrop-blur-xl px-4 py-2 rounded-2xl border border-zinc-800 flex items-center gap-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shadow-2xl group"
        >
          <Share2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold">{copied ? 'Copied!' : 'Copy Link'}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 p-4 md:p-6 flex items-center justify-center overflow-hidden">
          {isScreenSharing ? (
            <div className="w-full h-full flex flex-col lg:flex-row gap-6 mt-16">
              <div className="flex-[4] relative">
                <ParticipantTile participant={activeSpeaker} isMain />
              </div>
              <div className="flex-1 flex flex-row lg:flex-col gap-4 overflow-x-auto lg:overflow-y-auto pb-4 lg:pb-0 scrollbar-hide">
                {otherParticipants.map(p => (
                  <div key={p.id} className="w-48 lg:w-full shrink-0">
                    <ParticipantTile participant={p} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full h-full max-w-[1400px] flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6 mx-auto pt-20 pb-4 overflow-hidden">
              <AnimatePresence>
                {/* Admin (Center/Main) */}
                {displayParticipants.filter(p => p.isHost).map(p => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="flex-[2] lg:flex-[3] relative rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-zinc-800 min-h-[30vh]"
                  >
                    <ParticipantTile participant={p} isMain />
                    {p.isLocal && p.isCameraOff && (
                      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCamera();
                          }}
                          className="pointer-events-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-2xl shadow-red-600/40 flex items-center gap-2 transition-all active:scale-95"
                        >
                          <Video className="w-5 h-5" />
                          Start Live Stream
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Students (Sidebar column/row) */}
                {displayParticipants.filter(p => !p.isHost).length > 0 && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1 lg:flex-[1] flex flex-row lg:flex-col gap-4 overflow-x-auto lg:overflow-y-auto scrollbar-hide shrink-0 w-full lg:w-auto min-w-0 lg:min-w-[280px] lg:max-w-[360px] pb-2 lg:pb-10 pr-2"
                  >
                    <AnimatePresence>
                      {displayParticipants.filter(p => !p.isHost).map(p => (
                        <motion.div
                          key={p.id}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: "spring", damping: 25, stiffness: 200 }}
                          className={cn(
                            "w-48 lg:w-full shrink-0 aspect-video rounded-2xl overflow-hidden shadow-lg",
                            p.isSpeaking ? "ring-2 ring-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]" : "ring-1 ring-zinc-800"
                          )}
                        >
                          <ParticipantTile participant={p} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Sidebar Integration */}
        <Sidebar
          isOpen={sidebarType !== null}
          type={sidebarType || 'chat'}
          currentUserId={currentUserId}
          onClose={() => setSidebarType(null)}
          participants={participants}
          messages={messages}
          polls={polls}
          questions={questions}
          onSendMessage={sendMessage}
          onMuteParticipant={muteParticipant}
          onStopVideo={stopVideo}
          onMuteAll={muteAll}
          onLowerAllHands={lowerAllHands}
          onRemoveParticipant={removeParticipant}
          onCreatePoll={createPoll}
          onVotePoll={votePoll}
          onAskQuestion={askQuestion}
          onUpvoteQuestion={upvoteQuestion}
          onApproveSpeaker={approveSpeaker}
          onRevokeSpeaker={revokeSpeaker}
          isHost={isAdmin}
        />
      </div>

      {/* Control Bar */}
      <ControlBar
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isScreenSharing={isScreenSharing}
        isHandRaised={isHandRaised}
        isChatOpen={sidebarType === 'chat'}
        isParticipantsOpen={sidebarType === 'participants'}
        isPollsOpen={sidebarType === 'polls'}
        isQAOpen={sidebarType === 'qa'}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleHandRaise={toggleHandRaise}
        onToggleChat={() => setSidebarType(sidebarType === 'chat' ? null : 'chat')}
        onToggleParticipants={() => setSidebarType(sidebarType === 'participants' ? null : 'participants')}
        onTogglePolls={() => setSidebarType(sidebarType === 'polls' ? null : 'polls')}
        onToggleQA={() => setSidebarType(sidebarType === 'qa' ? null : 'qa')}
        onLeave={onLeave}
        onEndMeeting={endMeeting}
        participantCount={participants.length}
        isAdmin={isAdmin}
        isApprovedSpeaker={participants.find(p => p.isLocal)?.isApprovedSpeaker}
        availableCameras={availableCameras}
        activeCameraId={activeCameraId}
        onSwitchCamera={switchCamera}
      />

      {/* Hidden Audio Elements for non-displayed participants */}
      {hiddenParticipants.map(p => (
        <HiddenAudioPlayer key={p.id} participant={p} />
      ))}
    </div>
  );
};
