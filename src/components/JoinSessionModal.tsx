/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useCall } from '../context/CallContext';

interface JoinSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const JoinSessionModal: React.FC<JoinSessionModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { joinSession } = useCall();
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sessionId.trim()) {
      setError('Please enter a valid session ID');
      return;
    }
    
    try {
      setIsJoining(true);
      setError(null);
      await joinSession(sessionId);
      onClose();
      navigate(`/room/${sessionId}`);
    } catch (err) {
      setError('Failed to join session. Please check the session ID and try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        {/* Modal panel */}
        <div 
          className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6"
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="modal-headline"
        >
          <div className="absolute top-0 right-0 pt-5 pr-5">
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors duration-150 ease-in-out"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" />
            </button>
          </div>
          
          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-headline">
                Join a Session
              </h3>
              <div className="mt-4">
                <p className="text-sm text-gray-500">
                  Enter the session ID to join an existing video call.
                </p>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-800 rounded-md text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5">
                <div>
                  <label htmlFor="session-id" className="block text-sm font-medium text-gray-700">
                    Session ID
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="session-id"
                      id="session-id"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      placeholder="Enter session ID"
                    />
                  </div>
                </div>

                <div className="mt-5 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={isJoining}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors duration-200 ease-in-out disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isJoining ? 'Joining...' : 'Join'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinSessionModal;