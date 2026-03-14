export interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isHandRaised?: boolean;
  isSpeaking?: boolean;
  isLocal?: boolean;
  isHost?: boolean;
  isListener?: boolean;
  isApprovedSpeaker?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

export interface Poll {
  id: string;
  question: string;
  options: { id: string; text: string; votes: number }[];
  isOpen: boolean;
  creatorId: string;
}

export interface Question {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  upvotes: number;
  isAnswered: boolean;
}
