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
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);

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
          case 'remote-video-off':
            if (message.targetId === userId.current && livekitRoomRef.current) {
              const localVideo = Array.from(livekitRoomRef.current.localParticipant.videoTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Camera);
              if (localVideo && localVideo.track) {
                localVideo.track.mute();
              }
              setIsCameraOff(true);
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
              setIsApprovedSpeaker(true);
              setMicAccessGranted(true);
              // LiveKit SFU permission is granted server-side via RoomServiceClient.updateParticipant.
              // The LiveKit client SDK automatically receives the permission update — no reconnect needed.
              // Student just needs to click the mic button (real user gesture).
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
              setIsApprovedSpeaker(false);
              // LiveKit SFU permission is revoked server-side. The SDK applies it automatically.
              // Disable local tracks immediately so the student stops broadcasting.
              const lkRoom = livekitRoomRef.current;
              if (lkRoom) {
                lkRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {});
                lkRoom.localParticipant.setCameraEnabled(false).catch(() => {});
              }
              setIsMuted(true);
              setIsCameraOff(true);
              setIsScreenSharing(false);
            }
            break;
            
          case 'user-joined':
            syncedStatesRef.current = {
              ...syncedStatesRef.current,
              [message.userId]: {
                name: message.name,
                isAdmin: message.isAdmin,
                isApprovedSpeaker: false,
                isHandRaised: false,
                isSpeaking: false
              }
            };
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
            }
            break;

          case 'participants-list':
            const newList: any = { ...syncedStatesRef.current };
            message.participants.forEach((p: any) => {
              newList[p.userId] = {
                name: p.name,
                isAdmin: p.isAdmin,
                isApprovedSpeaker: newList[p.userId]?.isApprovedSpeaker || false,
                isHandRaised: newList[p.userId]?.isHandRaised || false,
                isSpeaking: newList[p.userId]?.isSpeaking || false
              };
            });
            syncedStatesRef.current = newList;
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
            }
            break;

          case 'user-left':
            const updatedStates = { ...syncedStatesRef.current };
            delete updatedStates[message.userId];
            syncedStatesRef.current = updatedStates;
            
            // Also need to explicitly filter out from participants array if they haven't connected to LiveKit
            setParticipants(prev => prev.filter(p => p.id !== message.userId));
            
            if (syncParticipantsRef.current) {
              syncParticipantsRef.current();
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
          // We disable adaptiveStream because we are manually attaching MediaStreams to video tags, 
          // which prevents LiveKit from measuring the video element size, leading to lowest quality simulcast.
          adaptiveStream: false,
          dynacast: true,
          videoCaptureDefaults: {
            // 1080p at 30fps — VP9 codec makes this viable without lag
            resolution: { width: 1920, height: 1080, frameRate: 30 },
          },
          publishDefaults: {
            // VP9 delivers ~2x better quality than VP8 at the same bitrate,
            // meaning we get sharp 1080p@30fps without excessive network load.
            videoCodec: 'vp9',
            videoSimulcastLayers: [
              VideoPresets.h360,
              VideoPresets.h720,
              VideoPresets.h1080,
            ],
            simulcast: true,
            videoEncoding: {
              maxBitrate: 3_000_000, // 3 Mbps with VP9 = equivalent to ~6 Mbps with VP8
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
                  // A track exists but may be explicitly paused/muted by the student
                  if (!pub.isMuted && !pub.track.isMuted) {
                    videoOff = false;
                  }
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

        lkRoom.on(RoomEvent.TrackMuted, syncParticipants);
        lkRoom.on(RoomEvent.TrackUnmuted, syncParticipants);
        lkRoom.on(RoomEvent.TrackSubscribed, syncParticipants);
        lkRoom.on(RoomEvent.TrackUnsubscribed, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackPublished, syncParticipants);
        lkRoom.on(RoomEvent.LocalTrackUnpublished, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantConnected, syncParticipants);
        lkRoom.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        // If we are a student, we must manually subscribe ONLY to the Admin's tracks.
        lkRoom.on(RoomEvent.TrackPublished, (pub: any, participant) => {
          if (!isAdmin) {
            // Subscribe if the participant is a Teacher (Host)
            if (participant.name?.includes('(Teacher)')) {
              if (pub.setSubscribed) pub.setSubscribed(true);
            }
          }
        });

        // Speaking changes use the lightweight handler — no stream rebuilding
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);

        await lkRoom.connect(livekitUrl, token, { autoSubscribe: isAdmin });

        // Subscribe to existing Teacher tracks if a student joins after the teacher
        if (!isAdmin) {
          lkRoom.remoteParticipants.forEach((p) => {
            if (p.name?.includes('(Teacher)')) {
              p.getTrackPublications().forEach((pub: any) => {
                if (pub.setSubscribed) pub.setSubscribed(true);
              });
            }
          });
        }

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

    // Fetch available devices
    const fetchDevices = async () => {
      try {
        const devices = await Room.getLocalDevices('videoinput');
        setAvailableCameras(devices);
        if (devices.length > 0 && !activeCameraId) {
          setActiveCameraId(devices[0].deviceId);
        }
      } catch (error) {
        console.error("Failed to enumerate devices:", error);
      }
    };
    
    // Fetch available devices for everyone since anyone can start camera
    fetchDevices();
    navigator.mediaDevices?.addEventListener('devicechange', fetchDevices);

    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener('devicechange', fetchDevices);
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
      }
    };
  }, [room, userName, isAdmin, isApprovedSpeaker]); // Add isApprovedSpeaker to dependencies so we fetch devices when approved

  const toggleMic = async () => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;

    // Anyone can publish mic now

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

  const switchCamera = async (deviceId: string) => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;
    // Anyone can publish camera now
    
    setActiveCameraId(deviceId);
    
    try {
      await lk.switchActiveDevice('videoinput', deviceId);
      // Ensure the camera stream is enabled if it wasn't already
      if (isCameraOff) {
        const publication = await lk.localParticipant.setCameraEnabled(true);
        if (publication && publication.track) {
          (publication.track.mediaStreamTrack as any).contentHint = 'detail';
        }
        setIsCameraOff(false);
      }
    } catch (err) {
      console.error("Failed to switch camera:", err);
    }
  };

  const toggleCamera = async () => {
    if (!livekitRoomRef.current) return;
    const lk = livekitRoomRef.current;

    // Anyone can publish camera now

    let localVideoPub = Array.from(lk.localParticipant.videoTrackPublications.values() as IterableIterator<any>).find(p => p.source === Track.Source.Camera);

    if (localVideoPub && localVideoPub.track) {
      if (isCameraOff) {
        await localVideoPub.track.unmute();
      } else {
        await localVideoPub.track.mute();
      }
      setIsCameraOff(!isCameraOff);
    } else if (isCameraOff) {
      const publication = await lk.localParticipant.setCameraEnabled(true);
      if (publication && publication.track) {
        (publication.track.mediaStreamTrack as any).contentHint = 'detail';
      }
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
  const stopVideo = (targetId: string) => {
    if (!isAdmin) return;
    socketRef.current?.send(JSON.stringify({ type: 'remote-video-off', room, targetId }));
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
    availableCameras,
    activeCameraId,
    dismissMicNotification: () => setMicAccessGranted(false),
    toggleMic,
    toggleCamera,
    switchCamera,
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
    endMeeting
  };
};
