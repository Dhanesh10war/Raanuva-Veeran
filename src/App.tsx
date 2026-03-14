/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { MeetingRoom } from './components/MeetingRoom';

export default function App() {
  const [view, setView] = useState<'dashboard' | 'meeting'>(() => {
    return (sessionStorage.getItem('view') as 'dashboard' | 'meeting') || 'dashboard';
  });
  const [roomCode, setRoomCode] = useState(() => {
    return sessionStorage.getItem('roomCode') || '';
  });
  const [userName, setUserName] = useState(() => {
    return sessionStorage.getItem('userName') || 'Guest ' + Math.floor(Math.random() * 1000);
  });
  const [isAdmin, setIsAdmin] = useState(() => {
    return sessionStorage.getItem('isAdmin') === 'true';
  });

  // Handle shareable links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && room !== roomCode) {
      setRoomCode(room);
      // We no longer set view to 'meeting' directly
      // This allows the user to enter their name on the dashboard first
    }
  }, [roomCode]);

  const handleJoin = (code: string, name: string) => {
    const finalName = name.trim() || userName;
    setUserName(finalName);
    setRoomCode(code);
    setIsAdmin(false);
    setView('meeting');
    
    sessionStorage.setItem('userName', finalName);
    sessionStorage.setItem('roomCode', code);
    sessionStorage.setItem('isAdmin', 'false');
    sessionStorage.setItem('view', 'meeting');

    // Update URL without reload
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + code;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleCreate = (adminSecret: string, name: string) => {
    // Simple admin check for demo purposes
    if (adminSecret === 'admin123') {
      const finalName = name.trim() || userName;
      setUserName(finalName);
      const code = Math.random().toString(36).substr(2, 9);
      setRoomCode(code);
      setIsAdmin(true);
      setView('meeting');
      
      sessionStorage.setItem('userName', finalName);
      sessionStorage.setItem('roomCode', code);
      sessionStorage.setItem('isAdmin', 'true');
      sessionStorage.setItem('view', 'meeting');

      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + code;
      window.history.pushState({ path: newUrl }, '', newUrl);
    } else {
      alert('Invalid Admin Secret');
    }
  };

  const handleLeave = () => {
    setView('dashboard');
    setRoomCode('');
    setIsAdmin(false);
    sessionStorage.clear();
    // Clear URL
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  return (
    <div className="min-h-screen bg-zinc-950 font-sans antialiased text-zinc-100">
      {view === 'dashboard' ? (
        <Dashboard onJoin={handleJoin} onCreate={handleCreate} initialRoomCode={roomCode} />
      ) : (
        <MeetingRoom 
          roomCode={roomCode} 
          userName={userName} 
          isAdmin={isAdmin}
          onLeave={handleLeave} 
        />
      )}
    </div>
  );
}

