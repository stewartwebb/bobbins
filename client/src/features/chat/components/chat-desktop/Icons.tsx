import React from 'react';

export type IconProps = {
  className?: string;
};

export const IconPlay: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7-11-7z" />
  </svg>
);

export const IconPause: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
  </svg>
);

export const IconVolume: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 9v6h3l4 4V5L8 9H5zm12.5 3a3.5 3.5 0 0 0-2.5-3.323v6.646A3.5 3.5 0 0 0 17.5 12zm-2.5-7.95v2.063A5.5 5.5 0 0 1 19.5 12a5.5 5.5 0 0 1-4.5 5.887v2.063A7.5 7.5 0 0 0 21.5 12 7.5 7.5 0 0 0 15 4.05z" />
  </svg>
);

export const IconVolumeMute: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.5 12a3.5 3.5 0 0 1-2.5 3.323v2.063A5.5 5.5 0 0 0 18.5 12a5.46 5.46 0 0 0-.379-2L16.5 12zm0-5.323V4.614A7.5 7.5 0 0 1 21.5 12a7.47 7.47 0 0 1-1.142 3.934l-1.475-1.475A5.47 5.47 0 0 0 19.5 12a5.5 5.5 0 0 0-3-4.9z" />
    <path d="M5.707 4.293 4.293 5.707 8.586 10H5v4h3l4 4v-5.586l4.293 4.293 1.414-1.414z" />
  </svg>
);

export const IconMic: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
    <path d="M19 12a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12z" />
  </svg>
);

export const IconMicOff: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M15 11.59 17.59 14A5 5 0 0 0 19 12a1 1 0 0 0-2 0 3 3 0 0 1-.35 1.42L15 10.77V6a3 3 0 0 0-5.74-.99l1.58 1.58A1 1 0 0 1 12 6a1 1 0 0 1 1 1v2.59l2 2z" />
    <path d="M5.11 4.7 3.7 6.11l3.2 3.2V12a5 5 0 0 0 4 4.9V21h2v-2.1a7.05 7.05 0 0 0 3.68-1.77l2.2 2.2 1.41-1.42zm6.89 9.59a3 3 0 0 1-3-3v-.8l3.59 3.59a2.95 2.95 0 0 1-.59.21z" />
  </svg>
);

export const IconVideo: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.382l3.553-1.777A1 1 0 0 1 20 6.53v10.94a1 1 0 0 1-1.447.925L15 16.618V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
  </svg>
);

export const IconVideoOff: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 6.828 2.11 5l1.41-1.414 17.38 17.381L19.49 22 17 19.51A2 2 0 0 1 15 20H6a2 2 0 0 1-2-2z" />
    <path d="M22 7.5v9l-4.5-2.25v-1.973L9.723 5H15a2 2 0 0 1 2 2v1.382l3.553-1.777A1 1 0 0 1 22 7.5z" />
  </svg>
);

export const IconPhone: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1.004 1.004 0 0 1 1.02-.24 11.36 11.36 0 0 0 3.56.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 6a1 1 0 0 1 1-1h3.53a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.56 1 1 0 0 1-.24 1.02z" />
  </svg>
);

export const IconScreenShare: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 5a2 2 0 0 0-2 2v9h20V7a2 2 0 0 0-2-2zM2 18h20v2H2z" />
    <path d="M11.47 11.47 10 10v4l1.47-1.47L14 15v-4z" />
  </svg>
);

export const IconFullscreenEnter: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 4h6v2H6v4H4V4zm14 0v6h-2V6h-4V4h6zm0 16h-6v-2h4v-4h2v6zM4 20v-6h2v4h4v2H4z" />
  </svg>
);

export const IconFullscreenExit: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M15 9h5V7h-3V4h-2v5zM9 9V4H7v3H4v2h5zm6 6v5h2v-3h3v-2h-5zM9 15H4v2h3v3h2v-5z" />
  </svg>
);

export const IconArrowDown: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 16.5 5 9.5l1.4-1.4 5.6 5.59 5.6-5.6L19 9.5z" />
  </svg>
);
