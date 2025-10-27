/**
 * Notification sound types
 */
export type NotificationSoundType = 
  | 'message'
  | 'join_channel'
  | 'leave_channel'
  | 'mute'
  | 'unmute'
  | 'ringing';

/**
 * Notification sound service for playing audio notifications
 */
class NotificationSoundService {
  private sounds: Map<NotificationSoundType, HTMLAudioElement> = new Map();
  private enabled: boolean = true;

  constructor() {
    this.preloadSounds();
  }

  /**
   * Preload all notification sounds
   */
  private preloadSounds(): void {
    const soundFiles: Record<NotificationSoundType, string> = {
      message: '/sounds/message.mp3',
      join_channel: '/sounds/join_channel.mp3',
      leave_channel: '/sounds/leave_channel.mp3',
      mute: '/sounds/mute.mp3',
      unmute: '/sounds/unmute.mp3',
      ringing: '/sounds/ringing.mp3',
    };

    Object.entries(soundFiles).forEach(([type, path]) => {
      const audio = new Audio(path);
      audio.preload = 'auto';
      this.sounds.set(type as NotificationSoundType, audio);
    });
  }

  /**
   * Play a notification sound
   * @param type The type of notification sound to play
   */
  public play(type: NotificationSoundType): void {
    if (!this.enabled) {
      return;
    }

    const sound = this.sounds.get(type);
    if (!sound) {
      console.warn(`Notification sound not found: ${type}`);
      return;
    }

    // Reset the sound to the beginning if it's already playing
    sound.currentTime = 0;

    // Play the sound and handle any errors
    const playPromise = sound.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.debug(`Failed to play notification sound (${type}):`, error);
      });
    }
  }

  /**
   * Enable notification sounds
   */
  public enable(): void {
    this.enabled = true;
  }

  /**
   * Disable notification sounds
   */
  public disable(): void {
    this.enabled = false;
  }

  /**
   * Check if notification sounds are enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Toggle notification sounds on/off
   */
  public toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// Export a singleton instance
export const notificationSounds = new NotificationSoundService();
