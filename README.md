# Raanuva Veeran Virtual Classroom

A modern, high-performance virtual classroom and live streaming platform designed for Raanuva Veeran Spoken Hindi Academy. Built with a React frontend, a Node.js Express backend, and powered by LiveKit for real-time WebRTC video/audio streaming.

## Features

- **Live Streaming & Video Conferencing**: Hosts (Teachers) stream high-quality 1080p video while Students tune in with adaptive bitrates.
- **Admin Controls**: Strict host authorization. Hosts can mute participants, lower hands, approve speakers, and remove disruptive users.
- **Interactive Q&A & Polls**: Dedicated sidebar modules for real-time student Q&A (with upvoting) and interactive Polls. Single-vote enforcement built-in.
- **Dynamic Hand Raising**: Students can virtually raise their hands. Hosts are notified instantly and can approve students to speak (unmuting them).
- **Responsive Web UI**: Stunning dark-mode UI built with Tailwind CSS v4, featuring glassmorphic overlays and smooth animations via Motion.
- **Graceful Exits**: Admin actions to end the entire meeting securely redirect all connected students to a dedicated Exit Page.

## Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide React, Motion
- **Backend**: Node.js, Express, WebSocket (`ws`)
- **Real-Time Video/Audio**: [LiveKit](https://livekit.io/) (via `@livekit/components-react` and `livekit-server-sdk`)
- **Language**: TypeScript throughout for end-to-end type safety.

## Getting Started (Local Development)

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- A [LiveKit Cloud](https://cloud.livekit.io/) account (or local LiveKit instance)

### 2. Environment Variables
Create a `.env` file in the root directory and add your LiveKit credentials:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
PORT=3000
```

### 3. Installation
Install the project dependencies (which includes both React frontend and Express backend requirements):

```bash
npm install
```

### 4. Running the App
Start the development server. This utilizes `tsx` to run the `server.ts` Express file, which in turn automatically handles Vite middleware for hot-module reloading of the React app.

```bash
npm run dev
```

Navigate to `http://localhost:3000` in your browser.

## Deployment (Hostinger VPS)

This application requires Node.js and persistent WebSocket connections, so a **VPS (Virtual Private Server)** is needed. A shared web hosting plan will not work.

1. **Build the production frontend:**
   ```bash
   npm run build
   ```

2. **Provision a VPS:**
   Purchase a KVM VPS (Ubuntu 22.04 or 24.04 recommended) from Hostinger.

3. **Install Dependencies on VPS via SSH:**
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git

   # Install PM2 (Process Manager)
   npm install -g pm2
   ```

4. **Clone & Setup:**
   - Clone this repository to your VPS.
   - Run `npm install` and `npm run build` on the server.
   - Create the `.env` file on the server with your production credentials.
   - Set `PORT=80` in the `.env` so it binds to the default HTTP port.

5. **Run in Production:**
   Use PM2 to keep the `server.ts` process alive forever:
   ```bash
   pm2 start "npx tsx server.ts" --name "raanuva-veeran"
   pm2 save
   pm2 startup
   ```

---
*Developed for Raanuva Veeran Spoken Hindi Academy.*
