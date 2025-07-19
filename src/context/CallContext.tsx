import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	useRef,
	ReactNode,
} from "react";
import { CallState, ConnectionState, MediaState } from "../types";
import { useAuth } from "./AuthContext";
import axiosInstance from "../axios.config";

interface CallContextType {
	callState: CallState;
	mediaState: MediaState;
	createSession: (
		sessionName: string,
		sessionDescription: string
	) => Promise<string>;
	joinSession: (sessionId: string) => Promise<void>;
	leaveSession: () => void;
	toggleAudio: () => void;
	toggleVideo: () => void;
	toggleScreenShare: () => void;
	initiateCall: () => Promise<void>;
}

type WebSocketMessage = {
	type: 'offer' | 'answer' | 'ice-candidate';
	payload: any;
	from: string;
	to?: string;
};

const CallContext = createContext<CallContextType | undefined>(undefined);

const initialCallState: CallState = {
	sessionId: null,
	connectionState: ConnectionState.DISCONNECTED,
	error: null,
	participants: [],
};

const initialMediaState: MediaState = {
	localStream: null,
	remoteStream: null,
	audioEnabled: true,
	videoEnabled: true,
	isSharingScreen: false,
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export const CallProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const { user } = useAuth();
	const [callState, setCallState] = useState<CallState>(initialCallState);
	const [mediaState, setMediaState] = useState<MediaState>(initialMediaState);
	const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const isInitiator = useRef<boolean>(false);
	const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const remoteStreamRef = useRef<MediaStream | null>(null);
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
	// const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
	// const recordedChunksRef = useRef<Blob[]>([]);
	// const recordingIntervalRef = useRef<number | null>(null);
	// const recordingStartTimeRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			cleanupMediaDevices();
			if (wsRef.current) wsRef.current.close();
		};
	}, []);

	const connectWebSocket = (sessionId: string) => {
		const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
		const wsUrl = backendUrl.replace(/^http/, 'ws');
		const ws = new WebSocket(`${wsUrl}/api/v1/ws?studioId=${sessionId}&userId=${user?.id}`);

		ws.onopen = () => {
			setCallState(prev => ({ ...prev, connectionState: ConnectionState.CONNECTED }));
		};

		ws.onmessage = async (event) => {
			const message: WebSocketMessage = JSON.parse(event.data);
			if (message.from === user?.id) return;
			setRemotePeerId(message.from);
			switch (message.type) {
				case 'offer':
					console.log('offer received !!');
					await handleOffer(message.payload, message.from);
					break;
				case 'answer':
					console.log('answer received !!');
					await handleAnswer(message.payload);
					break;
				case 'ice-candidate':
					await handleIceCandidate(message.payload);
					break;
				default:
					break;
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
			setCallState(prev => ({ ...prev, error: 'WebSocket connection error', connectionState: ConnectionState.ERROR }));
		};

		ws.onclose = () => {
			setCallState(prev => ({ ...prev, connectionState: ConnectionState.DISCONNECTED }));
		};

		wsRef.current = ws;
	};

	const sendWebSocketMessage = (message: WebSocketMessage) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ ...message, from: user?.id, to: message.to || remotePeerId }));
		}
	};

	const cleanupMediaDevices = () => {
		if (localStreamRef.current) {
			localStreamRef.current.getTracks().forEach(track => track.stop());
			localStreamRef.current = null;
		}
		if (remoteStreamRef.current) {
			remoteStreamRef.current.getTracks().forEach(track => track.stop());
			remoteStreamRef.current = null;
		}
		if (peerConnectionRef.current) {
			peerConnectionRef.current.close();
			peerConnectionRef.current = null;
		}
		setPeerConnection(null);
		setMediaState(initialMediaState);
	};

	const initializeMediaDevices = async (): Promise<MediaStream> => {
		cleanupMediaDevices();
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
			video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
		});
		localStreamRef.current = stream;
		setMediaState(prev => ({ ...prev, localStream: stream, audioEnabled: true, videoEnabled: true }));
		return stream;
	};

	const createPeerConnection = () => {
		const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
		
		// Add local tracks
		if (localStreamRef.current) {
			localStreamRef.current.getTracks().forEach(track => {
				console.log('Adding local track:', track.kind);
				pc.addTrack(track, localStreamRef.current!);
			});
		}
		
		// Handle remote tracks
		pc.ontrack = (event) => {
			console.log('Received remote track:', event.track.kind);
			console.log('Remote streams:', event.streams);
			
			if (event.streams && event.streams[0]) {
				// Use the stream directly from the event
				const remoteStream = event.streams[0];
				console.log('Setting remote stream with tracks:', remoteStream.getTracks().map(t => t.kind));
				setMediaState(prev => ({ ...prev, remoteStream }));
			} else {
				// Fallback: create stream from individual tracks
				if (!remoteStreamRef.current) {
					remoteStreamRef.current = new MediaStream();
				}
				remoteStreamRef.current.addTrack(event.track);
				console.log('Added track to remote stream, total tracks:', remoteStreamRef.current.getTracks().length);
				setMediaState(prev => ({ ...prev, remoteStream: remoteStreamRef.current! }));
			}
		};
		
		// ICE candidates
		pc.onicecandidate = (event) => {
			if (event.candidate) {
				console.log('Sending ICE candidate');
				sendWebSocketMessage({ type: 'ice-candidate', payload: event.candidate, from: user?.id || '', to: remotePeerId || undefined });
			}
		};
		
		// Connection state changes
		pc.oniceconnectionstatechange = () => {
			console.log('ICE connection state:', pc.iceConnectionState);
			if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
				console.log('WebRTC connection established!');
			}
		};
		
		peerConnectionRef.current = pc;
		setPeerConnection(pc);
		return pc;
	};

	const handleOffer = async (offer: RTCSessionDescriptionInit, from: string) => {
		console.log('Handling offer from:', from);
		
		// If no peer connection exists, create one
		if (!peerConnectionRef.current) {
			console.log('Creating new peer connection for offer');
			createPeerConnection();
		}
		
		// Get the current peer connection
		const pc = peerConnectionRef.current;
		if (!pc) {
			console.error('Failed to create peer connection');
			return;
		}
		
		try {
			console.log('Setting remote description from offer');
			await pc.setRemoteDescription(new RTCSessionDescription(offer));
			
			console.log('Creating answer');
			const answer = await pc.createAnswer();
			
			console.log('Setting local description');
			await pc.setLocalDescription(answer);
			
			console.log('Sending answer');
			sendWebSocketMessage({ type: 'answer', payload: answer, from: user?.id || '', to: from });
		} catch (error) {
			console.error('Error handling offer:', error);
		}
	};

	const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
		console.log('Handling answer');
		const pc = peerConnectionRef.current;
		if (!pc) {
			console.error('No peer connection available for answer');
			return;
		}
		
		try {
			console.log('Setting remote description from answer');
			await pc.setRemoteDescription(new RTCSessionDescription(answer));
			console.log('Answer processed successfully');
		} catch (error) {
			console.error('Error handling answer:', error);
		}
	};

	const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
		console.log('Handling ICE candidate');
		const pc = peerConnectionRef.current;
		if (!pc) {
			console.error('No peer connection available for ICE candidate');
			return;
		}
		
		try {
			await pc.addIceCandidate(new RTCIceCandidate(candidate));
			console.log('ICE candidate added successfully');
		} catch (error) {
			console.error('Error adding ICE candidate:', error);
		}
	};

	const createSession = async (sessionName: string, sessionDescription: string): Promise<string> => {
		setCallState({ ...initialCallState, connectionState: ConnectionState.CONNECTING });
		await initializeMediaDevices();
		const token = localStorage.getItem('authToken');
		const session = await axiosInstance.post('api/v1/studio/create', { name: sessionName, description: sessionDescription }, { headers: { Authorization: `Bearer ${token}` } });
		const sessionData = session.data?.session;
		isInitiator.current = true;
		createPeerConnection();
		connectWebSocket(sessionData.id);
		setCallState({ sessionId: sessionData.id, session: { id: sessionData.id, name: sessionData.name, description: sessionData.description }, connectionState: ConnectionState.CONNECTED, error: null, participants: user ? [user] : [] });
		return sessionData.id;
	};

	const joinSession = async (sessionId: string): Promise<void> => {
		setCallState({ ...initialCallState, sessionId, connectionState: ConnectionState.CONNECTING });
		await initializeMediaDevices();
		const token = localStorage.getItem('authToken');
		const session = await axiosInstance.post('api/v1/studio/join', { session_id: sessionId }, { headers: { Authorization: `Bearer ${token}` } });
		const sessionData = session.data?.session?.session;
		isInitiator.current = false;
		createPeerConnection();
		connectWebSocket(sessionId);
		setCallState({ sessionId: sessionData.id, session: { id: sessionData.id, name: sessionData.Name, description: sessionData.Description }, connectionState: ConnectionState.CONNECTED, error: null, participants: [user, sessionData.host] });
	};

	const initiateCall = async () => {
		// Start recording only when user joins the call
		// if (mediaState.localStream && callState.sessionId) {
		// 	startRecording(mediaState.localStream);
		// }
		const pc = peerConnectionRef.current;
		if (!pc || !callState.sessionId) {
			console.log('peer connection not available !!');
			return;
		}

		isInitiator.current = true;
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		sendWebSocketMessage({ type: 'offer', payload: offer, from: user?.id || '', to: remotePeerId || undefined });
		console.log('offer sent !!');
	};

	const leaveSession = (): void => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		cleanupMediaDevices();
		setPeerConnection(null);
		setCallState(initialCallState);
		setMediaState(initialMediaState);
		isInitiator.current = false;
		// stopRecording(); // Stop recording when leaving session
	};

	const toggleAudio = (): void => {
		if (localStreamRef.current) {
			const audioTrack = localStreamRef.current.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !audioTrack.enabled;
				setMediaState(prev => ({ ...prev, audioEnabled: audioTrack.enabled }));
			}
		}
	};

	const toggleVideo = (): void => {
		if (localStreamRef.current) {
			const videoTrack = localStreamRef.current.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = !videoTrack.enabled;
				setMediaState(prev => ({ ...prev, videoEnabled: videoTrack.enabled }));
			}
		}
	};

	const toggleScreenShare = async (): Promise<void> => {
		try {
			if (!mediaState.isSharingScreen) {
				const screenStream = await navigator.mediaDevices.getDisplayMedia({
					video: true,
				});

				if (localStreamRef.current && peerConnection) {
					const videoTrack = localStreamRef.current.getVideoTracks()[0];
					const screenTrack = screenStream.getVideoTracks()[0];

					if (videoTrack && screenTrack) {
						const sender = peerConnection.getSenders().find(
							(s) => s.track && s.track.kind === "video"
						);
						
						if (sender) {
							await sender.replaceTrack(screenTrack);
							localStreamRef.current.removeTrack(videoTrack);
							localStreamRef.current.addTrack(screenTrack);

							screenTrack.onended = async () => {
								const newVideoTrack = await navigator.mediaDevices.getUserMedia({ video: true })
									.then(stream => stream.getVideoTracks()[0]);
								
								if (sender && newVideoTrack) {
									await sender.replaceTrack(newVideoTrack);
									localStreamRef.current?.removeTrack(screenTrack);
									localStreamRef.current?.addTrack(newVideoTrack);
								}
								
								setMediaState(prev => ({
									...prev,
									isSharingScreen: false,
								}));
							};

							setMediaState(prev => ({
								...prev,
								isSharingScreen: true,
							}));
						}
					}
				}
			} else {
				const newVideoTrack = await navigator.mediaDevices.getUserMedia({ video: true })
					.then(stream => stream.getVideoTracks()[0]);

				if (localStreamRef.current && peerConnection && newVideoTrack) {
					const sender = peerConnection.getSenders().find(
						(s) => s.track && s.track.kind === "video"
					);
					
					if (sender) {
						await sender.replaceTrack(newVideoTrack);
						const oldTrack = localStreamRef.current.getVideoTracks()[0];
						localStreamRef.current.removeTrack(oldTrack);
						localStreamRef.current.addTrack(newVideoTrack);
						oldTrack.stop();
					}

					setMediaState(prev => ({
						...prev,
						isSharingScreen: false,
					}));
				}
			}
		} catch (error) {
			console.error("Error toggling screen share:", error);
		}
	};

	// Function to send recorded chunk to backend
	// const sendChunkToBackend = async (chunk: Blob, offsetTimestamp: number) => {
	// 	console.log('Sending chunk to backend, size:', chunk.size, 'timestamp:', offsetTimestamp);
	// 	try {
	// 		const token = localStorage.getItem('authToken');
	// 		const formData = new FormData();
	// 		formData.append('sessionId', callState.sessionId || '');
	// 		formData.append('userId', user?.id || '');
	// 		formData.append('chunk', chunk, `recording-${Date.now()}.webm`);
	// 		formData.append('timestamp', offsetTimestamp.toString());
	// 		await axiosInstance.post('api/v1/stream/upload', formData, {
	// 			headers: {
	// 				Authorization: `Bearer ${token}`,
	// 				'Content-Type': 'multipart/form-data',
	// 			},
	// 		});
	// 	} catch (error) {
	// 		console.error('Failed to upload chunk:', error);
	// 	}
	// };

	// Start recording local stream
	// const startRecording = (stream: MediaStream) => {
	// 	console.log('Starting recording with stream:', stream);
	// 	if (mediaRecorder) {
	// 		mediaRecorder.stop();
	// 	}
	// 	const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8,opus' });
	// 	recordingStartTimeRef.current = Date.now();
	
	// 	recorder.ondataavailable = (event) => {
	// 		console.log('ondataavailable event:', event);
	// 		if (event.data && event.data.size > 0 && recordingStartTimeRef.current) {
	// 			const offset = Date.now() - recordingStartTimeRef.current;
	// 			sendChunkToBackend(event.data, offset);
	// 		}
	// 	};
	
	// 	recorder.onstop = async () => {
	// 		// No need to send anything here, all chunks are handled in ondataavailable
	// 	};
	
	// 	recorder.start(10000); // Fire ondataavailable every 10 seconds
	// 	setMediaRecorder(recorder);
	// };

	// Stop recording and clear interval
	// const stopRecording = () => {
	// 	if (mediaRecorder) {
	// 		mediaRecorder.stop();
	// 		setMediaRecorder(null);
	// 	}
	// 	if (recordingIntervalRef.current) {
	// 		clearInterval(recordingIntervalRef.current);
	// 		recordingIntervalRef.current = null;
	// 	}
	// 	recordingStartTimeRef.current = null;
	// };

	// Start/stop recording based on localStream
	useEffect(() => {
		// REMOVE or COMMENT OUT this block
		// if (mediaState.localStream && callState.sessionId) {
		//   startRecording(mediaState.localStream);
		// } else {
		//   stopRecording();
		// }
		// return () => {
		//   stopRecording();
		// };
	}, [mediaState.localStream, callState.sessionId]);

	return (
		<CallContext.Provider
			value={{
				callState,
				mediaState,
				createSession,
				joinSession,
				leaveSession,
				toggleAudio,
				toggleVideo,
				toggleScreenShare,
				initiateCall,
			}}
		>
			{children}
		</CallContext.Provider>
	);
};

export const useCall = (): CallContextType => {
	const context = useContext(CallContext);
	if (context === undefined) {
		throw new Error("useCall must be used within a CallProvider");
	}
	return context;
};