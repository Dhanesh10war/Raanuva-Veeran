import { useState, useEffect, useCallback, useRef } from 'react';
import { Participant, ChatMessage, Poll, Question } from '../types';
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';

export const useWebRTC = (room: string, userName: string, isAdmin: boolean = false, onMeetingEnd?: (reason?: string) => void) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isMuted, setIsMuted] = useState(!isAdmin); // Students start muted
  const [isCameraOff, setIsCameraOff] = useState(!isAdmin); // Students start cam off
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isHost, setIsHost] = useState(isAdmin);

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
                isApprovedSpeaker: message.isApproved
              }
            };
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
            }
            if (message.targetId === userId.current) {
              // User approved visually in the UI. 
              // Future improvement: Trigger a reconnect to LiveKit with a new token that has `canPublish: true`.
              console.log("Approved to speak by Host.");
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
          adaptiveStream: { pixelDensity: 'screen' }, // Optimize for sharpness
          dynacast: true,
          videoCaptureDefaults: {
            resolution: VideoPresets.h1080.resolution,
          },
          publishDefaults: {
            videoCodec: 'vp8',
            videoSimulcastLayers: [
              VideoPresets.h360,
              VideoPresets.h720,
              VideoPresets.h1080,
            ],
            // Ensure simulcast is enabled so it scales up to 1080p
            simulcast: true,
            // Force primary encoding to be 1080p with high bitrate
            videoEncoding: {
              maxBitrate: 3_000_000, // 3 Mbps
              maxFramerate: 30,
            }
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

          // Only add self if publishing (or if Teacher)
          allParticipants.push({
            id: lkRoom.localParticipant.identity,
            name: lkRoom.localParticipant.name || userName,
            isLocal: true,
            isHost: isAdmin,
            isListener: !isAdmin,
            isApprovedSpeaker: isAdmin,
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

            // Merge synced states from WebSocket using the ref to always get latest without re-running effect
            const wsState = syncedStatesRef.current[rp.identity];

            allParticipants.push({
              id: rp.identity,
              name: rp.name || rp.identity,
              isLocal: false,
              isHost: rp.name?.includes('(Teacher)') || false,
              isListener: !rp.name?.includes('(Teacher)'),
              isApprovedSpeaker: rp.name?.includes('(Teacher)') || false,
              isMuted: audioOff,
              isCameraOff: videoOff,
              isScreenSharing: screenSharing,
              isHandRaised: wsState?.isHandRaised || false,
              isSpeaking: rp.isSpeaking,
              stream: remoteMedia,
              screenShareStream: remoteScreenMedia
            });
          });

          // Handle WebSocket-only participants (e.g. Students who joined chat but don't have LiveKit tracks)
          Object.keys(syncedStatesRef.current).forEach(wsUserId => {
            // If they aren't already in the list (because they aren't publishing anything to LiveKit)
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
                stream: new MediaStream() // Empty stream for UI consistency
              });
            }
          });

          setParticipants(allParticipants);
        };

        // Save to global ref so WebSocket can trigger it
        syncParticipantsRef.current = syncParticipants;

        // Trigger a sync manually if states changed
        syncParticipants();

        // Event listeners
        lkRoom.on(RoomEvent.TrackSubscribed, syncParticipants);
        lkRoom.on(RoomEvent.TrackUnsubscribed, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackPublished, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackUnpublished, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantConnected, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, syncParticipants);

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
    if (!isAdmin) return;

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
    endMeeting
  };
};
