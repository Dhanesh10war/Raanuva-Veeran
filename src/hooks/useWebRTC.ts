import { useState, useEffect, useCallback, useRef } from 'react';
import { Participant, ChatMessage, Poll, Question } from '../types';
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';

export const useWebRTC = (room: string, userName: string, isAdmin: boolean = false, onMeetingEnd?: (reason?: string) => void) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isMuted, setIsMuted] = useState(!isAdmin);
  const [isCameraOff, setIsCameraOff] = useState(!isAdmin);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isHost, setIsHost] = useState(isAdmin);
  const [isApprovedSpeaker, setIsApprovedSpeaker] = useState(false);
  const [micAccessGranted, setMicAccessGranted] = useState(false); // True when admin just approved — shows notification

  const socketRef = useRef<WebSocket | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const userId = useRef(Math.random().toString(36).substr(2, 9));
  const onMeetingEndRef = useRef(onMeetingEnd);

  // States synced via WebSocket
  const syncedStatesRef = useRef<Record<string, { isHandRaised: boolean, isAdmin: boolean, isApprovedSpeaker: boolean, isSpeaking: boolean }>>({});

  // This function will be defined inside the LiveKit effect, but we need a mutable reference to it
  // so the WebSocket effect can trigger it when states change.
  const syncParticipantsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onMeetingEndRef.current = onMeetingEnd;
  }, [onMeetingEnd]);

  // Connect to custom WebSocket for Chat, Polls, Q&A, and Hand Raising
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

            // Trigger LiveKit sync to update UI
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
            }
            break;
          case 'remove-participant':
            if (message.targetId === userId.current) {
              if (onMeetingEndRef.current) onMeetingEndRef.current('removed');
            }
            break;
          case 'mute-all':
            if (!isAdmin && livekitRoomRef.current) {
              const localAudio = Array.from(livekitRoomRef.current.localParticipant.audioTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Microphone);
              if (localAudio && localAudio.track) {
                localAudio.track.mute();
              }
              setIsMuted(true);
            }
            break;
          case 'remote-mute':
            if (message.targetId === userId.current && livekitRoomRef.current) {
              const localAudio = Array.from(livekitRoomRef.current.localParticipant.audioTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Microphone);
              if (localAudio && localAudio.track) {
                localAudio.track.mute();
              }
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
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
            }
            break;
          case 'speaker-approved':
            syncedStatesRef.current = {
              ...syncedStatesRef.current,
              [message.targetId]: {
                ...syncedStatesRef.current[message.targetId],
                isApprovedSpeaker: true
              }
            };
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
            }
            if (message.targetId === userId.current && !isAdmin) {
              // Student approved — get a canPublish:true token and reconnect silently.
              // Do NOT auto-enable mic here: browsers block getUserMedia without a user gesture.
              // The student will click the mic button themselves (real gesture → works).
              setIsApprovedSpeaker(true);
              setMicAccessGranted(true); // Show notification banner
              (async () => {
                try {
                  const apiUrl = new URL('/api/livekit-token-refresh', window.location.origin).toString();
                  const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      roomName: room,
                      participantName: userName,
                      identity: userId.current,
                      canPublish: true
                    })
                  });
                  if (!res.ok) throw new Error('Failed to fetch refreshed token');
                  const data = await res.json();
                  const lkRoom = livekitRoomRef.current;
                  if (lkRoom) {
                    await lkRoom.disconnect();
                    await lkRoom.connect(data.url, data.token);
                    // isMuted stays true — student decides when to unmute
                    if (syncParticipantsRef.current) syncParticipantsRef.current();
                  }
                } catch (err) {
                  console.error('Error reconnecting with publish permissions:', err);
                }
              })();
            }
            break;
          case 'speaker-revoked':
            syncedStatesRef.current = {
              ...syncedStatesRef.current,
              [message.targetId]: {
                ...syncedStatesRef.current[message.targetId],
                isApprovedSpeaker: false
              }
            };
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
            }
            if (message.targetId === userId.current && !isAdmin) {
              // Student's speaking rights revoked — disable publishing and reconnect with canPublish: false
              setIsApprovedSpeaker(false);
              (async () => {
                try {
                  const lkRoom = livekitRoomRef.current;
                  if (lkRoom) {
                    // Unpublish all local tracks first
                    await lkRoom.localParticipant.setMicrophoneEnabled(false);
                    await lkRoom.localParticipant.setCameraEnabled(false);
                  }
                  const apiUrl = new URL('/api/livekit-token-refresh', window.location.origin).toString();
                  const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      roomName: room,
                      participantName: userName,
                      identity: userId.current,
                      canPublish: false
                    })
                  });
                  if (!res.ok) throw new Error('Failed to fetch refreshed token');
                  const data = await res.json();
                  if (lkRoom) {
                    await lkRoom.disconnect();
                    await lkRoom.connect(data.url, data.token);
                  }
                  setIsMuted(true);
                  setIsCameraOff(true);
                  setIsScreenSharing(false);
                  if (syncParticipantsRef.current) syncParticipantsRef.current();
                } catch (err) {
                  console.error('Error reconnecting after revocation:', err);
                }
              })();
            }
            break;
          // Additional custom WebSocket logic can go here...
        }
      } catch (e) { }
    };

    return () => {
      socket.close();
    };
  }, [room, userName, isAdmin]);

  // Connect to LiveKit Room
  useEffect(() => {
    let active = true;

    const connectToLiveKit = async () => {
      try {
        // Fix: Use an absolute URL for the API call to ensure it works properly regardless of current route
        // We'll construct the full URL
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

        // If unmounted while fetching, abort
        if (!active) return;

        const livekitUrl = data.url;
        const token = data.token;

        const lkRoom = new Room({
          adaptiveStream: { pixelDensity: 'screen' },
          dynacast: true,
          videoCaptureDefaults: {
            // Use ideal constraint — browser captures best quality it can without forcing 4K overhead
            resolution: { width: 1920, height: 1080, frameRate: 30 },
          },
          publishDefaults: {
            videoCodec: 'vp8',
            videoSimulcastLayers: [
              VideoPresets.h360,
              VideoPresets.h720,
              VideoPresets.h1080,
            ],
            simulcast: true,
            videoEncoding: {
              maxBitrate: 4_000_000, // 4 Mbps — reliable for 1080p without network strain
              maxFramerate: 30,
            }
          }
        });
        livekitRoomRef.current = lkRoom;

        const mediaStreamCache = new Map<string, MediaStream>();

        // Helper: sync tracks into a MediaStream without removing tracks that are already present.
        // This prevents MediaStream churn (remove+add) which causes video stutter.
        const syncTracksIntoStream = (stream: MediaStream, newTracks: MediaStreamTrack[]) => {
          const currentIds = new Set(stream.getTracks().map(t => t.id));
          const newIds = new Set(newTracks.map(t => t.id));
          // Remove tracks that are no longer needed
          stream.getTracks().forEach(t => { if (!newIds.has(t.id)) stream.removeTrack(t); });
          // Add only new tracks (skip ones already in the stream)
          newTracks.forEach(t => { if (!currentIds.has(t.id)) stream.addTrack(t); });
        };

        // Lightweight speaking state — avoids rebuilding streams when only isSpeaking changes
        const speakingIdsRef = { current: new Set<string>() };

        const buildParticipantList = () => {
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

          const localVideoTracks: MediaStreamTrack[] = [];
          const localScreenVideoTracks: MediaStreamTrack[] = [];
          const localAudioTracks: MediaStreamTrack[] = [];
          const localScreenAudioTracks: MediaStreamTrack[] = [];

          let localVideoOff = true;
          let localAudioOff = true;
          let localScreenSharing = false;

          lkRoom.localParticipant.videoTrackPublications.forEach((pub: any) => {
            if (pub.track) {
              if (pub.source === Track.Source.ScreenShare) {
                localScreenSharing = true;
                localScreenVideoTracks.push(pub.track.mediaStreamTrack);
              } else if (pub.source === Track.Source.Camera || pub.source === Track.Source.Unknown) {
                localVideoOff = false;
                localVideoTracks.push(pub.track.mediaStreamTrack);
              }
            }
          });
          lkRoom.localParticipant.audioTrackPublications.forEach((pub: any) => {
            if (pub.track) {
              if (pub.source === Track.Source.ScreenShareAudio) {
                localScreenAudioTracks.push(pub.track.mediaStreamTrack);
              } else {
                localAudioOff = false;
                localAudioTracks.push(pub.track.mediaStreamTrack);
              }
            }
          });

          syncTracksIntoStream(localMedia, [...localVideoTracks, ...localAudioTracks]);
          syncTracksIntoStream(localScreenMedia, [...localScreenVideoTracks, ...localScreenAudioTracks]);

          allParticipants.push({
            id: lkRoom.localParticipant.identity,
            name: lkRoom.localParticipant.name || userName,
            isLocal: true,
            isHost: isAdmin,
            isListener: !isAdmin,
            isApprovedSpeaker: isAdmin || syncedStatesRef.current[lkRoom.localParticipant.identity]?.isApprovedSpeaker || false,
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

            const remoteVideoTracks: MediaStreamTrack[] = [];
            const remoteScreenVideoTracks: MediaStreamTrack[] = [];
            const remoteAudioTracks: MediaStreamTrack[] = [];
            const remoteScreenAudioTracks: MediaStreamTrack[] = [];

            let videoOff = true;
            let audioOff = true;
            let screenSharing = false;

            rp.videoTrackPublications.forEach((pub: any) => {
              if (pub.track) {
                if (pub.source === Track.Source.ScreenShare) {
                  screenSharing = true;
                  remoteScreenVideoTracks.push(pub.track.mediaStreamTrack);
                } else if (pub.source === Track.Source.Camera || pub.source === Track.Source.Unknown) {
                  videoOff = false;
                  remoteVideoTracks.push(pub.track.mediaStreamTrack);
                }
              }
            });
            rp.audioTrackPublications.forEach((pub: any) => {
              if (pub.track) {
                if (pub.source === Track.Source.ScreenShareAudio) {
                  remoteScreenAudioTracks.push(pub.track.mediaStreamTrack);
                } else {
                  audioOff = false;
                  remoteAudioTracks.push(pub.track.mediaStreamTrack);
                }
              }
            });

            syncTracksIntoStream(remoteMedia, [...remoteVideoTracks, ...remoteAudioTracks]);
            syncTracksIntoStream(remoteScreenMedia, [...remoteScreenVideoTracks, ...remoteScreenAudioTracks]);

            const wsState = syncedStatesRef.current[rp.identity];

            allParticipants.push({
              id: rp.identity,
              name: rp.name || rp.identity,
              isLocal: false,
              isHost: rp.name?.includes('(Teacher)') || false,
              isListener: !rp.name?.includes('(Teacher)'),
              isApprovedSpeaker: rp.name?.includes('(Teacher)') || wsState?.isApprovedSpeaker || false,
              isMuted: audioOff,
              isCameraOff: videoOff,
              isScreenSharing: screenSharing,
              isHandRaised: wsState?.isHandRaised || false,
              isSpeaking: speakingIdsRef.current.has(rp.identity),
              stream: remoteMedia,
              screenShareStream: remoteScreenMedia
            });
          });

          // Handle WebSocket-only participants
          Object.keys(syncedStatesRef.current).forEach(wsUserId => {
            if (!allParticipants.find(p => p.id === wsUserId) && wsUserId !== userId.current) {
              allParticipants.push({
                id: wsUserId,
                name: syncedStatesRef.current[wsUserId].name || 'Student',
                isLocal: false,
                isHost: false,
                isListener: true,
                isApprovedSpeaker: false,
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

        // Lightweight speaking handler — ONLY updates the speaking set and re-renders, never touches streams
        const handleActiveSpeakers = (speakers: any[]) => {
          if (!active) return;
          speakingIdsRef.current = new Set(speakers.map((s: any) => s.identity));
          // Update only the isSpeaking field without rebuilding streams
          setParticipants(prev => prev.map(p => ({
            ...p,
            isSpeaking: !p.isLocal && speakingIdsRef.current.has(p.id)
          })));
        };

        const syncParticipants = buildParticipantList;

        // Save to global ref so WebSocket can trigger it
        syncParticipantsRef.current = syncParticipants;

        syncParticipants();

        // Track/participant events rebuild the full list (needed when streams change)
        lkRoom.on(RoomEvent.TrackSubscribed, syncParticipants);
        lkRoom.on(RoomEvent.TrackUnsubscribed, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackPublished, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackUnpublished, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantConnected, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        // Speaking changes use the lightweight handler — no stream rebuilding
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);

        await lkRoom.connect(livekitUrl, token);

        if (isAdmin) {
          // Auto publish teacher camera and mic
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

  const toggleMic = async () => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;

    // Check if we are allowed to publish (Teacher or Approved Speaker)
    if (!isAdmin && !isApprovedSpeaker) return;

    // Find local audio track
    let localAudioPub = Array.from(lk.localParticipant.audioTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Microphone);

    if (localAudioPub && localAudioPub.track) {
      if (isMuted) {
        await localAudioPub.track.unmute();
      } else {
        await localAudioPub.track.mute();
      }
      setIsMuted(!isMuted);
    } else if (isMuted) {
      // Create and publish
      await lk.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
    }
  };

  const toggleCamera = async () => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;

    if (!isAdmin && !isApprovedSpeaker) return;

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

    if (!isAdmin && !isApprovedSpeaker) return;

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
    socketRef.current?.send(JSON.stringify({
      type: 'chat',
      room,
      message
    }));
  };

  const toggleHandRaise = () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);

    // Update local state Ref for ourselves
    syncedStatesRef.current = {
      ...syncedStatesRef.current,
      [userId.current]: {
        ...syncedStatesRef.current[userId.current],
        isHandRaised: newState
      }
    };

    // Trigger LiveKit sync to update UI
    if (syncParticipantsRef.current) {
      syncParticipantsRef.current();
    }

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
    socketRef.current?.send(JSON.stringify({
      type: 'poll-created',
      room,
      poll
    }));
  };

  const votePoll = (pollId: string, optionId: string) => {
    socketRef.current?.send(JSON.stringify({
      type: 'poll-voted',
      room,
      pollId,
      optionId,
      userId: userId.current
    }));
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
    socketRef.current?.send(JSON.stringify({
      type: 'question-asked',
      room,
      question
    }));
  };

  const upvoteQuestion = (questionId: string) => {
    socketRef.current?.send(JSON.stringify({
      type: 'question-upvoted',
      room,
      questionId,
      userId: userId.current
    }));
  };

  const endMeeting = () => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'end-meeting', room }));
    if (onMeetingEndRef.current) onMeetingEndRef.current('ended-by-host');
  };

  // Admin functionalities to moderate the room
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
  const revokeSpeaker = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'speaker-revoked', room, targetId }));
  };
  const removeParticipant = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'remove-participant', room, targetId }));
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
    isApprovedSpeaker,
    micAccessGranted,
    dismissMicNotification: () => setMicAccessGranted(false),
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
    revokeSpeaker,
    removeParticipant,
    endMeeting
  };
};
