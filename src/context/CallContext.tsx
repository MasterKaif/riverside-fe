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

interface WebSocketMessage {
	type: 'offer' | 'answer' | 'ice-candidate';
	payload: any;
	from: string;
	to?: string;
}

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

export const CallProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const { user } = useAuth();
	const [callState, setCallState] = useState<CallState>(initialCallState);
	const [mediaState, setMediaState] = useState<MediaState>(initialMediaState);
	const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		return () => {
			cleanupMediaDevices();
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, []);

	const connectWebSocket = (studioId: string) => {
		const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
		const wsUrl = backendUrl.replace(/^http/, 'ws');
		const ws = new WebSocket(`${wsUrl}/api/v1/ws?studioId=${studioId}&userId=${user?.id}`);

		ws.onopen = () => {
			console.log('WebSocket connected');
		};

		ws.onmessage = async (event) => {
			const message: WebSocketMessage = JSON.parse(event.data);
			
			switch (message.type) {
				case 'offer':
					if (peerConnection) {
						await handleOffer(message.payload);
					}
					break;
				case 'answer':
					if (peerConnection) {
						await handleAnswer(message.payload);
					}
					break;
				case 'ice-candidate':
					if (peerConnection) {
						await handleIceCandidate(message.payload);
					}
					break;
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
			setCallState(prev => ({
				...prev,
				error: 'WebSocket connection error',
				connectionState: ConnectionState.ERROR,
			}));
		};

		wsRef.current = ws;
	};

	const sendWebSocketMessage = (message: WebSocketMessage) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(message));
		}
	};

	const handleOffer = async (offer: RTCSessionDescriptionInit) => {
		if (!peerConnection) return;

		try {
			await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
			const answer = await peerConnection.createAnswer();
			await peerConnection.setLocalDescription(answer);

			sendWebSocketMessage({
				type: 'answer',
				payload: answer,
				from: user?.id || '',
			});
		} catch (error) {
			console.error('Error handling offer:', error);
		}
	};

	const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
		if (!peerConnection) return;

		try {
			await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
		} catch (error) {
			console.error('Error handling answer:', error);
		}
	};

	const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
		if (!peerConnection) return;

		try {
			await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
		} catch (error) {
			console.error('Error handling ICE candidate:', error);
		}
	};

	const cleanupMediaDevices = () => {
		if (mediaState.localStream) {
			mediaState.localStream.getTracks().forEach((track) => {
				track.stop();
			});
		}
		if (peerConnection) {
			peerConnection.close();
		}
	};

	const initializeMediaDevices = async (): Promise<MediaStream> => {
		try {
			cleanupMediaDevices();

			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: {
					width: { ideal: 1280 },
					height: { ideal: 720 },
					facingMode: "user"
				}
			});

			stream.getTracks().forEach(track => {
				track.enabled = true;
			});

			setMediaState(prev => ({
				...prev,
				localStream: stream,
				audioEnabled: true,
				videoEnabled: true
			}));

			return stream;
		} catch (error) {
			console.error("Error accessing media devices:", error);
			setCallState(prev => ({
				...prev,
				error: "Failed to access camera and microphone. Please check permissions.",
				connectionState: ConnectionState.ERROR,
			}));
			throw error;
		}
	};

	const initializePeerConnection = (stream: MediaStream): RTCPeerConnection => {
		if (peerConnection) {
			peerConnection.close();
		}

		const pc = new RTCPeerConnection({
			iceServers: [
				{ urls: "stun:stun.l.google.com:19302" },
				{ urls: "stun:stun1.l.google.com:19302" },
			],
		});

		stream.getTracks().forEach((track) => {
			pc.addTrack(track, stream);
		});

		pc.ontrack = (event) => {
			if (event.streams && event.streams[0]) {
				setMediaState(prev => ({
					...prev,
					remoteStream: event.streams[0]
				}));
			}
		};

		pc.onicecandidate = (event) => {
			if (event.candidate) {
				sendWebSocketMessage({
					type: 'ice-candidate',
					payload: event.candidate,
					from: user?.id || '',
				});
			}
		};

		pc.oniceconnectionstatechange = () => {
			console.log("ICE connection state:", pc.iceConnectionState);

			switch (pc.iceConnectionState) {
				case "connected":
				case "completed":
					setCallState(prev => ({
						...prev,
						connectionState: ConnectionState.CONNECTED,
					}));
					break;
				case "failed":
				case "disconnected":
					setCallState(prev => ({
						...prev,
						connectionState: ConnectionState.ERROR,
						error: "Connection failed. Please try again.",
					}));
					break;
			}
		};

		setPeerConnection(pc);
		return pc;
	};

	const initiateCall = async () => {
		if (!peerConnection || !callState.sessionId) return;

		try {
			const offer = await peerConnection.createOffer();
			await peerConnection.setLocalDescription(offer);

			sendWebSocketMessage({
				type: 'offer',
				payload: offer,
				from: user?.id || '',
			});
		} catch (error) {
			console.error('Error initiating call:', error);
			setCallState(prev => ({
				...prev,
				error: 'Failed to initiate call',
				connectionState: ConnectionState.ERROR,
			}));
		}
	};

	const createSession = async (
		sessionName: string,
		sessionDescription: string
	): Promise<string> => {
		try {
			setCallState({
				...initialCallState,
				connectionState: ConnectionState.CONNECTING,
			});

			const stream = await initializeMediaDevices();
			
			const token = localStorage.getItem("authToken");
			if (!token) {
				throw new Error("User is not authenticated");
			}

			const session = await axiosInstance.post(
				"api/v1/studio/create",
				{
					name: sessionName,
					description: sessionDescription,
				},
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			);

			const sessionData = session.data?.session;
			if (!sessionData) {
				throw new Error("Failed to create session");
			}

			initializePeerConnection(stream);
			connectWebSocket(sessionData.id);

			setCallState({
				sessionId: sessionData.id,
				session: {
					id: sessionData.id,
					name: sessionData.name,
					description: sessionData.description,
				},
				connectionState: ConnectionState.CONNECTED,
				error: null,
				participants: user ? [user] : [],
			});

			return sessionData.id;
		} catch (error) {
			console.error("Error creating session:", error);
			setCallState({
				...initialCallState,
				error: "Failed to create session. Please try again.",
				connectionState: ConnectionState.ERROR,
			});
			throw error;
		}
	};

	const joinSession = async (sessionId: string): Promise<void> => {
		try {
			setCallState({
				...initialCallState,
				sessionId,
				connectionState: ConnectionState.CONNECTING,
			});

			const stream = await initializeMediaDevices();
			const pc = initializePeerConnection(stream);

			const token = localStorage.getItem("authToken");
			if (!token) {
				throw new Error("User is not authenticated");
			}

			const session = await axiosInstance.post(
				"api/v1/studio/join",
				{ session_id: sessionId },
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			);

			const sessionData = session.data?.session;
			if (!sessionData) {
				throw new Error("Failed to join session");
			}

			connectWebSocket(sessionId);

			setCallState({
				sessionId: sessionData.Id,
				session: {
					id: sessionData.Id,
					name: sessionData.Name,
					description: sessionData.Description,
				},
				connectionState: ConnectionState.CONNECTED,
				error: null,
				participants: [user, sessionData.host],
			});
		} catch (error) {
			console.error("Error joining session:", error);
			setCallState({
				...initialCallState,
				error: "Failed to join session. Please try again.",
				connectionState: ConnectionState.ERROR,
			});
			throw error;
		}
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
	};

	const toggleAudio = (): void => {
		if (mediaState.localStream) {
			const audioTrack = mediaState.localStream.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !audioTrack.enabled;
				setMediaState(prev => ({
					...prev,
					audioEnabled: audioTrack.enabled,
				}));
			}
		}
	};

	const toggleVideo = (): void => {
		if (mediaState.localStream) {
			const videoTrack = mediaState.localStream.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = !videoTrack.enabled;
				setMediaState(prev => ({
					...prev,
					videoEnabled: videoTrack.enabled,
				}));
			}
		}
	};

	const toggleScreenShare = async (): Promise<void> => {
		try {
			if (!mediaState.isSharingScreen) {
				const screenStream = await navigator.mediaDevices.getDisplayMedia({
					video: true,
				});

				if (mediaState.localStream && peerConnection) {
					const videoTrack = mediaState.localStream.getVideoTracks()[0];
					const screenTrack = screenStream.getVideoTracks()[0];

					if (videoTrack && screenTrack) {
						mediaState.localStream.removeTrack(videoTrack);
						mediaState.localStream.addTrack(screenTrack);

						const senders = peerConnection.getSenders();
						const sender = senders.find(
							(s) => s.track && s.track.kind === "video"
						);
						if (sender) {
							await sender.replaceTrack(screenTrack);
						}

						screenTrack.onended = () => {
							toggleScreenShare();
						};

						setMediaState(prev => ({
							...prev,
							isSharingScreen: true,
						}));
					}
				}
			} else {
				const cameraStream = await navigator.mediaDevices.getUserMedia({
					video: true,
				});

				if (mediaState.localStream && peerConnection) {
					const screenTrack = mediaState.localStream.getVideoTracks()[0];
					const cameraTrack = cameraStream.getVideoTracks()[0];

					if (screenTrack && cameraTrack) {
						mediaState.localStream.removeTrack(screenTrack);
						mediaState.localStream.addTrack(cameraTrack);

						const senders = peerConnection.getSenders();
						const sender = senders.find(
							(s) => s.track && s.track.kind === "video"
						);
						if (sender) {
							await sender.replaceTrack(cameraTrack);
						}

						screenTrack.stop();

						setMediaState(prev => ({
							...prev,
							isSharingScreen: false,
						}));
					}
				}
			}
		} catch (error) {
			console.error("Error toggling screen share:", error);
		}
	};

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