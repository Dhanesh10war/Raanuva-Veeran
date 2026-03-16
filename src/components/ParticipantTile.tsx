import React, { useRef, useEffect, memo, useState } from 'react';
import { MicOff, User, MoreVertical, Hand, ShieldCheck, RefreshCw } from 'lucide-react';
import { Participant } from '../types';
import { cn } from '../lib/utils';

interface ParticipantTileProps {
  participant: Participant;
  isMain?: boolean;
  onReconnect?: (id: string) => void;
}

const ParticipantTileComponent: React.FC<ParticipantTileProps> = ({ participant, isMain, onReconnect }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  useEffect(() => {
    const activeStream = participant.isScreenSharing && participant.screenShareStream 
      ? participant.screenShareStream 
      : participant.stream;

    if (videoRef.current && activeStream) {
      if (videoRef.current.srcObject !== activeStream) {
        console.log(`Attaching stream to ${participant.name} tile. Tracks:`, activeStream.getTracks().map(t => t.kind));
        videoRef.current.srcObject = activeStream;
        
        const playVideo = async () => {
          try {
            if (videoRef.current) {
              // Ensure muted for local, unmuted for remote
              videoRef.current.muted = participant.isLocal;
              await videoRef.current.play();
              setIsVideoPlaying(true);
            }
          } catch (e) {
            console.warn("Autoplay blocked for:", participant.name, e);
            setIsVideoPlaying(false);
            
            // Fallback: try playing muted if unmuted failed (browsers allow muted autoplay)
            if (!participant.isLocal && videoRef.current) {
              try {
                videoRef.current.muted = true;
                await videoRef.current.play();
                console.log("Started muted autoplay as fallback for:", participant.name);
              } catch (err) {
                console.error("Muted fallback also failed:", err);
              }
            }
          }
        };

        playVideo();
      }
    }
  }, [participant?.stream, participant?.screenShareStream, participant?.isScreenSharing, participant?.isCameraOff, participant?.isLocal]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReconnect) {
      onReconnect(participant.id);
    }
  };

  return (
    <div className={cn(
      "relative bg-zinc-800 rounded-2xl overflow-hidden group transition-all duration-500 border-2",
      isMain ? "w-full h-full" : "aspect-video",
      participant.isHandRaised ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]" : 
      participant.isSpeaking ? "border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]" : "border-transparent"
    )}>
      {participant.isCameraOff && !participant.isScreenSharing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
          <div className="w-24 h-24 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-inner mb-4">
            <span className="text-4xl font-black text-emerald-500">
              {participant.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-zinc-400 font-bold text-lg tracking-tight">
            {participant.name}
          </span>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className={cn("w-full h-full object-cover", participant.isLocal && "scale-x-[-1]")}
          style={!participant.isLocal ? {
            filter: 'brightness(1.12) contrast(1.05) saturate(1.1)'
          } : undefined}
        />
      )}

      {/* Hand Raise Indicator */}
      {participant.isHandRaised && (
        <div className="absolute top-4 left-4 z-10">
          <div className="bg-emerald-500 text-zinc-950 p-2 rounded-xl shadow-lg animate-bounce">
            <Hand className="w-5 h-5 fill-current" />
          </div>
        </div>
      )}

      {/* Overlay Info */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <div className="bg-zinc-950/60 backdrop-blur-xl px-3 py-1.5 rounded-xl flex items-center gap-2 border border-white/5">
          <span className="text-white text-xs font-bold tracking-tight">
            {participant.name} {participant.isLocal && "(You)"}
          </span>
          {participant.isHost && (
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-red-600 border border-red-500 shadow-[0_0_10px_rgba(220,38,38,0.4)]">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[8px] font-black text-white uppercase tracking-tighter">Live</span>
            </div>
          )}
          {participant.isMuted && (
            <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
              <MicOff className="w-3 h-3 text-red-500" />
            </div>
          )}
        </div>
      </div>

      {/* Status Indicators */}
      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!participant.isLocal && onReconnect && (
          <button 
            onClick={handleRefresh}
            className="bg-black/40 backdrop-blur-md p-1.5 rounded-full hover:bg-indigo-500/40 transition-colors"
            title="Refresh connection"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        )}
        <div className="bg-black/40 backdrop-blur-md p-1.5 rounded-full">
          <MoreVertical className="w-4 h-4 text-white cursor-pointer" />
        </div>
      </div>
    </div>
  );
};

export const ParticipantTile = memo(ParticipantTileComponent);
