import { useState, useEffect, useCallback, useRef } from 'react';
import { Participant, ChatMessage, Poll, Question } from '../types';
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';

export const useWebRTC = (room: string, userName: string, isAdmin: boolean = false, onMeetingEnd?: (reason?: string) => void) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [isCameraOff, setIsCameraOff] = useState(!isAdmin);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isHost, setIsHost] = useState(isAdmin);
  // Whether THIS student has been granted live mic access by the admin
  const [isMicGranted, setIsMicGranted] = useState(isAdmin);

  const socketRef = useRef<WebSocket | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const userId = useRef(Math.random().toString(36).substr(2, 9));
  const onMeetingEndRef = useRef(onMeetingEnd);
  // Keep track of current room/userName for reconnect inside WebSocket handler
  const roomRef = useRef(room);
  const userNameRef = useRef(userName);

  // States synced via WebSocket
  const syncedStatesRef = useRef<Record<string, { isHandRaised: boolean, isAdmin: boolean, isApprovedSpeaker: boolean, isSpeaking: boolean, isMicGranted?: boolean }>>({});

  // This function will be defined inside the LiveKit effect, but we need a mutable reference to it
  const syncParticipantsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onMeetingEndRef.current = onMeetingEnd;
  }, [onMeetingEnd]);

  useEffect(() => {
    roomRef.current = room;
    userNameRef.current = userName;
  }, [room, userName]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: reconnect to LiveKit with a publish-capable (upgraded) token
  // Called when admin grants a student mic access
  // ─────────────────────────────────────────────────────────────────────────────
  const reconnectWithMicAccess = useCallback(async () => {
    const lk = livekitRoomRef.current;
    if (!lk) return;

    try {
      const apiUrl = new URL('/api/livekit-token-upgrade', window.location.origin).toString();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: roomRef.current,
          participantName: userNameRef.current,
          identity: userId.current
        })
      });

      if (!res.ok) throw new Error('Failed to fetch upgrade token');
      const data = await res.json();

      // Disconnect from LiveKit and reconnect with the new token that allows publishing
      await lk.disconnect();
      await lk.connect(data.url, data.token);

      // Enable mic immediately after reconnect
      await lk.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);

      if (syncParticipantsRef.current) syncParticipantsRef.current();
    } catch (err) {
      console.error('Mic upgrade reconnect failed:', err);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // WebSocket: Chat, Polls, Q&A, Hand Raising, Mic Grants
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'join',
        room,
        userId: userId.current,
        name: userName + (isAdmin ? ' (Teacher)' : ''),
        isAdmin,
        isListener: !isAdmin
      }));

      const heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      return () => clearInterval(heartbeat);
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'chat':
            setMessages(prev => [...prev, message.message]);
            break;
          case 'poll-created':
            setPolls(prev => [...prev, message.poll]);
            break;
          case 'poll-voted':
            setPolls(prev => prev.map(p => {
              if (p.id === message.pollId) {
                if (message.userId && p.votedBy?.includes(message.userId)) return p;
                return {
                  ...p,
                  options: p.options.map(o =>
                    o.id === message.optionId ? { ...o, votes: o.votes + 1 } : o
                  ),
                  votedBy: [...(p.votedBy || []), message.userId]
                };
              }
              return p;
            }));
            break;
          case 'question-asked':
            setQuestions(prev => [...prev, message.question]);
            break;
          case "question-upvoted":
            setQuestions(prev => prev.map(q => {
              if (q.id === message.questionId) {
                if (message.userId && q.upvotedBy?.includes(message.userId)) return q;
                return { ...q, upvotes: q.upvotes + 1, upvotedBy: [...(q.upvotedBy || []), message.userId] };
              }
              return q;
            }).sort((a, b) => b.upvotes - a.upvotes));
            break;
          case 'end-meeting':
            if (onMeetingEndRef.current) onMeetingEndRef.current('ended-by-host');
            break;
          case 'toggle-hand':
            syncedStatesRef.current = {
              ...syncedStatesRef.current,
              [message.userId]: {
                ...syncedStatesRef.current[message.userId],
                isHandRaised: message.isHandRaised
              }
            };
            if (syncParticipantsRef.current) syncParticipantsRef.current();
            break;
          case 'remove-participant':
            if (message.targetId === userId.current) {
              if (onMeetingEndRef.current) onMeetingEndRef.current('removed');
            }
            break;
          case 'mute-all':
            if (!isAdmin && livekitRoomRef.current) {
              const localAudio = Array.from(livekitRoomRef.current.localParticipant.audioTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Microphone);
              if (localAudio && localAudio.track) localAudio.track.mute();
              setIsMuted(true);
            }
            break;
          case 'remote-mute':
            if (message.targetId === userId.current && livekitRoomRef.current) {
              const localAudio = Array.from(livekitRoomRef.current.localParticipant.audioTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Microphone);
              if (localAudio && localAudio.track) localAudio.track.mute();
              setIsMuted(true);
            }
            break;
          case 'lower-all-hands':
            setIsHandRaised(false);
            const resetHands: Record<string, any> = {};
            Object.keys(syncedStatesRef.current).forEach(id => {
              resetHands[id] = { ...syncedStatesRef.current[id], isHandRaised: false };
            });
            syncedStatesRef.current = resetHands;
            if (syncParticipantsRef.current) syncParticipantsRef.current();
            break;
          case 'speaker-approved':
            syncedStatesRef.current = {
              ...syncedStatesRef.current,
              [message.targetId]: {
                ...syncedStatesRef.current[message.targetId],
                isApprovedSpeaker: message.isApproved
              }
            };
            if (syncParticipantsRef.current) syncParticipantsRef.current();
            break;

          // ── NEW: Admin grants a student real microphone access ──
          case 'grant-mic':
            // Update synced state so UI reflects the grant
            syncedStatesRef.current = {
              ...syncedStatesRef.current,
              [message.targetId]: {
                ...syncedStatesRef.current[message.targetId],
                isMicGranted: true,
                isApprovedSpeaker: true
              }
            };
            if (syncParticipantsRef.current) syncParticipantsRef.current();

            if (message.targetId === userId.current && !isAdmin) {
              // This student was granted mic access — reconnect with a publish token
              setIsMicGranted(true);
              await reconnectWithMicAccess();
            }
            break;

          // ── NEW: Admin revokes a student's microphone access ──
          case 'revoke-mic':
            syncedStatesRef.current = {
              ...syncedStatesRef.current,
              [message.targetId]: {
                ...syncedStatesRef.current[message.targetId],
                isMicGranted: false,
                isApprovedSpeaker: false
              }
            };
            if (syncParticipantsRef.current) syncParticipantsRef.current();

            if (message.targetId === userId.current && !isAdmin && livekitRoomRef.current) {
              // Mute and disable mic for this student
              const localAudio = Array.from(
                livekitRoomRef.current.localParticipant.audioTrackPublications.values() as IterableIterator<any>
              ).find(p => p.source === Track.Source.Microphone);
              if (localAudio && localAudio.track) localAudio.track.mute();
              await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(false);
              setIsMuted(true);
              setIsMicGranted(false);
            }
            break;
        }
      } catch (e) { }
    };

    return () => { socket.close(); };
  }, [room, userName, isAdmin, reconnectWithMicAccess]);

  // ─────────────────────────────────────────────────────────────────────────────
  // LiveKit Room — 4K video quality
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    const connectToLiveKit = async () => {
      try {
        const apiUrl = new URL('/api/livekit-token', window.location.origin).toString();

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: room,
            participantName: userName + (isAdmin ? ' (Teacher)' : ''),
            isAdmin,
            identity: userId.current
          })
        });

        if (!res.ok) throw new Error('Failed to fetch LiveKit token');
        const data = await res.json();
        if (!active) return;

        const livekitUrl = data.url;
        const token = data.token;

        const lkRoom = new Room({
          // Adaptive stream sharpness based on pixel density
          adaptiveStream: { pixelDensity: 'screen' },
          dynacast: true,
          // ── Request highest possible resolution from the camera hardware ──
          videoCaptureDefaults: {
            resolution: VideoPresets.h2160.resolution, // 4K target (falls back gracefully)
            facingMode: 'user',
          },
          publishDefaults: {
            videoCodec: 'vp9', // More efficient at high resolutions than VP8
            // Simulcast: viewers on slower connections get lower layers
            videoSimulcastLayers: [
              VideoPresets.h720,
              VideoPresets.h1080,
              VideoPresets.h2160,
            ],
            simulcast: true,
            // Primary encoding: maximum quality for the full-resolution recipient
            videoEncoding: {
              maxBitrate: 20_000_000, // 20 Mbps for 4K
              maxFramerate: 30,
              priority: 'high',
            },
            // Screen share — crisp text needs high bitrate
            screenShareEncoding: {
              maxBitrate: 15_000_000, // 15 Mbps
              maxFramerate: 30,
              priority: 'high',
            },
            backupCodec: true, // Fallback if VP9 not supported
          }
        });
        livekitRoomRef.current = lkRoom;

        const mediaStreamCache = new Map<string, MediaStream>();

        const syncParticipants = () => {
          if (!active) return;
          const allParticipants: Participant[] = [];

          // Local
          let localMedia = mediaStreamCache.get(lkRoom.localParticipant.identity);
          if (!localMedia) {
            localMedia = new MediaStream();
            mediaStreamCache.set(lkRoom.localParticipant.identity, localMedia);
          }
          let localScreenMedia = mediaStreamCache.get(lkRoom.localParticipant.identity + "_screen");
          if (!localScreenMedia) {
            localScreenMedia = new MediaStream();
            mediaStreamCache.set(lkRoom.localParticipant.identity + "_screen", localScreenMedia);
          }

          localMedia.getTracks().forEach(t => localMedia!.removeTrack(t));
          localScreenMedia.getTracks().forEach(t => localScreenMedia!.removeTrack(t));

          let localVideoOff = true;
          let localAudioOff = true;
          let localScreenSharing = false;

          lkRoom.localParticipant.videoTrackPublications.forEach((pub: any) => {
            if (pub.track) {
              if (pub.source === Track.Source.ScreenShare) {
                localScreenSharing = true;
                localScreenMedia!.addTrack(pub.track.mediaStreamTrack);
              } else if (pub.source === Track.Source.Camera || pub.source === Track.Source.Unknown) {
                localVideoOff = false;
                localMedia!.addTrack(pub.track.mediaStreamTrack);
              }
            }
          });
          lkRoom.localParticipant.audioTrackPublications.forEach((pub: any) => {
            if (pub.track) {
              if (pub.source === Track.Source.ScreenShareAudio) {
                localScreenMedia!.addTrack(pub.track.mediaStreamTrack);
              } else {
                localAudioOff = false;
                localMedia!.addTrack(pub.track.mediaStreamTrack);
              }
            }
          });

          allParticipants.push({
            id: lkRoom.localParticipant.identity,
            name: lkRoom.localParticipant.name || userName,
            isLocal: true,
            isHost: isAdmin,
            isListener: !isAdmin,
            isApprovedSpeaker: isAdmin,
            isMicGranted: isAdmin,
            isMuted: localAudioOff,
            isCameraOff: localVideoOff,
            isScreenSharing: localScreenSharing,
            isHandRaised: isHandRaised,
            stream: localMedia,
            screenShareStream: localScreenMedia
          });

          // Remote
          lkRoom.remoteParticipants.forEach(rp => {
            let remoteMedia = mediaStreamCache.get(rp.identity);
            if (!remoteMedia) {
              remoteMedia = new MediaStream();
              mediaStreamCache.set(rp.identity, remoteMedia);
            }
            let remoteScreenMedia = mediaStreamCache.get(rp.identity + "_screen");
            if (!remoteScreenMedia) {
              remoteScreenMedia = new MediaStream();
              mediaStreamCache.set(rp.identity + "_screen", remoteScreenMedia);
            }

            remoteMedia.getTracks().forEach(t => remoteMedia!.removeTrack(t));
            remoteScreenMedia.getTracks().forEach(t => remoteScreenMedia!.removeTrack(t));

            let videoOff = true;
            let audioOff = true;
            let screenSharing = false;

            rp.videoTrackPublications.forEach((pub: any) => {
              if (pub.track) {
                if (pub.source === Track.Source.ScreenShare) {
                  screenSharing = true;
                  remoteScreenMedia!.addTrack(pub.track.mediaStreamTrack);
                } else if (pub.source === Track.Source.Camera || pub.source === Track.Source.Unknown) {
                  videoOff = false;
                  remoteMedia!.addTrack(pub.track.mediaStreamTrack);
                }
              }
            });
            rp.audioTrackPublications.forEach((pub: any) => {
              if (pub.track) {
                if (pub.source === Track.Source.ScreenShareAudio) {
                  remoteScreenMedia!.addTrack(pub.track.mediaStreamTrack);
                } else {
                  audioOff = false;
                  remoteMedia!.addTrack(pub.track.mediaStreamTrack);
                }
              }
            });

            const wsState = syncedStatesRef.current[rp.identity];

            allParticipants.push({
              id: rp.identity,
              name: rp.name || rp.identity,
              isLocal: false,
              isHost: rp.name?.includes('(Teacher)') || false,
              isListener: !rp.name?.includes('(Teacher)'),
              isApprovedSpeaker: rp.name?.includes('(Teacher)') || wsState?.isApprovedSpeaker || false,
              isMicGranted: rp.name?.includes('(Teacher)') || wsState?.isMicGranted || false,
              isMuted: audioOff,
              isCameraOff: videoOff,
              isScreenSharing: screenSharing,
              isHandRaised: wsState?.isHandRaised || false,
              isSpeaking: rp.isSpeaking,
              stream: remoteMedia,
              screenShareStream: remoteScreenMedia
            });
          });

          // WebSocket-only participants (no LiveKit track yet)
          Object.keys(syncedStatesRef.current).forEach(wsUserId => {
            if (!allParticipants.find(p => p.id === wsUserId) && wsUserId !== userId.current) {
              allParticipants.push({
                id: wsUserId,
                name: (syncedStatesRef.current[wsUserId] as any).name || 'Student',
                isLocal: false,
                isHost: false,
                isListener: true,
                isApprovedSpeaker: false,
                isMicGranted: false,
                isMuted: true,
                isCameraOff: true,
                isScreenSharing: false,
                isHandRaised: syncedStatesRef.current[wsUserId].isHandRaised || false,
                stream: new MediaStream()
              });
            }
          });

          setParticipants(allParticipants);
        };

        syncParticipantsRef.current = syncParticipants;
        syncParticipants();

        lkRoom.on(RoomEvent.TrackSubscribed, syncParticipants);
        lkRoom.on(RoomEvent.TrackUnsubscribed, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackPublished, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackUnpublished, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantConnected, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, syncParticipants);

        await lkRoom.connect(livekitUrl, token);

        if (isAdmin) {
          await lkRoom.localParticipant.enableCameraAndMicrophone();
          setIsMuted(false);
          setIsCameraOff(false);
          syncParticipants();
        }

      } catch (error) {
        console.error("LiveKit connect error:", error);
      }
    };

    connectToLiveKit();

    return () => {
      active = false;
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
      }
    };
  }, [room, userName, isAdmin]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Controls
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleMic = async () => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;

    // Only admin or mic-granted students can toggle mic
    if (!isAdmin && !isMicGranted) return;

    let localAudioPub = Array.from(lk.localParticipant.audioTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Microphone);

    if (localAudioPub && localAudioPub.track) {
      if (isMuted) {
        await localAudioPub.track.unmute();
      } else {
        await localAudioPub.track.mute();
      }
      setIsMuted(!isMuted);
    } else if (isMuted) {
      await lk.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
    }
  };

  const toggleCamera = async () => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;
    if (!isAdmin) return;

    let localVideoPub = Array.from(lk.localParticipant.videoTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Camera);

    if (localVideoPub && localVideoPub.track) {
      if (isCameraOff) {
        await localVideoPub.track.unmute();
      } else {
        await localVideoPub.track.mute();
      }
      setIsCameraOff(!isCameraOff);
    } else if (isCameraOff) {
      await lk.localParticipant.setCameraEnabled(true);
      setIsCameraOff(false);
    }
  };

  const toggleScreenShare = async () => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;
    if (!isAdmin) return;

    if (isScreenSharing) {
      await lk.localParticipant.setScreenShareEnabled(false);
      setIsScreenSharing(false);
    } else {
      await lk.localParticipant.setScreenShareEnabled(true);
      setIsScreenSharing(true);
    }
  };

  const sendMessage = (text: string) => {
    const message: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      sender: userName,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    socketRef.current?.send(JSON.stringify({ type: 'chat', room, message }));
  };

  const toggleHandRaise = () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    syncedStatesRef.current = {
      ...syncedStatesRef.current,
      [userId.current]: {
        ...syncedStatesRef.current[userId.current],
        isHandRaised: newState
      }
    };
    if (syncParticipantsRef.current) syncParticipantsRef.current();
    socketRef.current?.send(JSON.stringify({
      type: 'toggle-hand',
      room,
      userId: userId.current,
      isHandRaised: newState
    }));
  };

  const createPoll = (question: string, options: string[]) => {
    if (!isAdmin) return;
    const poll: Poll = {
      id: Math.random().toString(36).substr(2, 9),
      question,
      options: options.map(o => ({ id: Math.random().toString(36).substr(2, 9), text: o, votes: 0 })),
      isOpen: true,
      creatorId: userId.current,
      votedBy: []
    };
    socketRef.current?.send(JSON.stringify({ type: 'poll-created', room, poll }));
  };

  const votePoll = (pollId: string, optionId: string) => {
    socketRef.current?.send(JSON.stringify({ type: 'poll-voted', room, pollId, optionId, userId: userId.current }));
  };

  const askQuestion = (text: string) => {
    const question: Question = {
      id: Math.random().toString(36).substr(2, 9),
      sender: userName,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      upvotes: 0,
      isAnswered: false,
      upvotedBy: []
    };
    socketRef.current?.send(JSON.stringify({ type: 'question-asked', room, question }));
  };

  const upvoteQuestion = (questionId: string) => {
    socketRef.current?.send(JSON.stringify({ type: 'question-upvoted', room, questionId, userId: userId.current }));
  };

  const endMeeting = () => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'end-meeting', room }));
    if (onMeetingEndRef.current) onMeetingEndRef.current('ended-by-host');
  };

  const muteParticipant = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'remote-mute', room, targetId }));
  };

  const muteAll = () => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'mute-all', room }));
  };

  const lowerAllHands = () => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'lower-all-hands', room }));
  };

  const approveSpeaker = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'speaker-approved', room, targetId, isApproved: true }));
  };

  const removeParticipant = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'remove-participant', room, targetId }));
  };

  // ── NEW: Grant a student real mic access (reconnects them with publish token) ──
  const grantMic = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'grant-mic', room, targetId }));
  };

  // ── NEW: Revoke a student's mic access ──
  const revokeMic = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'revoke-mic', room, targetId }));
  };

  return {
    currentUserId: userId.current,
    participants,
    messages,
    polls,
    questions,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isHandRaised,
    isHost,
    isMicGranted,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    toggleHandRaise,
    muteParticipant,
    muteAll,
    lowerAllHands,
    sendMessage,
    createPoll,
    votePoll,
    askQuestion,
    upvoteQuestion,
    approveSpeaker,
    removeParticipant,
    grantMic,
    revokeMic,
    endMeeting
  };
};
