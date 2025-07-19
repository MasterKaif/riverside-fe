import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video as VideoIcon, VideoOff, Phone, Share, PhoneCall } from 'lucide-react';
import { useCall } from '../context/CallContext';
import { ConnectionState } from '../types';

const VideoRoom: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    callState,
    mediaState,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    leaveSession,
    initiateCall,
  } = useCall();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isCallStarted, setIsCallStarted] = useState(false);
  
  useEffect(() => {
    if (mediaState.localStream && localVideoRef.current) {
      console.log('Setting local video stream');
      localVideoRef.current.srcObject = mediaState.localStream;
    }
  }, [mediaState.localStream]);
  
  useEffect(() => {
    console.log('Remote stream changed:', mediaState.remoteStream);
    if (mediaState.remoteStream && remoteVideoRef.current) {
      console.log('Setting remote video stream with tracks:', mediaState.remoteStream.getTracks().map(t => t.kind));
      remoteVideoRef.current.srcObject = mediaState.remoteStream;
      setIsCallStarted(true);
    }
  }, [mediaState.remoteStream]);
  
  const handleLeaveCall = () => {
    leaveSession();
    navigate('/dashboard');
  };
  
  const handleStartCall = async () => {
    try {
      await initiateCall();
      setIsCallStarted(true);
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };
  
  const copySessionId = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      alert('Session ID copied to clipboard');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <header className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-white font-medium">Video Conference</h1>
          <div className="ml-4 flex items-center">
            <span className="text-gray-300 text-sm mr-2">Session ID:</span>
            <span className="bg-gray-700 text-gray-100 px-3 py-1 rounded text-sm font-mono">
              {sessionId}
            </span>
            <button
              onClick={copySessionId}
              className="ml-2 text-gray-400 hover:text-gray-200 text-xs underline"
            >
              Copy
            </button>
          </div>
        </div>
        <div className="text-gray-400 text-sm">
          {callState.connectionState === ConnectionState.CONNECTING ? (
            <span className="flex items-center">
              <span className="h-2 w-2 bg-yellow-400 rounded-full mr-2 animate-pulse"></span>
              Connecting...
            </span>
          ) : callState.connectionState === ConnectionState.CONNECTED ? (
            <span className="flex items-center">
              <span className="h-2 w-2 bg-green-400 rounded-full mr-2"></span>
              Connected
            </span>
          ) : callState.connectionState === ConnectionState.ERROR ? (
            <span className="flex items-center">
              <span className="h-2 w-2 bg-red-500 rounded-full mr-2"></span>
              Connection error
            </span>
          ) : (
            <span className="flex items-center">
              <span className="h-2 w-2 bg-gray-400 rounded-full mr-2"></span>
              Disconnected
            </span>
          )}
        </div>
      </header>
      
      <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 relative overflow-hidden">
        <div className={`${mediaState.remoteStream ? 'md:w-1/2' : 'w-full'} h-full relative rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center shadow-lg transition-all duration-300`}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!mediaState.videoEnabled && 'hidden'}`}
          />
          {!mediaState.videoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="h-20 w-20 rounded-full bg-gray-700 flex items-center justify-center">
                <span className="text-2xl text-gray-300">You</span>
              </div>
            </div>
          )}
          <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 py-1 px-2 rounded-md text-sm">
            You {!mediaState.audioEnabled && '(muted)'}
          </div>
        </div>
        
        {mediaState.remoteStream ? (
          <div className="md:w-1/2 h-full relative rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center shadow-lg">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 py-1 px-2 rounded-md text-sm">
              Remote User
            </div>
          </div>
        ) : callState.connectionState === ConnectionState.CONNECTED && !isCallStarted ? (
          <div className="md:w-1/2 h-full relative rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center shadow-lg">
            <div className="text-center">
              <button
                onClick={handleStartCall}
                className="inline-flex items-center px-6 py-3 border border-transparent text-lg font-medium rounded-full text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <PhoneCall className="mr-2 h-6 w-6" />
                Join Call
              </button>
              <p className="mt-4 text-gray-400">Click to join the video call</p>
            </div>
          </div>
        ) : null}
        
        {callState.connectionState === ConnectionState.CONNECTING && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
              <p className="mt-4 text-white text-lg">Connecting to session...</p>
            </div>
          </div>
        )}
        
        {callState.connectionState === ConnectionState.ERROR && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
            <div className="text-center max-w-md p-6 bg-gray-800 rounded-lg">
              <div className="h-12 w-12 rounded-full bg-red-100 mx-auto flex items-center justify-center">
                <Phone className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="mt-4 text-white text-lg font-medium">Connection Error</h3>
              <p className="mt-2 text-gray-300">{callState.error || 'Failed to connect. Please try again later.'}</p>
              <button
                onClick={handleLeaveCall}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-center space-x-4">
        <button
          onClick={toggleAudio}
          className={`p-3 rounded-full focus:outline-none transition-colors duration-200 ${
            mediaState.audioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'
          }`}
          title={mediaState.audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {mediaState.audioEnabled ? (
            <Mic className="h-6 w-6 text-white" />
          ) : (
            <MicOff className="h-6 w-6 text-white" />
          )}
        </button>
        
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full focus:outline-none transition-colors duration-200 ${
            mediaState.videoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'
          }`}
          title={mediaState.videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {mediaState.videoEnabled ? (
            <VideoIcon className="h-6 w-6 text-white" />
          ) : (
            <VideoOff className="h-6 w-6 text-white" />
          )}
        </button>
        
        <button
          onClick={toggleScreenShare}
          className={`p-3 rounded-full focus:outline-none transition-colors duration-200 ${
            mediaState.isSharingScreen ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={mediaState.isSharingScreen ? 'Stop sharing screen' : 'Share screen'}
        >
          <Share className="h-6 w-6 text-white" />
        </button>
        
        <button
          onClick={handleLeaveCall}
          className="p-3 rounded-full bg-red-600 hover:bg-red-500 focus:outline-none transition-colors duration-200"
          title="Leave call"
        >
          <Phone className="h-6 w-6 text-white transform rotate-135" />
        </button>
      </div>
    </div>
  );
};

export default VideoRoom;