import React from 'react';
import { X } from 'lucide-react';

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  pestName: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ isOpen, imageUrl, pestName, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 xs:p-3 sm:p-4 pest-disease-modal">
      <div className="relative max-w-full sm:max-w-4xl max-h-full flex flex-col w-full">
        <button
          onClick={onClose}
          className="absolute -top-10 xs:-top-12 right-0 xs:right-2 text-white hover:text-gray-300 active:text-gray-400 transition-colors z-10 w-8 h-8 xs:w-10 xs:h-10 flex items-center justify-center rounded-full hover:bg-white hover:bg-opacity-10 touch-manipulation"
          aria-label="Close"
        >
          <X className="w-6 h-6 xs:w-8 xs:h-8" />
        </button>

        <div className="flex-1 flex items-center justify-center min-h-0 w-full">
        <img
          src={imageUrl}
          alt={pestName}
            className="max-w-full w-auto h-auto object-contain rounded-lg"
            style={{ maxHeight: '85vh', maxWidth: '100%' }}
        />
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 xs:p-3 sm:p-4 rounded-b-lg">
          <h3 className="text-base xs:text-lg sm:text-xl font-semibold text-center break-words">{pestName}</h3>
        </div>
      </div>
    </div>
  );
};
